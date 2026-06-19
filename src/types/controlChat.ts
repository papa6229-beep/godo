import type { OperationArtifact } from './operationArtifact';

export type ControlChatIntent =
  | 'small_talk'
  | 'operation_question'
  | 'start_operation'
  | 'agent_delegation_request'
  | 'approval_command'
  | 'settings_change_request'
  | 'sensitive_action_request'
  | 'confirmed_action_request'
  | 'unknown';

export interface ControlTaskCandidate {
  title: string;
  agentId: string;
  taskType: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  approvalRequired: boolean;
  suggestedAction: string;
}

export interface AgentDelegationRequest {
  id: string;
  targetAgentId: string;
  requestedBy: 'operator' | 'manager_assistant';
  instruction: string;
  taskType?: string;
  contextSummary?: string;
  createdAt: string;
}

export interface AgentDelegationResult {
  id: string;
  requestId: string;
  agentId: string;
  status: 'completed' | 'needs_more_info' | 'failed';
  summary: string;
  artifacts?: OperationArtifact[];
  approvalItemIds?: string[];
  recommendedNextAction?: string;
  createdAt: string;
}

export type ActionExecutionStatus =
  | 'executable_now'
  | 'missing_required_fields'
  | 'api_not_connected'
  | 'requires_confirmation'
  | 'blocked_by_permission'
  | 'executed'
  | 'recorded_for_later';

export interface ActionPlan {
  id: string;
  actionType:
    | 'coupon_issue'
    | 'reply_post'
    | 'price_update'
    | 'refund_process'
    | 'product_update'
    | 'sms_send'
    | 'settings_update';
  title: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiredFields: string[];
  collectedFields: Record<string, unknown>;
  missingFields: string[];
  targetSummary?: string;
  executionStatus: ActionExecutionStatus;
  confirmationRequired: boolean;
  confirmedByOperator: boolean;
  createdAt: string;
}

export interface ControlChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  intent?: ControlChatIntent;
  relatedAgentId?: string;
  taskCandidate?: ControlTaskCandidate;
  delegationResult?: AgentDelegationResult;
  actionPlan?: ActionPlan;
  actionTriggered?: {
    type: 'start_operation' | 'approve_all' | 'approve_item' | 'update_agent_name' | 'reject_all' | 'reject_item';
    targetId?: string;
    payload?: Record<string, unknown>;
  };
}
