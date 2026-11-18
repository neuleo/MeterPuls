import os
import sys
import tempfile
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="meterpulse_tests_")

from fastapi.testclient import TestClient
from database import SessionLocal, engine, Base, run_migrations
from models import Meter, Reading, Contract, ContractPrice
import main

client = TestClient(main.app)


def cleanup():
    db = SessionLocal()
    db.query(Reading).delete()
    db.query(Meter).delete()
    db.query(ContractPrice).delete()
    db.query(Contract).delete()
    db.commit()
    db.close()


def make_contract(category, start, end, unit_price, base=0.0, payment=0.0, bonus=0.0):
    db = SessionLocal()
    c = Contract(
        category=category, start_date=start, end_date=end,
        base_fee_monthly=base, unit_price=unit_price,
        monthly_payment=payment, bonus_one_time=bonus,
    )
    db.add(c)
    db.flush()
    db.add(ContractPrice(
        contract_id=c.id, valid_from=start,
        base_fee_monthly=base, unit_price=unit_price, monthly_payment=payment,
    ))
    db.commit()
    cid = c.id
    db.close()
    return cid


def make_meter_with_readings(values):
    db = SessionLocal()
    m = Meter(name="Test", category="electricity", unit="kWh")
    db.add(m)
    db.flush()
    for value, when in values:
        db.add(Reading(meter_id=m.id, reading_value=value,
                       reading_date=when, created_at=when))
    db.commit()
    mid = m.id
    db.close()
    return mid


