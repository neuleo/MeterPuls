import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import {
  Calendar,
  Filter,
  BarChart3,
  TrendingUp,
  Info,
  RefreshCw,
  Sparkles,
  Zap,
  Flame,
  Droplets,
  AlertCircle
} from 'lucide-react';
import { DashboardData, MeterCategory } from '../types';
import { api } from '../api';
import { StatCard } from './StatCard';
import { formatCurrency, formatNumber } from '../utils/formatters';

interface DashboardProps {
  onOpenScan: () => void;
  onSelectCategory: (category: MeterCategory) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenScan, onSelectCategory }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Persistent settings from localStorage
  const [timeframe, setTimeframe] = useState<'30d' | '90d' | 'year' | 'custom'>(() => {
    const saved = localStorage.getItem('meterpulse_timeframe');
    if (saved === '30d' || saved === '90d' || saved === 'year' || saved === 'custom') {
      return saved;
    }
    return '30d';
  });

  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>(() => {
    const saved = localStorage.getItem('meterpulse_granularity');
    if (saved === 'day' || saved === 'week' || saved === 'month') {
      return saved;
    }
    return 'day';
  });

  const [chartCategory, setChartCategory] = useState<'all' | MeterCategory>(() => {
    const saved = localStorage.getItem('meterpulse_chart_category');
    if (saved === 'all' || saved === 'electricity' || saved === 'gas' || saved === 'water') {
      return saved as 'all' | MeterCategory;
    }
    return 'all';
  });

  const [customStart, setCustomStart] = useState<string>(() => {
    return localStorage.getItem('meterpulse_custom_start') || '';
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return localStorage.getItem('meterpulse_custom_end') || '';
  });

  // Timeframe change handler with automatic granularity mapping
  const handleTimeframeChange = (newTf: '30d' | '90d' | 'year' | 'custom') => {
    setTimeframe(newTf);
    localStorage.setItem('meterpulse_timeframe', newTf);

    let newGran: 'day' | 'week' | 'month' = granularity;
    if (newTf === '30d') {
      newGran = 'day';
    } else if (newTf === '90d') {
      newGran = 'week';
    } else if (newTf === 'year') {
      newGran = 'month';
    }
    setGranularity(newGran);
    localStorage.setItem('meterpulse_granularity', newGran);
  };

  const handleGranularityChange = (newGran: 'day' | 'week' | 'month') => {
    setGranularity(newGran);
    localStorage.setItem('meterpulse_granularity', newGran);
  };

  const handleChartCategoryChange = (newCat: 'all' | MeterCategory) => {
    setChartCategory(newCat);
    localStorage.setItem('meterpulse_chart_category', newCat);
  };

  useEffect(() => {
    if (customStart) localStorage.setItem('meterpulse_custom_start', customStart);
    else localStorage.removeItem('meterpulse_custom_start');
  }, [customStart]);

  useEffect(() => {
    if (customEnd) localStorage.setItem('meterpulse_custom_end', customEnd);
    else localStorage.removeItem('meterpulse_custom_end');
  }, [customEnd]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDashboardAnalytics(
        timeframe,
        granularity,
        customStart || undefined,
        customEnd || undefined
      );
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Dashboard-Daten');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeframe, granularity, customStart, customEnd]);

  // Clean formatting for chart X-axis
  const formatAxisTick = (val: string) => {
    if (!val) return '';
    // Monthly: YYYY-MM
    if (val.length === 7 && val.includes('-')) {
      const [year, month] = val.split('-');
      const mNum = parseInt(month, 10);
      const months = ['', 'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      return `${months[mNum]} '${year.slice(2)}`;
    }
    // Weekly: YYYY-Www
    if (val.includes('-W')) {
      const parts = val.split('-W');
      return parts.length === 2 ? `KW ${parts[1]}` : val;
    }
    // Daily: YYYY-MM-DD
    if (val.length === 10 && val.includes('-')) {
      const parts = val.split('-');
      if (parts.length === 3) return `${parts[2]}.${parts[1]}.`;
    }
    return val;
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      let formattedTitle = label;
      const isProjected = payload[0]?.payload?.is_projected;

      if (label && label.length === 7 && label.includes('-')) {
        const [year, month] = label.split('-');
        const mNum = parseInt(month, 10);
        const monthNames = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        formattedTitle = `${monthNames[mNum]} ${year}`;
      } else if (label && label.includes('-W')) {
        const [year, week] = label.split('-W');
        formattedTitle = `Kalenderwoche ${week}, ${year}`;
      } else if (label && label.length === 10 && label.includes('-')) {
        const [year, month, day] = label.split('-');
        formattedTitle = `${day}.${month}.${year}`;
      }

      return (
        <div className="glass-panel p-3 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 min-w-[150px]">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-1">
            <span className="font-semibold text-slate-200">{formattedTitle}</span>
            {isProjected && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Prognose
              </span>
            )}
          </div>
          {payload.map((item: any) => {
            let unit = 'kWh';
            if (item.dataKey === 'gas' || item.dataKey === 'water') unit = 'm³';
            let labelName = 'Strom';
            if (item.dataKey === 'gas') labelName = 'Gas';
            if (item.dataKey === 'water') labelName = 'Wasser';

            return (
              <div key={item.dataKey} className="flex items-center justify-between space-x-3">
                <span style={{ color: item.color }} className="font-medium">
                  {labelName}:
                </span>
                <span className="font-mono font-bold text-white">
                  {formatNumber(item.value, 2)} {unit}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 pb-20 md:pb-10">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Verbrauchs-Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Automatische lineare Interpolation & KI-gestützte Saisonalitäts-Prognosen
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Switcher */}
          <div className="flex items-center bg-slate-900/90 rounded-xl p-1 border border-slate-800 text-xs">
            <button
              onClick={() => handleTimeframeChange('30d')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                timeframe === '30d'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              30 Tage
            </button>
            <button
              onClick={() => handleTimeframeChange('90d')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                timeframe === '90d'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              90 Tage
            </button>
            <button
              onClick={() => handleTimeframeChange('year')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                timeframe === 'year'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Jahr 2026
            </button>
            <button
              onClick={() => handleTimeframeChange('custom')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                timeframe === 'custom'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Granularity Switcher */}
          <div className="flex items-center bg-slate-900/90 rounded-xl p-1 border border-slate-800 text-xs">
            <button
              onClick={() => handleGranularityChange('day')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                granularity === 'day'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tag
            </button>
            <button
              onClick={() => handleGranularityChange('week')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                granularity === 'week'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Woche
            </button>
            <button
              onClick={() => handleGranularityChange('month')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                granularity === 'month'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monat
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={loadData}
            title="Aktualisieren"
            className="p-2 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date Pickers */}
      {timeframe === 'custom' && (
        <div className="glass-card rounded-xl p-3 border border-slate-800 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Von:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Bis:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3 Main Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <StatCard
          category="electricity"
          summary={data?.summaries?.electricity}
          timeframe={timeframe}
          onClick={() => onSelectCategory('electricity')}
        />
        <StatCard
          category="gas"
          summary={data?.summaries?.gas}
          timeframe={timeframe}
          onClick={() => onSelectCategory('gas')}
        />
        <StatCard
          category="water"
          summary={data?.summaries?.water}
          timeframe={timeframe}
          onClick={() => onSelectCategory('water')}
        />
      </div>

      {/* Main Consumption Chart Section */}
      <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Verbrauchsverlauf</h2>
            <span className="text-xs text-slate-400">
              {granularity === 'month' ? '(Monatssummen & Saisonal-Prognosen)' : granularity === 'week' ? '(Wochensummen)' : '(Tageswerte interpoliert)'}
            </span>
          </div>

          {/* Category Tabs for Chart */}
          <div className="flex items-center space-x-1 bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
            <button
              onClick={() => handleChartCategoryChange('all')}
              className={`px-3 py-1 rounded-lg transition-all ${
                chartCategory === 'all'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Alle
            </button>
            <button
              onClick={() => handleChartCategoryChange('electricity')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-lg transition-all ${
                chartCategory === 'electricity'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Strom</span>
            </button>
            <button
              onClick={() => handleChartCategoryChange('gas')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-lg transition-all ${
                chartCategory === 'gas'
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3 h-3 text-orange-400" />
              <span>Gas</span>
            </button>
            <button
              onClick={() => handleChartCategoryChange('water')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-lg transition-all ${
                chartCategory === 'water'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Droplets className="w-3 h-3 text-sky-400" />
              <span>Wasser</span>
            </button>
          </div>
        </div>

        {/* Chart View */}
        <div className="h-72 sm:h-80 w-full pt-2">
          {data?.history && data.history.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorElec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorGas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatAxisTick}
                />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={customTooltip} />

                {(chartCategory === 'all' || chartCategory === 'electricity') && (
                  <Area
                    type="monotone"
                    dataKey="electricity"
                    name="Strom (kWh)"
                    stroke="#eab308"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorElec)"
                  />
                )}

                {(chartCategory === 'all' || chartCategory === 'gas') && (
                  <Area
                    type="monotone"
                    dataKey="gas"
                    name="Gas (m³)"
                    stroke="#f97316"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorGas)"
                  />
                )}

                {(chartCategory === 'all' || chartCategory === 'water') && (
                  <Area
                    type="monotone"
                    dataKey="water"
                    name="Wasser (m³)"
                    stroke="#0284c7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorWater)"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
              <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
              <span>Keine Verbrauchsdaten für den gewählten Zeitraum vorhanden</span>
            </div>
          )}
        </div>
      </div>

      {/* Gas Seasonality & Contract Projection Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gas Seasonality Card */}
        <div className="glass-card rounded-2xl p-5 border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-orange-400 mb-2">
              <Flame className="w-5 h-5" />
              <h3 className="font-semibold text-white">Spezial-Saisonmodell Gas</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Gasverbrauch folgt keinem linearen Verlauf: Im Winter (Jan/Dez) fallen je ~16% des Jahresbedarfs an,
              im Sommer (Juni-August) nur ~1,5% pro Monat (nur Warmwasser).
            </p>
            <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-400">
                <span>Norm-Verfahren:</span>
                <span className="text-white font-mono font-medium">BDEW / DIN 4710 HGT</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Heizperiode (Okt–Apr):</span>
                <span className="text-orange-300 font-mono font-medium">ca. 86% Jahresanteil</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Sommerbasis (Mai–Sep):</span>
                <span className="text-slate-300 font-mono font-medium">ca. 14% Jahresanteil</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
            <span>Verhindert unrealistische lineare Hochrechnungen im Sommer!</span>
          </div>
        </div>

        {/* Contract & Cost Summary Table */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white text-base">Tarif-, Kosten- & Saldo-Übersicht</h3>
              <p className="text-xs text-slate-400">Auswertung für gewählten Zeitraum und Gesamtjahr</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-medium border border-slate-700">
              {timeframe === '30d' ? '30 Tage' : timeframe === '90d' ? '90 Tage' : timeframe === 'year' ? 'Jahr 2026' : 'Custom'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Sparte</th>
                  <th className="pb-2 font-medium">Verbrauch (Zeitraum)</th>
                  <th className="pb-2 font-medium">Kosten (Zeitraum)</th>
                  <th className="pb-2 font-medium">Abschlag (Zeitraum)</th>
                  <th className="pb-2 font-medium">Saldo (Zeitraum)</th>
                  <th className="pb-2 font-medium">Prognose Endsaldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(['electricity', 'gas', 'water'] as MeterCategory[]).map((cat) => {
                  const s = data?.summaries?.[cat];
                  if (!s) return null;
                  const isPeriodRefund = (s.period_balance ?? s.balance_so_far) >= 0;
                  const isProjRefund = s.projected_balance >= 0;

                  return (
                    <tr key={cat} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 font-medium capitalize text-white flex items-center space-x-2">
                        {cat === 'electricity' && <Zap className="w-4 h-4 text-amber-400" />}
                        {cat === 'gas' && <Flame className="w-4 h-4 text-orange-400" />}
                        {cat === 'water' && <Droplets className="w-4 h-4 text-sky-400" />}
                        <span>{cat === 'electricity' ? 'Strom' : cat === 'gas' ? 'Gas' : 'Wasser'}</span>
                      </td>
                      <td className="py-3 font-mono text-slate-200 font-semibold">
                        {formatNumber(s.period_consumption ?? s.total_consumption, 1)} {s.unit}
                      </td>
                      <td className="py-3 font-medium text-slate-200">
                        {formatCurrency(s.period_cost ?? s.cost_so_far)}
                      </td>
                      <td className="py-3 text-slate-400">
                        {formatCurrency(s.period_paid ?? s.paid_so_far)}
                      </td>
                      <td className="py-3">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded ${
                            isPeriodRefund
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {isPeriodRefund ? '+' : ''}
                          {formatCurrency(s.period_balance ?? s.balance_so_far)}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`font-semibold ${
                            isProjRefund ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isProjRefund ? '+' : ''}
                          {formatCurrency(s.projected_balance)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
