import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { resolveResource } from '../_shared/godomallResource.js';

// GET /api/godomall/inventory — Goods_Search.php 응답에서 재고 파생 (real/sandbox) 또는 mock fallback.
export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  try {
    const resolved = await resolveResource('inventory');
    sendOkResponse(res, {
      records: resolved.records,
      maskedPiiCount: resolved.maskedCount,
      mode: resolved.mode,
      sourceType: resolved.source,
      errorMessage: resolved.errorMessage
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch inventory via proxy: ${errMsg}`, 500);
  }
}
