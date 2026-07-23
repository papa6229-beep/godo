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
import { toCanonicalAgentId } from './agentIdRegistry';
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
  saveLifecycleTasks(toSave);

  return { ok: true, state: hydrateAppState(), ...(result.revisionTask ? { revisionTaskId: result.revisionTask.ref.taskId } : {}) };
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
  // 소속을 확인할 수 없는 AI 로는 팀을 정하지 않는다(추측 금지) → 지시자 팀에 남긴다.
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
  saveLifecycleTask(next);
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
  return assignExecutor(taskId, { kind: 'human', actor: input.actor, reason: input.reason ?? '팀장 직접 인수' }, ctx);
}

/** 수행자가 결과를 제출한다. **결과물 참조가 없으면 거부**한다. 이때부터 팀장 확인 대상이 된다. */
export function submitResult(
  taskId: string,
  input: { artifactRefs: string[]; actor: ActorRef; note?: string },
  ctx: { nowIso: string }
) {
  const all = loadLifecycleTasks();
  const task = findTask(all, taskId);
  if (!task) return failResult('업무를 찾을 수 없습니다.');
  if (task.executorKind === 'unassigned') return failResult('수행 방식이 정해지지 않았습니다.');
  const refs = (input.artifactRefs ?? []).filter((r) => typeof r === 'string' && r.trim().length > 0);
  if (refs.length === 0) return failResult('제출할 결과물이 없습니다.');

  const next: LifecycleTask = {
    ...task,
    status: 'awaiting_approval',
    submittedBy: input.actor,
    submittedAt: ctx.nowIso,
    artifactRefs: [...(task.artifactRefs ?? []), ...refs]
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

/** 협업 요청 — 요청팀 부모 + 수행팀 자식 2건으로 기록한다. */
export function createCollaborationRequest(
  input: { title: string; requestingTeamId: ActorRef['teamId']; targetTeamId: ActorRef['teamId']; instructedBy: ActorRef },
  ids: IdContext
): { parent: LifecycleTask; child: LifecycleTask } {
  const parent = createLifecycleTask({
    title: `${input.title} (협업 요청)`,
    ownerTeamId: input.requestingTeamId,
    ownerHumanId: `u-${input.requestingTeamId}`,
    assignedAgentId: '',
    executorKind: 'unassigned',
    status: 'open',
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
  proposedApprovalItems: { taskId: string; correlationId: string; title: string; agentId: string; artifact?: { id?: string } }[];
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

  const resultTaskIds = new Set(proposals.proposedApprovalItems.map((i) => i.taskId));

  for (const p of proposals.proposedTasks) {
    if (findTask(existing, p.id) || accepted.some((t) => t.ref.taskId === p.id)) continue; // 중복 수용 금지
    const canonical = toCanonicalAgentId(p.agentId);
    // RC-2 D-1.1/D-1.2: 담당 팀은 에이전트 소속에서 온다. 미상은 hq 로 올리지 않고 지시자 팀에 남긴다.
    const ownerTeamId = teamOfAgent(p.agentId) ?? opts.ownerTeamId ?? opts.createdBy.teamId;
    // 결과가 딸려 온 제안 = AI 가 이미 수행한 결과 → **담당 팀장 확인** 대상.
    // 결과가 없는 제안 = 아직 할 일 → 수행자 미정으로 팀장에게 도착(AI 확정 금지).
    const hasResult = resultTaskIds.has(p.id);
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
      dependencyMode: 'independent',
      approvalRoute: routeFor(opts.createdBy, ownerTeamId),
      createdBy: opts.createdBy,
      createdAt: opts.nowIso,
      decisions: []
    });
  }

  if (accepted.length > 0) saveLifecycleTasks(accepted);
  return accepted;
}

/** 결정 가능한 행동 목록(협업 업무에서만 '반송' 노출). */
export function availableDecisions(t: LifecycleTask): { kind: ApprovalDecisionKind; label: string }[] {
  const base: { kind: ApprovalDecisionKind; label: string }[] = [
    { kind: 'approve', label: '확인 완료' },
    { kind: 'request_revision', label: '수정 요청' },
    { kind: 'not_adopted', label: '이번 결과 사용 안 함' },
    { kind: 'stop', label: '작업 중단' }
  ];
  if (t.ref.parentTaskId) base.push({ kind: 'return', label: '협업 요청 반송' });
  return base;
}
