import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { supabase } from './lib/supabase.js';
import { initTheme } from './utils/theme.js';
import { initModuleColors } from './utils/moduleTheme.js';

// 渲染前应用持久化的工作台主题色 + 五大模块色（避免主题闪烁）
initTheme();
initModuleColors();

// 调试用：暴露 supabase 到全局，方便控制台操作数据
if (import.meta.env.DEV || true) {
  window.__supabase = supabase;
}

// 全局 JS / Promise 错误兜底（避免 React 渲染外的静默白屏）
(function installGlobalErrorLog() {
  let mounted = null;
  function ensurePanel() {
    if (mounted) return mounted;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;max-height:40vh;z-index:99999;' +
      'background:#FFEEED;border:1px solid #FFD9D6;color:#FF3B30;' +
      'border-radius:8px;padding:10px 12px;font-size:12px;overflow:auto;box-shadow:0 4px 16px rgba(0,0,0,.12);';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;';
    title.innerHTML = '<span>⚠️ 运行时错误（可关闭）</span><button style="background:transparent;border:0;color:#FF3B30;cursor:pointer;">×</button>';
    const body = document.createElement('pre');
    body.style.cssText = 'white-space:pre-wrap;word-break:break-all;margin:0;font-family:inherit;';
    title.querySelector('button').onclick = () => el.remove();
    el.appendChild(title); el.appendChild(body);
    mounted = { root: el, body };
    return mounted;
  }
  function report(msg) {
    const { root, body } = ensurePanel();
    body.textContent = msg + '\n\n' + body.textContent;
    if (!root.parentNode) document.body.appendChild(root);
  }
  window.addEventListener('error', e => report(`[error] ${e.message}\n${e.filename}:${e.lineno}:${e.colno}`));
  window.addEventListener('unhandledrejection', e => report(`[unhandled] ${e.reason?.message || e.reason}`));
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
