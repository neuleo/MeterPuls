import React, { useState, useEffect } from 'react';
import {
  Bot,
  Key,
  Globe,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
  EyeOff,
  Sliders,
  ExternalLink
} from 'lucide-react';
import { AISetting, AIModelItem } from '../types';
import { api } from '../api';

export const AISettings: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [models, setModels] = useState<AIModelItem[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterVisionOnly, setFilterVisionOnly] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await api.getAISettings();
      setBaseUrl(s.base_url || 'https://openrouter.ai/api');
      setApiKey(s.api_key || '');
      setSelectedModel(s.selected_model || '');
    } catch (err: any) {
      console.error('Fehler beim Laden der AI Einstellungen:', err);
    }
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // First save current URL and Key so backend can query it
      await api.updateAISettings({
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        selected_model: selectedModel
      });

      const fetched = await api.fetchAIModels();
      setModels(fetched);
      setSuccessMsg(`${fetched.length} Modelle erfolgreich vom Provider abgerufen!`);

      // If no model selected, select the first vision model
      if (!selectedModel && fetched.length > 0) {
        const firstVision = fetched.find((m) => m.is_vision);
        if (firstVision) {
          setSelectedModel(firstVision.id);
        } else {
          setSelectedModel(fetched[0].id);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Fehler beim Abrufen der Modelle.');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.updateAISettings({
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        selected_model: selectedModel.trim()
      });
      setSuccessMsg('KI-Einstellungen erfolgreich gespeichert!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Fehler beim Speichern der Einstellungen.');
    } finally {
      setSaving(false);
    }
  };

  // Preset helper
  const setPreset = (url: string, defaultMod: string) => {
    setBaseUrl(url);
    if (!selectedModel) setSelectedModel(defaultMod);
  };

  const filteredModels = models.filter((m) => {
    const matchesSearch =
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(modelSearch.toLowerCase());
    const matchesVision = filterVisionOnly ? m.is_vision : true;
    return matchesSearch && matchesVision;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-10 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          KI-Provider & Modell-Management
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          Konfigurieren Sie jeden beliebigen OpenAI-kompatiblen API-Provider für die Zähler-Vision-Erkennung.
        </p>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center space-x-2.5">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center space-x-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Quick Presets */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800">
        <span className="text-xs font-semibold text-slate-300 block mb-2">Schnell-Vorlagen:</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreset('https://openrouter.ai/api', 'openai/gpt-4o-mini')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            OpenRouter (Empfohlen)
          </button>
          <button
            type="button"
            onClick={() => setPreset('https://api.openai.com', 'gpt-4o-mini')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            OpenAI Direct
          </button>
          <button
            type="button"
            onClick={() => setPreset('http://localhost:8080', 'llava-1.6')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            LocalAI / vLLM (Lokal)
          </button>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-6">
        {/* API Base URL */}
        <div>
          <label className="block text-xs font-semibold text-slate-200 mb-1.5 flex items-center space-x-1.5">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>API Base URL</span>
          </label>
          <input
            type="url"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://openrouter.ai/api oder https://api.openai.com"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Unterstützt alle OpenAI-kompatiblen Endpunkte (hängt bei Abfrage `/v1/models` bzw. `/v1/chat/completions` an).
          </p>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-semibold text-slate-200 mb-1.5 flex items-center space-x-1.5">
            <Key className="w-4 h-4 text-emerald-400" />
            <span>API Key</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-... oder sk-proj-..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3.5 pr-12 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Wird sicher in der SQLite-Datenbank persistiert und ausschließlich für Vision-Anfragen genutzt.
          </p>
        </div>

        {/* Fetch Models Button */}
        <div className="pt-2">
          <button
            type="button"
            disabled={fetchingModels || !baseUrl}
            onClick={handleFetchModels}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${fetchingModels ? 'animate-spin' : ''}`} />
            <span>Modelle abrufen (/v1/models)</span>
          </button>
        </div>

        {/* Model Selection */}
        <div className="pt-2 border-t border-slate-800/80 space-y-3">
          <label className="block text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>Gewähltes Vision-Modell</span>
          </label>

          {/* Model Search & Vision Filter if models loaded */}
          {models.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Modell suchen..."
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white flex-1"
              />
              <button
                type="button"
                onClick={() => setFilterVisionOnly(!filterVisionOnly)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs border transition-colors ${
                  filterVisionOnly
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nur Vision-Modelle ({models.filter((m) => m.is_vision).length})</span>
              </button>
            </div>
          )}

          {/* Dropdown with dynamically fetched models */}
          {models.length > 0 ? (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="" disabled>
                -- Bitte Modell auswählen --
              </option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.is_vision ? '👁️ ' : ''}
                  {m.name || m.id} {m.is_vision ? '(Vision-fähig)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <div>
              <input
                type="text"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                placeholder="z.B. openai/gpt-4o-mini oder gpt-4o"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Tipp: Klicken Sie oben auf "Modelle abrufen", um die verfügbaren Modelle automatisch zu laden.
              </p>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Speichern...' : 'Einstellungen speichern'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
