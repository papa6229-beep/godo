// src/services/authorizedFetch.ts
// R-AUTH-FOUNDATION-01 GREEN A.1 — 보호 API 호출 공용 fetch(세션 토큰 명시 전달).
//
// Clerk 공식 패턴: useAuth().getToken() 으로 세션 JWT 를 받아 Authorization: Bearer 로 전달한다
// (브라우저 쿠키 자동 전달을 추측하지 않는다 — 요청 경계에서 명시적으로 실어 보낸다).
// 토큰 게터는 ClerkAuthBridge 가 로그인 상태에서 등록한다. 미등록(인증 미구성/미로그인)이면
// 헤더 없이 기존과 동일하게 호출된다(미구성 로컬 무회귀; 배포에서는 서버가 401/503 로 닫는다).

export type SessionTokenGetter = () => Promise<string | null>;

let tokenGetter: SessionTokenGetter | null = null;

export function registerSessionTokenGetter(fn: SessionTokenGetter | null): void {
  tokenGetter = fn;
}
export const hasSessionTokenGetter = (): boolean => tokenGetter !== null;

// 보호 API 전용 fetch. 토큰 게터가 있으면 Authorization: Bearer <session JWT> 를 추가한다.
export async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!tokenGetter) return fetch(input, init);
  let token: string | null;
  try { token = await tokenGetter(); } catch { token = null; }
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
