// 매출 분석용 주문 데이터 모델 + 변환기 (RevenueOrder / RevenueOrderLine v0)
//
// 용도: 상품관리팀 매출 대시보드(상품별/카테고리별/기간별/판매수량/배송비 분리).
// A안: 표시용 StandardOrderAdmin / orders-admin 은 건드리지 않고 별도로 신설한다.
// 기준 문서: docs/ORDERS_STATUS_AND_REVENUE_DESIGN.md (§4 매출기준, §5 타입, §6 TODO, §7 v0 범위)
//
// 보안: 이 모델은 매출 분석용이므로 고객 개인정보(이름/연락처/주소 등) 필드를 포함하지 않는다.

import type { StandardProduct } from './godomallMapper.js';

type Raw = Record<string, unknown>;

export type RevenueDataSource = 'real_godomall' | 'synthetic_test';

export type RevenueOrderState = {
  paid: boolean;
  unpaid: boolean;
  shipped: boolean;
  delivered: boolean;
  confirmed: boolean;
  canceled: boolean;
  refunded: boolean; // v0 미확정 — 보수적 false
  returned: boolean; // v0 미확정 — 보수적 false
};

export type RevenueOrderLine = {
  orderNo: string;
  goodsNo: string;
  goodsCd: string;
  goodsName: string;
  quantity: number;
  goodsPrice: number;   // 단가(추정) — 단가/라인합계 미확정(§4-1). v0는 ×수량으로 lineRevenue 계산.
  lineRevenue: number;  // goodsPrice × quantity
  lineOrderStatus: string;
  categoryCode?: string;
  allCategoryCode?: string;
  categoryLabel?: string;
  productMatched: boolean;
};

export type RevenueOrder = {
  orderId: string;
  orderNo: string;
  orderDate: string;
  orderStatus: string;
  paymentMethod: string;
  // 상태 판별용 날짜필드 (원본 보존)
  paymentDt: string;
  invoiceDt: string;
  deliveryDt: string;
  deliveryCompleteDt: string;
  finishDt: string;
  cancelDt: string;
  // 금액 (상품매출 / 배송비 / 총주문금액 분리)
  productRevenue: number;          // = productRevenueByLines (라인합)
  deliveryFee: number;             // totalDeliveryCharge
  totalAmount: number;             // settlePrice
  productRevenueByHeader: number;  // totalGoodsPrice (대조 기준)
  productRevenueByLines: number;   // Σ lineRevenue
  revenueMismatch: boolean;        // 헤더 vs 라인합 불일치
  sourceType: RevenueDataSource;
  state: RevenueOrderState;
  lines: RevenueOrderLine[];
};

export type RevenueSummary = {
  orderCount: number;
  lineCount: number;
  productRevenueByHeader: number;
  productRevenueByLines: number;
  deliveryFeeTotal: number;
  totalAmount: number;
  paidOrderCount: number;
  unpaidOrderCount: number;
  confirmedOrderCount: number;
  canceledOrderCount: number;
  // 실/가상 구분 (synthetic 포함 시 활용, 기본도 채워짐)
  realOrderCount: number;
  syntheticOrderCount: number;
  // 가상 재고 영향 요약 (includeSynthetic=true 일 때만 채워짐)
  syntheticTrackedProductCount?: number;
  syntheticUnlimitedProductCount?: number;
  syntheticTotalSoldQuantity?: number;
  syntheticTotalRestoredQuantity?: number;
  syntheticTotalNetSoldQuantity?: number;
};

// ── 유틸 ──────────────────────────────────────────────────────────────────
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const int = (v: unknown): number => {
  const n = parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};
const asRecord = (v: unknown): Raw | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : undefined;

// 날짜필드 유효성: 빈값 / '0000-00-00 00:00:00' / 0 류는 무효
export const isValidDate = (v: unknown): boolean => {
  const s = str(v);
  if (!s) return false;
  if (/^0000[-/.]?0?0/.test(s)) return false;
  return /[1-9]/.test(s);
};

// orderGoodsData object|array → 항상 array 정규화
export const normalizeLines = (v: unknown): Raw[] => {
  if (Array.isArray(v)) return v.map(asRecord).filter((x): x is Raw => !!x);
  const r = asRecord(v);
  return r ? [r] : [];
};

// ── 상태 판단 (날짜필드 우선, orderStatus 보조) — 실/가상 공통 순수함수 ──
export const deriveOrderState = (order: Raw): RevenueOrderState => {
  const orderStatus = str(order['orderStatus']);
  // o1(입금대기/미결제, 실측 확정)이면 결제완료로 보지 않는다. 그 외엔 paymentDt 유효성 기준.
  const paid = isValidDate(order['paymentDt']) && orderStatus !== 'o1';
  const shipped = isValidDate(order['invoiceDt']) || isValidDate(order['deliveryDt']);
  const delivered = isValidDate(order['deliveryCompleteDt']);
  const confirmed = isValidDate(order['finishDt']);
  const canceled = isValidDate(order['cancelDt']);
  return {
    paid,
    unpaid: !paid,
    shipped,
    delivered,
    confirmed,
    canceled,
    refunded: false,
    returned: false
  };
};

