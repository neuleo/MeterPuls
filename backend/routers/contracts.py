from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Contract, ContractPrice
from schemas import (
    ContractCreate, ContractUpdate, ContractResponse,
    ContractPlanCreate, ContractPlanPreview, PriceChangeCreate,
    ContractDetail, ContractListResponse, ContractActionResponse,
)
from cost_service import (
    contract_end_exclusive, contract_status, sort_contracts, find_overlap, find_gaps
)

router = APIRouter(prefix="/contracts", tags=["Contracts"])


def _category_contracts(db: Session, category: str) -> List[Contract]:
    return sort_contracts(db.query(Contract).filter(Contract.category == category.lower()).all())


def _create_initial_price(contract: Contract) -> ContractPrice:
    return ContractPrice(
        contract_id=contract.id,
        valid_from=contract.start_date,
        base_fee_monthly=contract.base_fee_monthly,
        unit_price=contract.unit_price,
        monthly_payment=contract.monthly_payment,
        created_at=datetime.utcnow(),
    )


def _to_detail(contract: Contract, today: Optional[date] = None) -> ContractDetail:
    data = {c.name: getattr(contract, c.name) for c in Contract.__table__.columns}
    return ContractDetail(
        **data,
        status=contract_status(contract, today),
        prices=[
            {
                "id": p.id,
                "contract_id": p.contract_id,
                "valid_from": p.valid_from,
                "base_fee_monthly": p.base_fee_monthly,
                "unit_price": p.unit_price,
                "monthly_payment": p.monthly_payment,
            }
            for p in sorted(contract.prices or [], key=lambda x: x.valid_from)
        ],
    )


@router.get("", response_model=List[ContractResponse])
def get_all_contracts(db: Session = Depends(get_db)):
    return sort_contracts(db.query(Contract).all())


@router.get("/preview", response_model=ContractPlanPreview)
def preview_contract_plan(
    category: str,
    start_date: date,
    db: Session = Depends(get_db),
):
    category = category.lower()
    existing = _category_contracts(db, category)
    active = next((c for c in existing if contract_status(c) == "active"), None)
    preview = {
        "category": category,
        "planned_start": start_date,
        "active_contract_id": active.id if active else None,
        "active_until": active.end_date if active else None,
        "message": (
            f"Alter Vertrag bis {active.end_date.strftime('%d.%m.%Y')}, neuer Vertrag ab "
            f"{start_date.strftime('%d.%m.%Y')}."
            if active and active.end_date and active.end_date < start_date
            else f"Neuer Vertrag ab {start_date.strftime('%d.%m.%Y')}."
        ),
        "warnings": [],
    }
    overlap = find_overlap(existing + [Contract(category=category, start_date=start_date, end_date=None)])
    if overlap:
        a, b = overlap
        preview["warnings"].append(
            f"Überschneidung: {a.start_date.strftime('%d.%m.%Y')} – {a.end_date or 'offen'} "
            f"und ab {b.start_date.strftime('%d.%m.%Y')}."
        )
    return ContractPlanPreview(**preview)


@router.get("/{category}/list", response_model=ContractListResponse)
def list_category_contracts(category: str, db: Session = Depends(get_db)):
    today = date.today()
    all_c = _category_contracts(db, category)
    active = next((c for c in all_c if contract_status(c, today) == "active"), None)
    upcoming = [c for c in all_c if contract_status(c, today) == "planned"]
    history = [
        _to_detail(c, today) for c in reversed(all_c)
        if contract_status(c, today) == "ended" and c.id != (active.id if active else None)
    ]
    return ContractListResponse(
        active=_to_detail(active, today) if active else None,
        next_change=_to_detail(upcoming[0], today) if upcoming else None,
        history=history,
        gaps=[{"start_date": g["start"], "end_date": g["end"]} for g in find_gaps(all_c, date(today.year, 1, 1), date(today.year, 12, 31))],
    )


