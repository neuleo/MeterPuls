from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Contract
from schemas import ContractCreate, ContractUpdate, ContractResponse

router = APIRouter(prefix="/contracts", tags=["Contracts"])

@router.get("", response_model=List[ContractResponse])
def get_all_contracts(db: Session = Depends(get_db)):
    contracts = db.query(Contract).order_by(Contract.category.asc()).all()
    return contracts

@router.get("/{category}", response_model=ContractResponse)
def get_contract(category: str, db: Session = Depends(get_db)):
    category = category.lower()
    contract = db.query(Contract).filter(Contract.category == category).first()
    if not contract:
        raise HTTPException(status_code=404, detail=f"Kein Vertrag für Sparte '{category}' gefunden")
    return contract

@router.post("", response_model=ContractResponse)
def upsert_contract(contract_in: ContractCreate, db: Session = Depends(get_db)):
    category = contract_in.category.lower()
    contract = db.query(Contract).filter(Contract.category == category).first()

    if contract:
        contract.provider_name = contract_in.provider_name
        contract.tariff_name = contract_in.tariff_name
        contract.start_date = contract_in.start_date
        contract.end_date = contract_in.end_date
        contract.base_fee_monthly = contract_in.base_fee_monthly
        contract.unit_price = contract_in.unit_price
        contract.monthly_payment = contract_in.monthly_payment
        contract.bonus_one_time = contract_in.bonus_one_time
        contract.bonus_notes = contract_in.bonus_notes
        if contract_in.warmwater_source is not None:
            contract.warmwater_source = contract_in.warmwater_source
        if contract_in.heating_start_month is not None:
            contract.heating_start_month = contract_in.heating_start_month
        if contract_in.heating_end_month is not None:
            contract.heating_end_month = contract_in.heating_end_month
    else:
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
            heating_end_month=contract_in.heating_end_month or 4
        )
        db.add(contract)

    db.commit()
    db.refresh(contract)
    return contract

@router.put("/{category}", response_model=ContractResponse)
def update_contract(category: str, contract_in: ContractUpdate, db: Session = Depends(get_db)):
    category = category.lower()
    contract = db.query(Contract).filter(Contract.category == category).first()
    if not contract:
        raise HTTPException(status_code=404, detail=f"Kein Vertrag für Sparte '{category}' gefunden")

    if contract_in.provider_name is not None:
        contract.provider_name = contract_in.provider_name
    if contract_in.tariff_name is not None:
        contract.tariff_name = contract_in.tariff_name
    if contract_in.start_date is not None:
        contract.start_date = contract_in.start_date
    if contract_in.end_date is not None:
        contract.end_date = contract_in.end_date
    if contract_in.base_fee_monthly is not None:
        contract.base_fee_monthly = contract_in.base_fee_monthly
    if contract_in.unit_price is not None:
        contract.unit_price = contract_in.unit_price
    if contract_in.monthly_payment is not None:
        contract.monthly_payment = contract_in.monthly_payment
    if contract_in.bonus_one_time is not None:
        contract.bonus_one_time = contract_in.bonus_one_time
    if contract_in.bonus_notes is not None:
        contract.bonus_notes = contract_in.bonus_notes
    if contract_in.warmwater_source is not None:
        contract.warmwater_source = contract_in.warmwater_source
    if contract_in.heating_start_month is not None:
        contract.heating_start_month = contract_in.heating_start_month
    if contract_in.heating_end_month is not None:
        contract.heating_end_month = contract_in.heating_end_month

    db.commit()
    db.refresh(contract)
    return contract
