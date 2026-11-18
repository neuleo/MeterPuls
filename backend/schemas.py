from datetime import datetime, date
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# --- Meter Schemas ---
class MeterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category: str = Field(..., pattern="^(electricity|gas|water)$")
    unit: str = Field(..., pattern="^(kWh|m³)$")
    meter_number: Optional[str] = None
    location: Optional[str] = None

class MeterCreate(MeterBase):
    pass

class MeterUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    meter_number: Optional[str] = None
    location: Optional[str] = None

class MeterResponse(MeterBase):
    id: int
    created_at: datetime
    latest_reading: Optional[float] = None
    latest_reading_date: Optional[datetime] = None
    reading_count: int = 0

    class Config:
        from_attributes = True

# --- Reading Schemas ---
class ReadingBase(BaseModel):
    meter_id: int
    reading_value: float = Field(..., ge=0)
    reading_date: datetime
    notes: Optional[str] = None

class ReadingCreate(ReadingBase):
    image_path: Optional[str] = None
    client_ref: Optional[str] = None

class ReadingUpdate(BaseModel):
    reading_value: Optional[float] = Field(None, ge=0)
    reading_date: Optional[datetime] = None
    notes: Optional[str] = None

class ReadingResponse(ReadingBase):
    id: int
    image_path: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Contract Schemas ---
class ContractBase(BaseModel):
    category: str = Field(..., pattern="^(electricity|gas|water)$")
    provider_name: Optional[str] = None
    tariff_name: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    base_fee_monthly: float = Field(default=0.0, ge=0)   # EUR/Monat
    unit_price: float = Field(default=0.0, ge=0)         # EUR/kWh bzw. EUR/m³
    monthly_payment: float = Field(default=0.0, ge=0)    # Abschlag EUR/Monat
    bonus_one_time: float = Field(default=0.0, ge=0)     # Einmaliger Bonus / Neukundenbonus EUR
    bonus_notes: Optional[str] = None
    warmwater_source: Optional[str] = "electricity"     # 'electricity' | 'gas'
    heating_start_month: Optional[int] = 10             # 1-12 (Oktober = 10)
    heating_end_month: Optional[int] = 4                # 1-12 (April = 4)

class ContractCreate(ContractBase):
    pass

class ContractUpdate(BaseModel):
    provider_name: Optional[str] = None
    tariff_name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    base_fee_monthly: Optional[float] = Field(None, ge=0)
    unit_price: Optional[float] = Field(None, ge=0)
    monthly_payment: Optional[float] = Field(None, ge=0)
    bonus_one_time: Optional[float] = Field(None, ge=0)
    bonus_notes: Optional[str] = None
    warmwater_source: Optional[str] = None
    heating_start_month: Optional[int] = None
    heating_end_month: Optional[int] = None

