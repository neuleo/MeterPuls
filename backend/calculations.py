from datetime import datetime, date, timedelta
import calendar
from typing import List, Dict, Any, Tuple, Optional
from models import Meter, Reading, Contract
from schemas import CategorySummary, TimeSeriesPoint

# Standard VDI 4670 / DIN 4710 Raumheizungs-Gradtage (Pure space heating degree days without hot water)
HEATING_DEGREE_DAYS = {
    1: 170.0,   # Januar
    2: 150.0,   # Februar
    3: 130.0,   # März
    4: 80.0,    # April
    5: 20.0,    # Mai
    6: 0.0,     # Juni (Sommerpause / Heizung AUS)
    7: 0.0,     # Juli (Sommerpause / Heizung AUS)
    8: 0.0,     # August (Sommerpause / Heizung AUS)
    9: 20.0,    # September (Übergang)
    10: 100.0,  # Oktober (Heizperiode startet)
    11: 140.0,  # November
    12: 190.0   # Dezember
}

# Standard BDEW / DIN 4710 monthly weights for households with gas heating AND gas hot water
BDEW_GAS_MONTHLY_WEIGHTS = {
    1: 0.160, 2: 0.135, 3: 0.120, 4: 0.080, 5: 0.040,
    6: 0.015, 7: 0.015, 8: 0.015, 9: 0.035, 10: 0.090,
    11: 0.135, 12: 0.160
}

MONTH_NAMES_DE = {
    1: "Januar", 2: "Februar", 3: "März", 4: "April", 5: "Mai", 6: "Juni",
    7: "Juli", 8: "August", 9: "September", 10: "Oktober", 11: "November", 12: "Dezember"
}

def get_gas_monthly_weights(
    warmwater_source: str = "electricity",
    heating_start_month: int = 10,
    heating_end_month: int = 4
) -> Dict[int, float]:
    """
    Returns monthly gas profile weights based on whether hot water is heated by electricity (0 m³ in summer)
    or gas, taking into account the learned/configured heating months.
    """
    if warmwater_source == "gas":
        return BDEW_GAS_MONTHLY_WEIGHTS.copy()

    # Pure space heating (warm water runs on electricity -> 0 gas consumption in summer!)
    weights: Dict[int, float] = {}
    for m in range(1, 13):
        if heating_start_month > heating_end_month:
            is_heating_m = (m >= heating_start_month or m <= heating_end_month)
        else:
            is_heating_m = (heating_start_month <= m <= heating_end_month)

        weights[m] = HEATING_DEGREE_DAYS.get(m, 0.0) if is_heating_m else 0.0

    total_deg = sum(weights.values())
    if total_deg <= 0:
        return {m: 1.0 / 12.0 for m in range(1, 13)}

    return {m: weights[m] / total_deg for m in range(1, 13)}

def get_gas_day_weight(
    d: date,
    warmwater_source: str = "electricity",
    heating_start_month: int = 10,
    heating_end_month: int = 4
) -> float:
    """Returns the seasonal gas weight for a specific single day."""
    w_map = get_gas_monthly_weights(warmwater_source, heating_start_month, heating_end_month)
    days_in_month = calendar.monthrange(d.year, d.month)[1]
    return w_map[d.month] / float(days_in_month)

def get_gas_period_weight(
    start_d: date,
    end_d: date,
    warmwater_source: str = "electricity",
    heating_start_month: int = 10,
    heating_end_month: int = 4
) -> float:
    """Calculates the sum of daily gas weights for an inclusive date range [start_d, end_d]."""
    if start_d > end_d:
        return 0.0
    total_w = 0.0
    curr = start_d
    while curr <= end_d:
        total_w += get_gas_day_weight(curr, warmwater_source, heating_start_month, heating_end_month)
        curr += timedelta(days=1)
    return total_w

