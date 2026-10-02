import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true } }
  }
})
