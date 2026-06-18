export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'needs_approval' | 'failed';

export type TaskRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type TaskPermission = 'auto' | 'draft_only' | 'approval_required' | 'manual_only';

export type RouteType = 'local' | 'cloud' | 'hybrid' | 'human';

export interface OperationTask {
  id: string;
  title: string;
  description: string;
  assignedAgentId: string;
  status: TaskStatus;
  riskLevel: TaskRiskLevel;
  permission: TaskPermission;
  routeType: RouteType;
  relatedDataType?: 'orders' | 'inquiries' | 'reviews' | 'inventory' | 'sales';
  resultSummary?: string;
  logs?: string[];
  requiredSkills?: string[];
  createdAt: string;
  completedAt?: string;
  inputCount?: number;
  dataSourceType?: string;
}