def interpolate_meter_daily(
    meter: Meter,
    contract: Optional[Contract] = None
) -> Dict[date, float]:
    """
    Interpolates daily consumption for a single meter from its readings sequence.
    For gas:
      If warm water runs on electricity, non-heating summer days receive 0.0 m³/day,
      and reading deltas are distributed according to the heating degree curve.
    For electricity & water:
      Linear rate (v_{i+1} - v_i) / delta_days is applied.
    """
    readings = meter.readings
    daily_consumption: Dict[date, float] = {}
    if len(readings) < 2:
        return daily_consumption

    sorted_readings = sorted(readings, key=lambda r: r.reading_date)
    is_gas = meter.category == "gas"

    warmwater_source = getattr(contract, "warmwater_source", "electricity") or "electricity"
    heating_start_m = getattr(contract, "heating_start_month", 10) or 10
    heating_end_m = getattr(contract, "heating_end_month", 4) or 4

    for i in range(len(sorted_readings) - 1):
        r_start = sorted_readings[i]
        r_end = sorted_readings[i + 1]

        d_start = r_start.reading_date.date()
        d_end = r_end.reading_date.date()

        delta_days = (d_end - d_start).days
        delta_val = max(0.0, float(r_end.reading_value - r_start.reading_value))

        if delta_days <= 0:
            continue

        if is_gas:
            # Distribute delta_val using heating weights
            period_w = get_gas_period_weight(
                d_start + timedelta(days=1),
                d_end,
                warmwater_source=warmwater_source,
                heating_start_month=heating_start_m,
                heating_end_month=heating_end_m
            )
            if period_w > 0.0001:
                curr = d_start + timedelta(days=1)
                while curr <= d_end:
                    day_w = get_gas_day_weight(
                        curr,
                        warmwater_source=warmwater_source,
                        heating_start_month=heating_start_m,
                        heating_end_month=heating_end_m
                    )
                    day_val = delta_val * (day_w / period_w)
                    daily_consumption[curr] = daily_consumption.get(curr, 0.0) + day_val
                    curr += timedelta(days=1)
                continue

        # Default linear distribution
        daily_rate = delta_val / float(delta_days)
        curr = d_start + timedelta(days=1)
        while curr <= d_end:
            daily_consumption[curr] = daily_consumption.get(curr, 0.0) + daily_rate
            curr += timedelta(days=1)

    return daily_consumption

def calculate_category_daily(
    meters: List[Meter],
    contract: Optional[Contract] = None
) -> Dict[date, float]:
    """
    Aggregates interpolated daily consumptions across all meters belonging to a category.
    """
    category_daily: Dict[date, float] = {}
    for meter in meters:
        m_daily = interpolate_meter_daily(meter, contract=contract)
        for d, val in m_daily.items():
            category_daily[d] = category_daily.get(d, 0.0) + val
    return category_daily

