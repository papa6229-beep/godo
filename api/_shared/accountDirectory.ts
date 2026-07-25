// api/_shared/accountDirectory.ts
// R-AUTH-FOUNDATION-01 GREEN A — 계정 디렉터리 포트 + 승인/정지/초기화 서비스(서버측 규칙 집행).
//
// - 디렉터리 구현은 어댑터가 제공한다(운영=Clerk publicMetadata, 검사=in-memory).
// - 승인·정지·초기화 판정은 accountContract 규칙만 사용한다. 클라이언트가 보낸 역할/팀은 쓰지 않는다.
// - 비밀번호 값은 어디에도 저장/반환/로그하지 않는다(초기화 시 승인자가 입력→Clerk 에 전달만).

import type { Account, ApproveAsRole } from './accountContract.js';
import type { AccountDirectoryPort } from './authActor.js';
import {
  canApproveAs, canViewApplication, canSuspend, canResetPassword,
  applyApproval, applySuspension, recordPasswordReset
} from './accountContract.js';

// 승인 흐름이 필요로 하는 확장 포트(조회 + 저장 + 목록 + 비번설정 + 잠금).
export interface ApprovalDirectoryPort extends AccountDirectoryPort {
  saveAccount(account: Account): Promise<void>;
  listAccounts(): Promise<Account[]>;
  setPassword(userId: string, password: string): Promise<void>;
  lockAccount(userId: string): Promise<void>;
}

export type ServiceError = 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_PENDING' | 'INVALID_INPUT';
export interface ServiceResult { ok: boolean; errorCode?: ServiceError; account?: Account; }

// 승인자에게 보이는 pending 신청 목록(팀장=자기 팀만·HQ=전체 — canViewApplication 스코프).
export async function listApprovableFor(dir: ApprovalDirectoryPort, approver: Account): Promise<Account[]> {
  const all = await dir.listAccounts();
  return all.filter((a) => a.status === 'pending' && canViewApplication(approver, a));
}

// 승인자가 정지·임시비번 초기화를 수행할 수 있는 관리 대상 목록(pending 제외).
export async function listManagedFor(dir: ApprovalDirectoryPort, approver: Account): Promise<Account[]> {
  const all = await dir.listAccounts();
  return all.filter((a) => a.status !== 'pending' && (canSuspend(approver, a) || canResetPassword(approver, a)));
}

// 승인: 역할은 승인 시점에 결정(member|team_lead). team_lead 승인은 HQ 만(canApproveAs).
export async function approveApplication(
  dir: ApprovalDirectoryPort, approverUserId: string, targetUserId: string, at: string, asRole: ApproveAsRole = 'member'
): Promise<ServiceResult> {
  const approver = await dir.getAccount(approverUserId);
  const target = await dir.getAccount(targetUserId);
  if (!approver || !target) return { ok: false, errorCode: 'NOT_FOUND' };
  if (target.status !== 'pending') return { ok: false, errorCode: 'NOT_PENDING' };
  if (!canApproveAs(approver, target, asRole)) return { ok: false, errorCode: 'FORBIDDEN' };
  const next = applyApproval(target, approverUserId, at, asRole);
  await dir.saveAccount(next);
  return { ok: true, account: next };
}

export async function suspendAccount(
  dir: ApprovalDirectoryPort, actorUserId: string, targetUserId: string, at: string
): Promise<ServiceResult> {
  const actor = await dir.getAccount(actorUserId);
  const target = await dir.getAccount(targetUserId);
  if (!actor || !target) return { ok: false, errorCode: 'NOT_FOUND' };
  if (!canSuspend(actor, target)) return { ok: false, errorCode: 'FORBIDDEN' };
  const next = applySuspension(target, actorUserId, at); // 과거 기록 삭제 없음
  await dir.saveAccount(next);
  await dir.lockAccount(targetUserId);
  return { ok: true, account: next };
}

// 비밀번호 초기화: 승인자가 임시 비번을 입력→Clerk 에 설정. 값은 반환/로그하지 않는다.
export async function resetPassword(
  dir: ApprovalDirectoryPort, actorUserId: string, targetUserId: string, tempPassword: string, at: string
): Promise<ServiceResult> {
  if (!tempPassword || typeof tempPassword !== 'string') return { ok: false, errorCode: 'INVALID_INPUT' };
  const actor = await dir.getAccount(actorUserId);
  const target = await dir.getAccount(targetUserId);
  if (!actor || !target) return { ok: false, errorCode: 'NOT_FOUND' };
  if (!canResetPassword(actor, target)) return { ok: false, errorCode: 'FORBIDDEN' };
  await dir.setPassword(targetUserId, tempPassword);
  const next = recordPasswordReset(target, actorUserId, at); // 비번 값 아님, 이벤트 사실만
  await dir.saveAccount(next);
  return { ok: true, account: next }; // account 에도 비번 없음
}

// ── 검사·로컬용 in-memory 디렉터리 ────────────────────────────────────────────
// setPassword 포트 계약: "비번 교체 + 기존 세션 종료 + 다음 로그인 시 변경 강제"까지가 한 동작이다
// (Clerk 구현 = updateUser(signOutOfOtherSessions) + setPasswordCompromised(revokeAllSessions)).
// in-memory 는 그 계약을 _passwords/_forcedChange 로 관측 가능하게 흉내낸다.
export function createInMemoryDirectory(seed: Account[] = []): ApprovalDirectoryPort & {
  _passwords: Map<string, string>; _locked: Set<string>; _forcedChange: Set<string>;
} {
  const store = new Map<string, Account>(seed.map((a) => [a.userId, a]));
  const passwords = new Map<string, string>();
  const locked = new Set<string>();
  const forcedChange = new Set<string>();
  return {
    _passwords: passwords,
    _locked: locked,
    _forcedChange: forcedChange,
    async getAccount(userId) { return store.get(userId) ?? null; },
    async saveAccount(a) { store.set(a.userId, a); },
    async listAccounts() { return Array.from(store.values()); },
    async setPassword(userId, password) { passwords.set(userId, password); forcedChange.add(userId); },
    async lockAccount(userId) { locked.add(userId); }
  };
}
