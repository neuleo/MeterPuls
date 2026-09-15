import io
import csv
import calendar
from datetime import date, datetime
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session

from models import Meter, Reading, Contract
from calculations import (
    calculate_contract_summary,
    calculate_time_series,
    MONTH_NAMES_DE
)

def format_de_num(val: Optional[float], decimals: int = 2) -> str:
    if val is None:
        return "-"
    formatted = f"{val:.{decimals}f}"
    return formatted.replace(".", ",")

def generate_export_data(db: Session) -> Dict[str, str]:
    today = date.today()
    year = today.year

    all_meters = db.query(Meter).order_by(Meter.category.asc(), Meter.name.asc()).all()
    contracts_list = db.query(Contract).all()
    contracts: Dict[str, Contract] = {c.category: c for c in contracts_list}

    meters_by_cat = {
        "electricity": [m for m in all_meters if m.category == "electricity"],
        "gas": [m for m in all_meters if m.category == "gas"],
        "water": [m for m in all_meters if m.category == "water"]
    }

    # 1. Summaries for 2026
    summaries = {
        cat: calculate_contract_summary(
            category=cat,
            meters=meters_by_cat[cat],
            contract=contracts.get(cat),
            eval_date=today,
            period_start=date(year, 1, 1),
            period_end=date(year, 12, 31),
            timeframe="year"
        )
        for cat in ["electricity", "gas", "water"]
    }

    # 2. Monthly time-series for 2026
    monthly_series = calculate_time_series(
        meters_by_cat=meters_by_cat,
        start_date=date(year, 1, 1),
        end_date=date(year, 12, 31),
        granularity="month",
        timeframe="year",
        contracts=contracts
    )

    # 3. Build CSV: Zählerstände (Readings)
    csv_readings_io = io.StringIO()
    # Write UTF-8 BOM
    csv_readings_io.write("\ufeff")
    writer_r = csv.writer(csv_readings_io, delimiter=";", lineterminator="\n")
    writer_r.writerow([
        "Datum",
        "Sparte",
        "Zaehler_Name",
        "Zaehler_Nummer",
        "Zaehlerstand",
        "Einheit",
        "Intervall_Verbrauch",
        "Intervall_Tage",
        "Verbrauch_pro_Tag",
        "Kosten_pro_Tag_EUR",
        "Notizen"
    ])

    readings_table_prompt_lines = []

    for m in all_meters:
        contract = contracts.get(m.category)
        unit_price = contract.unit_price if contract else 0.0
        sorted_readings = sorted(m.readings, key=lambda r: r.reading_date)

        prompt_meter_lines = [f"### {m.category.capitalize()}: {m.name} (Zählernr: {m.meter_number or 'k.A.'}, Einheit: {m.unit})"]

        for i, r in enumerate(sorted_readings):
            r_date_str = r.reading_date.strftime("%Y-%m-%d")
            prev = sorted_readings[i - 1] if i > 0 else None

            if prev:
                delta_val = r.reading_value - prev.reading_value
                delta_days = (r.reading_date.date() - prev.reading_date.date()).days
                rate_day = (delta_val / delta_days) if delta_days > 0 else 0.0
                cost_day = rate_day * unit_price
                val_str = f"{r.reading_value:.3f}"
                d_val_str = f"{delta_val:.3f}"
                d_days_str = str(delta_days)
                rate_day_str = f"{rate_day:.3f}"
                cost_day_str = f"{cost_day:.2f}"

                prompt_meter_lines.append(
                    f"- {r_date_str}: **{format_de_num(r.reading_value, 3)} {m.unit}** (+{format_de_num(delta_val, 3)} {m.unit} in {delta_days} Tagen → Ø {format_de_num(rate_day, 2)} {m.unit}/Tag, ca. {format_de_num(cost_day, 2)} €/Tag)"
                )
            else:
                d_val_str = ""
                d_days_str = ""
                rate_day_str = ""
                cost_day_str = ""
                prompt_meter_lines.append(
                    f"- {r_date_str}: **{format_de_num(r.reading_value, 3)} {m.unit}** (Startwert)"
                )

            writer_r.writerow([
                r_date_str,
                m.category,
                m.name,
                m.meter_number or "",
                f"{r.reading_value:.3f}".replace(".", ","),
                m.unit,
                d_val_str.replace(".", ","),
                d_days_str,
                rate_day_str.replace(".", ","),
                cost_day_str.replace(".", ","),
                r.notes or ""
            ])

        readings_table_prompt_lines.append("\n".join(prompt_meter_lines))

    csv_readings = csv_readings_io.getvalue()

    # 4. Build CSV: Monatliche Verbräuche
    csv_monthly_io = io.StringIO()
    csv_monthly_io.write("\ufeff")
    writer_m = csv.writer(csv_monthly_io, delimiter=";", lineterminator="\n")
    writer_m.writerow([
        "Monat",
        "Strom_kWh",
        "Strom_Kosten_EUR",
        "Gas_m3",
        "Gas_Kosten_EUR",
        "Wasser_m3",
        "Wasser_Kosten_EUR",
        "Gesamtkosten_EUR",
        "Status"
    ])

    elec_contract = contracts.get("electricity")
    gas_contract = contracts.get("gas")
    water_contract = contracts.get("water")

    elec_up = elec_contract.unit_price if elec_contract else 0.2595
    elec_bf = (elec_contract.base_fee_monthly if elec_contract else 11.90)
    gas_up = gas_contract.unit_price if gas_contract else 0.1078
    gas_bf = (gas_contract.base_fee_monthly if gas_contract else 5.99)
    water_up = water_contract.unit_price if water_contract else 6.59
    water_bf = (water_contract.base_fee_monthly if water_contract else 0.0)

    monthly_prompt_rows = []

    for pt in monthly_series:
        e_kwh = pt.electricity or 0.0
        g_m3 = pt.gas or 0.0
        w_m3 = pt.water or 0.0

        e_cost = (e_kwh * elec_up) + elec_bf
        g_cost = (g_m3 * gas_up) + gas_bf
        w_cost = (w_m3 * water_up) + water_bf
        total_cost = e_cost + g_cost + w_cost

        status_str = "Prognose" if pt.is_projected else "Gemessen"

        writer_m.writerow([
            pt.date,
            f"{e_kwh:.2f}".replace(".", ","),
            f"{e_cost:.2f}".replace(".", ","),
            f"{g_m3:.2f}".replace(".", ","),
            f"{g_cost:.2f}".replace(".", ","),
            f"{w_m3:.2f}".replace(".", ","),
            f"{w_cost:.2f}".replace(".", ","),
            f"{total_cost:.2f}".replace(".", ","),
            status_str
        ])

        monthly_prompt_rows.append(
            f"| {pt.date} | {format_de_num(e_kwh, 1)} kWh | {format_de_num(g_m3, 1)} m³ | {format_de_num(w_m3, 1)} m³ | {format_de_num(total_cost, 2)} € | {status_str} |"
        )

    csv_monthly = csv_monthly_io.getvalue()

    # 5. Build Comprehensive AI Prompt
    gas_summary = summaries.get("gas")
    elec_summary = summaries.get("electricity")
    water_summary = summaries.get("water")

    gas_heating_info = ""
    if gas_summary:
        gas_heating_info = f"- **Erkannte Heizperiode**: {gas_summary.heating_start_learned or 'Mitte Oktober'} bis {gas_summary.heating_end_learned or 'Mitte April'} (Status: {gas_summary.heating_status_label or 'Heizung aus'})\n"

    ai_prompt_lines = [
        "# 📊 Haushalts-Energie- & Verbrauchsdaten für KI-Analyse",
        "",
        "Hallo KI! Bitte analysiere als Energie- und Haushaltsexperte unsere Verbrauchs- und Tarifdaten aus unserem Zähler-Dashboard **MeterPulse**.",
        "Wir möchten eine detaillierte Einschätzung unseres Verbrauchsverhaltens, der Kosten, der Angemessenheit unserer monatlichen Abschläge sowie konkrete Optimierungspotenziale.",
        "",
        "---",
        "",
        "## 1. Wichtige Haushaltsparameter & Besonderheiten (WICHTIG!)",
        "- **Warmwasserbereitung**: Läuft komplett dezentral über **STROM** (elektrischer Durchlauferhitzer / Boiler) und **NICHT** über Gas!",
        "- **Gasverbrauch im Sommer**: In den Sommermonaten (ca. Mai bis September) beträgt der Gasverbrauch praktisch **0 m³** (nur minimale Zünd-/Wartungsflamme), da Gas rein für die Raumheizung genutzt wird.",
        gas_heating_info.strip(),
        f"- **Auswertungszeitpunkt**: {today.strftime('%d.%m.%Y')} (Kalenderjahr {year})",
        "",
        "---",
        "",
        "## 2. Vertragsdaten & monatliche Abschläge",
        "",
        f"### ⚡ Strom",
        f"- **Anbieter**: {elec_contract.provider_name if elec_contract and elec_contract.provider_name else 'Nicht hinterlegt'}",
        f"- **Tarif**: {elec_contract.tariff_name if elec_contract and elec_contract.tariff_name else 'Standard'}",
        f"- **Arbeitspreis**: {format_de_num(elec_up, 4)} € / kWh ({format_de_num(elec_up * 100, 2)} ct/kWh)",
        f"- **Grundpreis**: {format_de_num(elec_bf, 2)} € / Monat ({format_de_num(elec_bf * 12, 2)} € / Jahr)",
        f"- **Monatlicher Abschlag**: {format_de_num(elec_contract.monthly_payment if elec_contract else 0.0, 2)} € / Monat",
        f"- **Bonus / Vergünstigungen**: {format_de_num(elec_contract.bonus_one_time if elec_contract else 0.0, 2)} € ({elec_contract.bonus_notes if elec_contract and elec_contract.bonus_notes else 'Keine'})",
        "",
        f"### 🔥 Gas",
        f"- **Anbieter**: {gas_contract.provider_name if gas_contract and gas_contract.provider_name else 'Nicht hinterlegt'}",
        f"- **Tarif**: {gas_contract.tariff_name if gas_contract and gas_contract.tariff_name else 'Standard'}",
        f"- **Arbeitspreis**: {format_de_num(gas_up, 4)} € / m³ bzw. kWh ({format_de_num(gas_up * 100, 2)} ct/Einheit)",
        f"- **Grundpreis**: {format_de_num(gas_bf, 2)} € / Monat ({format_de_num(gas_bf * 12, 2)} € / Jahr)",
        f"- **Monatlicher Abschlag**: {format_de_num(gas_contract.monthly_payment if gas_contract else 0.0, 2)} € / Monat",
        f"- **Bonus / Vergünstigungen**: {format_de_num(gas_contract.bonus_one_time if gas_contract else 0.0, 2)} € ({gas_contract.bonus_notes if gas_contract and gas_contract.bonus_notes else 'Keine'})",
        "- **Besonderheit**: Reine Raumheizung! Warmwasser läuft über Strom.",
        "",
        f"### 💧 Wasser",
        f"- **Anbieter**: {water_contract.provider_name if water_contract and water_contract.provider_name else 'Stadtwerke / Kommunal'}",
        f"- **Arbeitspreis (Frischwasser + Abwasser)**: {format_de_num(water_up, 4)} € / m³",
        f"- **Grundpreis**: {format_de_num(water_bf, 2)} € / Monat",
        f"- **Monatlicher Abschlag**: {format_de_num(water_contract.monthly_payment if water_contract else 0.0, 2)} € / Monat (oft über Nebenkostenabrechnung)",
        "",
        "---",
        "",
        f"## 3. Verbrauchsbilanz & Prognose für das Kalenderjahr {year}",
        "",
        "| Sparte | Bisher gemessen (YTD) | Bisherige Kosten (YTD) | Bisher gezahlte Abschläge | Aktueller Zwischensaldo | Jahresprognose Verbrauch | Erwartete Jahreskosten | Gezahlte Jahresabschläge | Erwartetes Jahressaldo |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
    ]

    for cat, name_icon, unit in [
        ("electricity", "⚡ Strom", "kWh"),
        ("gas", "🔥 Gas", "m³"),
        ("water", "💧 Wasser", "m³")
    ]:
        s = summaries.get(cat)
        if s:
            bal_ytd_str = f"+{format_de_num(s.balance_so_far, 2)} € (Guthaben)" if s.balance_so_far >= 0 else f"{format_de_num(s.balance_so_far, 2)} € (Nachzahlung)"
            bal_proj_str = f"+{format_de_num(s.projected_balance, 2)} € (Guthaben)" if s.projected_balance >= 0 else f"{format_de_num(s.projected_balance, 2)} € (Nachzahlung)"
            ai_prompt_lines.append(
                f"| {name_icon} | {format_de_num(s.total_consumption, 1)} {unit} | {format_de_num(s.cost_so_far, 2)} € | {format_de_num(s.paid_so_far, 2)} € | {bal_ytd_str} | {format_de_num(s.projected_consumption, 1)} {unit} | {format_de_num(s.projected_total_cost, 2)} € | {format_de_num(s.projected_total_paid, 2)} € | {bal_proj_str} |"
            )

    ai_prompt_lines.extend([
        "",
        "*(Hinweis zur Saldodefinition: Positiv (+) = Guthaben / Rückzahlung vom Anbieter; Negativ (-) = Nachzahlung an den Anbieter).* ",
        "",
        "---",
        "",
        "## 4. Zähler & Zählerstand-Historie mit Intervallauswertung",
        "",
        "\n\n".join(readings_table_prompt_lines),
        "",
        "---",
        "",
        f"## 5. Monatliche Verbrauchsübersicht {year} (Gemessen + Saisonal prognostiziert)",
        "",
        "| Monat | Strom (kWh) | Gas (m³) | Wasser (m³) | Gesamtkosten (€) | Status |",
        "| :--- | :---: | :---: | :---: | :---: | :---: |",
        "\n".join(monthly_prompt_rows),
        "",
        "---",
        "",
        "## 6. Deine Aufgaben als Energieberater-KI:",
        "Bitte erstelle eine fundierte, leicht verständliche und strukturierte Analyse mit folgenden Kernpunkten:",
        "",
        "1. **Haushalts-Benchmarking & Personenanzahl**:",
        "   - Für wie viele Personen / welche Haushaltsgröße ist dieser Strom-, Gas- und Wasserverbrauch typisch?",
        "   - Wie bewertest du das Verbrauchslevel im Vergleich zum deutschen Durchschnitt (z. B. Stromspiegel / BDEW)?",
        "",
        "2. **Warmwasser-Analyse über Strom**:",
        "   - Da unser Warmwasser dezentral über Strom erhitzt wird: Welcher Anteil unseres Stromverbrauchs (ca. " + (f"{format_de_num(elec_summary.projected_consumption, 0)} kWh/Jahr" if elec_summary else "6.500 kWh/Jahr") + ") entfällt realistisch auf die Warmwasserbereitung und welcher auf reguläre Elektrogeräte/IT/Kochen?",
        "   - Liegt der Gesamtstromverbrauch inklusive Warmwasser im plausiblen Normalbereich oder gibt es Verdachtsmomente für verdeckte Stromfresser oder Fehlfunktionen?",
        "",
        "3. **Abschlagsprüfung & Finanzielles Risiko**:",
        "   - Passen die aktuell gezahlten monatlichen Abschläge (" + (f"{format_de_num(elec_contract.monthly_payment, 2)} € Strom, {format_de_num(gas_contract.monthly_payment, 2)} € Gas" if elec_contract and gas_contract else "") + ") zu den tatsächlichen Kosten?",
        "   - Droht bei der Jahresabrechnung eine böse Überraschung (Nachzahlung) oder besteht ein zu hoher Abschlagspuffer (Guthaben / zinsloses Darlehen an den Versorger)?",
        "   - Welche konkreten Abschlagsbeträge empfiehlst du für die nächsten 12 Monate?",
        "",
        "4. **Tarif- & Preisbewertung**:",
        "   - Wie bewertest du unsere aktuellen Konditionen (Arbeitspreis & Grundpreis) im Vergleich zu aktuellen Marktangeboten (Neuverträge)?",
        "   - Lohnt sich ein Anbieterwechsel oder eine Tarifanpassung?",
        "",
        "5. **Gaseffizienz & Heizverhalten**:",
        "   - Im Sommer verbrauchen wir 0 m³ Gas, da kein Warmwasser darüber läuft. Wie bewertest du den reinen Raumheizungsbedarf im Winter?",
        "   - Welche Potenziale gibt es für die kommende Heizperiode (z. B. Vorlauftemperatur, Nachtabsenkung, Thermostatregelung)?",
        "",
        "6. **Konkrete Top-5 Handlungsempfehlungen**:",
        "   - Bitte nenne die 5 wirksamsten und am schnellsten umsetzbaren Schritte, um unsere Energiekosten ohne Komfortverlust nachhaltig zu senken."
    ])

    ai_prompt = "\n".join(ai_prompt_lines)

    summary_text = (
        f"Haushaltsdaten {year}: Strom YTD {format_de_num(elec_summary.total_consumption if elec_summary else 0, 1)} kWh (Prognose: {format_de_num(elec_summary.projected_consumption if elec_summary else 0, 1)} kWh), "
        f"Gas YTD {format_de_num(gas_summary.total_consumption if gas_summary else 0, 1)} m³ (Prognose: {format_de_num(gas_summary.projected_consumption if gas_summary else 0, 1)} m³), "
        f"Wasser YTD {format_de_num(water_summary.total_consumption if water_summary else 0, 1)} m³. "
        f"Erwartetes Jahressaldo: Strom {format_de_num(elec_summary.projected_balance if elec_summary else 0, 2)} €, "
        f"Gas {format_de_num(gas_summary.projected_balance if gas_summary else 0, 2)} €."
    )

    return {
        "ai_prompt": ai_prompt,
        "csv_readings": csv_readings,
        "csv_monthly": csv_monthly,
        "summary_text": summary_text
    }
