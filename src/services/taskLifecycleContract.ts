// ────────────────────────────────────────────────────────────────────────────
// RC-2 — 업무·실행·결과물·승인 생명주기 계약 (순수 함수 · 저장소 비의존)
//
// 배경: 업무가 생성된 뒤 실행·결과물·승인·기록까지 **같은 업무로 추적**되지 않았다.
//   제안과 소비자가 각각 id 를 만들고, 승인 대기 기록에 참조가 없어 누적되며,
//   부서의 첫 결과만 handoff 되고, 부분 실패를 표현할 상태값이 없었다(RC-2 RED).
//
// 이 모듈은 새 저장소·새 UI 를 만들지 않는다. 모든 생명주기 객체가 공유하는
// **얇은 외피(LifecycleRef)** 와 결정 규칙만 정의한다.
//
// 핵심 규칙
//   1) taskId 는 **제안 시점에 한 번만** 만든다. 소비자(App/runtime/approval)는 새로 만들지 않는다.
//   2) 어떤 결정도 기록을 삭제하지 않는다. 상태 전이 + 이벤트 추가로만 표현한다.
//   3) 승인자는 팀·직급으로 하드코딩하지 않고 업무마다 approvalRoute 로 고정한다.
//   4) AI 는 자신의 결과물을 최종 승인할 수 없다.
// ────────────────────────────────────────────────────────────────────────────

import type { DeptTeamId } from '../types/teamMessage';

// ── 식별자 외피 ──────────────────────────────────────────────────────────────
export interface LifecycleRef {
  /** 업무 단위. 제안 시점에 확정되고 끝까지 불변. */
  taskId: string;
  /** 한 업무 흐름 전체(부모·자식·revision 이 공유). */
  correlationId: string;
  /** 실행 단위(런타임 1회). */
  runId?: string;
  /** 실행 내 개별 작업. */
  jobId?: string;
  /** 협업 자식 업무가 가리키는 원래 요청 업무. */
  parentTaskId?: string;
  /** 이 업무가 어떤 업무의 수정본인가. */
  revisionOfTaskId?: string;
  /** 대체 대상(= revisionOfTaskId 와 같은 값을 쓰되 의미상 분리 보관). */
  replacesTaskId?: string;
}

// ── 상태 ─────────────────────────────────────────────────────────────────────
// 내부 canonical 상태. 사용자 문구는 userStatusLabel 로 분리한다.
export type TaskLifecycleStatus =
  | 'open'                 // 생성됨
  | 'in_progress'          // 수행 중
  | 'awaiting_approval'    // 승인 경로의 어느 단계를 기다림
  | 'completed'            // 최종 승인까지 끝남
  | 'partially_completed'  // all_required 에서 일부만 성공
  | 'not_selected'         // selection 에서 선택되지 않음(실패 아님)
  | 'not_adopted'          // 이번 결과 미채택
  | 'stopped'              // 작업 중단
  | 'returned'             // 수행 불가/반송
  | 'superseded'           // 새 revision 으로 대체됨
  | 'failed';              // 실행 실패

const USER_STATUS_LABEL: Record<TaskLifecycleStatus, string> = {
  open: '대기',
  in_progress: '진행 중',
  awaiting_approval: '확인 필요',
  completed: '완료',
  partially_completed: '일부 완료',
  not_selected: '이번에 선택 안 함',
  not_adopted: '이번 결과 사용 안 함',
  stopped: '작업 중단',
  returned: '협업 요청 반송',
  superseded: '수정본으로 대체됨',
  failed: '실패'
};

/** 내부 상태 → 사용자 문구. 기술 상태명을 화면에 그대로 노출하지 않는다. */
export const userStatusLabel = (s: TaskLifecycleStatus): string => USER_STATUS_LABEL[s] ?? '확인 필요';

// ── 승인 경로 ────────────────────────────────────────────────────────────────
// 팀/직급을 코드에 고정하지 않는다. 업무 생성 시 경로를 명시적으로 붙인다.
export type ApproverKind = 'owner_team_lead' | 'requesting_team' | 'hq';

