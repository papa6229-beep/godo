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
  taskId?: string;
  correlationId?: string;
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
    taskId: input.taskId,
    correlationId: input.correlationId,
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
  // 현재 상태 집계 — 같은 업무는 최신 이벤트 하나로 dedup(진행중→완료 이중집계 방지).
  // RC-2(G2): 추적 키는 **taskId 우선**, 없으면 구버전 호환으로 refId 로 후퇴한다.
  //   (과거에는 refId 가 없는 이벤트가 dedup 을 통째로 우회해 pending 이 누적됐다.)
  // 전달(message_sent)은 "행위" 카운트라 상태 집계에서 제외.
  const latest = new Map<string, ActivityEvent>();
  const noRef: ActivityEvent[] = [];
  for (const e of rows) {
    if (e.type === 'message_sent') continue;
    const key = e.taskId ?? e.refId;
    if (key) { const p = latest.get(key); if (!p || e.at > p.at) latest.set(key, e); }
    else noRef.push(e);
  }
  const items = [...latest.values(), ...noRef];
  return {
    teamId,
    total: rows.length,
    taskRunTotal: taskRuns.length,
    taskRunDone: taskRuns.filter((e) => e.status === 'done').length,
    messagesSent: rows.filter((e) => e.type === 'message_sent').length,
    approvals: rows.filter((e) => e.type === 'approval' && e.status === 'done').length,
    inProgress: items.filter((e) => e.status === 'in_progress').length,
    done: items.filter((e) => e.status === 'done').length,
    pending: items.filter((e) => e.status === 'pending').length,
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
