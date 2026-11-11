import React, { useState } from 'react';
import { Kline, Trade } from '../types/trading';
import { calculateEMA } from '../utils/indicators';

interface CandleChartProps {
  klines: Kline[];
  trades: Trade[];
  symbol: string;
}

export const CandleChart: React.FC<CandleChartProps> = ({ klines, trades, symbol }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!klines || klines.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-slate-500 bg-[#111726] rounded-xl border border-slate-800">
        暂无K线数据
      </div>
    );
  }

  const visibleCount = Math.min(100, klines.length);
  const startIndex = klines.length - visibleCount;
  const visibleKlines = klines.slice(startIndex);

  const startTime = visibleKlines[0].timestamp;
  const endTime = visibleKlines[visibleKlines.length - 1].timestamp;
  const visibleTrades = trades.filter((t) => t.exitTime >= startTime && t.entryTime <= endTime);

  const closes = klines.map((k) => k.close);
  const ema20Full = calculateEMA(closes, 20);
  const ema50Full = calculateEMA(closes, 50);

  const ema20 = ema20Full.slice(startIndex);
  const ema50 = ema50Full.slice(startIndex);

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxVol = 0;

  for (const k of visibleKlines) {
    if (k.low < minPrice) minPrice = k.low;
    if (k.high > maxPrice) maxPrice = k.high;
    if (k.volume > maxVol) maxVol = k.volume;
  }

  const pPadding = (maxPrice - minPrice) * 0.06 || 50;
  const yMin = minPrice - pPadding;
  const yMax = maxPrice + pPadding;
  const yRange = yMax - yMin || 1;

  const width = 900;
  const height = 300;
  const volHeight = 55;
  const margin = { top: 20, right: 65, bottom: 25, left: 20 };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom - volHeight;

  const getX = (idx: number) => margin.left + ((idx + 0.5) / visibleKlines.length) * plotWidth;
  const getY = (val: number) => margin.top + plotHeight - ((val - yMin) / yRange) * plotHeight;
  const getVolY = (vol: number) => {
    const scale = maxVol > 0 ? vol / maxVol : 0;
    return margin.top + plotHeight + 10 + (1 - scale) * volHeight;
  };

  const candleWidth = Math.max(2, (plotWidth / visibleKlines.length) * 0.68);
  const hoveredBar = hoverIndex !== null ? visibleKlines[hoverIndex] : visibleKlines[visibleKlines.length - 1];

  return (
    <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-4.5 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">
            {symbol} 合约K线与形态触发位 (Candlesticks & Pattern Markers)
          </span>
          <span className="text-slate-500 font-mono">
            {new Date(hoveredBar.timestamp).toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
          <span>O: <strong className="text-slate-200 tabular-nums">{hoveredBar.open}</strong></span>
          <span>H: <strong className="text-emerald-400 tabular-nums">{hoveredBar.high}</strong></span>
          <span>L: <strong className="text-rose-400 tabular-nums">{hoveredBar.low}</strong></span>
          <span>C: <strong className={hoveredBar.close >= hoveredBar.open ? 'text-emerald-400 tabular-nums' : 'text-rose-400 tabular-nums'}>{hoveredBar.close}</strong></span>
          <span>Vol: <strong className="text-amber-400 tabular-nums">{Math.round(hoveredBar.volume)}</strong></span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none font-mono"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const clampedX = Math.max(margin.left, Math.min(width - margin.right, relX));
            const idx = Math.floor(((clampedX - margin.left) / plotWidth) * visibleKlines.length);
            setHoverIndex(Math.max(0, Math.min(visibleKlines.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = margin.top + plotHeight * pct;
            const priceVal = yMax - pct * yRange;
            return (
              <g key={idx}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={width - margin.right}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="2 2"
                />
                <text
                  x={width - margin.right + 8}
                  y={y + 3.5}
                  fontSize="10"
                  fill="#64748b"
                >
                  {priceVal.toFixed(1)}
                </text>
              </g>
            );
          })}

          <line
            x1={margin.left}
            y1={margin.top + plotHeight + 10}
            x2={width - margin.right}
            y2={margin.top + plotHeight + 10}
            stroke="#1e293b"
          />

          {visibleKlines.map((k, idx) => {
            const x = getX(idx);
            const isBull = k.close >= k.open;
            const color = isBull ? '#10b981' : '#f43f5e';

            const yHigh = getY(k.high);
            const yLow = getY(k.low);
            const yOpen = getY(k.open);
            const yClose = getY(k.close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));

            const volY = getVolY(k.volume);
            const volH = margin.top + plotHeight + 10 + volHeight - volY;

            return (
              <g key={k.timestamp}>
                <rect
                  x={x - candleWidth / 2}
                  y={volY}
                  width={candleWidth}
                  height={volH}
                  fill={isBull ? '#065f46' : '#881337'}
                  opacity={0.65}
                />

                <line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={yLow}
                  stroke={color}
                  strokeWidth={1}
                />

                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                  rx={0.5}
                />
              </g>
            );
          })}

          {visibleKlines.map((_, idx) => {
            if (idx === 0) return null;
            const e20Prev = ema20[idx - 1];
            const e20Cur = ema20[idx];
            if (e20Prev === null || e20Cur === null) return null;

            return (
              <line
                key={`e20_${idx}`}
                x1={getX(idx - 1)}
                y1={getY(e20Prev)}
                x2={getX(idx)}
                y2={getY(e20Cur)}
                stroke="#fbbf24"
                strokeWidth={1.2}
              />
            );
          })}

          {visibleKlines.map((_, idx) => {
            if (idx === 0) return null;
            const e50Prev = ema50[idx - 1];
            const e50Cur = ema50[idx];
            if (e50Prev === null || e50Cur === null) return null;

            return (
              <line
                key={`e50_${idx}`}
                x1={getX(idx - 1)}
                y1={getY(e50Prev)}
                x2={getX(idx)}
                y2={getY(e50Cur)}
                stroke="#38bdf8"
                strokeWidth={1.2}
              />
            );
          })}

          {visibleTrades.map((t) => {
            const entryBarIdx = visibleKlines.findIndex(
              (k, i) =>
                t.entryTime >= k.timestamp &&
                (i === visibleKlines.length - 1 || t.entryTime < visibleKlines[i + 1].timestamp)
            );

            const exitBarIdx = visibleKlines.findIndex(
              (k, i) =>
                t.exitTime >= k.timestamp &&
                (i === visibleKlines.length - 1 || t.exitTime < visibleKlines[i + 1].timestamp)
            );

            const isLong = t.side === 'LONG';

            return (
              <g key={t.id}>
                {entryBarIdx >= 0 && (
                  <g transform={`translate(${getX(entryBarIdx)}, ${getY(t.entryPrice)})`}>
                    <polygon
                      points={isLong ? '0,-12 -6,0 6,0' : '0,12 -6,0 6,0'}
                      fill={isLong ? '#10b981' : '#f43f5e'}
                      stroke="#0f172a"
                      strokeWidth={1}
                    />
                    <text
                      x="0"
                      y={isLong ? -16 : 22}
                      fontSize="9"
                      fontWeight="bold"
                      textAnchor="middle"
                      fill={isLong ? '#34d399' : '#fb7185'}
                    >
                      {t.patternName ? t.patternName.split(' ')[0] : isLong ? '多头开仓' : '空头开仓'}
                    </text>
                  </g>
                )}

                {exitBarIdx >= 0 && (
                  <g transform={`translate(${getX(exitBarIdx)}, ${getY(t.exitPrice)})`}>
                    <circle
                      cx="0"
                      cy="0"
                      r="4.5"
                      fill={t.netPnl >= 0 ? '#10b981' : '#ef4444'}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <text
                      x="0"
                      y={t.netPnl >= 0 ? -9 : 14}
                      fontSize="8"
                      fontWeight="bold"
                      textAnchor="middle"
                      fill={t.netPnl >= 0 ? '#6ee7b7' : '#fca5a5'}
                    >
                      {t.exitReason === 'TAKE_PROFIT'
                        ? '止盈'
                        : t.exitReason === 'STOP_LOSS'
                        ? '止损'
                        : t.exitReason === 'TRAILING_STOP'
                        ? '移动止盈'
                        : '平仓'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {hoverIndex !== null && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={margin.top}
                x2={getX(hoverIndex)}
                y2={height - margin.bottom}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <line
                x1={margin.left}
                y1={getY(hoveredBar.close)}
                x2={width - margin.right}
                y2={getY(hoveredBar.close)}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            </g>
          )}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pt-2.5 border-t border-slate-800/60 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
            <span>多头形态开仓 / 盈利平仓</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm" />
            <span>空头形态开仓 / 止损平仓</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-400" />
            <span>EMA 20 均线</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-sky-400" />
            <span>EMA 50 均线</span>
          </div>
        </div>
        <div className="text-slate-500">
          图表展示最近 {visibleCount} 根 K 线图形形态触发与开平仓映射
        </div>
      </div>
    </div>
  );
};
