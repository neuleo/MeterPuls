import React from 'react';
import { Zap, Flame, Droplets, TrendingUp, TrendingDown, Sparkles, Gift } from 'lucide-react';
import { CategorySummary, MeterCategory } from '../types';
import { formatCurrency, formatNumber, getCategoryColor, getCategoryLabel } from '../utils/formatters';

interface StatCardProps {
  category: MeterCategory;
  summary?: CategorySummary;
  timeframe?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({ category, summary, timeframe, onClick }) => {
  const colors = getCategoryColor(category);
  const label = getCategoryLabel(category);

  const getIcon = () => {
    switch (category) {
      case 'electricity':
        return <Zap className="w-5 h-5 text-amber-400" />;
      case 'gas':
        return <Flame className="w-5 h-5 text-orange-400" />;
      case 'water':
        return <Droplets className="w-5 h-5 text-sky-400" />;
    }
  };

  const getTimeframeLabel = (tf?: string) => {
    switch (tf) {
      case '30d': return '30 Tage';
      case '90d': return '90 Tage';
      case 'year': return 'Jahr 2026';
      case 'custom': return 'Zeitraum';
      default: return 'Zeitraum';
    }
  };

  if (!summary) {
    return (
      <div className="glass-card rounded-2xl p-5 animate-pulse flex flex-col justify-between h-56">
        <div className="flex items-center justify-between">
          <div className="h-6 w-24 bg-slate-800 rounded"></div>
          <div className="h-8 w-8 bg-slate-800 rounded-full"></div>
        </div>
        <div className="h-10 w-32 bg-slate-800 rounded"></div>
        <div className="h-6 w-full bg-slate-800 rounded"></div>
      </div>
    );
  }

  const isPeriodRefund = (summary.period_balance ?? summary.balance_so_far) >= 0;
  const isProjRefund = summary.projected_balance >= 0;
  const activeTimeframe = timeframe || summary.timeframe || '30d';

  return (
    <div
      onClick={onClick}
      className={`glass-card rounded-2xl p-5 border ${colors.border} hover:border-slate-600 transition-all duration-300 relative overflow-hidden group cursor-pointer`}
    >
      {/* Subtle background glow */}
      <div
        className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: colors.primary }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2.5">
          <div className={`p-2 rounded-xl ${colors.bg} border ${colors.border}`}>
            {getIcon()}
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-base">{label}</h3>
            <span className="text-xs text-slate-400">
              {summary.meter_count} {summary.meter_count === 1 ? 'Zähler' : 'Zähler'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {summary.seasonal_applied && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
              <Sparkles className="w-3 h-3 mr-1" /> BDEW
            </span>
          )}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
            {getTimeframeLabel(activeTimeframe)}
          </span>
        </div>
      </div>

      {/* Main Consumption Value for the Selected Timeframe */}
      <div className="my-2">
        <div className="flex items-baseline space-x-1.5">
          <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">
            {formatNumber(summary.period_consumption ?? summary.total_consumption, 1)}
          </span>
          <span className="text-sm font-medium text-slate-400">{summary.unit}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
          <span>Kosten im Zeitraum:</span>
          <span className="font-medium text-slate-200">
            {formatCurrency(summary.period_cost ?? summary.cost_so_far)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-800/80 my-3" />

      {/* Period Cost / Balance */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">
          {category === 'water' && summary.monthly_payment === 0 ? 'Kosten im Zeitraum:' : 'Saldo im Zeitraum:'}
        </span>
        {category === 'water' && summary.monthly_payment === 0 ? (
          <span className="text-xs font-semibold font-mono text-white px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700">
            {formatCurrency(summary.period_cost ?? summary.cost_so_far)}
          </span>
        ) : (
          <div
            className={`flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${
              isPeriodRefund
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
            }`}
          >
            {isPeriodRefund ? (
              <TrendingUp className="w-3.5 h-3.5 mr-1" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 mr-1" />
            )}
            {isPeriodRefund ? '+' : ''}
            {formatCurrency(summary.period_balance ?? summary.balance_so_far)}
          </div>
        )}
      </div>

      {/* End of Contract Prediction */}
      <div className="bg-slate-900/70 rounded-xl p-2.5 border border-slate-800 text-xs">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span>Vertrag bisher ({formatCurrency(summary.cost_so_far)}):</span>
          <span className="font-mono text-slate-300">
            {formatNumber(summary.total_consumption, 1)} {summary.unit}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span>Prognose Vertragsende:</span>
          <span className="font-mono text-slate-200 font-semibold">
            ~{formatNumber(summary.projected_consumption, 0)} {summary.unit}
          </span>
        </div>
        {summary.bonus_one_time !== undefined && summary.bonus_one_time > 0 && (
          <div className="flex items-center justify-between text-amber-300 text-[11px] mb-1">
            <span className="flex items-center space-x-1">
              <Gift className="w-3 h-3 text-amber-400" />
              <span>Neukundenbonus (1. Jahr):</span>
            </span>
            <span className="font-mono font-semibold text-emerald-400">
              -{formatCurrency(summary.bonus_one_time)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">
            {category === 'water' && summary.monthly_payment === 0 ? 'Erwartete Jahreskosten:' : 'Erwarteter Saldo:'}
          </span>
          {category === 'water' && summary.monthly_payment === 0 ? (
            <span className="font-semibold text-sky-300 font-mono">
              {formatCurrency(summary.projected_total_cost)}
            </span>
          ) : (
            <span
              className={`font-semibold ${
                isProjRefund ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isProjRefund ? '+' : ''}
              {formatCurrency(summary.projected_balance)}
            </span>
          )}
        </div>
      </div>

      {/* Click-through footer to dedicated detail dashboard */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-emerald-400 transition-colors">
        <span>Ausführliches {label}-Dashboard öffnen</span>
        <span className="font-bold">➔</span>
      </div>
    </div>
  );
};
