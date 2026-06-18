

// API Bridge 운영 모드 (Mock, 샌드박스, 잠긴 운영환경)
export type ApiBridgeMode = 'mock' | 'sandbox' | 'production_locked';

// API 연결 상태
export type ApiConnectionStatus = 'disconnected' | 'ready' | 'syncing' | 'error' | 'locked';

// 동기화 가능한 리소스 타입
export type ApiResourceType = 'orders' | 'inquiries' | 'reviews' | 'inventory' | 'sales' | 'products';

// 리소스 권한 수준
export type ApiPermissionLevel = 'read_only' | 'draft_only' | 'approval_required' | 'manual_only' | 'disabled';

// API Bridge 연동 공급자(Provider)
export interface ApiBridgeProvider {
  id: string;
  name: string;
  mode: ApiBridgeMode;
  status: ApiConnectionStatus;
  description: string;
  baseUrlLabel: string;
  lastSyncAt?: string;
  healthScore: number;
  permissions: Record<ApiResourceType, ApiPermissionLevel>;
}

// 동기화 작업 이력 (Sync Job)
export interface ApiSyncJob {
  id: string;
  resourceType: ApiResourceType;
  status: 'pending' | 'running' | 'success' | 'failed' | 'blocked';
  requestedAt: string;
  completedAt?: string;
  source: string;
  importedCount: number;
  maskedPiiCount: number;
  warningCount: number;
  errorMessage?: string;
}

// API Bridge 안전/보안 로그 (Safety Log)
export interface ApiBridgeLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'safety';
  message: string;
  resourceType?: ApiResourceType;
}

// API 리소스 요약 현황
export interface ApiResourceSummary {
  resourceType: ApiResourceType;
  available: boolean;
  lastSyncAt?: string;
  count: number;
  permissionLevel: ApiPermissionLevel;
  safetyNote: string;
}
