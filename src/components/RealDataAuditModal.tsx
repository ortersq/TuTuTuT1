import React, { useState } from 'react';
import { DataSourceAudit, Kline } from '../types/trading';
import { ShieldCheck, ExternalLink, Download, Check, Code, Database } from 'lucide-react';

interface RealDataAuditModalProps {
  audit: DataSourceAudit;
  klines: Kline[];
  isOpen: boolean;
  onClose: () => void;
}

export const RealDataAuditModal: React.FC<RealDataAuditModalProps> = ({
  audit,
  klines,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(JSON.stringify(audit.rawSample, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFullJson = () => {
    const jsonStr = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(klines, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonStr);
    downloadAnchor.setAttribute('download', `${audit.symbol}_binance_real_klines.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0e131f] border border-emerald-500/40 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>币安官方真实数据源验证审计 (100% Real Binance Data Verified)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                严正承诺：绝无任何模拟假数据。全部数据均由币安官方公共行情网关实时直连获取。
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
          >
            ✕ 关闭
          </button>
        </div>

        {/* Data Provenance Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-slate-500 text-[11px] font-sans">数据源地址</div>
            <div className="text-emerald-400 font-bold truncate mt-1 text-[11px]">
              {audit.endpointUrl.split('?')[0]}
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">Binance 官方公共节点</div>
          </div>

          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-slate-500 text-[11px] font-sans">真实 K 线条数</div>
            <div className="text-white font-bold text-base mt-1">
              {audit.candleCount} 根 K线
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">延迟 {audit.latencyMs}ms</div>
          </div>

          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-slate-500 text-[11px] font-sans">最新成交价</div>
            <div className="text-amber-400 font-bold text-base mt-1">
              ${audit.lastPrice} USDT
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">最高 ${audit.highestPrice}</div>
          </div>

          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-slate-500 text-[11px] font-sans">覆盖真实交易笔数</div>
            <div className="text-sky-400 font-bold text-base mt-1">
              {audit.totalTradesRecorded.toLocaleString()} 笔
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">Binance 全网真实订单</div>
          </div>
        </div>

        {/* Timestamp Range */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs space-y-1">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-500 font-sans">K线起始时间:</span>
            <span className="font-mono">{new Date(audit.firstCandleIso).toLocaleString()} ({audit.firstCandleIso})</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-500 font-sans">K线最新时间:</span>
            <span className="font-mono text-emerald-400 font-semibold">{new Date(audit.lastCandleIso).toLocaleString()} ({audit.lastCandleIso})</span>
          </div>
        </div>

        {/* Raw Binance JSON Preview */}
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5 font-sans">
              <Code className="w-4 h-4 text-amber-400" />
              <span>币安服务器原始返回 Array 数据切片 (Raw Binance API Payload)</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyRaw}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3" /> : null}
                <span>{copied ? '已复制' : '复制原始切片'}</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto leading-relaxed">
            <pre><code>{JSON.stringify(audit.rawSample, null, 2)}</code></pre>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-sans">
            注：币安 K 线数组标准协议：[0: 开盘时间戳, 1: 开盘价, 2: 最高价, 3: 最低价, 4: 收盘价, 5: 成交量, 6: 收盘时间戳, 7: 成交额, 8: 成交笔数, 9: 主动买入成交量, 10: 主动买入成交额, 11: 忽略]
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <a
            href={audit.endpointUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>在浏览器新标签页中直接检验币安官方原始接口</span>
          </a>

          <button
            onClick={handleDownloadFullJson}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>下载全量真实 K 线 JSON 文件 ({klines.length} 根)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
