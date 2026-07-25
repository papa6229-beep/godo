// src/services/authGate.ts
// R-AUTH-FOUNDATION-01 GREEN A — 클라이언트 인증 게이트(순수 판정 + config-gated 훅).
//
// 원칙:
//   - 인증 미구성(VITE_CLERK_PUBLISHABLE_KEY 없음) 시 게이트는 'open' → 앱이 현행대로 동작(무회귀).
//   - 구성됨 + 미로그인 → 'login', 로그인+승인대기 → 'pending', 정지 → 'suspended', active → 'app'.
//   - 로그인/승인 전에는 회사 대시보드·데이터 fetch 를 시작하지 않는다(shouldLoadCompanyData).
//   - 실제 로그인 상태는 관리형 인증(Clerk) 배선이 registerAuthSource 로 주입한다(설정 단계).
//     이 파일은 @clerk/react 를 정적 import 하지 않는다(미설치 환경에서도 빌드 가능).

import { useEffect, useState } from 'react';

export type AuthGateMode = 'open' | 'loading' | 'login' | 'pending' | 'suspended' | 'app';
export type AccountLiveStatus = 'pending' | 'active' | 'suspended' | null;

export interface AuthGateInput {
  configured: boolean;
  loaded: boolean;      // 인증 상태 로딩 완료 여부
  signedIn: boolean;
  status?: AccountLiveStatus; // 서버 /api/auth/me 의 승인상태(로그인 시)
}

// 순수 판정(검사 대상).
export function computeAuthGate(i: AuthGateInput): AuthGateMode {
  if (!i.configured) return 'open';
  if (!i.loaded) return 'loading';
  if (!i.signedIn) return 'login';
  if (i.status === 'active') return 'app';
  if (i.status === 'suspended') return 'suspended';
  return 'pending'; // 로그인했지만 active 계정 없음(승인 대기 또는 계정 미생성)
}

// 회사 데이터 fetch 를 시작해도 되는 상태인가(미로그인/대기/정지 → false).
export const shouldLoadCompanyData = (mode: AuthGateMode): boolean =>
  mode === 'open' || mode === 'app';

// Vite 환경변수(빌드 시 주입). 미설정 → 미구성.
export const isAuthConfigured = (): boolean => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return !!(env && env.VITE_CLERK_PUBLISHABLE_KEY);
  } catch {
    return false;
  }
};

// ── 라이브 상태 소스 레지스트리(Clerk 배선이 주입) ────────────────────────────
type AuthSource = () => AuthGateInput;
let liveSource: AuthSource | null = null;
const subscribers = new Set<() => void>();

export function registerAuthSource(fn: AuthSource): void {
  liveSource = fn;
  subscribers.forEach((s) => s());
}
export function notifyAuthChange(): void {
  subscribers.forEach((s) => s());
}

export function readAuthInput(): AuthGateInput {
  if (!isAuthConfigured()) return { configured: false, loaded: true, signedIn: false, status: null };
  if (!liveSource) return { configured: true, loaded: false, signedIn: false, status: null };
  return liveSource();
}

// config-gated 훅: 미구성 → 항상 'open'(현행 앱). 구성됨 → 주입된 소스 기반.
export function useAuthGate(): AuthGateMode {
  const [, force] = useState(0);
  useEffect(() => {
    const s = () => force((x) => x + 1);
    subscribers.add(s);
    return () => { subscribers.delete(s); };
  }, []);
  return computeAuthGate(readAuthInput());
}
