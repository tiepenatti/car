import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/car/' : '/',
  server: {
    port: 8081,
  },
  preview: {
    port: 8081,
  },
}))
