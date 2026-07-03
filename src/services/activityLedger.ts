// 업무 활동 원장 — 스토어(localStorage) + 순수 함수 + persist API + 집계 조회.
//
// 사람 UI와 (미래) AI 에이전트 런타임이 같은 logActivity를 호출해 기록한다.
// 오늘의 운영(관제)·HQ 채팅은 teamSummary/activityForTeam로 읽기만 한다.

import type { ActivityEvent, ActivityType, ActivityStatus, TeamActivitySummary } from '../types/activityLedger';
import type { DeptTeamId, TeamMessageActor } from '../types/teamMessage';

const STORAGE_KEY = 'godo_activity_ledger_v0';
const MAX_EVENTS = 500;

let _seq = 0;
export function newActivityId(): string {
  _seq = (_seq + 1) % 100000;
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `act_${Date.now().toString(36)}_${_seq.toString(36)}_${rand}`;
}

const nowIsoDefault = (): string => new Date().toISOString();

// ── 스토어 ──
export function loadActivity(): ActivityEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ActivityEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveActivity(list: ActivityEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_EVENTS)));
  } catch {
    /* 저장 실패는 조용히 무시 */
  }
}

export function subscribeActivity(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

// ── 순수 함수 ──
export interface LogActivityInput {
  teamId: DeptTeamId;
  type: ActivityType;
  status: ActivityStatus;
  title: string;
  detail?: string;
  actor: TeamMessageActor;
  relatedTeam?: DeptTeamId;
  refId?: string;
}

export function createActivity(input: LogActivityInput, nowIso: string = nowIsoDefault()): ActivityEvent {
  return {
    id: newActivityId(),
    teamId: input.teamId,
    type: input.type,
    status: input.status,
    title: input.title,
    detail: input.detail,
    actor: input.actor,
    relatedTeam: input.relatedTeam,
    refId: input.refId,
    at: nowIso
  };
}

// ── 조회(순수) ──
export const activitySince = (list: ActivityEvent[], sinceIso?: string): ActivityEvent[] =>
  (sinceIso ? list.filter((e) => e.at >= sinceIso) : list);

export const activityForTeam = (list: ActivityEvent[], teamId: DeptTeamId, sinceIso?: string): ActivityEvent[] =>
  activitySince(list, sinceIso).filter((e) => e.teamId === teamId).sort((a, b) => (a.at < b.at ? 1 : -1));

export function teamSummary(list: ActivityEvent[], teamId: DeptTeamId, sinceIso?: string): TeamActivitySummary {
  const rows = activityForTeam(list, teamId, sinceIso);
  const taskRuns = rows.filter((e) => e.type === 'task_run');
  return {
    teamId,
    total: rows.length,
    taskRunTotal: taskRuns.length,
    taskRunDone: taskRuns.filter((e) => e.status === 'done').length,
    messagesSent: rows.filter((e) => e.type === 'message_sent').length,
    approvals: rows.filter((e) => e.type === 'approval' && e.status === 'done').length,
    pending: rows.filter((e) => e.status === 'pending' || e.status === 'in_progress').length,
    lastAt: rows[0]?.at
  };
}

export function allTeamsSummary(list: ActivityEvent[], teams: DeptTeamId[], sinceIso?: string): Record<string, TeamActivitySummary> {
  const out: Record<string, TeamActivitySummary> = {};
  for (const t of teams) out[t] = teamSummary(list, t, sinceIso);
  return out;
}

// ── persist API(사람 UI·미래 에이전트 공용) ──
export function logActivity(input: LogActivityInput, nowIso: string = nowIsoDefault()): ActivityEvent {
  const list = loadActivity();
  const ev = createActivity(input, nowIso);
  saveActivity([...list, ev]);
  return ev;
}
