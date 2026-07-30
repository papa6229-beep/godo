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
// 상태 — 완료 / 대기 / 진행 / 반려 / 실패 / 단순정보.
//   D-0: `failed` 는 계산·저장 자체가 실패한 경우다. **완료로도 반려로도 표시하지 않는다.**
export type ActivityStatus = 'done' | 'pending' | 'in_progress' | 'rejected' | 'failed' | 'info';

/**
 * D-0: 이 기록이 **어떤 자료로** 만들어졌는가. 화면 라벨은
 * `dataSourceProvenanceContract.userLabelOf` 로 만든다(새 라벨 규칙을 만들지 않는다).
 *   actual → 실제 데이터 · simulation → 시험 데이터 · unavailable → 연결 안 됨
 */
export type ActivityDataProvenance = 'actual' | 'simulation' | 'unavailable';

export interface ActivityEvent {
  id: string;
  teamId: DeptTeamId;        // 어느 팀의 활동인가
  type: ActivityType;
  status: ActivityStatus;
  title: string;
  detail?: string;
  actor: TeamMessageActor;   // 누가(사람/AI 에이전트)
  relatedTeam?: DeptTeamId;  // 보고/전달 대상 등
  refId?: string;            // 연결된 메시지 식별자(표시용 참조)
  // RC-2(G2): 업무 흐름 추적 식별자. 구버전 이벤트에는 없을 수 있어 optional 이며,
  //   집계는 `taskId ?? refId` 순으로 안전 후퇴한다(구버전 원장 무회귀).
  taskId?: string;
  correlationId?: string;
  // D-0: 반복 AI 업무의 상태를 새로고침 뒤에도 **구조적으로** 복원하기 위한 선택 필드.
  //   과거 저장분에는 없다(undefined) — 없다고 해서 값이 0/실제 데이터라고 단정하지 않는다.
  /** AI 가 만든 결과 본문(사람이 수정했으면 수정본). `detail` 은 표시용 문장이라 파싱하지 않는다. */
  resultBody?: string;
  /** 그 결과를 만든 자료의 출처. 화면이 버튼 이름·spec 으로 추측하지 않게 한다. */
  dataProvenance?: ActivityDataProvenance;
  /** 반려·중단 사유 한 문장. */
  decisionReason?: string;
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
  // 현재 상태(refId로 dedup, 최신 상태 기준) — 부서가 실제로 진행/완료/승인대기 중인 건수.
  inProgress: number;        // 진행 중
  done: number;              // 완료
  pending: number;           // 승인·확인 대기(pending 상태만)
  lastAt?: string;
}