def calculate_time_series(
    meters_by_cat: Dict[str, List[Meter]],
    start_date: date,
    end_date: date,
    granularity: str = "day",
    timeframe: str = "30d",
    contracts: Optional[Dict[str, Contract]] = None
) -> List[TimeSeriesPoint]:
    """
    Generates time-series consumption points aggregated by day, week, or month.
    Supports complete 12-month views for the year timeframe with seasonal forecasting for future months.
    Respects electric hot water: future summer months for gas are forecasted at 0.0 m³!
    """
    contracts = contracts or {}
    daily_data: Dict[str, Dict[date, float]] = {
        "electricity": calculate_category_daily(meters_by_cat.get("electricity", []), contract=contracts.get("electricity")),
        "gas": calculate_category_daily(meters_by_cat.get("gas", []), contract=contracts.get("gas")),
        "water": calculate_category_daily(meters_by_cat.get("water", []), contract=contracts.get("water"))
    }
    today = date.today()

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    # Special case: Year timeframe with month granularity -> full 12 months (Jan-Dec) with actuals + seasonal projections
    if timeframe == "year" and granularity == "month":
        year = start_date.year
        # Compute YTD consumption to project remaining months
        total_elec_ytd = sum(v for d, v in daily_data["electricity"].items() if d.year == year and d <= today)
        total_gas_ytd = sum(v for d, v in daily_data["gas"].items() if d.year == year and d <= today)
        total_water_ytd = sum(v for d, v in daily_data["water"].items() if d.year == year and d <= today)

        gas_c = contracts.get("gas")
        warmwater_src = getattr(gas_c, "warmwater_source", "electricity") or "electricity"
        start_m = getattr(gas_c, "heating_start_month", 10) or 10
        end_m = getattr(gas_c, "heating_end_month", 4) or 4

        w_elapsed_gas = get_gas_period_weight(
            date(year, 1, 1), today,
            warmwater_source=warmwater_src,
            heating_start_month=start_m,
            heating_end_month=end_m
        )
        projected_year_gas = (total_gas_ytd / w_elapsed_gas) if (w_elapsed_gas > 0.005 and total_gas_ytd > 0) else (650.0 if warmwater_src == "electricity" else 1200.0)

        days_ytd = max(1, (today - date(year, 1, 1)).days + 1)
        daily_avg_elec = total_elec_ytd / float(days_ytd) if total_elec_ytd > 0 else 8.0
        daily_avg_water = total_water_ytd / float(days_ytd) if total_water_ytd > 0 else 0.35

        gas_weights = get_gas_monthly_weights(
            warmwater_source=warmwater_src,
            heating_start_month=start_m,
            heating_end_month=end_m
        )

        points: List[TimeSeriesPoint] = []
        for m in range(1, 13):
            month_key = f"{year}-{m:02d}"
            days_in_m = calendar.monthrange(year, m)[1]

            if m < today.month:
                # Past month: aggregate actual daily data
                m_elec = sum(daily_data["electricity"].get(date(year, m, d), 0.0) for d in range(1, days_in_m + 1))
                m_gas = sum(daily_data["gas"].get(date(year, m, d), 0.0) for d in range(1, days_in_m + 1))
                m_water = sum(daily_data["water"].get(date(year, m, d), 0.0) for d in range(1, days_in_m + 1))
                points.append(TimeSeriesPoint(
                    date=month_key,
                    electricity=round(m_elec, 2),
                    gas=round(m_gas, 2),
                    water=round(m_water, 2),
                    is_projected=False
                ))
            elif m == today.month:
                # Current month: if readings are missing or only partial, blend actuals with forecast
                days_measured_elec = sum(1 for d in range(1, days_in_m + 1) if date(year, m, d) in daily_data["electricity"])
                act_elec = sum(daily_data["electricity"].get(date(year, m, d), 0.0) for d in range(1, days_in_m + 1))
                if days_measured_elec == 0:
                    m_elec = daily_avg_elec * float(days_in_m)
                    is_proj_m = True
                elif days_measured_elec < days_in_m:
                    m_elec = act_elec + (daily_avg_elec * float(days_in_m - days_measured_elec))
                    is_proj_m = True
                else:
                    m_elec = act_elec
                    is_proj_m = False

                days_measured_water = sum(1 for d in range(1, days_in_m + 1) if date(year, m, d) in daily_data["water"])
                act_water = sum(daily_data["water"].get(date(year, m, d), 0.0) for d in range(1, days_in_m + 1))
                if days_measured_water == 0:
                    m_water = daily_avg_water * float(days_in_m)
                elif days_measured_water < days_in_m:
                    m_water = act_water + (daily_avg_water * float(days_in_m - days_measured_water))
                else:
                    m_water = act_water

                days_measured_gas = sum(1 for d in range(1, days_in_m + 1) if date(year, m, d) in daily_data["gas"])
                act_gas = sum(daily_data["gas"].get(date(year, m, d), 0.0) for d in range(1, days_in_m + 1))
                expected_gas_m = projected_year_gas * gas_weights.get(m, 0.0)
                if days_measured_gas == 0:
                    m_gas = expected_gas_m
                elif days_measured_gas < days_in_m:
                    m_gas = act_gas + (expected_gas_m * (float(days_in_m - days_measured_gas) / float(days_in_m)))
                else:
                    m_gas = act_gas

                points.append(TimeSeriesPoint(
                    date=month_key,
                    electricity=round(m_elec, 2),
                    gas=round(m_gas, 2),
                    water=round(m_water, 2),
                    is_projected=is_proj_m
                ))
            else:
                # Future months: Seasonal forecast (0 m³ in summer if warmwater on electricity!)
                proj_gas_m = projected_year_gas * gas_weights.get(m, 0.0)
                proj_elec_m = daily_avg_elec * float(days_in_m)
                proj_water_m = daily_avg_water * float(days_in_m)
                points.append(TimeSeriesPoint(
                    date=month_key,
                    electricity=round(proj_elec_m, 2),
                    gas=round(proj_gas_m, 2),
                    water=round(proj_water_m, 2),
                    is_projected=True
                ))
        return points

    # Build raw day points bounded by today if timeframe is not year
    latest_reading_dates = {
        "electricity": max([r.reading_date.date() for m in meters_by_cat.get("electricity", []) for r in m.readings], default=date.min),
        "gas": max([r.reading_date.date() for m in meters_by_cat.get("gas", []) for r in m.readings], default=date.min),
        "water": max([r.reading_date.date() for m in meters_by_cat.get("water", []) for r in m.readings], default=date.min),
    }

    # Precalculate daily rate fallback if timeframe is daily/weekly
    total_elec_ytd_all = sum(daily_data["electricity"].values())
    total_water_ytd_all = sum(daily_data["water"].values())
    daily_rate_elec_fallback = (total_elec_ytd_all / 250.0) if total_elec_ytd_all > 0 else 19.0
    daily_rate_water_fallback = (total_water_ytd_all / 250.0) if total_water_ytd_all > 0 else 0.35

    gas_c_raw = contracts.get("gas")
    warmwater_src_raw = getattr(gas_c_raw, "warmwater_source", "electricity") or "electricity"
    start_m_raw = getattr(gas_c_raw, "heating_start_month", 10) or 10
    end_m_raw = getattr(gas_c_raw, "heating_end_month", 4) or 4
    gas_weights_raw = get_gas_monthly_weights(warmwater_src_raw, start_m_raw, end_m_raw)

    raw_days: List[Tuple[date, float, float, float, bool]] = []
    curr = start_date
    bounded_end = min(end_date, today) if timeframe != "year" else end_date
    while curr <= bounded_end:
        is_day_proj = False

        if curr in daily_data["electricity"]:
            e_val = daily_data["electricity"][curr]
        elif curr > latest_reading_dates["electricity"]:
            e_val = daily_rate_elec_fallback
            is_day_proj = True
        else:
            e_val = 0.0

        if curr in daily_data["water"]:
            w_val = daily_data["water"][curr]
        elif curr > latest_reading_dates["water"]:
            w_val = daily_rate_water_fallback
            is_day_proj = True
        else:
            w_val = 0.0

        if curr in daily_data["gas"]:
            g_val = daily_data["gas"][curr]
        elif curr > latest_reading_dates["gas"]:
            dim_curr = calendar.monthrange(curr.year, curr.month)[1]
            g_val = (650.0 * gas_weights_raw.get(curr.month, 0.0)) / float(dim_curr)
            is_day_proj = True
        else:
            g_val = 0.0

        raw_days.append((curr, e_val, g_val, w_val, is_day_proj))
        curr += timedelta(days=1)

    if granularity == "day":
        return [
            TimeSeriesPoint(
                date=d.isoformat(),
                electricity=round(elec, 3),
                gas=round(gas, 3),
                water=round(water, 3),
                is_projected=is_proj
            )
            for d, elec, gas, water, is_proj in raw_days
        ]

    elif granularity == "week":
        # Group by ISO year + calendar week: YYYY-Www
        groups: Dict[str, Dict[str, Any]] = {}
        for d, elec, gas, water, is_proj in raw_days:
            year_val, week, _ = d.isocalendar()
            key = f"{year_val}-W{week:02d}"
            if key not in groups:
                groups[key] = {"electricity": 0.0, "gas": 0.0, "water": 0.0, "is_projected": False}
            groups[key]["electricity"] += elec
            groups[key]["gas"] += gas
            groups[key]["water"] += water
            if is_proj:
                groups[key]["is_projected"] = True

        result = []
        for key in sorted(groups.keys()):
            result.append(TimeSeriesPoint(
                date=key,
                electricity=round(groups[key]["electricity"], 3),
                gas=round(groups[key]["gas"], 3),
                water=round(groups[key]["water"], 3),
                is_projected=groups[key]["is_projected"]
            ))
        return result

    else:  # month
        groups = {}
        for d, elec, gas, water, is_proj in raw_days:
            key = d.strftime("%Y-%m")
            if key not in groups:
                groups[key] = {"electricity": 0.0, "gas": 0.0, "water": 0.0, "is_projected": False}
            groups[key]["electricity"] += elec
            groups[key]["gas"] += gas
            groups[key]["water"] += water
            if is_proj:
                groups[key]["is_projected"] = True

        result = []
        for key in sorted(groups.keys()):
            result.append(TimeSeriesPoint(
                date=key,
                electricity=round(groups[key]["electricity"], 3),
                gas=round(groups[key]["gas"], 3),
                water=round(groups[key]["water"], 3),
                is_projected=groups[key]["is_projected"]
            ))
        return result

