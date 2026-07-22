import type { ApiResourceType } from '../types/apiBridge';
import type { ProxyHealthResponse, ProxySyncResponse } from '../types/proxy';
import { runMockSync } from './mockGodomallApi';
import { resolveFetchOutcome, type ProvenanceKind } from './dataSourceProvenanceContract';

// 프록시 API 호출 실패 시 활용할 로컬 폴백 판단용 에러 클래스
class ProxyConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyConnectionError';
  }
}

// 1. 프록시 서버 헬스 체크
export const checkProxyHealth = async (): Promise<ProxyHealthResponse> => {
  try {
    const res = await fetch('/api/godomall/health');
    if (!res.ok) {
      throw new ProxyConnectionError(`Proxy health returned status ${res.status}`);
    }
    return await res.json() as ProxyHealthResponse;
  } catch {
    // 실패 시 로컬 가상 헬스 데이터 반환 (Fallback)
    return {
      ok: false,
      timestamp: new Date().toISOString(),
      source: 'local_fallback',
      mode: 'mock',
      status: 'error_fallback',
      hasPartnerKey: false,
      hasUserKey: false,
      hasRealBaseUrl: false,
      hasSandboxBaseUrl: false,
      secrets: {
        hasApiKey: false,
        hasApiSecret: false,
        hasBaseUrl: false,
        productionLocked: false,
        mode: 'mock',
        hasPartnerKey: false,
        hasUserKey: false,
        hasRealBaseUrl: false,
        hasSandboxBaseUrl: false
      },
      resources: ['orders', 'inquiries', 'reviews', 'inventory', 'sales', 'products'],
      safetyRules: [
        'Secure Proxy API is offline. Using local mock adapter fallback.',
        'No credentials exposed to browser.'
      ]
    };
  }
};

// 2. 프록시 리소스 동기화 (Sync)
export interface SecureProxySyncResult {
  rawItems: Record<string, string>[];
  importedCount: number;
  maskedPiiCount: number;
  warningCount: number;
  isFallback: boolean;
  sourceType: string;
  errorMessage?: string;
  /** C-출처(GREEN3): 이 결과의 신분. real 요청 실패 시 unavailable. */
  provenanceKind?: ProvenanceKind;
  /** C-출처(GREEN3): mock 자동 대체를 막았는지(real 모드 실패 시 true). */
  substitutionBlocked?: boolean;
}

