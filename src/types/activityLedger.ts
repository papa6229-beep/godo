// 업무 활동 원장(Activity Ledger) — 전 팀 업무 활동의 단일 기록소.
//
// 설계 원칙:
//  - 각 팀이 하는 일(자동업무 실행·완료, 팀 간 전달, 승인 등)을 append-only 이벤트로 기록한다.
//  - 팀 보드는 여기에 "쓰고", 오늘의 운영(관제)·HQ 채팅은 여기서 "읽기만" 한다(프로젝션).
//    → 오늘의 운영은 별도 상태를 갖지 않고 이 원장의 집계/목록을 보여주는 거울이 된다.
//  - 사람/AI 에이전트 모두 actor가 될 수 있다(teamMessage와 동일 actor 모델 재사용).
//  - 지금은 localStorage(단일 브라우저·데모). 데이터 모델은 백엔드로 그대로 이관 가능.

import type { DeptTeamId, TeamMessageActor } from './teamMessage';

// 활동 유형 — 진행/완료(자동업무), 전달(팀 간 메시지), 승인, 채팅질의, 메모.
export type ActivityType = 'task_run' | 'message_sent' | 'approval' | 'chat_query' | 'note';
// 상태 — 완료 / 대기 / 진행 / 반려 / 단순정보.
export type ActivityStatus = 'done' | 'pending' | 'in_progress' | 'rejected' | 'info';

export interface ActivityEvent {
  id: string;
  teamId: DeptTeamId;        // 어느 팀의 활동인가
  type: ActivityType;
  status: ActivityStatus;
  title: string;
  detail?: string;
  actor: TeamMessageActor;   // 누가(사람/AI 에이전트)
  relatedTeam?: DeptTeamId;  // 보고/전달 대상 등
  refId?: string;            // 연결된 메시지/작업 식별자
  at: string;                // ISO
}

// 팀별 오늘 집계(오늘의 운영 카드/브리핑용).
export interface TeamActivitySummary {
  teamId: DeptTeamId;
  total: number;
  taskRunTotal: number;
  taskRunDone: number;
  messagesSent: number;
  approvals: number;
  pending: number;           // 대기/진행 중(주의 대상)
  lastAt?: string;
}
