// ────────────────────────────────────────────────────────────────────────────
// RC-2 D-1 — App 전용 얇은 어댑터
//
// 배경: 생명주기 계약(taskLifecycleContract)과 저장 서비스(taskLifecycleStore)는 만들었는데
//   정작 App 이 그것을 쓰지 않았다(구 경로가 상태를 직접 바꾸고 승인 후 filter 로 삭제).
//
// 이 모듈은 새 구조를 크게 만들지 않는다. App 이 canonical 상태를 재구현하거나
// 임의 taskId 를 만들지 않도록 **변환 + 결정 적용 + 저장 upsert** 만 한 곳에 모은다.
//
//   저장된 LifecycleTask 가 정본이고, 화면용 OperationTask/ApprovalItem 은 거기서 파생한다.
//   승인·미채택·중단은 삭제가 아니라 상태 전이이며, pending 목록에서만 빠지고 이력에는 남는다.
// ────────────────────────────────────────────────────────────────────────────

import {
  canDecide,
  createChildTask,
  isTerminalStatus,
  createLifecycleTask,
  decideApproval,
  isPendingForApproval,
  userStatusLabel,
  APPROVAL_ROUTES
} from './taskLifecycleContract';
import type {
  ActorRef, ApprovalDecisionKind, CreateTaskInput, ExecutorKind, IdContext,
  LifecycleTask, TaskLifecycleStatus
} from './taskLifecycleContract';
import { loadLifecycleTasks, saveLifecycleTask, saveLifecycleTasks, findTask } from './taskLifecycleStore';
import { toCanonicalAgentId, isSameAgent } from './agentIdRegistry';
import { defaultNativeAgents } from '../data/defaultNativeAgentRuntime';
import { roleMeta } from './sessionRole';
import type { ViewerRole } from './sessionRole';
import type { OperationTask, TaskStatus } from '../types/task';
import type { ApprovalItem } from '../types/approval';

// ── 상태 변환 ────────────────────────────────────────────────────────────────
// 화면 타입(OperationTask/ApprovalItem)은 **표시 호환용**일 뿐 정본이 아니다.
const TASK_STATUS_MAP: Record<TaskLifecycleStatus, TaskStatus> = {
  open: 'pending',
  in_progress: 'running',
  awaiting_approval: 'needs_approval',
  completed: 'completed',
  partially_completed: 'partially_completed',
  not_selected: 'not_adopted',
  not_adopted: 'not_adopted',
  stopped: 'cancelled',
  returned: 'returned',
  superseded: 'not_adopted',
  failed: 'failed'
};

/** 현재 기다리는 확인 단계 라벨(여러 단계가 남았으면 완료로 표시하지 않는다). */
export const currentStageLabel = (t: LifecycleTask): string =>
  t.approvalRoute.stages[t.approvalRoute.currentStageIndex]?.label ?? '';

/** LifecycleTask → 화면용 OperationTask. */
export function toOperationTask(t: LifecycleTask): OperationTask {
  const pending = isPendingForApproval(t);
  const summaryParts = [
    userStatusLabel(t.status),
    pending && currentStageLabel(t) ? `다음: ${currentStageLabel(t)}` : '',
    t.decisions.length > 0 ? `결정 ${t.decisions.length}건` : ''
  ].filter(Boolean);
  return {
    id: t.ref.taskId,
    correlationId: t.ref.correlationId,
    ...(t.ref.parentTaskId ? { parentTaskId: t.ref.parentTaskId } : {}),
    ...(t.ref.revisionOfTaskId ? { revisionOfTaskId: t.ref.revisionOfTaskId } : {}),
    title: t.title,
    description: t.title,
    assignedAgentId: t.assignedAgentId,
    status: TASK_STATUS_MAP[t.status] ?? 'pending',
    riskLevel: 'medium',
    permission: 'approval_required',
    routeType: 'local',
    resultSummary: summaryParts.join(' · '),
    createdAt: t.createdAt,
    ...(t.status === 'completed' ? { completedAt: t.decisions[t.decisions.length - 1]?.at ?? t.createdAt } : {})
  };
}

/** LifecycleTask → 화면용 ApprovalItem. taskId 는 **업무 식별자를 그대로** 쓴다. */
export function toApprovalItem(t: LifecycleTask): ApprovalItem {
  const last = t.decisions[t.decisions.length - 1];
  const status: ApprovalItem['status'] =
    t.status === 'completed' ? 'approved'
      : t.status === 'not_adopted' || t.status === 'superseded' ? 'not_adopted'
        : t.status === 'stopped' ? 'cancelled'
          : t.status === 'returned' ? 'rejected'
            : 'waiting';
  return {
    id: `appr-${t.ref.taskId}`,
    taskId: t.ref.taskId,
    correlationId: t.ref.correlationId,
    title: t.title,
    requestedByAgentId: toCanonicalAgentId(t.assignedAgentId),
    riskLevel: 'medium',
    reason: `${userStatusLabel(t.status)}${currentStageLabel(t) ? ` · 다음 확인: ${currentStageLabel(t)}` : ''}`,
    proposedAction: t.title,
    status,
    ...(last?.reason ? { decisionReason: last.reason } : {}),
    metadata: { taskType: 'lifecycle', approvalRequired: true }
  };
}

/** App 세션 역할 → 계약 ActorRef. App 이 권한 규칙을 재구현하지 않게 한다. */
export function toActorRef(session: { role?: string; teamId?: string; label?: string; userId?: string }): ActorRef {
  const teamId = (session.teamId ?? 'hq') as ActorRef['teamId'];
  return { kind: 'human', teamId, label: session.label ?? '운영자', userId: session.userId ?? `u-${teamId}` };
}

