import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // React + router change far less often than the app: in their own chunk they stay cached across deploys.
      // 'react-dom/client' is its own module (the big one) — listing only 'react-dom' leaves it in the entry.
      // Icons: one chunk. Split per lazy page they became a dozen tiny files fetched one by one after the page
      // code — each a full round trip (~0.5 s on a phone) for half a kilobyte.
      output: {
        manualChunks(id) {
          const p = id.replace(/\\/g, '/'); // Windows paths
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(p)) return 'vendor';
          if (/node_modules\/lucide-react\//.test(p)) return 'icons';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      // Served by the API server (built live from the network), same as in production.
      '/sitemap.xml': { target: 'http://localhost:4000', changeOrigin: true },
      '/robots.txt': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
