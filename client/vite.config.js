import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // React + router change far less often than the app: in their own chunk they stay cached across deploys.
      // 'react-dom/client' is its own module (the big one) — listing only 'react-dom' leaves it in the entry.
      output: { manualChunks: { vendor: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'] } },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
