// 팀 AI 에이전트 자동 업무 — 작업 정의(WHAT) + 스케줄(WHEN).
//
// 설계:
//  - 계산은 새로 만들지 않는다. 전 부서 공통 canonical 엔진(buildDepartmentSourceOfTruthSnapshot)만 사용.
//    작업 스펙은 "어느 팀 에이전트가 · 무엇에 초점을 맞춰 · 누구에게 보고할지 · 언제"만 선언한다.
//  - 실행 결과는 팀 메시지 센터에 AI-에이전트 명의(actor.kind='agent')로 보고된다(사람과 같은 API).
//  - 스케줄은 지금은 "선언 + 수동 실행". 실제 시각 자동 발화는 2단계(백엔드/상주 프로세스)에서.

import type { DeptTeamId, TeamMessageKind } from './teamMessage';

export type AgentTaskScheduleKind = 'manual' | 'daily' | 'weekly';
export interface AgentTaskSchedule {
  kind: AgentTaskScheduleKind;
  at?: string;       // 'HH:MM' (daily/weekly)
  weekday?: number;  // 0=일 … 6=토 (weekly)
}

// 같은 canonical snapshot에서 팀별로 어떤 지표를 부각할지.
export type AgentTaskFocus = 'overview' | 'sales' | 'inventory' | 'cs';

// 승인 모드 — 자동 완료 / 승인 후 보고(등록) / 확인·수정 후 등록.
export type AgentTaskApprovalMode = 'auto' | 'approval' | 'draft';

export interface AgentTaskSpec {
  id: string;
  teamId: DeptTeamId;        // 수행 팀
  agentId: string;           // 수행 에이전트 식별자
  agentLabel: string;        // 표시명(예: '상품 관리 AI')
  title: string;
  focus: AgentTaskFocus;
  reportTo: DeptTeamId;      // 보고 대상 팀
  reportKind: TeamMessageKind;
  schedule: AgentTaskSchedule;
  approvalMode: AgentTaskApprovalMode;
}

export const APPROVAL_MODE_META: Record<AgentTaskApprovalMode, { label: string; short: string; desc: string }> = {
  auto: { label: '자동 완료', short: '자동', desc: 'AI가 승인 없이 완료까지 수행' },
  approval: { label: '승인 후 보고', short: '승인', desc: 'AI가 결과안을 만들고 사람 승인 후 등록' },
  draft: { label: '검토·수정 후 등록', short: '검토', desc: 'AI 초안을 사람이 확인·수정해 직접 등록' }
};

export const FOCUS_META: Record<AgentTaskFocus, string> = {
  overview: '종합', sales: '매출', inventory: '재고', cs: 'CS'
};

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 스케줄 표시 라벨(예: '매일 09:00', '매주 월 09:00', '수동').
export function scheduleLabel(s: AgentTaskSchedule): string {
  if (s.kind === 'manual') return '수동 실행';
  if (s.kind === 'daily') return `매일 ${s.at ?? ''}`.trim();
  const wd = typeof s.weekday === 'number' ? WEEKDAY_KO[s.weekday] : '';
  return `매주 ${wd} ${s.at ?? ''}`.trim();
}
