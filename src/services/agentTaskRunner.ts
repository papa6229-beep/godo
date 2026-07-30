// 팀 에이전트 자동 업무 실행기.
//  - 계산: 전 부서 공통 canonical 엔진(buildDepartmentSourceOfTruthSnapshot)만 사용(새 숫자 로직 없음).
//  - 보고: 팀 메시지 센터에 AI-에이전트 명의(actor.kind='agent')로 postTeamMessage.
//  - 사람 UI의 "지금 실행"과 (미래) 스케줄 트리거가 같은 runAgentTask를 호출한다.

import { buildDepartmentSourceOfTruthSnapshot } from './departmentDataSourceOfTruth';
import { postTeamMessage } from './teamMessageCenter';
import { logActivity, loadActivity } from './activityLedger';
import { latestAgentTaskRunState } from './agentTaskRunState';
import { userLabelOf } from './dataSourceProvenanceContract';
import { hasLeadAuthority } from './taskLifecycleContract';
import { DEPT_TEAM_META } from '../types/teamMessage';
import type { RevenueResult } from './departmentDataService';
import type { DepartmentSourceOfTruthSnapshot } from './departmentDataSourceOfTruth';
import type { AgentTaskSpec } from '../types/agentTask';
import type { TeamMessage, TeamMessageActor } from '../types/teamMessage';
import type { ActorRef } from './taskLifecycleContract';
import type { ActivityDataProvenance } from '../types/activityLedger';
import type { ProvenanceUserLabel } from './dataSourceProvenanceContract';
import { canRunStandingDirective } from './standingDirectiveContract';
import type { StandingRunVerdict } from './standingDirectiveContract';

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const cnt = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}`;

/**
 * D-0 — 결과 출처는 **실제 계산에 사용된 snapshot 의 `sourceMode`** 만으로 정한다.
 *   `standing.source`(상시 지시 설정값)나 버튼 이름으로 추측하지 않는다.
 *   snapshot 이 없거나 `unavailable` 이면 실제 데이터로 표시하지 않는다.
 */
export const provenanceOf = (
  snap: DepartmentSourceOfTruthSnapshot | null
): ActivityDataProvenance => {
  if (!snap || snap.sourceMode === 'unavailable') return 'unavailable';
  if (snap.sourceMode === 'real') return 'actual';
  return 'simulation'; // synthetic · mixed
};

/** D-0: 보고 본문과 함께 **그 결과를 만든 자료의 출처**를 구조값으로 돌려준다. */
export interface AgentTaskReport {
  title: string;
  body: string;
  dataProvenance: ActivityDataProvenance;
  dataLabel: ProvenanceUserLabel;
}

// snapshot(canonical) → 팀 focus별 보고 본문. snapshot 없으면 정직하게 '데이터 준비 전'.
//   본문 첫머리에 사용자 라벨을 붙인다 — 시험자료 결과가 '실제 데이터'로 읽히는 경로를 없앤다.
export function formatTaskReport(spec: AgentTaskSpec, snap: DepartmentSourceOfTruthSnapshot | null): AgentTaskReport {
  const title = spec.title;
  const dataProvenance = provenanceOf(snap);
  const dataLabel = userLabelOf(dataProvenance);
  const withLabel = (text: string): AgentTaskReport => ({ title, body: `[${dataLabel}] ${text}`, dataProvenance, dataLabel });
  if (!snap) {
    return withLabel('데이터가 아직 준비되지 않아 보고를 생성하지 못했습니다. (데이터 적재 후 다시 실행)');
  }
  const rev = `운영매출 ${won(snap.operationalRevenue)} · 운영주문 ${cnt(snap.operationalOrderCount)}건`;
  let body: string;
  switch (spec.focus) {
    case 'inventory':
      body = `재고위험 ${cnt(snap.productUniverse.riskyStockCount)}건(관리 상품 ${cnt(snap.productUniverse.productCount)}종) · 판매수량 ${cnt(snap.productUniverse.totalQuantitySold)}개. ${rev}.`;
      break;
    case 'sales':
      body = `${rev} · 객단가 ${won(snap.operationalAOV)}. (기준: ${snap.periodLabel})`;
      break;
    case 'cs':
      body = `총 문의 ${cnt(snap.csUniverse.totalInquiries)}건 중 미처리 ${cnt(snap.csUniverse.unresolvedInquiries)}건 · 리뷰 ${cnt(snap.csUniverse.totalReviews)}건 · 자동응대 후보 ${cnt(snap.csUniverse.autoCandidates)}건.`;
      break;
    default:
      body = `${rev} · 객단가 ${won(snap.operationalAOV)}. 재고위험 ${cnt(snap.productUniverse.riskyStockCount)}건 · 미처리 문의 ${cnt(snap.csUniverse.unresolvedInquiries)}건.`;
  }
  return withLabel(body);
}

export interface RunAgentTaskContext {
  revenue: RevenueResult | null;
  nowIso?: string;
  nowMs?: number;
}

// RC-2(G2): 자동업무의 업무 식별자. 같은 spec 의 대기→완료가 같은 키로 닫히게 한다.
export const lifecycleTaskId = (spec: AgentTaskSpec): string => `agenttask-${spec.id}`;

const agentActor = (spec: AgentTaskSpec): TeamMessageActor => ({ kind: 'agent', teamId: spec.teamId, label: spec.agentLabel, agentId: spec.agentId });

/**
 * D-0 — 사람 행위자를 원장 actor 로. **`'운영자'` 하드코딩을 쓰지 않는다.**
 *   표시명이 바뀌어도 "누가 했는가"를 대조할 수 있게 `userId` 를 함께 남긴다.
 */
const humanActor = (actor: ActorRef): TeamMessageActor => ({
  kind: 'human', teamId: actor.teamId, label: actor.label,
  ...(actor.userId ? { userId: actor.userId } : {})
});

/**
 * D-0 — `reportTo === teamId` 는 **팀 내부 기록**이라는 뜻이다.
 *   팀 메시지(HQ 요청함·팀 간 수신함)를 만들지 않고 업무기록 장부에만 남긴다.
 *   다른 기본 업무(`reportTo: 'hq'`)의 전송 동작은 그대로다.
 */
const isInternalTeamRecord = (spec: AgentTaskSpec): boolean => spec.reportTo === spec.teamId;

/** D-0 — 실행·확인·반려·중단의 공통 권한 경계. 화면 숨김에만 기대지 않는다. */
const leadGuard = (spec: AgentTaskSpec, actor: ActorRef): string | null => {
  if (actor.kind !== 'human') return 'AI 는 이 업무를 확정할 수 없습니다.';
  if (actor.teamId !== spec.teamId) return '담당 팀장만 이 업무를 실행할 수 있습니다.';
  if (!hasLeadAuthority(actor)) return '담당 팀장만 이 업무를 실행할 수 있습니다.';
  return null;
};

/** D-0 — 지금 장부에 남아 있는 이 업무의 최신 상태. */
const currentRunState = (spec: AgentTaskSpec) => latestAgentTaskRunState(loadActivity(), spec.id);

// canonical 계산만(발신·기록 없음). approval/draft에서 사람 검토용 본문 생성.
function computeAgentReport(spec: AgentTaskSpec, revenue: RevenueResult | null, nowMs?: number): AgentTaskReport {
  const snap = buildDepartmentSourceOfTruthSnapshot(revenue, nowMs != null ? { nowMs } : {});
  return formatTaskReport(spec, snap);
}

// 최종 완료 기록. 팀 내부 기록이면 발신하지 않고 장부에만 남긴다.
//   resolvedByHuman 이 있으면 **누가 확인했는지**를 approval(done)로 함께 남긴다.
function postAgentReport(
  spec: AgentTaskSpec,
  report: { title: string; body: string; dataProvenance: ActivityDataProvenance },
  ctx: RunAgentTaskContext,
  opts?: { resolvedBy?: ActorRef }
): { posted?: TeamMessage } {
  const from = agentActor(spec);
  const internal = isInternalTeamRecord(spec);
  const posted = internal
    ? undefined
    : postTeamMessage({ from, toTeam: spec.reportTo, kind: spec.reportKind, title: report.title, body: report.body }, ctx.nowIso);
  // RC-2(G2): 추적 키는 **업무 식별자(spec.id)**. refId(메시지 id)만 남기면 원 업무로 돌아갈 수 없다.
  logActivity({
    teamId: spec.teamId, type: 'task_run', status: 'done',
    title: spec.title,
    detail: internal ? `${report.body} (팀 내부 확인 완료)` : `${report.body} → ${DEPT_TEAM_META[spec.reportTo].name}에 보고`,
    actor: from, relatedTeam: spec.reportTo, ...(posted ? { refId: posted.id } : {}),
    taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec),
    resultBody: report.body, dataProvenance: report.dataProvenance
  }, ctx.nowIso);
  if (opts?.resolvedBy) {
    logActivity({
      teamId: spec.teamId, type: 'approval', status: 'done',
      title: internal ? `${spec.title} 팀 내부 확인 완료` : `${spec.title} 승인/등록`,
      actor: humanActor(opts.resolvedBy), ...(posted ? { refId: posted.id } : {}),
      taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec),
      resultBody: report.body, dataProvenance: report.dataProvenance
    }, ctx.nowIso);
  }
  return { posted };
}

/**
 * RC-2 D-1.2 — 이 자동 업무가 **스스로** 돌아도 되는지.
 *   사람이 화면에서 직접 누른 실행은 여기 해당하지 않는다(그건 사람의 결정이다).
 *   상시 지시가 없거나 승인이 없으면 자동 실행하지 않고 팀장 확인 대기로 남긴다.
 */
export function canAutoRunAgentTask(spec: AgentTaskSpec): StandingRunVerdict {
  return canRunStandingDirective(spec.standing);
}

// 자동 완료 경로: 계산 → 발신 → 원장(done).
//   RC-2 D-1.3.1: **모듈 내부 전용.** 게이트를 보지 않는 함수라서 밖으로 내보내지 않는다.
//   (주석으로 '쓰지 말 것' 이라고 적는 것만으로는 우회를 막지 못한다.)
//   공개 진입점은 runManualAgentTask(사람) / runScheduledAgentTask(스케줄) 뿐이다.
function runAgentTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext): { report: AgentTaskReport } {
  const report = computeAgentReport(spec, ctx.revenue, ctx.nowMs);
  postAgentReport(spec, report, ctx);
  return { report };
}

// 승인/검토 경로: 계산 → 원장(task_run, pending)만. 발신은 사람 승인 후(approveAgentTask).
//   RC-2 D-1.3.1: 모듈 내부 전용(공개 진입점을 통해서만 도달한다).
function stageApprovalTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext): AgentTaskReport {
  const report = computeAgentReport(spec, ctx.revenue, ctx.nowMs);
  logActivity({
    teamId: spec.teamId, type: 'task_run', status: 'pending',
    title: spec.title,
    detail: isInternalTeamRecord(spec) ? `${report.body} (팀장 확인 대기)` : `${report.body} (승인 대기)`,
    actor: agentActor(spec), relatedTeam: spec.reportTo,
    taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec),
    resultBody: report.body, dataProvenance: report.dataProvenance
  }, ctx.nowIso);
  return report;
}

/** D-0 — 확인·반려·중단의 결과. 실패를 성공으로 표시하지 않는다. */
export type AgentTaskDecisionOutcome =
  | { ok: true; posted?: TeamMessage }
  | { ok: false; reason: string };

/**
 * D-0 — 확인·반려·중단 공통 전제.
 *   ① 담당 팀장 권한 ② **지금 확인 대기 상태일 때만** 결정할 수 있다.
 *   (완료·반려된 업무를 다시 닫거나, 대기 없는 업무를 완료로 만들지 않는다.)
 */
const decisionGuard = (spec: AgentTaskSpec, actor: ActorRef): { ok: false; reason: string } | null => {
  const denied = leadGuard(spec, actor);
  if (denied) return { ok: false, reason: denied };
  if (currentRunState(spec).phase !== 'awaiting_review') {
    return { ok: false, reason: '확인 대기 중인 점검 결과가 없습니다.' };
  }
  return null;
};

// RC-2(G2): 반려·중단 — 발신하지 않고 같은 업무 식별자로 상태만 닫는다(기록 삭제 없음).
export function rejectAgentTask(spec: AgentTaskSpec, actor: ActorRef, ctx: RunAgentTaskContext, reason: string): AgentTaskDecisionOutcome {
  const denied = decisionGuard(spec, actor);
  if (denied) return denied;
  const text = reason.trim();
  // 사유 없는 반려는 기록하지 않는다 — 원장을 바꾸지 않고 실패를 돌려준다.
  if (!text) return { ok: false, reason: '이유를 한 문장 적어 주세요.' };
  logActivity({
    teamId: spec.teamId, type: 'approval', status: 'rejected',
    title: `${spec.title} 반려`, detail: text,
    actor: humanActor(actor),
    taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec),
    decisionReason: text
  }, ctx.nowIso);
  return { ok: true };
}

export function cancelAgentTask(spec: AgentTaskSpec, actor: ActorRef, ctx: RunAgentTaskContext, reason: string): AgentTaskDecisionOutcome {
  const denied = decisionGuard(spec, actor);
  if (denied) return denied;
  const text = reason.trim();
  if (!text) return { ok: false, reason: '중단 사유를 한 문장 적어 주세요.' };
  logActivity({
    teamId: spec.teamId, type: 'task_run', status: 'rejected',
    title: `${spec.title} 작업 중단`, detail: text,
    actor: humanActor(actor),
    taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec),
    decisionReason: text
  }, ctx.nowIso);
  return { ok: true };
}

/**
 * 사람이 확인(필요하면 수정)한 본문으로 완료 기록.
 *   **출처는 화면 자료로 다시 추정하지 않고 대기 이벤트에 저장된 값을 이어받는다** —
 *   확인 시점의 화면 데이터가 달라져 있어도 그 결과가 무엇으로 계산됐는지는 바뀌지 않는다.
 */
export function approveAgentTask(spec: AgentTaskSpec, actor: ActorRef, ctx: RunAgentTaskContext, body: string): AgentTaskDecisionOutcome {
  const denied = decisionGuard(spec, actor);
  if (denied) return denied;
  const staged = currentRunState(spec);
  const { posted } = postAgentReport(
    spec,
    { title: spec.title, body, dataProvenance: staged.dataProvenance ?? 'unavailable' },
    ctx,
    { resolvedBy: actor }
  );
  return { ok: true, ...(posted ? { posted } : {}) };
}

// ── RC-2 D-1.3: 공개 진입점 ────────────────────────────────────────────────
//   미래의 스케줄러가 raw runAgentTask 를 직접 불러 상시 지시 확인을 건너뛰지 못하게 한다.

export type AgentTaskRunOutcome =
  | { ran: true; body: string; staged: false; dataProvenance: ActivityDataProvenance; dataLabel: ProvenanceUserLabel }
  | { ran: false; staged: true; body: string; reason: string; dataProvenance: ActivityDataProvenance; dataLabel: ProvenanceUserLabel }
  | { ran: false; staged: false; reason: string };

/**
 * D-0 — 실행 전 공통 게이트.
 *   ① 데이터가 없거나 출처가 `unavailable` 이면 **pending·done·메시지를 하나도 만들지 않는다.**
 *      "연결 안 됨"을 완료나 확인대기로 저장하지 않는다.
 *   ② 이미 확인 대기 중이면 **같은 업무를 다시 대기로 만들지 않는다**(중복 클릭·중복 기록 차단).
 *      완료·반려 뒤 재실행은 허용한다.
 */
const preRunGate = (spec: AgentTaskSpec, ctx: RunAgentTaskContext): { ran: false; staged: false; reason: string } | null => {
  const snap = buildDepartmentSourceOfTruthSnapshot(ctx.revenue, ctx.nowMs != null ? { nowMs: ctx.nowMs } : {});
  if (provenanceOf(snap) === 'unavailable') {
    return { ran: false, staged: false, reason: '데이터가 준비되지 않아 점검하지 못했습니다.' };
  }
  if (currentRunState(spec).phase === 'awaiting_review') {
    return { ran: false, staged: false, reason: '이미 확인 대기 중인 점검 결과가 있습니다.' };
  }
  return null;
};

/** 사람이 화면에서 직접 누른 실행 — **그 팀 팀장만**. */
export function runManualAgentTask(
  spec: AgentTaskSpec,
  actor: ActorRef,
  ctx: RunAgentTaskContext
): AgentTaskRunOutcome {
  const denied = leadGuard(spec, actor);
  if (denied) return { ran: false, staged: false, reason: denied };
  const blocked = preRunGate(spec, ctx);
  if (blocked) return blocked;
  const verdict = canAutoRunAgentTask(spec);
  // 사람이 눌렀더라도 고위험 결과를 그냥 내보내지는 않는다.
  if (spec.approvalMode !== 'auto' || verdict.requiresLeadConfirmation) {
    const report = stageApprovalTask(spec, ctx);
    return {
      ran: false, staged: true, body: report.body,
      dataProvenance: report.dataProvenance, dataLabel: report.dataLabel,
      reason: verdict.requiresLeadConfirmation
        ? '고위험 업무라 결과를 바로 보내지 않고 확인 뒤 보고합니다.'
        : isInternalTeamRecord(spec)
          ? '팀장이 확인한 뒤 팀 내부 기록으로 마감합니다.'
          : '확인 후 보고하도록 설정된 업무입니다.'
    };
  }
  const { report } = runAgentTask(spec, ctx);
  return { ran: true, staged: false, body: report.body, dataProvenance: report.dataProvenance, dataLabel: report.dataLabel };
}

/** 시각 스케줄이 부르는 유일한 진입점 — 상시 지시 확인을 **건너뛸 수 없다**. */
export function runScheduledAgentTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext): AgentTaskRunOutcome {
  const verdict = canRunStandingDirective(spec.standing);
  if (!verdict.allowed) {
    return { ran: false, staged: false, reason: verdict.reason ?? '담당 팀장 확인이 필요합니다.' };
  }
  const blocked = preRunGate(spec, ctx);
  if (blocked) return blocked;
  if (verdict.requiresLeadConfirmation || spec.approvalMode !== 'auto') {
    const report = stageApprovalTask(spec, ctx);
    return {
      ran: false, staged: true, body: report.body,
      dataProvenance: report.dataProvenance, dataLabel: report.dataLabel,
      reason: '결과를 담당 팀장이 확인한 뒤 보고합니다.'
    };
  }
  const { report } = runAgentTask(spec, ctx);
  return { ran: true, staged: false, body: report.body, dataProvenance: report.dataProvenance, dataLabel: report.dataLabel };
}
