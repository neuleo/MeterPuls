import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { MeterManagement } from './components/MeterManagement';
import { ContractSettings } from './components/ContractSettings';
import { AISettings } from './components/AISettings';
import { ScanMeterModal } from './components/ScanMeterModal';
import { ReadingHistoryModal } from './components/ReadingHistoryModal';
import { CategoryDetailDashboard } from './components/CategoryDetailDashboard';
import { ExportModal } from './components/ExportModal';
import { Meter, MeterCategory } from './types';
import { api } from './api';

export type Tab = 'dashboard' | 'meters' | 'contracts' | 'ai-settings';

interface Route {
  tab: Tab;
  category: MeterCategory | null;
}

const CATEGORIES: MeterCategory[] = ['electricity', 'gas', 'water'];

function parseLocation(): Route {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'category' && CATEGORIES.includes(parts[1] as MeterCategory)) {
    return { tab: 'dashboard', category: parts[1] as MeterCategory };
  }
  if (parts[0] === 'contracts') {
    return { tab: 'contracts', category: CATEGORIES.includes(parts[1] as MeterCategory) ? parts[1] as MeterCategory : null };
  }
  if (parts[0] === 'meters') return { tab: 'meters', category: null };
  if (parts[0] === 'ai-settings') return { tab: 'ai-settings', category: null };
  return { tab: 'dashboard', category: null };
}

function pathFor(tab: Tab, category: MeterCategory | null = null): string {
  if (tab === 'dashboard') return category ? `/category/${category}` : '/';
  if (tab === 'contracts') return category ? `/contracts/${category}` : '/contracts';
  return `/${tab}`;
}

export const App: React.FC = () => {
  const [route, setRoute] = useState<Route>(() => parseLocation());
  const [meters, setMeters] = useState<Meter[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMeterId, setScanMeterId] = useState<number | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyMeter, setHistoryMeter] = useState<Meter | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadMeters = useCallback(async () => {
    try {
      const data = await api.getMeters();
      setMeters(data);
    } catch (err) {
      console.error('Fehler beim Laden der Zähler:', err);
    }
  }, []);

  useEffect(() => { loadMeters(); }, [loadMeters]);

  useEffect(() => {
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (tab: Tab, category: MeterCategory | null = null, fromDetail = false) => {
    const path = pathFor(tab, category);
    if (window.location.pathname !== path) {
      window.history.pushState({ fromDetail }, '', path);
    }
    setRoute({ tab, category });
    window.scrollTo({ top: 0 });
  };

  const handleTabChange = (tab: string) => navigate(tab as Tab);
  const handleSelectCategory = (category: MeterCategory) => navigate('dashboard', category, true);

  const openScan = (category?: MeterCategory) => {
    const meter = category ? meters.find((m) => m.category === category) : undefined;
    setScanMeterId(meter?.id);
    setScanOpen(true);
  };

  const handleDataChanged = () => {
    loadMeters();
    setRefreshKey((k) => k + 1);
  };

  const detailBack = () => {
    if (window.history.state?.fromDetail) {
      window.history.back();
    } else {
      navigate('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      <Navbar
        currentTab={route.tab}
        onTabChange={handleTabChange}
        onOpenScan={() => openScan()}
        onOpenExport={() => setExportOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {route.tab === 'dashboard' && (
          route.category ? (
            <CategoryDetailDashboard
              key={route.category}
              category={route.category}
              refreshKey={refreshKey}
              onBack={detailBack}
              onSelectCategory={(cat) => navigate('dashboard', cat, true)}
              onOpenScan={() => openScan(route.category || undefined)}
              onOpenExport={() => setExportOpen(true)}
              onOpenHistory={(meter) => setHistoryMeter(meter)}
              onNavigateToContracts={() => navigate('contracts', route.category || undefined)}
              onNavigateToMeters={() => navigate('meters')}
            />
          ) : (
            <Dashboard
              refreshKey={refreshKey}
              onOpenScan={() => openScan()}
              onOpenExport={() => setExportOpen(true)}
              onSelectCategory={handleSelectCategory}
            />
          )
        )}

        {route.tab === 'meters' && (
          <MeterManagement
            meters={meters}
            onRefresh={handleDataChanged}
            onOpenHistory={(meter) => setHistoryMeter(meter)}
            onOpenScan={(meter) => { setScanMeterId(meter.id); setScanOpen(true); }}
          />
        )}

        {route.tab === 'contracts' && <ContractSettings />}

        {route.tab === 'ai-settings' && <AISettings />}
      </main>

      <ScanMeterModal
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        onSuccess={handleDataChanged}
        meters={meters}
        preselectedMeterId={scanMeterId}
        onManualEntry={(meter) => {
          setScanOpen(false);
          setHistoryMeter(meter || meters[0] || null);
        }}
      />

      <ReadingHistoryModal
        isOpen={!!historyMeter}
        onClose={() => setHistoryMeter(null)}
        meter={historyMeter}
        onRefresh={handleDataChanged}
      />

      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
};

export default App;
