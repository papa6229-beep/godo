// 팀 간 소통 센터 — 스토어(localStorage) + 순수 함수 + 프로그램적 API.
//
// 사람 UI와 (미래) AI 에이전트 스케줄 런타임이 "같은 함수"를 호출한다.
//  - 순수 함수(create/markRead/setStatus/…)는 nowIso를 주입받아 결정적(테스트 용이).
//  - persist 래퍼(postTeamMessage/resolveTeamMessage/…)는 load→mutate→save를 묶는다.
//  - 지금은 localStorage. 2단계(공용 DB+실시간)에서는 load/save만 교체하면 된다.

import type {
  TeamMessage, TeamMessageActor, TeamMessageAttachment, TeamMessageKind,
  TeamMessageStatus, DeptTeamId
} from '../types/teamMessage';

const STORAGE_KEY = 'godo_team_messages_v0';
const MAX_MESSAGES = 300;
// 첨부 base64 보관 상한(데모): 개별 1.5MB. 초과 시 메타만 보관(omitted).
const ATTACH_INLINE_LIMIT = 1_500_000;

// ── ID (앱 런타임: Date.now/random 사용 가능) ──
let _seq = 0;
export function newMessageId(): string {
  _seq = (_seq + 1) % 100000;
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `tmsg_${Date.now().toString(36)}_${_seq.toString(36)}_${rand}`;
}

const nowIsoDefault = (): string => new Date().toISOString();

// ── 스토어(localStorage) ──
export function loadTeamMessages(): TeamMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TeamMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveTeamMessages(list: TeamMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = list.slice(-MAX_MESSAGES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 저장 실패(용량 등)는 조용히 무시
  }
}

// 다른 탭/런타임의 쓰기를 UI가 반영하도록 구독(현재 STORAGE_KEY만).
export function subscribeTeamMessages(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

// ── 첨부 정규화(용량 상한 적용) ──
export function normalizeAttachment(a: TeamMessageAttachment): TeamMessageAttachment {
  if (a.dataUrl && a.size > ATTACH_INLINE_LIMIT) {
    return { name: a.name, size: a.size, mime: a.mime, omitted: true };
  }
  return a;
}

// ── 순수 함수(결정적) ──
export interface CreateTeamMessageInput {
  from: TeamMessageActor;
  toTeam: DeptTeamId;
  kind: TeamMessageKind;
  title: string;
  body: string;
  attachments?: TeamMessageAttachment[];
}

export function createTeamMessage(input: CreateTeamMessageInput, nowIso: string = nowIsoDefault()): TeamMessage {
  const attachments = (input.attachments || []).map(normalizeAttachment);
  return {
    id: newMessageId(),
    from: input.from,
    toTeam: input.toTeam,
    kind: input.kind,
    title: input.title.trim() || '(제목 없음)',
    body: input.body.trim(),
    attachments,
    status: 'open',
    createdAt: nowIso,
    updatedAt: nowIso,
    readByTo: false,
    events: [{ at: nowIso, by: input.from, type: 'created' }]
  };
}

export function markRead(msg: TeamMessage, by: TeamMessageActor, nowIso: string = nowIsoDefault()): TeamMessage {
  if (msg.readByTo) return msg;
  return { ...msg, readByTo: true, updatedAt: nowIso, events: [...msg.events, { at: nowIso, by, type: 'read' }] };
}

export function setStatus(msg: TeamMessage, status: TeamMessageStatus, by: TeamMessageActor, nowIso: string = nowIsoDefault()): TeamMessage {
  if (msg.status === status) return msg;
  return { ...msg, status, updatedAt: nowIso, events: [...msg.events, { at: nowIso, by, type: 'status', status }] };
}

// ── 조회(순수) ──
export const inboxFor = (list: TeamMessage[], teamId: DeptTeamId): TeamMessage[] =>
  list.filter((m) => m.toTeam === teamId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

export const outboxFor = (list: TeamMessage[], teamId: DeptTeamId): TeamMessage[] =>
  list.filter((m) => m.from.teamId === teamId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

// 안읽음 = 받은 요청 중 미열람. 팀 카드 배지용.
export const unreadCountFor = (list: TeamMessage[], teamId: DeptTeamId): number =>
  list.filter((m) => m.toTeam === teamId && !m.readByTo).length;

// 미완료(접수+진행) 받은 요청 수 — "해야 할 일" 지표.
export const openInboxCountFor = (list: TeamMessage[], teamId: DeptTeamId): number =>
  list.filter((m) => m.toTeam === teamId && m.status !== 'done').length;

// ── persist 래퍼(사람 UI · 미래 에이전트 공용 API) ──
// 메시지 발신(생성+저장). 반환값은 생성된 메시지.
export function postTeamMessage(input: CreateTeamMessageInput, nowIso: string = nowIsoDefault()): TeamMessage {
  const list = loadTeamMessages();
  const msg = createTeamMessage(input, nowIso);
  saveTeamMessages([...list, msg]);
  return msg;
}

// 상태 전이(진행/완료 등)를 저장. 에이전트 자동 완료도 이 함수를 호출.
export function resolveTeamMessage(id: string, status: TeamMessageStatus, by: TeamMessageActor, nowIso: string = nowIsoDefault()): TeamMessage[] {
  const list = loadTeamMessages();
  const next = list.map((m) => (m.id === id ? setStatus(m, status, by, nowIso) : m));
  saveTeamMessages(next);
  return next;
}

// 받은 요청 열람 처리 저장.
export function markInboxRead(id: string, by: TeamMessageActor, nowIso: string = nowIsoDefault()): TeamMessage[] {
  const list = loadTeamMessages();
  const next = list.map((m) => (m.id === id ? markRead(m, by, nowIso) : m));
  saveTeamMessages(next);
  return next;
}
