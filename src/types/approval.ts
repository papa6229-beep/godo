import type { TaskRiskLevel } from './task';

export interface ApprovalItem {
  id: string;
  taskId: string;
  title: string;
  requestedByAgentId: string;
  riskLevel: TaskRiskLevel;
  reason: string;
  proposedAction: string;
  status: 'waiting' | 'approved' | 'rejected';

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

