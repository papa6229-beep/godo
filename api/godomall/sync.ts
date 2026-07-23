import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { resolveResource, summarizeSyncAll } from '../_shared/godomallResource.js';
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
      resources.forEach((r, i) => { records[r] = resolved[i].records; });

      // 집계는 공용 계약(summarizeSyncAll)에 위임한다 — 라우트에 복사본을 두지 않는다.
      const agg = summarizeSyncAll(resources, resolved);
      const errors = Object.entries(agg.resourceErrors).map(([r, m]) => `${r}: ${m}`);

      return sendOkResponse(res, {
        resourceType: 'all',
        records,
        importedCount: agg.importedCount,
        maskedPiiCount: agg.maskedPiiCount,
        warningCount: 0,
        mode: agg.mode,
        sourceType: agg.sourceType,
        syncStatus: agg.syncStatus,
        sources: agg.sources,
        resourceErrors: errors.length > 0 ? agg.resourceErrors : undefined,
        liveResourceCount: agg.liveResourceCount,
        unavailableResourceCount: agg.unavailableResourceCount,
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