export interface ApprovalStage {
  approverKind: ApproverKind;
  label: string;
}

export interface ApprovalRoute {
  stages: ApprovalStage[];
  currentStageIndex: number;
}

const route = (...stages: ApprovalStage[]): ApprovalRoute => ({ stages, currentStageIndex: 0 });

/** 기본 경로 프리셋. 팀별 기본값 지정은 후속 커스터마이징 단계에서 연결한다. */
export const APPROVAL_ROUTES: Record<string, ApprovalRoute> = {
  /** HQ 가 팀장에게 직접 지시: 담당팀 완료 보고 → HQ 최종 확인 */
  get hq_directive() { return route({ approverKind: 'owner_team_lead', label: '담당 팀장 확인' }, { approverKind: 'hq', label: '총괄 최종 확인' }); },
  /** 팀장이 자체 수행한 일반 업무: 팀장 선에서 종료 */
  get team_internal() { return route({ approverKind: 'owner_team_lead', label: '담당 팀장 확인' }); },
  /** 팀 간 협업: 수행팀 완료 → 요청팀 확인 */
  get collaboration() { return route({ approverKind: 'owner_team_lead', label: '수행 팀장 확인' }, { approverKind: 'requesting_team', label: '요청팀 확인' }); },
  /** HQ 상향 제안: HQ 결정 */
  get escalation() { return route({ approverKind: 'hq', label: '총괄 결정' }); }
};

/** 이 업무의 최종 승인 단계. */
export const finalApprover = (task: LifecycleTask): ApprovalStage =>
  task.approvalRoute.stages[task.approvalRoute.stages.length - 1];

// ── 행위자 ───────────────────────────────────────────────────────────────────
export interface ActorRef {
  kind: 'human' | 'agent';
  teamId: DeptTeamId;
  label: string;
  userId?: string;
  agentId?: string;
}

// ── 업무 ─────────────────────────────────────────────────────────────────────
export type DependencyMode = 'independent' | 'all_required' | 'selection';

export interface DecisionRecord {
  kind: ApprovalDecisionKind;
  actorLabel: string;
  actorTeamId: DeptTeamId;
  reason?: string;
  at: string;
  stageLabel?: string;
}

/**
 * RC-2 D-1.2: 수행자 유형. 업무는 **수행자 미정(unassigned)** 으로 팀장에게 도착하고,
 * 팀장이 AI 배정(agent) 또는 직접 처리(human)를 고른다.
 */
export type ExecutorKind = 'unassigned' | 'agent' | 'human';

export interface ExecutorHistoryEntry {
  kind: ExecutorKind;
  id?: string;
  at: string;
  byLabel: string;
  reason?: string;
}

export interface LifecycleTask {
  ref: LifecycleRef;
  title: string;
  /** 책임 팀. */
  ownerTeamId: DeptTeamId;
  /** 책임 인간 관리자. */
  ownerHumanId: string;
  /** 협업 자식이면 요청한 팀. */
  requestingTeamId?: DeptTeamId;
  /** RC-2 D-1.2: 수행자 정본. assignedAgentId 는 하위호환 파생 필드일 뿐이다. */
  executorKind: ExecutorKind;
  executorId?: string;
  /** 수행자 변경 이력(덮어쓰지 않고 append). */
  executorHistory: ExecutorHistoryEntry[];
  /** 팀장이 HQ 에 제출한 주체(결과 제출 기록). */
  submittedBy?: ActorRef;
  /** 결과를 제출한 시각(팀장 확인 대기 시작점). */
  submittedAt?: string;
  /** 화면 추천값 — 자동 재배정에 쓰지 않는다. */
  suggestedExecutorId?: string;
  /** 팀장 부재 시 HQ 가 명시 지정한 임시 책임자. */
  actingLeadUserId?: string;
  /** @deprecated 하위호환 표시용. 정본은 executorKind/executorId. */
  assignedAgentId: string;
  status: TaskLifecycleStatus;
  dependencyMode: DependencyMode;
  approvalRoute: ApprovalRoute;
  createdBy: ActorRef;
  createdAt: string;
  /** 결정 이력. 어떤 결정도 이 배열을 지우지 않는다(append-only). */
  decisions: DecisionRecord[];
  /** 결과물/입력자료 **참조**만 보관한다(바이너리 금지 — RC-4 후속). */
  artifactRefs?: string[];
  inputRefs?: string[];
  /**
   * 텍스트 업무보고. 파일이 없어도 사람이 쓴 보고는 실제 결과로 인정한다.
   * 여기에 파일/이미지 내용을 넣지 않는다(참조는 artifactRefs).
   */
  resultSummary?: string;
  /**
   * 중단 요청 기록(append-only). **요청일 뿐 상태를 바꾸지 않는다.**
   * 실제 중단은 담당 팀장이 이 카드에서 처리하고, 그 결정은 decisions 에 남는다.
   */
  stopRequests?: StopRequestRecord[];
  /**
   * 협업 요청팀에 남는 **추적용** 카드 표시.
   * 실제 수행은 수행팀 자식 카드에서 한다 — 같은 일이 두 번 실행되지 않게 한다.
   */
  trackingOnly?: boolean;
}

