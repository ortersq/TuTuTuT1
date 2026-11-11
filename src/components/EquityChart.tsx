import React, { useState } from 'react';
import { EquityPoint } from '../types/trading';

interface EquityChartProps {
  equityCurve: EquityPoint[];
  initialCapital: number;
}

export const EquityChart: React.FC<EquityChartProps> = ({ equityCurve, initialCapital }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!equityCurve || equityCurve.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 bg-[#111726] rounded-xl border border-slate-800">
        暂无资金曲线数据
      </div>
    );
  }

  // Downsample if more than 500 points for smooth SVG rendering
  const totalPoints = equityCurve.length;
  const sampleRate = Math.max(1, Math.floor(totalPoints / 400));
  const points = equityCurve.filter((_, idx) => idx % sampleRate === 0 || idx === totalPoints - 1);

  // Compute Scales
  let minEquity = Infinity;
  let maxEquity = -Infinity;
  let maxDrawdown = 0;

  for (const p of points) {
    if (p.equity < minEquity) minEquity = p.equity;
    if (p.benchmarkEquity < minEquity) minEquity = p.benchmarkEquity;
    if (p.equity > maxEquity) maxEquity = p.equity;
    if (p.benchmarkEquity > maxEquity) maxEquity = p.benchmarkEquity;
    if (p.drawdown > maxDrawdown) maxDrawdown = p.drawdown;
  }

  // Add 5% padding
  const padding = (maxEquity - minEquity) * 0.05 || 100;
  const yMin = Math.max(0, minEquity - padding);
  const yMax = maxEquity + padding;
  const yRange = yMax - yMin || 1;

  const width = 900;
  const height = 260;
  const ddHeight = 70;
  const margin = { top: 15, right: 30, bottom: 20, left: 60 };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // Path generator
  const getX = (idx: number) => margin.left + (idx / (points.length - 1)) * plotWidth;
  const getY = (val: number) => margin.top + plotHeight - ((val - yMin) / yRange) * plotHeight;
  const getDdY = (dd: number) => {
    const scale = maxDrawdown > 0 ? dd / Math.max(10, maxDrawdown * 1.1) : 0;
    return scale * ddHeight;
  };

  // Build SVG Paths
  let equityPath = '';
  let benchmarkPath = '';
  let areaPath = '';
  let ddAreaPath = '';

  points.forEach((p, i) => {
    const x = getX(i);
    const y = getY(p.equity);
    const bY = getY(p.benchmarkEquity);

    if (i === 0) {
      equityPath += `M ${x} ${y}`;
      benchmarkPath += `M ${x} ${bY}`;
      areaPath += `M ${x} ${margin.top + plotHeight} L ${x} ${y}`;
      ddAreaPath += `M ${x} 0 L ${x} ${getDdY(p.drawdown)}`;
    } else {
      equityPath += ` L ${x} ${y}`;
      benchmarkPath += ` L ${x} ${bY}`;
      areaPath += ` L ${x} ${y}`;
      ddAreaPath += ` L ${x} ${getDdY(p.drawdown)}`;
    }
  });

  const lastPoint = points[points.length - 1];
  const lastX = getX(points.length - 1);
  areaPath += ` L ${lastX} ${margin.top + plotHeight} Z`;
  ddAreaPath += ` L ${lastX} 0 Z`;

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : lastPoint;

  return (
    <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-4.5">
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">资金净值曲线 & 水下回撤 (Equity Curve & Underwater DD)</span>
          <span className="text-xs text-slate-500 font-mono">
            {new Date(points[0].timestamp).toLocaleDateString()} ~ {new Date(lastPoint.timestamp).toLocaleDateString()}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-amber-400 rounded-full" />
            <span className="text-slate-300">策略净值:</span>
            <span className="font-mono font-bold text-amber-400 tabular-nums">
              ${hoveredPoint.equity.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-sky-400/80 rounded-full" />
            <span className="text-slate-400">基准买入持有:</span>
            <span className="font-mono text-sky-400 tabular-nums">
              ${hoveredPoint.benchmarkEquity.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-rose-500/40 rounded-sm" />
            <span className="text-slate-400">回撤:</span>
            <span className="font-mono text-rose-400 tabular-nums">
              -{hoveredPoint.drawdown.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Main SVG Area */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height + ddHeight + 15}`}
          className="w-full h-auto select-none font-mono"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const clampedX = Math.max(margin.left, Math.min(width - margin.right, relX));
            const idx = Math.round(((clampedX - margin.left) / plotWidth) * (points.length - 1));
            setHoverIndex(idx);
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.35" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = margin.top + plotHeight * pct;
            const val = yMax - pct * yRange;
            return (
              <g key={idx}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={width - margin.right}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                />
                <text
                  x={margin.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748b"
                >
                  ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Benchmark Line */}
          <path d={benchmarkPath} fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.7" />

          {/* Strategy Area & Line */}
          <path d={areaPath} fill="url(#equityGradient)" />
          <path d={equityPath} fill="none" stroke="#fbbf24" strokeWidth="2.2" />

          {/* Underwater Drawdown Section */}
          <g transform={`translate(0, ${height})`}>
            {/* Divider */}
            <line
              x1={margin.left}
              y1="0"
              x2={width - margin.right}
              y2="0"
              stroke="#334155"
              strokeWidth="1"
            />
            <text
              x={margin.left - 8}
              y="12"
              textAnchor="end"
              fontSize="9"
              fill="#ef4444"
            >
              0%
            </text>
            <text
              x={margin.left - 8}
              y={ddHeight}
              textAnchor="end"
              fontSize="9"
              fill="#ef4444"
            >
              -{Math.max(10, Math.round(maxDrawdown))}%
            </text>

            <path d={ddAreaPath} fill="url(#ddGradient)" stroke="#f43f5e" strokeWidth="1" />
          </g>

          {/* Hover Crosshair */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={margin.top}
                x2={getX(hoverIndex)}
                y2={height + ddHeight}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(points[hoverIndex].equity)}
                r="4.5"
                fill="#fbbf24"
                stroke="#0f172a"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
