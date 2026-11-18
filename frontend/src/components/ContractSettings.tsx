import React, { useState, useEffect } from 'react';
import {
  FileText, Save, CheckCircle2, AlertCircle, Zap, Flame, Droplets,
  Camera, Sparkles, Gift, Building, Tag, Calendar, History, Plus,
  RotateCcw, ChevronDown, ChevronUp, Clock, ArrowRight
} from 'lucide-react';
import {
  Contract, ContractListResponse, MeterCategory, AIContractScanResult, ContractDetail
} from '../types';
import { contractApi, api } from '../api';
import { formatCurrency, getCategoryLabel } from '../utils/formatters';
import { ScanContractModal } from './ScanContractModal';

const CATEGORIES: MeterCategory[] = ['electricity', 'gas', 'water'];

type FormMode = 'successor' | 'price' | 'edit' | null;

interface SuccessorDraft {
  provider_name: string;
  tariff_name: string;
  start_date: string;
  end_date: string;
  base_fee_monthly: string;
  unit_price: string;
  monthly_payment: string;
  bonus_one_time: string;
  bonus_notes: string;
  warmwater_source: string;
  heating_start_month: number;
  heating_end_month: number;
  close_predecessor: boolean;
  confirm_backdate: boolean;
}

const emptySuccessor = (): SuccessorDraft => ({
  provider_name: '',
  tariff_name: '',
  start_date: '',
  end_date: '',
  base_fee_monthly: '',
  unit_price: '',
  monthly_payment: '',
  bonus_one_time: '0',
  bonus_notes: '',
  warmwater_source: 'electricity',
  heating_start_month: 10,
  heating_end_month: 4,
  close_predecessor: true,
  confirm_backdate: false
});