class ContractResponse(ContractBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- AI Settings & Scan Schemas ---
class AISettingBase(BaseModel):
    base_url: str = Field(default="https://openrouter.ai/api")
    api_key: str = Field(default="")
    selected_model: str = Field(default="")

class AISettingUpdate(AISettingBase):
    pass

class AISettingResponse(AISettingBase):
    id: int
    updated_at: datetime
    is_key_set: bool = False

    class Config:
        from_attributes = True

class AIModelItem(BaseModel):
    id: str
    name: str
    is_vision: bool = False
    context_length: Optional[int] = None

class AIScanResult(BaseModel):
    category: str = Field(..., description="Detected meter category: electricity, gas, or water")
    value: float = Field(..., description="Exact numerical reading value")
    unit: str = Field(..., description="Unit: kWh or m³")
    meter_number: Optional[str] = Field(None, description="Meter serial number if legible")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Detection confidence score")
    notes: Optional[str] = Field(None, description="Explanation or details on digits/dials detected")
    detected_date: Optional[str] = Field(None, description="ISO datetime extracted from image EXIF metadata if available")

class AIContractScanResult(BaseModel):
    category: str = Field(..., description="Detected category: electricity, gas, or water")
    provider_name: Optional[str] = Field(None, description="Provider name (e.g. Vattenfall, E.ON)")
    tariff_name: Optional[str] = Field(None, description="Tariff name (e.g. Easy Strom 12M)")
    start_date: Optional[str] = Field(None, description="Contract start date YYYY-MM-DD")
    end_date: Optional[str] = Field(None, description="Contract end date YYYY-MM-DD")
    base_fee_monthly: float = Field(default=0.0, description="Base fee in EUR/month")
    unit_price: float = Field(default=0.0, description="Unit price in EUR/unit (EUR/kWh or EUR/m³)")
    monthly_payment: float = Field(default=0.0, description="Monthly payment in EUR")
    bonus_one_time: float = Field(default=0.0, description="One-time bonus (Neukundenbonus/Sofortbonus) in EUR")
    bonus_notes: Optional[str] = Field(None, description="Bonus details/conditions")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    notes: Optional[str] = Field(None, description="AI extraction summary")

# --- Analytics Schemas ---
class TimeSeriesPoint(BaseModel):
    date: str
    electricity: Optional[float] = 0.0
    gas: Optional[float] = 0.0
    water: Optional[float] = 0.0
    is_projected: Optional[bool] = False

class CategorySummary(BaseModel):
    category: str
    unit: str
    meter_count: int
    timeframe: str = "30d"
    period_consumption: float
    period_cost: float
    period_paid: float
    period_balance: float
    total_consumption: float
    unit_price: float
    base_fee_monthly: float
    monthly_payment: float
    cost_so_far: float
    paid_so_far: float
    balance_so_far: float
    projected_consumption: float
    projected_total_cost: float
    projected_total_paid: float
    projected_balance: float
    seasonal_applied: bool = False
    bonus_one_time: float = 0.0
    bonus_notes: Optional[str] = None
    projected_total_cost_regular: float = 0.0
    effective_first_year_cost: float = 0.0
    warmwater_source: Optional[str] = "electricity"
    heating_status: Optional[str] = None          # 'active' | 'inactive' | 'transition'
    heating_status_label: Optional[str] = None    # 'Heizung aktiv' | 'Sommerpause (Heizung AUS)' | 'Übergangszeit'
    heating_start_learned: Optional[str] = None   # e.g. "Mitte Oktober"
    heating_end_learned: Optional[str] = None     # e.g. "Mitte April"
    heating_baseload_daily: Optional[float] = 0.0 # m³/Tag
    heating_active_daily: Optional[float] = None   # m³/Tag (während aktiver Heiztage)
    heating_share_pct: Optional[float] = 100.0    # 0-100%
    warmwater_share_pct: Optional[float] = 0.0    # 0-100%
    is_heating_season: Optional[bool] = False
    heating_days_in_year: Optional[int] = None
    learned_explanation: Optional[str] = None

class DashboardAnalyticsResponse(BaseModel):
    summaries: Dict[str, CategorySummary]
    history: List[TimeSeriesPoint]
    granularity: str
    timeframe: str = "30d"

class ExportDataResponse(BaseModel):
    ai_prompt: str
    csv_readings: str
    csv_monthly: str
    summary_text: str

# --- Dated contract planning schemas ---

class PriceSectionBase(BaseModel):
    valid_from: date
    base_fee_monthly: float = Field(default=0.0, ge=0)
    unit_price: float = Field(default=0.0, ge=0)
    monthly_payment: float = Field(default=0.0, ge=0)

class PriceSectionResponse(PriceSectionBase):
    id: int
    contract_id: int

    class Config:
        from_attributes = True

class ContractPlanCreate(BaseModel):
    category: str = Field(..., pattern="^(electricity|gas|water)$")
    provider_name: Optional[str] = None
    tariff_name: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    base_fee_monthly: float = Field(default=0.0, ge=0)
    unit_price: float = Field(default=0.0, ge=0)
    monthly_payment: float = Field(default=0.0, ge=0)
    bonus_one_time: float = Field(default=0.0, ge=0)
    bonus_notes: Optional[str] = None
    warmwater_source: str = "electricity"
    heating_start_month: int = 10
    heating_end_month: int = 4
    close_predecessor: bool = False
    confirm_backdate: bool = False

class ContractPlanPreview(BaseModel):
    category: str
    planned_start: date
    active_contract_id: Optional[int] = None
    active_until: Optional[date] = None
    new_contract_id: Optional[int] = None
    message: str
    warnings: List[str] = []

class PriceChangeCreate(BaseModel):
    contract_id: int
    valid_from: date
    unit_price: Optional[float] = Field(None, ge=0)
    base_fee_monthly: Optional[float] = Field(None, ge=0)
    monthly_payment: Optional[float] = Field(None, ge=0)
    confirm_backdate: bool = False

class ContractStatus(str):
    ACTIVE = "active"
    PLANNED = "planned"
    ENDED = "ended"

class ContractDetail(ContractResponse):
    status: str
    prices: List[PriceSectionResponse] = []

    class Config:
        from_attributes = True

class ContractListResponse(BaseModel):
    active: Optional[ContractDetail] = None
    next_change: Optional[ContractDetail] = None
    history: List[ContractDetail] = []
    gaps: List[Dict[str, Any]] = []

    class Config:
        from_attributes = True

class ContractActionResponse(BaseModel):
    ok: bool = True
    message: str
    contract_id: Optional[int] = None

# --- Shared cost breakdown schemas ---

class CostDay(BaseModel):
    date: date
    consumption: float
    energy_cost: float
    base_cost: float
    payment: float
    total_cost: float
    contract_id: Optional[int] = None
    price_id: Optional[int] = None
    unit_price: float
    has_tariff: bool
    is_gap: bool
    is_estimated: bool
    is_projected: bool
    unit_mismatch: bool = False

class CostPeriod(BaseModel):
    contract_id: Optional[int] = None
    start_date: date
    end_date: date
    status: str = "gap"
    provider_name: Optional[str] = None
    tariff_name: Optional[str] = None
    unit_price: float = 0.0
    base_fee_monthly: float = 0.0

class CostTotalsBlock(BaseModel):
    consumption: float = 0.0
    energy_cost: float = 0.0
    base_cost: float = 0.0
    cost: float = 0.0
    payment: float = 0.0
    balance: float = 0.0
    bonus: float = 0.0
    cost_with_bonus: float = 0.0

class CostBreakdownResponse(BaseModel):
    category: str
    unit: str
    start_date: date
    end_date: date
    eval_date: date
    days: List[CostDay]
    periods: List[CostPeriod]
    gaps: List[CostPeriod]
    totals: Dict[str, CostTotalsBlock]
    has_gap: bool = False
    unit_mismatch: bool = False
    meter_unit: str = ""
    price_unit: str = ""


