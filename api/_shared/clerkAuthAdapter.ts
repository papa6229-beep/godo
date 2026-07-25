// api/_shared/clerkAuthAdapter.ts
// R-AUTH-FOUNDATION-01 GREEN A — 관리형 인증(Clerk) 어댑터(설정 시 활성화되는 경계 구현).
//
// ⚠️ 이 파일은 "설정이 완료됐을 때만" 실행된다(isAuthConfigured 가 먼저 걸러냄).
//    - @clerk/backend 는 사용자가 설정 단계에서 설치한다. 미설치·미구성 환경에서는 이 코드가 로드되지 않는다.
//    - 그래서 정적 import 가 아니라 지연(동적) import 로만 참조한다(빌드·타입검사에 정적 의존을 만들지 않음).
//    - 여기서 검증하는 것은 세션(쿠키/토큰)뿐이다. 비밀번호는 Clerk 이 직접 다루며 이 계층을 통과하지 않는다.
//
// 공식 문서 근거(Clerk):
//   - 서버 세션 검증: createClerkClient({secretKey, publishableKey}).authenticateRequest(request, {authorizedParties, jwtKey})
//     → { isAuthenticated, toAuth().userId }
//   - 계정 메타데이터: users.getUser(userId).publicMetadata / users.updateUserMetadata(userId, {publicMetadata})
//   - 관리자 비번 초기화: users.updateUser(userId, {password, signOutOfOtherSessions})
//   - 정지(삭제 아님): users.lock(userId)

import type { IncomingMessage } from 'http';
import type { Account, AccountRole, AccountStatus, AccountTeam, AccountHistoryEntry } from './accountContract.js';
import type { AuthDeps, AuthSessionPort, VerifiedSession } from './authActor.js';
import type { ApprovalDirectoryPort } from './accountDirectory.js';

// 동적 import 전용 지정자(리터럴이 아니어야 tsc 가 정적 모듈 해석을 하지 않는다).
const CLERK_BACKEND = ['@clerk', 'backend'].join('/');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clerk(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import(CLERK_BACKEND);
  return mod.createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY
  });
}

const authorizedParties = (): string[] | undefined => {
  const raw = process.env.AUTH_AUTHORIZED_PARTIES;
  if (!raw) return undefined;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
};

// ── 세션 검증 ─────────────────────────────────────────────────────────────────
const clerkSession: AuthSessionPort = {
  async verify(req: IncomingMessage): Promise<VerifiedSession | null> {
    const client = await clerk();
    const host = (req.headers.host as string) || 'localhost';
    const url = `https://${host}${req.url || '/'}`;
    // Node IncomingMessage 헤더 → 평문 객체(쿠키/Authorization 포함). Clerk 이 __session 쿠키를 읽는다.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(', ');
    }
    // web Request 로 감싸 authenticateRequest 에 전달(헤더/쿠키만 필요).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = new (globalThis as any).Request(url, { method: req.method || 'GET', headers });
    const state = await client.authenticateRequest(request, {
      authorizedParties: authorizedParties(),
      jwtKey: process.env.CLERK_JWT_KEY
    });
    if (!state.isAuthenticated) return null;
    const auth = state.toAuth();
    return auth && auth.userId ? { userId: auth.userId } : null;
  }
};

// ── publicMetadata ↔ Account 매핑 ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metaToAccount(userId: string, user: any): Account | null {
  const m = (user && user.publicMetadata) || {};
  const acct = m.account as Partial<Account> | undefined;
  if (!acct || !acct.role || !acct.status) return null; // 승인 절차를 거치지 않은 세션 → 계정 없음
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

// ── 디렉터리(계정 조회·저장·목록) ─────────────────────────────────────────────
const clerkDirectory: ApprovalDirectoryPort = {
  async getAccount(userId: string): Promise<Account | null> {
    const client = await clerk();
    const user = await client.users.getUser(userId);
    return metaToAccount(userId, user);
  },
  async saveAccount(account: Account): Promise<void> {
    const client = await clerk();
    // 비밀번호는 저장하지 않는다. account 스냅샷만 publicMetadata.account 에 병합.
    await client.users.updateUserMetadata(account.userId, {
      publicMetadata: { account }
    });
  },
  async listAccounts(): Promise<Account[]> {
    const client = await clerk();
    const res = await client.users.getUserList({ limit: 200 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    return list.map((u) => metaToAccount(u.id, u)).filter((a): a is Account => !!a);
  },
  async setPassword(userId: string, password: string): Promise<void> {
    const client = await clerk();
    // 임시 비번 발급: Clerk 이 저장한다. 값은 이 함수 밖으로 반환/로그하지 않는다.
    await client.users.updateUser(userId, { password, signOutOfOtherSessions: true });
  },
  async lockAccount(userId: string): Promise<void> {
    const client = await clerk();
    await client.users.lockUser(userId);
  }
};

export function createClerkAuthDeps(): AuthDeps {
  return { session: clerkSession, directory: clerkDirectory };
}
export function createClerkDirectory(): ApprovalDirectoryPort {
  return clerkDirectory;
}
