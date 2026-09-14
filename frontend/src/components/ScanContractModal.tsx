import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Zap,
  Flame,
  Droplets,
  HelpCircle,
  FileText,
  Trash2,
  Plus,
  ArrowRight,
  Gift
} from 'lucide-react';
import { api } from '../api';
import { AIContractScanResult, MeterCategory } from '../types';
import { formatCurrency, getCategoryLabel } from '../utils/formatters';

interface ScanContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyContract: (contractData: AIContractScanResult) => void;
}

export const ScanContractModal: React.FC<ScanContractModalProps> = ({
  isOpen,
  onClose,
  onApplyContract
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<AIContractScanResult | null>(null);

  // Form state for review/edit
  const [category, setCategory] = useState<MeterCategory>('electricity');
  const [providerName, setProviderName] = useState('');
  const [tariffName, setTariffName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [baseFeeMonthly, setBaseFeeMonthly] = useState<number>(0);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [monthlyPayment, setMonthlyPayment] = useState<number>(0);
  const [bonusOneTime, setBonusOneTime] = useState<number>(0);
  const [bonusNotes, setBonusNotes] = useState('');
  const [showBonusHelp, setShowBonusHelp] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesSelected = (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;
    setError(null);

    const validFiles: File[] = [];
    const validPreviews: string[] = [];

    Array.from(newFiles).forEach((file) => {
      if (file.type.startsWith('image/')) {
        validFiles.push(file);
        validPreviews.push(URL.createObjectURL(file));
      }
    });

    if (validFiles.length === 0) {
      setError('Bitte wählen Sie gültige Bilddateien (JPG, PNG, WebP) aus.');
      return;
    }

    setFiles((prev) => [...prev, ...validFiles]);
    setPreviews((prev) => [...prev, ...validPreviews]);
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const resetAll = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setFiles([]);
    setPreviews([]);
    setLoading(false);
    setError(null);
    setScanResult(null);
  };

  const handleScan = async () => {
    if (files.length === 0) {
      setError('Bitte mindestens einen Screenshot hochladen.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.scanContractImages(files);
      setScanResult(result);
      setCategory(result.category);
      setProviderName(result.provider_name || '');
      setTariffName(result.tariff_name || '');
      setStartDate(result.start_date || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
      setEndDate(result.end_date || new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10));
      setBaseFeeMonthly(result.base_fee_monthly || 0);
      setUnitPrice(result.unit_price || 0);
      setMonthlyPayment(result.monthly_payment || 0);
      setBonusOneTime(result.bonus_one_time || 0);
      setBonusNotes(result.bonus_notes || '');
    } catch (err: any) {
      setError(err.message || 'Fehler bei der KI-Analyse des Tarif-Screenshots.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    const finalData: AIContractScanResult = {
      category,
      provider_name: providerName.trim() || null,
      tariff_name: tariffName.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      base_fee_monthly: Number(baseFeeMonthly) || 0,
      unit_price: Number(unitPrice) || 0,
      monthly_payment: Number(monthlyPayment) || 0,
      bonus_one_time: Number(bonusOneTime) || 0,
      bonus_notes: bonusNotes.trim() || null,
      confidence: scanResult?.confidence || 0.95,
      notes: scanResult?.notes || null
    };

    onApplyContract(finalData);
    resetAll();
    onClose();
  };

  const unit = category === 'electricity' ? 'kWh' : 'm³';
  const priceLabel = category === 'electricity' ? 'EUR / kWh' : 'EUR / m³';

  // Live preview calculations
  const annualBaseFee = (Number(baseFeeMonthly) || 0) * 12;
  const annualPayments = (Number(monthlyPayment) || 0) * 12;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-white my-8 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tarif-Screenshots per KI erfassen</h2>
              <p className="text-xs text-slate-400">
                Laden Sie einen oder mehrere Screenshots von Check24, Verivox oder Ihrem Anbieter hoch
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              resetAll();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 py-4 space-y-5 pr-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Upload Screenshots */}
          {!scanResult && (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-800/40 hover:bg-slate-800/70 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 rounded-full bg-slate-800 group-hover:bg-amber-500/20 group-hover:text-amber-400 text-slate-400 transition-colors">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div className="text-sm font-semibold text-slate-200">
                    Screenshots hier ablegen oder <span className="text-amber-400 underline underline-offset-2">auswählen</span>
                  </div>
                  <p className="text-xs text-slate-400 max-w-md">
                    Unterstützt PNG, JPG, WebP. Sie können <strong className="text-slate-300">mehrere Screenshots</strong> auswählen, falls die Details auf mehrere Seiten verteilt sind.
                  </p>
                </div>
              </div>

              {/* Selected Images Preview Gallery */}
              {previews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Ausgewählte Screenshots ({files.length}):</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-amber-400 hover:text-amber-300 flex items-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Weitere hinzufügen</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-48 overflow-y-auto p-1 bg-slate-950/50 rounded-xl border border-slate-800/80">
                    {previews.map((src, index) => (
                      <div
                        key={index}
                        className="relative group rounded-lg overflow-hidden border border-slate-700 bg-slate-900 aspect-video flex items-center justify-center"
                      >
                        <img
                          src={src}
                          alt={`Screenshot ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1 left-1 bg-black/70 text-[10px] px-1.5 py-0.5 rounded text-white font-mono">
                          #{index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="absolute top-1 right-1 p-1 rounded-full bg-rose-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Screenshot entfernen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tip Box */}
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs text-slate-300 space-y-1">
                <div className="font-semibold text-amber-400 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Automatische Erkennung aller Tarifdaten:</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Die Vision-KI ermittelt automatisch den <strong>Anbieter</strong>, den <strong>Tarifnamen</strong>, <strong>Grundpreis</strong>, <strong>Arbeitspreis</strong> (automatische Cent-in-Euro-Umrechnung), <strong>Abschlag</strong> sowie <strong>Neukunden- und Sofortboni</strong>.
                </p>
              </div>

              {/* Scan Trigger Button */}
              <button
                type="button"
                disabled={files.length === 0 || loading}
                onClick={handleScan}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin text-white" />
                    <span>Analysiere {files.length} Screenshot{files.length > 1 ? 's' : ''} mit Vision-KI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-white" />
                    <span>Jetzt {files.length > 0 ? `${files.length} Screenshot${files.length > 1 ? 's' : ''}` : ''} analysieren</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: Review & Edit Extracted Results */}
          {scanResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl text-emerald-300 text-xs">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">Tarif erfolgreich aus Screenshot(s) erkannt!</span>
                </div>
                <span className="text-[11px] bg-emerald-500/20 px-2 py-0.5 rounded font-mono">
                  {Math.round((scanResult.confidence || 0.95) * 100)}% Konfidenz
                </span>
              </div>

              {/* Category Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Erkannte Sparte / Versorgungsart
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCategory('electricity')}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      category === 'electricity'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Strom</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory('gas')}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      category === 'gas'
                        ? 'bg-orange-500/20 border-orange-500 text-orange-300 shadow-sm'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span>Gas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory('water')}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      category === 'water'
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-sm'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Droplets className="w-4 h-4 text-sky-400" />
                    <span>Wasser</span>
                  </button>
                </div>
              </div>

              {/* Provider & Tariff Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">
                    Anbieter / Versorger
                  </label>
                  <input
                    type="text"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    placeholder="z.B. Vattenfall, E.ON, Yello"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">
                    Tarifname / Produkt
                  </label>
                  <input
                    type="text"
                    value={tariffName}
                    onChange={(e) => setTariffName(e.target.value)}
                    placeholder="z.B. Easy Strom 12M"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium"
                  />
                </div>
              </div>

              {/* Contract Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Vertragsbeginn</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Vertragsende / Laufzeit bis</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                  />
                </div>
              </div>

              {/* Pricing Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 font-medium mb-1">
                    Grundgebühr (€/Mt.)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={baseFeeMonthly}
                      onChange={(e) => setBaseFeeMonthly(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                      €
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 font-medium mb-1">
                    Arbeitspreis ({priceLabel})
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.0001"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                      €
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 font-medium mb-1">
                    Abschlag (€/Mt.)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      value={monthlyPayment}
                      onChange={(e) => setMonthlyPayment(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                      €
                    </span>
                  </div>
                </div>
              </div>

              {/* BONUS SECTION (Special Feature) */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-amber-300">
                    <Gift className="w-4 h-4 flex-shrink-0" />
                    <span className="font-semibold text-xs">Einmaliger Neukunden- / Sofortbonus (1. Jahr)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBonusHelp(!showBonusHelp)}
                    className="text-amber-400 hover:text-amber-300 flex items-center space-x-1 text-[11px]"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Warum einrechnen?</span>
                  </button>
                </div>

                {showBonusHelp && (
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-amber-500/30 text-[11px] text-slate-300 space-y-1">
                    <p className="font-semibold text-amber-400">
                      💡 Macht es Sinn, den Bonus einzurechnen?
                    </p>
                    <p>
                      <strong>Ja, absolut!</strong> Ein Neukunden- oder Sofortbonus (oft 100–250 €) reduziert Ihre tatsächlichen Ausgaben im <strong>ersten Vertragsjahr</strong> erheblich und wird bei der Jahresabrechnung gutgeschrieben.
                    </p>
                    <p className="text-slate-400">
                      Da der Bonus ab dem 2. Jahr entfällt, berechnet Ihnen MeterPulse <strong>beides parallel</strong>: Die günstigen <em>effektiven Kosten im 1. Jahr</em> UND die <em>regulären Folgekosten</em> ab dem 2. Jahr.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Bonus-Betrag (EUR)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        value={bonusOneTime}
                        onChange={(e) => setBonusOneTime(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-amber-300 text-xs font-mono font-bold"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
                        €
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Bonus-Bedingungen / Details
                    </label>
                    <input
                      type="text"
                      value={bonusNotes}
                      onChange={(e) => setBonusNotes(e.target.value)}
                      placeholder="z.B. 100 € Sofortbonus nach 60 Tagen"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                    />
                  </div>
                </div>

                {bonusOneTime > 0 && (
                  <div className="text-[11px] text-amber-200/90 flex items-center justify-between border-t border-amber-500/20 pt-2">
                    <span>Ersparnis im 1. Vertragsjahr:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      -{formatCurrency(bonusOneTime)}
                    </span>
                  </div>
                )}
              </div>

              {/* Calculation Summary Footer */}
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Jahres-Grundgebühr:</span>
                  <span className="font-mono text-white">{formatCurrency(annualBaseFee)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Gezahlte Abschläge im Jahr:</span>
                  <span className="font-mono text-white">{formatCurrency(annualPayments)}</span>
                </div>
                {bonusOneTime > 0 && (
                  <div className="flex justify-between text-emerald-400 font-medium">
                    <span>Einmaliger Bonus (1. Jahr):</span>
                    <span className="font-mono">-{formatCurrency(bonusOneTime)}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={resetAll}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Zurück / Neue Bilder
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 transition-all active:scale-98"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Tarifdaten in {getCategoryLabel(category)} übernehmen & speichern</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
