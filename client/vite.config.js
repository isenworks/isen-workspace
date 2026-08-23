import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cloudflare Pages 自动构建默认走 D1 后端（无需手动配 VITE_BACKEND 环境变量）
// 本地 dev 如需临时测试 D1：VITE_BACKEND=pages-d1 npm run dev
const DEFAULT_BACKEND = process.env.NODE_ENV === 'production' ? 'pages-d1' : 'supabase';
process.env.VITE_BACKEND = process.env.VITE_BACKEND || DEFAULT_BACKEND;

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