/** 총괄·요청자가 담당 팀장에게 보낸 중단 요청. 덮어쓰지 않고 쌓인다. */
export interface StopRequestRecord {
  requestedBy: ActorRef;
  reason: string;
  requestedAt: string;
}

/** 더 이상 일반 함수로 되살릴 수 없는 상태. */
export const TERMINAL_STATUSES: TaskLifecycleStatus[] = [
  'completed', 'superseded', 'not_adopted', 'not_selected', 'stopped', 'returned', 'failed'
];
export const isTerminalStatus = (s: TaskLifecycleStatus): boolean => TERMINAL_STATUSES.includes(s);

/**
 * 실제로 제출된 결과가 있는가.
 * 빈 배열·빈 문자열·공백만 있는 값은 결과가 아니다.
 */
export function hasSubmittedResult(task: LifecycleTask): boolean {
  const refs = Array.isArray(task.artifactRefs) ? task.artifactRefs : [];
  if (refs.some((r) => typeof r === 'string' && r.trim().length > 0)) return true;
  return typeof task.resultSummary === 'string' && task.resultSummary.trim().length > 0;
}

export interface IdContext {
  newId: () => string;
  nowIso: string;
}

export interface CreateTaskInput {
  title: string;
  /** 생성 시 수행자 유형(기본 unassigned). */
  executorKind?: ExecutorKind;
  /** 생성 시 상태(기본 open). 승인 대기로 바로 만들지 않는다. */
  status?: TaskLifecycleStatus;
  ownerTeamId: DeptTeamId;
  ownerHumanId: string;
  assignedAgentId: string;
  createdBy: ActorRef;
  approvalRoute?: ApprovalRoute;
  dependencyMode?: DependencyMode;
  requestingTeamId?: DeptTeamId;
  artifactRefs?: string[];
  inputRefs?: string[];
  resultSummary?: string;
  /** 협업 요청팀 카드처럼 진행만 지켜보는 카드. 실행 행동을 받지 않는다. */
  trackingOnly?: boolean;
}

/** 업무 생성 — taskId 는 **여기서 한 번만** 만든다. */
export function createLifecycleTask(input: CreateTaskInput, ids: IdContext): LifecycleTask {
  const taskId = ids.newId();
  return {
    ref: { taskId, correlationId: taskId },
    title: input.title,
    ownerTeamId: input.ownerTeamId,
    ownerHumanId: input.ownerHumanId,
    requestingTeamId: input.requestingTeamId,
    assignedAgentId: input.assignedAgentId,
    // RC-2 D-1.2: 생성 즉시 승인 대기로 만들지 않는다. 결과가 제출돼야 확인 대상이 된다.
    executorKind: input.executorKind ?? (input.assignedAgentId ? 'agent' : 'unassigned'),
    ...(input.executorKind === 'agent' || (input.executorKind === undefined && input.assignedAgentId)
      ? { executorId: input.assignedAgentId } : {}),
    executorHistory: [],
    status: input.status ?? 'open',
    dependencyMode: input.dependencyMode ?? 'independent',
    approvalRoute: input.approvalRoute ?? APPROVAL_ROUTES.team_internal,
    createdBy: input.createdBy,
    createdAt: ids.nowIso,
    decisions: [],
    ...(input.artifactRefs ? { artifactRefs: input.artifactRefs } : {}),
    ...(input.inputRefs ? { inputRefs: input.inputRefs } : {}),
    ...(input.resultSummary ? { resultSummary: input.resultSummary } : {}),
    ...(input.trackingOnly ? { trackingOnly: true } : {})
  };
}