/**
 * RC-2 D-1.1: 역할 전환기(sessionRole)의 ViewerRole → ActorRef.
 * 데모 역할 전환기가 **권한 실증의 정본**이다(실제 로그인·백엔드 권한은 범위 밖).
 */
export function actorForRole(role: ViewerRole): ActorRef {
  const meta = roleMeta(role);
  return { kind: 'human', teamId: role as ActorRef['teamId'], label: meta.label, userId: `u-${role}` };
}

// ── 에이전트 소속 팀(단일 근거) ──────────────────────────────────────────────
// RC-2 D-1.1: 제목·표시문구로 팀을 추측하거나 App 에 별칭표를 복붙하지 않는다.
//   런타임 정의(defaultNativeAgents.departmentId)를 유일한 근거로 쓴다.
const DEPARTMENT_TO_TEAM: Record<string, ActorRef['teamId']> = {
  manager: 'hq', product: 'product', cs: 'cs', marketing: 'marketing', design: 'design'
};

/** 소속을 확인할 수 없는 담당자에게 쓰는 화면 문구(내부 ID·'알 수 없음' 대체). */
export const UNKNOWN_AFFILIATION_LABEL = '소속 확인 필요';

/** 신규 입력에 미상 담당자가 들어왔을 때. 조용히 넘기지 않고 명시적으로 거부한다. */
export class UnknownAffiliationError extends Error {
  readonly agentId: string;
  constructor(agentId: string) {
    super('소속을 확인할 수 없는 담당자입니다. 업무를 만들 수 없습니다.');
    this.name = 'UnknownAffiliationError';
    this.agentId = agentId;
  }
}

/**
 * canonical agentId → 소속 팀.
 * RC-2 D-1.2: 소속을 확인할 수 없으면 **null**. hq(총괄)로 자동 승격하지 않는다.
 *   미상을 hq 로 두면 권한이 가장 높은 팀으로 올라가 버린다(반대 방향의 안전값).
 */
export function teamOfAgent(agentId: string): ActorRef['teamId'] | null {
  const canonical = toCanonicalAgentId(agentId);
  const def = defaultNativeAgents.find((a) => a.id === canonical);
  if (!def) return null;
  return DEPARTMENT_TO_TEAM[def.departmentId] ?? null;
}

/**
 * 화면에 보일 수행자 이름. 내부 AI ID 를 그대로 노출하지 않는다.
 *   비어 있음 → 아직 팀장이 수행 방식을 고르지 않은 상태
 *   등록되지 않은 id → 소속 확인 필요(삭제하지 않고 격리 표시)
 */
export function executorDisplayName(executorId?: string): string {
  if (!executorId) return '수행자 미정';
  const def = defaultNativeAgents.find((a) => a.id === toCanonicalAgentId(executorId));
  return def ? def.name : UNKNOWN_AFFILIATION_LABEL;
}

/**
 * 승인 경로 선택 규칙(사장 확정 정책). 팀/직급을 화면에 하드코딩하지 않는다.
 *   HQ → 다른 팀 지시      : 담당 팀장 확인 → HQ 최종 확인
 *   팀장 → 자기 팀 업무     : 담당 팀장 확인으로 종료
 *   팀 → 다른 팀 협업 요청  : 수행 팀장 확인 → 요청 팀 확인
 *   팀 → HQ 제안           : HQ 확인
 */
export function routeFor(creator: ActorRef, ownerTeamId: ActorRef['teamId']) {
  if (ownerTeamId === 'hq') return APPROVAL_ROUTES.escalation;          // HQ 가 수행 주체
  if (creator.teamId === 'hq') return APPROVAL_ROUTES.hq_directive;      // HQ 지시
  if (creator.teamId === ownerTeamId) return APPROVAL_ROUTES.team_internal; // 팀 자체
  return APPROVAL_ROUTES.collaboration;                                  // 팀 간 협업 요청
}

/** 지금 이 사용자가 **결정할 수 있는** 대기 업무만. 다른 팀 업무는 나오지 않는다. */
export function pendingForActor(actor: ActorRef): OperationTask[] {
  return loadLifecycleTasks()
    .filter((t) => isPendingForApproval(t) && canDecide(t, actor).ok)
    .map(toOperationTask);
}

// ── App 상태 ─────────────────────────────────────────────────────────────────
export interface AppLifecycleState {
  /** 저장된 정본에서 파생한 화면용 업무 전체(이력 포함). */
  tasks: OperationTask[];
  /** 승인 대기(pending)만. 결정이 끝난 항목은 여기서 빠지고 history 에 남는다. */
  approvalQueue: ApprovalItem[];
  /** 전체 이력(완료·미채택·중단·반송·superseded 포함) — 조회는 계속 가능해야 한다. */
  history: ApprovalItem[];
  /** 정본 원본(디버그·역추적용). */
  source: LifecycleTask[];
}

/** 첫 hydration — 저장소에서 App 상태를 복원한다. 새로고침 보존의 단일 진입점. */
export function hydrateAppState(): AppLifecycleState {
  const source = loadLifecycleTasks();
  return {
    source,
    tasks: source.map(toOperationTask),
    approvalQueue: source.filter(isPendingForApproval).map(toApprovalItem),
    history: source.map(toApprovalItem)
  };
}

// ── 결정 적용 ────────────────────────────────────────────────────────────────
export interface ApplyDecisionResult {
  ok: boolean;
  reason?: string;
  state: AppLifecycleState;
  revisionTaskId?: string;
}

