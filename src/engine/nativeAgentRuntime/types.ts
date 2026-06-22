export type DepartmentId =
  | 'manager'
  | 'product'
  | 'cs'
  | 'marketing';

export type AgentRole =
  | 'manager'
  | 'team_lead'
  | 'team_member';

export type AgentJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed';

export type AgentResultStatus =
  | 'success'
  | 'needs_review'
  | 'blocked'
  | 'failed';

export type AgentActionRisk =
  | 'auto_safe'
  | 'draft_only'
  | 'approval_required'
  | 'manual_only';

export interface DepartmentDefinition {
  id: DepartmentId;
  name: string;
  description: string;
  leadAgentId?: string;
  memberAgentIds: string[];
  enabled: boolean;
}

export interface NativeAgentDefinition {
  id: string;
  name: string;
  departmentId: DepartmentId;
  role: AgentRole;
  title: string;
  description: string;
  skills: string[];
  modelPreference: 'local_gemma' | 'cloud_optional' | 'human_gate';
  enabled: boolean;
}

export interface AgentJob {
  id: string;
  runId: string;
  parentJobId?: string;
  departmentId: DepartmentId;
  assignedAgentId: string;
  requestedByAgentId?: string;
  title: string;
  objective: string;
  inputSummary: string;
  contextRefs: string[];
  requiredSkills: string[];
  riskLevel: AgentActionRisk;
  status: AgentJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentResult {
  id: string;
  runId: string;
  jobId: string;
  agentId: string;
  departmentId: DepartmentId;
  status: AgentResultStatus;
  summary: string;
  findings: string[];
  recommendations: string[];
  handoffTargets: DepartmentId[];
  artifacts: AgentArtifact[];
  riskFlags: string[];
  approvalRequired: boolean;
  createdAt: string;
}

export interface AgentArtifact {
  id: string;
  runId: string;
  agentId: string;
  departmentId: DepartmentId;
  type:
    | 'briefing'
    | 'cs_reply_draft'
    | 'inventory_report'
    | 'marketing_plan'
    | 'handoff_note'
    | 'approval_proposal';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  approvalRequired: boolean;
  createdAt: string;
}

export interface AgentHandoff {
  id: string;
  runId: string;
  fromDepartmentId: DepartmentId;
  toDepartmentId: DepartmentId;
  fromAgentId: string;
  toAgentId?: string;
  title: string;
  message: string;
  referencedResultIds: string[];
  createdAt: string;
}

export interface NativeAgentRun {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  objective: string;
  jobs: AgentJob[];
  results: AgentResult[];
  artifacts: AgentArtifact[];
  handoffs: AgentHandoff[];
  managerBriefing?: string;
}
