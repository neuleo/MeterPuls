import React, { useState, useEffect } from 'react';
import {
  Zap,
  Flame,
  Droplets,
  ArrowLeft,
  Calendar,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Calculator,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Info,
  Gauge,
  FileText,
  Leaf,
  Clock,
  Coins,
  Layers,
  Camera,
  RefreshCw,
  Sliders,
  ChevronRight,
  Sun
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { Meter, MeterCategory, Contract, DashboardData, CategorySummary, TimeSeriesPoint } from '../types';
import { api } from '../api';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  getCategoryColor,
  getCategoryLabel
} from '../utils/formatters';

interface CategoryDetailDashboardProps {
  category: MeterCategory;
  onBack: () => void;
  onSelectCategory: (cat: MeterCategory) => void;
  onOpenScan: () => void;
  onOpenHistory: (meter: Meter) => void;
  onNavigateToContracts: () => void;
}

export const CategoryDetailDashboard: React.FC<CategoryDetailDashboardProps> = ({
  category,
  onBack,
  onSelectCategory,
  onOpenScan,
  onOpenHistory,
  onNavigateToContracts
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [contracts, setContracts] = useState<Record<MeterCategory, Contract | null>>({
    electricity: null,
    gas: null,
    water: null
  });
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timeframe and granularity filters
  const [timeframe, setTimeframe] = useState<'30d' | '90d' | 'year' | 'custom'>('year');
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Simulator state: hypothetical savings percentage
  const [simSavingsPct, setSimSavingsPct] = useState<number>(10);

  // Gas heating season state & settings
  const [savingGasConfig, setSavingGasConfig] = useState(false);
  const [showHeatingSettings, setShowHeatingSettings] = useState(false);
  const [editWarmwaterSource, setEditWarmwaterSource] = useState<'electricity' | 'gas'>('electricity');
  const [editHeatingStartMonth, setEditHeatingStartMonth] = useState<number>(10);
  const [editHeatingEndMonth, setEditHeatingEndMonth] = useState<number>(4);

  useEffect(() => {
    loadAllData();
  }, [category, timeframe, granularity]);

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, contractsRes, metersRes] = await Promise.all([
        api.getDashboardAnalytics(timeframe, granularity, customStart, customEnd),
        api.getContracts(),
        api.getMeters()
      ]);

      setData(analyticsRes);

      const cMap: any = { electricity: null, gas: null, water: null };
      if (contractsRes) {
        contractsRes.forEach((c) => {
          cMap[c.category] = c;
        });
      }
      setContracts(cMap);

      setMeters(metersRes.filter((m) => m.category === category));
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Detaildaten.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGasConfig = async (wwSource: 'electricity' | 'gas', startM?: number, endM?: number) => {
    setSavingGasConfig(true);
    try {
      await api.updateContract('gas', {
        warmwater_source: wwSource,
        heating_start_month: startM ?? editHeatingStartMonth,
        heating_end_month: endM ?? editHeatingEndMonth
      });
      await loadAllData();
      setShowHeatingSettings(false);
    } catch (err: any) {
      alert('Fehler beim Speichern der Heizkonfiguration: ' + err.message);
    } finally {
      setSavingGasConfig(false);
    }
  };

  const colors = getCategoryColor(category);
  const label = getCategoryLabel(category);
  const summary: CategorySummary | undefined = data?.summaries?.[category];
  const contract: Contract | null = contracts[category];

  // Specific properties
  const isWater = category === 'water';
  const unit = category === 'electricity' ? 'kWh' : 'm³';
  const priceUnit = category === 'electricity' ? '€ / kWh' : '€ / m³';

  // Check if monthly payments exist (For water, user typically doesn't pay an installment!)
  const hasMonthlyPayment = !isWater && (contract?.monthly_payment ?? summary?.monthly_payment ?? 0) > 0;
  const monthlyPayment = contract?.monthly_payment ?? summary?.monthly_payment ?? 0;
  const unitPrice = contract?.unit_price ?? summary?.unit_price ?? 0;
  const baseFeeMonthly = contract?.base_fee_monthly ?? summary?.base_fee_monthly ?? 0;
  const bonusOneTime = contract?.bonus_one_time ?? summary?.bonus_one_time ?? 0;

  // Key figures
  const totalConsumptionSoFar = summary?.total_consumption ?? 0;
  const costSoFar = summary?.cost_so_far ?? 0;
  const paidSoFar = summary?.paid_so_far ?? 0;
  const balanceSoFar = summary?.balance_so_far ?? 0;
  const isRefundSoFar = balanceSoFar >= 0;

  const projectedConsumption = summary?.projected_consumption ?? 0;
  const projectedTotalCost = summary?.projected_total_cost ?? 0;
  const projectedTotalPaid = summary?.projected_total_paid ?? 0;
  const projectedBalance = summary?.projected_balance ?? 0;
  const isProjectedRefund = projectedBalance >= 0;

  // Days elapsed in year or contract
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const daysElapsed = Math.max(1, Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
  const daysInYear = ((now.getFullYear() % 4 === 0 && now.getFullYear() % 100 !== 0) || now.getFullYear() % 400 === 0) ? 366 : 365;
  const yearProgressPct = Math.min(100, Math.round((daysElapsed / daysInYear) * 100));

  // Daily and monthly averages
  const dailyAvgConsumption = totalConsumptionSoFar > 0 && daysElapsed > 0 ? (totalConsumptionSoFar / daysElapsed) : 0;
  const dailyAvgCost = dailyAvgConsumption * unitPrice + (baseFeeMonthly / 30);
  const monthlyAvgConsumption = dailyAvgConsumption * 30.4;
  const monthlyAvgCost = monthlyAvgConsumption * unitPrice + baseFeeMonthly;

  // Optimal installment (Empfohlener Abschlag, um bei 0 € herauszukommen)
  const optimalInstallment = projectedTotalCost > 0 ? Math.round((projectedTotalCost / 12) * 10) / 10 : 0;

  // Environmental impact (CO2-Emissionen)
  // Strom: ~0.380 kg/kWh (dt. Strommix), Gas: ~0.200 kg/kWh (1 m³ Gas ≈ 10 kWh -> ~2.0 kg/m³), Wasser: ~0.35 kg/m³
  const co2Factor = category === 'electricity' ? 0.38 : category === 'gas' ? 2.0 : 0.35;
  const co2ProducedKg = Math.round(totalConsumptionSoFar * co2Factor);
  const co2ProjectedKg = Math.round(projectedConsumption * co2Factor);

  // Simulation calculation
  const simSavedUnits = Math.round(projectedConsumption * (simSavingsPct / 100));
  const simSavedEuros = Math.round(simSavedUnits * unitPrice);

  // Filter history points specifically for this category
  const historyData = (data?.history || []).map((pt) => {
    const val = category === 'electricity' ? pt.electricity : category === 'gas' ? pt.gas : pt.water;
    return {
      date: pt.date,
      consumption: val ?? 0,
      is_projected: pt.is_projected ?? false,
      cost: val ? Math.round(val * unitPrice * 100) / 100 : 0
    };
  });

  const getCategoryIcon = (cat: MeterCategory, className = 'w-5 h-5') => {
    switch (cat) {
      case 'electricity':
        return <Zap className={`${className} text-amber-400`} />;
      case 'gas':
        return <Flame className={`${className} text-orange-400`} />;
      case 'water':
        return <Droplets className={`${className} text-sky-400`} />;
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-12 max-w-7xl mx-auto">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors flex items-center space-x-1.5 text-xs font-medium"
            title="Zurück zum Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Gesamtübersicht</span>
          </button>

          <div className="flex items-center space-x-2.5">
            <div className={`p-2.5 rounded-xl ${colors.bg} border ${colors.border}`}>
              {getCategoryIcon(category, 'w-6 h-6')}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  {label}-Detailanalyse
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                  {unit}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Verbrauchshistorie, Zähler-Messstellen und exakte Kostenprognosen
              </p>
            </div>
          </div>
        </div>

        {/* Category Switcher Tabs & Scan Trigger */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sparte umschalten */}
          <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
            {(['electricity', 'gas', 'water'] as MeterCategory[]).map((cat) => {
              const isCurrent = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                    isCurrent
                      ? cat === 'electricity'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : cat === 'gas'
                        ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {getCategoryIcon(cat, 'w-3.5 h-3.5')}
                  <span>{getCategoryLabel(cat)}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenScan}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold shadow-sm transition-all active:scale-98"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Zähler scannen</span>
          </button>
        </div>
      </div>

      {/* Contract & Provider Info Bar */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">Tarif:</span>
            <span className="text-xs font-bold text-white">
              {contract?.tariff_name || `${label}-Standardtarif`}
            </span>
          </div>

          {contract?.provider_name && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {contract.provider_name}
            </span>
          )}

          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <span>Arbeitspreis:</span>
            <span className="font-mono font-bold text-emerald-400">
              {formatNumber(unitPrice, 4)} {priceUnit}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <span>Grundgebühr:</span>
            <span className="font-mono font-medium text-slate-200">
              {formatCurrency(baseFeeMonthly)} / Mt.
            </span>
          </div>

          {hasMonthlyPayment && (
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span>Abschlag:</span>
              <span className="font-mono font-bold text-amber-400">
                {formatCurrency(monthlyPayment)} / Mt.
              </span>
            </div>
          )}

          {bonusOneTime > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              🎁 Bonus: -{formatCurrency(bonusOneTime)} (1. Jahr)
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onNavigateToContracts}
          className="text-xs text-slate-400 hover:text-emerald-400 flex items-center space-x-1 transition-colors self-start lg:self-auto"
        >
          <span>Tarifdaten anpassen</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress of the billing year */}
      <div className="glass-card rounded-xl p-3 border border-slate-800/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2 text-slate-300">
          <Calendar className="w-4 h-4 text-emerald-400" />
          <span>Abrechnungsjahr 2026:</span>
          <span className="font-mono font-semibold text-white">Tag {daysElapsed} von {daysInYear}</span>
          <span className="text-slate-500">({yearProgressPct}% vergangen)</span>
        </div>
        <div className="w-full sm:w-48 bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${yearProgressPct}%` }}
          />
        </div>
      </div>

      {/* 4 Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Bisheriger Verbrauch */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Bisheriger Verbrauch</span>
            <Gauge className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
                {formatNumber(totalConsumptionSoFar, 1)}
              </span>
              <span className="text-sm font-semibold text-slate-400">{unit}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Gesamter gemessener Verbrauch im Abrechnungsjahr
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Aufgelaufene Kosten:</span>
            <span className="font-mono font-bold text-white">{formatCurrency(costSoFar)}</span>
          </div>
        </div>

        {/* Card 2: Durchschnittswerte */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Durchschnittswerte</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="space-y-2">
            <div>
              <span className="text-xs text-slate-400">Tagesdurchschnitt:</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-bold font-mono text-white">
                  {formatNumber(dailyAvgConsumption, 1)}
                </span>
                <span className="text-xs text-slate-400">{unit} / Tag</span>
                <span className="text-xs text-slate-500">({formatCurrency(dailyAvgCost)}/Tag)</span>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-400">Monatsdurchschnitt:</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-base font-bold font-mono text-slate-200">
                  ~{formatNumber(monthlyAvgConsumption, 0)}
                </span>
                <span className="text-xs text-slate-400">{unit} / Monat</span>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
            <span>Ø Kosten / Monat: </span>
            <span className="font-mono font-semibold text-slate-200">{formatCurrency(monthlyAvgCost)}</span>
          </div>
        </div>

        {/* Card 3: Prognose Vertragsende */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Prognose Vertragsende</span>
            </span>
            {summary?.seasonal_applied && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 font-medium">
                BDEW
              </span>
            )}
          </div>
          <div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-300">
                ~{formatNumber(projectedConsumption, 0)}
              </span>
              <span className="text-sm font-semibold text-slate-400">{unit}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Vorhergesagter Jahresverbrauch
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Erwartete Gesamtkosten:</span>
            <span className="font-mono font-bold text-white">{formatCurrency(projectedTotalCost)}</span>
          </div>
        </div>

        {/* Card 4: Finanzstatus & Saldo (STROM/GAS vs. WASSER SPECIAL) */}
        {hasMonthlyPayment ? (
          // Case A: Regular utility with monthly installments (Strom / Gas)
          <div
            className={`glass-card rounded-2xl p-5 border flex flex-col justify-between ${
              isProjectedRefund
                ? 'border-emerald-500/40 bg-emerald-950/10'
                : 'border-rose-500/40 bg-rose-950/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-300">Erwarteter Saldo</span>
              {isProjectedRefund ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 flex items-center">
                  <TrendingUp className="w-3 h-3 mr-1" /> Guthaben
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 flex items-center">
                  <TrendingDown className="w-3 h-3 mr-1" /> Nachzahlung
                </span>
              )}
            </div>

            <div>
              <div
                className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                  isProjectedRefund ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isProjectedRefund ? '+' : ''}
                {formatCurrency(projectedBalance)}
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {isProjectedRefund
                  ? 'Voraussichtliche Rückzahlung bei der Jahresabrechnung'
                  : 'Voraussichtliche Nachzahlung bei der Jahresabrechnung'}
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Gezahlte Abschläge:</span>
                <span className="font-mono text-white">{formatCurrency(projectedTotalPaid)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Empfohlener Abschlag:</span>
                <span className="font-mono font-bold text-amber-300">{formatCurrency(optimalInstallment)} / Mt.</span>
              </div>
            </div>
          </div>
        ) : (
          // Case B: Water / No monthly installment (Explicit user requirement!)
          <div className="glass-card rounded-2xl p-5 border border-sky-500/40 bg-sky-950/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-sky-300">Wasserkosten-Rechner</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/20 text-sky-300">
                Ohne Monatsabschlag
              </span>
            </div>

            <div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-sky-300">
                {formatCurrency(projectedTotalCost)}
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Erwartete Gesamtwasserkosten für die nächste Nebenkostenabrechnung
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span>Bisher aufgelaufen:</span>
                <span className="font-mono font-bold text-white">{formatCurrency(costSoFar)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tageskosten:</span>
                <span className="font-mono text-slate-200">~{formatCurrency(dailyAvgCost)} / Tag</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gas Heating Season Learning & Adaptive Window Card */}
      {category === 'gas' && (
        <div className="glass-card rounded-2xl p-5 border border-orange-500/30 bg-orange-950/10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-bold text-white">
                    Intelligente Heizperioden-Erkennung & Lernmodell
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/40">
                    Adaptiv
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Erkennt Beginn & Ende der Heizung, filtert heizfreie Sommermonate heraus und berechnet exakte Prognosen
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShowHeatingSettings(!showHeatingSettings)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center space-x-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-orange-400" />
                <span>{showHeatingSettings ? 'Einstellungen schließen' : 'Heizprofil anpassen'}</span>
              </button>
            </div>
          </div>

          {/* Quick Warm Water Switch / Notice */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white flex items-center space-x-1.5">
                  <span>Warmwasser-Quelle:</span>
                  <span className="text-emerald-400 font-bold">
                    {summary?.warmwater_source === 'electricity' ? '⚡ Elektrisch (Durchlauferhitzer / Boiler)' : '🔥 Gaszentralheizung'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {summary?.warmwater_source === 'electricity'
                    ? '0 m³ Gasverbrauch im Sommer. Gas wird ausschließlich für Raumheizung im Winter genutzt!'
                    : 'Kontinuierliche Warmwasser-Grundlast (~0,35 m³/Tag) ganzjährig aktiv.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                disabled={savingGasConfig}
                onClick={() => handleSaveGasConfig(summary?.warmwater_source === 'electricity' ? 'gas' : 'electricity')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all active:scale-98 disabled:opacity-50"
              >
                {summary?.warmwater_source === 'electricity' ? 'Auf Gas-Warmwasser umschalten' : 'Auf Strom-Warmwasser (0 m³ Sommer) umschalten'}
              </button>
            </div>
          </div>

          {/* Key Indicators Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Status */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                <span>Aktueller Status</span>
                <Clock className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="flex items-center space-x-1.5">
                {summary?.heating_status === 'active' ? (
                  <span className="inline-flex items-center text-xs font-bold text-orange-400">
                    <Flame className="w-3.5 h-3.5 mr-1.5 text-orange-400 animate-pulse" />
                    Heizung aktiv
                  </span>
                ) : summary?.heating_status === 'transition' ? (
                  <span className="inline-flex items-center text-xs font-bold text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400 mr-1.5" />
                    Übergangszeit (Heizung AUS)
                  </span>
                ) : (
                  <span className="inline-flex items-center text-xs font-bold text-sky-400">
                    <Sun className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
                    Sommerpause (Heizung AUS)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {summary?.heating_status === 'active'
                  ? `Ø ~${summary.heating_active_daily ?? '3.5'} m³ / aktiver Heiztag`
                  : 'Aktueller Gasverbrauch: 0,00 m³ / Tag'}
              </p>
            </div>

            {/* Heizbeginn */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                <span>Heizbeginn (Heizung AN)</span>
                <Flame className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div className="text-sm font-extrabold text-white">
                {summary?.heating_start_learned || 'Mitte Oktober'}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Gelernt anhand des ersten Anstiegs im Herbst
              </p>
            </div>

            {/* Heizende */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                <span>Heizende (Heizung AUS)</span>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-sm font-extrabold text-white">
                {summary?.heating_end_learned || 'Mitte April'}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Gelernt anhand des Rückgangs auf 0 m³
              </p>
            </div>

            {/* Heizfreie Sommerpause */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                <span>Sommerpause (0 m³)</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-sm font-extrabold text-emerald-400">
                Mai bis September
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {summary?.heating_days_in_year || 180} Heiztage im Jahr
              </p>
            </div>
          </div>

          {/* Gas Consumption Distribution Bar */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Verbrauchsanteile im Abrechnungsjahr:</span>
              <div className="flex items-center space-x-3 text-[11px]">
                <span className="text-orange-400 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-500 mr-1" />
                  Raumheizung: {summary?.heating_share_pct ?? 100}%
                </span>
                <span className="text-sky-400 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 mr-1" />
                  Warmwasser: {summary?.warmwater_share_pct ?? 0}% ({summary?.warmwater_source === 'electricity' ? 'über Strom' : 'über Gas'})
                </span>
              </div>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden flex">
              <div
                className="bg-orange-500 h-full transition-all duration-500"
                style={{ width: `${summary?.heating_share_pct ?? 100}%` }}
                title="Raumheizung"
              />
              <div
                className="bg-sky-500 h-full transition-all duration-500"
                style={{ width: `${summary?.warmwater_share_pct ?? 0}%` }}
                title="Warmwasser"
              />
            </div>
          </div>

          {/* Settings Drawer (expandable) */}
          {showHeatingSettings && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-orange-400" />
                <span>Heizperioden-Monate manuell justieren</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">
                    Heizbeginn (Heizung wird eingeschaltet):
                  </label>
                  <select
                    value={editHeatingStartMonth}
                    onChange={(e) => setEditHeatingStartMonth(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  >
                    <option value={9}>September (früh)</option>
                    <option value={10}>Oktober (Standard)</option>
                    <option value={11}>November (spät)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">
                    Heizende (Heizung wird abgeschaltet):
                  </label>
                  <select
                    value={editHeatingEndMonth}
                    onChange={(e) => setEditHeatingEndMonth(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  >
                    <option value={3}>März (früh)</option>
                    <option value={4}>April (Standard)</option>
                    <option value={5}>Mai (spät)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowHeatingSettings(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-400 hover:text-white"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={savingGasConfig}
                  onClick={() => handleSaveGasConfig(editWarmwaterSource, editHeatingStartMonth, editHeatingEndMonth)}
                  className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-xs font-semibold text-white shadow-sm"
                >
                  {savingGasConfig ? 'Speichern...' : 'Heizmonate speichern'}
                </button>
              </div>
            </div>
          )}

          {/* Explanation Box */}
          <div className="p-3 rounded-xl bg-orange-950/20 border border-orange-500/20 flex items-start space-x-2.5 text-xs text-slate-300">
            <Sparkles className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-orange-300 block">
                Wie lernt das System dein persönliches Heizverhalten?
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {summary?.learned_explanation ||
                  'Das System analysiert die Abstände und Verbräuche deiner Zählerablesungen. Da Warmwasser über Strom läuft, verbraucht die Gasheizung im Sommer 0 m³. Sobald im Herbst der erste Verbrauch registriert wird, lernt die KI automatisch den Startzeitpunkt (Heizung AN). Im Frühjahr erkennt sie anhand stagnierender Zählerstände das Abschalten (Heizung AUS). Die Jahresendprognose berücksichtigt dadurch nur echte Heiztage und rechnet im Sommer keinen fiktiven Verbrauch an.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Electricity Warm Water Notice Card */}
      {category === 'electricity' && (
        <div className="glass-card rounded-2xl p-4 border border-amber-500/30 bg-amber-950/10 flex items-start space-x-3 text-xs text-slate-300">
          <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex-shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <div className="font-semibold text-white flex items-center space-x-2">
              <span>Warmwasser über Strom (Durchlauferhitzer / Boiler)</span>
              <span className="px-2 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-medium">
                Gekoppelt
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Deine Warmwasserbereitung läuft über Strom. Dies erklärt einen signifikanten Teil deines ganzjährigen Strom-Sockelverbrauchs, spart dir dafür im Sommer 100% des Gasverbrauchs (0 m³ Gas im Sommer).
            </p>
          </div>
        </div>
      )}

      {/* Main Consumption Chart Section */}
      <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Exklusiver Verbrauchsverlauf für {label}</span>
            </h2>
            <p className="text-xs text-slate-400">
              Historische Messwerte vs. hochgerechnete Prognose bis zum Jahresende
            </p>
          </div>

          {/* Granularity Switcher */}
          <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setGranularity('day')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                granularity === 'day' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tag
            </button>
            <button
              onClick={() => setGranularity('week')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                granularity === 'week' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Woche
            </button>
            <button
              onClick={() => setGranularity('month')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                granularity === 'month' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monat
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="h-72 w-full pt-2">
          {historyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="detailGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.primary} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={colors.primary} stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => {
                    if (granularity === 'month') return val.slice(0, 7);
                    return val.slice(5);
                  }}
                />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="glass-panel p-3 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1 min-w-[140px]">
                          <div className="font-semibold text-slate-200 border-b border-slate-700/60 pb-1 flex justify-between items-center">
                            <span>{item.date}</span>
                            {item.is_projected && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                                Prognose
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between items-center text-slate-300">
                            <span>Verbrauch:</span>
                            <span className="font-mono font-bold text-white">
                              {formatNumber(item.consumption, 2)} {unit}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-slate-400 text-[11px]">
                            <span>Kosten:</span>
                            <span className="font-mono text-emerald-400">
                              {formatCurrency(item.cost)}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="consumption"
                  fill="url(#detailGradient)"
                  radius={[4, 4, 0, 0]}
                  name={label}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              Keine Verbrauchsdaten für diesen Zeitraum verfügbar.
            </div>
          )}
        </div>
      </div>

      {/* Two Columns: Left = Meter Breakdown (Multi-Meter Support), Right = Interactive Cost Simulator & Eco Impact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Zähler & Messstellen dieser Sparte */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white text-base">
                Zähler in dieser Sparte ({meters.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={onOpenScan}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
            >
              <span>+ Zählerstand erfassen</span>
            </button>
          </div>

          <p className="text-xs text-slate-400">
            {isWater && meters.length > 1
              ? 'Mehrere Wasserzähler erkannt (z.B. Kaltwasser, Warmwasser, Garten). Die KI ordnet Fotos anhand der Zählernummer automatisch zu.'
              : 'Verwalten Sie die einzelnen Messgeräte und rufen Sie die Ablesehistorie ab.'}
          </p>

          <div className="space-y-3">
            {meters.map((m) => {
              // Percentage of consumption if available
              return (
                <div
                  key={m.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-white">{m.name}</span>
                      {m.meter_number && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          Nr. {m.meter_number}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center space-x-3">
                      {m.location && <span>Ort: {m.location}</span>}
                      <span>Ablesungen: {m.reading_count}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Letzter Stand:</span>
                      <span className="font-mono font-bold text-white text-sm">
                        {m.latest_reading !== null && m.latest_reading !== undefined
                          ? `${formatNumber(m.latest_reading, 2)} ${m.unit}`
                          : 'Kein Eintrag'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenHistory(m)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition-colors border border-slate-700"
                    >
                      Historie
                    </button>
                  </div>
                </div>
              );
            })}

            {meters.length === 0 && (
              <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                Kein Zähler für {label} angelegt.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Spar-Simulator & Umweltbilanz */}
        <div className="space-y-6">
          {/* Simulator Card */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-white text-base">
                Sparpotenzial-Simulator
              </h3>
            </div>

            <p className="text-xs text-slate-400">
              Wie viel Geld und Einheiten sparen Sie, wenn Sie Ihren Verbrauch senken?
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Angestrebte Einsparung:</span>
                <span className="font-bold font-mono text-amber-400 text-sm">
                  {simSavingsPct} %
                </span>
              </div>

              <input
                type="range"
                min="1"
                max="35"
                value={simSavingsPct}
                onChange={(e) => setSimSavingsPct(Number(e.target.value))}
                className="w-full accent-amber-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
              />

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-2 gap-3 text-center">
                <div>
                  <span className="text-[11px] text-slate-400 block">Mögliche Ersparnis:</span>
                  <span className="font-mono font-bold text-emerald-400 text-base">
                    ~{formatCurrency(simSavedEuros)} / Jahr
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Eingesparte Einheiten:</span>
                  <span className="font-mono font-bold text-white text-base">
                    ~{simSavedUnits} {unit}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Environmental / CO2 Impact */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-3">
            <div className="flex items-center space-x-2 text-emerald-400">
              <Leaf className="w-5 h-5" />
              <h3 className="font-bold text-white text-base">
                Umweltbilanz & CO₂-Ausstoß
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Bisher emittiert:</span>
                <span className="text-lg font-bold font-mono text-white">
                  {co2ProducedKg} kg CO₂
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Prognose Gesamtjahr:</span>
                <span className="text-lg font-bold font-mono text-slate-300">
                  ~{co2ProjectedKg} kg CO₂
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              {category === 'electricity' && 'Berechnet auf Basis des durchschnittlichen deutschen Strommixes (~380 g CO₂/kWh).'}
              {category === 'gas' && 'Berechnet auf Basis des Erdgas-Brennwertes (~200 g CO₂/kWh).'}
              {category === 'water' && 'Berechnet auf Basis von Trinkwasseraufbereitung und Kanalisation (~350 g CO₂/m³).'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