@router.post("/plan", response_model=ContractActionResponse)
def plan_contract(plan: ContractPlanCreate, db: Session = Depends(get_db)):
    today = date.today()
    category = plan.category.lower()
    existing = _category_contracts(db, category)
    start = plan.start_date
    end = plan.end_date

    if end is not None and end < start:
        raise HTTPException(status_code=400, detail="Vertragsende liegt vor Vertragsbeginn")

    if start < today and not plan.confirm_backdate:
        earliest = min([c.start_date for c in existing] + [start])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Rückwirkende Änderung: frühestes betroffenes Datum {earliest.strftime('%d.%m.%Y')}. Bitte ausdrücklich bestätigen.",
        )

    predecessor = next(
        (c for c in existing if contract_end_exclusive(c) is None or contract_end_exclusive(c) >= start),
        None,
    )
    if predecessor and not plan.close_predecessor:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Überschneidung mit bestehendem Vertrag ab {predecessor.start_date.strftime('%d.%m.%Y')} "
                f"(bis {predecessor.end_date.strftime('%d.%m.%Y') if predecessor.end_date else 'offen'}). "
                "Bitte den Übergang bestätigen oder ein anderes Startdatum wählen."
            ),
        )

    new_contract = Contract(
        category=category,
        provider_name=plan.provider_name,
        tariff_name=plan.tariff_name,
        start_date=start,
        end_date=end,
        base_fee_monthly=plan.base_fee_monthly,
        unit_price=plan.unit_price,
        monthly_payment=plan.monthly_payment,
        bonus_one_time=plan.bonus_one_time,
        bonus_notes=plan.bonus_notes,
        warmwater_source=plan.warmwater_source or "electricity",
        heating_start_month=plan.heating_start_month or 10,
        heating_end_month=plan.heating_end_month or 4,
    )
    db.add(new_contract)
    db.flush()
    db.add(_create_initial_price(new_contract))

    if predecessor and plan.close_predecessor:
        predecessor.end_date = start - timedelta(days=1)

    db.commit()
    db.refresh(new_contract)

    predecessor_note = (
        f" Vorgänger bis {predecessor.end_date.strftime('%d.%m.%Y')} begrenzt."
        if predecessor and plan.close_predecessor else ""
    )
    return ContractActionResponse(
        message=f"Vertrag ab {start.strftime('%d.%m.%Y')} gespeichert.{predecessor_note}",
        contract_id=new_contract.id,
    )


@router.post("/price-change", response_model=ContractActionResponse)
def add_price_change(change: PriceChangeCreate, db: Session = Depends(get_db)):
    contract = db.query(Contract).filter(Contract.id == change.contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")

    end = contract_end_exclusive(contract)
    if change.valid_from < contract.start_date or (end is not None and change.valid_from >= end):
        raise HTTPException(
            status_code=400,
            detail="Gültig-ab muss innerhalb der Vertragslaufzeit liegen",
        )
    if change.valid_from < date.today() and not change.confirm_backdate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Rückwirkende Preisänderung zum {change.valid_from.strftime('%d.%m.%Y')}. "
                "Bitte ausdrücklich bestätigen; frühestes betroffenes Datum wird neu bepreist."
            ),
        )
    existing = [p for p in contract.prices if p.valid_from == change.valid_from]
    if existing:
        raise HTTPException(status_code=409, detail="Für dieses Datum existiert bereits ein Preisabschnitt")

    current = max(contract.prices, key=lambda p: p.valid_from) if contract.prices else None
    price = ContractPrice(
        contract_id=contract.id,
        valid_from=change.valid_from,
        base_fee_monthly=change.base_fee_monthly if change.base_fee_monthly is not None else (current.base_fee_monthly if current else contract.base_fee_monthly),
        unit_price=change.unit_price if change.unit_price is not None else (current.unit_price if current else contract.unit_price),
        monthly_payment=change.monthly_payment if change.monthly_payment is not None else (current.monthly_payment if current else contract.monthly_payment),
    )
    db.add(price)
    db.commit()
    return ContractActionResponse(
        message=f"Preisänderung zum {change.valid_from.strftime('%d.%m.%Y')} gespeichert. Anbieter, Beginn und Bonus bleiben erhalten.",
        contract_id=contract.id,
    )


@router.delete("/{contract_id}", response_model=ContractActionResponse)
def cancel_planned_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")
    if contract_status(contract) != "planned":
        raise HTTPException(status_code=409, detail="Nur geplante Verträge können zurückgenommen werden")
    db.delete(contract)
    db.commit()
    return ContractActionResponse(message="Geplante Änderung zurückgenommen")


