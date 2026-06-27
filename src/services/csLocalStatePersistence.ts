// CS Local State Persistence v0 — CS 운영 상태를 브라우저 localStorage에 보존.
//
// 원칙:
//   - 실제 고도몰 WRITE/서버 저장 없음. 브라우저 localStorage만.
//   - 고객 기본 PII(전화/이메일/주소 등)는 굳이 복제 저장하지 않는다(운영자가 만든 상태/메모 중심).
//     (completed/approval item에 이미 들어있는 answerText/assignee 등 업무 산출물은 저장 허용.)
//   - SSR/build/node 환경에서 깨지지 않도록 window/localStorage 접근은 guard.
//   - schemaVersion으로 안전 로드(불일치/깨진 JSON → 무시).

import type { CsCompletedWorkItem } from './csWorkCompletionState';
import type { CsApprovalQueueItem } from './csApprovalQueueBridge';

export const CS_STATE_STORAGE_KEY = 'godo_ai_os.cs_state.v0';
export const CS_STATE_SCHEMA_VERSION = 0 as const;

export interface CsCustomerManagementPersist {
  memoByCustomerId: Record<string, string>;
  cautionByCustomerId: Record<string, boolean>;
  blacklistCandidateByCustomerId: Record<string, boolean>;
}

export interface CsPersistedStateV0 {
  schemaVersion: 0;
  savedAt: string;
  completedWorkItems: CsCompletedWorkItem[];
  approvalItems: CsApprovalQueueItem[];
  assigneeByItem: Record<string, string>;
  memoByItem: Record<string, string>;
  customerManagement: CsCustomerManagementPersist;
}

// localStorage 안전 접근(없으면 null)
const getLs = (): Storage | null => {
  try {
    const w = typeof window !== 'undefined' ? window : (globalThis as { window?: Window }).window;
    return w && w.localStorage ? w.localStorage : null;
  } catch {
    return null;
  }
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strRecord = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (isObj(v)) for (const [k, val] of Object.entries(v)) if (typeof val === 'string') out[k] = val;
  return out;
};
const boolRecord = (v: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (isObj(v)) for (const [k, val] of Object.entries(v)) if (typeof val === 'boolean') out[k] = val;
  return out;
};
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function createEmptyCsPersistedState(savedAt = ''): CsPersistedStateV0 {
  return {
    schemaVersion: CS_STATE_SCHEMA_VERSION,
    savedAt,
    completedWorkItems: [],
    approvalItems: [],
    assigneeByItem: {},
    memoByItem: {},
    customerManagement: { memoByCustomerId: {}, cautionByCustomerId: {}, blacklistCandidateByCustomerId: {} }
  };
}

// 임의 입력 → 안전한 CsPersistedStateV0. schemaVersion 불일치/형식 불량이면 null.
export function sanitizeCsPersistedState(input: unknown): CsPersistedStateV0 | null {
  if (!isObj(input)) return null;
  if (input.schemaVersion !== CS_STATE_SCHEMA_VERSION) return null;
  const cm = isObj(input.customerManagement) ? input.customerManagement : {};
  return {
    schemaVersion: CS_STATE_SCHEMA_VERSION,
    savedAt: typeof input.savedAt === 'string' ? input.savedAt : '',
    completedWorkItems: arr<CsCompletedWorkItem>(input.completedWorkItems),
    approvalItems: arr<CsApprovalQueueItem>(input.approvalItems),
    assigneeByItem: strRecord(input.assigneeByItem),
    memoByItem: strRecord(input.memoByItem),
    customerManagement: {
      memoByCustomerId: strRecord((cm as Record<string, unknown>).memoByCustomerId),
      cautionByCustomerId: boolRecord((cm as Record<string, unknown>).cautionByCustomerId),
      blacklistCandidateByCustomerId: boolRecord((cm as Record<string, unknown>).blacklistCandidateByCustomerId)
    }
  };
}

export function loadCsPersistedState(): CsPersistedStateV0 | null {
  const ls = getLs();
  if (!ls) return null;
  try {
    const raw = ls.getItem(CS_STATE_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeCsPersistedState(JSON.parse(raw));
  } catch {
    return null; // 깨진 JSON → 무시(앱 안 깨짐)
  }
}

export function saveCsPersistedState(state: Omit<CsPersistedStateV0, 'schemaVersion' | 'savedAt'> & Partial<Pick<CsPersistedStateV0, 'savedAt'>>): void {
  const ls = getLs();
  if (!ls) return;
  let savedAt = state.savedAt || '';
  if (!savedAt) { try { savedAt = new Date().toISOString(); } catch { savedAt = ''; } }
  const payload: CsPersistedStateV0 = {
    schemaVersion: CS_STATE_SCHEMA_VERSION,
    savedAt,
    completedWorkItems: state.completedWorkItems || [],
    approvalItems: state.approvalItems || [],
    assigneeByItem: state.assigneeByItem || {},
    memoByItem: state.memoByItem || {},
    customerManagement: state.customerManagement || { memoByCustomerId: {}, cautionByCustomerId: {}, blacklistCandidateByCustomerId: {} }
  };
  try { ls.setItem(CS_STATE_STORAGE_KEY, JSON.stringify(payload)); } catch { /* quota/직렬화 실패 무시 */ }
}

export function clearCsPersistedState(): void {
  const ls = getLs();
  if (!ls) return;
  try { ls.removeItem(CS_STATE_STORAGE_KEY); } catch { /* 무시 */ }
}
