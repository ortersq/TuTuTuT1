import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Header, ActiveTab } from './components/Header';
import { MultiSymbolScanner } from './components/MultiSymbolScanner';
import { PositionsAndLogs } from './components/PositionsAndLogs';
import { SystemLogConsole } from './components/SystemLogConsole';
import { SettingsPanel } from './components/SettingsPanel';
import { PnLVolatilityHeatmap } from './components/PnLVolatilityHeatmap';
import { SelfLearningDashboard } from './components/SelfLearningDashboard';
import { LoginModal } from './components/LoginModal';
import { BotStatus } from './server/botEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitor');
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(
    localStorage.getItem('quant_auth_token')
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  const isFetchingRef = useRef<boolean>(false);
  const lastAppliedSeqRef = useRef<number>(0);
  const requestSeqRef = useRef<number>(0);

  const applyStatusSafely = useCallback((nextStatus: BotStatus, seq: number) => {
    if (!nextStatus || seq < lastAppliedSeqRef.current) return;
    lastAppliedSeqRef.current = seq;
    setBotStatus(nextStatus);
  }, []);

  // Check auth token on mount
  useEffect(() => {
    const token = localStorage.getItem('quant_auth_token');
    if (!token) {
      setIsAuthenticated(false);
      setIsCheckingAuth(false);
      return;
    }

    fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setAuthToken(token);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('quant_auth_token');
          setAuthToken(null);
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });
  }, []);

  const fetchStatus = useCallback(async () => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token || isFetchingRef.current) return;

    isFetchingRef.current = true;
    const seq = ++requestSeqRef.current;

    try {
      const res = await fetch('/api/bot/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem('quant_auth_token');
        return;
      }
      if (!res.ok) return;

      const statusData: BotStatus = await res.json();

      // In LIVE mode, cross-check direct /api/binance/live-account snapshot to ensure UI equity, positions, and riskMetrics reflect authoritative Binance data
      if (statusData.hasBinanceKeys) {
        try {
          const liveRes = await fetch('/api/binance/live-account', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (liveRes.ok) {
            const liveData = await liveRes.json();
            if (liveData && typeof liveData.equity === 'number') {
              statusData.balance = liveData.balance ?? statusData.balance;
              statusData.equity = liveData.equity ?? statusData.equity;
              statusData.peakEquity = liveData.peakEquity ?? statusData.peakEquity;
              statusData.drawdownPercent = liveData.drawdownPercent ?? statusData.drawdownPercent;
              statusData.liveSyncInfo = liveData.liveSyncInfo ?? statusData.liveSyncInfo;
              statusData.activePositions = liveData.activePositions ?? statusData.activePositions;
              statusData.equityHistory = liveData.equityHistory ?? statusData.equityHistory;
              statusData.closedTrades = liveData.closedTrades ?? statusData.closedTrades;
              if (liveData.riskMetrics) {
                statusData.riskMetrics = liveData.riskMetrics;
              }
            }
          }
        } catch {
          // keep /api/bot/status payload if live-account quick poll drops
        }
      }

      applyStatusSafely(statusData, seq);
    } catch {
      // ignore transient network errors
    } finally {
      isFetchingRef.current = false;
    }
  }, [authToken, applyStatusSafely]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus();
      const intervalId = setInterval(fetchStatus, 3000);
      return () => clearInterval(intervalId);
    }
  }, [isAuthenticated, fetchStatus]);

  const handleLoginSuccess = (token: string) => {
    setAuthToken(token);
    setIsAuthenticated(true);
    fetchStatus();
  };

  const handleLogout = () => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('quant_auth_token');
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  const handleToggleBot = async () => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token) return;
    try {
      const endpoint = botStatus?.isRunning ? '/api/bot/stop' : '/api/bot/start';
      const seq = ++requestSeqRef.current;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status) applyStatusSafely(data.status, seq);
        else fetchStatus();
      }
    } catch {
      // ignore
    }
  };

  const handleClosePosition = async (symbol: string) => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token) return;
    try {
      const seq = ++requestSeqRef.current;
      const res = await fetch('/api/bot/close-position', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ symbol }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status) {
          applyStatusSafely(data.status, seq);
          return;
        }
      }
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleCloseAllPositions = async () => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token) return;
    try {
      const seq = ++requestSeqRef.current;
      const res = await fetch('/api/bot/close-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status) {
          applyStatusSafely(data.status, seq);
          return;
        }
      }
      await fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleAddSymbol = async (symbol: string) => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token) return;
    try {
      const seq = ++requestSeqRef.current;
      const res = await fetch('/api/bot/symbols/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionBanner(data?.message || '仅允许监控核心 5 个目标合约');
      } else {
        setActionBanner(null);
      }
      if (data?.status) applyStatusSafely(data.status, seq);
      else fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleRemoveSymbol = async (symbol: string) => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token) return;
    try {
      const seq = ++requestSeqRef.current;
      const res = await fetch('/api/bot/symbols/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.status) applyStatusSafely(data.status, seq);
      else fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleSaveCredentials = async (apiKey: string, apiSecret: string) => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token) return;
    try {
      const seq = ++requestSeqRef.current;
      const res = await fetch('/api/bot/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey, apiSecret }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status) {
          applyStatusSafely(data.status, seq);
          return;
        }
      }
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleSyncLiveAccount = async () => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token) return;
    try {
      const seq = ++requestSeqRef.current;
      const res = await fetch('/api/binance/sync-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status) {
          applyStatusSafely(data.status, seq);
          return;
        }
      }
      await fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleUpdateConfig = async (config: {
    monitoredSymbols?: string[];
    monitoredTimeframes?: string[];
    leverage?: number;
    riskConfig?: any;
  }) => {
    const token = authToken || localStorage.getItem('quant_auth_token');
    if (!token) return;
    try {
      const seq = ++requestSeqRef.current;
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status) {
          applyStatusSafely(data.status, seq);
          return;
        }
      }
      fetchStatus();
    } catch {
      // ignore
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center text-xs text-slate-400">
        正在验证控制台访问权限...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isRunning={botStatus?.isRunning ?? false}
        hasBinanceKeys={botStatus?.hasBinanceKeys ?? false}
        onToggleBot={handleToggleBot}
        activePositionsCount={botStatus?.activePositions.length ?? 0}
        onLogout={handleLogout}
      />

      {actionBanner && (
        <div className="max-w-[1600px] w-full mx-auto px-6 pt-4">
          <div className="px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between">
            <span>{actionBanner}</span>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="text-amber-300 hover:text-amber-100 font-bold cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 px-6 py-6 max-w-[1600px] w-full mx-auto">
        {activeTab === 'monitor' && (
          <MultiSymbolScanner
            status={botStatus}
            onRefreshStatus={fetchStatus}
            onSyncLive={handleSyncLiveAccount}
            onClosePosition={handleClosePosition}
            onCloseAllPositions={handleCloseAllPositions}
          />
        )}

        {activeTab === 'learning' && (
          <SelfLearningDashboard status={botStatus} />
        )}

        {activeTab === 'heatmap' && (
          <PnLVolatilityHeatmap
            closedTrades={botStatus?.closedTrades || []}
            monitoredSymbols={botStatus?.monitoredSymbols}
          />
        )}

        {activeTab === 'positions' && (
          <PositionsAndLogs
            status={botStatus}
            onSyncLive={handleSyncLiveAccount}
            onClosePosition={handleClosePosition}
            onCloseAllPositions={handleCloseAllPositions}
          />
        )}

        {activeTab === 'logs' && (
          <SystemLogConsole
            logs={botStatus?.logs || []}
            onRefresh={fetchStatus}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            status={botStatus}
            onAddSymbol={handleAddSymbol}
            onRemoveSymbol={handleRemoveSymbol}
            onSaveCredentials={handleSaveCredentials}
            onUpdateConfig={handleUpdateConfig}
          />
        )}
      </main>
    </div>
  );
}