def breakdown(start, end, category="electricity"):
    r = client.get("/api/analytics/breakdown", params={
        "category": category,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_price_change_between_readings():
    cleanup()
    make_contract("electricity", date(2026, 1, 1), date(2026, 3, 31), 0.30)
    make_contract("electricity", date(2026, 4, 1), date(2026, 12, 31), 0.40)
    make_meter_with_readings([
        (0.0, date(2026, 3, 30)),
        (30.0, date(2026, 4, 2)),
    ])

    bd = breakdown(date(2026, 3, 31), date(2026, 4, 1))
    by_date = {d["date"]: d for d in bd["days"]}
    march = by_date["2026-03-31"]
    april = by_date["2026-04-01"]
    assert abs(march["consumption"] - 10.0) < 0.001, march
    assert abs(april["consumption"] - 10.0) < 0.001, april
    assert abs(march["unit_price"] - 0.30) < 0.0001, march
    assert abs(april["unit_price"] - 0.40) < 0.0001, april
    total = march["energy_cost"] + april["energy_cost"]
    assert abs(total - 7.00) < 0.001, total
    print("PASS: Preiswechsel 31.03/01.04 => 7,00 EUR Energie")


def test_planned_successor_does_not_change_actual_costs():
    cleanup()
    old_id = make_contract("electricity", date(2026, 1, 1), date(2026, 12, 31), 0.30)
    make_meter_with_readings([
        (0.0, date(2026, 3, 1)),
        (100.0, date(2026, 3, 31)),
    ])

    today = date.today()
    future_start = today + timedelta(days=10)
    future_end = today + timedelta(days=300)
    future_price = 0.45

    measured_range = (date(2026, 3, 1), date(2026, 3, 31))
    before = breakdown(*measured_range)
    before_energy = sum(d["energy_cost"] for d in before["days"])

    r = client.post("/api/contracts/plan", json={
        "category": "electricity",
        "start_date": future_start.isoformat(),
        "end_date": future_end.isoformat(),
        "unit_price": future_price,
        "base_fee_monthly": 12.0,
        "monthly_payment": 80.0,
        "close_predecessor": True,
    })
    assert r.status_code == 200, r.text
    new_id = r.json()["contract_id"]

    listing = client.get("/api/contracts/electricity/list").json()
    assert listing["active"]["id"] == old_id
    assert listing["next_change"]["id"] == new_id
    assert listing["active"]["end_date"] == (future_start - timedelta(days=1)).isoformat()

    after = breakdown(*measured_range)
    actual_energy = sum(d["energy_cost"] for d in after["days"])
    assert abs(actual_energy - before_energy) < 0.001, (actual_energy, before_energy)
    future_bd = breakdown(today, future_end)
    assert any(d["is_projected"] and abs(d["unit_price"] - future_price) < 0.0001 for d in future_bd["days"])

    r = client.delete(f"/api/contracts/{new_id}")
    assert r.status_code == 200, r.text
    restored = breakdown(today, future_end)
    assert not any(d["is_projected"] and abs(d["unit_price"] - future_price) < 0.0001 for d in restored["days"])
    print("PASS: Folgevertrag in der Zukunft ändert heutige Kosten nicht")


def test_conflicts_gaps_and_bonus():
    cleanup()
    make_contract("electricity", date(2026, 1, 1), date(2026, 12, 31), 0.30, bonus=100.0)
    r = client.post("/api/contracts/plan", json={
        "category": "electricity",
        "start_date": "2026-06-01",
        "unit_price": 0.40,
        "confirm_backdate": True,
    })
    assert r.status_code == 409, r.text
    assert "Überschneidung" in r.json()["detail"]

    r = client.post("/api/contracts/plan", json={
        "category": "electricity",
        "start_date": "2026-06-01",
        "unit_price": 0.40,
        "confirm_backdate": True,
        "close_predecessor": True,
    })
    assert r.status_code == 200, r.text
    new_id = r.json()["contract_id"]

    r = client.post("/api/contracts/price-change", json={
        "contract_id": new_id,
        "valid_from": "2026-07-01",
        "unit_price": 0.50,
        "confirm_backdate": True,
    })
    assert r.status_code == 200, r.text

    bd = breakdown(date(2026, 1, 1), date(2026, 12, 31))
    assert abs(bd["totals"]["all"]["bonus"] - 100.0) < 0.001, bd["totals"]["all"]
    assert any(d["date"] == "2026-05-31" and abs(d["unit_price"] - 0.30) < 0.0001 for d in bd["days"])
    assert any(d["date"] == "2026-06-30" and abs(d["unit_price"] - 0.40) < 0.0001 for d in bd["days"])
    assert any(d["date"] == "2026-07-01" and abs(d["unit_price"] - 0.50) < 0.0001 for d in bd["days"])
    print("PASS: Konflikt, Übergang, Preisabschnitt und einmaliger Bonus")


def test_gap_keeps_consumption_visible():
    cleanup()
    make_contract("electricity", date(2026, 1, 1), date(2026, 3, 31), 0.30)
    make_contract("electricity", date(2026, 5, 1), date(2026, 12, 31), 0.40)
    make_meter_with_readings([
        (0.0, date(2026, 3, 30)),
        (62.0, date(2026, 5, 2)),
    ])
    bd = breakdown(date(2026, 4, 1), date(2026, 4, 30))
    assert bd["has_gap"], bd["gaps"]
    gap_days = [d for d in bd["days"] if d["is_gap"]]
    assert gap_days and all(d["total_cost"] == 0 for d in gap_days)
    assert sum(d["consumption"] for d in gap_days) > 0
    print("PASS: Tariflücke zeigt Verbrauch ohne 0-EUR-Bepreisung")


def test_reading_idempotency():
    cleanup()
    make_meter_with_readings([])
    db = SessionLocal()
    mid = db.query(Meter).first().id
    db.close()
    payload = {
        "meter_id": mid,
        "reading_value": 123.45,
        "reading_date": "2026-05-01T10:00:00",
        "client_ref": "retry-token-1",
    }
    first = client.post("/api/readings", json=payload)
    assert first.status_code == 201, first.text
    second = client.post("/api/readings", json=payload)
    assert second.status_code == 201, second.text
    assert first.json()["id"] == second.json()["id"]
    db = SessionLocal()
    assert db.query(Reading).filter(Reading.client_ref == "retry-token-1").count() == 1
    db.close()
    print("PASS: Wiederholter Upload erzeugt keine Duplikate")


def test_unit_mismatch_does_not_invent_euros():
    cleanup()
    make_contract("gas", date(2026, 1, 1), date(2026, 12, 31), 0.10)
    db = SessionLocal()
    m = Meter(name="Gas kWh", category="gas", unit="kWh")
    db.add(m)
    db.flush()
    for value, when in [(0.0, date(2026, 3, 1)), (10.0, date(2026, 3, 11))]:
        db.add(Reading(meter_id=m.id, reading_value=value, reading_date=when, created_at=when))
    db.commit()
    db.close()

    r = client.get("/api/analytics/breakdown", params={
        "category": "gas", "start_date": "2026-03-02", "end_date": "2026-03-10"
    })
    assert r.status_code == 200, r.text
    bd = r.json()
    assert bd["unit_mismatch"] is True
    assert bd["meter_unit"] == "kWh" and bd["price_unit"] == "m³"
    assert sum(d["consumption"] for d in bd["days"]) > 0
    assert all(d["energy_cost"] == 0 and d["total_cost"] == 0 for d in bd["days"])
    print("PASS: Uneinheitliche Einheiten zeigen Verbrauch ohne Eurobetrag")


def test_open_ended_contract_is_safe():
    cleanup()
    make_contract("gas", date(2026, 1, 1), None, 0.118, base=14.5, payment=130.0)
    listing = client.get("/api/contracts/gas/list")
    assert listing.status_code == 200, listing.text
    assert listing.json()["active"]["end_date"] is None
    dashboard = client.get("/api/analytics/dashboard", params={"timeframe": "30d", "granularity": "day"})
    assert dashboard.status_code == 200, dashboard.text
    bd = breakdown(date(2026, 3, 1), date(2026, 3, 31), "gas")
    assert all(d["has_tariff"] for d in bd["days"])
    print("PASS: Offener Folgevertrag bricht Liste und Dashboard nicht")


def test_repair_orphan_price_foreign_key():
    import sqlite3
    from database import DATABASE_URL

    path = DATABASE_URL.replace("sqlite:///", "")
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute("ALTER TABLE contracts RENAME TO contracts_old")
    conn.execute("DROP TABLE IF EXISTS contracts")
    conn.execute(
        "CREATE TABLE contracts (id INTEGER PRIMARY KEY, category VARCHAR(20) NOT NULL, "
        "provider_name VARCHAR(100), tariff_name VARCHAR(100), start_date DATE NOT NULL, "
        "end_date DATE, base_fee_monthly FLOAT NOT NULL DEFAULT 0.0, "
        "unit_price FLOAT NOT NULL DEFAULT 0.0, monthly_payment FLOAT NOT NULL DEFAULT 0.0, "
        "bonus_one_time FLOAT NOT NULL DEFAULT 0.0, bonus_notes VARCHAR(200), "
        "warmwater_source VARCHAR(50) DEFAULT 'electricity', heating_start_month INTEGER DEFAULT 10, "
        "heating_end_month INTEGER DEFAULT 4, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)"
    )
    rows = conn.execute(
        "SELECT id, category, provider_name, tariff_name, start_date, end_date, base_fee_monthly, "
        "unit_price, monthly_payment, bonus_one_time, bonus_notes, warmwater_source, "
        "heating_start_month, heating_end_month, created_at, updated_at FROM contracts_old"
    ).fetchall()
    conn.executemany("INSERT INTO contracts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    conn.execute("DROP TABLE contracts_old")
    conn.commit()
    conn.close()

    from database import run_migrations
    run_migrations()

    conn = sqlite3.connect(path)
    fks = conn.execute("PRAGMA foreign_key_list(contract_prices)").fetchall()
    assert all(fk[2] == "contracts" for fk in fks), fks
    conn.close()

    cleanup()
    cid = make_contract("electricity", date(2026, 1, 1), date(2026, 12, 31), 0.30)
    db = SessionLocal()
    assert db.query(ContractPrice).filter(ContractPrice.contract_id == cid).count() == 1
    db.close()
    print("PASS: Verwaiste Preis-FK repariert, Einfügen funktioniert wieder")


def test_forecast_keeps_seasonal_energy_and_bonus_separate():
    cleanup()
    make_contract(
        "gas", date(2026, 1, 1), date(2026, 12, 31), 0.1157,
        base=10.64, payment=84.0, bonus=177.0,
    )
    make_meter_with_readings([
        (0.0, date(2026, 1, 1)),
        (500.0, date(2026, 11, 15)),
    ])
    # Reuse the gas meter but with the correct category/unit for the breakdown.
    db = SessionLocal()
    gas_meter = db.query(Meter).first()
    gas_meter.category = "gas"
    gas_meter.unit = "m³"
    db.commit()
    db.close()

    bd = breakdown(date(2026, 1, 1), date(2026, 12, 31), "gas")
    forecast = bd["totals"]["forecast"]
    assert forecast["consumption"] > 0, forecast
    assert forecast["energy_cost"] > 0, forecast
    assert any(d["is_forecast_consumption"] and d["consumption"] > 0 for d in bd["days"])

    all_totals = bd["totals"]["all"]
    assert abs(all_totals["balance_with_bonus"] - (
        all_totals["payment"] - all_totals["cost"] + all_totals["bonus"]
    )) < 0.01, all_totals

    dashboard = client.get("/api/analytics/dashboard", params={"timeframe": "year", "granularity": "month"})
    assert dashboard.status_code == 200, dashboard.text
    summary = dashboard.json()["summaries"]["gas"]
    assert summary["projected_total_cost"] >= summary["cost_so_far"] - 0.01, summary
    assert abs(summary["projected_balance"] - (
        summary["projected_total_paid"] - summary["projected_total_cost"] + summary["bonus_one_time"]
    )) < 0.05, summary
    print("PASS: Prognose mit Saisonalität und Bonus getrennt von Bruttokosten")


def test_dashboard_uses_all_contracts_like_breakdown():
    cleanup()
    make_contract("gas", date(2026, 1, 1), date(2026, 6, 30), 0.20, base=10.0, payment=50.0)
    make_contract("gas", date(2026, 7, 1), date(2026, 12, 31), 0.30, base=12.0, payment=60.0)
    make_meter_with_readings([
        (0.0, date(2026, 1, 1)),
        (100.0, date(2026, 12, 31)),
    ])
    db = SessionLocal()
    m = db.query(Meter).first()
    m.category = "gas"
    m.unit = "m³"
    db.commit()
    db.close()

    bd = breakdown(date(2026, 1, 1), date(2026, 12, 31), "gas")
    dash = client.get("/api/analytics/dashboard", params={"timeframe": "year", "granularity": "month"})
    assert dash.status_code == 200, dash.text
    s = dash.json()["summaries"]["gas"]
    assert abs(s["projected_total_cost"] - bd["totals"]["all"]["cost"]) < 0.05, (s, bd["totals"]["all"])
    assert abs(s["projected_total_paid"] - bd["totals"]["all"]["payment"]) < 0.05, (s, bd["totals"]["all"])
    print("PASS: Dashboard und Breakdown nutzen denselben Vertragsverlauf")


def test_migration_is_idempotent():
    run_migrations()
    db = SessionLocal()
    contracts = db.query(Contract).count()
    prices = db.query(ContractPrice).count()
    db.close()
    run_migrations()
    db = SessionLocal()
    assert db.query(Contract).count() == contracts
    assert db.query(ContractPrice).count() == prices
    db.close()
    print("PASS: Migration zweimal gestartet ohne neue Verträge/Preisabschnitte")


if __name__ == "__main__":
    test_price_change_between_readings()
    test_planned_successor_does_not_change_actual_costs()
    test_conflicts_gaps_and_bonus()
    test_gap_keeps_consumption_visible()
    test_reading_idempotency()
    test_unit_mismatch_does_not_invent_euros()
    test_open_ended_contract_is_safe()
    test_repair_orphan_price_foreign_key()
    test_forecast_keeps_seasonal_energy_and_bonus_separate()
    test_dashboard_uses_all_contracts_like_breakdown()
    test_migration_is_idempotent()
    print("Alle Backend-Tests bestanden.")
