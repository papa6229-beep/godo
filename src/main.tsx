import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.tsx'
import ClerkAuthBridge from './components/auth/ClerkAuthBridge.tsx'

// B-use-4: VITE_CLERK_PUBLISHABLE_KEY 가 있으면 ClerkProvider 로 감싼다.
// 키가 없으면(명시적 로컬 미구성) 현행 앱 그대로 — 게이트는 'open'.
// 서버는 보호환경(Vercel 배포 · NODE_ENV=production 회사 서버 · 환경 불명)에서 fail-closed 다.
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
        <ClerkAuthBridge />
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
)
