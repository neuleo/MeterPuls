# MeterPulse ⚡🔥💧

> **Intelligentes Zähler- & Verbrauchs-Tracking mit Vision-KI, automatischem Tarif-Scanner und adaptivem Heizperioden-Lernmodell.**

MeterPulse ist eine moderne, produktionsreife Web-Anwendung zur automatischen und manuellen Erfassung sowie Visualisierung analoger und digitaler Zählerstände (**Strom, Gas, Wasser**). Entwickelt mit Fokus auf Smartphone-Kameraerfassung im Keller (Mobile-First) und tiefe analytische Dashboards für Desktop und Tablet.

---

## ✨ Highlights & Features

### 📸 1. Vision-KI Zählerstand-Erfassung
* **Kamera & Upload:** Direkte Aufnahme per Smartphone-Kamera (`capture="environment"`) oder Dateiupload.
* **Präzise KI-Erkennung:** Liest Zählertyp, Zählerstand (inkl. roten Nachkommastellen) und Zählernummern/Seriennummern automatisch ab.
* **Intelligente Multi-Zähler-Zuordnung:** Erkennt anhand der abgelesenen Zählernummer sofort, zu welchem Zähler der Messwert gehört (z. B. Unterscheidung zwischen Kaltwasser-, Warmwasser- und Gartenwasserzähler).
* **Vollständige Bearbeitbarkeit:** Vor dem Speichern können Datum, Zählerstand und Zählerzuordnung manuell korrigiert oder bestätigt werden.

### 📄 2. KI-Vertrags- & Tarif-Scanner (Multi-Screenshot)
* **Kein Abtippen mehr:** Lade einfach einen oder mehrere Screenshots deiner Tarifübersicht (z. B. aus Check24, Verivox, Stadtwerke-Portal oder Abrechnungs-PDF) hoch.
* **Automatische Extraktion:** Die KI erkennt Anbieter, Tarifname, Arbeitspreis (Cent/kWh bzw. €/m³), monatliche Grundgebühr, monatlichen Abschlag, Vertragszeitraum und Zählernummern.
* **Bonus-Berücksichtigung:** Erfasst Neukunden- und Sofortboni und rechnet diese transparent in die Gesamtkosten und Saldenprognose des ersten Vertragsjahres ein.

### 📊 3. Dedizierte Sparten-Dashboards (Strom, Gas, Wasser)
* **Klick auf jede Sparte** öffnet eine maßgeschneiderte Detailansicht:
  * **Strom:** Bisheriger Verbrauch, Tages- & Monatsdurchschnitte, Hochrechnung bis Vertragsende, Saldo (erwartetes Guthaben vs. Nachzahlung), empfohlener Monatsabschlag.
  * **Gas:** Exakte BDEW-Heizgradtage-Saisonalität, Darstellung der Heizperioden und Kostenprognosen.
  * **Wasser (Nebenkosten-Modus):** Da Wasser in der Regel nicht über monatliche Abschlagszahlungen an Versorger, sondern über die jährliche Nebenkostenabrechnung abgerechnet wird, berechnet MeterPulse hier exakt die bisher aufgelaufenen und erwarteten Kosten ohne irreführende "Nachzahlungs"-Anzeige.

### 🌡️ 4. Adaptives Heizperioden-Lernmodell (Gas)
* **Lernfähige Heizgrenzen:** Das System lernt aus Zählerständen und Stagnationsphasen, ab welchem Monat/Tag im Herbst du die Heizung anwirfst und wann du sie im Frühjahr wieder ausschaltest.
* **Warmwasser-Kopplung (Elektrisch vs. Gas):** 
  * Läuft Warmwasser über Strom (Boiler / Durchlauferhitzer), wird dein Gasverbrauch für die heizfreien Sommermonate automatisch und physikalisch korrekt mit **0,00 m³** prognostiziert.
  * Gleichzeitig wird der Strom-Sockelverbrauch entsprechend berücksichtigt.

### 📈 5. Intelligente Monats- & Jahresprognosen
* **Keine 0-Werte im laufenden Monat:** Wurde im laufenden Monat noch kein Zählerstand erfasst, rechnet MeterPulse die verbleibenden Tage nahtlos auf Basis des realen Tagesdurchschnitts hoch und visualisiert den Monat als Prognosebalken.
* **Saisonale Gewichtung:** Gas wird nach Heizgradtagen (VDI 4670 / DIN 4710) gewichtet; Strom und Wasser werden linear interpoliert.

