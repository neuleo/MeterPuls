import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  ExternalLink,
  Bot,
  RefreshCw,
  FileText,
  CheckCircle2,
  Info
} from 'lucide-react';
import { api } from '../api';
import { ExportDataResponse } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'csv'>('ai');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExportDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'prompt' | 'readings' | 'monthly' | null>(null);

  const loadExportData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getExportData();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Exportdaten');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadExportData();
      setCopiedType(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyToClipboard = async (text: string, type: 'prompt' | 'readings' | 'monthly') => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 3500);
    } catch (err) {
      console.error('Kopieren fehlgeschlagen:', err);
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        data-testid="export-modal"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <span>Daten-Export &amp; KI-Analyse</span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ready for ChatGPT &amp; Claude
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Kopiere alle Haushaltsdaten für eine externe KI-Einschätzung oder lade sie als CSV herunter.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadExportData}
              disabled={loading}
              title="Daten neu generieren"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 sm:px-6">
          <button
            data-testid="tab-ai-prompt"
            onClick={() => setActiveTab('ai')}
            className={`flex items-center space-x-2 py-3 px-4 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'ai'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>🤖 Für KI kopieren (ChatGPT / Claude)</span>
          </button>
          <button
            data-testid="tab-csv-download"
            onClick={() => setActiveTab('csv')}
            className={`flex items-center space-x-2 py-3 px-4 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'csv'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>📑 CSV-Dateien herunterladen</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-sm">Generiere KI-Prompt und CSV-Datensätze...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
              <p className="font-semibold">Fehler beim Laden:</p>
              <p className="mt-1">{error}</p>
            </div>
          ) : data ? (
            activeTab === 'ai' ? (
              /* TAB 1: AI COPY */
              <div className="space-y-5">
                {/* Highlight Callout Box */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Fertiger Prompt für deine KI bereit</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
                        Enthält all deine Zählerstände, Tarife, Abschläge, den wichtigen Hinweis zu{' '}
                        <strong className="text-emerald-300">Warmwasser über Strom</strong> &amp; Sommerpause sowie 6 konkrete Analysefragen für die KI.
                      </p>
                    </div>

                    <button
                      onClick={() => copyToClipboard(data.ai_prompt, 'prompt')}
                      className={`inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-lg transform active:scale-95 ${
                        copiedType === 'prompt'
                          ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/30'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/20 hover:shadow-emerald-500/40'
                      }`}
                    >
                      {copiedType === 'prompt' ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>✓ In Zwischenablage kopiert!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Prompt kopieren</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick Launch Buttons for External AIs */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-slate-400 mr-1 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" /> Direkt öffnen &amp; einfügen:
                  </span>
                  <a
                    href="https://chatgpt.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 transition-colors"
                  >
                    <span>ChatGPT</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                  <a
                    href="https://claude.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 transition-colors"
                  >
                    <span>Claude</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                  <a
                    href="https://gemini.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 transition-colors"
                  >
                    <span>Google Gemini</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                </div>

                {/* Prompt Preview Box */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-slate-300">
                      Vorschau des generierten KI-Prompts:
                    </span>
                    <span>{data.ai_prompt.length} Zeichen</span>
                  </div>
                  <div className="relative group">
                    <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 text-slate-300 text-xs font-mono leading-relaxed overflow-x-auto max-h-80 whitespace-pre-wrap selection:bg-emerald-500/40">
                      {data.ai_prompt}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(data.ai_prompt, 'prompt')}
                      className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs flex items-center space-x-1.5 opacity-90 group-hover:opacity-100 transition-opacity border border-slate-700 shadow"
                    >
                      {copiedType === 'prompt' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Kopiert</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Kopieren</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* TAB 2: CSV DOWNLOAD */
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card 1: Readings CSV */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-emerald-400">
                        <FileSpreadsheet className="w-5 h-5" />
                        <h3 className="font-bold text-white text-base">Zählerstände (.csv)</h3>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Vollständige Tabelle aller abgelesenen Zählerstände mit Zählernummer, Differenz zum Vorwert,
                        vergangenen Tagen und errechnetem Tagesverbrauch.
                      </p>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Format: UTF-8 mit BOM, Semikolon-getrennt (direkt doppelklickbar in Microsoft Excel)
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() =>
                          downloadFile(
                            data.csv_readings,
                            `meterpulse_zaehlerstaende_${todayStr}.csv`
                          )
                        }
                        className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-500/20 transition-all"
                      >
                        <Download className="w-4 h-4" />
                        <span>CSV herunterladen</span>
                      </button>

                      <button
                        onClick={() => copyToClipboard(data.csv_readings, 'readings')}
                        className="inline-flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                        title="CSV in Zwischenablage kopieren"
                      >
                        {copiedType === 'readings' ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-400" />
                        )}
                        <span>{copiedType === 'readings' ? 'Kopiert' : 'Kopieren'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Monthly Breakdown CSV */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-teal-400">
                        <FileText className="w-5 h-5" />
                        <h3 className="font-bold text-white text-base">Monatsübersicht (.csv)</h3>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Monatliche Verbrauchswerte und berechnete Kosten für Strom (kWh), Gas (m³) und Wasser (m³) inklusive
                        Saisonalitätsprognosen bis Jahresende.
                      </p>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Format: UTF-8 mit BOM, Semikolon-getrennt (12 Monate 2026)
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() =>
                          downloadFile(
                            data.csv_monthly,
                            `meterpulse_monatsverbraeuche_${todayStr}.csv`
                          )
                        }
                        className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs shadow-lg shadow-teal-500/20 transition-all"
                      >
                        <Download className="w-4 h-4" />
                        <span>CSV herunterladen</span>
                      </button>

                      <button
                        onClick={() => copyToClipboard(data.csv_monthly, 'monthly')}
                        className="inline-flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                        title="CSV in Zwischenablage kopieren"
                      >
                        {copiedType === 'monthly' ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-400" />
                        )}
                        <span>{copiedType === 'monthly' ? 'Kopiert' : 'Kopieren'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* CSV Preview snippet */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Vorschau Zählerstände-CSV (Auszug):
                  </span>
                  <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 text-slate-400 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-48 whitespace-pre">
                    {data.csv_readings.slice(0, 800)}...
                  </pre>
                </div>
              </div>
            )
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/60 text-xs text-slate-400">
          <span className="truncate mr-4">
            {data?.summary_text || 'MeterPulse Export'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors font-medium"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