/**
 * 협업 자식 업무 — 원래 요청 업무를 **부모로 유지**한다.
 * taskId 는 다르고 correlationId 는 같으며 parentTaskId 로 이어진다.
 * 승인 경로는 기본적으로 collaboration(수행팀 → 요청팀 확인).
 */
export function createChildTask(parent: LifecycleTask, input: CreateTaskInput, ids: IdContext): LifecycleTask {
  const child = createLifecycleTask(
    { ...input, approvalRoute: input.approvalRoute ?? APPROVAL_ROUTES.collaboration, requestingTeamId: input.requestingTeamId ?? parent.ownerTeamId },
    ids
  );
  return { ...child, ref: { ...child.ref, correlationId: parent.ref.correlationId, parentTaskId: parent.ref.taskId } };
}

/**
 * revision 업무 — 기존 결과를 **삭제하지 않고** superseded 로 표시하고 새 업무를 만든다.
 * 이전 결과·수정 이유·새 결과가 모두 역추적 가능해야 한다.
 */
export function createRevisionTask(
  original: LifecycleTask,
  input: { reason: string; createdBy: ActorRef; title?: string },
  ids: IdContext
): { revision: LifecycleTask; superseded: LifecycleTask } {
  // RC-2 D-1.2: 수정본은 새 버전이다.
  //   승인 경로를 **처음부터** 다시 밟고(stageIndex 0), 수행자는 **미정**으로 되돌린다.
  //   직전 수행자는 화면 추천값으로만 남기고 자동 재배정하지 않는다.
  const revision = createLifecycleTask({
    title: input.title ?? `${original.title} (수정본)`,
    ownerTeamId: original.ownerTeamId,
    ownerHumanId: original.ownerHumanId,
    assignedAgentId: '',
    executorKind: 'unassigned',
    status: 'open',
    createdBy: input.createdBy,
    approvalRoute: { ...original.approvalRoute, currentStageIndex: 0 },
    dependencyMode: original.dependencyMode,
    requestingTeamId: original.requestingTeamId
  }, ids);

  const superseded: LifecycleTask = {
    ...original,
    status: 'superseded',
    decisions: [...original.decisions, {
      kind: 'request_revision', actorLabel: input.createdBy.label, actorTeamId: input.createdBy.teamId,
      reason: input.reason, at: ids.nowIso
    }]
  };

  return {
    revision: {
      ...revision,
      ...(original.executorId ? { suggestedExecutorId: original.executorId } : {}),
      ref: {
        ...revision.ref,
        correlationId: original.ref.correlationId,
        parentTaskId: original.ref.parentTaskId,
        revisionOfTaskId: original.ref.taskId,
        replacesTaskId: original.ref.taskId
      }
    },
    superseded
  };
}

// ── 결정 ─────────────────────────────────────────────────────────────────────
export type ApprovalDecisionKind =
  | 'approve'           // 결과 채택 및 해당 승인 단계 완료
  | 'request_revision'  // 기존 결과 보존 + 새 revision 생성
  | 'not_adopted'       // 이번 결과 미채택(업무 종료)
  | 'stop'              // 작업 중단
  | 'return';           // 수행 불가/반송(협업팀 → 요청팀)

export interface ApprovalDecisionInput {
  kind: ApprovalDecisionKind;
  actor: ActorRef;
  reason?: string;
}

