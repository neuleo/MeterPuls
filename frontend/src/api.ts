import {
  Meter,
  Reading,
  Contract,
  AISetting,
  AIModelItem,
  AIScanResult,
  AIContractScanResult,
  DashboardData,
  MeterCategory,
  ExportDataResponse,
  ContractDetail,
  ContractListResponse,
  ContractPlanResult,
  CostBreakdown
} from './types';

const API_BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `Fehler ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) {
        errorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // Keep statusText
    }
    throw new Error(errorMsg);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json();
}

export const api = {
  // Meters
  async getMeters(): Promise<Meter[]> {
    const res = await fetch(`${API_BASE}/meters`);
    return handleResponse<Meter[]>(res);
  },

  async createMeter(data: {
    name: string;
    category: MeterCategory;
    unit: string;
    meter_number?: string;
    location?: string;
  }): Promise<Meter> {
    const res = await fetch(`${API_BASE}/meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<Meter>(res);
  },

  async updateMeter(id: number, data: Partial<Meter>): Promise<Meter> {
    const res = await fetch(`${API_BASE}/meters/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<Meter>(res);
  },

  async deleteMeter(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/meters/${id}`, {
      method: 'DELETE'
    });
    return handleResponse<void>(res);
  },

  // Readings
  async getReadings(
    meterId?: number,
    categoryOrLimit?: MeterCategory | number,
    limitParam = 200
  ): Promise<Reading[]> {
    let category: MeterCategory | undefined;
    let limit = limitParam;

    if (typeof categoryOrLimit === 'number') {
      limit = categoryOrLimit;
    } else if (typeof categoryOrLimit === 'string') {
      category = categoryOrLimit;
    }

    const params = new URLSearchParams();
    if (meterId) params.append('meter_id', meterId.toString());
    if (category) params.append('category', category);
    params.append('limit', limit.toString());
    const res = await fetch(`${API_BASE}/readings?${params.toString()}`);
    return handleResponse<Reading[]>(res);
  },

  async createReading(data: {
    meter_id: number;
    reading_value: number;
    reading_date: string;
    notes?: string;
    image_path?: string;
    client_ref?: string;
  }): Promise<Reading> {
    const res = await fetch(`${API_BASE}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<Reading>(res);
  },

  async uploadAndCreateReading(formData: FormData): Promise<Reading> {
    const res = await fetch(`${API_BASE}/readings/upload-and-create`, {
      method: 'POST',
      body: formData
    });
    return handleResponse<Reading>(res);
  },

  async updateReading(id: number, data: { reading_value?: number; reading_date?: string; notes?: string }): Promise<Reading> {
    const res = await fetch(`${API_BASE}/readings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<Reading>(res);
  },

  async deleteReading(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/readings/${id}`, {
      method: 'DELETE'
    });
    return handleResponse<void>(res);
  },

  // Contracts
  async getContracts(): Promise<Contract[]> {
    const res = await fetch(`${API_BASE}/contracts`);
    return handleResponse<Contract[]>(res);
  },

  async upsertContract(data: {
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
    warmwater_source?: string;
    heating_start_month?: number;
    heating_end_month?: number;
  }): Promise<Contract> {
    const res = await fetch(`${API_BASE}/contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<Contract>(res);
  },

  async updateContract(category: MeterCategory, data: Partial<Contract>): Promise<Contract> {
    const res = await fetch(`${API_BASE}/contracts/${category}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<Contract>(res);
  },

  // AI Settings & Scanning
  async getAISettings(): Promise<AISetting> {
    const res = await fetch(`${API_BASE}/ai/settings`);
    return handleResponse<AISetting>(res);
  },

  async updateAISettings(data: {
    base_url: string;
    api_key: string;
    selected_model: string;
  }): Promise<AISetting> {
    const res = await fetch(`${API_BASE}/ai/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<AISetting>(res);
  },

  async fetchAIModels(): Promise<AIModelItem[]> {
    const res = await fetch(`${API_BASE}/ai/models`);
    return handleResponse<AIModelItem[]>(res);
  },

  async scanMeterImage(imageFile: File, modelOverride?: string): Promise<AIScanResult> {
    const formData = new FormData();
    formData.append('file', imageFile);
    if (modelOverride) {
      formData.append('model_override', modelOverride);
    }
    const res = await fetch(`${API_BASE}/ai/scan`, {
      method: 'POST',
      body: formData
    });
    return handleResponse<AIScanResult>(res);
  },

  async scanContractImages(files: File[], modelOverride?: string): Promise<AIContractScanResult> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    if (modelOverride) {
      formData.append('model_override', modelOverride);
    }
    const res = await fetch(`${API_BASE}/ai/scan-contract`, {
      method: 'POST',
      body: formData
    });
    return handleResponse<AIContractScanResult>(res);
  },

  // Analytics & Dashboard
  async getDashboardAnalytics(
    timeframe: '30d' | '90d' | 'year' | 'custom' = '30d',
    granularity: 'day' | 'week' | 'month' = 'day',
    startDate?: string,
    endDate?: string
  ): Promise<DashboardData> {
    let url = `${API_BASE}/analytics/dashboard?timeframe=${timeframe}&granularity=${granularity}`;
    if (timeframe === 'custom' && startDate && endDate) {
      url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const res = await fetch(url);
    return handleResponse<DashboardData>(res);
  },

  async getExportData(): Promise<ExportDataResponse> {
    const res = await fetch(`${API_BASE}/analytics/export`);
    return handleResponse<ExportDataResponse>(res);
  }
};

const contractPlanApi = {
  async list(category: MeterCategory): Promise<ContractListResponse> {
    const res = await fetch(`${API_BASE}/contracts/${category}/list`);
    return handleResponse<ContractListResponse>(res);
  },

  async preview(category: MeterCategory, startDate: string): Promise<{ message: string; warnings: string[] }> {
    const params = new URLSearchParams({ category, start_date: startDate });
    const res = await fetch(`${API_BASE}/contracts/preview?${params.toString()}`);
    return handleResponse<{ message: string; warnings: string[] }>(res);
  },

  async plan(data: {
    category: MeterCategory;
    provider_name?: string | null;
    tariff_name?: string | null;
    start_date: string;
    end_date?: string | null;
    base_fee_monthly: number;
    unit_price: number;
    monthly_payment: number;
    bonus_one_time?: number;
    bonus_notes?: string | null;
    warmwater_source?: string;
    heating_start_month?: number;
    heating_end_month?: number;
    close_predecessor?: boolean;
    confirm_backdate?: boolean;
  }): Promise<ContractPlanResult> {
    const res = await fetch(`${API_BASE}/contracts/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<ContractPlanResult>(res);
  },

  async priceChange(data: {
    contract_id: number;
    valid_from: string;
    unit_price?: number;
    base_fee_monthly?: number;
    monthly_payment?: number;
    confirm_backdate?: boolean;
  }): Promise<ContractPlanResult> {
    const res = await fetch(`${API_BASE}/contracts/price-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse<ContractPlanResult>(res);
  },

  async cancelContract(contractId: number): Promise<ContractPlanResult> {
    const res = await fetch(`${API_BASE}/contracts/${contractId}`, { method: 'DELETE' });
    return handleResponse<ContractPlanResult>(res);
  },

  async cancelPrice(priceId: number): Promise<ContractPlanResult> {
    const res = await fetch(`${API_BASE}/contracts/price/${priceId}`, { method: 'DELETE' });
    return handleResponse<ContractPlanResult>(res);
  }
};

export const contractApi = contractPlanApi;

export async function getCostBreakdown(
  category: MeterCategory,
  startDate: string,
  endDate: string
): Promise<CostBreakdown> {
  const params = new URLSearchParams({ category, start_date: startDate, end_date: endDate });
  const res = await fetch(`${API_BASE}/analytics/breakdown?${params.toString()}`);
  return handleResponse<CostBreakdown>(res);
}

export type { ContractDetail };
