// 팀 자동 업무 스펙 스토어 — Studio(AI 직원)에서 편집, 팀 보드/실행이 소비.
//  - 최초엔 DEFAULT_AGENT_TASKS로 시드. 이후 편집분은 localStorage.
//  - 순수 CRUD + persist. 백엔드 스왑 시 load/save만 교체.

import { DEFAULT_AGENT_TASKS } from '../data/defaultAgentTasks';
import type { AgentTaskSpec } from '../types/agentTask';

const STORAGE_KEY = 'godo_agent_tasks_v0';
/**
 * D-0 후속 교정: **기본 업무 보고 정책 1회 이관 marker**.
 *   D-010(HQ 자동 보고 경계)로 기본 스펙의 `reportTo`·`approvalMode` 를 바꿨지만,
 *   `loadAgentTasks` 는 저장값이 있으면 그것을 그대로 돌려주므로 **이미 앱을 쓴 브라우저에는
 *   옛 정책(`reportTo:'hq'` 등)이 그대로 남는다.** 그 저장자료만 한 번 교정한다.
 *   marker 가 찍힌 뒤에는 **사용자가 Studio 에서 바꾼 값을 다시 덮어쓰지 않는다.**
 */
const POLICY_MARKER_KEY = 'godo_agent_tasks_policy_v1';

/** 이관 대상 = **현재 기본 스펙에 있는 id**의 보고 정책. 별도 표를 손으로 복제하지 않는다. */
type TaskPolicy = Pick<AgentTaskSpec, 'reportTo' | 'approvalMode'>;
const DEFAULT_POLICY: ReadonlyMap<string, TaskPolicy> = new Map(
  DEFAULT_AGENT_TASKS.map((t) => [t.id, { reportTo: t.reportTo, approvalMode: t.approvalMode }])
);

let _seq = 0;
export function newTaskId(): string {
  _seq = (_seq + 1) % 100000;
  return `task_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

/**
 * 저장목록의 **기본 업무 id 에만** 현재 보고 정책을 적용한다.
 *   - id 가 같은 항목만 본다(팀 이름·제목으로 추측하지 않는다).
 *   - `reportTo`·`approvalMode` 외의 필드(제목·담당 AI·시간·focus…)는 건드리지 않는다.
 *   - 사용자가 추가한 업무는 그대로 통과시킨다.
 *   - 사용자가 지운 기본 업무는 **다시 만들지 않는다**(목록에 있는 것만 map 한다).
 */
const applyDefaultPolicy = (list: AgentTaskSpec[]): { next: AgentTaskSpec[]; changed: boolean } => {
  let changed = false;
  const next = list.map((t) => {
    const policy = DEFAULT_POLICY.get(t.id);
    if (!policy) return t;                                   // 사용자 추가 업무 — 손대지 않는다
    if (t.reportTo === policy.reportTo && t.approvalMode === policy.approvalMode) return t;
    changed = true;
    return { ...t, reportTo: policy.reportTo, approvalMode: policy.approvalMode };
  });
  return { next, changed };
};

const hasPolicyMarker = (): boolean => {
  try { return window.localStorage.getItem(POLICY_MARKER_KEY) !== null; } catch { return false; }
};
const setPolicyMarker = (): void => {
  try { window.localStorage.setItem(POLICY_MARKER_KEY, 'done'); } catch { /* 실패해도 목록은 이미 옳다 */ }
};

// 저장된 게 있으면 그것, 없으면 기본 스펙(시드).
//   저장값이 있고 marker 가 없을 때만 **한 번** 보고 정책을 이관한다.
export function loadAgentTasks(): AgentTaskSpec[] {
  if (typeof window === 'undefined') return [...DEFAULT_AGENT_TASKS];
  let parsed: unknown;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_AGENT_TASKS];               // 저장자료 없음 — 현재 기본값 그대로
    parsed = JSON.parse(raw);
  } catch {
    return [...DEFAULT_AGENT_TASKS];                          // 손상된 저장값 — 기존 fail-safe 유지
  }
  if (!Array.isArray(parsed)) return [...DEFAULT_AGENT_TASKS];
  const stored = parsed as AgentTaskSpec[];
  if (hasPolicyMarker()) return stored;                       // 이관 끝 — 사용자 값을 강제 교정하지 않는다

  const { next, changed } = applyDefaultPolicy(stored);
  if (!changed) { setPolicyMarker(); return stored; }         // 고칠 것이 없으면 목록을 다시 쓰지 않는다
  // 목록 저장이 성공했을 때만 marker 를 남긴다 — 실패하면 다음 로드에서 다시 시도한다.
  if (saveAgentTasks(next)) setPolicyMarker();
  return next;
}

/** @returns 저장 성공 여부. 실패에 성공 통지를 보내지 않기 위해 boolean 을 돌려준다. */
export function saveAgentTasks(list: AgentTaskSpec[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    /* 저장 실패(용량 등)는 조용히 무시 — 성공으로 표시하지 않는다 */
    return false;
  }
}

export function subscribeAgentTasks(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

// ── 순수 CRUD ──
export function upsertTask(list: AgentTaskSpec[], spec: AgentTaskSpec): AgentTaskSpec[] {
  const i = list.findIndex((t) => t.id === spec.id);
  if (i < 0) return [...list, spec];
  const next = [...list];
  next[i] = spec;
  return next;
}
export const removeTask = (list: AgentTaskSpec[], id: string): AgentTaskSpec[] => list.filter((t) => t.id !== id);

// ── persist 래퍼 ──
export function saveUpsertTask(spec: AgentTaskSpec): AgentTaskSpec[] {
  const next = upsertTask(loadAgentTasks(), spec);
  saveAgentTasks(next);
  return next;
}
export function saveRemoveTask(id: string): AgentTaskSpec[] {
  const next = removeTask(loadAgentTasks(), id);
  saveAgentTasks(next);
  return next;
}
/** 현재 기본 스펙으로 복원. 복원값이 곧 현재 정책이므로 marker 도 일치시킨다. */
export function resetAgentTasks(): AgentTaskSpec[] {
  if (saveAgentTasks([...DEFAULT_AGENT_TASKS])) setPolicyMarker();
  return [...DEFAULT_AGENT_TASKS];
}
