// src/components/AuthGateScreen.tsx
// R-AUTH-FOUNDATION-01 GREEN A.1 — 인증 게이트 실화면.
//
// 화면은 확정 범위만: 로그인 / 가입 신청(이름·팀·직책·희망 아이디·비밀번호 5개) /
// 승인 대기(로그아웃·상태 재확인) / 정지 안내(로그아웃). 이메일·전화·프로필·다중회사 없음.
// 커스텀 플로우는 Clerk 공식 useSignIn/useSignUp(@clerk/react 6 Signal API — .d.ts 로 시그니처 확정):
//   로그인: signIn.password({ identifier, password }) → status 'complete' → signIn.finalize()
//   가입:   signUp.password({ username, password }) → status 'complete' → signUp.finalize()
//           → (브리지가 signup-metadata 로 이름·팀·직책 전송)
// 비밀번호는 Clerk SDK 로만 전달된다(우리 API·상태·localStorage·로그에 넣지 않는다).
// 이 컴포넌트는 인증이 구성된 경우에만 렌더된다(ClerkProvider 내부 보장).

import { useState } from 'react';
import type { FormEvent, CSSProperties } from 'react';
import { useSignIn, useSignUp, useClerk } from '@clerk/react';
import type { AuthGateMode } from '../services/authGate';
import { setPendingSignupProfile, refreshAuthStatus, getServerAccount } from '../services/authGate';
import { authorizedFetch } from '../services/authorizedFetch';

// 정본 팀 목록(sessionRole 의 운영팀 어휘 재사용 — 새 팀 체계를 만들지 않는다).
const TEAM_OPTIONS: { id: string; label: string }[] = [
  { id: 'product', label: '상품관리팀' },
  { id: 'cs', label: 'CS팀' },
  { id: 'marketing', label: '마케팅팀' },
  { id: 'design', label: '디자인팀' }
];

const WRAP: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', gap: 16, padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif',
  background: '#f8fafc'
};
const CARD: CSSProperties = {
  maxWidth: 420, width: '100%', padding: 32, borderRadius: 16,
  border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', background: '#fff', textAlign: 'left'
};
const FIELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const INPUT: CSSProperties = { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 };
const BTN: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
  background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer'
};
const BTN2: CSSProperties = { ...BTN, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
const ERR: CSSProperties = { color: '#dc2626', fontSize: 13, margin: '8px 0 0' };

// ── 로그인 폼(아이디·비밀번호) ────────────────────────────────────────────────
function LoginForm() {
  const { signIn, fetchStatus } = useSignIn();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const busy = fetchStatus === 'fetching';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!signIn || busy) return;
    setError('');
    const { error: pwError } = await signIn.password({ identifier: username.trim(), password });
    if (pwError) {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      return;
    }
    if (signIn.status === 'complete') {
      await signIn.finalize();
      await refreshAuthStatus();
    } else {
      // 세션 태스크(강제 비밀번호 변경 등) 추가 단계는 이번 채택 범위에 없다 — 새로 구현하지 않는다.
      // 그런 상태가 나오면 여기서 멈추고 관리자(Clerk 대시보드)로 넘긴다.
      setError(`추가 확인이 필요합니다(${signIn.status}). 총괄 관리자에게 문의하세요.`);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div style={FIELD}>
        <label htmlFor="login-username" style={{ fontSize: 13, color: '#374151' }}>아이디</label>
        <input id="login-username" style={INPUT} autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div style={FIELD}>
        <label htmlFor="login-password" style={{ fontSize: 13, color: '#374151' }}>비밀번호</label>
        <input id="login-password" style={INPUT} type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <button type="submit" style={BTN} disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
      {error && <p style={ERR}>{error}</p>}
      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>
        비밀번호를 잊으셨나요? 총괄 관리자에게 문의하세요(Clerk 관리자 대시보드에서 처리합니다).
      </p>
    </form>
  );
}

// ── 가입 신청 폼(이름·팀·직책·희망 아이디·비밀번호 — 정확히 5개) ──────────────
function SignupForm() {
  const { signUp, fetchStatus } = useSignUp();
  const [name, setName] = useState('');
  const [team, setTeam] = useState(TEAM_OPTIONS[0].id);
  const [position, setPosition] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const busy = fetchStatus === 'fetching';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!signUp || busy) return;
    setError('');
    // 이름·팀·직책은 브리지가 가입 완료 직후 /api/auth/signup-metadata 로 전송(비번 미포함).
    setPendingSignupProfile({ name: name.trim(), team, position: position.trim() });
    const { error: pwError } = await signUp.password({ username: username.trim(), password });
    if (pwError) {
      setPendingSignupProfile(null);
      setError('가입에 실패했습니다. 아이디 중복 또는 비밀번호 규칙(8자 이상)을 확인하세요.');
      return;
    }
    if (signUp.status === 'complete') {
      await signUp.finalize();
      await refreshAuthStatus();
    } else {
      setPendingSignupProfile(null);
      setError(`가입을 완료할 수 없습니다(${signUp.status}). Clerk 설정(아이디+비밀번호, 이메일 해제)을 확인하세요.`);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div style={FIELD}>
        <label htmlFor="su-name" style={{ fontSize: 13, color: '#374151' }}>이름</label>
        <input id="su-name" style={INPUT} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div style={FIELD}>
        <label htmlFor="su-team" style={{ fontSize: 13, color: '#374151' }}>소속 팀</label>
        <select id="su-team" style={INPUT} value={team} onChange={(e) => setTeam(e.target.value)}>
          {TEAM_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div style={FIELD}>
        <label htmlFor="su-position" style={{ fontSize: 13, color: '#374151' }}>직책</label>
        <input id="su-position" style={INPUT} value={position} onChange={(e) => setPosition(e.target.value)} required />
      </div>
      <div style={FIELD}>
        <label htmlFor="su-username" style={{ fontSize: 13, color: '#374151' }}>희망 아이디</label>
        <input id="su-username" style={INPUT} autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div style={FIELD}>
        <label htmlFor="su-password" style={{ fontSize: 13, color: '#374151' }}>비밀번호</label>
        <input id="su-password" style={INPUT} type="password" autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </div>
      <button type="submit" style={BTN} disabled={busy}>{busy ? '신청 중…' : '가입 신청'}</button>
      {error && <p style={ERR}>{error}</p>}
      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>
        신청 후 팀장(또는 총괄 관리자) 승인이 나면 이용할 수 있습니다.
      </p>
    </form>
  );
}

