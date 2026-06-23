import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { resolveResource } from '../_shared/godomallResource.js';
import type { ResourceType } from '../_shared/godomallResource.js';

interface ExtendedRequest extends IncomingMessage {
  body?: {
    resourceType?: string;
    mode?: string;
  };
}

const VALID_RESOURCES: ResourceType[] = ['orders', 'inquiries', 'reviews', 'inventory', 'sales', 'products'];

// POST /api/godomall/sync
// 모드(real/sandbox/mock)는 서버 환경변수(GODOMALL_API_MODE)가 권위를 가진다.
// real/sandbox 실패 시 자동으로 mock fallback. source로 출처를 명시한다.
export default async function handler(req: ExtendedRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only POST is accepted.', 405);
  }

  const body = req.body || {};
  const resourceType = (body.resourceType || 'all') as string;

  try {
    if (resourceType === 'all') {
      const resources: ResourceType[] = ['orders', 'inquiries', 'reviews', 'inventory', 'sales'];
      const resolved = await Promise.all(resources.map((r) => resolveResource(r)));

      const records: Record<string, unknown> = {};
      let importedCount = 0;
      let maskedPiiCount = 0;
      const sources: Record<string, string> = {};
      let anyLive = false;
      const errors: string[] = [];

      resources.forEach((r, i) => {
        const res0 = resolved[i];
        records[r] = res0.records;
        importedCount += res0.count;
        maskedPiiCount += res0.maskedCount;
        sources[r] = res0.source;
        if (res0.live) anyLive = true;
        if (res0.errorMessage) errors.push(`${r}: ${res0.errorMessage}`);
      });

      // 대표 sourceType: 하나라도 라이브면 그 모드, 아니면 fallback
      const primaryMode = resolved[0]?.mode || 'mock';
      const sourceType = anyLive
        ? (primaryMode === 'real' ? 'api_proxy_real' : 'api_proxy_sandbox')
        : 'api_mock_fallback';

      return sendOkResponse(res, {
        resourceType: 'all',
        records,
        importedCount,
        maskedPiiCount,
        warningCount: 0,
        mode: primaryMode,
        sourceType,
        sources,
        errorMessage: errors.length > 0 ? errors.join(' | ') : undefined
      });
    }

    if (!VALID_RESOURCES.includes(resourceType as ResourceType)) {
      return sendErrorResponse(res, 'INVALID_RESOURCE', `Resource type [${resourceType}] is not supported.`, 400);
    }

    const resolved = await resolveResource(resourceType as ResourceType);

    return sendOkResponse(res, {
      resourceType,
      records: resolved.records,
      importedCount: resolved.count,
      maskedPiiCount: resolved.maskedCount,
      warningCount: 0,
      mode: resolved.mode,
      sourceType: resolved.source,
      errorMessage: resolved.errorMessage
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'SYNC_ERROR', `Internal Proxy Sync Error: ${errMsg}`, 500);
  }
}
