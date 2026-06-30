import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { resolveResource } from '../_shared/godomallResource.js';
import type { ResourceType } from '../_shared/godomallResource.js';

// ────────────────────────────────────────────────────────────────────────────
// /api/godomall/[resource] — Vercel demo gateway adapter (route entry 1개로 통합)
//
// URL은 그대로 유지된다(프론트 변경 없음): GET /api/godomall/{orders|inquiries|reviews|inventory|sales}
//   구 orders.ts / inquiries.ts / reviews.ts / inventory.ts / sales.ts 어댑터를 단일 entry로 통합.
//   실제 도메인 로직(real/sandbox→mock fallback, PII 마스킹)은 _shared/godomallResource(resolveResource)에 그대로 보존.
//   응답 shape도 기존과 동일(records/maskedPiiCount/mode/sourceType/errorMessage).
//
// ★ health/products/orders-admin/orders-revenue/sync/read 는 별도 정적 route로 유지(정적 우선 매칭).
//   이 gateway는 위 5개 리소스만 처리, 그 외는 404. WRITE 미허용(GET only).
// ────────────────────────────────────────────────────────────────────────────

const GATEWAY_RESOURCES: ReadonlySet<string> = new Set(['orders', 'inquiries', 'reviews', 'inventory', 'sales']);

const resourceOf = (req: IncomingMessage): string => {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return '';
  }
};

export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  const resource = resourceOf(req);
  if (!GATEWAY_RESOURCES.has(resource)) {
    return sendErrorResponse(res, 'UNKNOWN_RESOURCE', `Unknown godomall resource: ${resource}`, 404);
  }

  try {
    const resolved = await resolveResource(resource as ResourceType);
    sendOkResponse(res, {
      records: resolved.records,
      maskedPiiCount: resolved.maskedCount,
      mode: resolved.mode,
      sourceType: resolved.source,
      errorMessage: resolved.errorMessage
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch ${resource} via proxy: ${errMsg}`, 500);
  }
}
