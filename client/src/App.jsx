import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Workspace from './pages/Workspace.jsx';
import AnnualPlan from './pages/AnnualPlan.jsx';

export default function App() {
  const { user, loading } = useAuth();
  const [hash, setHash] = useState(() => typeof window !== 'undefined' ? window.location.hash : '');

  useEffect(() => {
    function onHash() { setHash(window.location.hash); }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-400 bg-surface-base">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            width: '32px', height: '32px', 
            border: '3px solid #e5e5ea', 
            borderTopColor: 'var(--s-main)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}></div>
          <div className="text-sm" style={{ color: '#8e8e93' }}>加载中...</div>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // 沙盒路由：访问 #annual 或 #annual-plan 进入年度规划独立页面
  // (使用内置 mock 数据，无需登录态，便于预览)
  if (hash === '#annual' || hash === '#annual-plan') {
    return <AnnualPlan />;
  }

  if (!user) return <Login />;

  return <Workspace user={user} />;
}
