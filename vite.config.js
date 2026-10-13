import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  base: command === 'build' ? process.env.BASE_PATH ?? '/tmp-car/' : '/',
  server: {
    port: 8081,
  },
  preview: {
    port: 8081,
  },
}))

