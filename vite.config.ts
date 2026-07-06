import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleAiChat } from './api/_shared/aiProviderServer'
import type { AiChatServerRequest } from './api/_shared/aiProviderServer'

// dev(순수 vite)에서는 api/ 서버리스 함수가 뜨지 않으므로, /api/ai/chat 를
// 같은 handleAiChat 로직으로 처리하는 미들웨어를 붙인다. (Production은 api/ai/chat.ts 사용)
// 연결 키는 요청 단위로만 사용하고 저장/로그하지 않는다.
function aiChatDevPlugin(): Plugin {
  return {
    name: 'godo-ai-chat-dev',
    configureServer(server) {
      server.middlewares.use('/api/ai/chat', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const raw = Buffer.concat(chunks).toString('utf-8')
          const body = (raw ? JSON.parse(raw) : {}) as Partial<AiChatServerRequest>
          const result = await handleAiChat({
            providerId: body.providerId as AiChatServerRequest['providerId'],
            apiKey: body.apiKey || '',
            modelId: body.modelId || '',
            messages: Array.isArray(body.messages) ? body.messages : [],
            temperature: body.temperature,
            maxTokens: body.maxTokens,
            purpose: body.purpose
          })
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify(result))
        } catch {
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify({ ok: false, providerId: 'unknown', errorKind: 'unknown', errorMessage: '요청 처리 중 오류가 발생했습니다.' }))
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), aiChatDevPlugin()],
  // 이식된 상세페이지 생성기의 react-rnd(react-draggable) 드래그 복구.
  // react-draggable/build/cjs/Draggable.js 의 log()가 `process.env.DRAGGABLE_DEBUG`를
  // 참조하는데, 브라우저엔 process가 없어 드래그 시작 시 ReferenceError로 드래그가 죽음.
  // 해당 표현식만 false로 치환해 예외 제거(다른 process 참조/NODE_ENV엔 영향 없음).
  define: {
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
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
