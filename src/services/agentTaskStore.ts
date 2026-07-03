// 팀 자동 업무 스펙 스토어 — Studio(AI 직원)에서 편집, 팀 보드/실행이 소비.
//  - 최초엔 DEFAULT_AGENT_TASKS로 시드. 이후 편집분은 localStorage.
//  - 순수 CRUD + persist. 백엔드 스왑 시 load/save만 교체.

import { DEFAULT_AGENT_TASKS } from '../data/defaultAgentTasks';
import type { AgentTaskSpec } from '../types/agentTask';

const STORAGE_KEY = 'godo_agent_tasks_v0';

let _seq = 0;
export function newTaskId(): string {
  _seq = (_seq + 1) % 100000;
  return `task_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

// 저장된 게 있으면 그것, 없으면 기본 스펙(시드).
export function loadAgentTasks(): AgentTaskSpec[] {
  if (typeof window === 'undefined') return [...DEFAULT_AGENT_TASKS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_AGENT_TASKS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentTaskSpec[]) : [...DEFAULT_AGENT_TASKS];
  } catch {
    return [...DEFAULT_AGENT_TASKS];
  }
}

export function saveAgentTasks(list: AgentTaskSpec[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* 저장 실패는 조용히 무시 */
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
export function resetAgentTasks(): AgentTaskSpec[] {
  saveAgentTasks([...DEFAULT_AGENT_TASKS]);
  return [...DEFAULT_AGENT_TASKS];
}
