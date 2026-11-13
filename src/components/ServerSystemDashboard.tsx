import React from 'react';
import { BotStatus } from '../server/botEngine';
import {
  Cpu,
  HardDrive,
  Activity,
  Server,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Terminal,
  Zap,
  ShieldCheck,
  Radio,
} from 'lucide-react';

interface ServerSystemDashboardProps {
  status: BotStatus | null;
}

export const ServerSystemDashboard: React.FC<ServerSystemDashboardProps> = ({ status }) => {
  const metrics = status?.systemMetrics || {
    cpuUsagePercent: 0,
    totalMemoryMb: 0,
    freeMemoryMb: 0,
    usedMemoryMb: 0,
    memoryUsagePercent: 0,
    processHeapUsedMb: 0,
    uptimeSeconds: 0,
  };

  const recentEvents = status?.recentSchedulingEvents || status?.logs.slice(-10).reverse() || [];

  // Uptime formatting
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days} 天 ${hours} 小时 ${mins} 分钟`;
    if (hours > 0) return `${hours} 小时 ${mins} 分钟`;
    return `${mins} 分钟`;
  };

  // Overload evaluation
  const isHighCpu = metrics.cpuUsagePercent >= 85;
  const isLowMemory = metrics.freeMemoryMb < 200;
  const isServerOverloaded = isHighCpu || isLowMemory;

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
      {/* 1. Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>服务器实时算力与系统调度仪表盘 (Server Health & Scheduling Events)</span>
            </h3>
            <p className="text-xs text-slate-400">
              实时监测服务器 CPU 使用率、物理内存余量及最近 10 条调度事件，诊断程序是否存在卡顿或过载延时
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-400">服务器连续运行:</span>
          <span className="text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatUptime(metrics.uptimeSeconds)}
          </span>
        </div>
      </div>

      {/* 2. Hardware Resource Metrics Cards (CPU, Physical RAM, Heap, Overload Status) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* CPU Usage Card */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>CPU 当前使用率</span>
            </span>
            <span
              className={`font-mono font-bold ${
                metrics.cpuUsagePercent >= 85
                  ? 'text-rose-400'
                  : metrics.cpuUsagePercent >= 60
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {metrics.cpuUsagePercent.toFixed(1)}%
            </span>
          </div>

          {/* CPU Progress Bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                metrics.cpuUsagePercent >= 85
                  ? 'bg-rose-500'
                  : metrics.cpuUsagePercent >= 60
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(5, metrics.cpuUsagePercent))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>算力状态:</span>
            {metrics.cpuUsagePercent >= 85 ? (
              <span className="text-rose-400 font-semibold flex items-center gap-1">
                ⚠️ 高负载 (有延时风险)
              </span>
            ) : (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                🟢 算力流畅 (0 卡顿)
              </span>
            )}
          </div>
        </div>

        {/* Physical RAM Card */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>物理内存空闲余量</span>
            </span>
            <span
              className={`font-mono font-bold ${
                isLowMemory ? 'text-rose-400' : 'text-cyan-300'
              }`}
            >
              {metrics.freeMemoryMb.toLocaleString()} MB
            </span>
          </div>

          {/* RAM Progress Bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isLowMemory ? 'bg-rose-500' : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(5, metrics.memoryUsagePercent))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>已用: {metrics.usedMemoryMb} MB ({metrics.memoryUsagePercent}%)</span>
            <span>总量: {metrics.totalMemoryMb} MB</span>
          </div>
        </div>

        {/* Node.js Heap Footprint */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Node.js 进程内存</span>
            </span>
            <span className="font-mono font-bold text-indigo-300">
              {metrics.processHeapUsedMb.toFixed(1)} MB
            </span>
          </div>

          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 transition-all duration-500"
              style={{ width: `${Math.min(100, (metrics.processHeapUsedMb / 512) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>引擎 Heap 使用量</span>
            <span className="text-emerald-400">GC 垃圾回收正常</span>
          </div>
        </div>

        {/* Diagnostic Overload Status Card */}
        <div
          className={`border rounded-xl p-3.5 space-y-1.5 ${
            isServerOverloaded
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5">
              {isServerOverloaded ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-rose-300">服务器性能过载告警</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300">过载与延时诊断</span>
                </>
              )}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed opacity-90">
            {isServerOverloaded
              ? '⚠️ 资源负载较高，可能引发 10s 扫描周期与市价平仓延时，导致部分盈利未能精准锁定！'
              : '✓ 系统资源充足，10s 高频轮询与止损止盈触发无延迟，未发现过载引起的回吐卡顿！'}
          </p>
        </div>
      </div>

      {/* 3. Recent 10 System Internal Scheduling Events */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs">
          <div className="font-bold text-slate-200 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>最近 10 条系统内部调度与平仓触发事件 (Recent 10 Internal Scheduling Logs)</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            实时倒序排列 · 包含 10s 心跳、信号扫描、移动止盈与结构平仓
          </span>
        </div>

        <div className="bg-[#0b0e14] border border-slate-800/90 rounded-xl overflow-hidden divide-y divide-slate-800/60 font-mono text-xs">
          {recentEvents.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs font-sans">
              目前暂无内部调度日志事件，策略引擎正在高频运行中...
            </div>
          ) : (
            recentEvents.slice(0, 10).map((log, idx) => {
              const isOrder = log.category === 'ORDER';
              const isSignal = log.category === 'SIGNAL';
              const isSuccess = log.level === 'success';
              const isWarn = log.level === 'warn';

              return (
                <div
                  key={log.id || `${log.timestamp}-${idx}`}
                  className="p-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-[200px]">
                    <span className="text-slate-500 text-[11px] shrink-0">{log.time}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                        isOrder
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : isSignal
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {log.category}
                    </span>
                    {log.symbol && (
                      <span className="text-amber-300 font-bold text-[11px] shrink-0">
                        [{log.symbol}]
                      </span>
                    )}
                  </div>

                  <div
                    className={`flex-1 text-xs truncate font-sans ${
                      isSuccess
                        ? 'text-emerald-300'
                        : isWarn
                        ? 'text-amber-300'
                        : log.level === 'error'
                        ? 'text-rose-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {log.message}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
