import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  Trash2,
  Calendar,
  Image as ImageIcon,
  ExternalLink,
  ChevronRight,
  Plus,
  Check,
  AlertCircle
} from 'lucide-react';
import { Meter, Reading } from '../types';
import { api } from '../api';
import { formatNumber, formatDateTime, formatDate } from '../utils/formatters';

interface ReadingHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  meter: Meter | null;
  onRefresh: () => void;
}

export const ReadingHistoryModal: React.FC<ReadingHistoryModalProps> = ({
  isOpen,
  onClose,
  meter,
  onRefresh
}) => {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Manual past/new reading entry form state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && meter) {
      loadReadings();
      setIsAddOpen(false);
      setNewValue('');
      setNewNotes('');
      setAddError(null);
      // Default to current local time
      const now = new Date();
      const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setNewDate(localDatetime);
    }
  }, [isOpen, meter]);

  const loadReadings = async () => {
    if (!meter) return;
    setLoading(true);
    try {
      const data = await api.getReadings(meter.id, 100);
      setReadings(data);
    } catch (err: any) {
      console.error('Fehler beim Laden der Ablesungen:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReading = async (id: number) => {
    if (window.confirm('Möchten Sie diese Ablesung wirklich löschen?')) {
      try {
        await api.deleteReading(id);
        await loadReadings();
        onRefresh();
      } catch (err: any) {
        alert(err.message || 'Fehler beim Löschen der Ablesung.');
      }
    }
  };

  const handleAddReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meter) return;
    const num = parseFloat(newValue);
    if (isNaN(num) || num < 0) {
      setAddError('Bitte geben Sie einen gültigen Zählerstand ein.');
      return;
    }
    if (!newDate) {
      setAddError('Bitte wählen Sie ein Datum.');
      return;
    }

    setSaving(true);
    setAddError(null);
    try {
      await api.createReading({
        meter_id: meter.id,
        reading_value: num,
        reading_date: new Date(newDate).toISOString(),
        notes: newNotes.trim() || undefined
      });
      setNewValue('');
      setNewNotes('');
      setIsAddOpen(false);
      await loadReadings();
      onRefresh();
    } catch (err: any) {
      setAddError(err.message || 'Fehler beim Speichern der Ablesung.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !meter) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="glass-panel rounded-2xl border border-slate-700 w-full max-w-2xl p-5 sm:p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
              <History className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Ablesehistorie</h2>
              <p className="text-xs text-slate-400">
                {meter.name} ({meter.unit}) {meter.meter_number ? `— Nr. ${meter.meter_number}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsAddOpen(!isAddOpen)}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                isAddOpen
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddOpen ? 'Schließen' : '+ Ablesung erfassen'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Manual Past/New Entry Form */}
        {isAddOpen && (
          <form
            onSubmit={handleAddReading}
            className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-3 animate-fadeIn"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400">
                Ablesung manuell nachtragen (z.B. für historische Daten)
              </span>
            </div>

            {addError && (
              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Ablesedatum & Uhrzeit
                </label>
                <input
                  type="datetime-local"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Zählerstand ({meter.unit})
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="z.B. 12450.5"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-semibold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Notiz (Optional, z.B. "Alte Abrechnung 2024")
              </label>
              <input
                type="text"
                placeholder="z.B. Jahresablesung Stadtwerke"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow transition-all disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saving ? 'Speichern...' : 'Ablesung eintragen'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Readings List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {readings.length > 0 ? (
            <div className="divide-y divide-slate-800/60">
              {readings.map((reading, idx) => {
                // Calculate delta from next element in list (since list is desc)
                const nextReading = readings[idx + 1];
                const delta = nextReading ? reading.reading_value - nextReading.reading_value : null;

                return (
                  <div
                    key={reading.id}
                    className="py-3 px-2 flex items-center justify-between hover:bg-slate-900/40 rounded-xl transition-colors"
                  >
                    <div className="flex items-start space-x-3">
                      {/* Photo thumbnail */}
                      {reading.image_path ? (
                        <div
                          onClick={() => setSelectedPhoto(reading.image_path!)}
                          className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={reading.image_path}
                            alt="Zählerstand"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 flex-shrink-0">
                          <History className="w-5 h-5" />
                        </div>
                      )}

                      <div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-base font-bold font-mono text-white">
                            {formatNumber(reading.reading_value, 2)}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">{meter.unit}</span>

                          {delta !== null && (
                            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              +{formatNumber(delta, 2)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDateTime(reading.reading_date)}</span>
                        </div>

                        {reading.notes && (
                          <p className="text-[11px] text-slate-400/90 mt-1 italic line-clamp-1">
                            {reading.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDeleteReading(reading.id)}
                        className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Ablesung löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 text-xs">
              Keine Ablesungen für diesen Zähler hinterlegt.
            </div>
          )}
        </div>

        {/* Expanded Image Modal */}
        {selectedPhoto && (
          <div
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          >
            <div className="relative max-w-xl max-h-[85vh]">
              <img
                src={selectedPhoto}
                alt="Vergrößertes Zählerfoto"
                className="max-w-full max-h-[85vh] rounded-2xl object-contain border border-slate-700"
              />
              <button
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-3 right-3 p-2 bg-slate-900/80 rounded-full text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
