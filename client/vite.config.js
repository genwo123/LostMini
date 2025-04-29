// client/vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  envDir: '../',
  base: '/', // 기본 경로
  build: {
    outDir: resolve(__dirname, '../server/public'), // 서버가 빌드 파일 서빙
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true, // 브라우저 자동으로 열기
    proxy: {
      '/.proxy/socket': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/.proxy/, ''),
        ws: true,
      },
      '/.proxy/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/.proxy/, ''),
      }
    }
  }
});