import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.tsx'
import ClerkAuthBridge from './components/auth/ClerkAuthBridge.tsx'

// AUTH-FOUNDATION-01 GREEN A.1: VITE_CLERK_PUBLISHABLE_KEY 가 있으면 ClerkProvider 로 감싼다.
// 키가 없으면(로컬 미구성) 현행 앱 그대로 — 게이트는 'open', 서버는 배포환경에서 fail-closed.
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
