// api/auth/[action].ts
// R-AUTH-FOUNDATION-01 GREEN A.1 — 사내 계정 라이프사이클 API(메서드 계약·역할 미신뢰 가입).
//
// 메서드 계약(그 외 메서드는 상태 변경 없이 405):
//   GET  /api/auth/me                  현재 계정 상태(공개 뷰)
//   GET  /api/auth/pending-approvals   내가 승인할 수 있는 신청 + 관리 대상 목록
//   POST /api/auth/signup-metadata     가입 직후 이름·팀·직책 메타 생성(항상 member·pending)
//   POST /api/auth/approve             승인(역할은 승인 시점 결정: member|team_lead=HQ만)
//   POST /api/auth/suspend             ✖ 미채택 — 503(아래 DISABLED_ACTIONS)
//   POST /api/auth/reset-password      ✖ 미채택 — 503(아래 DISABLED_ACTIONS)
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
  approveApplication, listApprovableFor, listManagedFor
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

// 최종 채택 최소화(2026-07-27): 필수 4흐름(가입·member/pending 생성·승인·로그인 후 이용) 밖의 액션.
// 이 두 기능은 제품 안에 복구 경로가 없어 호출되면 사용자를 막다른 상태로 만든다:
//   - reset-password: Clerk 이 임시 비번 발급 후 '다음 로그인 시 변경'을 세션 태스크로 요구하는데
//     우리 앱에는 그 태스크를 처리할 화면이 없다 → 대상자가 다시 로그인할 수 없다.
//   - suspend      : 앱에 정지 해제(복구) 경로가 없다 → 되돌릴 수 없다.
// 따라서 앱 경로에서 fail-closed 로 닫는다. 비밀번호 문제와 계정 중지는 당분간
// Clerk 관리자 대시보드에서만 처리한다. 계정 계약·과거 이력·서비스 함수는 삭제하지 않는다
// (accountContract/accountDirectory 그대로 — 재개 시 이 표에서 빼면 된다).
export const DISABLED_ACTIONS: Record<string, string> = {
  'suspend': '계정 정지는 앱에서 제공하지 않습니다. 총괄 관리자가 Clerk 관리자 대시보드에서 처리합니다.',
  'reset-password': '임시 비밀번호 발급은 앱에서 제공하지 않습니다. 총괄 관리자가 Clerk 관리자 대시보드에서 처리합니다.'
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
  const disabled = DISABLED_ACTIONS[action];
  if (disabled) {
    // 미채택 기능: 세션 검증·디렉터리 조회 이전에 닫는다 → 어떤 계정도 읽거나 바꾸지 않는다.
    return sendErrorResponse(res, 'FEATURE_NOT_AVAILABLE', disabled, 503);
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

  // suspend·reset-password 는 위 DISABLED_ACTIONS 에서 이미 닫혔다(여기에 실행 경로가 없다).
  // 서비스 함수(suspendAccount/resetPassword)와 판정 규칙은 accountDirectory·accountContract 에 그대로 남아 있다.

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
