import os
import json
import base64
import re
import io
import httpx
from typing import List, Dict, Any, Optional
from PIL import Image, ExifTags
from schemas import AIModelItem, AIScanResult, AIContractScanResult

def extract_image_capture_date(image_bytes: bytes) -> Optional[str]:
    """
    Extracts the original recording/capture timestamp from EXIF metadata if present.
    Returns an ISO datetime string like 'YYYY-MM-DDTHH:MM:SS'.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            exif_data = img.getexif()
            if not exif_data:
                return None

            date_str = None
            # 1. Primary IFD tags
            for tag_id, val in exif_data.items():
                tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                if tag_name in ("DateTimeOriginal", "DateTimeDigitized", "DateTime") and val:
                    date_str = str(val)
                    break

            # 2. Exif Sub-IFD
            if not date_str:
                try:
                    exif_ifd = exif_data.get_ifd(ExifTags.IFD.Exif)
                    for tag_id, val in exif_ifd.items():
                        tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                        if tag_name in ("DateTimeOriginal", "DateTimeDigitized", "DateTime") and val:
                            date_str = str(val)
                            break
                except Exception:
                    pass

            if date_str:
                # Standard EXIF format: 'YYYY:MM:DD HH:MM:SS'
                parts = date_str.strip().split()
                if len(parts) >= 2:
                    d_part = parts[0].replace(":", "-")
                    t_part = parts[1][:8]
                    if len(d_part) == 10 and len(t_part) >= 5:
                        return f"{d_part}T{t_part}"
    except Exception:
        pass
    return None

VISION_KEYWORDS = [
    "vision", "gpt-4o", "gpt-4-turbo", "claude-3", "gemini",
    "vl", "llava", "omni", "pixtral", "llama-3.2-11b", "llama-3.2-90b",
    "qwen2-vl", "qwen-vl", "internvl", "minicpm"
]

def is_vision_model(model_id: str, model_name: str = "") -> bool:
    target = f"{model_id} {model_name}".lower()
    return any(kw in target for kw in VISION_KEYWORDS)

def normalize_base_url(url: str) -> str:
    cleaned = url.strip().rstrip("/")
    # If user provided e.g. https://api.openai.com or https://openrouter.ai/api
    return cleaned

async def fetch_available_models(base_url: str, api_key: str) -> List[AIModelItem]:
    """
    Fetches available models from an OpenAI-compatible /v1/models endpoint.
    """
    norm_url = normalize_base_url(base_url)
    endpoint = f"{norm_url}/models" if norm_url.endswith("/v1") else f"{norm_url}/v1/models"

    headers = {
        "User-Agent": "MeterPulse/1.0"
    }
    if api_key and api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(endpoint, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            # Try direct endpoint without /v1 if first failed
            alt_endpoint = f"{norm_url}/models"
            try:
                resp2 = await client.get(alt_endpoint, headers=headers)
                resp2.raise_for_status()
                data = resp2.json()
            except Exception:
                raise RuntimeError(f"HTTP Fehler beim Abrufen der Modelle ({e.response.status_code}): {e.response.text[:200]}")
        except Exception as e:
            raise RuntimeError(f"Verbindungsfehler zu {endpoint}: {str(e)}")

    models_data = data.get("data", [])
    if not isinstance(models_data, list):
        models_data = []

    model_items: List[AIModelItem] = []
    for item in models_data:
        m_id = item.get("id", "")
        if not m_id:
            continue
        m_name = item.get("name", m_id)
        has_vision = is_vision_model(m_id, m_name)
        ctx_len = item.get("context_length")
        model_items.append(AIModelItem(
            id=m_id,
            name=m_name,
            is_vision=has_vision,
            context_length=ctx_len
        ))

    # Sort vision models first, then alphabetically
    model_items.sort(key=lambda x: (not x.is_vision, x.id.lower()))
    return model_items

SYSTEM_METER_PROMPT = (
    "Du bist ein hochpräziser Experten-Algorithmus zur optischen Zählerstandserkennung (Vision AI & OCR) für analoge und "
    "digitale Hausversorgungszähler (Strom, Gas, Wasser).\n"
    "Deine Aufgabe ist es, aus dem Foto eines Zählers alle relevanten Messdaten fehlerfrei, objektiv und extrem präzise zu extrahieren.\n\n"
    "═══════════════════════════════════════════════════════════════════\n"
    "REGELN FÜR DIE ZÄHLERARTEN:\n"
    "═══════════════════════════════════════════════════════════════════\n"
    "1. STROMZÄHLER (category: 'electricity', unit: 'kWh'):\n"
    "   - Analoger Ferraris-Drehscheibenzähler oder elektronische moderne Messeinrichtung (mME).\n"
    "   - Ganze kWh (Vorkommastellen): Schwarze Ziffernwalzen links.\n"
    "   - Nachkommastellen: Rote Ziffernwalze ganz rechts ODER rot umrandete Ziffer (meist 1 Nachkommastelle, z.B. ,1 bis ,9).\n"
    "   - WICHTIG: Wenn KEINE rote Ziffer und kein roter Rahmen vorhanden ist, sind ALLE Ziffern ganze Zahlen (keine Nachkommastellen!).\n"
    "   - Bei Walzenübergang (Ziffer steht zwischen zwei Zahlen): Beurteile anhand der niederwertigeren rechten Rolle, ob der Übergang schon vollzogen ist.\n"
    "   - ZÄHLERNUMMER: Suche intensiv nach der Gerätenummer / Seriennummer (oft neben einem Barcode oder beschriftet mit 'Nr.', 'Eigentum der Stadtwerke...', 'No.', z.B. 1214369 oder 1IS4...).\n\n"
    "2. GASZÄHLER (category: 'gas', unit: 'm³'):\n"
    "   - Balgengaszähler mit Rollenzählwerk (z.B. Elster, Pipersberg, Kromschröder, Itron, Landis+Gyr).\n"
    "   - Ganze m³ (Vorkommastellen): Meist 5 schwarze Ziffern links.\n"
    "   - Nachkommastellen: Typischerweise genau 3 Ziffern in roter Umrandung oder rote Ziffern rechts (Liter / Tausendstel m³).\n"
    "   - Zählerstand IMMER mit 3 Nachkommastellen als Float angeben (z.B. 01234,567 -> 1234.567).\n"
    "   - ZÄHLERNUMMER: Eingeprägt oder aufgedruckt auf dem Blechgehäuse/Typenschild (z.B. 'BK-G4', Fabrik-Nr. / No.).\n\n"
    "3. WASSERZÄHLER (category: 'water', unit: 'm³'):\n"
    "   - Flügelrad- oder Ringkolbenzähler (z.B. Sensus, Zenner, Allmess, Wehrle).\n"
    "   - Ganze m³ (Vorkommastellen): Schwarze Ziffernwalzen im zentralen Zählwerk (z.B. 00457 -> 457).\n"
    "   - Nachkommastellen (Liter): Werden entweder durch rote Ziffernwalzen ODER kleine rote Rundzeiger ('Uhren') dargestellt:\n"
    "     * Zeiger x0,1 = Zehntel m³ (100 Liter)\n"
    "     * Zeiger x0,01 = Hundertstel m³ (10 Liter)\n"
    "     * Zeiger x0,001 = Tausendstel m³ (1 Liter)\n"
    "     * Zeiger x0,0001 = Zehntausendstel m³ (0,1 Liter)\n"
    "     Beispiel: Schwarze Walzen 00457 und rote Nachkommastellen/Zeiger 7, 3, 3 = 457.733 m³.\n"
    "   - ZÄHLERNUMMER / SERIENNUMMER UNBEDINGT ABLESEN:\n"
    "     * Auf dem Messingrand / Gehäuserand eingeprägt (z.B. 6- bis 10-stellige Zahl wie '37013880').\n"
    "     * ODER auf dem Kunststoffdeckel, Plombenring oder direkt auf dem Zifferblatt (über/unter den Walzen).\n"
    "     * Oft auch Baujahr-Zahlenfolge (z.B. '18-045812' oder 'D12-345678').\n"
    "     * Wenn eine Serien-/Gerätenummer sichtbar ist, trage sie UNBEDINGT in 'meter_number' ein!\n"
    "   - TYPUNTERSCHEIDUNG (Warm- vs. Kaltwasser):\n"
    "     * Kaltwasserzähler haben meist einen BLAUEN Ring / Gehäuse / Deckel oder Aufschrift '30°C' / '50°C'.\n"
    "     * Warmwasserzähler haben meist einen ROTEN Ring / Gehäuse / Deckel oder Aufschrift '90°C' / 'TH'.\n"
    "     * Erwähne in 'notes' explizit: 'Kaltwasserzähler' bzw. 'Warmwasserzähler' sowie die erkannte Zählernummer!\n\n"
    "═══════════════════════════════════════════════════════════════════\n"
    "AUSGABEFORMAT (STRIKT VALIDES JSON):\n"
    "═══════════════════════════════════════════════════════════════════\n"
    "Du musst deine Antwort AUSSCHLIESSLICH als valides JSON-Objekt ohne umschließenden Markdown-Codeblock und ohne Begleittext ausgeben:\n"
    "{\n"
    '  "category": "electricity" | "gas" | "water",\n'
    '  "value": 12345.678,\n'
    '  "unit": "kWh" | "m³",\n'
    '  "meter_number": "12345678" | null,\n'
    '  "confidence": 0.98,\n'
    '  "notes": "Präzise Beschreibung der abgelesenen Ziffern und Zählernummer (z.B. Kaltwasserzähler Nr. 37013880 mit 457.733 m³)"\n'
    "}"
)

USER_METER_PROMPT = (
    "Analysiere dieses Zählerfoto und lies den Zählerstand, Zählertyp und die Zählernummer mit maximaler Genauigkeit ab.\n\n"
    "WICHTIGE VORGABEN:\n"
    "1. Kategorie bestimmen: 'electricity' (Strom in kWh), 'gas' (Gas in m³) oder 'water' (Wasser in m³).\n"
    "2. Zählerstand exakt ablesen: Schwarze Ziffern = Vorkommastellen. Rote Ziffern/Zeiger = Nachkommastellen.\n"
    "3. Der Wert 'value' MUSS eine Zahl (Float/Dezimalzahl mit Punkt, z.B. 40844.8 oder 457.733) sein. Keine Kommas, keine Einheiten im Wert.\n"
    "4. ZÄHLERNUMMER / SERIENNUMMER: Suche intensiv nach der Zählernummer (z.B. auf dem Typenschild, Gehäuserand, Zifferblatt, Plombenring) und trage sie in 'meter_number' ein (z.B. '37013880'). Dies ist entscheidend zur automatischen Zuordnung bei mehreren Zählern (z.B. Kaltwasser vs. Warmwasser)!\n"
    "5. Bei Wasserzählern: Prüfe, ob es sich um Kaltwasser (blauer Ring / Gehäuse / 30°C) oder Warmwasser (roter Ring / Gehäuse / 90°C) handelt, und notiere dies in 'notes'.\n"
    "6. Konfidenz zwischen 0.0 und 1.0 im Feld 'confidence' angeben.\n"
    "7. ANTWORTE NUR MIT DEM REINEN JSON-OBJEKT:\n"
    "{\n"
    '  "category": "electricity" | "gas" | "water",\n'
    '  "value": 0.0,\n'
    '  "unit": "kWh" | "m³",\n'
    '  "meter_number": "string" | null,\n'
    '  "confidence": 0.95,\n'
    '  "notes": "Erklärung der Ziffern und Zählernummer"\n'
    "}\n"
    "Beginne direkt mit '{' und beende mit '}'. Keinerlei Text davor oder danach!"
)

def clean_number_string(s: str) -> Optional[float]:
    if not s:
        return None
    s = s.strip().replace(" ", "").replace("\xa0", "")
    # Remove any trailing units if present in the string
    s = re.sub(r'(?:kwh|m³|m3|l|liter)$', '', s, flags=re.IGNORECASE)
    
    # Handle German vs US number format
    if "." in s and "," in s:
        if s.rfind(",") > s.rfind("."):
            # German: 12.345,678 -> 12345.678
            s = s.replace(".", "").replace(",", ".")
        else:
            # US: 12,345.678 -> 12345.678
            s = s.replace(",", "")
    elif "," in s:
        # German decimal comma: 457,733 -> 457.733
        s = s.replace(",", ".")
    elif "." in s:
        # Multiple periods e.g. 04.084.4
        if s.count(".") > 1:
            parts = s.split(".")
            if len(parts[-1]) in (1, 2, 3):
                s = "".join(parts[:-1]) + "." + parts[-1]
            else:
                s = s.replace(".", "")
    try:
        val = float(s)
        return val
    except Exception:
        return None

def fallback_parse_meter_text(text: str) -> Dict[str, Any]:
    low = text.lower()
    
    # 1. Determine category
    if any(k in low for k in ["wasser", "water", "flügelrad", "sensus", "zenner", "allmess", "kaltwasser", "warmwasser"]):
        category = "water"
        unit = "m³"
    elif any(k in low for k in ["gas", "balgengas", "m3 gas", "m³ gas"]):
        category = "gas"
        unit = "m³"
    elif any(k in low for k in ["strom", "elec", "kwh", "ferraris", "drehstrom", "eintarif", "zweitarif"]):
        category = "electricity"
        unit = "kWh"
    else:
        if "kwh" in low:
            category = "electricity"
            unit = "kWh"
        elif "m³" in low or "m3" in low:
            category = "water" if "wasser" in low else "gas"
            unit = "m³"
        else:
            category = "electricity"
            unit = "kWh"

    # 2. Extract value
    value = 0.0
    val_match = re.search(
        r'(?:zählerstand|reading|stand|wert|display|ergebnis|total)[:\*\s]+([0-9\s\.\,]+)',
        text,
        re.IGNORECASE
    )
    if val_match:
        parsed_val = clean_number_string(val_match.group(1).strip())
        if parsed_val is not None:
            value = parsed_val

    if value == 0.0:
        unit_match = re.search(r'([0-9\s\.\,]{2,12})\s*(?:kwh|m³|m3)\b', text, re.IGNORECASE)
        if unit_match:
            parsed_val = clean_number_string(unit_match.group(1).strip())
            if parsed_val is not None:
                value = parsed_val

    if value == 0.0:
        bold_match = re.search(r'\*\*([0-9\s\.\,]+)\*\*', text)
        if bold_match:
            parsed_val = clean_number_string(bold_match.group(1).strip())
            if parsed_val is not None:
                value = parsed_val

    # 3. Extract meter / serial number
    meter_number = None
    nr_match = re.search(
        r'(?:seriennummer|zählernummer|zähler-nr|zählernr|serial\s*number|serial|gerätenummer|nr\.?|no\.?)[:\*\s]+([A-Za-z0-9\-_/]+)',
        text,
        re.IGNORECASE
    )
    if nr_match:
        nr_cand = nr_match.group(1).strip()
        if nr_cand.lower() not in ("null", "none", "unbekannt", "nicht", "keine"):
            meter_number = nr_cand

    return {
        "category": category,
        "value": round(value, 3),
        "unit": unit,
        "meter_number": meter_number,
        "confidence": 0.85 if value > 0 else 0.4,
        "notes": f"Aus Text extrahiert: {text[:160].strip()}"
    }

def parse_ai_meter_response(raw_content: str) -> Dict[str, Any]:
    cleaned = raw_content.strip()
    
    # Strip markdown fences ```json ... ``` or ``` ... ```
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    # Attempt 1: direct json loads
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict) and ("value" in data or "category" in data):
            return data
    except Exception:
        pass

    # Attempt 2: outermost { and }
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx > start_idx:
        try:
            data = json.loads(cleaned[start_idx:end_idx + 1])
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    # Attempt 3: fallback text parser
    return fallback_parse_meter_text(raw_content)

async def scan_meter_image(
    image_bytes: bytes,
    mime_type: str,
    base_url: str,
    api_key: str,
    model: str
) -> AIScanResult:
    """
    Sends an image of an analog meter to the selected Vision model and parses the reading.
    Uses high-precision system & user prompts, enforces JSON mode where supported,
    and falls back to resilient NLP extraction if free text is returned.
    """
    if not model or not model.strip():
        raise ValueError("Kein AI-Modell ausgewählt. Bitte in den Einstellungen konfigurieren.")

    norm_url = normalize_base_url(base_url)
    endpoint = f"{norm_url}/chat/completions" if norm_url.endswith("/v1") else f"{norm_url}/v1/chat/completions"

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    data_uri = f"data:{mime_type};base64,{b64_image}"

    user_message_content = [
        {
            "type": "text",
            "text": USER_METER_PROMPT
        },
        {
            "type": "image_url",
            "image_url": {
                "url": data_uri,
                "detail": "high"
            }
        }
    ]

    payload: Dict[str, Any] = {
        "model": model.strip(),
        "messages": [
            {"role": "system", "content": SYSTEM_METER_PROMPT},
            {"role": "user", "content": user_message_content}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.05,
        "max_tokens": 800
    }

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "MeterPulse/1.0"
    }
    if api_key and api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"

    resp_json = None
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(endpoint, json=payload, headers=headers)
            resp.raise_for_status()
            resp_json = resp.json()
        except httpx.HTTPStatusError as e:
            # If provider rejected response_format parameter (HTTP 400), retry without it
            if e.response.status_code == 400 and "response_format" in e.response.text.lower():
                payload.pop("response_format", None)
                resp = await client.post(endpoint, json=payload, headers=headers)
                resp.raise_for_status()
                resp_json = resp.json()
            else:
                raise RuntimeError(f"AI Provider HTTP Fehler ({e.response.status_code}): {e.response.text[:300]}")
        except Exception as e:
            raise RuntimeError(f"Kommunikationsfehler mit AI Endpoint {endpoint}: {str(e)}")

    choices = resp_json.get("choices", [])
    if not choices:
        raise RuntimeError("AI Provider lieferte keine Antwortmöglichkeiten (empty choices).")

    raw_content = choices[0].get("message", {}).get("content", "")
    if not raw_content:
        raise RuntimeError("Leere Rückgabe vom AI-Modell.")

    # Parse response through multi-tier parser
    data = parse_ai_meter_response(raw_content)

    # Normalize category
    cat = str(data.get("category", "")).lower()
    if any(k in cat for k in ["strom", "elec"]):
        category = "electricity"
        unit = "kWh"
    elif "gas" in cat:
        category = "gas"
        unit = "m³"
    elif any(k in cat for k in ["wasser", "water"]):
        category = "water"
        unit = "m³"
    else:
        raw_unit = str(data.get("unit", "")).lower()
        if "kwh" in raw_unit:
            category = "electricity"
            unit = "kWh"
        else:
            category = "water" if "wasser" in str(data.get("notes", "")).lower() else "electricity"
            unit = "kWh" if category == "electricity" else "m³"

    # Normalize value
    raw_val = data.get("value", 0.0)
    if isinstance(raw_val, (int, float)):
        val = float(raw_val)
    elif isinstance(raw_val, str):
        cleaned_num = clean_number_string(raw_val)
        val = cleaned_num if cleaned_num is not None else 0.0
    else:
        val = 0.0

    meter_number = data.get("meter_number")
    if meter_number:
        meter_number = str(meter_number).strip()
        if meter_number.lower() in ("null", "none", "", "n/a", "unbekannt", "nicht", "keine", "nicht lesbar", "nicht erkennbar"):
            meter_number = None
        else:
            cleaned_mn = re.sub(r'^(?:nr\.?|no\.?|sn[:\s]*|s/n[:\s]*|serien-?nr\.?[:\s]*|seriennummer[:\s]*)', '', meter_number, flags=re.IGNORECASE).strip()
            if cleaned_mn:
                meter_number = cleaned_mn

    try:
        confidence = float(data.get("confidence", 0.95))
    except Exception:
        confidence = 0.9
    confidence = max(0.0, min(1.0, confidence))

    notes = data.get("notes")
    if not notes or not str(notes).strip():
        notes = f"{category.capitalize()}-Zählerstand {round(val, 3)} {unit} erkannt."

    # Extract capture date from image EXIF if available
    detected_date = extract_image_capture_date(image_bytes)

    return AIScanResult(
        category=category,
        value=round(val, 3),
        unit=unit,
        meter_number=meter_number,
        confidence=confidence,
        notes=str(notes).strip(),
        detected_date=detected_date
    )

# ══════════════════════════════════════════════════════════════════════════════
# CONTRACT / TARIFF SCREENSHOT SCANNER (Strom, Gas, Wasser)
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_CONTRACT_PROMPT = (
    "Du bist ein hochpräziser Experten-Algorithmus zur optischen Dokumenten- und Tarifanalyse für Energie- und "
    "Wasserverträge (Strom, Gas, Wasser). Du erhältst einen oder mehrere Screenshots von Tarifrechnern, "
    "Vergleichsportalen (z.B. Check24, Verivox), Vertragsbestätigungen, Kundenportalen oder Jahresabrechnungen.\n\n"
    "Deine Aufgabe ist es, alle Vertrags- und Preisdaten fehlerfrei, objektiv und präzise in ein standardisiertes JSON-Objekt zu extrahieren.\n\n"
    "═══════════════════════════════════════════════════════════════════\n"
    "REGELN FÜR DIE EXTRAKTION:\n"
    "═══════════════════════════════════════════════════════════════════\n"
    "1. KATEGORIE ('category'):\n"
    "   - 'electricity': Strom, Ökostrom, kWh, Haushaltsstrom.\n"
    "   - 'gas': Gas, Erdgas, Biogas, kWh oder m³ Gas.\n"
    "   - 'water': Wasser, Trinkwasser, Frischwasser, Abwasser, m³ Wasser.\n\n"
    "2. ANBIETER & TARIFNAME:\n"
    "   - 'provider_name': Name des Versorgers / Anbieters (z.B. 'Vattenfall', 'E.ON', 'Yello', 'Stadtwerke München', etc.).\n"
    "   - 'tariff_name': Name des gewählten Tarifs (z.B. 'Easy Strom 12M', 'KlimaGas Direkt', 'Ökostrom Basis').\n\n"
    "3. VERTRAGSZEITRAUM ('start_date', 'end_date'):\n"
    "   - Format: Streng 'YYYY-MM-DD' (z.B. '2026-01-01').\n"
    "   - Wenn nur Vertragsbeginn und Laufzeit angegeben sind (z.B. 12 Monate ab 01.04.2026), berechne das Enddatum (2027-03-31).\n"
    "   - Falls kein Datum auffindbar ist, setze null.\n\n"
    "4. GRUNDPREIS / GRUNDGEBÜHR ('base_fee_monthly'):\n"
    "   - IMMER als monatlicher Grundpreis in EURO (z.B. 12.50).\n"
    "   - WICHTIG: Wenn der Grundpreis pro Jahr angegeben ist (z.B. '144,00 € / Jahr'), teile durch 12 (12.00 €/Monat)!\n\n"
    "5. ARBEITSPREIS / VERBRAUCHSPREIS ('unit_price'):\n"
    "   - IMMER in EURO pro Einheit (EUR/kWh für Strom/Gas bzw. EUR/m³ für Wasser).\n"
    "   - SEHR WICHTIG: In Deutschland wird der Arbeitspreis fast immer in Cent/kWh angegeben (z.B. '29,45 ct/kWh' oder '31,8 Cent').\n"
    "     WANDLE CENT IMMER IN EURO UM: 29,45 Cent -> 0.2945 EUR!\n"
    "   - Beispiel: 28,50 ct/kWh -> unit_price: 0.285. Bei Wasser: 2,10 €/m³ -> unit_price: 2.10.\n\n"
    "6. ABSCHLAG / MONATLICHER TEILBETRAG ('monthly_payment'):\n"
    "   - Der vereinbarte monatliche Abschlag in EURO (z.B. 85.00).\n\n"
    "7. EINMALIGER BONUS / NEUKUNDENBONUS / SOFORTBONUS ('bonus_one_time', 'bonus_notes'):\n"
    "   - 'bonus_one_time': Summe aller im ersten Jahr wirksamen Einmalboni in EURO als Zahl (z.B. 150.00).\n"
    "     Umfasst: Neukundenbonus, Sofortbonus, Wechselbonus, Cashback, Onlinebonus.\n"
    "     Falls kein Bonus vorhanden ist, trage 0.0 ein.\n"
    "   - 'bonus_notes': Details & Bedingungen zum Bonus (z.B. '100 € Sofortbonus nach 60 Tagen + 50 € Neukundenbonus nach 12 Monaten').\n\n"
    "8. HINWEISE & ZUSAMMENFASSUNG ('notes'):\n"
    "   - Kurze deutsche Zusammenfassung der erkannten Parameter und Besonderheiten.\n\n"
    "═══════════════════════════════════════════════════════════════════\n"
    "AUSGABEFORMAT (STRIKT VALIDES JSON):\n"
    "═══════════════════════════════════════════════════════════════════\n"
    "{\n"
    '  "category": "electricity" | "gas" | "water",\n'
    '  "provider_name": "Vattenfall" | null,\n'
    '  "tariff_name": "Easy Strom 12M" | null,\n'
    '  "start_date": "2026-01-01" | null,\n'
    '  "end_date": "2026-12-31" | null,\n'
    '  "base_fee_monthly": 11.90,\n'
    '  "unit_price": 0.2950,\n'
    '  "monthly_payment": 85.00,\n'
    '  "bonus_one_time": 150.00,\n'
    '  "bonus_notes": "150 € Sofortbonus nach 60 Tagen Lieferzeit" | null,\n'
    '  "confidence": 0.95,\n'
    '  "notes": "Tarifdaten erfolgreich aus Screenshot extrahiert."\n'
    "}"
)

USER_CONTRACT_PROMPT = (
    "Analysiere diese(n) Screenshot(s) eines Strom-, Gas- oder Wassertarifs / -vertrags.\n"
    "Extrahiere alle relevanten Daten (Kategorie, Anbieter, Tarif, Start-/Enddatum, Grundpreis pro Monat in EUR, "
    "Arbeitspreis in EUR/kWh bzw. EUR/m³, monatlichen Abschlag in EUR sowie eventuelle Einmal- oder Neukundenboni).\n\n"
    "WICHTIGE VORGABEN:\n"
    "1. Wandle Arbeitspreise in Cent (z.B. 29,5 Cent/kWh) IMMER in Euro um (0.2950 EUR/kWh).\n"
    "2. Grundpreis immer pro Monat angeben (falls Jahrespreis angegeben: durch 12 teilen).\n"
    "3. Boni (Neukundenbonus, Sofortbonus) im Feld 'bonus_one_time' als Euro-Zahl summieren.\n"
    "4. Antworte AUSSCHLIESSLICH mit dem validen JSON-Objekt ohne Markdown-Codeblöcke:\n"
    "{\n"
    '  "category": "electricity" | "gas" | "water",\n'
    '  "provider_name": "string" | null,\n'
    '  "tariff_name": "string" | null,\n'
    '  "start_date": "YYYY-MM-DD" | null,\n'
    '  "end_date": "YYYY-MM-DD" | null,\n'
    '  "base_fee_monthly": 0.0,\n'
    '  "unit_price": 0.0,\n'
    '  "monthly_payment": 0.0,\n'
    '  "bonus_one_time": 0.0,\n'
    '  "bonus_notes": "string" | null,\n'
    '  "confidence": 0.95,\n'
    '  "notes": "string"\n'
    "}\n"
    "Beginne direkt mit '{' und ende mit '}'."
)

def fallback_parse_contract_text(text: str) -> Dict[str, Any]:
    low = text.lower()

    # Category
    if any(k in low for k in ["wasser", "trinkwasser", "abwasser"]):
        category = "water"
    elif any(k in low for k in ["gas", "erdgas", "biogas"]):
        category = "gas"
    else:
        category = "electricity"

    # Provider & Tariff
    provider = None
    prov_match = re.search(r'(?:anbieter|versorger|unternehmen|provider)[:\s]+([A-Za-z0-9\.\-\s]{2,40})', text, re.IGNORECASE)
    if prov_match:
        provider = prov_match.group(1).strip()

    tariff = None
    tar_match = re.search(r'(?:tarif|produkt|tarifname)[:\s]+([A-Za-z0-9\.\-\s]{2,40})', text, re.IGNORECASE)
    if tar_match:
        tariff = tar_match.group(1).strip()

    # Unit price
    unit_price = 0.0
    up_match = re.search(r'(?:arbeitspreis|verbrauchspreis|energiepreis)[:\s]+([0-9\.,]+)\s*(?:ct|cent|eur|€)', text, re.IGNORECASE)
    if up_match:
        parsed_up = clean_number_string(up_match.group(1))
        if parsed_up is not None:
            if "ct" in up_match.group(0).lower() or "cent" in up_match.group(0).lower() or parsed_up > 5.0:
                unit_price = round(parsed_up / 100.0, 4)
            else:
                unit_price = round(parsed_up, 4)

    # Base fee
    base_fee = 0.0
    bf_match = re.search(r'(?:grundpreis|grundgebühr)[:\s]+([0-9\.,]+)\s*(?:eur|€)', text, re.IGNORECASE)
    if bf_match:
        parsed_bf = clean_number_string(bf_match.group(1))
        if parsed_bf is not None:
            if "jahr" in text[bf_match.end():bf_match.end() + 20].lower() or parsed_bf > 60.0:
                base_fee = round(parsed_bf / 12.0, 2)
            else:
                base_fee = round(parsed_bf, 2)

    # Monthly payment (Abschlag)
    payment = 0.0
    pay_match = re.search(r'(?:abschlag|monatlicher beitrag|teilbetrag)[:\s]+([0-9\.,]+)\s*(?:eur|€)', text, re.IGNORECASE)
    if pay_match:
        parsed_pay = clean_number_string(pay_match.group(1))
        if parsed_pay is not None:
            payment = round(parsed_pay, 2)

    # Bonus
    bonus = 0.0
    bonus_match = re.search(r'(?:neukundenbonus|sofortbonus|bonus|cashback)[:\s]+([0-9\.,]+)\s*(?:eur|€)', text, re.IGNORECASE)
    if bonus_match:
        parsed_bonus = clean_number_string(bonus_match.group(1))
        if parsed_bonus is not None:
            bonus = round(parsed_bonus, 2)

    return {
        "category": category,
        "provider_name": provider,
        "tariff_name": tariff,
        "start_date": None,
        "end_date": None,
        "base_fee_monthly": base_fee,
        "unit_price": unit_price,
        "monthly_payment": payment,
        "bonus_one_time": bonus,
        "bonus_notes": f"Erkannter Bonus: {bonus} €" if bonus > 0 else None,
        "confidence": 0.8,
        "notes": f"Aus Text extrahiert: {text[:160].strip()}"
    }

def parse_ai_contract_response(raw_content: str) -> Dict[str, Any]:
    cleaned = raw_content.strip()

    # Strip markdown fences ```json ... ``` or ``` ... ```
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    # Attempt 1: direct json loads
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict) and ("unit_price" in data or "category" in data or "base_fee_monthly" in data):
            return data
    except Exception:
        pass

    # Attempt 2: outermost { and }
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx > start_idx:
        try:
            data = json.loads(cleaned[start_idx:end_idx + 1])
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    # Attempt 3: fallback text parser
    return fallback_parse_contract_text(raw_content)

async def scan_contract_images(
    images: List[tuple],  # List of (image_bytes: bytes, mime_type: str)
    base_url: str,
    api_key: str,
    model: str
) -> AIContractScanResult:
    """
    Sends one or multiple screenshot images of a contract / tariff page to the Vision model,
    combining all pages/screens into a single analysis request.
    Extracts provider, tariff, start/end date, base fee, unit price, monthly payment, and bonuses.
    """
    if not model or not model.strip():
        raise ValueError("Kein AI-Modell ausgewählt. Bitte in den Einstellungen konfigurieren.")

    if not images:
        raise ValueError("Keine Bilder zum Scannen übergeben.")

    norm_url = normalize_base_url(base_url)
    endpoint = f"{norm_url}/chat/completions" if norm_url.endswith("/v1") else f"{norm_url}/v1/chat/completions"

    user_message_content: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": USER_CONTRACT_PROMPT
        }
    ]

    for img_bytes, mime in images:
        b64_image = base64.b64encode(img_bytes).decode("utf-8")
        user_message_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{mime};base64,{b64_image}",
                "detail": "high"
            }
        })

    payload: Dict[str, Any] = {
        "model": model.strip(),
        "messages": [
            {"role": "system", "content": SYSTEM_CONTRACT_PROMPT},
            {"role": "user", "content": user_message_content}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.05,
        "max_tokens": 1200
    }

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "MeterPulse/1.0"
    }
    if api_key and api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"

    resp_json = None
    async with httpx.AsyncClient(timeout=90.0) as client:
        try:
            resp = await client.post(endpoint, json=payload, headers=headers)
            resp.raise_for_status()
            resp_json = resp.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400 and "response_format" in e.response.text.lower():
                payload.pop("response_format", None)
                resp = await client.post(endpoint, json=payload, headers=headers)
                resp.raise_for_status()
                resp_json = resp.json()
            else:
                raise RuntimeError(f"AI Provider HTTP Fehler ({e.response.status_code}): {e.response.text[:300]}")
        except Exception as e:
            raise RuntimeError(f"Kommunikationsfehler mit AI Endpoint {endpoint}: {str(e)}")

    choices = resp_json.get("choices", [])
    if not choices:
        raise RuntimeError("AI Provider lieferte keine Antwortmöglichkeiten (empty choices).")

    raw_content = choices[0].get("message", {}).get("content", "")
    if not raw_content:
        raise RuntimeError("Leere Rückgabe vom AI-Modell.")

    data = parse_ai_contract_response(raw_content)

    # Normalize category
    cat = str(data.get("category", "")).lower()
    if any(k in cat for k in ["gas", "erdgas"]):
        category = "gas"
    elif any(k in cat for k in ["wasser", "water"]):
        category = "water"
    else:
        category = "electricity"

    # Normalize unit price (EUR/kWh or EUR/m³)
    raw_unit_price = data.get("unit_price", 0.0)
    if isinstance(raw_unit_price, str):
        parsed_up = clean_number_string(raw_unit_price)
        unit_price = parsed_up if parsed_up is not None else 0.0
    else:
        try:
            unit_price = float(raw_unit_price or 0.0)
        except Exception:
            unit_price = 0.0

    # Safeguard: if unit price is given in Cent (e.g. 29.5 ct) for electricity or gas, convert to EUR
    if category in ("electricity", "gas") and unit_price > 5.0:
        unit_price = round(unit_price / 100.0, 4)

    # Normalize base fee
    raw_base_fee = data.get("base_fee_monthly", 0.0)
    if isinstance(raw_base_fee, str):
        parsed_bf = clean_number_string(raw_base_fee)
        base_fee = parsed_bf if parsed_bf is not None else 0.0
    else:
        try:
            base_fee = float(raw_base_fee or 0.0)
        except Exception:
            base_fee = 0.0

    # Safeguard: if base fee was given as annual fee (> 75 EUR/month is very rare for household)
    if base_fee > 75.0:
        base_fee = round(base_fee / 12.0, 2)

    # Normalize monthly payment
    raw_payment = data.get("monthly_payment", 0.0)
    if isinstance(raw_payment, str):
        parsed_pay = clean_number_string(raw_payment)
        monthly_payment = parsed_pay if parsed_pay is not None else 0.0
    else:
        try:
            monthly_payment = float(raw_payment or 0.0)
        except Exception:
            monthly_payment = 0.0

    # Normalize bonus
    raw_bonus = data.get("bonus_one_time", 0.0)
    if isinstance(raw_bonus, str):
        parsed_bonus = clean_number_string(raw_bonus)
        bonus_one_time = parsed_bonus if parsed_bonus is not None else 0.0
    else:
        try:
            bonus_one_time = float(raw_bonus or 0.0)
        except Exception:
            bonus_one_time = 0.0
    bonus_one_time = max(0.0, round(bonus_one_time, 2))

    provider_name = data.get("provider_name")
    if provider_name:
        provider_name = str(provider_name).strip()
        if provider_name.lower() in ("null", "none", "", "n/a", "unbekannt"):
            provider_name = None

    tariff_name = data.get("tariff_name")
    if tariff_name:
        tariff_name = str(tariff_name).strip()
        if tariff_name.lower() in ("null", "none", "", "n/a", "unbekannt"):
            tariff_name = None

    start_date = data.get("start_date")
    if start_date:
        start_date = str(start_date).strip()
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', start_date):
            start_date = None

    end_date = data.get("end_date")
    if end_date:
        end_date = str(end_date).strip()
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', end_date):
            end_date = None

    bonus_notes = data.get("bonus_notes")
    if bonus_notes:
        bonus_notes = str(bonus_notes).strip()
        if bonus_notes.lower() in ("null", "none", "", "n/a"):
            bonus_notes = None

    try:
        confidence = float(data.get("confidence", 0.95))
    except Exception:
        confidence = 0.9
    confidence = max(0.0, min(1.0, confidence))

    notes = data.get("notes")
    if not notes or not str(notes).strip():
        notes = f"{category.capitalize()}-Tarif von {provider_name or 'Unbekannt'} ({tariff_name or 'Standard'}) erkannt."

    return AIContractScanResult(
        category=category,
        provider_name=provider_name,
        tariff_name=tariff_name,
        start_date=start_date,
        end_date=end_date,
        base_fee_monthly=round(base_fee, 2),
        unit_price=round(unit_price, 4),
        monthly_payment=round(monthly_payment, 2),
        bonus_one_time=bonus_one_time,
        bonus_notes=bonus_notes,
        confidence=confidence,
        notes=str(notes).strip()
    )


