import { MeterCategory } from '../types';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

export function getCategoryLabel(category: MeterCategory): string {
  switch (category) {
    case 'electricity':
      return 'Strom';
    case 'gas':
      return 'Gas';
    case 'water':
      return 'Wasser';
    default:
      return category;
  }
}

export function getCategoryUnit(category: MeterCategory): string {
  switch (category) {
    case 'electricity':
      return 'kWh';
    case 'gas':
    case 'water':
      return 'm³';
    default:
      return '';
  }
}

export function getCategoryColor(category: MeterCategory): {
  primary: string;
  bg: string;
  border: string;
  badge: string;
  accent: string;
} {
  switch (category) {
    case 'electricity':
      return {
        primary: '#eab308',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        accent: 'text-amber-400'
      };
    case 'gas':
      return {
        primary: '#f97316',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
        accent: 'text-orange-400'
      };
    case 'water':
      return {
        primary: '#0284c7',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/30',
        badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        accent: 'text-sky-400'
      };
  }
}
