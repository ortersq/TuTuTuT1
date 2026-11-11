import React, { useEffect, useState, useCallback } from 'react';
import { Header, ActiveTab } from './components/Header';
import { MultiSymbolScanner } from './components/MultiSymbolScanner';
import { PositionsAndLogs } from './components/PositionsAndLogs';
import { SystemLogConsole } from './components/SystemLogConsole';
import { SettingsPanel } from './components/SettingsPanel';
import { LoginModal } from './components/LoginModal';
import { BotStatus } from './server/botEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitor');
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(
    localStorage.getItem('quant_auth_token')
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

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
    if (!token) return;

    try {
      const res = await fetch('/api/bot/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem('quant_auth_token');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setBotStatus(data);
      }
    } catch {
      // ignore
    }
  }, [authToken]);

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
    if (!authToken) return;
    try {
      const endpoint = botStatus?.isRunning ? '/api/bot/stop' : '/api/bot/start';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        fetchStatus();
      }
    } catch {
      // ignore
    }
  };

  const handleClosePosition = async (symbol: string) => {
    if (!authToken) return;
    try {
      await fetch('/api/bot/close-position', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ symbol }),
      });
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleAddSymbol = async (symbol: string) => {
    if (!authToken) return;
    try {
      await fetch('/api/bot/symbols/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ symbol }),
      });
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleRemoveSymbol = async (symbol: string) => {
    if (!authToken) return;
    try {
      await fetch('/api/bot/symbols/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ symbol }),
      });
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleSaveCredentials = async (apiKey: string, apiSecret: string) => {
    if (!authToken) return;
    try {
      await fetch('/api/bot/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ apiKey, apiSecret }),
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
    if (!authToken) return;
    try {
      await fetch('/api/bot/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(config),
      });
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
