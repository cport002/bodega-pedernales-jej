import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5210,
    strictPort: false,
    proxy: {
      '/api': { target: 'http://localhost:3007', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3007', changeOrigin: true }
    }
  }
})
