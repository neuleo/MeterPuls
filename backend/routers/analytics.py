from typing import Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Meter, Contract
from schemas import DashboardAnalyticsResponse, ExportDataResponse
from calculations import calculate_time_series, calculate_contract_summary
from export_service import generate_export_data

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/export", response_model=ExportDataResponse)
def get_export_data(db: Session = Depends(get_db)):
    """
    Returns pre-formatted AI prompt markdown and CSV datasets (readings and monthly summaries)
    ready for 1-click copy to clipboard or direct CSV download.
    """
    data = generate_export_data(db)
    return ExportDataResponse(
        ai_prompt=data["ai_prompt"],
        csv_readings=data["csv_readings"],
        csv_monthly=data["csv_monthly"],
        summary_text=data["summary_text"]
    )

@router.get("/dashboard", response_model=DashboardAnalyticsResponse)
def get_dashboard_analytics(
    timeframe: str = Query("30d", pattern="^(30d|90d|year|custom)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    db: Session = Depends(get_db)
):
    today = date.today()

    # Determine date range
    if timeframe == "30d":
        calc_start = today - timedelta(days=30)
        calc_end = today
    elif timeframe == "90d":
        calc_start = today - timedelta(days=90)
        calc_end = today
    elif timeframe == "year":
        calc_start = date(today.year, 1, 1)
        calc_end = date(today.year, 12, 31)
    else:  # custom
        calc_start = start_date or (today - timedelta(days=30))
        calc_end = end_date or today

    # Fetch all meters grouped by category
    all_meters = db.query(Meter).all()
    meters_by_cat = {
        "electricity": [m for m in all_meters if m.category == "electricity"],
        "gas": [m for m in all_meters if m.category == "gas"],
        "water": [m for m in all_meters if m.category == "water"]
    }

    # Fetch contracts
    contracts = {c.category: c for c in db.query(Contract).all()}

    # Compute summaries for each category based on selected timeframe
    summaries = {
        cat: calculate_contract_summary(
            category=cat,
            meters=meters_by_cat[cat],
            contract=contracts.get(cat),
            eval_date=today,
            period_start=calc_start,
            period_end=calc_end,
            timeframe=timeframe
        )
        for cat in ["electricity", "gas", "water"]
    }

    # Compute time series with linear interpolation and forecasting
    history = calculate_time_series(
        meters_by_cat=meters_by_cat,
        start_date=calc_start,
        end_date=calc_end,
        granularity=granularity,
        timeframe=timeframe,
        contracts=contracts
    )

    return DashboardAnalyticsResponse(
        summaries=summaries,
        history=history,
        granularity=granularity,
        timeframe=timeframe
    )
