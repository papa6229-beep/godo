// api/_shared/authConfigContract.ts
// R-AUTH-FOUNDATION-01 GREEN A.1 — 인증 설정 상태 공통 계약(순수, import 0).
//
// 서버(protectedHandler/api/auth)와 클라이언트(authGate)가 같은 규칙으로 설정 상태를 판정한다.
//   - complete: 강제 가능(secret + publishable + [배포환경이면 authorizedParties 1개 이상])
//   - partial : 일부만 설정 — 배포환경에서는 익명으로 열지 않고 안전한 503 으로 닫는다
//   - off     : 아무 키도 없음 — 배포환경 503 / 로컬 개발만 명시적으로 open 허용
// 배포환경 판정은 Vercel 이 제공하는 VERCEL_ENV(production|preview)만 사용한다(요청 Host 불신).

export type AuthConfigState = 'complete' | 'partial' | 'off';

export interface AuthConfigInput {
  secretKey: string | undefined;        // CLERK_SECRET_KEY
  publishableKey: string | undefined;   // VITE_CLERK_PUBLISHABLE_KEY(서버도 동일 이름 공용)
  authorizedParties: string[];          // buildAuthorizedParties 결과
  deployment: boolean;                  // isDeploymentEnv(VERCEL_ENV)
}

export const isDeploymentEnv = (vercelEnv: string | undefined): boolean =>
  vercelEnv === 'production' || vercelEnv === 'preview';

export function deriveAuthConfigState(i: AuthConfigInput): AuthConfigState {
  const hasSecret = !!i.secretKey;
  const hasPublishable = !!i.publishableKey;
  if (!hasSecret && !hasPublishable) return 'off';
  if (!hasSecret || !hasPublishable) return 'partial';
  if (i.deployment && i.authorizedParties.length === 0) return 'partial'; // 배포에서 azp 생략 금지
  return 'complete';
}

// 허용 출처: AUTH_AUTHORIZED_PARTIES(콤마 구분) + Vercel 제공 배포 도메인(env 기반, 요청 Host 아님).
export interface AuthorizedPartiesInput {
  raw: string | undefined;                    // AUTH_AUTHORIZED_PARTIES
  productionUrl: string | undefined;          // VERCEL_PROJECT_PRODUCTION_URL (예: godo-psi.vercel.app)
  deploymentUrl: string | undefined;          // VERCEL_URL (이 배포 자신의 도메인)
  branchUrl: string | undefined;              // VERCEL_BRANCH_URL
}
const toOrigin = (host: string): string => (host.startsWith('http') ? host : `https://${host}`);
export function buildAuthorizedParties(i: AuthorizedPartiesInput): string[] {
  const out = new Set<string>();
  for (const p of (i.raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) out.add(toOrigin(p));
  for (const h of [i.productionUrl, i.deploymentUrl, i.branchUrl]) if (h) out.add(toOrigin(h));
  return Array.from(out);
}

// 클라이언트측 동일 계약(클라가 관측 가능한 부분집합): publishable 유무만 판정 가능.
// 서버가 최종 경계(503/401/403)를 강제하므로 클라 판정은 화면 게이트 용도다.
export const deriveClientConfigured = (publishableKey: string | undefined): boolean => !!publishableKey;