export const syncProxyResource = async (
  resourceType: ApiResourceType | 'all',
  // C-출처(GREEN3): 실제 자료 요청이 기본. real 모드에서 실패/미구현 시 mock 자동 대체를 차단한다.
  //   시험 데이터는 사용자가 'test' 모드를 명시적으로 선택했을 때만 사용한다.
  requestedMode: 'real' | 'test' = 'real'
): Promise<SecureProxySyncResult> => {
  try {
    const res = await fetch('/api/godomall/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resourceType,
        // 모드는 서버 환경변수(GODOMALL_API_MODE)가 권위를 가짐
        mode: 'auto'
      })
    });

    if (!res.ok) {
      throw new ProxyConnectionError(`Proxy sync failed with status ${res.status}`);
    }

    const data = (await res.json()) as ProxySyncResponse;

    // sync API 응답의 records 구조 파싱
    let rawItems: Record<string, string>[] = [];
    if (resourceType === 'all') {
      // 'all'인 경우 records가 객체 구조임 ({ orders: [...], inquiries: [...] })
      rawItems = []; // 개별 스토어 적재용
    } else {
      rawItems = (data.records || []) as unknown as Record<string, string>[];
    }

    // 서버가 real/sandbox 호출에 실패해 mock으로 대체한 경우도 fallback으로 표시
    const serverFellBack = data.sourceType === 'api_mock_fallback';

    // C-출처(GREEN3): real 요청 + 서버 mock 대체 → mock을 통계에 주입하지 않고 연결 안 됨으로 표시.
    const outcome = resolveFetchOutcome({
      requestedMode,
      serverSourceType: data.sourceType,
      serverRecords: rawItems,
      errorMessage: data.errorMessage,
      mockRecords: rawItems
    });
    return {
      rawItems: outcome.records as Record<string, string>[],
      importedCount: outcome.substitutionBlocked ? 0 : data.importedCount,
      maskedPiiCount: data.maskedPiiCount,
      warningCount: data.warningCount,
      isFallback: serverFellBack,
      sourceType: data.sourceType || 'api_mock_fallback',
      errorMessage: outcome.errorMessage ?? data.errorMessage,
      provenanceKind: outcome.kind,
      substitutionBlocked: outcome.substitutionBlocked
    };
  } catch {
    // C-출처(GREEN3): Secure Proxy 연결 실패.
    //   - real 모드: mock으로 자동 대체하지 않는다(운영 통계 투입 금지) → 연결 안 됨.
    //   - test 모드: 사용자가 시험 데이터를 명시 선택한 경우에만 로컬 mock 사용.
    const mockRecords = requestedMode === 'test'
      ? (resourceType === 'all' ? [] : (await runMockSync(resourceType)).rawItems)
      : [];
    const outcome = resolveFetchOutcome({
      requestedMode,
      networkFailed: true,
      mockRecords,
      errorMessage: 'Secure Proxy unreachable.'
    });
    return {
      rawItems: outcome.records as Record<string, string>[],
      importedCount: outcome.records.length,
      maskedPiiCount: 0,
      warningCount: 0,
      isFallback: true,
      sourceType: outcome.substitutionBlocked ? 'unavailable' : 'api_mock_fallback',
      errorMessage: outcome.substitutionBlocked
        ? 'Secure Proxy unreachable. 연결 안 됨(자동 대체 차단).'
        : 'Secure Proxy unreachable. 시험 모드 mock 사용.',
      provenanceKind: outcome.kind,
      substitutionBlocked: outcome.substitutionBlocked
    };
  }
};

// 3. 개별 리소스 직접 조회 API (GET /api/godomall/*)
export const fetchProxyOrders = async (): Promise<Record<string, string>[]> => {
  try {
    const res = await fetch('/api/godomall/orders');
    if (!res.ok) throw new ProxyConnectionError(`Fetch proxy orders returned ${res.status}`);
    const data = await res.json();
    return (data.records || []) as Record<string, string>[];
  } catch {
    // Fallback
    const res = await runMockSync('orders');
    return res.rawItems;
  }
};

export const fetchProxyInquiries = async (): Promise<Record<string, string>[]> => {
  try {
    const res = await fetch('/api/godomall/inquiries');
    if (!res.ok) throw new ProxyConnectionError(`Fetch proxy inquiries returned ${res.status}`);
    const data = await res.json();
    return (data.records || []) as Record<string, string>[];
  } catch {
    // Fallback
    const res = await runMockSync('inquiries');
    return res.rawItems;
  }
};

export const fetchProxyReviews = async (): Promise<Record<string, string>[]> => {
  try {
    const res = await fetch('/api/godomall/reviews');
    if (!res.ok) throw new ProxyConnectionError(`Fetch proxy reviews returned ${res.status}`);
    const data = await res.json();
    return (data.records || []) as Record<string, string>[];
  } catch {
    // Fallback
    const res = await runMockSync('reviews');
    return res.rawItems;
  }
};

export const fetchProxyInventory = async (): Promise<Record<string, string>[]> => {
  try {
    const res = await fetch('/api/godomall/inventory');
    if (!res.ok) throw new ProxyConnectionError(`Fetch proxy inventory returned ${res.status}`);
    const data = await res.json();
    return (data.records || []) as Record<string, string>[];
  } catch {
    // Fallback
    const res = await runMockSync('inventory');
    return res.rawItems;
  }
};

export const fetchProxySales = async (): Promise<Record<string, string>[]> => {
  try {
    const res = await fetch('/api/godomall/sales');
    if (!res.ok) throw new ProxyConnectionError(`Fetch proxy sales returned ${res.status}`);
    const data = await res.json();
    return (data.records || []) as Record<string, string>[];
  } catch {
    // Fallback
    const res = await runMockSync('sales');
    return res.rawItems;
  }
};