/**
 * App 의 결정 버튼 → 공통 decideApproval → 저장 upsert → 새 상태.
 * App 이 상태를 직접 바꾸지 않으며, 어떤 결정도 레코드를 삭제하지 않는다.
 */
export function applyDecision(
  taskId: string,
  input: { kind: ApprovalDecisionKind; actor: ActorRef; reason?: string },
  ctx: { nowIso: string; newId?: () => string }
): ApplyDecisionResult {
  const all = loadLifecycleTasks();
  const target = findTask(all, taskId);
  if (!target) return { ok: false, reason: '업무를 찾을 수 없습니다.', state: hydrateAppState() };

  const result = decideApproval(target, input, ctx);
  if (!result.ok) return { ok: false, reason: result.reason, state: hydrateAppState() };

  const toSave: LifecycleTask[] = [result.task];
  if (result.revisionTask) toSave.push(result.revisionTask);
  // 협업 자식의 결말은 요청팀 부모 카드에도 그대로 보여야 한다(부모가 영원히 대기하지 않게).
  const parent = syncParentFromChild(result.task, all);
  if (parent) toSave.push(parent);
  saveLifecycleTasks(toSave);

  return { ok: true, state: hydrateAppState(), ...(result.revisionTask ? { revisionTaskId: result.revisionTask.ref.taskId } : {}) };
}

/**
 * 협업 자식 → 요청팀 부모 상태 반영.
 *   자식이 진행되면 부모도 진행 중, 자식이 반송·중단되면 부모도 같은 결말과 사유를 보여 준다.
 *   기록은 어느 쪽도 지우지 않는다.
 */
function syncParentFromChild(child: LifecycleTask, all: LifecycleTask[]): LifecycleTask | null {
  const parentId = child.ref.parentTaskId;
  if (!parentId) return null;
  const parent = findTask(all, parentId);
  if (!parent || isTerminalStatus(parent.status)) return null;

  const mirrored: TaskLifecycleStatus | null =
    child.status === 'returned' ? 'returned'
      : child.status === 'stopped' ? 'stopped'
        : child.status === 'not_adopted' ? 'not_adopted'
          // 정상 완료도 반드시 반영한다 — 반영하지 않으면 요청팀 카드가 영원히 진행 중으로 남는다.
          : child.status === 'completed' ? 'completed'
            : child.status === 'in_progress' || child.status === 'awaiting_approval' ? 'in_progress'
              : null;
  if (!mirrored || mirrored === parent.status) return null;

  const last = child.decisions[child.decisions.length - 1];
  return {
    ...parent,
    status: mirrored,
    decisions: [...parent.decisions, {
      kind: last?.kind ?? 'approve',
      actorLabel: last?.actorLabel ?? '수행팀',
      actorTeamId: child.ownerTeamId,
      reason: last?.reason ? `수행팀 회신: ${last.reason}` : `수행팀 진행 상태: ${userStatusLabel(child.status)}`,
      at: last?.at ?? child.createdAt,
      stageLabel: '협업 회신'
    }]
  };
}

// ── 업무 수용/생성 ───────────────────────────────────────────────────────────
/**
 * 수동 업무도 공통 생성기를 통과한다(임의 id 금지). 생성 즉시 저장한다.
 * RC-2 D-1.1: 담당 팀은 **선택한 에이전트의 소속**, 승인 경로는 **생성자·수행팀 관계**로 정한다.
 *
 * RC-2 D-1.2 정정 — 화면에서 고른 AI 는 **추천 수행자**일 뿐이다.
 *   · 고른 사람이 그 팀의 팀장일 때만 수행자로 확정한다(자기 팀 AI 직접 지시).
 *   · HQ·다른 팀장이 골랐으면 수행자 미정으로 담당 팀장에게 도착한다.
 *   · 다른 팀에 넘기는 업무는 요청팀 부모 + 수행팀 자식 두 건으로 남긴다.
 */
export function createManualTask(
  input: Omit<CreateTaskInput, 'ownerTeamId' | 'ownerHumanId'> & { ownerTeamId?: ActorRef['teamId']; ownerHumanId?: string },
  ids: IdContext
): LifecycleTask {
  const suggested = toCanonicalAgentId(input.assignedAgentId ?? '');
  const agentTeam = teamOfAgent(input.assignedAgentId ?? '');
  // RC-2 D-1.3: 소속을 확인할 수 없는 담당자를 지정한 **신규** 업무는 만들지 않는다.
  //   조용히 지시자 팀으로 옮기면 잘못된 팀이 책임을 지게 된다(과거 저장자료는 별도 격리).
  if (suggested && !agentTeam) {
    throw new UnknownAffiliationError(suggested);
  }
  const ownerTeamId = input.ownerTeamId ?? agentTeam ?? input.createdBy.teamId;
  const route = input.approvalRoute ?? routeFor(input.createdBy, ownerTeamId);

  // 자기 팀 AI 를 그 팀 팀장이 직접 고른 경우에만 배정 확정.
  const isOwnTeamLead = input.createdBy.kind === 'human' && input.createdBy.teamId === ownerTeamId;
  const assignable = !!suggested && agentTeam === ownerTeamId && isOwnTeamLead;

  const common = {
    ...input,
    ownerHumanId: input.ownerHumanId ?? `u-${ownerTeamId}`,
    assignedAgentId: assignable ? suggested : '',
    executorKind: (assignable ? 'agent' : 'unassigned') as ExecutorKind,
    status: 'open' as const
  };

  // 팀 간 '협업'만 부모+자식 두 건이다. HQ 지시는 협업이 아니라 지시이므로 담당팀 카드 한 건.
  const crossTeam = input.createdBy.teamId !== ownerTeamId && input.createdBy.teamId !== 'hq';
  if (crossTeam) {
    // 요청팀 카드(부모) — 요청한 팀이 자기 화면에서 진행을 볼 자리.
    const parent = createLifecycleTask({
      ...common,
      title: `${input.title} (협업 요청)`,
      ownerTeamId: input.createdBy.teamId,
      ownerHumanId: `u-${input.createdBy.teamId}`,
      assignedAgentId: '',
      executorKind: 'unassigned',
      trackingOnly: true,          // 추적용 — 실행은 수행팀 자식 카드에서
      approvalRoute: APPROVAL_ROUTES.team_internal
    }, ids);
    const child = createChildTask(parent, {
      ...common,
      ownerTeamId,
      approvalRoute: route,
      requestingTeamId: input.requestingTeamId ?? input.createdBy.teamId
    }, ids);
    saveLifecycleTasks([parent, child]);
    return child; // 화면이 다루는 것은 수행팀 업무다.
  }

  const task = createLifecycleTask({ ...common, ownerTeamId, approvalRoute: route }, ids);
  saveLifecycleTask(task);
  return task;
}