@router.delete("/price/{price_id}", response_model=ContractActionResponse)
def cancel_planned_price(price_id: int, db: Session = Depends(get_db)):
    price = db.query(ContractPrice).filter(ContractPrice.id == price_id).first()
    if not price:
        raise HTTPException(status_code=404, detail="Preisabschnitt nicht gefunden")
    if price.valid_from <= date.today():
        raise HTTPException(status_code=409, detail="Nur zukünftige Preisänderungen können zurückgenommen werden")
    db.delete(price)
    db.commit()
    return ContractActionResponse(message="Geplante Preisänderung zurückgenommen")


@router.get("/{category}", response_model=ContractResponse)
def get_contract(category: str, db: Session = Depends(get_db)):
    category = category.lower()
    contract = next(
        (c for c in _category_contracts(db, category) if contract_status(c) == "active"),
        None,
    )
    if not contract:
        raise HTTPException(status_code=404, detail=f"Kein aktiver Vertrag für Sparte '{category}' gefunden")
    return contract


@router.post("", response_model=ContractResponse)
def upsert_contract(contract_in: ContractCreate, db: Session = Depends(get_db)):
    """Legacy endpoint: create the first contract or update the active one in place."""
    category = contract_in.category.lower()
    existing = _category_contracts(db, category)
    active = next((c for c in existing if contract_status(c) == "active"), None)

    if active:
        active.provider_name = contract_in.provider_name
        active.tariff_name = contract_in.tariff_name
        active.base_fee_monthly = contract_in.base_fee_monthly
        active.unit_price = contract_in.unit_price
        active.monthly_payment = contract_in.monthly_payment
        active.bonus_one_time = contract_in.bonus_one_time
        active.bonus_notes = contract_in.bonus_notes
        if contract_in.warmwater_source is not None:
            active.warmwater_source = contract_in.warmwater_source
        if contract_in.heating_start_month is not None:
            active.heating_start_month = contract_in.heating_start_month
        if contract_in.heating_end_month is not None:
            active.heating_end_month = contract_in.heating_end_month
        price = max(active.prices, key=lambda p: p.valid_from) if active.prices else None
        if price:
            price.base_fee_monthly = contract_in.base_fee_monthly
            price.unit_price = contract_in.unit_price
            price.monthly_payment = contract_in.monthly_payment
        else:
            db.add(_create_initial_price(active))
        db.commit()
        db.refresh(active)
        return active

    contract = Contract(
        category=category,
        provider_name=contract_in.provider_name,
        tariff_name=contract_in.tariff_name,
        start_date=contract_in.start_date,
        end_date=contract_in.end_date,
        base_fee_monthly=contract_in.base_fee_monthly,
        unit_price=contract_in.unit_price,
        monthly_payment=contract_in.monthly_payment,
        bonus_one_time=contract_in.bonus_one_time,
        bonus_notes=contract_in.bonus_notes,
        warmwater_source=contract_in.warmwater_source or "electricity",
        heating_start_month=contract_in.heating_start_month or 10,
        heating_end_month=contract_in.heating_end_month or 4,
    )
    db.add(contract)
    db.flush()
    db.add(_create_initial_price(contract))
    db.commit()
    db.refresh(contract)
    return contract


@router.put("/{category}", response_model=ContractResponse)
def update_contract(category: str, contract_in: ContractUpdate, db: Session = Depends(get_db)):
    category = category.lower()
    contract = next(
        (c for c in _category_contracts(db, category) if contract_status(c) == "active"),
        None,
    )
    if not contract:
        raise HTTPException(status_code=404, detail=f"Kein aktiver Vertrag für Sparte '{category}' gefunden")

    for field in [
        "provider_name", "tariff_name", "start_date", "end_date", "bonus_one_time",
        "bonus_notes", "warmwater_source", "heating_start_month", "heating_end_month"
    ]:
        value = getattr(contract_in, field)
        if value is not None:
            setattr(contract, field, value)

    price = max(contract.prices, key=lambda p: p.valid_from) if contract.prices else None
    if not price:
        price = _create_initial_price(contract)
        db.add(price)
    for field in ["base_fee_monthly", "unit_price", "monthly_payment"]:
        value = getattr(contract_in, field)
        if value is not None:
            setattr(contract, field, value)
            setattr(price, field, value)

    db.commit()
    db.refresh(contract)
    return contract
