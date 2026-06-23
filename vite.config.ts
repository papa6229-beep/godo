import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // LM Studio 로컬 프록시. Windows의 localhost->IPv6(::1) 미스를 피하려 IPv4 127.0.0.1로 고정.
      // 최종 upstream: http://127.0.0.1:1234/v1/<path>  (예: /lmstudio/v1/chat/completions -> .../v1/chat/completions)
      '/lmstudio/v1': {
        target: 'http://127.0.0.1:1234/v1',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/lmstudio\/v1/, '')
      }
    }
  }
})