### ⚙️ 6. Flexibler KI-Provider & Settings
* Kompatibel mit allen OpenAI-kompatiblen Schnittstellen:
  * **OpenRouter** (z. B. `google/gemini-flash-1.5`, `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`)
  * **OpenAI Direct**
  * **Lokale Modelle** via Ollama, LocalAI oder vLLM (z. B. `qwen2-vl`, `llava`)
* Dynamischer Abruf aller verfügbaren Vision-Modelle per Klick direkt in der UI.

---

## 🚀 Schnellstart

### Voraussetzungen
* Docker & Docker Compose installiert

### Installation & Start

1. **Repository klonen:**
   ```bash
   git clone https://github.com/neuleo/MeterPuls.git
   cd MeterPuls
   ```

2. **Container starten:**
   ```bash
   docker compose up -d
   ```

3. **Im Browser öffnen:**
   * Frontend: 👉 **http://localhost:8090**
   * API & Swagger-Dokumentation: 👉 **http://localhost:8091/docs**

---

## 🏗️ Architektur & Tech Stack

| Bereich | Technologien |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts |
| **Backend** | Python 3.11, FastAPI, Pydantic V2, SQLAlchemy, HTTPX, Pillow |
| **Datenbank** | SQLite im performanten **WAL-Modus** (Write-Ahead Logging) |
| **Reverse Proxy** | Nginx Alpine (integriertes Caching & API-Routing) |
| **Testing** | Automatisierte End-to-End UI- & Vision-Tests mit Puppeteer |

---

## 📁 Projektstruktur

```
MeterPulse/
├── docker-compose.yml          # Multi-Container Orchestrierung
├── .gitignore                  # Schützt Userdaten, SQLite & Cache vor Git
├── README.md                   # Projektdokumentation
├── backend/
│   ├── Dockerfile              # Python 3.11 Backend Image
│   ├── requirements.txt        # FastAPI, SQLAlchemy, Pillow, etc.
│   ├── main.py                 # FastAPI Einstiegspunkt & DB Initialisierung
│   ├── database.py             # SQLite WAL Setup & dynamische Migrationen
│   ├── models.py               # SQLAlchemy ORM Datenmodelle
│   ├── schemas.py              # Pydantic Schemas & Validierungen
│   ├── calculations.py         # Interpolation, BDEW-Heizgradtage & Prognosen
│   ├── ai_service.py           # Vision-KI Prompting & Multi-Screenshot Extraktor
│   └── routers/                # REST Endpunkte (meters, readings, contracts, ai, analytics)
├── frontend/
│   ├── Dockerfile              # Multi-Stage Node.js Build -> Nginx Image
│   ├── nginx.conf              # SPA Routing & /api Proxy Konfiguration
│   ├── package.json            # React, Vite, Tailwind, Recharts
│   └── src/
│       ├── api.ts              # API-Client & Backend-Kommunikation
│       ├── types.ts            # TypeScript Datentypen
│       └── components/         # Modulare UI Komponenten
│           ├── Dashboard.tsx               # Hauptübersicht mit Sparten-Karten
│           ├── CategoryDetailDashboard.tsx # Dedizierte Detailseiten (Strom, Gas, Wasser)
│           ├── ScanModal.tsx               # Zähler-Scan mit KI & Multi-Zähler-Matching
│           ├── ContractScannerModal.tsx    # Multi-Screenshot KI Vertragsanalyse
│           ├── ContractSettings.tsx        # Tarif-, Abschlags- & Heizprofileinstellungen
│           └── ...
├── data/                       # Gemountetes Volume für SQLite-DB und Uploads
└── tests/                      # Puppeteer E2E Test Suite & Test-Runner
```

---

## 🧪 Tests

Die End-to-End Tests können direkt im Test-Container ausgeführt werden:

```bash
./tests/run_puppeteer.sh
```

---

## 🔒 Datenschutz & Privatsphäre
* **100% Self-Hosted:** Deine Zählerdaten, Verträge und Berechnungen bleiben auf deinem eigenen Server.
* **Sichere Bildübertragung:** Wenn du einen externen KI-Provider wie OpenRouter nutzt, werden nur die relevanten Zähler- bzw. Vertragsfotos zur Texterkennung übertragen. Bei lokalen Modellen (z. B. Ollama) verlässt kein einziges Byte dein Heimnetzwerk.

---

## 📄 Lizenz
MIT License - frei verwendbar und erweiterbar.
