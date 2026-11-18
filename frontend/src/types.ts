export type MeterCategory = 'electricity' | 'gas' | 'water';

export interface Meter {
  id: number;
  name: string;
  category: MeterCategory;
  unit: string;
  meter_number?: string;
  location?: string;
  created_at: string;
  latest_reading?: number | null;
  latest_reading_date?: string | null;
  reading_count: number;
}

export interface Reading {
  id: number;
  meter_id: number;
  reading_value: number;
  reading_date: string;
  image_path?: string | null;
  notes?: string | null;
  client_ref?: string | null;
  created_at: string;
}

export interface Contract {
  id: number;
  category: MeterCategory;
  provider_name?: string | null;
  tariff_name?: string | null;
  start_date: string;
  end_date: string;
  base_fee_monthly: number;
  unit_price: number;
  monthly_payment: number;
  bonus_one_time?: number;
  bonus_notes?: string | null;
  warmwater_source?: string; // 'electricity' | 'gas'
  heating_start_month?: number; // 1-12
  heating_end_month?: number; // 1-12
  created_at: string;
  updated_at: string;
}

export interface AISetting {
  id: number;
  base_url: string;
  api_key: string;
  selected_model: string;
  updated_at: string;
  is_key_set: boolean;
}

export interface AIModelItem {
  id: string;
  name: string;
  is_vision: boolean;
  context_length?: number | null;
}

export interface AIScanResult {
  category: MeterCategory;
  value: number;
  unit: string;
  meter_number?: string | null;
  confidence: number;
  notes?: string | null;
  detected_date?: string | null;
}

export interface AIContractScanResult {
  category: MeterCategory;
  provider_name?: string | null;
  tariff_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  base_fee_monthly: number;
  unit_price: number;
  monthly_payment: number;
  bonus_one_time: number;
  bonus_notes?: string | null;
  confidence: number;
  notes?: string | null;
}

export interface TimeSeriesPoint {
  date: string;
  electricity?: number;
  gas?: number;
  water?: number;
  is_projected?: boolean;
}

export interface CategorySummary {
  category: MeterCategory;
  unit: string;
  meter_count: number;
  timeframe: string;
  period_consumption: number;
  period_cost: number;
  period_paid: number;
  period_balance: number;
  total_consumption: number;
  unit_price: number;
  base_fee_monthly: number;
  monthly_payment: number;
  cost_so_far: number;
  paid_so_far: number;
  balance_so_far: number; // positive = refund/credit, negative = additional payment
  projected_consumption: number;
  projected_total_cost: number;
  projected_total_paid: number;
  projected_balance: number;
  seasonal_applied: boolean;
  bonus_one_time?: number;
  bonus_notes?: string | null;
  projected_total_cost_regular?: number;
  effective_first_year_cost?: number;
  warmwater_source?: string;
  heating_status?: 'active' | 'inactive' | 'transition';
  heating_status_label?: string;
  heating_start_learned?: string;
  heating_end_learned?: string;
  heating_baseload_daily?: number;
  heating_active_daily?: number;
  heating_share_pct?: number;
  warmwater_share_pct?: number;
  is_heating_season?: boolean;
  heating_days_in_year?: number;
  learned_explanation?: string;
}

export interface DashboardData {
  summaries: Record<MeterCategory, CategorySummary>;
  history: TimeSeriesPoint[];
  granularity: 'day' | 'week' | 'month';
  timeframe?: string;
}

export interface ExportDataResponse {
  ai_prompt: string;
  csv_readings: string;
  csv_monthly: string;
  summary_text: string;
}

export type ContractStatus = 'active' | 'planned' | 'ended' | 'gap';

export interface ContractPrice {
  id: number;
  contract_id: number;
  valid_from: string;
  base_fee_monthly: number;
  unit_price: number;
  monthly_payment: number;
}

export interface ContractDetail extends Contract {
  status: ContractStatus;
  prices: ContractPrice[];
}

export interface ContractListResponse {
  active: ContractDetail | null;
  next_change: ContractDetail | null;
  history: ContractDetail[];
  gaps: Array<{ start_date: string; end_date: string }>;
}

export interface ContractPlanResult {
  ok: boolean;
  message: string;
  contract_id?: number;
}

export interface CostDay {
  date: string;
  consumption: number;
  energy_cost: number;
  base_cost: number;
  payment: number;
  total_cost: number;
  contract_id: number | null;
  price_id: number | null;
  unit_price: number;
  has_tariff: boolean;
  is_gap: boolean;
  is_estimated: boolean;
  is_projected: boolean;
  unit_mismatch?: boolean;
}

export interface CostPeriod {
  contract_id: number | null;
  start_date: string;
  end_date: string;
  status: ContractStatus;
  provider_name?: string | null;
  tariff_name?: string | null;
  unit_price: number;
  base_fee_monthly: number;
}

export interface CostTotalsBlock {
  consumption: number;
  energy_cost: number;
  base_cost: number;
  cost: number;
  payment: number;
  balance: number;
  bonus: number;
  cost_with_bonus: number;
  balance_with_bonus: number;
}

export interface CostBreakdown {
  category: MeterCategory;
  unit: string;
  start_date: string;
  end_date: string;
  eval_date: string;
  days: CostDay[];
  periods: CostPeriod[];
  gaps: CostPeriod[];
  totals: {
    actual: CostTotalsBlock;
    forecast: CostTotalsBlock;
    all: CostTotalsBlock;
  };
  has_gap: boolean;
  unit_mismatch?: boolean;
  meter_unit?: string;
  price_unit?: string;
}
