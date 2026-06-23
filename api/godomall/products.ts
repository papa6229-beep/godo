import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { resolveResource } from '../_shared/godomallResource.js';

// GET /api/godomall/products — Goods_Search.php (real/sandbox) 또는 mock fallback.
// 상품 데이터는 개인정보가 없어 1차 실연결 테스트 대상으로 사용한다.
export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  try {
    const resolved = await resolveResource('products');
    sendOkResponse(res, {
      records: resolved.records,
      maskedPiiCount: resolved.maskedCount,
      mode: resolved.mode,
      sourceType: resolved.source,
      errorMessage: resolved.errorMessage
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch products via proxy: ${errMsg}`, 500);
  }
}