// ── RC-2 D-1.2: 업무 수신 → 수행자 선택 → 결과 제출 (승인과 분리) ────────────

/** HQ(또는 팀장)가 **팀에게** 지시한다. 수행자는 미정으로 팀장에게 도착한다. */
export function createDirectiveTask(
  input: { title: string; targetTeamId: ActorRef['teamId']; instructedBy: ActorRef; dependencyMode?: 'independent' | 'all_required' | 'selection' },
  ids: IdContext
): LifecycleTask {
  const task = createLifecycleTask({
    title: input.title,
    ownerTeamId: input.targetTeamId,
    ownerHumanId: `u-${input.targetTeamId}`,
    assignedAgentId: '',
    executorKind: 'unassigned',
    status: 'open',
    createdBy: input.instructedBy,
    approvalRoute: routeFor(input.instructedBy, input.targetTeamId),
    dependencyMode: input.dependencyMode ?? 'independent',
    ...(input.instructedBy.teamId !== input.targetTeamId ? { requestingTeamId: input.instructedBy.teamId } : {})
  }, ids);
  saveLifecycleTask(task);
  return task;
}

const okResult = (task: LifecycleTask) => ({ ok: true as const, task, state: hydrateAppState() });
const failResult = (reason: string) => ({ ok: false as const, reason, state: hydrateAppState() });

/** 이 사람이 그 업무의 담당 팀장(또는 지정된 임시 책임자)인가. */
function isOwningLead(task: LifecycleTask, actor: ActorRef): boolean {
  if (actor.kind !== 'human') return false;
  if (task.actingLeadUserId && actor.userId === task.actingLeadUserId) return true;
  return actor.teamId === task.ownerTeamId;
}

/**
 * 팀장이 수행 방식을 고른다 — AI 배정 또는 직접 처리.
 *   담당 팀장만 가능(HQ·타 팀장 차단), 타 팀 AI·미상 AI 는 거부한다.
 *   기존 수행자 기록은 덮어쓰지 않고 executorHistory 에 append 한다.
 */
export function assignExecutor(
  taskId: string,
  input: { kind: 'agent' | 'human'; executorId?: string; actor: ActorRef; reason?: string },
  ctx: { nowIso: string }
) {
  const all = loadLifecycleTasks();
  const task = findTask(all, taskId);
  if (!task) return failResult('업무를 찾을 수 없습니다.');
  // 끝난 업무를 다시 진행 중으로 되살리지 않는다(수정 요청만 새 업무를 만든다).
  if (isTerminalStatus(task.status)) {
    return failResult(`이미 끝난 업무입니다(${userStatusLabel(task.status)}). 수행자를 다시 정할 수 없습니다.`);
  }
  if (task.trackingOnly) {
    return failResult('이 카드는 진행 상황을 보는 용도입니다. 실제 수행은 담당 팀에서 합니다.');
  }

  // 수행자를 정하는 것은 아직 아무도 손대지 않은 업무(수정본 포함)에서만.
  if (task.status !== 'open') {
    return failResult('이미 수행 중이거나 확인 대기 중인 업무입니다. 수행자를 다시 정하려면 인수하거나 수정 요청을 하세요.');
  }
  if (!isOwningLead(task, input.actor)) return failResult('담당 팀장만 수행 방식을 정할 수 있습니다.');

  let executorId: string | undefined;
  if (input.kind === 'agent') {
    const canonical = toCanonicalAgentId(input.executorId ?? '');
    if (!canonical || !defaultNativeAgents.some((a) => a.id === canonical)) {
      return failResult('소속을 확인할 수 없는 담당자입니다. 배정할 수 없습니다.');
    }
    if (teamOfAgent(canonical) !== task.ownerTeamId) return failResult('다른 팀 담당자에게는 배정할 수 없습니다.');
    executorId = canonical;
  } else {
    executorId = input.actor.userId;
  }

  const next: LifecycleTask = {
    ...task,
    executorKind: input.kind,
    executorId,
    assignedAgentId: input.kind === 'agent' ? (executorId ?? '') : '',
    status: 'in_progress',
    executorHistory: [...task.executorHistory, {
      kind: input.kind, id: executorId, at: ctx.nowIso, byLabel: input.actor.label, reason: input.reason
    }]
  };
  const parent = syncParentFromChild(next, all);
  saveLifecycleTasks(parent ? [next, parent] : [next]);
  return okResult(next);
}

