// api/auth/[action].ts
// R-AUTH-FOUNDATION-01 GREEN A.1 — 사내 계정 라이프사이클 API(메서드 계약·역할 미신뢰 가입).
//
// 메서드 계약(그 외 메서드는 상태 변경 없이 405):
//   GET  /api/auth/me                  현재 계정 상태(공개 뷰)
//   GET  /api/auth/pending-approvals   내가 승인할 수 있는 신청 + 관리 대상 목록
//   POST /api/auth/signup-metadata     가입 직후 이름·팀·직책 메타 생성(항상 member·pending)
//   POST /api/auth/approve             승인(역할은 승인 시점 결정: member|team_lead=HQ만)
//   POST /api/auth/suspend             정지(삭제 아님·이력 보존)
//   POST /api/auth/reset-password      임시 비번 발급(같은 팀장/HQ만; 세션종료+다음 로그인 변경 강제)
//
// 규칙:
//   - 행위자 userId 는 검증된 세션에서만(body 의 actor/role/team 불신).
//   - 공개 가입 body 의 role 은 읽지 않는다(항상 member·pending). HQ 는 공개 가입 불가.
//   - 비밀번호는 저장/반환/로그 0. 인증 미완전 설정 시 이 API 는 503(가짜 인증 없음).

import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import type { AuthSessionPort } from '../_shared/authActor.js';
import { resolveServerAuthConfig } from '../_shared/authActor.js';
import type { ApprovalDirectoryPort } from '../_shared/accountDirectory.js';
import {
  approveApplication, suspendAccount, resetPassword, listApprovableFor, listManagedFor
} from '../_shared/accountDirectory.js';
import {
  createSignupAccount, toPublicView, shouldBootstrapHq, bootstrapHqAccount, isApproveAsRole
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

// 액션별 허용 메서드(단일 계약) — 여기 없는 액션/메서드는 코어 로직에 진입하지 못한다.
const ACTION_METHODS: Record<string, 'GET' | 'POST'> = {
  'me': 'GET',
  'pending-approvals': 'GET',
  'signup-metadata': 'POST',
  'approve': 'POST',
  'suspend': 'POST',
  'reset-password': 'POST'
};

// ── 테스트·런타임 공용 코어(deps 주입) ────────────────────────────────────────
export async function runAuthAction(req: ExtendedRequest, res: VercelResponse, deps: AuthActionDeps): Promise<void> {
  const action = actionOf(req);
  const allowed = ACTION_METHODS[action];
  if (!allowed) return sendErrorResponse(res, 'UNKNOWN_ACTION', `Unknown auth action: ${action}`, 404);
  if ((req.method || '') !== allowed) {
    // 상태를 바꾸기 전에 차단한다(세션 검증조차 하지 않음 — 부작용 0).
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', `Only ${allowed} is accepted for ${action}.`, 405);
  }

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

  // POST /api/auth/signup-metadata — 가입 직후 계정 메타 생성(항상 member·pending).
  // body 의 role 은 읽지 않는다(역할 위조 불가). 최초 HQ 는 env 검증 사용자 1회 부트스트랩.
  if (action === 'signup-metadata') {
    const existing = await deps.directory.getAccount(actorUserId);
    if (existing) return sendOkResponse(res, { account: toPublicView(existing), note: 'already-registered' });

    const all = await deps.directory.listAccounts();
    const hqExists = all.some((a) => a.role === 'hq' && a.status === 'active');
    if (shouldBootstrapHq(actorUserId, { bootstrapUserId: process.env.AUTH_BOOTSTRAP_HQ_USER_ID, hqExists })) {
      const hq = bootstrapHqAccount(
        { userId: actorUserId, name: String(body.name ?? ''), position: String(body.position ?? '') }, now);
      await deps.directory.saveAccount(hq);
      return sendOkResponse(res, { account: toPublicView(hq), bootstrapped: true });
    }

    const result = createSignupAccount(
      { userId: actorUserId, name: String(body.name ?? ''), team: String(body.team ?? ''), position: String(body.position ?? '') },
      now
    );
    if (!result.ok || !result.account) {
      return sendErrorResponse(res, result.errorCode || 'INVALID_INPUT', '가입 정보가 올바르지 않습니다. 이름·팀·직책을 확인하세요.', 400);
    }
    await deps.directory.saveAccount(result.account);
    return sendOkResponse(res, { account: toPublicView(result.account) });
  }

  // 이하 액션은 승인자 계정이 있어야 한다.
  const actor = await deps.directory.getAccount(actorUserId);

  // GET /api/auth/pending-approvals — 내가 승인할 수 있는 pending + 내가 관리(정지·초기화)할 수 있는 계정.
  if (action === 'pending-approvals') {
    if (!actor || actor.status !== 'active') return sendErrorResponse(res, 'FORBIDDEN', '권한이 없습니다.', 403);
    const pending = await listApprovableFor(deps.directory, actor);
    const managed = await listManagedFor(deps.directory, actor);
    return sendOkResponse(res, { pending: pending.map(toPublicView), managed: managed.map(toPublicView) });
  }

  // POST /api/auth/approve — 승인. 역할은 승인 시점 결정(member 기본, team_lead 는 HQ만 — 서버 판정).
  if (action === 'approve') {
    const targetUserId = String(body.targetUserId ?? '');
    if (!targetUserId) return sendErrorResponse(res, 'INVALID_INPUT', 'targetUserId 가 필요합니다.', 400);
    const asRoleRaw = body.approveAsRole ?? 'member';
    if (!isApproveAsRole(asRoleRaw)) return sendErrorResponse(res, 'INVALID_INPUT', 'approveAsRole 은 member 또는 team_lead 만 가능합니다.', 400);
    const r = await approveApplication(deps.directory, actorUserId, targetUserId, now, asRoleRaw);
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

  // POST /api/auth/reset-password — 같은 팀장/HQ 가 임시 비번 발급(세션 전부 종료 + 다음 로그인 변경 강제).
  // 값은 Clerk 에 전달만 하고 응답/이력/로그에 포함하지 않는다.
  if (action === 'reset-password') {
    const targetUserId = String(body.targetUserId ?? '');
    const tempPassword = typeof body.tempPassword === 'string' ? body.tempPassword : '';
    if (!targetUserId) return sendErrorResponse(res, 'INVALID_INPUT', 'targetUserId 가 필요합니다.', 400);
    const r = await resetPassword(deps.directory, actorUserId, targetUserId, tempPassword, now);
    if (!r.ok) return sendErrorResponse(res, r.errorCode!, '비밀번호를 초기화할 수 없습니다.', errStatus(r.errorCode!));
    return sendOkResponse(res, { ok: true, targetUserId });
  }

  return sendErrorResponse(res, 'UNKNOWN_ACTION', `Unknown auth action: ${action}`, 404);
}

// ── 런타임 default export(실 Clerk deps 배선) ────────────────────────────────
export default async function handler(req: ExtendedRequest, res: VercelResponse): Promise<void> {
  if (resolveServerAuthConfig().state !== 'complete') {
    return sendErrorResponse(res, 'AUTH_NOT_CONFIGURED', '서버 인증 설정이 완료되지 않았습니다.', 503);
  }
  const { createClerkAuthDeps, createClerkDirectory } = await import('../_shared/clerkAuthAdapter.js');
  const base = createClerkAuthDeps();
  await runAuthAction(req, res, { session: base.session, directory: createClerkDirectory() });
}
