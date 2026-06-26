import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getGodomallConfig, isLiveMode, postGodomall } from '../_shared/godomallOpenApiClient.js';
import { parseGodomallXml, extractList } from '../_shared/godomallXmlParser.js';
import { mapGoodsToProducts } from '../_shared/godomallMapper.js';
import { buildProductIndex, mapOrdersToRevenue, summarizeRevenue } from '../_shared/godomallRevenue.js';
import { auditOrderSearchRawShape } from '../_shared/orderRawAudit.js';
import { normalizeOrderData } from '../_shared/godomallOrderNormalize.js';
import { ADMIN_ORDER_LIST_KEYS, GOODS_LIST_KEYS } from '../_shared/godomallResource.js';

// GET /api/godomall/order-search-raw-audit — Order_Search 실 raw "구조 감사"(서버 전용, READ).
//
// 목적: Vercel 서버 환경변수의 (테스트몰) 키로 Order_Search.php를 호출하여 실제 raw 응답의
//       "shape"를 확인한다. 합성 generator/매퍼가 실 구조와 맞는지 검증하기 위함.
// 보안:
//   - READ 전용. Write/주문생성 절대 없음.
//   - raw JSON/XML 전체·고객 PII 원문·키를 반환하지 않는다(구조 요약만).
//   - 키는 서버 환경변수에서만 사용(godomallOpenApiClient), 응답/로그 미노출.
// 조회 옵션: ?days=365 | ?size=3 | ?startDate=YYYY-MM-DD | ?endDate=YYYY-MM-DD
//
// 주: 이 route는 1회성 감사용이다. 감사 완료 후 제거해도 무방하다.
const GOODS_SEARCH_PATH = '/goods/Goods_Search.php';
const ORDER_SEARCH_PATH = '/order/Order_Search.php';

const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'Only GET is accepted.', 405);
  }

  const config = getGodomallConfig();
  if (!isLiveMode(config)) {
    return sendErrorResponse(
      res,
      'NOT_LIVE',
      'Godomall live mode is not configured on this server (keys/mode missing).',
      503
    );
  }

  // 조회 조건 — Order_Search는 조회 기간 최대 30일 제한(code 201). days는 [1,30]로 clamp.
  let days = 30;
  let size = 3;
  let startDate: string | undefined;
  let endDate: string | undefined;
  try {
    const url = new URL(req.url || '', 'http://localhost');
    const d = parseInt(url.searchParams.get('days') || '', 10);
    const s = parseInt(url.searchParams.get('size') || '', 10);
    if (Number.isFinite(d) && d > 0) days = Math.min(d, 30);
    if (Number.isFinite(s) && s > 0) size = s;
    startDate = url.searchParams.get('startDate') || undefined;
    endDate = url.searchParams.get('endDate') || undefined;
  } catch {
    // 기본값 유지
  }
  const start = startDate || fmtDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const end = endDate || fmtDate(new Date());

  try {
    // 1) Order_Search 호출 → 파싱
    const orderRes = await postGodomall(
      ORDER_SEARCH_PATH,
      { dateType: 'order', startDate: start, endDate: end, size, sort: 'orderNo desc' },
      config
    );
    if (!orderRes.ok || !orderRes.xml) {
      return sendErrorResponse(res, 'ORDER_SEARCH_FAILED', orderRes.error || 'Order_Search failed', 502);
    }
    const parsed = parseGodomallXml(orderRes.xml);
    if (!parsed.ok) {
      // 비성공 코드는 502로 막지 않고 진단 정보를 구조화해 반환(코드/메시지는 API 상태 문자열, PII 아님).
      return sendOkResponse(res, {
        audit: 'order-search-raw-audit',
        live: true,
        serverMode: config.mode,
        query: { dateType: 'order', startDate: start, endDate: end, size, sort: 'orderNo desc' },
        apiSuccess: false,
        apiCode: parsed.code,
        apiMsg: parsed.msg,
        note: 'Order_Search returned a non-success code. (code 201 등은 권한/무데이터/파라미터 가능성)'
      });
    }

    // 2) 구조 감사 (PII 값 미포함 — 타입/위치/카운트만)
    const shape = auditOrderSearchRawShape({ code: parsed.code, msg: parsed.msg, ...parsed.root });

    // 3) mapper 호환: Products 조인 후 mapOrdersToRevenue → 요약
    // 0건 응답 phantom 가드: extractList 후보 중 "의미 있는 주문"만 매핑한다.
    const candidates = extractList(parsed.root, ADMIN_ORDER_LIST_KEYS);
    const rawOrders = normalizeOrderData(candidates);
    let products: ReturnType<typeof mapGoodsToProducts> = [];
    try {
      const goodsRes = await postGodomall(GOODS_SEARCH_PATH, { page: 1, size: 100 }, config);
      if (goodsRes.ok && goodsRes.xml) {
        const gparsed = parseGodomallXml(goodsRes.xml);
        if (gparsed.ok) products = mapGoodsToProducts(extractList(gparsed.root, GOODS_LIST_KEYS));
      }
    } catch {
      // 상품 조인 실패해도 매퍼 검증은 진행(uncategorized 처리)
    }
    const revenueOrders = mapOrdersToRevenue(rawOrders, buildProductIndex(products), 'real_godomall');
    const summary = summarizeRevenue(revenueOrders);

    const lines = revenueOrders.flatMap((o) => o.lines);
    const matchedLines = lines.filter((l) => l.productMatched).length;
    const deliverySeparated = revenueOrders.every(
      (o) => o.productRevenueByLines + o.deliveryFee === o.totalAmount || o.deliveryFee === 0 || o.totalAmount === 0
    );

    return sendOkResponse(res, {
      audit: 'order-search-raw-audit',
      live: true,
      serverMode: config.mode, // 'real' | 'sandbox' (키 값 아님)
      query: { dateType: 'order', startDate: start, endDate: end, size, sort: 'orderNo desc' },
      // ── raw 구조 요약 (PII 미포함) ──
      rawShape: shape,
      // ── 0건 응답 가드 요약 ──
      emptyGuard: {
        rawOrderCandidateCount: candidates.length, // extractList가 뽑은 후보 수
        meaningfulOrderCount: rawOrders.length, // 의미 있는 주문 수
        droppedEmptyCandidateCount: candidates.length - rawOrders.length // phantom으로 제거된 수
      },
      // ── mapper 호환 요약 ──
      mapper: {
        rawOrderCount: rawOrders.length,
        revenueOrderCount: revenueOrders.length,
        lineCount: lines.length,
        productMatchedLines: matchedLines,
        productJoinAvailable: products.length > 0,
        productCount: products.length,
        states: {
          paid: summary.paidOrderCount,
          unpaid: summary.unpaidOrderCount,
          confirmed: summary.confirmedOrderCount,
          canceled: summary.canceledOrderCount
        },
        revenue: {
          productRevenueByHeader: summary.productRevenueByHeader,
          productRevenueByLines: summary.productRevenueByLines,
          deliveryFeeTotal: summary.deliveryFeeTotal,
          totalAmount: summary.totalAmount,
          deliverySeparatedOk: deliverySeparated
        }
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return sendErrorResponse(res, 'AUDIT_ERROR', `Raw audit failed: ${msg}`, 500);
  }
}
