from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from database import Base

class Meter(Base):
    __tablename__ = "meters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(20), nullable=False, index=True)  # electricity, gas, water
    unit = Column(String(10), nullable=False)  # kWh, m³
    meter_number = Column(String(50), nullable=True)
    location = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    readings = relationship("Reading", back_populates="meter", cascade="all, delete-orphan", order_by="Reading.reading_date.asc()")

class Reading(Base):
    __tablename__ = "readings"
    __table_args__ = (Index("uq_readings_client_ref", "client_ref", unique=True),)

    id = Column(Integer, primary_key=True, index=True)
    meter_id = Column(Integer, ForeignKey("meters.id", ondelete="CASCADE"), nullable=False, index=True)
    reading_value = Column(Float, nullable=False)
    reading_date = Column(DateTime, nullable=False, index=True)
    image_path = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    client_ref = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    meter = relationship("Meter", back_populates="readings")

class Contract(Base):
    """
    A contract has its own term and is addressed by its id.
    start_date is inclusive, end_date is stored inclusive (legacy behaviour) and
    turned into an exclusive boundary by the calculation helpers.
    """
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(20), nullable=False, index=True)  # electricity, gas, water
    provider_name = Column(String(100), nullable=True)
    tariff_name = Column(String(100), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    base_fee_monthly = Column(Float, default=0.0, nullable=False)           # Grundgebühr EUR / Monat
    unit_price = Column(Float, default=0.0, nullable=False)                 # Arbeitspreis EUR / Einheit
    monthly_payment = Column(Float, default=0.0, nullable=False)            # Abschlag EUR / Monat
    bonus_one_time = Column(Float, default=0.0, nullable=False)             # Einmaliger Bonus EUR (max. einmal je Vertrag)
    bonus_notes = Column(String(200), nullable=True)
    warmwater_source = Column(String(50), default="electricity", nullable=False)
    heating_start_month = Column(Integer, default=10, nullable=False)
    heating_end_month = Column(Integer, default=4, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    prices = relationship(
        "ContractPrice",
        back_populates="contract",
        cascade="all, delete-orphan",
        order_by="ContractPrice.valid_from.asc()"
    )

class ContractPrice(Base):
    """A dated price section belonging to exactly one contract."""
    __tablename__ = "contract_prices"
    __table_args__ = (UniqueConstraint("contract_id", "valid_from", name="uq_contract_price_start"),)

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True)
    valid_from = Column(Date, nullable=False)
    base_fee_monthly = Column(Float, default=0.0, nullable=False)
    unit_price = Column(Float, default=0.0, nullable=False)
    monthly_payment = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    contract = relationship("Contract", back_populates="prices")

class AISetting(Base):
    __tablename__ = "ai_settings"

    id = Column(Integer, primary_key=True, index=True)
    base_url = Column(String(255), default="https://openrouter.ai/api", nullable=False)
    api_key = Column(String(255), default="", nullable=False)
    selected_model = Column(String(100), default="", nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
