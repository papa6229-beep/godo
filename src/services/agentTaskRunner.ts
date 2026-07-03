// 팀 에이전트 자동 업무 실행기.
//  - 계산: 전 부서 공통 canonical 엔진(buildDepartmentSourceOfTruthSnapshot)만 사용(새 숫자 로직 없음).
//  - 보고: 팀 메시지 센터에 AI-에이전트 명의(actor.kind='agent')로 postTeamMessage.
//  - 사람 UI의 "지금 실행"과 (미래) 스케줄 트리거가 같은 runAgentTask를 호출한다.

import { buildDepartmentSourceOfTruthSnapshot } from './departmentDataSourceOfTruth';
import { postTeamMessage } from './teamMessageCenter';
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

// 작업 실행: canonical 계산 → AI-에이전트 명의로 보고 메시지 발신. 반환: 발신 메시지 + 본문.
export function runAgentTask(spec: AgentTaskSpec, ctx: RunAgentTaskContext): { posted: TeamMessage; body: string } {
  const snap = buildDepartmentSourceOfTruthSnapshot(ctx.revenue, ctx.nowMs != null ? { nowMs: ctx.nowMs } : {});
  const { title, body } = formatTaskReport(spec, snap);
  const from: TeamMessageActor = { kind: 'agent', teamId: spec.teamId, label: spec.agentLabel, agentId: spec.agentId };
  const posted = postTeamMessage({ from, toTeam: spec.reportTo, kind: spec.reportKind, title, body }, ctx.nowIso);
  return { posted, body };
}
