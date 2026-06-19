import type { TaskRiskLevel } from './task';

export interface OperationArtifact {
  id: string;
  taskId: string;
  taskType: string;
  agentId: string;
  title: string;

  sourceType?: string;
  originalIssue?: string;
  maskedInput?: string;
  generatedDraft?: string;
  summary?: string;

  modelId?: string;
  route?: 'LOCAL' | 'HYBRID' | 'CLOUD' | 'HUMAN' | 'MOCK';
  latency?: number;
  fallbackUsed?: boolean;
  piiRemoved?: boolean;

  riskLevel?: TaskRiskLevel;
  approvalStatus?: 'none' | 'waiting' | 'approved' | 'rejected';

  referencedKnowledge?: string[];
  createdAt: string;
}