def detect_gas_heating_season(
    meters: List[Meter],
    contract: Optional[Contract],
    daily_data: Dict[date, float],
    eval_date: date,
    total_consumption: float
) -> Dict[str, Any]:
    """
    Intelligently learns and detects the heating season start and end dates based on gas consumption history.
    Takes into account whether hot water is heated by electricity (0 m³ in summer) or gas.
    """
    warmwater_source = getattr(contract, "warmwater_source", "electricity") or "electricity"
    start_m = getattr(contract, "heating_start_month", 10) or 10
    end_m = getattr(contract, "heating_end_month", 4) or 4

    start_month_name = MONTH_NAMES_DE.get(start_m, "Oktober")
    end_month_name = MONTH_NAMES_DE.get(end_m, "April")

    # Analyze gas readings
    all_readings = []
    for m in meters:
        all_readings.extend(m.readings)
    all_readings.sort(key=lambda r: r.reading_date)

    learned_start_desc = f"Mitte {start_month_name}"
    learned_end_desc = f"Mitte {end_month_name}"

    # Search for observed switch-on / switch-off transitions in readings
    if len(all_readings) >= 2:
        for i in range(len(all_readings) - 1):
            r1 = all_readings[i]
            r2 = all_readings[i + 1]
            d1 = r1.reading_date.date()
            d2 = r2.reading_date.date()
            days_span = (d2 - d1).days
            diff_val = max(0.0, float(r2.reading_value - r1.reading_value))
            if days_span > 0:
                rate = diff_val / float(days_span)
                if rate < 0.05 and d1.month in [3, 4, 5, 6]:
                    learned_end_desc = f"{d1.day}. {MONTH_NAMES_DE.get(d1.month, 'April')} (gelernt)"
                if rate > 0.5 and d1.month in [9, 10, 11]:
                    learned_start_desc = f"{d1.day}. {MONTH_NAMES_DE.get(d1.month, 'Oktober')} (gelernt)"

    # Determine if today / eval_date is in heating season
    m_eval = eval_date.month
    if start_m > end_m:
        is_heating_season = (m_eval >= start_m or m_eval <= end_m)
    else:
        is_heating_season = (start_m <= m_eval <= end_m)

    # Status
    if is_heating_season:
        heating_status = "active"
        heating_status_label = "Heizung aktiv"
    else:
        heating_status = "inactive"
        heating_status_label = "Sommerpause (Heizung AUS)"

    # Transition month (e.g. September or May)
    if m_eval == start_m - 1 or m_eval == end_m + 1:
        heating_status = "transition"
        heating_status_label = "Übergangszeit"

    # Count total heating days in a 12-month year
    total_heating_days = 0
    for m in range(1, 13):
        is_heat_m = (m >= start_m or m <= end_m) if start_m > end_m else (start_m <= m <= end_m)
        if is_heat_m:
            total_heating_days += calendar.monthrange(eval_date.year, m)[1]

    # Count elapsed heating days
    c_start = contract.start_date if contract else date(eval_date.year, 1, 1)
    curr_eval = min(eval_date, contract.end_date if contract else date(eval_date.year, 12, 31))
    elapsed_heating_days = 0
    curr = c_start
    while curr <= curr_eval:
        curr_m = curr.month
        is_h = (curr_m >= start_m or curr_m <= end_m) if start_m > end_m else (start_m <= curr_m <= end_m)
        if is_h:
            elapsed_heating_days += 1
        curr += timedelta(days=1)

    elapsed_heating_days = max(1, elapsed_heating_days)

    if warmwater_source == "electricity":
        heating_share_pct = 100.0
        warmwater_share_pct = 0.0
        heating_baseload_daily = 0.0
        heating_active_daily = round(total_consumption / float(elapsed_heating_days), 2) if total_consumption > 0 else 3.8
        learned_explanation = (
            "Warmwasser läuft über Strom (Durchlauferhitzer / Boiler). Im Sommer beträgt der Gasverbrauch 0 m³. "
            f"Die Raumheizung ist von {end_month_name} bis {start_month_name} komplett pausiert."
        )
    else:
        heating_baseload_daily = 0.35
        elapsed_total_days = max(1, (curr_eval - c_start).days)
        ww_consumption = min(total_consumption, heating_baseload_daily * elapsed_total_days)
        heat_consumption = max(0.0, total_consumption - ww_consumption)
        heating_share_pct = round((heat_consumption / max(0.001, total_consumption)) * 100, 1) if total_consumption > 0 else 80.0
        warmwater_share_pct = round(100.0 - heating_share_pct, 1)
        heating_active_daily = round(heat_consumption / float(elapsed_heating_days), 2) if heat_consumption > 0 else 3.5
        learned_explanation = (
            "Warmwasser läuft über Gas mit einer ganzjährigen Grundlast von ca. 0,35 m³/Tag. "
            "In den Heizmonaten kommt die Raumheizung hinzu."
        )

    return {
        "warmwater_source": warmwater_source,
        "heating_status": heating_status,
        "heating_status_label": heating_status_label,
        "heating_start_learned": learned_start_desc,
        "heating_end_learned": learned_end_desc,
        "heating_baseload_daily": heating_baseload_daily,
        "heating_active_daily": heating_active_daily,
        "heating_share_pct": heating_share_pct,
        "warmwater_share_pct": warmwater_share_pct,
        "is_heating_season": is_heating_season,
        "heating_days_in_year": total_heating_days,
        "learned_explanation": learned_explanation
    }

