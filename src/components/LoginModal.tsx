import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (token: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('quant_auth_token', data.token);
        onLoginSuccess(data.token);
      } else {
        setErrorMsg(data.message || '登录密码错误');
      }
    } catch {
      setErrorMsg('网络连接中断，请检查服务器连接');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#07090e]/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#111726] border border-slate-800 rounded-3xl max-w-md w-full p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            币安合约量化控制台登录
          </h2>
          <p className="text-xs text-slate-400">
            公网安全访问保护，请输入系统管理员密码以继续
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>访问密码:</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入管理员密码 (默认: admin123)"
              className="w-full px-4 py-3 bg-[#0b0e14] border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 transition-colors font-mono"
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !password.trim()}
            className="w-full py-3 bg-amber-400 hover:bg-amber-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10"
          >
            {isSubmitting ? (
              <span>验证中...</span>
            ) : (
              <>
                <span>进入量化控制台</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="p-3 bg-[#0b0e14] rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1 leading-relaxed">
          <div className="font-semibold text-slate-300">💡 提示:</div>
          <div>• 初始默认密码为: <code className="text-amber-400 font-mono">admin123</code></div>
          <div>• 自定义密码可在服务器 <code className="text-slate-300 font-mono">.env</code> 中配置 <code className="text-emerald-400 font-mono">ADMIN_PASSWORD="您的新密码"</code>。</div>
          <div>• 现已支持 <strong>.env 动态即时重载</strong>（在文件修改保存后直接输入即可生效，无需重启服务）。</div>
        </div>
      </div>
    </div>
  );
};
