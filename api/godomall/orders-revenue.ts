import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { resolveOrdersRevenue } from '../_shared/godomallResource.js';

// GET /api/godomall/orders-revenue — 매출 분석용 주문 조회 (RevenueOrder v0).
//
// 상품관리팀 매출 대시보드 전용. orders-admin(표시용)과 별개의 매출 분석 구조.
// 보안: 고객 개인정보 미포함(매출 분석용), 키/raw XML 미반환, READ 전용.
export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  try {
    const resolved = await resolveOrdersRevenue();
    sendOkResponse(res, {
      mode: resolved.mode,
      live: resolved.live,
      count: resolved.count,
      orders: resolved.orders,
      summary: resolved.summary,
      errorMessage: resolved.errorMessage
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch revenue orders via proxy: ${errMsg}`, 500);
  }
}