def calculate_contract_summary(
    category: str,
    meters: List[Meter],
    contract: Optional[Contract],
    eval_date: Optional[date] = None,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
    timeframe: str = "30d"
) -> CategorySummary:
    """
    Computes consumption, costs, payments, balance, and end-of-contract predictions.
    Computes both period-specific metrics (for StatCards) and full-contract metrics.
    Applies adaptive heating profile for gas, and linear projection for electricity/water.
    """
    unit = "kWh" if category == "electricity" else "m³"
    meter_count = len(meters)

    if not eval_date:
        eval_date = date.today()

    if not period_start:
        period_start = eval_date - timedelta(days=30)
    if not period_end:
        period_end = eval_date

    # Default contract parameters if none created yet
    if not contract:
        contract_start = date(eval_date.year, 1, 1)
        contract_end = date(eval_date.year, 12, 31)
        base_fee = 11.90 if category == "electricity" else (14.50 if category == "gas" else 6.50)
        unit_price = 0.325 if category == "electricity" else (0.118 if category == "gas" else 4.20)
        monthly_payment = 85.0 if category == "electricity" else (130.0 if category == "gas" else 30.0)
        bonus_one_time = 0.0
        bonus_notes = None
    else:
        contract_start = contract.start_date
        contract_end = contract.end_date
        base_fee = float(contract.base_fee_monthly)
        unit_price = float(contract.unit_price)
        monthly_payment = float(contract.monthly_payment)
        bonus_one_time = float(getattr(contract, "bonus_one_time", 0.0) or 0.0)
        bonus_notes = getattr(contract, "bonus_notes", None)

    # Precalculate daily consumption
    daily_data = calculate_category_daily(meters, contract=contract)

    # 1. Period metrics (strictly within [period_start, min(period_end, eval_date)])
    effective_period_end = min(period_end, eval_date)
    period_consumption = 0.0
    latest_r_date = max([r.reading_date.date() for m in meters for r in m.readings], default=date.min)

    total_measured_val = sum(daily_data.values())
    measured_days_count = len(daily_data)
    daily_rate_fallback = (total_measured_val / float(measured_days_count)) if measured_days_count > 0 else (19.0 if category == "electricity" else (0.35 if category == "water" else 3.5))

    if period_start <= effective_period_end:
        curr = period_start
        while curr <= effective_period_end:
            if curr in daily_data:
                period_consumption += daily_data[curr]
            elif curr > latest_r_date:
                # Unmeasured days after the latest reading are projected with the daily rate
                if category == "gas":
                    warmwater_src_c = getattr(contract, "warmwater_source", "electricity") or "electricity"
                    start_m_c = getattr(contract, "heating_start_month", 10) or 10
                    end_m_c = getattr(contract, "heating_end_month", 4) or 4
                    gas_w_map = get_gas_monthly_weights(warmwater_src_c, start_m_c, end_m_c)
                    dim_c = calendar.monthrange(curr.year, curr.month)[1]
                    period_consumption += (650.0 * gas_w_map.get(curr.month, 0.0)) / float(dim_c)
                else:
                    period_consumption += daily_rate_fallback
            curr += timedelta(days=1)

    # Period time calculation
    period_days = max(1, (period_end - period_start).days + 1)
    period_months = period_days / 30.4375

    period_base_cost = period_months * base_fee
    period_energy_cost = period_consumption * unit_price
    period_cost = period_base_cost + period_energy_cost
    period_paid = period_months * monthly_payment
    period_balance = period_paid - period_cost

    # 2. Overall contract metrics (contract_start to curr_eval_date)
    total_contract_days = max(1, (contract_end - contract_start).days)
    curr_eval_date = min(max(eval_date, contract_start), contract_end)
    elapsed_days = max(1, (curr_eval_date - contract_start).days)

    months_total = total_contract_days / 30.4375
    months_elapsed = elapsed_days / 30.4375

    total_consumption = 0.0
    curr = contract_start
    while curr <= curr_eval_date:
        total_consumption += daily_data.get(curr, 0.0)
        curr += timedelta(days=1)

    # Fallback if no daily interpolation in interval
    if total_consumption == 0.0:
        for m in meters:
            valid_readings = [r for r in m.readings if contract_start <= r.reading_date.date() <= curr_eval_date]
            if len(valid_readings) >= 2:
                sorted_r = sorted(valid_readings, key=lambda x: x.reading_date)
                total_consumption += max(0.0, float(sorted_r[-1].reading_value - sorted_r[0].reading_value))

    base_fee_cost_so_far = months_elapsed * base_fee
    energy_cost_so_far = total_consumption * unit_price
    cost_so_far = base_fee_cost_so_far + energy_cost_so_far
    paid_so_far = months_elapsed * monthly_payment
    balance_so_far = paid_so_far - cost_so_far

    # 3. Predictions & Gas Heating Intelligence
    seasonal_applied = False
    heating_info: Optional[Dict[str, Any]] = None

    if category == "gas":
        seasonal_applied = True
        heating_info = detect_gas_heating_season(
            meters=meters,
            contract=contract,
            daily_data=daily_data,
            eval_date=curr_eval_date,
            total_consumption=total_consumption
        )
        warmwater_src = heating_info["warmwater_source"]
        start_m = getattr(contract, "heating_start_month", 10) or 10
        end_m = getattr(contract, "heating_end_month", 4) or 4

        w_elapsed = get_gas_period_weight(
            contract_start, curr_eval_date,
            warmwater_source=warmwater_src,
            heating_start_month=start_m,
            heating_end_month=end_m
        )
        w_contract = get_gas_period_weight(
            contract_start, contract_end,
            warmwater_source=warmwater_src,
            heating_start_month=start_m,
            heating_end_month=end_m
        )

        if w_elapsed > 0.005 and total_consumption > 0:
            base_normalized_rate = total_consumption / w_elapsed
            projected_consumption = base_normalized_rate * w_contract
        else:
            projected_consumption = (total_consumption / float(elapsed_days)) * float(total_contract_days) if total_consumption > 0 else (650.0 if warmwater_src == "electricity" else 1200.0)
    else:
        if total_consumption > 0 and elapsed_days > 0:
            daily_avg = total_consumption / float(elapsed_days)
            projected_consumption = daily_avg * float(total_contract_days)
        else:
            projected_consumption = 2500.0 if category == "electricity" else 45.0

    projected_base_fee_total = months_total * base_fee
    projected_energy_cost_total = projected_consumption * unit_price
    projected_total_cost_regular = projected_base_fee_total + projected_energy_cost_total

    # Deduct one-time bonus in 1st contract year if applicable
    effective_first_year_cost = max(0.0, projected_total_cost_regular - bonus_one_time)
    projected_total_cost = effective_first_year_cost if bonus_one_time > 0 else projected_total_cost_regular

    projected_total_paid = months_total * monthly_payment
    projected_balance = projected_total_paid - projected_total_cost

    return CategorySummary(
        category=category,
        unit=unit,
        meter_count=meter_count,
        timeframe=timeframe,
        period_consumption=round(period_consumption, 2),
        period_cost=round(period_cost, 2),
        period_paid=round(period_paid, 2),
        period_balance=round(period_balance, 2),
        total_consumption=round(total_consumption, 2),
        unit_price=round(unit_price, 4),
        base_fee_monthly=round(base_fee, 2),
        monthly_payment=round(monthly_payment, 2),
        cost_so_far=round(cost_so_far, 2),
        paid_so_far=round(paid_so_far, 2),
        balance_so_far=round(balance_so_far, 2),
        projected_consumption=round(projected_consumption, 2),
        projected_total_cost=round(projected_total_cost, 2),
        projected_total_paid=round(projected_total_paid, 2),
        projected_balance=round(projected_balance, 2),
        seasonal_applied=seasonal_applied,
        bonus_one_time=round(bonus_one_time, 2),
        bonus_notes=bonus_notes,
        projected_total_cost_regular=round(projected_total_cost_regular, 2),
        effective_first_year_cost=round(effective_first_year_cost, 2),
        warmwater_source=heating_info.get("warmwater_source") if heating_info else "electricity",
        heating_status=heating_info.get("heating_status") if heating_info else None,
        heating_status_label=heating_info.get("heating_status_label") if heating_info else None,
        heating_start_learned=heating_info.get("heating_start_learned") if heating_info else None,
        heating_end_learned=heating_info.get("heating_end_learned") if heating_info else None,
        heating_baseload_daily=heating_info.get("heating_baseload_daily") if heating_info else 0.0,
        heating_active_daily=heating_info.get("heating_active_daily") if heating_info else None,
        heating_share_pct=heating_info.get("heating_share_pct") if heating_info else 100.0,
        warmwater_share_pct=heating_info.get("warmwater_share_pct") if heating_info else 0.0,
        is_heating_season=heating_info.get("is_heating_season") if heating_info else False,
        heating_days_in_year=heating_info.get("heating_days_in_year") if heating_info else 180,
        learned_explanation=heating_info.get("learned_explanation") if heating_info else None
    )
