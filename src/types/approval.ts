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
}
