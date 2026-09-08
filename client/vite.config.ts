import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vite 配置：dev server 监听 5173，把 /api 代理到 Hono 后端 :3000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
