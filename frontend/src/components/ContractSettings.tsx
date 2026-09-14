import React, { useState, useEffect } from 'react';
import {
  FileText,
  Save,
  CheckCircle2,
  AlertCircle,
  Zap,
  Flame,
  Droplets,
  HelpCircle,
  Calculator,
  Camera,
  Sparkles,
  Gift,
  Building,
  Tag
} from 'lucide-react';
import { Contract, MeterCategory, AIContractScanResult } from '../types';
import { api } from '../api';
import { formatCurrency, getCategoryColor, getCategoryLabel } from '../utils/formatters';
import { ScanContractModal } from './ScanContractModal';

export const ContractSettings: React.FC = () => {
  const [contracts, setContracts] = useState<Record<MeterCategory, Partial<Contract>>>({
    electricity: {
      category: 'electricity',
      provider_name: '',
      tariff_name: '',
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10),
      base_fee_monthly: 11.90,
      unit_price: 0.325,
      monthly_payment: 85.0,
      bonus_one_time: 0,
      bonus_notes: ''
    },
    gas: {
      category: 'gas',
      provider_name: '',
      tariff_name: '',
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10),
      base_fee_monthly: 14.50,
      unit_price: 0.118,
      monthly_payment: 130.0,
      bonus_one_time: 0,
      bonus_notes: '',
      warmwater_source: 'electricity',
      heating_start_month: 10,
      heating_end_month: 4
    },
    water: {
      category: 'water',
      provider_name: '',
      tariff_name: '',
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10),
      base_fee_monthly: 6.50,
      unit_price: 4.20,
      monthly_payment: 30.0,
      bonus_one_time: 0,
      bonus_notes: ''
    }
  });

  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [savingCategory, setSavingCategory] = useState<MeterCategory | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    try {
      const data = await api.getContracts();
      if (data && data.length > 0) {
        const map: any = { ...contracts };
        data.forEach((c) => {
          map[c.category] = {
            ...c,
            start_date: c.start_date.slice(0, 10),
            end_date: c.end_date.slice(0, 10),
            warmwater_source: c.warmwater_source || 'electricity',
            heating_start_month: c.heating_start_month || 10,
            heating_end_month: c.heating_end_month || 4
          };
        });
        setContracts(map);
      }
    } catch (err: any) {
      console.error('Fehler beim Laden der Verträge:', err);
    }
  };

  const handleFieldChange = (cat: MeterCategory, field: keyof Contract, val: any) => {
    setContracts((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [field]: val
      }
    }));
  };

  const saveContract = async (cat: MeterCategory, customData?: Partial<Contract>) => {
    setSavingCategory(cat);
    setError(null);
    setSuccessMsg(null);
    try {
      const c = customData || contracts[cat];
      const saved = await api.upsertContract({
        category: cat,
        provider_name: c.provider_name || null,
        tariff_name: c.tariff_name || null,
        start_date: c.start_date || new Date().toISOString().slice(0, 10),
        end_date: c.end_date || new Date().toISOString().slice(0, 10),
        base_fee_monthly: Number(c.base_fee_monthly) || 0,
        unit_price: Number(c.unit_price) || 0,
        monthly_payment: Number(c.monthly_payment) || 0,
        bonus_one_time: Number(c.bonus_one_time) || 0,
        bonus_notes: c.bonus_notes || null,
        warmwater_source: c.warmwater_source || 'electricity',
        heating_start_month: c.heating_start_month || 10,
        heating_end_month: c.heating_end_month || 4
      });

      setContracts((prev) => ({
        ...prev,
        [cat]: {
          ...saved,
          start_date: saved.start_date.slice(0, 10),
          end_date: saved.end_date.slice(0, 10)
        }
      }));

      setSuccessMsg(`Vertrag für ${getCategoryLabel(cat)} erfolgreich gespeichert.`);
      setTimeout(() => setSuccessMsg(null), 4500);
    } catch (err: any) {
      setError(err.message || `Fehler beim Speichern von ${getCategoryLabel(cat)}.`);
    } finally {
      setSavingCategory(null);
    }
  };

  const handleContractScanned = async (scanned: AIContractScanResult) => {
    const cat = scanned.category;
    const updatedContract: Partial<Contract> = {
      category: cat,
      provider_name: scanned.provider_name,
      tariff_name: scanned.tariff_name,
      start_date: scanned.start_date || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: scanned.end_date || new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10),
      base_fee_monthly: scanned.base_fee_monthly,
      unit_price: scanned.unit_price,
      monthly_payment: scanned.monthly_payment,
      bonus_one_time: scanned.bonus_one_time,
      bonus_notes: scanned.bonus_notes
    };

    setContracts((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        ...updatedContract
      }
    }));

    // Auto-save the scanned contract immediately
    await saveContract(cat, updatedContract);
    setSuccessMsg(`✨ KI-Scan erfolgreich: Tarif für ${getCategoryLabel(cat)} wurde übernommen und gespeichert!`);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const categories: MeterCategory[] = ['electricity', 'gas', 'water'];

  return (
    <div className="space-y-6 pb-20 md:pb-10 max-w-6xl">
      {/* Header & Scan Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Tarif- & Vertragsdaten
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Erfassen Sie Grundgebühren, Arbeitspreise, monatliche Abschläge und Neukundenboni für exakte Abrechnungsprognosen.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsScanModalOpen(true)}
          className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-98"
        >
          <Camera className="w-4 h-4 text-white" />
          <Sparkles className="w-3.5 h-3.5 text-amber-200" />
          <span>Tarif-Screenshots per KI scannen</span>
        </button>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center space-x-2.5 shadow-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center space-x-2.5 shadow-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Contract Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {categories.map((cat) => {
          const c = contracts[cat];
          const colors = getCategoryColor(cat);
          const label = getCategoryLabel(cat);
          const unit = cat === 'electricity' ? 'kWh' : 'm³';
          const priceLabel = cat === 'electricity' ? 'EUR / kWh' : 'EUR / m³';

          // Financial calculations
          const annualBaseFee = (Number(c.base_fee_monthly) || 0) * 12;
          const annualPayments = (Number(c.monthly_payment) || 0) * 12;
          const bonus = Number(c.bonus_one_time) || 0;

          return (
            <div
              key={cat}
              className={`glass-card rounded-2xl p-5 border ${colors.border} flex flex-col justify-between space-y-4`}
            >
              <div>
                {/* Card Header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2.5">
                    <div className={`p-2 rounded-xl ${colors.bg} border ${colors.border}`}>
                      {cat === 'electricity' && <Zap className="w-5 h-5 text-amber-400" />}
                      {cat === 'gas' && <Flame className="w-5 h-5 text-orange-400" />}
                      {cat === 'water' && <Droplets className="w-5 h-5 text-sky-400" />}
                    </div>
                    <div>
                      <h2 className="font-bold text-white text-base">{label}-Tarif</h2>
                      <span className="text-xs text-slate-400">
                        {c.provider_name ? `${c.provider_name}` : 'Vertragsparameter'}
                      </span>
                    </div>
                  </div>

                  {bonus > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Gift className="w-3 h-3 mr-1" />
                      -{formatCurrency(bonus)}
                    </span>
                  )}
                </div>

                {/* Form Fields */}
                <div className="space-y-3 text-xs">
                  {/* Provider & Tariff Name */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1 flex items-center space-x-1">
                        <Building className="w-3 h-3" />
                        <span>Anbieter</span>
                      </label>
                      <input
                        type="text"
                        value={c.provider_name || ''}
                        placeholder="z.B. Vattenfall"
                        onChange={(e) => handleFieldChange(cat, 'provider_name', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 flex items-center space-x-1">
                        <Tag className="w-3 h-3" />
                        <span>Tarifname</span>
                      </label>
                      <input
                        type="text"
                        value={c.tariff_name || ''}
                        placeholder="z.B. Easy 12M"
                        onChange={(e) => handleFieldChange(cat, 'tariff_name', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs font-medium"
                      />
                    </div>
                  </div>

                  {/* Contract Dates */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">Vertragsbeginn</label>
                      <input
                        type="date"
                        value={c.start_date || ''}
                        onChange={(e) => handleFieldChange(cat, 'start_date', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Vertragsende</label>
                      <input
                        type="date"
                        value={c.end_date || ''}
                        onChange={(e) => handleFieldChange(cat, 'end_date', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Monthly Base Fee */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Grundgebühr (EUR / Monat)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={c.base_fee_monthly ?? ''}
                        onChange={(e) => handleFieldChange(cat, 'base_fee_monthly', parseFloat(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono"
                        placeholder="z.B. 11.90"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                        €/Mt.
                      </span>
                    </div>
                  </div>

                  {/* Unit Price */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Arbeitspreis ({priceLabel})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.0001"
                        value={c.unit_price ?? ''}
                        onChange={(e) => handleFieldChange(cat, 'unit_price', parseFloat(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono"
                        placeholder="z.B. 0.3250"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                        €/{unit}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      z.B. 32,5 Cent/kWh = 0.3250 €
                    </p>
                  </div>

                  {/* Monthly Payment (Abschlag) */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Monatlicher Abschlag (EUR / Monat)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        value={c.monthly_payment ?? ''}
                        onChange={(e) => handleFieldChange(cat, 'monthly_payment', parseFloat(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono"
                        placeholder="z.B. 85.00"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                        €/Mt.
                      </span>
                    </div>
                  </div>

                  {/* Bonus Section */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-amber-400 flex items-center space-x-1">
                        <Gift className="w-3.5 h-3.5" />
                        <span>Einmaliger Bonus (1. Jahr)</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="relative">
                          <input
                            type="number"
                            step="1"
                            value={c.bonus_one_time ?? ''}
                            onChange={(e) => handleFieldChange(cat, 'bonus_one_time', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-amber-300 font-mono text-xs font-semibold"
                            placeholder="0 €"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
                            €
                          </span>
                        </div>
                      </div>
                      <div>
                        <input
                          type="text"
                          value={c.bonus_notes || ''}
                          onChange={(e) => handleFieldChange(cat, 'bonus_notes', e.target.value)}
                          placeholder="z.B. Sofortbonus"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-300 text-[11px]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Gas Specific: Warmwater & Heating Season Configuration */}
                  {cat === 'gas' && (
                    <div className="p-3 rounded-xl bg-orange-950/20 border border-orange-500/20 space-y-2 text-xs">
                      <span className="font-semibold text-orange-300 block">
                        Warmwasser- & Heizprofil:
                      </span>
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">
                          Warmwasserbereitung:
                        </label>
                        <select
                          value={c.warmwater_source || 'electricity'}
                          onChange={(e) => handleFieldChange('gas', 'warmwater_source', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs"
                        >
                          <option value="electricity">⚡ Über Strom (0 m³ Gas im Sommer)</option>
                          <option value="gas">🔥 Über Gaszentralheizung</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-slate-400 text-[10px] mb-1">
                            Heizbeginn (Monat):
                          </label>
                          <select
                            value={c.heating_start_month || 10}
                            onChange={(e) => handleFieldChange('gas', 'heating_start_month', Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-white text-xs"
                          >
                            <option value={9}>September</option>
                            <option value={10}>Oktober (Standard)</option>
                            <option value={11}>November</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] mb-1">
                            Heizende (Monat):
                          </label>
                          <select
                            value={c.heating_end_month || 4}
                            onChange={(e) => handleFieldChange('gas', 'heating_end_month', Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-white text-xs"
                          >
                            <option value={3}>März</option>
                            <option value={4}>April (Standard)</option>
                            <option value={5}>Mai</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Annual Calculation Breakdown */}
                  <div className="mt-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Jahres-Grundgebühr:</span>
                      <span className="text-white font-mono font-medium">{formatCurrency(annualBaseFee)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Gezahlte Abschläge / Jahr:</span>
                      <span className="text-emerald-400 font-mono font-medium">{formatCurrency(annualPayments)}</span>
                    </div>
                    {bonus > 0 && (
                      <div className="flex justify-between text-amber-400 font-medium border-t border-slate-800 pt-1">
                        <span>Einmalbonus (1. Jahr):</span>
                        <span className="font-mono">-{formatCurrency(bonus)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <button
                type="button"
                disabled={savingCategory === cat}
                onClick={() => saveContract(cat)}
                className="w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white font-medium text-xs transition-all active:scale-98 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {savingCategory === cat ? 'Speichern...' : `${label}-Tarif speichern`}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal for AI Contract Screenshot Scanning */}
      <ScanContractModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onApplyContract={handleContractScanned}
      />
    </div>
  );
};
