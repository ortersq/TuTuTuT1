import React, { useState } from 'react';
import { Trade } from '../types/trading';
import { Download, Filter, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface TradeLogTableProps {
  trades: Trade[];
  symbol: string;
}

export const TradeLogTable: React.FC<TradeLogTableProps> = ({ trades, symbol }) => {
  const [filter, setFilter] = useState<'ALL' | 'LONG' | 'SHORT' | 'WIN' | 'LOSS'>('ALL');
  const [search, setSearch] = useState('');

  const filteredTrades = trades.filter((t) => {
    if (filter === 'LONG' && t.side !== 'LONG') return false;
    if (filter === 'SHORT' && t.side !== 'SHORT') return false;
    if (filter === 'WIN' && t.netPnl <= 0) return false;
    if (filter === 'LOSS' && t.netPnl >= 0) return false;
    if (search && !t.id.toLowerCase().includes(search.toLowerCase()) && !t.exitReason.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const exportCSV = () => {
    const headers = [
      'Trade ID',
      'Symbol',
      'Side',
      'Entry Time',
      'Exit Time',
      'Entry Price',
      'Exit Price',
      'Quantity',
      'Leverage',
      'Margin Used',
      'Net PnL (USDT)',
      'Return (%)',
      'Fee',
      'Exit Reason',
      'Holding Bars',
    ];

    const rows = filteredTrades.map((t) => [
      t.id,
      t.symbol,
      t.side,
      new Date(t.entryTime).toISOString(),
      new Date(t.exitTime).toISOString(),
      t.entryPrice.toFixed(2),
      t.exitPrice.toFixed(2),
      t.quantity.toFixed(4),
      `${t.leverage}x`,
      t.marginUsed.toFixed(2),
      t.netPnl.toFixed(2),
      `${t.pnlPercent.toFixed(2)}%`,
      t.totalFee.toFixed(3),
      t.exitReason,
      t.holdingBars,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${symbol}_futures_trades.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getExitReasonBadge = (reason: string) => {
    switch (reason) {
      case 'TAKE_PROFIT':
        return <span className="text-emerald-400 font-medium">止盈平仓 (TP)</span>;
      case 'STOP_LOSS':
        return <span className="text-rose-400 font-medium">止损触发 (SL)</span>;
      case 'TRAILING_STOP':
        return <span className="text-amber-400 font-medium">移动止盈 (Trailing)</span>;
      case 'SIGNAL_REVERSAL':
        return <span className="text-sky-400 font-medium">反向信号平仓</span>;
      case 'LIQUIDATION':
        return <span className="text-red-500 font-bold">强平爆仓</span>;
      default:
        return <span className="text-slate-400 font-medium">回测结束平仓</span>;
    }
  };

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-xl p-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-bold text-white">合约逐笔交易明细 (Trade Audit Log)</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            共完成 {trades.length} 笔真实模拟交易，已严格扣除 Binance VIP0 手续费与双向滑点
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg text-xs font-medium">
            {(
              [
                ['ALL', '全部'],
                ['LONG', '仅做多'],
                ['SHORT', '仅做空'],
                ['WIN', '仅盈利'],
                ['LOSS', '仅亏损'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  filter === key
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Export CSV button */}
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出 CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">方向</th>
              <th className="py-2.5 px-3">开仓时间</th>
              <th className="py-2.5 px-3">平仓时间</th>
              <th className="py-2.5 px-3 text-right">开仓价</th>
              <th className="py-2.5 px-3 text-right">平仓价</th>
              <th className="py-2.5 px-3 text-right">持仓保证金</th>
              <th className="py-2.5 px-3 text-right">手续费</th>
              <th className="py-2.5 px-3 text-right">净盈亏</th>
              <th className="py-2.5 px-3 text-right">收益率</th>
              <th className="py-2.5 px-3">平仓原因</th>
              <th className="py-2.5 px-3 text-right">持仓K线</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredTrades.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-slate-500 font-sans">
                  无符合筛选条件的交易记录
                </td>
              </tr>
            ) : (
              filteredTrades.map((t, idx) => {
                const isLong = t.side === 'LONG';
                const isWin = t.netPnl > 0;

                return (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          isLong ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isLong ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                        <span>{isLong ? '做多' : '做空'}</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          {t.leverage}x
                        </span>
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(t.entryTime).toLocaleString([], {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(t.exitTime).toLocaleString([], {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-200">
                      ${t.entryPrice.toFixed(2)}
                    </td>

                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-200">
                      ${t.exitPrice.toFixed(2)}
                    </td>

                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                      ${t.marginUsed.toFixed(1)}
                    </td>

                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                      ${t.totalFee.toFixed(2)}
                    </td>

                    <td
                      className={`py-2.5 px-3 text-right tabular-nums font-bold ${
                        isWin ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isWin ? '+' : ''}${t.netPnl.toFixed(2)}
                    </td>

                    <td
                      className={`py-2.5 px-3 text-right tabular-nums font-bold ${
                        isWin ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap font-sans text-[11px]">
                      {getExitReasonBadge(t.exitReason)}
                    </td>

                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                      {t.holdingBars} 根
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
