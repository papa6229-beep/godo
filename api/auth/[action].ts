// api/auth/[action].ts
// R-AUTH-FOUNDATION-01 GREEN A — 사내 계정 라이프사이클 API(가입 메타·승인·정지·비번초기화·me).
//
// 규칙:
//   - 행위자 userId 는 오직 검증된 세션에서만 온다(body 의 actorUserId 를 신뢰하지 않는다).
//   - 승인/정지/초기화 권한은 accountContract/accountDirectory 서버 규칙만으로 판정한다.
//   - 비밀번호는 저장/반환/로그하지 않는다(초기화는 승인자가 입력한 임시 비번을 Clerk 에 전달만).
//   - 인증 미구성(CLERK_SECRET_KEY 없음) 시 이 API 는 비활성(501) — 가짜 인증을 만들지 않는다.

import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import type { AuthSessionPort } from '../_shared/authActor.js';
import { isAuthConfigured } from '../_shared/authActor.js';
import type { ApprovalDirectoryPort } from '../_shared/accountDirectory.js';
import {
  approveApplication, suspendAccount, resetPassword, listApprovableFor
} from '../_shared/accountDirectory.js';
import {
  createSignupAccount, toPublicView, shouldBootstrapHq, bootstrapHqAccount
} from '../_shared/accountContract.js';
import type { ServiceError } from '../_shared/accountDirectory.js';

interface ExtendedRequest extends IncomingMessage { body?: Record<string, unknown>; }
export interface AuthActionDeps { session: AuthSessionPort; directory: ApprovalDirectoryPort; }

const actionOf = (req: IncomingMessage): string => {
  try { return new URL(req.url ?? '/', 'http://localhost').pathname.split('/').filter(Boolean).pop() ?? ''; }
  catch { return ''; }
};
const errStatus = (code: ServiceError): number =>
  code === 'NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'NOT_PENDING' ? 409 : 400;

