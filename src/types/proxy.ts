// Secure Proxy 공통 타입 정의

// Proxy Health 응답 구조
export interface ProxyHealthResponse {
  ok: boolean;
  timestamp: string;
  source: string;
  mode: string;
  status: string;
  secrets: {
    hasApiKey: boolean;
    hasApiSecret: boolean;
    hasBaseUrl: boolean;
    productionLocked: boolean;
  };
  resources: string[];
  safetyRules: string[];
}

// Proxy 동기화 요청 구조
export interface ProxySyncRequest {
  resourceType: 'orders' | 'inquiries' | 'reviews' | 'inventory' | 'sales' | 'all';
  mode: 'mock';
}

// Proxy 동기화 응답 구조
export interface ProxySyncResponse {
  ok: boolean;
  timestamp: string;
  source: string;
  mode: string;
  requestId: string;
  resourceType: string;
  records: unknown[];
  importedCount: number;
  maskedPiiCount: number;
  warningCount: number;
  sourceType: string;
}

// Proxy 개별 리소스 응답 구조
export interface ProxyResourceResponse<T = unknown> {
  ok: boolean;
  timestamp: string;
  source: string;
  mode: string;
  requestId: string;
  records: T[];
  productionLocked: boolean;
}

// Proxy 에러 응답 구조
export interface ProxyErrorResponse {
  ok: boolean;
  timestamp: string;
  source: string;
  mode: string;
  requestId: string;
  errorCode: string;
  errorMessage: string;
}

// Proxy 비밀 보안 상태 구조
export interface ProxySafetyStatus {
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasBaseUrl: boolean;
  productionLocked: boolean;
  message: string;
}
