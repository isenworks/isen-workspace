import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Workspace from './pages/Workspace.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-400">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            width: '32px', height: '32px', 
            border: '3px solid #e5e5ea', 
            borderTopColor: '#007aff', 
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

  if (!user) return <Login />;
  return <Workspace user={user} />;
}
