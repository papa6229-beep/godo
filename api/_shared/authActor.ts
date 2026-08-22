// api/_shared/authActor.ts
// R-AUTH-FOUNDATION-01 GREEN A — 서버 행위자 검증 가드(라우트 보호 진입점).
//
// 원칙:
//   - 행위자 정체성은 오직 "관리형 인증이 검증한 세션"에서만 온다(AuthSessionPort).
//     req.body 의 role/team/actor, 헤더의 임의 값, 화면용 sessionRole 은 절대 신뢰하지 않는다.
//   - 계정(역할·팀·승인상태)은 서버 디렉터리(AccountDirectoryPort)에서 userId 로 조회한다.
//   - 인증 미구성(CLERK_SECRET_KEY 없음) 시에는 라이브 앱 무회귀를 위해 현행 동작을 보존한다
//     (unconfigured). 실제 강제는 Clerk 설정이 완료되면 활성화된다(설정 보고 참조).
//   - 판정 규칙은 accountContract 하나만 사용한다.

import type { IncomingMessage } from 'http';
import type { VercelResponse } from './proxyResponse.js';
import { sendErrorResponse } from './proxyResponse.js';
import type { Account } from './accountContract.js';
import { canAccessProtected } from './accountContract.js';
import type { AuthConfigState, ProtectedEnvVerdict } from './authConfigContract.js';
import { deriveAuthConfigState, resolveProtectedEnv, buildAuthorizedParties } from './authConfigContract.js';

// ── 포트(경계) ────────────────────────────────────────────────────────────────
export interface VerifiedSession { userId: string; }
export interface AuthSessionPort {
  // 요청의 세션을 검증해 userId 를 반환한다. 검증 실패/세션 없음 → null.
  verify(req: IncomingMessage): Promise<VerifiedSession | null>;
}
export interface AccountDirectoryPort {
  getAccount(userId: string): Promise<Account | null>;
}
export interface AuthDeps { session: AuthSessionPort; directory: AccountDirectoryPort; }

// ── 구성 상태(공통 계약 기반) ─────────────────────────────────────────────────
// 단일 키 유무가 아니라 authConfigContract 로 complete/partial/off 를 판정한다.
//   - complete               → 인증 강제(401/403)
//   - partial + 보호환경     → 안전한 503(로그인을 쓰려다 설정이 덜 찬 배포 — 익명 open 금지)
//   - off                    → 로그인 미사용 배포(공개키 없음) → 기존처럼 연다
//   - partial + 명시적 로컬  → 현행 open(개발 편의)
//
// ★ B-use-4: 보호환경 판정을 `VERCEL_ENV` 하나에서 `resolveProtectedEnv` 로 넓혔다.
//   최종 실행 장소가 미확정이고 유력 방향이 회사 서버·고도몰 전용 서버이므로,
//   Vercel 밖에서 환경변수가 빠졌을 때 로컬 개발로 오인해 익명으로 열리면 안 된다.
//   판정 불가 환경은 보호환경으로 취급한다(fail-closed).
export interface ServerAuthConfig {
  state: AuthConfigState;
  /** 인증 미구성 시 503 으로 닫을 환경인가. */
  protectedEnv: boolean;
  /** 그렇게 판정한 근거(검사·진단용, 비밀값 없음). */
  envReason: ProtectedEnvVerdict['reason'];
  authorizedParties: string[];
  /**
   * @deprecated 이름이 Vercel 배포만 뜻하는 것으로 읽힌다. `protectedEnv` 를 쓴다.
   * 기존 호출부 호환을 위해 같은 값을 노출한다.
   */
  deployment: boolean;
}
export function resolveServerAuthConfig(env: NodeJS.ProcessEnv = process.env): ServerAuthConfig {
  const verdict = resolveProtectedEnv({
    vercelEnv: env.VERCEL_ENV,
    nodeEnv: env.NODE_ENV,
    authEnforce: env.AUTH_ENFORCE,
    authDevOpen: env.AUTH_DEV_OPEN
  });
  const authorizedParties = buildAuthorizedParties({
    // 회사 서버에서는 이 하나로 완결된다. 아래 Vercel 변수는 Vercel 위에서만 채워지는 추가 입력.
    raw: env.AUTH_AUTHORIZED_PARTIES,
    productionUrl: env.VERCEL_PROJECT_PRODUCTION_URL,
    deploymentUrl: env.VERCEL_URL,
    branchUrl: env.VERCEL_BRANCH_URL
  });
  const state = deriveAuthConfigState({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY,
    authorizedParties,
    protectedEnv: verdict.protectedEnv
  });
  return {
    state,
    protectedEnv: verdict.protectedEnv,
    envReason: verdict.reason,
    authorizedParties,
    deployment: verdict.protectedEnv
  };
}
export const isAuthConfigured = (): boolean => resolveServerAuthConfig().state === 'complete';

// ── 행위자 판정 ───────────────────────────────────────────────────────────────
export type ActorResolution =
  | { mode: 'unconfigured' }
  | { mode: 'unauthenticated' }
  | { mode: 'forbidden'; account: Account; reason: 'PENDING_APPROVAL' | 'ACCOUNT_SUSPENDED' | 'NO_ACCOUNT' }
  | { mode: 'active'; account: Account };

