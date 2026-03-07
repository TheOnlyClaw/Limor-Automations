import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim()
  const useLocalProxy = !apiBaseUrl

  return {
    plugins: [react()],
    server: useLocalProxy
      ? {
          proxy: {
            '/api': 'http://localhost:3000',
            '/health': 'http://localhost:3000',
          },
        }
      : undefined,
  }
})
