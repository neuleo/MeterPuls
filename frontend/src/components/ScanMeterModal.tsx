import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Gauge,
  Zap,
  Flame,
  Droplets,
  Calendar,
  Plus,
  Trash2,
  ZoomIn,
  Check
} from 'lucide-react';
import { Meter, MeterCategory, AIScanResult } from '../types';
import { api } from '../api';
import { getCategoryLabel } from '../utils/formatters';

export interface ScanItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  targetCategory: MeterCategory;
  categoryAutoDetected?: boolean;
  selectedMeterId: number;
  readingValue: string;
  readingDate: string;
  exifDateDetected: string | null;
  detectedMeterNumber?: string | null;
  matchedByNumber?: boolean;
  matchReason?: string;
  notes: string;
  confidence?: number;
  errorMessage?: string;
}

export function normalizeMeterNumber(num?: string | null): string {
  if (!num) return '';
  return num
    .toLowerCase()
    .replace(/^(?:nr|no|sn|seriennr|seriennummer|zählernr|zählernummer)[\.\:\s\-]*/i, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '');
}

export function matchMeterByNumberOrType(
  allMeters: Meter[],
  detectedCategory: MeterCategory,
  detectedMeterNumber?: string | null,
  detectedNotes?: string | null
): { meterId: number; matchedByNumber: boolean; matchReason?: string } {
  const categoryMeters = allMeters.filter((m) => m.category === detectedCategory);
  if (categoryMeters.length === 0) {
    return { meterId: allMeters.length > 0 ? allMeters[0].id : 0, matchedByNumber: false };
  }

  // 1. Check exact or normalized meter number match
  if (detectedMeterNumber) {
    const normDetected = normalizeMeterNumber(detectedMeterNumber);
    if (normDetected.length >= 3) {
      for (const m of categoryMeters) {
        if (!m.meter_number) continue;
        const normM = normalizeMeterNumber(m.meter_number);
        if (normM && (normM === normDetected || normM.includes(normDetected) || normDetected.includes(normM))) {
          return {
            meterId: m.id,
            matchedByNumber: true,
            matchReason: `Zählernr. ${detectedMeterNumber} erkannt ➔ '${m.name}' automatisch zugeordnet`
          };
        }
      }
    }
  }

  // 2. Multi-water meter differentiation (Warmwasser vs. Kaltwasser)
  if (detectedCategory === 'water' && categoryMeters.length > 1) {
    const notesLow = (detectedNotes || '').toLowerCase();
    const isWarm = notesLow.includes('warm') || notesLow.includes('rot') || notesLow.includes('90°') || notesLow.includes('th');
    const isCold = notesLow.includes('kalt') || notesLow.includes('blau') || notesLow.includes('30°') || notesLow.includes('50°');

    if (isWarm) {
      const warmMeter = categoryMeters.find((m) =>
        m.name.toLowerCase().includes('warm') || (m.location && m.location.toLowerCase().includes('warm'))
      );
      if (warmMeter) {
        return {
          meterId: warmMeter.id,
          matchedByNumber: false,
          matchReason: `Als Warmwasserzähler erkannt ➔ '${warmMeter.name}' zugeordnet`
        };
      }
    }
    if (isCold) {
      const coldMeter = categoryMeters.find((m) =>
        m.name.toLowerCase().includes('kalt') || (m.location && m.location.toLowerCase().includes('kalt'))
      );
      if (coldMeter) {
        return {
          meterId: coldMeter.id,
          matchedByNumber: false,
          matchReason: `Als Kaltwasserzähler erkannt ➔ '${coldMeter.name}' zugeordnet`
        };
      }
    }
  }

  return {
    meterId: categoryMeters[0].id,
    matchedByNumber: false
  };
}

interface ScanMeterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  meters: Meter[];
}

