import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { resolveOrdersAdmin } from '../_shared/godomallResource.js';

// GET /api/godomall/orders-admin — Orders READ v0 (관리자 내부 운영 화면 전용).
//
// 기존 /api/godomall/orders 는 AI 파이프라인용으로 PII 마스킹된 주문을 반환한다.
// 이 라우트는 관리자가 주문 처리에 필요한 "원본 고객정보 포함" 주문을 반환한다.
// 보안: 키/raw XML은 절대 반환하지 않으며 READ 전용이다. (Write 미지원)
export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  try {
    const resolved = await resolveOrdersAdmin();
    sendOkResponse(res, {
      records: resolved.records,
      count: resolved.count,
      unpaidCount: resolved.unpaidCount,
      undeliveredCount: resolved.undeliveredCount,
      mode: resolved.mode,
      sourceType: resolved.source,
      live: resolved.live,
      errorMessage: resolved.errorMessage
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch admin orders via proxy: ${errMsg}`, 500);
  }
}
