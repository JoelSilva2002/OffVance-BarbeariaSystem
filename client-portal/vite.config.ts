import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // 5174, não o 5173 padrão — evita colisão ao rodar lado a lado com
  // frontend/ (painel de equipe), que usa o padrão do Vite.
  server: {
    port: 5174,
  },
})
