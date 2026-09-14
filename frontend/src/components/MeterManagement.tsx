import React, { useState } from 'react';
import {
  Plus,
  Gauge,
  Zap,
  Flame,
  Droplets,
  Edit2,
  Trash2,
  History,
  MapPin,
  Barcode,
  Calendar,
  Layers
} from 'lucide-react';
import { Meter, MeterCategory } from '../types';
import { api } from '../api';
import { formatNumber, formatDate, getCategoryColor, getCategoryLabel } from '../utils/formatters';

interface MeterManagementProps {
  meters: Meter[];
  onRefresh: () => void;
  onOpenHistory: (meter: Meter) => void;
}

export const MeterManagement: React.FC<MeterManagementProps> = ({
  meters,
  onRefresh,
  onOpenHistory
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MeterCategory>('electricity');
  const [unit, setUnit] = useState('kWh');
  const [meterNumber, setMeterNumber] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openAddModal = (defaultCategory?: MeterCategory) => {
    setEditingMeter(null);
    setName('');
    const cat = defaultCategory || 'electricity';
    setCategory(cat);
    setUnit(cat === 'electricity' ? 'kWh' : 'm³');
    setMeterNumber('');
    setLocation('');
    setError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (meter: Meter) => {
    setEditingMeter(meter);
    setName(meter.name);
    setCategory(meter.category);
    setUnit(meter.unit);
    setMeterNumber(meter.meter_number || '');
    setLocation(meter.location || '');
    setError(null);
    setIsAddModalOpen(true);
  };

  const handleCategoryChange = (newCat: MeterCategory) => {
    setCategory(newCat);
    setUnit(newCat === 'electricity' ? 'kWh' : 'm³');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Bitte geben Sie einen Namen für den Zähler ein.');
      return;
    }

    try {
      if (editingMeter) {
        await api.updateMeter(editingMeter.id, {
          name: name.trim(),
          unit,
          meter_number: meterNumber.trim() || undefined,
          location: location.trim() || undefined
        });
      } else {
        await api.createMeter({
          name: name.trim(),
          category,
          unit,
          meter_number: meterNumber.trim() || undefined,
          location: location.trim() || undefined
        });
      }
      setIsAddModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern des Zählers.');
    }
  };

  const handleDelete = async (meter: Meter) => {
    if (window.confirm(`Möchten Sie den Zähler "${meter.name}" und alle zugehörigen Ablesungen wirklich löschen?`)) {
      try {
        await api.deleteMeter(meter.id);
        onRefresh();
      } catch (err: any) {
        alert(err.message || 'Fehler beim Löschen des Zählers.');
      }
    }
  };

  // Group meters by category
  const categories: MeterCategory[] = ['electricity', 'gas', 'water'];

  return (
    <div className="space-y-6 pb-20 md:pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Zähler-Verwaltung
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Multi-Zähler Management: Beliebig viele Zähler pro Sparte verwalten & addieren
          </p>
        </div>

        <button
          onClick={() => openAddModal()}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-medium text-sm shadow-lg shadow-emerald-500/25 transition-all active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Neuen Zähler anlegen</span>
        </button>
      </div>

      {/* Category Sections */}
      <div className="space-y-8">
        {categories.map((cat) => {
          const catMeters = meters.filter((m) => m.category === cat);
          const colors = getCategoryColor(cat);
          const label = getCategoryLabel(cat);

          // Calculate sum of latest readings in this category
          const totalLatest = catMeters.reduce((acc, m) => acc + (m.latest_reading || 0), 0);
          const defaultUnit = cat === 'electricity' ? 'kWh' : 'm³';

          return (
            <div key={cat} className="space-y-3">
              {/* Category Header & Aggregate Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-xl ${colors.bg} border ${colors.border}`}>
                    {cat === 'electricity' && <Zap className="w-5 h-5 text-amber-400" />}
                    {cat === 'gas' && <Flame className="w-5 h-5 text-orange-400" />}
                    {cat === 'water' && <Droplets className="w-5 h-5 text-sky-400" />}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center space-x-2">
                      <span>{label}</span>
                      <span className="text-xs font-normal text-slate-400">
                        ({catMeters.length} {catMeters.length === 1 ? 'Zähler' : 'Zähler'})
                      </span>
                    </h2>
                    <span className="text-xs text-slate-400">
                      Summe aktueller Stände:{' '}
                      <span className="font-mono font-semibold text-white">
                        {formatNumber(totalLatest, 1)} {defaultUnit}
                      </span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => openAddModal(cat)}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ {label}-Zähler</span>
                </button>
              </div>

              {/* Meter Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catMeters.map((meter) => (
                  <div
                    key={meter.id}
                    className="glass-card rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-all duration-200 flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Info */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-white text-base">{meter.name}</h3>
                          {meter.meter_number && (
                            <div className="flex items-center space-x-1 text-xs text-slate-400 mt-0.5">
                              <Barcode className="w-3.5 h-3.5 text-slate-500" />
                              <span className="font-mono">Nr: {meter.meter_number}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => openEditModal(meter)}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                            title="Bearbeiten"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(meter)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Location badge */}
                      {meter.location && (
                        <div className="flex items-center space-x-1 text-xs text-slate-400 mt-2">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          <span>{meter.location}</span>
                        </div>
                      )}

                      {/* Reading Value Display */}
                      <div className="mt-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
                        <span className="text-[11px] text-slate-400 block mb-0.5">
                          Letzter Stand
                        </span>
                        <div className="flex items-baseline space-x-1.5">
                          <span className="text-2xl font-mono font-bold text-white">
                            {meter.latest_reading !== null && meter.latest_reading !== undefined
                              ? formatNumber(meter.latest_reading, 2)
                              : '—'}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">{meter.unit}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                          <span>Abgelesen am:</span>
                          <span>{formatDate(meter.latest_reading_date || '')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-500">{meter.reading_count} Ablesungen</span>
                      <button
                        onClick={() => onOpenHistory(meter)}
                        className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Historie anzeigen</span>
                      </button>
                    </div>
                  </div>
                ))}

                {catMeters.length === 0 && (
                  <div className="col-span-full p-6 rounded-2xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                    Keine Zähler für {label} vorhanden. Klicken Sie oben auf "+ {label}-Zähler", um einen hinzuzufügen.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Meter Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl border border-slate-700 w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">
              {editingMeter ? 'Zähler bearbeiten' : 'Neuen Zähler anlegen'}
            </h2>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Name des Zählers *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Gartenwasser, Wärmepumpe, Einliegerwohnung"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {!editingMeter && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Sparte *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => handleCategoryChange(e.target.value as MeterCategory)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="electricity">Strom (kWh)</option>
                    <option value="gas">Gas (m³)</option>
                    <option value="water">Wasser (m³)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Zählernummer / Seriennummer (Optional)
                </label>
                <input
                  type="text"
                  value={meterNumber}
                  onChange={(e) => setMeterNumber(e.target.value)}
                  placeholder="z.B. 1EMH00123456"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Standort / Notiz (Optional)
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="z.B. Keller Zählerschrank, Gartenanschluss"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
                >
                  {editingMeter ? 'Speichern' : 'Zähler anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
