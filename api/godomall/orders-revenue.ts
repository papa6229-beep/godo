import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { resolveOrdersRevenue } from '../_shared/godomallResource.js';
import type { SyntheticSource } from '../_shared/godomallResource.js';

// GET /api/godomall/orders-revenue — 매출 분석용 주문 조회 (RevenueOrder v0).
//
// 상품관리팀 매출 대시보드 전용. orders-admin(표시용)과 별개의 매출 분석 구조.
// 보안: 고객 개인정보 미포함(매출 분석용), 키/raw XML 미반환, READ 전용.
export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  // ?includeSynthetic=true 일 때만 가상 매출 데이터 포함 (기본 false = 기존 동작 유지)
  // ?syntheticSource=godoRaw 면 Order_Search raw 시뮬레이터 경로 사용 (기본 'legacy' = 기존 동작)
  let includeSynthetic = false;
  let syntheticSource: SyntheticSource = 'legacy';
  try {
    const url = new URL(req.url || '', 'http://localhost');
    includeSynthetic = url.searchParams.get('includeSynthetic') === 'true';
    if (url.searchParams.get('syntheticSource') === 'godoRaw') syntheticSource = 'godoRaw';
  } catch {
    // 파싱 실패 시 기본값 유지
  }

  try {
    const resolved = await resolveOrdersRevenue({ includeSynthetic, syntheticSource });
    sendOkResponse(res, {
      mode: resolved.mode,
      live: resolved.live,
      count: resolved.count,
      orders: resolved.orders,
      summary: resolved.summary,
      stockImpact: resolved.stockImpact,
      errorMessage: resolved.errorMessage
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch revenue orders via proxy: ${errMsg}`, 500);
  }
}
