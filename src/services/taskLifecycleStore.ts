// ────────────────────────────────────────────────────────────────────────────
// RC-2 (G2) — 업무·승인·결정 이력 **단일 소유 저장 서비스**
//
// 원칙:
//  - App 여기저기에 localStorage 호출을 흩뿌리지 않는다. RC-2 상태는 이 모듈만 소유한다.
//  - schemaVersion 을 두고 구버전을 안전하게 후퇴 읽기 한다(전면 재작성·삭제 금지).
//  - **파일 바이너리(엑셀/이미지)는 저장하지 않는다.** 참조와 안전한 메타데이터만 보관한다.
//    실제 파일 저장·장기 검색은 RC-4 후속.
//  - 어떤 결정도 레코드를 삭제하지 않는다. 상태 전이로만 표현한다.
// ────────────────────────────────────────────────────────────────────────────

import type { LifecycleTask } from './taskLifecycleContract';

export const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'godo.rc2.taskLifecycle.v1';
const MAX_TASKS = 500;

interface StoredEnvelope {
  schemaVersion: number;
  tasks: LifecycleTask[];
}

// 바이너리 유입 차단 — 참조 문자열만 남긴다(data URL/base64 는 버린다).
const BINARY_HINT = /^data:|;base64,/i;
const sanitizeRefs = (refs: string[] | undefined): string[] | undefined =>
  refs ? refs.filter((r) => typeof r === 'string' && !BINARY_HINT.test(r)) : undefined;

const sanitizeTask = (t: LifecycleTask): LifecycleTask => ({
  ...t,
  ...(t.artifactRefs ? { artifactRefs: sanitizeRefs(t.artifactRefs) } : {}),
  ...(t.inputRefs ? { inputRefs: sanitizeRefs(t.inputRefs) } : {})
});

const readEnvelope = (): StoredEnvelope => {
  if (typeof window === 'undefined') return { schemaVersion: SCHEMA_VERSION, tasks: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { schemaVersion: SCHEMA_VERSION, tasks: [] };
    const parsed = JSON.parse(raw);
    // 구버전 후퇴: 배열만 저장돼 있던 형태도 그대로 읽는다(삭제하지 않는다).
    if (Array.isArray(parsed)) return { schemaVersion: 0, tasks: parsed as LifecycleTask[] };
    const tasks = Array.isArray(parsed?.tasks) ? (parsed.tasks as LifecycleTask[]) : [];
    return { schemaVersion: typeof parsed?.schemaVersion === 'number' ? parsed.schemaVersion : 0, tasks };
  } catch {
    return { schemaVersion: SCHEMA_VERSION, tasks: [] };
  }
};

const writeEnvelope = (tasks: LifecycleTask[]): void => {
  if (typeof window === 'undefined') return;
  try {
    const env: StoredEnvelope = { schemaVersion: SCHEMA_VERSION, tasks: tasks.slice(-MAX_TASKS).map(sanitizeTask) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    /* 용량 초과 등은 조용히 무시 — 앱을 죽이지 않는다 */
  }
};

/** 저장된 업무 전부(완료·미채택·중단 포함 — 이력은 계속 조회 가능해야 한다). */
export function loadLifecycleTasks(): LifecycleTask[] {
  return readEnvelope().tasks;
}

/** 업무 1건 저장/갱신(taskId 기준 upsert). 삭제 API 는 두지 않는다. */
export function saveLifecycleTask(task: LifecycleTask): LifecycleTask[] {
  const tasks = loadLifecycleTasks();
  const idx = tasks.findIndex((t) => t.ref.taskId === task.ref.taskId);
  const next = idx >= 0 ? tasks.map((t, i) => (i === idx ? sanitizeTask(task) : t)) : [...tasks, sanitizeTask(task)];
  writeEnvelope(next);
  return next;
}

/** 여러 건 한 번에 upsert. */
export function saveLifecycleTasks(list: LifecycleTask[]): LifecycleTask[] {
  let acc = loadLifecycleTasks();
  for (const t of list) {
    const idx = acc.findIndex((x) => x.ref.taskId === t.ref.taskId);
    acc = idx >= 0 ? acc.map((x, i) => (i === idx ? sanitizeTask(t) : x)) : [...acc, sanitizeTask(t)];
  }
  writeEnvelope(acc);
  return acc;
}

/** 한 흐름(correlationId) 전체 — 부모·자식·revision 을 역추적한다. */
export const tasksByCorrelation = (list: LifecycleTask[], correlationId: string): LifecycleTask[] =>
  list.filter((t) => t.ref.correlationId === correlationId);

/** 부모의 자식 업무들. */
export const childTasksOf = (list: LifecycleTask[], parentTaskId: string): LifecycleTask[] =>
  list.filter((t) => t.ref.parentTaskId === parentTaskId);

export const findTask = (list: LifecycleTask[], taskId: string): LifecycleTask | undefined =>
  list.find((t) => t.ref.taskId === taskId);
