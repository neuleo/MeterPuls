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
