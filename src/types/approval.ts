import type { TaskRiskLevel } from './task';

export interface ApprovalItem {
  id: string;
  /** RC-2: 제안 단계에서 확정된 업무 식별자. 소비자가 새로 만들지 않는다. */
  taskId: string;
  correlationId?: string;
  title: string;
  requestedByAgentId: string;
  riskLevel: TaskRiskLevel;
  reason: string;
  proposedAction: string;
  // RC-2: 결정 3종을 canonical 로 구분한다(기존 값 유지 — 하위호환).
  status: 'waiting' | 'approved' | 'rejected' | 'not_adopted' | 'cancelled';
  /** 결정 사유(반려·미채택·중단). 기록은 삭제하지 않는다. */
  decisionReason?: string;
  /** 이미 나온 내용을 결정만 하는 카드(중단 버튼 없음). 정본에서 그대로 온다. */
  reviewOnly?: boolean;

  // ── RC-2 D-1.3.3.2: 표시용 투영 ──────────────────────────────────────────
  //   requestedByAgentId 단독으로 제출자를 판정하지 않도록 정본에서 의미를 실어 온다.
  //   하위호환을 위해 requestedByAgentId 는 그대로 두고, 화면은 공통 표시 함수를 통해 읽는다.
  /** 수행자 유형(정본 executorKind). agent 는 기존 AI 명단 해석을 유지한다. */
  executorKind?: 'unassigned' | 'agent' | 'human';
  /** reviewOnly 확인요청의 제출팀(정본 ownerTeamId). */
  submittingTeamId?: string;
  /** reviewOnly 제출자 또는 인간 수행자의 사람 이름(정본 기록). */
  submittedByLabel?: string;

  originalIssue?: string;
  maskedInput?: string;
  generatedDraft?: string;

  metadata?: {
    modelId?: string;
    latency?: number;
    fallbackUsed?: boolean;
    piiRemoved?: boolean;
    route?: 'LOCAL' | 'HYBRID' | 'CLOUD' | 'HUMAN' | 'MOCK';
    taskType?: string;
    sourceType?: string;
    referencedKnowledge?: string[];
    approvalRequired?: boolean;
  };
}