/**
 * 팀장이 AI 작업을 **직접 인수**한다. 기존 AI 시도·결과는 지우지 않고 이력에 쌓인다.
 * (assignExecutor 의 '직접 처리' 경로와 같은 함수 — 화면 문구용 이름)
 */
export function takeOverByLead(
  taskId: string,
  input: { actor: ActorRef; reason?: string },
  ctx: { nowIso: string }
) {
  const all = loadLifecycleTasks();
  const task = findTask(all, taskId);
  if (!task) return failResult('업무를 찾을 수 없습니다.');
  if (isTerminalStatus(task.status)) {
    return failResult(`이미 끝난 업무입니다(${userStatusLabel(task.status)}). 인수할 수 없습니다.`);
  }
  if (task.status === 'awaiting_approval') {
    return failResult('이미 결과가 제출된 업무입니다. 확인하거나 수정 요청을 하세요.');
  }
  if (task.trackingOnly) {
    return failResult('이 카드는 진행 상황을 보는 용도입니다. 실제 수행은 담당 팀에서 합니다.');
  }
  if (!isOwningLead(task, input.actor)) return failResult('담당 팀장만 인수할 수 있습니다.');
  if (task.status === 'open') {
    return assignExecutor(taskId, { kind: 'human', actor: input.actor, reason: input.reason ?? '팀장 직접 인수' }, ctx);
  }
  // 진행 중인 AI 작업을 팀장이 가져온다. 기존 시도는 지우지 않고 이력에 남는다.
  const next: LifecycleTask = {
    ...task,
    executorKind: 'human',
    executorId: input.actor.userId,
    assignedAgentId: '',
    executorHistory: [...task.executorHistory, {
      kind: 'human', id: input.actor.userId, at: ctx.nowIso,
      byLabel: input.actor.label, reason: input.reason ?? '팀장 직접 인수'
    }]
  };
  saveLifecycleTask(next);
  return okResult(next);
}

/**
 * 중단 요청 — 총괄(또는 요청자)이 담당 팀장에게 "이 업무 그만두자" 고 전달한다.
 *
 * RC-2 D-1.3.1: **요청은 중단이 아니다.**
 *   상태·수행자·결과물·이력을 하나도 건드리지 않고 요청 기록만 쌓는다.
 *   실제 중단은 담당 팀장이 같은 카드에서 처리한다(새 결재함을 만들지 않는다).
 */
export function requestTaskStop(
  taskId: string,
  input: { reason: string; actor: ActorRef },
  ctx: { nowIso: string }
) {
  const all = loadLifecycleTasks();
  const found = findTask(all, taskId);
  if (!found) return failResult('업무를 찾을 수 없습니다.');
  // RC-2 D-1.3.2: 추적 카드로 요청이 들어오면 **실제 수행 업무**에 기록한다.
  //   부모에 조용히 쌓으면 수행팀 화면에는 영영 도착하지 않는다.
  //   수행 업무를 하나로 특정할 수 없으면(0건·2건 이상) 기록하지 않고 막는다(fail-closed).
  const task = found.trackingOnly ? resolveExecutionTask(all, found) : found;
  if (!task) {
    return failResult('중단을 요청할 수행 업무를 특정할 수 없습니다. 담당 팀에 직접 확인해 주세요.');
  }
  if (isTerminalStatus(task.status)) {
    return failResult(`이미 끝난 업무입니다(${userStatusLabel(task.status)}). 중단 요청을 보낼 수 없습니다.`);
  }
  const reason = (input.reason ?? '').trim();
  if (!reason) return failResult('중단 사유를 입력해 주세요. 담당 팀장이 판단할 근거가 됩니다.');

  // 이 업무를 시킨 쪽이거나 담당 팀 사람만 요청할 수 있다(남의 팀 일에 끼어들지 않는다).
  //   총괄은 전 팀 업무를 지시·중단 요청할 수 있다.
  const requesterTeam = task.requestingTeamId ?? (task.createdBy.teamId !== task.ownerTeamId ? task.createdBy.teamId : undefined);
  const allowed = input.actor.teamId === 'hq'
    || input.actor.teamId === task.ownerTeamId
    || (!!requesterTeam && input.actor.teamId === requesterTeam);
  if (!allowed) return failResult('이 업무를 요청한 쪽이나 담당 팀만 중단을 요청할 수 있습니다.');

  const next: LifecycleTask = {
    ...task,
    stopRequests: [...(task.stopRequests ?? []), { requestedBy: input.actor, reason, requestedAt: ctx.nowIso }]
  };
  saveLifecycleTask(next);
  return okResult(next);
}

/**
 * 아직 담당 팀장이 처리하지 않은 중단 요청(화면 표시용).
 * RC-2 D-1.3.2: 어떤 이유로든 업무가 끝났으면 '대기' 표시를 끝낸다.
 *   기록(stopRequests) 자체는 지우지 않는다 — 왜 멈췄는지 계속 남는다.
 */
export const pendingStopRequest = (t: LifecycleTask) => {
  const reqs = t.stopRequests ?? [];
  if (reqs.length === 0) return null;
  if (isTerminalStatus(t.status)) return null;
  return reqs[reqs.length - 1];
};

/**
 * 추적 카드가 지켜보는 **실제 수행 업무**를 찾는다.
 * 정확히 하나일 때만 돌려주고, 없거나 여럿이면 null(fail-closed).
 */
function resolveExecutionTask(all: LifecycleTask[], parent: LifecycleTask): LifecycleTask | null {
  const children = all.filter((t) => t.ref.parentTaskId === parent.ref.taskId && !t.trackingOnly);
  return children.length === 1 ? children[0] : null;
}

