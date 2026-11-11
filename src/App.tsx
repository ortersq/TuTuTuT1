import React, { useEffect, useState, useCallback } from 'react';
import { Header, ActiveTab } from './components/Header';
import { MultiSymbolScanner } from './components/MultiSymbolScanner';
import { PositionsAndLogs } from './components/PositionsAndLogs';
import { SettingsPanel } from './components/SettingsPanel';
import { BotStatus } from './server/botEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitor');
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const data = await res.json();
        setBotStatus(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const intervalId = setInterval(fetchStatus, 3000);
    return () => clearInterval(intervalId);
  }, [fetchStatus]);

  const handleToggleBot = async () => {
    try {
      const endpoint = botStatus?.isRunning ? '/api/bot/stop' : '/api/bot/start';
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        fetchStatus();
      }
    } catch {
      // ignore
    }
  };

  const handleClosePosition = async (symbol: string) => {
    try {
      await fetch('/api/bot/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleUpdateConfig = async (config: {
    monitoredSymbols?: string[];
    monitoredTimeframes?: string[];
    leverage?: number;
  }) => {
    try {
      await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      fetchStatus();
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isRunning={botStatus?.isRunning ?? false}
        hasBinanceKeys={botStatus?.hasBinanceKeys ?? false}
        onToggleBot={handleToggleBot}
        activePositionsCount={botStatus?.activePositions.length ?? 0}
      />

      <main className="flex-1 px-6 py-6 max-w-[1600px] w-full mx-auto">
        {activeTab === 'monitor' && (
          <MultiSymbolScanner
            status={botStatus}
            onRefreshStatus={fetchStatus}
            onClosePosition={handleClosePosition}
          />
        )}

        {activeTab === 'positions' && (
          <PositionsAndLogs
            status={botStatus}
            onClosePosition={handleClosePosition}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            status={botStatus}
            onUpdateConfig={handleUpdateConfig}
          />
        )}
      </main>
    </div>
  );
}
