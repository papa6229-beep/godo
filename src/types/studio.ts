import type { TaskPermission, TaskRiskLevel, RouteType } from './task';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: string;
  recommendedAgents: string[];
  requiredKnowledgeIds?: string[];
  defaultPermission?: TaskPermission;
  routeType?: RouteType;
  riskLevel?: TaskRiskLevel;
}

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  category: string;
  permission: TaskPermission;
  riskLevel: TaskRiskLevel;
  availableAgentIds: string[];
  isEnabled: boolean;
}

export interface PermissionMatrixItem {
  id: string;
  taskName: string;
  description: string;
  currentPermission: TaskPermission;
  riskLevel: TaskRiskLevel;
  relatedAgentIds: string[];
}