/** 수행자가 결과를 제출한다. **결과물 참조가 없으면 거부**한다. 이때부터 팀장 확인 대상이 된다. */
export function submitResult(
  taskId: string,
  input: { artifactRefs?: string[]; resultSummary?: string; actor: ActorRef; note?: string },
  ctx: { nowIso: string }
) {
  const all = loadLifecycleTasks();
  const task = findTask(all, taskId);
  if (!task) return failResult('업무를 찾을 수 없습니다.');
  if (isTerminalStatus(task.status)) {
    return failResult(`이미 끝난 업무입니다(${userStatusLabel(task.status)}). 결과를 제출할 수 없습니다.`);
  }
  if (task.trackingOnly) {
    return failResult('이 카드는 진행 상황을 보는 용도입니다. 실제 수행은 담당 팀에서 합니다.');
  }
  // 수행 중인 업무만 결과를 낼 수 있다(배정 전 제출·중복 제출 금지).
  if (task.status !== 'in_progress') {
    return failResult(task.status === 'awaiting_approval'
      ? '이미 결과가 제출된 업무입니다.'
      : '아직 수행자가 정해지지 않은 업무입니다. 담당 팀장이 수행 방식을 먼저 정해야 합니다.');
  }
  // 제출자는 지금 그 일을 맡고 있는 본인이어야 한다.
  const submitterOk = task.executorKind === 'agent'
    ? (input.actor.kind === 'agent' && isSameAgent(input.actor.agentId, task.executorId))
    : (input.actor.kind === 'human' && !!task.executorId && input.actor.userId === task.executorId);
  if (!submitterOk) {
    return failResult(task.executorKind === 'agent'
      ? '이 업무를 맡은 담당자만 결과를 제출할 수 있습니다. 팀장이 직접 제출하려면 먼저 인수하세요.'
      : '이 업무를 맡은 사람만 결과를 제출할 수 있습니다.');
  }
  // 실제 내용이 있어야 결과다. 빈 배열·공백 문자열은 결과가 아니다.
  const refs = (input.artifactRefs ?? []).filter((r) => typeof r === 'string' && r.trim().length > 0);
  const summary = typeof input.resultSummary === 'string' ? input.resultSummary.trim() : '';
  if (refs.length === 0 && summary.length === 0) {
    return failResult('제출할 결과가 없습니다. 업무보고를 쓰거나 결과물을 첨부해 주세요.');
  }

  const next: LifecycleTask = {
    ...task,
    status: 'awaiting_approval',
    submittedBy: input.actor,
    submittedAt: ctx.nowIso,
    ...(summary ? { resultSummary: summary } : {}),
    ...(refs.length > 0 ? { artifactRefs: [...(task.artifactRefs ?? []), ...refs] } : {})
  };
  saveLifecycleTask(next);
  return okResult(next);
}

/** 팀장 부재 시 HQ 가 **명시적으로** 임시 책임자를 지정한다(자동 대행 아님). */
export function designateActingLead(
  taskId: string,
  input: { actingUserId: string; actor: ActorRef; reason?: string },
  ctx: { nowIso: string }
) {
  const all = loadLifecycleTasks();
  const task = findTask(all, taskId);
  if (!task) return failResult('업무를 찾을 수 없습니다.');
  if (input.actor.teamId !== 'hq') return failResult('임시 책임자 지정은 총괄만 할 수 있습니다.');
  const next: LifecycleTask = {
    ...task,
    actingLeadUserId: input.actingUserId,
    executorHistory: [...task.executorHistory, {
      kind: 'human', id: input.actingUserId, at: ctx.nowIso, byLabel: input.actor.label,
      reason: input.reason ?? '임시 책임자 지정'
    }]
  };
  saveLifecycleTask(next);
  return okResult(next);
}

/** HQ 는 전 팀 업무를 **열람**할 수 있다(결정 가능 여부와 별개). */
export function visibleTasksFor(actor: ActorRef): OperationTask[] {
  const all = loadLifecycleTasks();
  const rows = actor.teamId === 'hq'
    ? all
    : all.filter((t) => t.ownerTeamId === actor.teamId || t.requestingTeamId === actor.teamId);
  return rows.map(toOperationTask);
}

/**
 * 화면에 보여 줄 업무 흐름 한 장.
 *   협업이면 부모(추적)·자식(실행)을 한 흐름으로 묶어 **중복 카드를 만들지 않는다**.
 *   actionable=true 인 흐름에서만 수행자 선택·결과 제출을 할 수 있다.
 */
export interface TaskFlow {
  /** 이 사람이 실제로 다룰 카드(수행팀이면 자식, 요청팀·총괄이면 대표 카드). */
  task: LifecycleTask;
  /** 이 흐름에서 실행 행동(배정·인수·제출)을 할 수 있는가. */
  actionable: boolean;
  /** 추적 전용으로 볼 때의 상대 카드(요청팀이 보는 수행팀 진행 상황). */
  tracking?: LifecycleTask;
}

/**
 * 역할별 업무 흐름 목록 — 같은 협업이 두 장으로 보이지 않게 묶는다.
 *   수행팀 : 자식 1장(실행 가능)
 *   요청팀 : 자식 진행 상황을 얹은 추적 1장(실행 불가)
 *   총괄   : 협업 1건 = 1흐름
 */
