// Secure Proxy 공통 타입 정의

// Proxy Health 응답 구조
export interface ProxyHealthResponse {
  ok: boolean;
  timestamp: string;
  source: string;
  mode: string;
  status: string;
  // top-level 편의 필드 (Godomall5 Open API)
  hasPartnerKey?: boolean;
  hasUserKey?: boolean;
  hasRealBaseUrl?: boolean;
  hasSandboxBaseUrl?: boolean;
  secrets: {
    hasApiKey: boolean;
    hasApiSecret: boolean;
    hasBaseUrl: boolean;
    productionLocked: boolean;
    // 확장 필드
    mode?: string;
    hasPartnerKey?: boolean;
    hasUserKey?: boolean;
    hasRealBaseUrl?: boolean;
    hasSandboxBaseUrl?: boolean;
  };
  resources: string[];
  safetyRules: string[];
}

// Proxy 동기화 요청 구조
export interface ProxySyncRequest {
  resourceType: 'orders' | 'inquiries' | 'reviews' | 'inventory' | 'sales' | 'products' | 'all';
  // 모드는 서버 환경변수가 권위를 가짐. 클라이언트는 'auto'로 위임.
  mode: 'auto';
}

// Proxy 동기화 응답 구조
export interface ProxySyncResponse {
  ok: boolean;
  timestamp: string;
  source: string;
  mode: string;
  requestId: string;
  resourceType: string;
  records: unknown[] | Record<string, unknown[]>;
  importedCount: number;
  maskedPiiCount: number;
  warningCount: number;
  sourceType: string;
  errorMessage?: string;
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
