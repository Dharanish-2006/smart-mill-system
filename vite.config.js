import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the dashboard talks to the REST API / WebSocket through this proxy,
// so the browser never needs CORS. Point VITE_DEV_API_TARGET at your real backend,
// or leave the default to use the bundled mock server (npm run mock).
const target = process.env.VITE_DEV_API_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target, ws: true, changeOrigin: true },
    },
  },
  build: { chunkSizeWarningLimit: 900 },
});