export const ContractSettings: React.FC = () => {
  const [lists, setLists] = useState<Partial<Record<MeterCategory, ContractListResponse>>>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [mode, setMode] = useState<Partial<Record<MeterCategory, FormMode>>>({});
  const [successor, setSuccessor] = useState<Partial<Record<MeterCategory, SuccessorDraft>>>({});
  const [priceDraft, setPriceDraft] = useState<Record<string, any>>({});
  const [editDraft, setEditDraft] = useState<Partial<Record<MeterCategory, Partial<Contract>>>>({});
  const [preview, setPreview] = useState<Partial<Record<MeterCategory, string>>>({});
  const [openHistory, setOpenHistory] = useState<Partial<Record<MeterCategory, boolean>>>({});
  const [saving, setSaving] = useState<MeterCategory | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<AIContractScanResult | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const results = await Promise.all(CATEGORIES.map((c) => contractApi.list(c)));
    const map: Partial<Record<MeterCategory, ContractListResponse>> = {};
    CATEGORIES.forEach((c, i) => { map[c] = results[i]; });
    setLists(map);
    results.forEach((list) => {
      const cat = list.active?.category;
      if (cat) {
        setEditDraft((prev) => ({ ...prev, [cat]: { ...list.active } }));
      }
    });
  };

  const openForm = (cat: MeterCategory, nextMode: FormMode) => {
    setError(null);
    setMessage(null);
    const active = lists[cat]?.active;
    setMode((prev) => ({ ...prev, [cat]: nextMode }));
    if (nextMode === 'successor') {
      const draft = successor[cat] || emptySuccessor();
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      setSuccessor((prev) => ({
        ...prev,
        [cat]: {
          ...draft,
          start_date: draft.start_date || tomorrow,
          provider_name: draft.provider_name || active?.provider_name || '',
          base_fee_monthly: draft.base_fee_monthly || String(active?.base_fee_monthly ?? ''),
          unit_price: draft.unit_price || String(active?.unit_price ?? ''),
          monthly_payment: draft.monthly_payment || String(active?.monthly_payment ?? ''),
          warmwater_source: active?.warmwater_source || draft.warmwater_source,
          heating_start_month: active?.heating_start_month || draft.heating_start_month,
          heating_end_month: active?.heating_end_month || draft.heating_end_month
        }
      }));
      setPreview((prev) => ({ ...prev, [cat]: '' }));
    }
    if (nextMode === 'price' && active) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      setPriceDraft((prev) => ({
        ...prev,
        [cat]: {
          contract_id: active.id,
          valid_from: tomorrow,
          unit_price: String(active.unit_price),
          base_fee_monthly: String(active.base_fee_monthly),
          monthly_payment: String(active.monthly_payment),
          confirm_backdate: false
        }
      }));
    }
    if (nextMode === 'edit' && active) {
      setEditDraft((prev) => ({ ...prev, [cat]: { ...active } }));
    }
  };

  const updateSuccessor = (cat: MeterCategory, patch: Partial<SuccessorDraft>) => {
    const next = { ...(successor[cat] || emptySuccessor()), ...patch };
    setSuccessor((prev) => ({ ...prev, [cat]: next }));
    if (patch.start_date) {
      contractApi.preview(cat, patch.start_date)
        .then((p) => setPreview((prev) => ({ ...prev, [cat]: [p.message, ...p.warnings].join(' ') })))
        .catch(() => setPreview((prev) => ({ ...prev, [cat]: '' })));
    }
  };

  const applyScan = (result: AIContractScanResult) => {
    setScanned(result);
    const cat = result.category;
    const start = result.start_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const draft: SuccessorDraft = {
      ...emptySuccessor(),
      provider_name: result.provider_name || '',
      tariff_name: result.tariff_name || '',
      start_date: start,
      end_date: result.end_date || '',
      base_fee_monthly: String(result.base_fee_monthly ?? ''),
      unit_price: String(result.unit_price ?? ''),
      monthly_payment: String(result.monthly_payment ?? ''),
      bonus_one_time: String(result.bonus_one_time ?? 0),
      bonus_notes: result.bonus_notes || ''
    };
    setSuccessor((prev) => ({ ...prev, [cat]: draft }));
    setMode((prev) => ({ ...prev, [cat]: 'successor' }));
    contractApi.preview(cat, start)
      .then((p) => setPreview((prev) => ({ ...prev, [cat]: [p.message, ...p.warnings].join(' ') })))
      .catch(() => undefined);
    setMessage('Scan-Entwurf übernommen. Bitte Startdatum und Konditionen prüfen und bestätigen.');
  };

  const saveSuccessor = async (cat: MeterCategory) => {
    const d = successor[cat];
    if (!d?.start_date) { setError('Bitte ein Startdatum angeben.'); return; }
    setSaving(cat); setError(null); setMessage(null);
    try {
      const res = await contractApi.plan({
        category: cat,
        provider_name: d.provider_name || null,
        tariff_name: d.tariff_name || null,
        start_date: d.start_date,
        end_date: d.end_date || null,
        base_fee_monthly: Number(d.base_fee_monthly) || 0,
        unit_price: Number(d.unit_price) || 0,
        monthly_payment: Number(d.monthly_payment) || 0,
        bonus_one_time: Number(d.bonus_one_time) || 0,
        bonus_notes: d.bonus_notes || null,
        warmwater_source: d.warmwater_source,
        heating_start_month: d.heating_start_month,
        heating_end_month: d.heating_end_month,
        close_predecessor: d.close_predecessor,
        confirm_backdate: d.confirm_backdate
      });
      setMessage(res.message);
      setMode((prev) => ({ ...prev, [cat]: null }));
      setSuccessor((prev) => ({ ...prev, [cat]: emptySuccessor() }));
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Vertrag konnte nicht gespeichert werden.');
    } finally { setSaving(null); }
  };

  const savePrice = async (cat: MeterCategory) => {
    const d = priceDraft[cat];
    if (!d?.valid_from) { setError('Bitte "Gültig ab" angeben.'); return; }
    setSaving(cat); setError(null); setMessage(null);
    try {
      const res = await contractApi.priceChange({
        contract_id: d.contract_id,
        valid_from: d.valid_from,
        unit_price: Number(d.unit_price) || 0,
        base_fee_monthly: Number(d.base_fee_monthly) || 0,
        monthly_payment: Number(d.monthly_payment) || 0,
        confirm_backdate: d.confirm_backdate
      });
      setMessage(res.message);
      setMode((prev) => ({ ...prev, [cat]: null }));
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Preisänderung konnte nicht gespeichert werden.');
    } finally { setSaving(null); }
  };

  const saveEdit = async (cat: MeterCategory) => {
    const d = editDraft[cat];
    if (!d) return;
    setSaving(cat); setError(null); setMessage(null);
    try {
      await api.updateContract(cat, {
        provider_name: d.provider_name || null,
        tariff_name: d.tariff_name || null,
        base_fee_monthly: Number(d.base_fee_monthly) || 0,
        unit_price: Number(d.unit_price) || 0,
        monthly_payment: Number(d.monthly_payment) || 0,
        bonus_one_time: Number(d.bonus_one_time) || 0,
        bonus_notes: d.bonus_notes || null,
        warmwater_source: d.warmwater_source,
        heating_start_month: d.heating_start_month,
        heating_end_month: d.heating_end_month
      });
      setMessage('Aktueller Tarif aktualisiert.');
      setMode((prev) => ({ ...prev, [cat]: null }));
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Tarif konnte nicht aktualisiert werden.');
    } finally { setSaving(null); }
  };

  const cancelChange = async (cat: MeterCategory, kind: 'contract' | 'price', id: number) => {
    setError(null); setMessage(null);
    try {
      const res = kind === 'contract'
        ? await contractApi.cancelContract(id)
        : await contractApi.cancelPrice(id);
      setMessage(res.message);
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Änderung konnte nicht zurückgenommen werden.');
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-10 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Tarif- &amp; Vertragsdaten</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Aktueller Tarif, nächste Änderung und Verlauf. Zukünftige Verträge und Preise ändern die heutigen Kosten nicht.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-xs shadow-lg shadow-amber-500/20"
        >
          <Camera className="w-4 h-4" /><Sparkles className="w-3.5 h-3.5 text-amber-200" />
          <span>Tarif-Screenshots per KI scannen</span>
        </button>
      </div>

      {message && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center space-x-2.5">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" /><span>{message}</span>
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center space-x-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const list = lists[cat];
          const active = list?.active;
          const next = list?.next_change;
          const label = getCategoryLabel(cat);
          const unit = cat === 'electricity' ? 'kWh' : 'm³';
          const activePrice = active?.prices?.length
            ? [...active.prices].sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]
            : null;
          const displayedUnitPrice = activePrice?.unit_price ?? active?.unit_price ?? 0;
          const displayedBase = activePrice?.base_fee_monthly ?? active?.base_fee_monthly ?? 0;
          const m = mode[cat] || null;

          return (
            <section key={cat} className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <div className={`p-2 rounded-xl ${cat === 'electricity' ? 'bg-amber-500/10 text-amber-400' : cat === 'gas' ? 'bg-orange-500/10 text-orange-400' : 'bg-sky-500/10 text-sky-400'}`}>
                    {cat === 'electricity' ? <Zap className="w-5 h-5" /> : cat === 'gas' ? <Flame className="w-5 h-5" /> : <Droplets className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-base">{label}</h2>
                    <p className="text-[11px] text-slate-400">{active ? `${active.provider_name || 'Anbieter unbekannt'} · ${active.tariff_name || 'Tarif'}` : 'Kein aktiver Tarif hinterlegt'}</p>
                  </div>
                </div>
                {active ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Aktiv</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">Tarif fehlt</span>
                )}
              </div>

              {active ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <InfoTile icon={<Calendar className="w-3.5 h-3.5" />} label="Laufzeit" value={`${active.start_date} – ${active.end_date || 'offen'}`} />
                  <InfoTile icon={<Tag className="w-3.5 h-3.5" />} label="Arbeitspreis" value={`${formatCurrency(displayedUnitPrice)} / ${unit}`} />
                  <InfoTile icon={<Building className="w-3.5 h-3.5" />} label="Grundpreis" value={`${formatCurrency(displayedBase)} / Mt.`} />
                  <InfoTile icon={<Clock className="w-3.5 h-3.5" />} label="Abschlag" value={active.monthly_payment > 0 ? `${formatCurrency(active.monthly_payment)} / Mt.` : 'keiner'} />
                  {(active.bonus_one_time ?? 0) > 0 && (
                    <div className="col-span-2 sm:col-span-4 flex items-center space-x-1.5 text-amber-300">
                      <Gift className="w-3.5 h-3.5" />
                      <span>Einmalbonus {formatCurrency(active.bonus_one_time || 0)}{active.bonus_notes ? ` (${active.bonus_notes})` : ''} – wird nur einmal je Vertrag berücksichtigt.</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Ohne Tarif werden Verbräuche angezeigt, aber keine Kosten berechnet. Die Ablesung ist trotzdem möglich.</p>
              )}

              {!!list?.gaps?.length && (
                <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">
                  Kein Tarif hinterlegt: {list.gaps.map((g) => `${g.start_date} – ${g.end_date}`).join(', ')}. Der Verbrauch bleibt sichtbar, der Zeitraum wird nicht mit 0 € bepreist.
                </div>
              )}

              {next && (
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-indigo-300 flex items-center space-x-1.5"><ArrowRight className="w-3.5 h-3.5" /> Nächste Änderung ab {next.start_date}</span>
                    <button type="button" onClick={() => cancelChange(cat, 'contract', next.id)} className="flex items-center space-x-1 text-[11px] text-slate-300 hover:text-rose-300">
                      <RotateCcw className="w-3 h-3" /><span>Zurücknehmen</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {next.provider_name || 'Neuer Tarif'} · {formatCurrency(next.unit_price)} / {unit} · {formatCurrency(next.base_fee_monthly)} / Mt.
                  </p>
                  {next.prices.filter((p) => p.valid_from > next.start_date).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Preisänderung ab {p.valid_from}: {formatCurrency(p.unit_price)} / {unit}</span>
                      <button type="button" onClick={() => cancelChange(cat, 'price', p.id)} className="text-slate-400 hover:text-rose-300">Zurücknehmen</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => openForm(cat, 'successor')} className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium border border-slate-700">
                  <Plus className="w-3.5 h-3.5 text-emerald-400" /><span>Folgevertrag planen</span>
                </button>
                <button type="button" onClick={() => openForm(cat, 'price')} disabled={!active} className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium border border-slate-700 disabled:opacity-40">
                  <Tag className="w-3.5 h-3.5 text-amber-400" /><span>Preisänderung eintragen</span>
                </button>
                <button type="button" onClick={() => openForm(cat, 'edit')} disabled={!active} className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium border border-slate-700 disabled:opacity-40">
                  <Save className="w-3.5 h-3.5" /><span>Aktuellen Tarif anpassen</span>
                </button>
                <button type="button" onClick={() => setOpenHistory((p) => ({ ...p, [cat]: !p[cat] }))} className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs border border-slate-800">
                  <History className="w-3.5 h-3.5" /><span>Verlauf</span>
                  {openHistory[cat] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {openHistory[cat] && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  {(list?.history || []).length === 0 && <p className="text-[11px] text-slate-500">Keine früheren Verträge gespeichert.</p>}
                  {list?.history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-900/60 rounded-lg px-3 py-2">
                      <span>{h.provider_name || 'Tarif'} · {h.start_date} – {h.end_date || 'offen'}</span>
                      <span className="font-mono text-slate-300">{formatCurrency(h.unit_price)} / {unit}</span>
                    </div>
                  ))}
                </div>
              )}

              {m === 'successor' && successor[cat] && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-3">
                  <h3 className="text-xs font-bold text-white flex items-center space-x-1.5"><Calendar className="w-3.5 h-3.5 text-emerald-400" /> Folgevertrag planen</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Startdatum" value={successor[cat]!.start_date} type="date" onChange={(v) => updateSuccessor(cat, { start_date: v })} />
                    <Field label="Enddatum (optional)" value={successor[cat]!.end_date} type="date" onChange={(v) => updateSuccessor(cat, { end_date: v })} />
                    <Field label="Anbieter" value={successor[cat]!.provider_name} onChange={(v) => updateSuccessor(cat, { provider_name: v })} />
                    <Field label="Tarifname" value={successor[cat]!.tariff_name} onChange={(v) => updateSuccessor(cat, { tariff_name: v })} />
                    <Field label={`Arbeitspreis (€/${unit})`} value={successor[cat]!.unit_price} type="number" onChange={(v) => updateSuccessor(cat, { unit_price: v })} />
                    <Field label="Grundpreis (€/Mt.)" value={successor[cat]!.base_fee_monthly} type="number" onChange={(v) => updateSuccessor(cat, { base_fee_monthly: v })} />
                    <Field label="Abschlag (€/Mt.)" value={successor[cat]!.monthly_payment} type="number" onChange={(v) => updateSuccessor(cat, { monthly_payment: v })} />
                    <Field label="Einmalbonus (€)" value={successor[cat]!.bonus_one_time} type="number" onChange={(v) => updateSuccessor(cat, { bonus_one_time: v })} />
                  </div>
                  {cat === 'gas' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="text-[11px] text-slate-400">Warmwasser
                        <select value={successor[cat]!.warmwater_source} onChange={(e) => updateSuccessor(cat, { warmwater_source: e.target.value })} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white">
                          <option value="electricity">über Strom</option><option value="gas">über Gas</option>
                        </select>
                      </label>
                      <label className="text-[11px] text-slate-400">Heizbeginn
                        <select value={successor[cat]!.heating_start_month} onChange={(e) => updateSuccessor(cat, { heating_start_month: Number(e.target.value) })} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white">
                          {[9, 10, 11].map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </label>
                      <label className="text-[11px] text-slate-400">Heizende
                        <select value={successor[cat]!.heating_end_month} onChange={(e) => updateSuccessor(cat, { heating_end_month: Number(e.target.value) })} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white">
                          {[3, 4, 5].map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                  <label className="flex items-center space-x-2 text-[11px] text-slate-300">
                    <input type="checkbox" checked={successor[cat]!.close_predecessor} onChange={(e) => updateSuccessor(cat, { close_predecessor: e.target.checked })} />
                    <span>Offenen Vorgänger am Tag vor Beginn beenden (gemeinsam speichern)</span>
                  </label>
                  {preview[cat] && <div className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">{preview[cat]}</div>}
                  {scanned && scanned.category === cat && <div className="text-[11px] text-amber-300">Entwurf aus dem KI-Scan – bitte prüfen. Erst die Bestätigung speichert den Vertrag.</div>}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setMode((p) => ({ ...p, [cat]: null }))} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300">Abbrechen</button>
                    <button type="button" disabled={saving === cat} onClick={() => saveSuccessor(cat)} className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">Übergang bestätigen &amp; speichern</button>
                  </div>
                </div>
              )}

              {m === 'price' && priceDraft[cat] && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-3">
                  <h3 className="text-xs font-bold text-white flex items-center space-x-1.5"><Tag className="w-3.5 h-3.5 text-amber-400" /> Preisänderung eintragen</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Gültig ab" value={priceDraft[cat].valid_from} type="date" onChange={(v) => setPriceDraft((p) => ({ ...p, [cat]: { ...p[cat], valid_from: v } }))} />
                    <Field label={`Neuer Arbeitspreis (€/${unit})`} value={priceDraft[cat].unit_price} type="number" onChange={(v) => setPriceDraft((p) => ({ ...p, [cat]: { ...p[cat], unit_price: v } }))} />
                    <Field label="Neuer Grundpreis (€/Mt.)" value={priceDraft[cat].base_fee_monthly} type="number" onChange={(v) => setPriceDraft((p) => ({ ...p, [cat]: { ...p[cat], base_fee_monthly: v } }))} />
                    <Field label="Neuer Abschlag (€/Mt.)" value={priceDraft[cat].monthly_payment} type="number" onChange={(v) => setPriceDraft((p) => ({ ...p, [cat]: { ...p[cat], monthly_payment: v } }))} />
                  </div>
                  <p className="text-[11px] text-slate-400">Anbieter, Vertragsbeginn und Bonus bleiben erhalten. Nicht geänderte Preisbestandteile gelten weiter.</p>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="flex items-center space-x-2 text-[11px] text-slate-300">
                      <input type="checkbox" checked={!!priceDraft[cat].confirm_backdate} onChange={(e) => setPriceDraft((p) => ({ ...p, [cat]: { ...p[cat], confirm_backdate: e.target.checked } }))} />
                      <span>Rückwirkend bestätigen</span>
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMode((p) => ({ ...p, [cat]: null }))} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300">Abbrechen</button>
                      <button type="button" disabled={saving === cat} onClick={() => savePrice(cat)} className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-50">Alt vs. Neu prüfen &amp; speichern</button>
                    </div>
                  </div>
                </div>
              )}

              {m === 'edit' && editDraft[cat] && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 space-y-3">
                  <h3 className="text-xs font-bold text-white">Aktuellen Tarif anpassen</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Anbieter" value={editDraft[cat]!.provider_name || ''} onChange={(v) => setEditDraft((p) => ({ ...p, [cat]: { ...p[cat]!, provider_name: v } }))} />
                    <Field label="Tarifname" value={editDraft[cat]!.tariff_name || ''} onChange={(v) => setEditDraft((p) => ({ ...p, [cat]: { ...p[cat]!, tariff_name: v } }))} />
                    <Field label={`Arbeitspreis (€/${unit})`} value={String(editDraft[cat]!.unit_price ?? '')} type="number" onChange={(v) => setEditDraft((p) => ({ ...p, [cat]: { ...p[cat]!, unit_price: Number(v) } }))} />
                    <Field label="Grundpreis (€/Mt.)" value={String(editDraft[cat]!.base_fee_monthly ?? '')} type="number" onChange={(v) => setEditDraft((p) => ({ ...p, [cat]: { ...p[cat]!, base_fee_monthly: Number(v) } }))} />
                    <Field label="Abschlag (€/Mt.)" value={String(editDraft[cat]!.monthly_payment ?? '')} type="number" onChange={(v) => setEditDraft((p) => ({ ...p, [cat]: { ...p[cat]!, monthly_payment: Number(v) } }))} />
                    <Field label="Einmalbonus (€)" value={String(editDraft[cat]!.bonus_one_time ?? '')} type="number" onChange={(v) => setEditDraft((p) => ({ ...p, [cat]: { ...p[cat]!, bonus_one_time: Number(v) } }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setMode((p) => ({ ...p, [cat]: null }))} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300">Abbrechen</button>
                    <button type="button" disabled={saving === cat} onClick={() => saveEdit(cat)} className="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold disabled:opacity-50">Speichern</button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <ScanContractModal
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        onApplyContract={applyScan}
      />
    </div>
  );
};

const InfoTile: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
    <div className="flex items-center space-x-1 text-[10px] text-slate-400">{icon}<span>{label}</span></div>
    <div className="text-[11px] font-mono text-white break-words">{value}</div>
  </div>
);

const Field: React.FC<{ label: string; value: string; type?: string; onChange: (v: string) => void }> = ({ label, value, type = 'text', onChange }) => (
  <label className="block text-[11px] text-slate-400">
    {label}
    <input
      type={type}
      step={type === 'number' ? 'any' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
    />
  </label>
);
