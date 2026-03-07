import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBasePath(value?: string) {
  if (!value) return '/'
  const trimmed = value.trim()
  if (trimmed === '/' || trimmed === '') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`
}

// https://vite.dev/config/
export default defineConfig({
  base: normalizeBasePath(process.env.BASE_PATH),
  plugins: [react()],
})
