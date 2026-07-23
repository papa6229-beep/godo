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
  createLifecycleTask,
  decideApproval,
  isPendingForApproval,
  userStatusLabel,
  APPROVAL_ROUTES
} from './taskLifecycleContract';
import type {
  ActorRef, ApprovalDecisionKind, CreateTaskInput, IdContext,
  LifecycleTask, TaskLifecycleStatus
} from './taskLifecycleContract';
import { loadLifecycleTasks, saveLifecycleTask, saveLifecycleTasks, findTask } from './taskLifecycleStore';
import { toCanonicalAgentId } from './agentIdRegistry';
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
/** 수동 업무도 공통 생성기를 통과한다(임의 id 금지). 생성 즉시 저장한다. */
export function createManualTask(input: CreateTaskInput, ids: IdContext): LifecycleTask {
  const task = createLifecycleTask({ ...input, approvalRoute: input.approvalRoute ?? APPROVAL_ROUTES.team_internal }, ids);
  saveLifecycleTask(task);
  return task;
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
  const approvalTaskIds = new Set(proposals.proposedApprovalItems.map((i) => i.taskId));
  const accepted: LifecycleTask[] = [];

  for (const p of proposals.proposedTasks) {
    if (findTask(existing, p.id) || accepted.some((t) => t.ref.taskId === p.id)) continue; // 중복 수용 금지
    const needsApproval = approvalTaskIds.has(p.id);
    accepted.push({
      ref: { taskId: p.id, correlationId: p.correlationId, runId: undefined },
      title: p.title,
      ownerTeamId: opts.ownerTeamId ?? 'hq',
      ownerHumanId: opts.createdBy.userId ?? 'u-hq',
      assignedAgentId: toCanonicalAgentId(p.agentId),
      // 승인 필요 제안은 대기 상태로 둔다(완료로 고정 금지).
      status: needsApproval ? 'awaiting_approval' : 'in_progress',
      dependencyMode: 'independent',
      approvalRoute: APPROVAL_ROUTES.hq_directive,
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
