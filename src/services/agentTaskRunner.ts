// 팀 에이전트 자동 업무 실행기.
//  - 계산: 전 부서 공통 canonical 엔진(buildDepartmentSourceOfTruthSnapshot)만 사용(새 숫자 로직 없음).
//  - 보고: 팀 메시지 센터에 AI-에이전트 명의(actor.kind='agent')로 postTeamMessage.
//  - 사람 UI의 "지금 실행"과 (미래) 스케줄 트리거가 같은 runAgentTask를 호출한다.

import { buildDepartmentSourceOfTruthSnapshot } from './departmentDataSourceOfTruth';
import { postTeamMessage } from './teamMessageCenter';
import { logActivity } from './activityLedger';
import { DEPT_TEAM_META } from '../types/teamMessage';
import type { RevenueResult } from './departmentDataService';
import type { DepartmentSourceOfTruthSnapshot } from './departmentDataSourceOfTruth';
import type { AgentTaskSpec } from '../types/agentTask';
import type { TeamMessage, TeamMessageActor } from '../types/teamMessage';

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const cnt = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}`;

// snapshot(canonical) → 팀 focus별 보고 본문. snapshot 없으면 정직하게 '데이터 준비 전'.
export function formatTaskReport(spec: AgentTaskSpec, snap: DepartmentSourceOfTruthSnapshot | null): { title: string; body: string } {
  const title = spec.title;
  if (!snap) {
    return { title, body: '데이터가 아직 준비되지 않아 보고를 생성하지 못했습니다. (데이터 적재 후 다시 실행)' };
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
  return { title, body };
}

export interface RunAgentTaskContext {
  revenue: RevenueResult | null;
  nowIso?: string;
  nowMs?: number;
}

// RC-2(G2): 자동업무의 업무 식별자. 같은 spec 의 대기→완료가 같은 키로 닫히게 한다.
export const lifecycleTaskId = (spec: AgentTaskSpec): string => `agenttask-${spec.id}`;

const agentActor = (spec: AgentTaskSpec): TeamMessageActor => ({ kind: 'agent', teamId: spec.teamId, label: spec.agentLabel, agentId: spec.agentId });

// canonical 계산만(발신·기록 없음). approval/draft에서 사람 검토용 본문 생성.
export function computeAgentReport(spec: AgentTaskSpec, revenue: RevenueResult | null, nowMs?: number): { title: string; body: string } {
  const snap = buildDepartmentSourceOfTruthSnapshot(revenue, nowMs != null ? { nowMs } : {});
  return formatTaskReport(spec, snap);
}

// 최종 보고 발신 + 원장 기록. resolvedByHuman=true(승인/검토 후)면 approval(done)로도 남긴다.
export function postAgentReport(spec: AgentTaskSpec, report: { title: string; body: string }, ctx: RunAgentTaskContext, opts?: { resolvedByHuman?: boolean }): { posted: TeamMessage } {
  const from = agentActor(spec);
  const posted = postTeamMessage({ from, toTeam: spec.reportTo, kind: spec.reportKind, title: report.title, body: report.body }, ctx.nowIso);
  // RC-2(G2): 추적 키는 **업무 식별자(spec.id)**. refId(메시지 id)만 남기면 원 업무로 돌아갈 수 없다.
  logActivity({
    teamId: spec.teamId, type: 'task_run', status: 'done',
    title: spec.title, detail: `${report.body} → ${DEPT_TEAM_META[spec.reportTo].name}에 보고`,
    actor: from, relatedTeam: spec.reportTo, refId: posted.id,
    taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec)
  }, ctx.nowIso);
  if (opts?.resolvedByHuman) {
    logActivity({ teamId: spec.teamId, type: 'approval', status: 'done', title: `${spec.title} 승인/등록`,
      actor: { kind: 'human', teamId: spec.teamId, label: '운영자' }, refId: posted.id,
      taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec) }, ctx.nowIso);
  }
  return { posted };
}

// 자동 완료 경로(approvalMode='auto' 또는 스케줄러): 계산 → 발신 → 원장(done).
export function runAgentTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext): { posted: TeamMessage; body: string } {
  const report = computeAgentReport(spec, ctx.revenue, ctx.nowMs);
  const { posted } = postAgentReport(spec, report, ctx);
  return { posted, body: report.body };
}

// 승인/검토 경로: 계산 → 원장(task_run, pending)만. 발신은 사람 승인 후(approveAgentTask).
export function stageApprovalTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext): { title: string; body: string } {
  const report = computeAgentReport(spec, ctx.revenue, ctx.nowMs);
  logActivity({
    teamId: spec.teamId, type: 'task_run', status: 'pending',
    title: spec.title, detail: `${report.body} (승인 대기)`,
    actor: agentActor(spec), relatedTeam: spec.reportTo,
    taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec)
  }, ctx.nowIso);
  return report;
}

// RC-2(G2): 반려·중단 — 발신하지 않고 같은 업무 식별자로 상태만 닫는다(기록 삭제 없음).
export function rejectAgentTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext, reason: string): void {
  logActivity({
    teamId: spec.teamId, type: 'approval', status: 'rejected',
    title: `${spec.title} 반려`, detail: reason,
    actor: { kind: 'human', teamId: spec.teamId, label: '운영자' },
    taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec)
  }, ctx.nowIso);
}

export function cancelAgentTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext, reason: string): void {
  logActivity({
    teamId: spec.teamId, type: 'task_run', status: 'rejected',
    title: `${spec.title} 작업 중단`, detail: reason,
    actor: { kind: 'human', teamId: spec.teamId, label: '운영자' },
    taskId: lifecycleTaskId(spec), correlationId: lifecycleTaskId(spec)
  }, ctx.nowIso);
}

// 사람이 승인/수정한 본문으로 최종 발신 + 원장(done + approval).
export function approveAgentTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext, body: string): { posted: TeamMessage } {
  return postAgentReport(spec, { title: spec.title, body }, ctx, { resolvedByHuman: true });
}
