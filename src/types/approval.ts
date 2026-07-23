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