export interface DecisionResult {
  ok: boolean;
  task: LifecycleTask;
  /** 원장에 남길 상태 전이 이벤트(삭제 아님). */
  events: { taskId: string; correlationId: string; status: TaskLifecycleStatus; kind: ApprovalDecisionKind; at: string; actorLabel: string; reason?: string }[];
  /** request_revision 일 때 생성된 새 업무. */
  revisionTask?: LifecycleTask;
  reason?: string;
}

/** 이 업무를 요청한 쪽(HQ 지시 또는 협업 요청팀). */
const requesterTeamOf = (task: LifecycleTask): DeptTeamId | undefined =>
  task.requestingTeamId ?? (task.createdBy.teamId !== task.ownerTeamId ? task.createdBy.teamId : undefined);

/** 현재 확인 단계를 맡은 사람인가(단계 기준 권한). */
function isCurrentStageApprover(task: LifecycleTask, actor: ActorRef): { ok: boolean; reason?: string } {
  const stage = task.approvalRoute.stages[task.approvalRoute.currentStageIndex];
  if (!stage) return { ok: false, reason: '남은 승인 단계가 없습니다.' };
  if (stage.approverKind === 'hq') return actor.teamId === 'hq' ? { ok: true } : { ok: false, reason: '총괄(HQ) 확인 단계입니다.' };
  if (stage.approverKind === 'owner_team_lead') {
    return actor.teamId === task.ownerTeamId ? { ok: true } : { ok: false, reason: '담당 팀의 확인 단계입니다.' };
  }
  const requester = task.requestingTeamId;
  return requester && actor.teamId === requester ? { ok: true } : { ok: false, reason: '요청팀의 확인 단계입니다.' };
}

/**
 * 이 행위자가 지금 이 결정을 내릴 수 있는가.
 *
 * RC-2 D-1.3 — 결정을 두 갈래로 나눈다.
 *   결과 확인 계열(확인 완료 · 수정 요청 · 이번 결과 사용 안 함)
 *     → status=awaiting_approval + **실제 제출된 결과**가 있어야 하고, 현재 확인 단계 담당자만.
 *   업무 통제 계열(작업 중단 · 수행 불가 반송)
 *     → 결과가 나오기 전에도 가능하다. 대신 누가 할 수 있는지가 다르다.
 *        중단: **담당 팀장(또는 지정된 임시 책임자)만** 실제로 멈춘다.
 *              총괄·요청팀은 직접 멈추지 못하고 requestTaskStop 으로 요청만 보낸다.
 *        반송: 지시·협업을 **받은** 수행 팀장이 결과 전(open/in_progress)에 요청자에게 돌려보낸다.
 *
 * 종료된 업무는 어떤 결정으로도 되살아나지 않는다.
 * 협업 요청팀의 **추적 카드(trackingOnly)** 는 지켜보는 용도라 어떤 결정도 받지 않는다.
 */
