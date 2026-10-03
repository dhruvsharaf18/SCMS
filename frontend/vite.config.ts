import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev mode (SRS 11.2): Vite serves the SPA and proxies /api to the API container,
// forwarding the client IP so the rate limiter and lockout see the real address (S-23).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true, xfwd: true },
      '/health': { target: 'http://localhost:8000', changeOrigin: true, xfwd: true },
    },
  },
})