export function taskFlowsFor(actor: ActorRef): TaskFlow[] {
  const all = loadLifecycleTasks();
  const isHq = actor.teamId === 'hq';
  const childOf = new Map<string, LifecycleTask>();
  for (const t of all) if (t.ref.parentTaskId) childOf.set(t.ref.parentTaskId, t);

  const flows: TaskFlow[] = [];
  for (const t of all) {
    // 자식은 그 자체로 흐름이 되지만, 요청팀·총괄에게는 부모 흐름 안에서 보이므로 건너뛴다.
    if (t.ref.parentTaskId) {
      const parent = findTask(all, t.ref.parentTaskId);
      const mineAsDoer = t.ownerTeamId === actor.teamId;
      if (mineAsDoer) flows.push({ task: t, actionable: !t.trackingOnly });
      else if (!parent) flows.push({ task: t, actionable: false });   // 부모가 없으면 단독 표시
      continue;
    }
    const child = childOf.get(t.ref.taskId);
    const mine = t.ownerTeamId === actor.teamId || t.requestingTeamId === actor.teamId;
    if (!isHq && !mine) continue;
    if (child) {
      // 협업 흐름 — 요청팀·총괄은 한 장으로 본다.
      if (!isHq && t.ownerTeamId !== actor.teamId) continue;   // 수행팀은 위에서 자식으로 이미 봤다
      flows.push({ task: t, actionable: false, tracking: child });
    } else {
      flows.push({ task: t, actionable: !t.trackingOnly });
    }
  }
  return flows;
}

/** 협업 요청 — 요청팀 부모 + 수행팀 자식 2건으로 기록한다. */
/** 협업 요청이 성립하지 않을 때. 조용히 만들지 않고 명시적으로 막는다. */
export class CollaborationRequestError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CollaborationRequestError';
  }
}

export function createCollaborationRequest(
  input: { title: string; requestingTeamId: ActorRef['teamId']; targetTeamId: ActorRef['teamId']; instructedBy: ActorRef },
  ids: IdContext
): { parent: LifecycleTask; child: LifecycleTask } {
  // RC-2 D-1.3.2: 협업은 **인간 팀장이 자기 팀 명의로 다른 팀에** 요청하는 것이다.
  //   총괄 지시는 협업이 아니라 지시이고(업무 탭의 팀 지시 경로), 자기 팀 일은 협업이 아니다.
  if (input.instructedBy.kind !== 'human') {
    throw new CollaborationRequestError('협업 요청은 사람만 보낼 수 있습니다.');
  }
  if (input.instructedBy.teamId === 'hq' || input.requestingTeamId === 'hq') {
    throw new CollaborationRequestError('총괄은 협업 요청이 아니라 담당 팀에 업무를 지시합니다.');
  }
  if (input.instructedBy.teamId !== input.requestingTeamId) {
    throw new CollaborationRequestError('다른 팀 이름으로 협업을 요청할 수 없습니다.');
  }
  if (input.requestingTeamId === input.targetTeamId) {
    throw new CollaborationRequestError('같은 팀에는 협업을 요청하지 않습니다. 팀 안에서 업무로 처리해 주세요.');
  }
  // RC-2 D-1.3.1: 요청팀 카드는 **추적용**이다. 실제 수행은 수행팀 자식 카드에서 한다.
  //   (같은 일이 두 팀에서 두 번 실행되지 않게 한다.)
  const parent = createLifecycleTask({
    title: `${input.title} (협업 요청)`,
    ownerTeamId: input.requestingTeamId,
    ownerHumanId: `u-${input.requestingTeamId}`,
    assignedAgentId: '',
    executorKind: 'unassigned',
    status: 'open',
    trackingOnly: true,
    createdBy: input.instructedBy,
    approvalRoute: APPROVAL_ROUTES.team_internal
  }, ids);
  const child = createChildTask(parent, {
    title: input.title,
    ownerTeamId: input.targetTeamId,
    ownerHumanId: `u-${input.targetTeamId}`,
    assignedAgentId: '',
    executorKind: 'unassigned',
    status: 'open',
    createdBy: input.instructedBy,
    requestingTeamId: input.requestingTeamId
  }, ids);
  saveLifecycleTasks([parent, child]);
  return { parent, child };
}

/** 상시 지시(자동 스케줄) 실행 가능 여부 — 팀장 사전 승인이 없으면 실행하지 않는다. */
export function canRunStandingDirective(d: {
  id: string; ownerTeamId: string; active: boolean; approvedByLeadAt?: string; mode?: 'real' | 'simulation';
}): { allowed: boolean; reason?: string; dataKind?: 'real' | 'fixture' } {
  if (d.mode === 'simulation') return { allowed: true, dataKind: 'fixture' };
  if (!d.active) return { allowed: false, reason: '중지된 상시 업무입니다.' };
  if (!d.approvedByLeadAt) return { allowed: false, reason: '담당 팀장 확인이 필요합니다.' };
  return { allowed: true, dataKind: 'real' };
}

export interface RuntimeProposalInput {
  proposedTasks: { id: string; correlationId: string; title: string; agentId: string; description: string }[];
  proposedApprovalItems: {
    taskId: string; correlationId: string; title: string; agentId: string;
    artifact?: { id?: string };
    /** 결과물 참조. 이것이나 resultSummary 가 있어야 '결과가 나왔다'고 본다. */
    artifactRefs?: string[];
    /** 텍스트 업무보고. */
    resultSummary?: string;
  }[];
}

/**
 * runtime 제안 → lifecycle task 로 수용.
 *   - 제안 단계에서 확정된 taskId/correlationId 를 **그대로** 쓴다(새로 만들지 않는다).
 *   - 승인이 필요한 제안을 처음부터 completed 로 만들지 않는다.
 *   - 같은 taskId 를 다시 수용해도 중복 생성하지 않는다.
 */
