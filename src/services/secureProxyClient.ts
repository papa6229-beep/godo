import type { ApiResourceType } from '../types/apiBridge';
import type { ProxyHealthResponse, ProxySyncResponse } from '../types/proxy';
import { runMockSync } from './mockGodomallApi';

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
      secrets: {
        hasApiKey: false,
        hasApiSecret: false,
        hasBaseUrl: false,
        productionLocked: true
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
}

export const syncProxyResource = async (
  resourceType: ApiResourceType | 'all'
): Promise<SecureProxySyncResult> => {
  try {
    const res = await fetch('/api/godomall/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resourceType,
        mode: 'mock'
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
      rawItems = (data.records || []) as Record<string, string>[];
    }

    return {
      rawItems,
      importedCount: data.importedCount,
      maskedPiiCount: data.maskedPiiCount,
      warningCount: data.warningCount,
      isFallback: false,
      sourceType: data.sourceType || 'api_proxy_mock'
    };
  } catch {
    // 실패 시 기존 로컬 Mock API 어댑터로 안전하게 Fallback 처리
    if (resourceType === 'all') {
      const resources: ApiResourceType[] = ['orders', 'inquiries', 'reviews', 'inventory', 'sales'];
      let totalImported = 0;
      let totalMasked = 0;
      let totalWarning = 0;
      
      for (const resType of resources) {
        const localResult = await runMockSync(resType);
        totalImported += localResult.importedCount;
        totalMasked += localResult.maskedPiiCount;
        totalWarning += localResult.warningCount;
      }
      
      return {
        rawItems: [],
        importedCount: totalImported,
        maskedPiiCount: totalMasked,
        warningCount: totalWarning,
        isFallback: true,
        sourceType: 'api_mock'
      };
    } else {
      const localResult = await runMockSync(resourceType);
      return {
        rawItems: localResult.rawItems,
        importedCount: localResult.importedCount,
        maskedPiiCount: localResult.maskedPiiCount,
        warningCount: localResult.warningCount,
        isFallback: true,
        sourceType: 'api_mock' // 로컬 mock 소스 표시
      };
    }
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
