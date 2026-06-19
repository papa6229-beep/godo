export type EngineMode = 'demo' | 'local_first' | 'cloud_first' | 'hybrid_auto' | 'manual_control';

export type EngineProviderType = 'local' | 'cloud' | 'human';

export interface EngineProvider {
  id: string;
  name: string;
  type: EngineProviderType;
  description: string;
  status: 'connected' | 'disconnected' | 'mock' | 'disabled' | 'no_model' | 'error';
  provider: 'lm_studio' | 'ollama' | 'gemini' | 'claude' | 'openai' | 'human';
  modelName: string;
  endpoint: string;
  isEnabled: boolean;
  isDefault: boolean;
  privacyLevel: 'safe' | 'caution' | 'restricted';
  estimatedCostLevel: 'free' | 'low' | 'medium' | 'high';
  latencyLevel: 'fast' | 'normal' | 'slow';
  supportedTaskTypes: string[];
  lastLatency?: number;
  lastTestTime?: string;
}

export interface EngineRoutingRule {
  id: string;
  name: string;
  description: string;
  taskType: string;
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  complexity: 'low' | 'medium' | 'high';
  dataScope: 'public' | 'internal' | 'customer_sensitive' | 'financial';
  preferredRoute: 'local' | 'cloud' | 'hybrid' | 'human';
  fallbackRoute: 'local' | 'cloud' | 'hybrid' | 'human';
  requiredPermission: 'auto' | 'draft_only' | 'approval_required' | 'manual_only';
  enabled: boolean;
}

export interface EngineUsageLog {
  id: string;
  timestamp: string;
  taskId: string;
  taskTitle: string;
  agentId: string;
  routeType: 'local' | 'cloud' | 'hybrid' | 'human';
  providerId: string;
  modelName: string;
  reason: string;
  status: 'routed' | 'completed' | 'fallback' | 'blocked';
}

export interface EngineSafetyRule {
  id: string;
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiredPermission: 'auto' | 'draft_only' | 'approval_required' | 'manual_only';
  isEnabled: boolean;
}