// ── Products 조인 인덱스 (goodsNo→product, goodsCd→product) ──
// TODO: 상품 수가 100개를 초과하면 Products 단일 페이지 fetch로는 누락 → 페이징 필요.
export interface ProductIndex {
  byId: Map<string, StandardProduct>;
  byCode: Map<string, StandardProduct>;
}
export const buildProductIndex = (products: StandardProduct[]): ProductIndex => {
  const byId = new Map<string, StandardProduct>();
  const byCode = new Map<string, StandardProduct>();
  for (const p of products) {
    if (p.productId) byId.set(p.productId, p);
    if (p.productCode) byCode.set(p.productCode, p);
  }
  return { byId, byCode };
};

// 라인 변환 + Products 조인 (goodsNo 1순위, goodsCd 보조 — 상품명 조인 금지)
const mapLine = (orderNo: string, g: Raw, index: ProductIndex): RevenueOrderLine => {
  const goodsNo = str(g['goodsNo']);
  const goodsCd = str(g['goodsCd']);
  // flat(mock) 폴백: orderGoodsData가 없을 때 상위 평문 필드도 수용
  const goodsName = str(g['goodsNm']) || str(g['goodsName']) || str(g['productName']);
  const quantity = int(g['goodsCnt'] ?? g['quantity'] ?? '1') || 1;
  const goodsPrice = num(g['goodsPrice'] ?? g['amount'] ?? '0');
  const lineRevenue = goodsPrice * quantity;
  const lineOrderStatus = str(g['orderStatus']);

  const matched =
    (goodsNo ? index.byId.get(goodsNo) : undefined) ?? (goodsCd ? index.byCode.get(goodsCd) : undefined);

  if (matched) {
    return {
      orderNo,
      goodsNo,
      goodsCd,
      goodsName: goodsName || matched.productName,
      quantity,
      goodsPrice,
      lineRevenue,
      lineOrderStatus,
      categoryCode: matched.categoryCode || 'uncategorized',
      allCategoryCode: matched.allCategoryCode || undefined,
      categoryLabel: matched.categoryCode || undefined,
      productMatched: true
    };
  }
  return {
    orderNo,
    goodsNo,
    goodsCd,
    goodsName,
    quantity,
    goodsPrice,
    lineRevenue,
    lineOrderStatus,
    categoryCode: 'uncategorized',
    categoryLabel: 'unknown_product',
    productMatched: false
  };
};

// Order_Search 주문 레코드[] → RevenueOrder[]
export const mapOrdersToRevenue = (
  orders: Raw[],
  index: ProductIndex,
  sourceType: RevenueDataSource = 'real_godomall'
): RevenueOrder[] => {
  return orders.map((o) => {
    const orderNo = str(o['orderNo']) || str(o['orderId']);
    let lines = normalizeLines(o['orderGoodsData']);
    if (lines.length === 0) lines = [o]; // flat(mock) 폴백: 상위 평문으로 단일 라인
    const revLines = lines.map((g) => mapLine(orderNo, g, index));

    const productRevenueByLines = revLines.reduce((s, l) => s + l.lineRevenue, 0);
    const productRevenueByHeader = num(o['totalGoodsPrice'] ?? o['amount'] ?? '0');
    const deliveryFee = num(o['totalDeliveryCharge'] ?? o['deliveryCharge'] ?? '0');
    const totalAmount = num(o['settlePrice'] ?? o['amount'] ?? '0') || productRevenueByLines + deliveryFee;
    const revenueMismatch =
      productRevenueByHeader > 0 && productRevenueByLines > 0 && productRevenueByHeader !== productRevenueByLines;

    return {
      orderId: str(o['orderId']) || orderNo,
      orderNo,
      orderDate: str(o['orderDate']),
      orderStatus: str(o['orderStatus']),
      paymentMethod: str(o['settleKind']),
      paymentDt: str(o['paymentDt']),
      invoiceDt: str(o['invoiceDt']),
      deliveryDt: str(o['deliveryDt']),
      deliveryCompleteDt: str(o['deliveryCompleteDt']),
      finishDt: str(o['finishDt']),
      cancelDt: str(o['cancelDt']),
      productRevenue: productRevenueByLines,
      deliveryFee,
      totalAmount,
      productRevenueByHeader,
      productRevenueByLines,
      revenueMismatch,
      sourceType,
      state: deriveOrderState(o),
      lines: revLines
    };
  });
};

export const summarizeRevenue = (orders: RevenueOrder[]): RevenueSummary => {
  let lineCount = 0;
  let byHeader = 0;
  let byLines = 0;
  let deliveryFeeTotal = 0;
  let totalAmount = 0;
  let paid = 0;
  let unpaid = 0;
  let confirmed = 0;
  let canceled = 0;
  let real = 0;
  let synthetic = 0;
  for (const o of orders) {
    lineCount += o.lines.length;
    byHeader += o.productRevenueByHeader;
    byLines += o.productRevenueByLines;
    deliveryFeeTotal += o.deliveryFee;
    totalAmount += o.totalAmount;
    if (o.state.paid) paid++;
    if (o.state.unpaid) unpaid++;
    if (o.state.confirmed) confirmed++;
    if (o.state.canceled) canceled++;
    if (o.sourceType === 'synthetic_test') synthetic++;
    else real++;
  }
  return {
    orderCount: orders.length,
    lineCount,
    productRevenueByHeader: byHeader,
    productRevenueByLines: byLines,
    deliveryFeeTotal,
    totalAmount,
    paidOrderCount: paid,
    unpaidOrderCount: unpaid,
    confirmedOrderCount: confirmed,
    canceledOrderCount: canceled,
    realOrderCount: real,
    syntheticOrderCount: synthetic
  };
};
