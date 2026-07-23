import type { OperationArtifact } from './operationArtifact';

// RC-2: 취소·부분완료를 표현한다(기존 값은 그대로 — 하위호환).
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'needs_approval' | 'failed'
  | 'partially_completed' | 'cancelled' | 'not_adopted' | 'returned';

export type TaskRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type TaskPermission = 'auto' | 'draft_only' | 'approval_required' | 'manual_only';

export type RouteType = 'local' | 'cloud' | 'hybrid' | 'human';

export interface OperationTask {
  id: string;
  /** RC-2: 한 업무 흐름 전체(부모·자식·revision 공유). 제안 시점에 확정. */
  correlationId?: string;
  parentTaskId?: string;
  revisionOfTaskId?: string;
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
  artifacts?: OperationArtifact[];
  approvalItemIds?: string[];
}

