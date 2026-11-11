import React, { useState } from 'react';
import { BacktestResult } from '../types/trading';
import { generateMarkdownReport, generatePineScriptV5, generatePythonBotScript } from '../utils/codeExport';
import { Copy, Check, Terminal, FileText, Code2 } from 'lucide-react';

interface CodeExportModalProps {
  result: BacktestResult;
}

export const CodeExportModal: React.FC<CodeExportModalProps> = ({ result }) => {
  const [activeCodeTab, setActiveCodeTab] = useState<'pinescript' | 'python' | 'markdown'>('pinescript');
  const [copied, setCopied] = useState(false);

  const pineScriptCode = generatePineScriptV5(result);
  const pythonCode = generatePythonBotScript(result);
  const markdownReport = generateMarkdownReport(result);

  const currentContent =
    activeCodeTab === 'pinescript'
      ? pineScriptCode
      : activeCodeTab === 'python'
      ? pythonCode
      : markdownReport;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Code2 className="w-4 h-4 text-amber-400" />
            <span>实盘代码与审计报告导出中心</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            直接复制即开即用的 TradingView Pine Script v5 或 Python CCXT 币安实盘合约量化机器人
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg text-xs font-medium">
          <button
            onClick={() => setActiveCodeTab('pinescript')}
            className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeCodeTab === 'pinescript'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>TradingView Pine Script v5</span>
          </button>

          <button
            onClick={() => setActiveCodeTab('python')}
            className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeCodeTab === 'python'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Python CCXT 实盘脚本</span>
          </button>

          <button
            onClick={() => setActiveCodeTab('markdown')}
            className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeCodeTab === 'markdown'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Markdown 审计报告</span>
          </button>
        </div>
      </div>

      {/* Editor Box */}
      <div className="relative bg-[#090d16] border border-slate-800 rounded-lg overflow-hidden">
        {/* Top bar of code box */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-400 font-mono">
          <span>
            {activeCodeTab === 'pinescript'
              ? 'binance_futures_strategy.pine'
              : activeCodeTab === 'python'
              ? 'binance_futures_bot.py'
              : 'backtest_audit_report.md'}
          </span>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-sans cursor-pointer transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>已复制到剪贴板</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>一键复制代码</span>
              </>
            )}
          </button>
        </div>

        {/* Code Content */}
        <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[480px] leading-relaxed selection:bg-amber-500/30">
          <code>{currentContent}</code>
        </pre>
      </div>

      {/* Instructions */}
      <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-200">使用方法说明:</div>
        {activeCodeTab === 'pinescript' && (
          <div>
            1. 打开 TradingView 图表，点击下方面板中的【Pine 编辑器】。2.
            粘贴此脚本，点击【保存】并点击【添加到图表】。3.
            可在【策略测试器】中查看实时持仓、订单回测与预警信号通知。
          </div>
        )}
        {activeCodeTab === 'python' && (
          <div>
            1. 在本地或云服务器运行 <code>pip install ccxt pandas numpy</code>。2. 填入你的 Binance API Key 和 Secret。3. 运行 <code>python binance_futures_bot.py</code> 即可启动合约自动化轮询执行。
          </div>
        )}
        {activeCodeTab === 'markdown' && (
          <div>
            包含该策略在此行情窗口下的收益、Alpha超额、胜率、回撤及风控触发统计，可直接保存或导入 Obsidian / Notion 作为策略投资研报。
          </div>
        )}
      </div>
    </div>
  );
};