// ── 테스트·런타임 공용 코어(deps 주입) ────────────────────────────────────────
export async function runAuthAction(req: ExtendedRequest, res: VercelResponse, deps: AuthActionDeps): Promise<void> {
  const action = actionOf(req);
  const now = new Date().toISOString();
  const body = (req.body || {}) as Record<string, unknown>;

  // 모든 액션은 검증된 세션을 요구한다(가입 메타 포함 — Clerk 가입 직후 인증 상태).
  const session = await deps.session.verify(req);
  if (!session || !session.userId) {
    return sendErrorResponse(res, 'AUTH_REQUIRED', '로그인이 필요합니다.', 401);
  }
  const actorUserId = session.userId; // ★ body 가 아니라 세션에서만 취득

  // GET /api/auth/me — 현재 계정 상태(공개 뷰). 비밀번호·민감정보 없음.
  if (action === 'me') {
    const account = await deps.directory.getAccount(actorUserId);
    return sendOkResponse(res, account ? { account: toPublicView(account) } : { account: null });
  }

  // POST /api/auth/signup-metadata — 가입 직후 pending 계정 메타 생성(또는 최초 HQ 부트스트랩).
  if (action === 'signup-metadata') {
    const existing = await deps.directory.getAccount(actorUserId);
    if (existing) return sendOkResponse(res, { account: toPublicView(existing), note: 'already-registered' });

    // 최초 HQ 부트스트랩: 하드코딩 아이디가 아니라 서버 env 의 검증된 사용자 ID 로 1회.
    const all = await deps.directory.listAccounts();
    const hqExists = all.some((a) => a.role === 'hq' && a.status === 'active');
    if (shouldBootstrapHq(actorUserId, { bootstrapUserId: process.env.AUTH_BOOTSTRAP_HQ_USER_ID, hqExists })) {
      const hq = bootstrapHqAccount(
        { userId: actorUserId, name: String(body.name ?? ''), position: String(body.position ?? '') }, now);
      await deps.directory.saveAccount(hq);
      return sendOkResponse(res, { account: toPublicView(hq), bootstrapped: true });
    }

    const result = createSignupAccount(
      { userId: actorUserId, name: String(body.name ?? ''), team: String(body.team ?? ''), position: String(body.position ?? ''), role: String(body.role ?? '') },
      now
    );
    if (!result.ok || !result.account) {
      const msg = result.errorCode === 'HQ_NOT_ALLOWED'
        ? '총괄 관리자 권한은 공개 가입으로 신청할 수 없습니다.'
        : '가입 정보가 올바르지 않습니다.';
      return sendErrorResponse(res, result.errorCode || 'INVALID_INPUT', msg, 400);
    }
    await deps.directory.saveAccount(result.account);
    return sendOkResponse(res, { account: toPublicView(result.account) });
  }

  // 이하 액션은 승인자 계정이 있어야 한다.
  const actor = await deps.directory.getAccount(actorUserId);

  // GET /api/auth/pending-approvals — 내가 승인할 수 있는 pending 신청 목록.
  if (action === 'pending-approvals') {
    if (!actor || actor.status !== 'active') return sendErrorResponse(res, 'FORBIDDEN', '권한이 없습니다.', 403);
    const list = await listApprovableFor(deps.directory, actor);
    return sendOkResponse(res, { pending: list.map(toPublicView) });
  }

  // POST /api/auth/approve — 신청 승인(같은 팀장/HQ 규칙은 서버가 판정).
  if (action === 'approve') {
    const targetUserId = String(body.targetUserId ?? '');
    if (!targetUserId) return sendErrorResponse(res, 'INVALID_INPUT', 'targetUserId 가 필요합니다.', 400);
    const r = await approveApplication(deps.directory, actorUserId, targetUserId, now);
    if (!r.ok) return sendErrorResponse(res, r.errorCode!, '승인할 수 없습니다.', errStatus(r.errorCode!));
    return sendOkResponse(res, { account: toPublicView(r.account!) });
  }

  // POST /api/auth/suspend — 계정 정지(삭제 아님, 과거 기록 보존).
  if (action === 'suspend') {
    const targetUserId = String(body.targetUserId ?? '');
    if (!targetUserId) return sendErrorResponse(res, 'INVALID_INPUT', 'targetUserId 가 필요합니다.', 400);
    const r = await suspendAccount(deps.directory, actorUserId, targetUserId, now);
    if (!r.ok) return sendErrorResponse(res, r.errorCode!, '정지할 수 없습니다.', errStatus(r.errorCode!));
    return sendOkResponse(res, { account: toPublicView(r.account!) });
  }

  // POST /api/auth/reset-password — 승인자가 입력한 임시 비번을 Clerk 에 설정. 값은 반환/로그하지 않는다.
  if (action === 'reset-password') {
    const targetUserId = String(body.targetUserId ?? '');
    const tempPassword = typeof body.tempPassword === 'string' ? body.tempPassword : '';
    if (!targetUserId) return sendErrorResponse(res, 'INVALID_INPUT', 'targetUserId 가 필요합니다.', 400);
    const r = await resetPassword(deps.directory, actorUserId, targetUserId, tempPassword, now);
    if (!r.ok) return sendErrorResponse(res, r.errorCode!, '비밀번호를 초기화할 수 없습니다.', errStatus(r.errorCode!));
    // 응답에 비밀번호를 포함하지 않는다(성공 사실만).
    return sendOkResponse(res, { ok: true, targetUserId });
  }

  return sendErrorResponse(res, 'UNKNOWN_ACTION', `Unknown auth action: ${action}`, 404);
}

// ── 런타임 default export(실 Clerk deps 배선) ────────────────────────────────
export default async function handler(req: ExtendedRequest, res: VercelResponse): Promise<void> {
  if (!isAuthConfigured()) {
    return sendErrorResponse(res, 'AUTH_NOT_CONFIGURED', '인증이 아직 설정되지 않았습니다.', 501);
  }
  const { createClerkAuthDeps } = await import('../_shared/clerkAuthAdapter.js');
  const base = createClerkAuthDeps();
  const { createClerkDirectory } = await import('../_shared/clerkAuthAdapter.js');
  await runAuthAction(req, res, { session: base.session, directory: createClerkDirectory() });
}
