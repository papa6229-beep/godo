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

  // ?includeSynthetic=true 일 때만 가상 매출 데이터 포함 (기본 false)
  // ?syntheticSource= : 미지정 → commerce_universe_v1(기본), legacy/godoRaw/commerce_universe_v1 명시 가능
  // ?includeUniverseAux=true : commerce_universe_v1일 때만 customers/reviews/inquiries(safe, PII 없음) 추가
  // ?includeCsFakeContacts=true : (+aux) synthetic일 때만 CS 전용 fake contact 추가 — 기본/실데이터엔 절대 없음
  let includeSynthetic = false;
  let syntheticSource: SyntheticSource | undefined;
  let includeUniverseAux = false;
  let includeCsFakeContacts = false;
  try {
    const url = new URL(req.url || '', 'http://localhost');
    includeSynthetic = url.searchParams.get('includeSynthetic') === 'true';
    const src = url.searchParams.get('syntheticSource');
    if (src === 'legacy' || src === 'godoRaw' || src === 'commerce_universe_v1') syntheticSource = src;
    includeUniverseAux = url.searchParams.get('includeUniverseAux') === 'true';
    includeCsFakeContacts = url.searchParams.get('includeCsFakeContacts') === 'true';
  } catch {
    // 파싱 실패 시 기본값(commerce_universe_v1) 유지 — resolveOrdersRevenue가 결정
  }

  try {
    const resolved = await resolveOrdersRevenue({ includeSynthetic, syntheticSource, includeUniverseAux, includeCsFakeContacts });
    sendOkResponse(res, {
      mode: resolved.mode,
      live: resolved.live,
      // DATA-SOURCE-SERVER-01: 소비자가 mode/live 로 추정하지 않도록 출처를 명시한다.
      sourceType: resolved.source,
      realOrdersStatus: resolved.realOrdersStatus,
      syntheticStatus: resolved.syntheticStatus,
      realOrdersErrorMessage: resolved.realOrdersErrorMessage,
      syntheticErrorMessage: resolved.syntheticErrorMessage,
      count: resolved.count,
      orders: resolved.orders,
      summary: resolved.summary,
      stockImpact: resolved.stockImpact,
      errorMessage: resolved.errorMessage,
      ...(resolved.universeAux ? { universeAux: resolved.universeAux } : {})
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch revenue orders via proxy: ${errMsg}`, 500);
  }
}
