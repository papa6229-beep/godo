// api/_shared/authConfigContract.ts
// B-use-4 — 인증 설정 상태 공통 계약(순수, import 0).
//
// 서버(protectedHandler/api/auth)와 클라이언트(authGate)가 같은 규칙으로 설정 상태를 판정한다.
//   - complete: 강제 가능(secret + publishable + [보호환경이면 authorizedParties 1개 이상])
//   - partial : 일부만 설정 — 보호환경에서는 익명으로 열지 않고 안전한 503 으로 닫는다
//   - off     : 아무 키도 없음 — 보호환경 503 / **명시적 로컬 개발만** open 허용
//
// ★ B-use-4 교정(인증 브랜치 대비 변경점)
//   인증 브랜치는 배포환경을 `VERCEL_ENV` 하나로만 판정했다(`isDeploymentEnv`).
//   최종 실행 장소가 아직 확정되지 않았고 현재 유력 방향이 **회사가 관리하는 서버 또는
//   고도몰 전용 서버**이므로, Vercel 밖에서는 `VERCEL_ENV` 가 아예 없다.
//   그대로 두면 회사 서버에서 인증 환경변수가 빠졌을 때 "로컬 개발"로 오인해 **익명으로 열린다.**
//   그래서 판정을 `resolveProtectedEnv` 로 넓히고 **기본값을 보호환경(fail-closed)** 으로 바꾼다.

export type AuthConfigState = 'complete' | 'partial' | 'off';

// ── 보호환경 판정 ────────────────────────────────────────────────────────────
/**
 * 이 런타임을 "보호환경"으로 볼 것인가.
 *   보호환경  = 인증 미구성 시 익명으로 열지 않고 503 으로 닫는다.
 *   로컬 개발 = 인증 미구성 시 기존 개발 화면을 그대로 연다.
 *
 * **판정할 수 없으면 보호환경이다.** 개발 신호는 반드시 명시적이어야 한다.
 */
export interface ProtectedEnvInput {
  /** Vercel 이 주입하는 배포 단계. Vercel 밖에서는 undefined. */
  vercelEnv: string | undefined;
  /** 표준 Node 실행 단계. 회사 서버 운영 기동은 보통 'production'. */
  nodeEnv: string | undefined;
  /** 운영자가 인증을 명시적으로 강제(어떤 환경이든 보호환경으로 취급). */
  authEnforce: string | undefined;
  /** 운영자가 **명시적으로** 로컬 개발임을 선언(인증 미구성 open 허용). */
  authDevOpen: string | undefined;
}

const truthy = (v: string | undefined): boolean => {
  const s = (v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
};

export interface ProtectedEnvVerdict {
  /** true = 인증 미구성 시 503 으로 닫는다. */
  protectedEnv: boolean;
  /** 어떤 신호로 그렇게 판정했는가(로그·검사용, 비밀값 없음). */
  reason:
    | 'auth_enforce'          // AUTH_ENFORCE 로 명시적 강제
    | 'vercel_deployment'     // VERCEL_ENV=production|preview
    | 'node_production'       // NODE_ENV=production (회사 서버형)
    | 'explicit_local_dev'    // 명시적 개발 신호 → 보호환경 아님
    | 'unknown_fail_closed';  // 판정 불가 → 안전하게 보호환경
}

export function resolveProtectedEnv(i: ProtectedEnvInput): ProtectedEnvVerdict {
  // 1) 명시적 강제가 가장 세다. 어떤 환경이든 보호환경.
  if (truthy(i.authEnforce)) return { protectedEnv: true, reason: 'auth_enforce' };
  // 2) Vercel 이 스스로 알려주는 배포 단계.
  if (i.vercelEnv === 'production' || i.vercelEnv === 'preview') {
    return { protectedEnv: true, reason: 'vercel_deployment' };
  }
  // 3) 회사 서버·고도몰 전용 서버 등 Vercel 밖 운영 기동.
  if ((i.nodeEnv ?? '').trim().toLowerCase() === 'production') {
    return { protectedEnv: true, reason: 'node_production' };
  }
  // 4) 여기까지 왔으면 **명시적 개발 신호가 있어야만** 연다.
  const nodeEnv = (i.nodeEnv ?? '').trim().toLowerCase();
  const explicitDev = truthy(i.authDevOpen) || nodeEnv === 'development' || i.vercelEnv === 'development';
  if (explicitDev) return { protectedEnv: false, reason: 'explicit_local_dev' };
  // 5) 환경 불명 — 개인 데스크톱인지 회사 서버인지 알 수 없다. 안전한 쪽으로 닫는다.
  return { protectedEnv: true, reason: 'unknown_fail_closed' };
}

/**
 * @deprecated B-use-4 이전 판정. `resolveProtectedEnv` 를 쓴다.
 * Vercel 배포 단계만 보므로 회사 서버를 로컬 개발로 오인한다. 호환을 위해 남긴다.
 */
export const isDeploymentEnv = (vercelEnv: string | undefined): boolean =>
  vercelEnv === 'production' || vercelEnv === 'preview';

// ── 설정 상태 ────────────────────────────────────────────────────────────────
export interface AuthConfigInput {
  secretKey: string | undefined;        // CLERK_SECRET_KEY
  publishableKey: string | undefined;   // VITE_CLERK_PUBLISHABLE_KEY(서버도 동일 이름 공용)
  authorizedParties: string[];          // buildAuthorizedParties 결과
  /** resolveProtectedEnv().protectedEnv */
  protectedEnv: boolean;
}

export function deriveAuthConfigState(i: AuthConfigInput): AuthConfigState {
  const hasSecret = !!i.secretKey;
  const hasPublishable = !!i.publishableKey;
  if (!hasSecret && !hasPublishable) return 'off';
  if (!hasSecret || !hasPublishable) return 'partial';
  // 보호환경에서 허용 출처를 비워 두면 세션 검증 대상 origin 을 특정할 수 없다.
  if (i.protectedEnv && i.authorizedParties.length === 0) return 'partial';
  return 'complete';
}

// ── 허용 출처 ────────────────────────────────────────────────────────────────
/**
 * 허용 출처 = `AUTH_AUTHORIZED_PARTIES`(콤마 구분) + Vercel 이 제공하는 배포 도메인.
 *
 * ★ B-use-4: **`AUTH_AUTHORIZED_PARTIES` 하나만으로 완결될 수 있어야 한다.**
 *   Vercel 도메인 변수는 Vercel 위에서만 자동으로 채워지는 **추가 입력**일 뿐이며,
 *   회사 서버·고도몰 전용 서버에서는 존재하지 않는다. 유일한 경로가 되면 안 된다.
 * 요청 Host 는 신뢰하지 않는다(위조 가능) — 환경변수만 근거로 삼는다.
 */
export interface AuthorizedPartiesInput {
  raw: string | undefined;                    // AUTH_AUTHORIZED_PARTIES (회사 서버 포함 모든 환경)
  productionUrl: string | undefined;          // VERCEL_PROJECT_PRODUCTION_URL (Vercel 전용 · 선택)
  deploymentUrl: string | undefined;          // VERCEL_URL (Vercel 전용 · 선택)
  branchUrl: string | undefined;              // VERCEL_BRANCH_URL (Vercel 전용 · 선택)
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
