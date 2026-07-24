export type DepartmentId =
  | 'manager'
  | 'product'
  | 'cs'
  | 'marketing'
  | 'design';

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
  | 'partial'        // RC-2(G3): 일부 성공 — 성공/실패 이분법으로 뭉개지 않는다
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
  /** RC-2: 이 산출물이 어느 실행/작업/업무에서 나왔는지 역참조. */
  resultId?: string;
  jobId?: string;
  taskId?: string;
  correlationId?: string;
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
  /** RC-2(G4): 어느 업무 흐름의 handoff 인지 보존해 역추적을 가능하게 한다. */
  taskId?: string;
  correlationId?: string;
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
  /** RC-2(G3): 부분 실패를 표현한다. 예외가 없다는 이유만으로 completed 로 고정하지 않는다. */
  status: 'idle' | 'running' | 'completed' | 'partially_completed' | 'failed';
  /** 실패한 작업 수(0이면 완전 성공). */
  failedJobCount?: number;
  startedAt: string;
  completedAt?: string;
  objective: string;
  jobs: AgentJob[];
  results: AgentResult[];
  artifacts: AgentArtifact[];
  handoffs: AgentHandoff[];
  managerBriefing?: string;
}