export const ScanMeterModal: React.FC<ScanMeterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  meters
}) => {
  const [items, setItems] = useState<ScanItem[]>([]);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [activePhotoModal, setActivePhotoModal] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addMoreFileInputRef = useRef<HTMLInputElement>(null);
  const addMoreCameraInputRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setItems([]);
      setGlobalError(null);
      setIsBatchSaving(false);
      setActivePhotoModal(null);
    } else {
      // Clean up object URLs to prevent memory leaks
      items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setItems([]);
    }
  }, [isOpen]);

  const handleSaveMeterNumberToMeter = async (meterId: number, newMeterNumber: string) => {
    try {
      await api.updateMeter(meterId, { meter_number: newMeterNumber });
      const targetMeter = meters.find((m) => m.id === meterId);
      if (targetMeter) {
        targetMeter.meter_number = newMeterNumber;
      }
      setItems((prev) =>
        prev.map((i) => {
          if (i.selectedMeterId === meterId) {
            return {
              ...i,
              matchedByNumber: true,
              matchReason: `Zählernr. ${newMeterNumber} erfolgreich für '${targetMeter?.name || 'Zähler'}' gespeichert`
            };
          }
          return i;
        })
      );
      onSuccess();
    } catch (err: any) {
      console.error('Fehler beim Speichern der Zählernummer am Zähler:', err);
    }
  };

  const addFiles = (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList);
    if (fileArray.length === 0) return;

    const now = new Date();
    const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    const newItems: ScanItem[] = fileArray.map((file, idx) => {
      return {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${idx}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'analyzing',
        targetCategory: 'electricity',
        categoryAutoDetected: false,
        selectedMeterId: 0,
        readingValue: '',
        readingDate: localDatetime,
        exifDateDetected: null,
        detectedMeterNumber: null,
        matchedByNumber: false,
        notes: ''
      };
    });

    setItems((prev) => [...prev, ...newItems]);
    setGlobalError(null);

    // Trigger parallel AI analysis for all newly added files
    analyzeItems(newItems);
  };

  const analyzeItems = (itemsToAnalyze: ScanItem[]) => {
    // Process all images in parallel
    itemsToAnalyze.forEach(async (item) => {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'analyzing' } : i))
      );

      try {
        const result = await api.scanMeterImage(item.file);
        const detectedCat = result.category as MeterCategory;

        // Auto-assign matching meter for the auto-detected category using smart matching
        const matchResult = matchMeterByNumberOrType(
          meters,
          detectedCat,
          result.meter_number,
          result.notes
        );
        const chosenMeterId = matchResult.meterId;

        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== item.id) return i;
            return {
              ...i,
              status: 'done',
              targetCategory: detectedCat,
              categoryAutoDetected: true,
              selectedMeterId: chosenMeterId,
              readingValue: result.value.toString(),
              readingDate: result.detected_date ? result.detected_date.slice(0, 16) : i.readingDate,
              exifDateDetected: result.detected_date || null,
              detectedMeterNumber: result.meter_number || null,
              matchedByNumber: matchResult.matchedByNumber,
              matchReason: matchResult.matchReason,
              confidence: result.confidence,
              notes: result.notes ? `[KI]: ${result.notes}` : i.notes,
              errorMessage: undefined
            };
          })
        );
      } catch (err: any) {
        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== item.id) return i;
            return {
              ...i,
              status: 'error',
              errorMessage: err.message || 'Vision-KI Analyse fehlgeschlagen. Bitte manuell prüfen.'
            };
          })
        );
      }
    });
  };

  const updateItem = (id: string, updates: Partial<ScanItem>) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const updated = { ...i, ...updates };

        // If targetCategory changed manually, reset categoryAutoDetected and pick matching meter
        if (updates.targetCategory && updates.targetCategory !== i.targetCategory) {
          updated.categoryAutoDetected = false;
          const matching = meters.filter((m) => m.category === updates.targetCategory);
          if (matching.length > 0) {
            updated.selectedMeterId = matching[0].id;
          } else {
            updated.selectedMeterId = 0;
          }
        }
        return updated;
      })
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const remaining = prev.filter((i) => i.id !== id);
      const removed = prev.find((i) => i.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return remaining;
    });
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    // Validate all items
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const num = parseFloat(item.readingValue);
      if (isNaN(num) || num < 0) {
        setGlobalError(
          `Foto #${idx + 1} (${getCategoryLabel(item.targetCategory)}): Bitte einen gültigen Zählerstand eintragen.`
        );
        return;
      }
      if (!item.selectedMeterId) {
        setGlobalError(
          `Foto #${idx + 1}: Bitte einen Zähler für ${getCategoryLabel(item.targetCategory)} auswählen.`
        );
        return;
      }
    }

    setIsBatchSaving(true);
    setGlobalError(null);

    try {
      // Save all readings with their respective images
      for (const item of items) {
        const formData = new FormData();
        formData.append('meter_id', item.selectedMeterId.toString());
        formData.append('reading_value', parseFloat(item.readingValue).toString());
        formData.append('reading_date', new Date(item.readingDate).toISOString());
        if (item.notes) formData.append('notes', item.notes);
        formData.append('file', item.file);

        await api.uploadAndCreateReading(formData);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setGlobalError(err.message || 'Fehler beim Speichern der Zählerstände.');
    } finally {
      setIsBatchSaving(false);
    }
  };

  if (!isOpen) return null;

  const analyzingCount = items.filter((i) => i.status === 'analyzing' || i.status === 'pending').length;
  const isAnalyzingAny = analyzingCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="glass-panel rounded-2xl border border-slate-700 w-full max-w-3xl p-4 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[92vh] flex flex-col">
        {/* Hidden inputs for multiple file selection & camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={addMoreFileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={addMoreCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white">Zählerstand erfassen</h2>
                {items.length > 1 && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Stapel-Upload ({items.length} Fotos)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Lade einzelne oder alle Zählerfotos gleichzeitig hoch — automatische Vision-KI Erkennung & EXIF-Datum
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Empty State: Upload / Camera Options */}
        {items.length === 0 ? (
          <div className="py-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: Multi-file / Gallery Upload */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-7 rounded-2xl border-2 border-dashed border-emerald-500/40 hover:border-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 text-slate-200 transition-all group active:scale-[0.99]"
              >
                <div className="p-3.5 rounded-full bg-emerald-500/20 text-emerald-400 mb-3 group-hover:scale-110 transition-transform shadow-lg shadow-emerald-500/20">
                  <Upload className="w-7 h-7" />
                </div>
                <span className="font-bold text-base text-white">Mehrere Fotos auswählen</span>
                <span className="text-xs text-slate-400 mt-1 text-center">
                  Alle Zähler gleichzeitig aus Galerie / Dateien wählen (Strom, Gas, Wasser)
                </span>
                <span className="mt-3 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-emerald-400 border border-emerald-500/30">
                  ✨ Multi-Upload unterstützt
                </span>
              </button>

              {/* Option 2: Live Camera Capture */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-7 rounded-2xl border-2 border-dashed border-slate-700 hover:border-slate-500 bg-slate-900/40 hover:bg-slate-900/80 text-slate-200 transition-all group active:scale-[0.99]"
              >
                <div className="p-3.5 rounded-full bg-slate-800 text-slate-300 mb-3 group-hover:scale-110 transition-transform">
                  <Camera className="w-7 h-7" />
                </div>
                <span className="font-bold text-base text-white">Foto aufnehmen</span>
                <span className="text-xs text-slate-400 mt-1 text-center">
                  Direkt mit Smartphone-Kamera im Zählerkasten fotografieren
                </span>
                <span className="mt-3 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                  Kamera-Direktstart
                </span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-start space-x-3">
              <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Praktischer Multi-Upload:</p>
                <p className="text-slate-400 mt-0.5 leading-relaxed">
                  Fotografiere im Keller nacheinander Strom-, Gas- und Wasserzähler. Wähle anschließend alle Bilder auf einmal aus —
                  die KI erkennt automatisch die Zähler-Sparte, liest den Zählerstand ab und übernimmt das Aufnahmedatum aus den Foto-Metadaten (EXIF).
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Multi-Item Review & Edit List */
          <form onSubmit={handleSaveAll} className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Global Progress or Error Banner */}
            {isAnalyzingAny && (
              <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-between text-xs text-indigo-200">
                <div className="flex items-center space-x-2.5">
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                  <span className="font-medium">
                    Vision-KI analysiert Zählerfotos ({items.length - analyzingCount}/{items.length} fertig)...
                  </span>
                </div>
                <span className="text-[11px] text-indigo-300/80">Bitte kurz warten</span>
              </div>
            )}

            {globalError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{globalError}</span>
              </div>
            )}

            {/* Scrollable List of Scan Cards */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {items.map((item, index) => {
                const colors =
                  item.status === 'analyzing'
                    ? { border: 'border-indigo-500/40', bg: 'bg-indigo-500/5', text: 'text-indigo-400' }
                    : item.targetCategory === 'electricity'
                    ? { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400' }
                    : item.targetCategory === 'gas'
                    ? { border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400' }
                    : { border: 'border-sky-500/40', bg: 'bg-sky-500/10', text: 'text-sky-400' };

                const categoryMeters = meters.filter((m) => m.category === item.targetCategory);
                const selectedMeter = meters.find((m) => m.id === item.selectedMeterId);

                return (
                  <div
                    key={item.id}
                    className={`glass-card rounded-2xl p-4 border ${colors.border} space-y-3.5 relative transition-all`}
                  >
                    {/* Item Top Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center border border-slate-700">
                          {index + 1}
                        </span>

                        {item.status === 'analyzing' ? (
                          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs animate-pulse font-medium">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                            <span>Sparte wird von KI ermittelt (Strom, Gas, Wasser)...</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Category Selector Pills */}
                            <div className="flex items-center space-x-1 bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
                              {(['electricity', 'gas', 'water'] as MeterCategory[]).map((cat) => {
                                const isSelected = item.targetCategory === cat;
                                return (
                                  <button
                                    key={cat}
                                    type="button"
                                    onClick={() => updateItem(item.id, { targetCategory: cat })}
                                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                      isSelected
                                        ? cat === 'electricity'
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                                          : cat === 'gas'
                                          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm'
                                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                  >
                                    {cat === 'electricity' && <Zap className="w-3 h-3 text-amber-400" />}
                                    {cat === 'gas' && <Flame className="w-3 h-3 text-orange-400" />}
                                    {cat === 'water' && <Droplets className="w-3 h-3 text-sky-400" />}
                                    <span>{getCategoryLabel(cat)}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {item.categoryAutoDetected && (
                              <span className="inline-flex items-center text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                                <Sparkles className="w-2.5 h-2.5 mr-1" />
                                Sparte automatisch erkannt
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Status / Confidence & Remove */}
                      <div className="flex items-center space-x-2">
                        {item.status === 'analyzing' && (
                          <span className="inline-flex items-center text-xs text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> KI liest ab...
                          </span>
                        )}
                        {item.matchedByNumber ? (
                          <span className="inline-flex items-center text-[11px] font-semibold text-emerald-300 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/40 shadow-sm">
                            <Check className="w-3 h-3 mr-1 text-emerald-400" />
                            Nr. {item.detectedMeterNumber}
                          </span>
                        ) : item.detectedMeterNumber ? (
                          <span className="inline-flex items-center text-[11px] text-slate-300 bg-slate-800/90 px-2 py-0.5 rounded-full border border-slate-700">
                            Nr. {item.detectedMeterNumber}
                          </span>
                        ) : null}
                        {item.status === 'done' && item.confidence && (
                          <span className="inline-flex items-center text-[11px] text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <Sparkles className="w-3 h-3 mr-1 text-emerald-400" />
                            {(item.confidence * 100).toFixed(0)}% Konfidenz
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="inline-flex items-center text-[11px] text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/30">
                            <AlertCircle className="w-3 h-3 mr-1 text-rose-400" />
                            Manuell prüfen
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                          title="Dieses Bild entfernen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Item Body: Image Preview + Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                      {/* Thumbnail with Click-to-Zoom */}
                      <div className="relative group cursor-pointer aspect-video md:aspect-square w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
                        <img
                          src={item.previewUrl}
                          alt={`Zählerfoto ${index + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onClick={() => setActivePhotoModal(item.previewUrl)}
                        />
                        <div
                          onClick={() => setActivePhotoModal(item.previewUrl)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white space-x-1 text-xs"
                        >
                          <ZoomIn className="w-4 h-4" />
                          <span>Vergrößern</span>
                        </div>
                      </div>

                      {/* Form Inputs for this item */}
                      <div className="md:col-span-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Meter selection */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-medium text-slate-300">
                                Zugeordneter Zähler
                              </label>
                              {item.matchedByNumber ? (
                                <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium flex items-center">
                                  <Check className="w-2.5 h-2.5 mr-1 text-emerald-400" /> Per Zählernr. zugewiesen
                                </span>
                              ) : item.categoryAutoDetected ? (
                                <span className="text-[10px] text-emerald-400 flex items-center">
                                  <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Auto-zugewiesen
                                </span>
                              ) : null}
                            </div>
                            {categoryMeters.length > 0 ? (
                              <select
                                value={item.selectedMeterId}
                                onChange={(e) => updateItem(item.id, { selectedMeterId: Number(e.target.value) })}
                                className={`w-full bg-slate-900 border ${
                                  item.matchedByNumber ? 'border-emerald-500/60 ring-1 ring-emerald-500/20' : 'border-slate-700'
                                } rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500`}
                              >
                                {categoryMeters.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} ({m.unit}) {m.meter_number ? `— Nr. ${m.meter_number}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="p-2 rounded-xl bg-slate-900 border border-amber-500/30 text-amber-300 text-[11px]">
                                Kein Zähler für {getCategoryLabel(item.targetCategory)} angelegt
                              </div>
                            )}

                            {/* Match Explanation */}
                            {item.matchReason && (
                              <p className="text-[10px] text-emerald-400 font-medium mt-1 flex items-center">
                                <Sparkles className="w-3 h-3 mr-1 flex-shrink-0 text-emerald-400" />
                                <span>{item.matchReason}</span>
                              </p>
                            )}

                            {/* Option to permanently save detected meter number to meter if not yet set */}
                            {item.detectedMeterNumber && selectedMeter && !selectedMeter.meter_number && (
                              <div className="mt-1.5 flex items-center justify-between text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                                <span>Zähler-Nr. <strong>{item.detectedMeterNumber}</strong> für '{selectedMeter.name}' dauerhaft speichern?</span>
                                <button
                                  type="button"
                                  onClick={() => handleSaveMeterNumberToMeter(selectedMeter.id, item.detectedMeterNumber!)}
                                  className="text-amber-400 hover:text-amber-200 underline font-semibold ml-2 whitespace-nowrap"
                                >
                                  Jetzt speichern
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Reading Value Input */}
                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              Zählerstand ({item.status === 'analyzing' ? '...' : item.targetCategory === 'electricity' ? 'kWh' : 'm³'})
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="any"
                                inputMode="decimal"
                                required
                                value={item.readingValue}
                                onChange={(e) => updateItem(item.id, { readingValue: e.target.value })}
                                placeholder={item.status === 'analyzing' ? 'KI liest...' : 'z.B. 24890.5'}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-1.5 text-base font-mono font-bold text-white tracking-wider focus:outline-none placeholder:text-slate-600"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                                {item.targetCategory === 'electricity' ? 'kWh' : 'm³'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Date and Notes */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-medium text-slate-300">
                                Ablesezeitpunkt
                              </label>
                              {item.exifDateDetected && (
                                <span className="text-[10px] text-emerald-400 flex items-center">
                                  <Calendar className="w-3 h-3 mr-0.5" /> EXIF erkannt
                                </span>
                              )}
                            </div>
                            <input
                              type="datetime-local"
                              required
                              value={item.readingDate}
                              onChange={(e) => updateItem(item.id, { readingDate: e.target.value, exifDateDetected: null })}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              Notizen
                            </label>
                            <input
                              type="text"
                              value={item.notes}
                              onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                              placeholder="z.B. Monatsablesung, Keller..."
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        {item.errorMessage && (
                          <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 flex items-start space-x-2">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                            <span className="leading-relaxed">{item.errorMessage}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Footer Actions */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
              {/* Add more photos button */}
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => addMoreFileInputRef.current?.click()}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors w-full sm:w-auto justify-center"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>+ Weitere Fotos hinzufügen</span>
                </button>

                <button
                  type="button"
                  onClick={() => addMoreCameraInputRef.current?.click()}
                  className="sm:hidden flex items-center space-x-1 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  title="Noch ein Foto mit Kamera aufnehmen"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Cancel and Save All Buttons */}
              <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isBatchSaving || isAnalyzingAny}
                  className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-emerald-500/25 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBatchSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Speichere Ablesungen...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        {items.length === 1
                          ? 'Zählerstand speichern'
                          : `Alle ${items.length} Zählerstände speichern`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Fullscreen Photo Lightbox Modal */}
        {activePhotoModal && (
          <div
            onClick={() => setActivePhotoModal(null)}
            className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          >
            <div className="relative max-w-2xl max-h-[85vh]">
              <img
                src={activePhotoModal}
                alt="Zählerfoto vergrößert"
                className="max-w-full max-h-[85vh] rounded-2xl object-contain border border-slate-700"
              />
              <button
                onClick={() => setActivePhotoModal(null)}
                className="absolute top-3 right-3 p-2 bg-slate-900/80 rounded-full text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
