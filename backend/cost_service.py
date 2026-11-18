from datetime import date, timedelta
import calendar
from typing import Dict, List, Optional, Tuple, Any

from models import Meter, Contract, ContractPrice
from calculations import calculate_category_daily


def contract_end_exclusive(contract: Optional[Contract]) -> Optional[date]:
    """End boundary used by all calculations (start inclusive, end exclusive)."""
    if contract is None or contract.end_date is None:
        return None
    return contract.end_date + timedelta(days=1)


def contract_status(contract: Contract, today: Optional[date] = None) -> str:
    today = today or date.today()
    end = contract_end_exclusive(contract)
    if contract.start_date > today:
        return "planned"
    if end is not None and end <= today:
        return "ended"
    return "active"


def price_for_day(contract: Contract, day: date) -> Optional[ContractPrice]:
    candidates = [p for p in (contract.prices or []) if p.valid_from <= day]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.valid_from)


def sort_contracts(contracts: List[Contract]) -> List[Contract]:
    return sorted(contracts, key=lambda c: (c.start_date, c.id or 0))


def find_overlap(contracts: List[Contract]) -> Optional[Tuple[Contract, Contract]]:
    ordered = sort_contracts(contracts)
    for prev, nxt in zip(ordered, ordered[1:]):
        prev_end = contract_end_exclusive(prev)
        if prev_end is None or prev_end > nxt.start_date:
            return prev, nxt
    return None


def find_gaps(contracts: List[Contract], start: date, end: date) -> List[Dict[str, date]]:
    ordered = sort_contracts(contracts)
    gaps: List[Dict[str, date]] = []
    cursor = start
    for c in ordered:
        if c.start_date > cursor:
            gaps.append({"start": cursor, "end": min(c.start_date - timedelta(days=1), end)})
        cursor = max(cursor, contract_end_exclusive(c) or end + timedelta(days=1))
        if cursor > end:
            break
    if cursor <= end:
        gaps.append({"start": cursor, "end": end})
    return [g for g in gaps if g["start"] <= g["end"]]


def _days_in_month(d: date) -> int:
    return calendar.monthrange(d.year, d.month)[1]


def compute_cost_breakdown(
    category: str,
    meters: List[Meter],
    contracts: List[Contract],
    start_date: date,
    end_date: date,
    eval_date: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Single source of truth for price allocation and cost splitting.

    - start day inclusive, end day inclusive at the API boundary
    - each service day uses the price section valid on that day
    - base fee and payments are prorated by the actual number of calendar days
    - bonus is a contract-level one-off and never counted twice
    - tariff gaps keep consumption visible but produce no costs
    """
    eval_date = eval_date or date.today()
    ordered = sort_contracts(contracts)
    profile_contract = next(
        (c for c in reversed(ordered) if c.start_date <= eval_date),
        ordered[0] if ordered else None,
    )
    daily_consumption = calculate_category_daily(meters, contract=profile_contract)

    reading_dates = {r.reading_date.date() for m in meters for r in m.readings}

    days: List[Dict[str, Any]] = []
    curr = start_date
    while curr <= end_date:
        consumption = daily_consumption.get(curr, 0.0)
        contract = next(
            (c for c in ordered if c.start_date <= curr and
             (contract_end_exclusive(c) is None or contract_end_exclusive(c) > curr)),
            None,
        )
        price = price_for_day(contract, curr) if contract else None
        is_future = curr > eval_date
        dim = _days_in_month(curr)

        unit_price = float(price.unit_price) if price else 0.0
        base_fee = float(contract.base_fee_monthly) if contract and price else 0.0
        payment = float(contract.monthly_payment) if contract and price else 0.0

        energy_cost = consumption * unit_price if price else 0.0
        base_cost = base_fee / dim if price else 0.0
        payment_day = payment / dim if price else 0.0

        days.append({
            "date": curr,
            "consumption": round(consumption, 6),
            "energy_cost": round(energy_cost, 6),
            "base_cost": round(base_cost, 6),
            "payment": round(payment_day, 6),
            "total_cost": round(energy_cost + base_cost, 6),
            "contract_id": contract.id if contract else None,
            "price_id": price.id if price else None,
            "unit_price": unit_price,
            "has_tariff": price is not None,
            "is_gap": price is None and consumption > 0,
            "is_estimated": curr not in reading_dates and curr in daily_consumption,
            "is_projected": is_future,
        })
        curr += timedelta(days=1)

    actual_days = [d for d in days if not d["is_projected"]]
    forecast_days = [d for d in days if d["is_projected"]]

    def totals(subset: List[Dict[str, Any]]) -> Dict[str, float]:
        return {
            "consumption": round(sum(d["consumption"] for d in subset), 4),
            "energy_cost": round(sum(d["energy_cost"] for d in subset), 4),
            "base_cost": round(sum(d["base_cost"] for d in subset), 4),
            "cost": round(sum(d["total_cost"] for d in subset), 4),
            "payment": round(sum(d["payment"] for d in subset), 4),
            "balance": round(sum(d["payment"] - d["total_cost"] for d in subset), 4),
        }

    bonus = round(sum(float(c.bonus_one_time or 0.0) for c in ordered if c.start_date <= eval_date), 2)
    actual = totals(actual_days)
    forecast = totals(forecast_days)
    all_totals = totals(days)
    all_totals["bonus"] = bonus
    all_totals["cost_with_bonus"] = round(max(0.0, all_totals["cost"] - bonus), 2)

    periods: List[Dict[str, Any]] = []
    for c in ordered:
        end = contract_end_exclusive(c)
        p_start = max(c.start_date, start_date)
        p_end = min(end - timedelta(days=1) if end else end_date, end_date)
        if p_start <= p_end:
            periods.append({
                "contract_id": c.id,
                "start_date": p_start,
                "end_date": p_end,
                "status": contract_status(c, eval_date),
                "provider_name": c.provider_name,
                "tariff_name": c.tariff_name,
                "unit_price": float(c.unit_price),
                "base_fee_monthly": float(c.base_fee_monthly),
            })
    gaps = find_gaps(ordered, start_date, end_date)

    return {
        "category": category,
        "start_date": start_date,
        "end_date": end_date,
        "eval_date": eval_date,
        "days": days,
        "periods": periods,
        "gaps": gaps,
        "totals": {
            "actual": actual,
            "forecast": forecast,
            "all": all_totals,
        },
        "has_gap": bool(gaps),
    }
