// api/_shared/accountDirectory.ts
// R-AUTH-FOUNDATION-01 GREEN A — 계정 디렉터리 포트 + 승인/정지/초기화 서비스(서버측 규칙 집행).
//
// - 디렉터리 구현은 어댑터가 제공한다(운영=Clerk publicMetadata, 검사=in-memory).
// - 승인·정지·초기화 판정은 accountContract 규칙만 사용한다. 클라이언트가 보낸 역할/팀은 쓰지 않는다.
// - 비밀번호 값은 어디에도 저장/반환/로그하지 않는다(초기화 시 승인자가 입력→Clerk 에 전달만).

import type { Account } from './accountContract.js';
import type { AccountDirectoryPort } from './authActor.js';
import {
  canApproveApplication, canSuspend, canResetPassword,
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

// 승인자가 승인할 수 있는 pending 신청 목록.
export async function listApprovableFor(dir: ApprovalDirectoryPort, approver: Account): Promise<Account[]> {
  const all = await dir.listAccounts();
  return all.filter((a) => a.status === 'pending' && canApproveApplication(approver, a));
}

export async function approveApplication(
  dir: ApprovalDirectoryPort, approverUserId: string, targetUserId: string, at: string
): Promise<ServiceResult> {
  const approver = await dir.getAccount(approverUserId);
  const target = await dir.getAccount(targetUserId);
  if (!approver || !target) return { ok: false, errorCode: 'NOT_FOUND' };
  if (target.status !== 'pending') return { ok: false, errorCode: 'NOT_PENDING' };
  if (!canApproveApplication(approver, target)) return { ok: false, errorCode: 'FORBIDDEN' };
  const next = applyApproval(target, approverUserId, at);
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
export function createInMemoryDirectory(seed: Account[] = []): ApprovalDirectoryPort & {
  _passwords: Map<string, string>; _locked: Set<string>;
} {
  const store = new Map<string, Account>(seed.map((a) => [a.userId, a]));
  const passwords = new Map<string, string>();
  const locked = new Set<string>();
  return {
    _passwords: passwords,
    _locked: locked,
    async getAccount(userId) { return store.get(userId) ?? null; },
    async saveAccount(a) { store.set(a.userId, a); },
    async listAccounts() { return Array.from(store.values()); },
    async setPassword(userId, password) { passwords.set(userId, password); },
    async lockAccount(userId) { locked.add(userId); }
  };
}
