// 팀 간 소통(요청/확인/보고) — 데이터 모델
//
// 설계 원칙:
//  - "보내는 주체(actor)"는 사람 또는 AI 에이전트 모두가 될 수 있다.
//    → 지금은 운영자(사람)가 UI로 보내지만, 추후 각 팀 AI 에이전트가 업무 매뉴얼대로
//      자동 작업을 수행하며 프로그램적으로 요청/보고/완료를 남길 수 있어야 한다.
//  - UI에 종속되지 않는다. 스토어/순수 함수(teamMessageCenter)만 통해 생성·변경한다.
//    사람 UI와 미래의 에이전트 런타임이 "같은 API"를 호출한다.
//  - 지금은 localStorage(단일 브라우저·데모). 데이터 모델은 백엔드(공용 DB+실시간)로
//    그대로 이관 가능하게 설계(2단계에서 스토어 구현만 교체).

export type DeptTeamId = 'hq' | 'product' | 'cs' | 'marketing';

// 요청 유형 — 지원요청 / 확인요청 / 일반전달
export type TeamMessageKind = 'support' | 'confirm' | 'info';
// 처리 상태 — 접수(open) → 진행(in_progress) → 완료(done)
export type TeamMessageStatus = 'open' | 'in_progress' | 'done';
// 주체 종류 — 사람(운영자) 또는 AI 에이전트
export type ActorKind = 'human' | 'agent';

export interface TeamMessageActor {
  kind: ActorKind;
  teamId: DeptTeamId;
  label: string;        // 표시명(사람='운영자' 등, 에이전트=에이전트명)
  agentId?: string;     // kind==='agent'일 때 식별자
}

export interface TeamMessageAttachment {
  name: string;
  size: number;         // bytes
  mime: string;
  // 데모: 소형 파일만 base64 dataUrl로 보관(localStorage 용량 보호).
  // 큰 파일/실사용은 2단계에서 blob 스토리지 URL로 대체.
  dataUrl?: string;
  omitted?: boolean;    // 용량 초과로 본문 미보관(메타만) 표시
}

export interface TeamMessageEvent {
  at: string;                         // ISO
  by: TeamMessageActor;
  type: 'created' | 'read' | 'status' | 'reply';
  note?: string;
  status?: TeamMessageStatus;         // type==='status'일 때 전이 결과
}

export interface TeamMessage {
  id: string;
  from: TeamMessageActor;
  toTeam: DeptTeamId;
  kind: TeamMessageKind;
  title: string;
  body: string;
  attachments: TeamMessageAttachment[];
  status: TeamMessageStatus;
  createdAt: string;                  // ISO
  updatedAt: string;                  // ISO
  readByTo: boolean;                  // 받은 팀이 열람했는지(안읽음 배지용)
  events: TeamMessageEvent[];         // 이력(누가/언제/무엇)
}

// 팀 표시 메타 — UI와 (미래) 에이전트가 동일 라벨을 쓰도록 한 곳에 둔다.
export const DEPT_TEAM_META: Record<DeptTeamId, { name: string; emoji: string }> = {
  hq: { name: '총괄팀', emoji: '🏛️' },
  product: { name: '상품관리팀', emoji: '🏷️' },
  cs: { name: 'CS팀', emoji: '💬' },
  marketing: { name: '마케팅팀', emoji: '📊' }
};

export const TEAM_MESSAGE_KIND_META: Record<TeamMessageKind, { label: string; emoji: string }> = {
  support: { label: '지원요청', emoji: '🤝' },
  confirm: { label: '확인요청', emoji: '✅' },
  info: { label: '일반전달', emoji: '📨' }
};

export const TEAM_MESSAGE_STATUS_META: Record<TeamMessageStatus, { label: string }> = {
  open: { label: '접수' },
  in_progress: { label: '진행중' },
  done: { label: '완료' }
};