// ── 승인 대기(프로필 미완성 보완 포함) ────────────────────────────────────────
function PendingScreen() {
  const { signOut } = useClerk();
  const account = getServerAccount();
  const needsProfile = account === null; // 가입은 됐으나 이름·팀·직책 메타가 없는 경우 보완
  const [name, setName] = useState('');
  const [team, setTeam] = useState(TEAM_OPTIONS[0].id);
  const [position, setPosition] = useState('');
  const [busy, setBusy] = useState(false);

  const submitProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await authorizedFetch('/api/auth/signup-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), team, position: position.trim() })
      });
      await refreshAuthStatus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ fontSize: 48, marginBottom: 8, textAlign: 'center' }}>🕓</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>승인 대기 중</h1>
      {needsProfile ? (
        <>
          <p style={{ color: '#6b7280', lineHeight: 1.6, marginBottom: 16 }}>
            가입 정보를 완성해 주세요. 제출하면 팀장에게 승인 요청이 전달됩니다.
          </p>
          <form onSubmit={submitProfile}>
            <div style={FIELD}>
              <label htmlFor="pf-name" style={{ fontSize: 13, color: '#374151' }}>이름</label>
              <input id="pf-name" style={INPUT} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div style={FIELD}>
              <label htmlFor="pf-team" style={{ fontSize: 13, color: '#374151' }}>소속 팀</label>
              <select id="pf-team" style={INPUT} value={team} onChange={(e) => setTeam(e.target.value)}>
                {TEAM_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div style={FIELD}>
              <label htmlFor="pf-position" style={{ fontSize: 13, color: '#374151' }}>직책</label>
              <input id="pf-position" style={INPUT} value={position} onChange={(e) => setPosition(e.target.value)} required />
            </div>
            <button type="submit" style={BTN} disabled={busy}>{busy ? '제출 중…' : '가입 정보 제출'}</button>
          </form>
        </>
      ) : (
        <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
          {account?.name ? `${account.name}님, ` : ''}가입 신청이 접수되었습니다.
          팀장 또는 총괄 관리자의 승인 후 이용할 수 있습니다.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" style={BTN2} onClick={() => void refreshAuthStatus()}>상태 다시 확인</button>
        <button type="button" style={BTN2} onClick={() => void signOut()}>로그아웃</button>
      </div>
    </>
  );
}

// ── 정지 안내 ─────────────────────────────────────────────────────────────────
function SuspendedScreen() {
  const { signOut } = useClerk();
  return (
    <>
      <div style={{ fontSize: 48, marginBottom: 8, textAlign: 'center' }}>🚫</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>정지된 계정</h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6 }}>이 계정은 현재 정지 상태입니다. 총괄 관리자에게 문의하세요.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" style={BTN2} onClick={() => void refreshAuthStatus()}>상태 다시 확인</button>
        <button type="button" style={BTN2} onClick={() => void signOut()}>로그아웃</button>
      </div>
    </>
  );
}

// ── 로그인/가입 탭 ────────────────────────────────────────────────────────────
function LoginScreen() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button type="button" style={{ ...(tab === 'login' ? BTN : BTN2), width: '50%' }} onClick={() => setTab('login')}>로그인</button>
        <button type="button" style={{ ...(tab === 'signup' ? BTN : BTN2), width: '50%' }} onClick={() => setTab('signup')}>가입 신청</button>
      </div>
      {tab === 'login' ? <LoginForm /> : <SignupForm />}
    </>
  );
}

export function AuthGateScreen({ mode }: { mode: AuthGateMode }) {
  return (
    <div style={WRAP}>
      <div style={CARD}>
        {mode === 'loading' && (
          <p style={{ color: '#6b7280', textAlign: 'center' }}>⏳ 로그인 상태를 확인하고 있습니다…</p>
        )}
        {mode === 'login' && <LoginScreen />}
        {mode === 'pending' && <PendingScreen />}
        {mode === 'suspended' && <SuspendedScreen />}
      </div>
    </div>
  );
}

export default AuthGateScreen;