export async function resolveActor(req: IncomingMessage, deps: AuthDeps): Promise<ActorResolution> {
  const session = await deps.session.verify(req);
  if (!session || !session.userId) return { mode: 'unauthenticated' };
  const account = await deps.directory.getAccount(session.userId);
  if (!account) {
    // 검증된 세션이지만 승인된 계정이 없음(가입 대기 이전/메타데이터 없음) → 보호 자원 접근 불가.
    return { mode: 'forbidden', account: emptyAccount(session.userId), reason: 'NO_ACCOUNT' };
  }
  if (canAccessProtected(account)) return { mode: 'active', account };
  return {
    mode: 'forbidden',
    account,
    reason: account.status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'PENDING_APPROVAL'
  };
}

const emptyAccount = (userId: string): Account =>
  ({ userId, name: '', team: 'hq', position: '', role: 'member', status: 'pending', history: [] });

// ── 라우트 래퍼 ───────────────────────────────────────────────────────────────
// 검증된 active 계정을 inner 핸들러에 전달하기 위한 확장 필드(서버 전용, 응답 미노출).
export interface ActorRequest extends IncomingMessage { actor?: Account; }

// 보호 라우트 래퍼. deps 미지정 시 기본(Clerk) 어댑터를 지연 로드한다.
// A.1 fail-closed: 설정 complete → 강제 / 미완전+배포(Preview·Production) → 503 / 미완전+로컬 → open.
// 제네릭 R 로 ExtendedRequest(body 포함) 핸들러도 그대로 래핑한다.
export function protectedHandler<R extends IncomingMessage>(
  inner: (req: R, res: VercelResponse) => unknown | Promise<unknown>,
  depsOverride?: AuthDeps
) {
  return async (req: R, res: VercelResponse) => {
    if (!depsOverride) {
      const cfg = resolveServerAuthConfig();
      if (cfg.state !== 'complete') {
        if (cfg.state === 'partial' && cfg.protectedEnv) {
          // 로그인을 쓰겠다고 선언(공개키 존재)했는데 설정이 덜 찬 보호환경:
          //   익명 open 도, SDK/키 오류 크래시도 아닌 정적 503 으로 닫는다(fail-closed 유지).
          //   Vercel Preview/Production · NODE_ENV=production(회사 서버형) · AUTH_ENFORCE · 환경 불명 전부 포함.
          return sendErrorResponse(res, 'AUTH_NOT_CONFIGURED', '서버 인증 설정이 완료되지 않아 이 기능이 잠시 닫혀 있습니다. 관리자에게 문의하세요.', 503);
        }
        // state === 'off' = 공개 Clerk 키가 없다 = 이 배포는 로그인을 쓰지 않는다(사용자 결정).
        //   보호환경이어도 인증을 활성화하지 않고 기존 동작 그대로 연다.
        //   (state === 'partial' + 명시적 로컬 개발도 종전과 같이 open.)
        return inner(req, res);
      }
    }
    const deps = depsOverride ?? (await loadDefaultAuthDeps());
    // B-use-4: 세션 검증·계정 조회가 **throw** 하면(잘못된 키 형식·SDK 오류·디렉터리 장애)
    //   요청이 500 으로 터지거나 조용히 통과해서는 안 된다. 안전한 쪽(503)으로 닫는다.
    //   (기존 auth 브랜치 주석의 의도 "SDK/키 오류 크래시도 아닌 정적 503" 을 실제로 강제한다.)
    let r: ActorResolution;
    try {
      r = await resolveActor(req, deps);
    } catch {
      return sendErrorResponse(res, 'AUTH_NOT_CONFIGURED', '서버 인증을 확인할 수 없어 이 기능이 잠시 닫혀 있습니다. 관리자에게 문의하세요.', 503);
    }
    if (r.mode === 'unconfigured') return inner(req, res);
    if (r.mode === 'unauthenticated') {
      return sendErrorResponse(res, 'AUTH_REQUIRED', '로그인이 필요합니다.', 401);
    }
    if (r.mode === 'forbidden') {
      const msg = r.reason === 'ACCOUNT_SUSPENDED'
        ? '정지된 계정입니다. 관리자에게 문의하세요.'
        : '승인 대기 중입니다. 팀장 또는 총괄 관리자의 승인 후 이용할 수 있습니다.';
      return sendErrorResponse(res, r.reason, msg, 403);
    }
    (req as ActorRequest).actor = r.account;
    return inner(req, res);
  };
}

// 기본 인증 의존성(Clerk 어댑터)을 지연 로드한다. @clerk/backend 는 설정 시 설치되며,
// 미설치·미구성 환경에서는 이 경로에 도달하지 않는다(isAuthConfigured 가 먼저 걸러냄).
let _cachedDeps: AuthDeps | null = null;
async function loadDefaultAuthDeps(): Promise<AuthDeps> {
  if (_cachedDeps) return _cachedDeps;
  const mod = await import('./clerkAuthAdapter.js');
  _cachedDeps = mod.createClerkAuthDeps();
  return _cachedDeps;
}
