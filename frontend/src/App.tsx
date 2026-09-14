import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { MeterManagement } from './components/MeterManagement';
import { ContractSettings } from './components/ContractSettings';
import { AISettings } from './components/AISettings';
import { ScanMeterModal } from './components/ScanMeterModal';
import { ReadingHistoryModal } from './components/ReadingHistoryModal';
import { CategoryDetailDashboard } from './components/CategoryDetailDashboard';
import { Meter, MeterCategory } from './types';
import { api } from './api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>(() => {
    return localStorage.getItem('meterpulse_current_tab') || 'dashboard';
  });
  const [selectedDetailCategory, setSelectedDetailCategory] = useState<MeterCategory | null>(() => {
    const saved = localStorage.getItem('meterpulse_detail_category');
    return (saved as MeterCategory) || null;
  });
  const [meters, setMeters] = useState<Meter[]>([]);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [selectedHistoryMeter, setSelectedHistoryMeter] = useState<Meter | null>(null);

  const handleTabChange = (tab: string) => {
    if (tab === 'dashboard') {
      setSelectedDetailCategory(null);
      localStorage.removeItem('meterpulse_detail_category');
    }
    setCurrentTab(tab);
    localStorage.setItem('meterpulse_current_tab', tab);
  };

  const loadMeters = async () => {
    try {
      const data = await api.getMeters();
      setMeters(data);
    } catch (err) {
      console.error('Fehler beim Laden der Zähler:', err);
    }
  };

  useEffect(() => {
    loadMeters();
  }, []);

  const handleSelectCategory = (category: MeterCategory) => {
    setSelectedDetailCategory(category);
    setCurrentTab('dashboard');
    localStorage.setItem('meterpulse_detail_category', category);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Navigation */}
      <Navbar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onOpenScan={() => setIsScanModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {currentTab === 'dashboard' && (
          selectedDetailCategory ? (
            <CategoryDetailDashboard
              category={selectedDetailCategory}
              onBack={() => {
                setSelectedDetailCategory(null);
                localStorage.removeItem('meterpulse_detail_category');
              }}
              onSelectCategory={(cat) => {
                setSelectedDetailCategory(cat);
                localStorage.setItem('meterpulse_detail_category', cat);
              }}
              onOpenScan={() => setIsScanModalOpen(true)}
              onOpenHistory={(meter) => setSelectedHistoryMeter(meter)}
              onNavigateToContracts={() => {
                setSelectedDetailCategory(null);
                handleTabChange('contracts');
              }}
            />
          ) : (
            <Dashboard
              onOpenScan={() => setIsScanModalOpen(true)}
              onSelectCategory={handleSelectCategory}
            />
          )
        )}

        {currentTab === 'meters' && (
          <MeterManagement
            meters={meters}
            onRefresh={loadMeters}
            onOpenHistory={(meter) => setSelectedHistoryMeter(meter)}
          />
        )}

        {currentTab === 'contracts' && <ContractSettings />}

        {currentTab === 'ai-settings' && <AISettings />}
      </main>

      {/* Scan / Capture Modal */}
      <ScanMeterModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onSuccess={() => {
          loadMeters();
        }}
        meters={meters}
      />

      {/* Reading History Modal */}
      <ReadingHistoryModal
        isOpen={!!selectedHistoryMeter}
        onClose={() => setSelectedHistoryMeter(null)}
        meter={selectedHistoryMeter}
        onRefresh={loadMeters}
      />
    </div>
  );
};

export default App;
