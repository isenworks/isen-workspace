import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cloudflare Pages 自动构建默认走 D1 后端（无需手动配 VITE_BACKEND 环境变量）
// 本地 dev 默认也走 D1：用 `npx wrangler pages dev functions -- npm run dev` 启动
// 如需覆盖：VITE_BACKEND=<任意值> npm run dev
process.env.VITE_BACKEND = process.env.VITE_BACKEND || 'pages-d1';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  build: {
    rollupOptions: {
      output: {
        // 拆分框架层为独立长缓存分块，避免随业务代码变化而失效
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'scheduler'],
        },
      },
    },
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