export function canDecide(
  task: LifecycleTask,
  actor: ActorRef,
  kind: ApprovalDecisionKind = 'approve'
): { ok: boolean; reason?: string } {
  if (isTerminalStatus(task.status)) {
    return { ok: false, reason: `이미 끝난 업무입니다(${userStatusLabel(task.status)}). 새 업무로 진행해 주세요.` };
  }
  // RC-2 D-1.3.2: 추적 카드는 진행을 지켜보는 자리다. 여기서 결정하면 실제 수행 업무와 어긋난다.
  //   (부모만 중단되고 수행팀 자식은 계속 살아 있는 유령 상태가 된다.)
  if (task.trackingOnly) {
    return { ok: false, reason: '이 카드는 진행 상황을 보는 용도입니다. 결정은 담당 팀에서 합니다.' };
  }
  // AI 는 자신의 결과물을 최종 승인할 수 없다.
  if (actor.kind === 'agent') return { ok: false, reason: 'AI(에이전트)는 자기 결과물을 승인할 수 없습니다 (self-approval 금지).' };

  const requester = requesterTeamOf(task);

  if (kind === 'stop') {
    // RC-2 D-1.3.1: 실제 중단은 **담당 팀장(또는 지정된 임시 책임자)만** 한다.
    //   총괄은 자기가 시킨 일이라도 그 팀의 실무 상태를 직접 바꾸지 않는다.
    //   그만두고 싶으면 requestTaskStop 으로 담당 팀장에게 요청을 보낸다.
    const isActingLead = !!task.actingLeadUserId && actor.userId === task.actingLeadUserId;
    if (actor.teamId !== task.ownerTeamId && !isActingLead) {
      return { ok: false, reason: '담당 팀장만 업무를 중단할 수 있습니다. 중단 요청을 보내 주세요.' };
    }
    return { ok: true };
  }

  if (kind === 'return') {
    if (!requester) return { ok: false, reason: '돌려보낼 요청자가 없는 업무입니다.' };
    if (task.status !== 'open' && task.status !== 'in_progress') {
      return { ok: false, reason: '수행 불가 반송은 결과를 제출하기 전에만 가능합니다.' };
    }
    return actor.teamId === task.ownerTeamId
      ? { ok: true }
      : { ok: false, reason: '지시를 받은 담당 팀장만 반송할 수 있습니다.' };
  }

  // 결과 확인 계열 — 제출된 결과가 있어야 한다.
  if (task.status !== 'awaiting_approval') {
    return { ok: false, reason: '아직 제출된 결과가 없습니다. 수행이 끝난 뒤에 확인할 수 있습니다.' };
  }
  if (!hasSubmittedResult(task)) {
    return { ok: false, reason: '제출된 결과물이 없어 확인할 수 없습니다.' };
  }
  return isCurrentStageApprover(task, actor);
}

const terminal = (kind: ApprovalDecisionKind): TaskLifecycleStatus | null =>
  kind === 'not_adopted' ? 'not_adopted' : kind === 'stop' ? 'stopped' : kind === 'return' ? 'returned' : null;

/**
 * 승인/수정요청/미채택/중단/반송 결정. 순수 함수 — 입력 task 를 변형하지 않는다.
 * 어떤 결정도 기록을 삭제하지 않고 decisions 에 append 한다.
 */
export function decideApproval(
  task: LifecycleTask,
  input: ApprovalDecisionInput,
  ctx: { nowIso: string; newId?: () => string }
): DecisionResult {
  const permission = canDecide(task, input.actor, input.kind);
  if (!permission.ok) return { ok: false, task, events: [], reason: permission.reason };

  // 업무를 끝내거나 돌려보내는 결정에는 이유가 남아야 한다(나중에 왜 멈췄는지 알 수 있게).
  if ((input.kind === 'stop' || input.kind === 'return') && !(input.reason ?? '').trim()) {
    return { ok: false, task, events: [], reason: '사유를 입력해 주세요. 왜 멈추는지 기록으로 남습니다.' };
  }

  const stage = task.approvalRoute.stages[task.approvalRoute.currentStageIndex];
  const decision: DecisionRecord = {
    kind: input.kind, actorLabel: input.actor.label, actorTeamId: input.actor.teamId,
    reason: input.reason, at: ctx.nowIso, stageLabel: stage?.label
  };
  const withDecision = { ...task, decisions: [...task.decisions, decision] };

  // 수정 요청 — 기존은 superseded, 새 revision 생성
  //   createRevisionTask 가 수정 사유를 decisions 에 남기므로 **원본 task** 를 넘긴다.
  //   (withDecision 을 넘기면 같은 사유가 두 번 기록된다.)
  if (input.kind === 'request_revision') {
    if (!ctx.newId) return { ok: false, task, events: [], reason: 'revision 생성에 id 생성기가 필요합니다.' };
    const { revision, superseded } = createRevisionTask(task, { reason: input.reason ?? '수정 요청', createdBy: input.actor }, { newId: ctx.newId, nowIso: ctx.nowIso });
    return {
      ok: true, task: superseded, revisionTask: revision,
      events: [{ taskId: superseded.ref.taskId, correlationId: superseded.ref.correlationId, status: 'superseded', kind: input.kind, at: ctx.nowIso, actorLabel: input.actor.label, reason: input.reason }]
    };
  }

  // 미채택 / 중단 / 반송 — 기록을 남기고 종료 상태로
  const end = terminal(input.kind);
  if (end) {
    const next = { ...withDecision, status: end };
    return { ok: true, task: next, events: [{ taskId: next.ref.taskId, correlationId: next.ref.correlationId, status: end, kind: input.kind, at: ctx.nowIso, actorLabel: input.actor.label, reason: input.reason }] };
  }

  // 승인 — 다음 단계로. 마지막 단계면 완료.
  const nextIndex = task.approvalRoute.currentStageIndex + 1;
  const isFinal = nextIndex >= task.approvalRoute.stages.length;
  const next: LifecycleTask = {
    ...withDecision,
    status: isFinal ? 'completed' : 'awaiting_approval',
    approvalRoute: { ...task.approvalRoute, currentStageIndex: Math.min(nextIndex, task.approvalRoute.stages.length - 1) }
  };
  return { ok: true, task: next, events: [{ taskId: next.ref.taskId, correlationId: next.ref.correlationId, status: next.status, kind: 'approve', at: ctx.nowIso, actorLabel: input.actor.label, reason: input.reason }] };
}

