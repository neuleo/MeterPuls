import os
from datetime import datetime, date, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from database import engine, Base, SessionLocal, DATABASE_DIR, run_migrations
from models import Meter, Reading, Contract, AISetting
from routers import meters, readings, contracts, ai, analytics

# Create database tables and apply schema updates
Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(
    title="MeterPulse API",
    description="Intelligenter Zähler- & Verbrauchs-Tracker mit Vision-KI",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads directory for meter photos
UPLOADS_DIR = os.path.join(DATABASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Include Routers
app.include_router(meters.router, prefix="/api")
app.include_router(readings.router, prefix="/api")
app.include_router(contracts.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "MeterPulse Backend", "timestamp": datetime.utcnow().isoformat()}

def init_default_data():
    """Seeds default meters, contracts, and initial readings if database is freshly created."""
    db: Session = SessionLocal()
    try:
        # 1. Default Meters (Strom, Gas, Wasser) - only created if no meters exist yet
        if db.query(Meter).count() == 0:
            elec_meter = Meter(
                name="Hauptzähler Strom",
                category="electricity",
                unit="kWh",
                meter_number=None,
                location=None
            )
            gas_meter = Meter(
                name="Hauptzähler Gas",
                category="gas",
                unit="m³",
                meter_number=None,
                location=None
            )
            water_meter = Meter(
                name="Hauptzähler Wasser",
                category="water",
                unit="m³",
                meter_number=None,
                location=None
            )
            db.add_all([elec_meter, gas_meter, water_meter])
            db.commit()

        # 2. Default Contracts
        current_year = date.today().year
        start_year = date(current_year, 1, 1)
        end_year = date(current_year, 12, 31)

        contracts_data = [
            {
                "category": "electricity",
                "start_date": start_year,
                "end_date": end_year,
                "base_fee_monthly": 11.90,
                "unit_price": 0.3250,      # 32.5 ct/kWh
                "monthly_payment": 85.00
            },
            {
                "category": "gas",
                "start_date": start_year,
                "end_date": end_year,
                "base_fee_monthly": 14.50,
                "unit_price": 0.1180,      # 11.8 ct/kWh bzw. ~1.18 €/m³
                "monthly_payment": 130.00
            },
            {
                "category": "water",
                "start_date": start_year,
                "end_date": end_year,
                "base_fee_monthly": 6.50,
                "unit_price": 4.2000,      # 4.20 €/m³ inkl. Abwasser
                "monthly_payment": 30.00
            }
        ]

        for c_data in contracts_data:
            existing = db.query(Contract).filter(Contract.category == c_data["category"]).first()
            if not existing:
                db.add(Contract(**c_data))

        # 3. Default AI Setting
        ai_setting = db.query(AISetting).first()
        if not ai_setting:
            db.add(AISetting(
                base_url="https://openrouter.ai/api",
                api_key="",
                selected_model="openai/gpt-4o-mini"
            ))

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Fehler bei Default-Daten-Initialisierung: {e}")
    finally:
        db.close()

# Run initialization on startup
init_default_data()
