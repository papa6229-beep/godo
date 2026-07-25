// src/components/AuthGateScreen.tsx
// R-AUTH-FOUNDATION-01 GREEN A — 인증 게이트 화면(로그인/승인대기/정지/로딩).
//
// - 실제 로그인·가입 폼은 관리형 인증(Clerk) 의 프리빌트 컴포넌트(<SignIn>/<SignUp>)를 설정 단계에서
//   이 자리(login 모드)에 마운트한다. GREEN A 에서는 상태 안내까지만 제공한다(추측 구현 금지).
// - 이 화면은 인증이 구성되고 사용자가 active 가 아닐 때만 렌더된다(미구성 시 앱은 현행대로 동작).

import type { AuthGateMode } from '../services/authGate';

const WRAP: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', gap: 16, padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif'
};
const CARD: React.CSSProperties = {
  maxWidth: 420, width: '100%', padding: 32, borderRadius: 16,
  border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', background: '#fff'
};

export function AuthGateScreen({ mode }: { mode: AuthGateMode }) {
  const content: Record<string, { title: string; body: string; emoji: string }> = {
    loading: { emoji: '⏳', title: '확인 중', body: '로그인 상태를 확인하고 있습니다…' },
    login: { emoji: '🔑', title: '로그인이 필요합니다', body: '사내 계정으로 로그인하거나 가입을 신청하세요. (로그인 창은 인증 설정 후 이 자리에 나타납니다.)' },
    pending: { emoji: '🕓', title: '승인 대기 중', body: '가입 신청이 접수되었습니다. 팀장 또는 총괄 관리자의 승인 후 이용할 수 있습니다.' },
    suspended: { emoji: '🚫', title: '정지된 계정', body: '이 계정은 현재 정지 상태입니다. 총괄 관리자에게 문의하세요.' }
  };
  const c = content[mode] ?? content.loading;
  return (
    <div style={WRAP}>
      <div style={CARD}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{c.emoji}</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{c.title}</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{c.body}</p>
      </div>
    </div>
  );
}

export default AuthGateScreen;