export function acceptRuntimeProposals(
  proposals: RuntimeProposalInput,
  opts: { createdBy: ActorRef; nowIso: string; ownerTeamId?: ActorRef['teamId'] }
): LifecycleTask[] {
  const existing = loadLifecycleTasks();
  const accepted: LifecycleTask[] = [];
  /** 소속 미확인으로 받지 않은 제안(조용히 삼키지 않고 호출자에게 알린다). */
  const rejected: { id: string; agentId: string }[] = [];

  // RC-2 D-1.3: taskId 가 승인목록에 있다는 것만으로 '결과가 나왔다'고 보지 않는다.
  //   실제 근거(결과물 참조 또는 텍스트 보고)가 있고, 수행자 소속이 확인돼야 결과로 인정한다.
  const resultEvidence = new Map<string, { refs: string[]; summary: string }>();
  for (const item of proposals.proposedApprovalItems) {
    const refs = [item.artifact?.id, ...(item.artifactRefs ?? [])]
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0);
    const summary = typeof item.resultSummary === 'string' ? item.resultSummary.trim() : '';
    if (refs.length > 0 || summary.length > 0) resultEvidence.set(item.taskId, { refs, summary });
  }

  for (const p of proposals.proposedTasks) {
    if (findTask(existing, p.id) || accepted.some((t) => t.ref.taskId === p.id)) continue; // 중복 수용 금지
    const canonical = toCanonicalAgentId(p.agentId);
    const agentTeam = teamOfAgent(p.agentId);
    // RC-2 D-1.3: 소속을 확인할 수 없는 AI 의 **신규** 제안은 받지 않는다(옮기지도 않는다).
    if (canonical && !agentTeam) { rejected.push({ id: p.id, agentId: canonical }); continue; }
    const ownerTeamId = agentTeam ?? opts.ownerTeamId ?? opts.createdBy.teamId;
    // 결과가 딸려 온 제안 = AI 가 이미 수행한 결과 → **담당 팀장 확인** 대상.
    //   단, 근거(결과물·보고)와 확인된 소속과 제출자 기록이 모두 있어야 한다.
    const evidence = resultEvidence.get(p.id);
    const hasResult = !!evidence && !!agentTeam && !!canonical;
    accepted.push({
      ref: { taskId: p.id, correlationId: p.correlationId, runId: undefined },
      title: p.title,
      ownerTeamId,
      ownerHumanId: `u-${ownerTeamId}`,
      assignedAgentId: hasResult ? canonical : '',
      requestingTeamId: opts.createdBy.teamId,
      executorKind: hasResult ? 'agent' : 'unassigned',
      executorId: hasResult ? canonical : undefined,
      suggestedExecutorId: canonical,
      executorHistory: [],
      status: hasResult ? 'awaiting_approval' : 'open',
      ...(hasResult && evidence
        ? {
            ...(evidence.refs.length > 0 ? { artifactRefs: evidence.refs } : {}),
            ...(evidence.summary ? { resultSummary: evidence.summary } : {}),
            submittedBy: { kind: 'agent' as const, teamId: ownerTeamId, label: canonical, agentId: canonical },
            submittedAt: opts.nowIso
          }
        : {}),
      dependencyMode: 'independent',
      approvalRoute: routeFor(opts.createdBy, ownerTeamId),
      createdBy: opts.createdBy,
      createdAt: opts.nowIso,
      decisions: []
    });
  }

  if (accepted.length > 0) saveLifecycleTasks(accepted);
  if (rejected.length > 0) {
    console.warn('[lifecycle] 소속을 확인할 수 없는 담당자의 제안을 받지 않았습니다:', rejected);
  }
  return accepted;
}

/**
 * 과거 저장자료 격리 — **이미 저장된** 업무 중 소속을 확인할 수 없는 담당자를 표시만 한다.
 *   신규 입력은 거부(UnknownAffiliationError)이고, 이쪽은 지우지 않고 '소속 확인 필요'로 남긴다.
 *   idempotent.
 */
export function quarantineUnknownAffiliation(): { quarantined: number; taskIds: string[] } {
  const all = loadLifecycleTasks();
  const taskIds: string[] = [];
  const next = all.map((t) => {
    const id = t.executorId ?? t.assignedAgentId;
    const unknown = !!id && !teamOfAgent(id);
    if (!unknown) return t;
    taskIds.push(t.ref.taskId);
    return { ...t, needsAffiliationReview: true as const };
  });
  if (taskIds.length > 0) saveLifecycleTasks(next);
  return { quarantined: taskIds.length, taskIds };
}

/** 결정 가능한 행동 목록(협업 업무에서만 '반송' 노출). */
export function availableDecisions(
  t: LifecycleTask,
  actor?: ActorRef
): { kind: ApprovalDecisionKind; label: string }[] {
  const all: { kind: ApprovalDecisionKind; label: string }[] = [
    { kind: 'approve', label: '확인 완료' },
    { kind: 'request_revision', label: '수정 요청' },
    { kind: 'not_adopted', label: '이번 결과 사용 안 함' },
    { kind: 'stop', label: '작업 중단' },
    { kind: 'return', label: '수행 불가 반송' }
  ];
  // RC-2 D-1.3: 화면에 보이는 행동과 서비스가 허용하는 행동을 같은 판정으로 맞춘다.
  //   (눌러 본 뒤 오류로 막지 않는다 — 처음부터 안 보인다.)
  if (!actor) return all;
  return all.filter((d) => canDecide(t, actor, d.kind).ok);
}
