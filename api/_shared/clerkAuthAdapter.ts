// api/_shared/clerkAuthAdapter.ts
// R-AUTH-FOUNDATION-01 GREEN A.1 — 관리형 인증(Clerk) 어댑터(정적 import·실 모듈 해석).
//
// A.1 보정: 비리터럴 동적 import(빌드 사각지대)를 제거하고 @clerk/backend 를 정적으로 참조한다.
//   → SDK 미설치·버전 불일치는 이제 타입검사·빌드가 실패시킨다.
// 이 모듈은 protectedHandler 가 설정 complete 일 때만 로드·실행한다(미구성 경로는 여기 도달 전 차단).
// 비밀번호는 Clerk 이 저장·검증한다. 이 계층은 임시 비번을 Clerk 에 전달만 하고 보관·로그하지 않는다.
//
// 공식 문서 근거(Clerk):
//   - 서버 세션 검증: createClerkClient().authenticateRequest(request, { authorizedParties, jwtKey })
//   - 계정 메타: users.getUser / users.updateUserMetadata(publicMetadata) / users.getUserList
//   - 임시 비번: users.updateUser(userId, { password, signOutOfOtherSessions: true })
//   - 다음 로그인 시 변경 강제: users.setPasswordCompromised(userId, { revokeAllSessions: true })
//   - 정지 보조: users.lockUser(userId)

import type { IncomingMessage } from 'http';
import { createClerkClient } from '@clerk/backend';
import type { User } from '@clerk/backend';
import type { Account, AccountRole, AccountStatus, AccountTeam, AccountHistoryEntry } from './accountContract.js';
import type { AuthDeps, AuthSessionPort, VerifiedSession } from './authActor.js';
import type { ApprovalDirectoryPort } from './accountDirectory.js';
import { buildAuthorizedParties } from './authConfigContract.js';

// 서버도 클라와 동일한 VITE_CLERK_PUBLISHABLE_KEY 를 공용으로 읽는다(중복 키 입력 방지).
// CLERK_PUBLISHABLE_KEY 가 별도로 있으면 그것도 허용한다.
export const readServerPublishableKey = (env: NodeJS.ProcessEnv = process.env): string | undefined =>
  env.VITE_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || undefined;

export const readAuthorizedParties = (env: NodeJS.ProcessEnv = process.env): string[] =>
  buildAuthorizedParties({
    raw: env.AUTH_AUTHORIZED_PARTIES,
    productionUrl: env.VERCEL_PROJECT_PRODUCTION_URL,
    deploymentUrl: env.VERCEL_URL,
    branchUrl: env.VERCEL_BRANCH_URL
  });

type ClerkClient = ReturnType<typeof createClerkClient>;
let _client: ClerkClient | null = null;
function clerk(): ClerkClient {
  if (_client) return _client;
  _client = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: readServerPublishableKey()
  });
  return _client;
}

// ── 세션 검증 ─────────────────────────────────────────────────────────────────
const clerkSession: AuthSessionPort = {
  async verify(req: IncomingMessage): Promise<VerifiedSession | null> {
    const host = (req.headers.host as string) || 'localhost';
    const url = `https://${host}${req.url || '/'}`;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(', ');
    }
    const request = new Request(url, { method: req.method || 'GET', headers });
    const parties = readAuthorizedParties();
    const state = await clerk().authenticateRequest(request, {
      // 배포환경에서는 protectedHandler 가 parties 비어있음 자체를 503 으로 차단하므로
      // 여기 도달 시 parties 는 항상 유효하다. 로컬은 생략 가능(개발 편의).
      ...(parties.length > 0 ? { authorizedParties: parties } : {}),
      ...(process.env.CLERK_JWT_KEY ? { jwtKey: process.env.CLERK_JWT_KEY } : {})
    });
    if (!state.isAuthenticated) return null;
    const auth = state.toAuth();
    return auth && auth.userId ? { userId: auth.userId } : null;
  }
};

// ── publicMetadata ↔ Account 매핑 ─────────────────────────────────────────────
function metaToAccount(userId: string, user: User): Account | null {
  const m = (user.publicMetadata || {}) as Record<string, unknown>;
  const acct = m.account as Partial<Account> | undefined;
  if (!acct || !acct.role || !acct.status) return null; // 승인 절차 이전 세션 → 계정 없음
  return {
    userId,
    name: String(acct.name ?? user.username ?? ''),
    team: (acct.team ?? 'hq') as AccountTeam,
    position: String(acct.position ?? ''),
    role: acct.role as AccountRole,
    status: acct.status as AccountStatus,
    history: Array.isArray(acct.history) ? (acct.history as AccountHistoryEntry[]) : []
  };
}

// ── 디렉터리(계정 조회·저장·목록·비번·잠금) ───────────────────────────────────
const clerkDirectory: ApprovalDirectoryPort = {
  async getAccount(userId: string): Promise<Account | null> {
    const user = await clerk().users.getUser(userId);
    return metaToAccount(userId, user);
  },
  async saveAccount(account: Account): Promise<void> {
    // 비밀번호는 저장하지 않는다. account 스냅샷만 publicMetadata.account 로 병합.
    await clerk().users.updateUserMetadata(account.userId, { publicMetadata: { account } });
  },
  async listAccounts(): Promise<Account[]> {
    const res = await clerk().users.getUserList({ limit: 200 });
    return res.data.map((u) => metaToAccount(u.id, u)).filter((a): a is Account => !!a);
  },
  async setPassword(userId: string, password: string): Promise<void> {
    // 임시 비번 발급 계약: ①비번 교체+기존 세션 전부 종료 ②다음 로그인 시 변경 강제.
    await clerk().users.updateUser(userId, { password, signOutOfOtherSessions: true });
    await clerk().users.setPasswordCompromised(userId, { revokeAllSessions: true });
  },
  async lockAccount(userId: string): Promise<void> {
    await clerk().users.lockUser(userId);
  }
};

export function createClerkAuthDeps(): AuthDeps {
  return { session: clerkSession, directory: clerkDirectory };
}
export function createClerkDirectory(): ApprovalDirectoryPort {
  return clerkDirectory;
}
