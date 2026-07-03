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
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 스케줄 표시 라벨(예: '매일 09:00', '매주 월 09:00', '수동').
export function scheduleLabel(s: AgentTaskSchedule): string {
  if (s.kind === 'manual') return '수동 실행';
  if (s.kind === 'daily') return `매일 ${s.at ?? ''}`.trim();
  const wd = typeof s.weekday === 'number' ? WEEKDAY_KO[s.weekday] : '';
  return `매주 ${wd} ${s.at ?? ''}`.trim();
}