/**
 * 승인 대기 화면 집계 대상인가.
 * RC-2 D-1.2: **결과가 제출된(awaiting_approval)** 업무만 확인 대상이다.
 *   open(수행자 미정)·in_progress(수행 중)는 아직 결정할 것이 없다.
 */
export const isPendingForApproval = (task: LifecycleTask): boolean =>
  task.status === 'awaiting_approval';

// ── dependencyMode 집계 ──────────────────────────────────────────────────────
export interface ParentResolution {
  status: TaskLifecycleStatus;
  children: LifecycleTask[];
  /** all_required 에서 실패해 **그 부분만** 재실행하면 되는 업무들. */
  retryableTaskIds: string[];
  acceptedPartial?: boolean;
  selectedTaskId?: string;
}

const isDone = (t: LifecycleTask): boolean => t.status === 'completed';
const isBad = (t: LifecycleTask): boolean => t.status === 'failed' || t.status === 'returned';

/**
 * 자식 결과로 부모 상태를 계산한다.
 *   independent  — 다른 업무의 실패가 성공한 업무를 강등하지 않는다.
 *   all_required — 일부 실패면 partially_completed, 성공 결과는 보존, 실패분만 재실행.
 *                  관리자가 acceptPartial 을 명시하면 부분 결과로 완료 채택 가능.
 *   selection    — 선택된 하나만 채택하고 나머지 성공 결과는 not_selected(실패 아님).
 */
export function resolveParentStatus(
  parent: LifecycleTask,
  children: LifecycleTask[],
  opts: { acceptPartial?: boolean; selectedTaskId?: string } = {}
): ParentResolution {
  const mode = parent.dependencyMode;

  if (mode === 'selection') {
    const selectedId = opts.selectedTaskId;
    const marked = children.map((c) =>
      isDone(c) && selectedId && c.ref.taskId !== selectedId ? { ...c, status: 'not_selected' as TaskLifecycleStatus } : c
    );
    const selected = marked.find((c) => c.ref.taskId === selectedId && isDone(c));
    return {
      status: selected ? 'completed' : parent.status,
      children: marked, retryableTaskIds: [], selectedTaskId: selectedId
    };
  }

  if (mode === 'all_required') {
    const bad = children.filter(isBad);
    const retryableTaskIds = bad.map((c) => c.ref.taskId);
    if (bad.length === 0) {
      return { status: children.length > 0 && children.every(isDone) ? 'completed' : parent.status, children, retryableTaskIds: [] };
    }
    if (opts.acceptPartial) return { status: 'completed', children, retryableTaskIds, acceptedPartial: true };
    return { status: 'partially_completed', children, retryableTaskIds };
  }

  // independent — 자식 실패는 부모를 강등하지 않는다. 반송이 있으면 부모는 열린 채 판단 대기.
  const returned = children.some((c) => c.status === 'returned');
  if (returned) return { status: 'awaiting_approval', children, retryableTaskIds: [] };
  const allDone = children.length > 0 && children.every(isDone);
  return { status: allDone ? 'completed' : parent.status, children, retryableTaskIds: [] };
}
