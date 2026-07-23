// 매출 분석용 주문 데이터 모델 + 변환기 (RevenueOrder / RevenueOrderLine v0)
//
// 용도: 상품관리팀 매출 대시보드(상품별/카테고리별/기간별/판매수량/배송비 분리).
// A안: 표시용 StandardOrderAdmin / orders-admin 은 건드리지 않고 별도로 신설한다.
// 기준 문서: docs/ORDERS_STATUS_AND_REVENUE_DESIGN.md (§4 매출기준, §5 타입, §6 TODO, §7 v0 범위)
//
// 보안: 이 모델은 매출 분석용이므로 고객 개인정보(이름/연락처/주소 등) 필드를 포함하지 않는다.

import type { StandardProduct } from './godomallMapper.js';

type Raw = Record<string, unknown>;

// DATA-SOURCE-SERVER-01: 실제 / 시뮬레이션 / 명시적 시험 fixture 를 서로 구별한다.
//   'fixture_mock' 은 사용자가 시험(mock) 모드를 **명시적으로 선택**했을 때만 쓰이며,
//   자동 대체로 실제 자리에 들어가지 않는다(그 경우는 아예 0건 + unavailable).
export type RevenueDataSource = 'real_godomall' | 'synthetic_test' | 'fixture_mock';

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
  // ── 마케팅 enrichment 가산 필드 (Spec-Based Synthetic Enrichment v0, optional·하위호환) ──
  // 라인 단위 할인(주문에 "반영된 결과"만 보존, 정책/원장 아님). real은 raw에 있을 때만 채워짐.
  goodsDiscountAmount?: number;        // goodsDcPrice (라인 상품 할인)
  couponGoodsDiscountAmount?: number;  // couponGoodsDcPrice (라인 상품쿠폰 할인)
  couponOrderDiscountShareAmount?: number; // 주문쿠폰의 라인 안분 금액
};

// 클레임 요약 (Commerce Data Contract v0) — raw claimData를 그대로 노출하지 않고 축약한다.
export type RevenueClaimType = 'cancel' | 'refund' | 'return' | 'exchange';
export type RevenueClaimSummary = {
  hasClaim: boolean;
  claimTypes: RevenueClaimType[];
  claimAmount?: number; // 환불/클레임 금액 합(있을 때)
  // 코드/라벨: raw에 코드가 없거나 Code_Search 미연결이면 undefined (다음 단계 라벨 연결)
  claimReasonCode?: string;
  claimReasonLabel?: string;
  claimPaymentCode?: string;
  claimPaymentLabel?: string;
  claimBankCode?: string;
  claimBankLabel?: string;
};

// 할인 요약 (Spec-Based Synthetic Enrichment v0) — 주문에 "반영된 할인 결과"만 축약한다.
// 근거: Order_Search 스펙의 totalGoodsDcPrice/totalMemberDcPrice/totalCoupon*DcPrice.
// 정책/쿠폰원장이 아니라 "이 주문에서 얼마가 할인됐나"의 결과값만 보존(마케팅 분석용).
export type RevenueDiscountSummary = {
  totalGoodsDiscountAmount: number;          // totalGoodsDcPrice (상품 할인)
  totalMemberDiscountAmount: number;         // totalMemberDcPrice (회원/등급 할인)
  totalCouponGoodsDiscountAmount: number;    // totalCouponGoodsDcPrice
  totalCouponOrderDiscountAmount: number;    // totalCouponOrderDcPrice
  totalCouponDeliveryDiscountAmount: number; // totalCouponDeliveryDcPrice
  totalCouponDiscountAmount: number;         // 쿠폰 할인 합(goods+order+delivery)
  totalDiscountAmount: number;               // 전체 할인 합(상품+회원+쿠폰)
  hasCoupon: boolean;                        // 쿠폰 할인 발생 주문 여부
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
  // ── 분석용 가산 필드 (Commerce Data Contract v0, 전부 optional·하위호환) ──
  // PII(이름/전화/이메일/주소)는 절대 싣지 않는다. 고객 식별은 가명 memberKey만.
  memberKey?: string;             // 가명 분석키 (real=해시, synthetic=syn_member_*)
  isFirstPurchase?: boolean;      // firstSaleFl 기반
  settleKind?: string;            // 결제수단 코드 원본 (settleKind)
  paymentMethodCode?: string;     // = settleKind (명시 별칭)
  paymentMethodLabel?: string;    // Code_Search 연결 전이면 undefined
  orderChannel?: string;          // 주문채널 코드 (orderChannelFl)
  orderChannelLabel?: string;     // 연결 전이면 undefined
  claimSummary?: RevenueClaimSummary;
  // ── 마케팅 enrichment 가산 필드 (Spec-Based Synthetic Enrichment v0, optional·하위호환) ──
  memberGroupName?: string;       // 회원그룹명 (memGroupNm)
  memberGroupCode?: string;       // 회원그룹 코드 (memGroupNo)
  discountSummary?: RevenueDiscountSummary; // 주문에 반영된 할인 결과(쿠폰/등급/상품)
  useMileageAmount?: number;      // 주문 시 사용한 마일리지 (useMileage)
  useDepositAmount?: number;      // 주문 시 사용한 예치금 (useDeposit)
  // 금액 관계(할인/리워드 보유 주문에만 채워짐): grossAmount − discountAmount − rewardUseAmount === totalAmount
  grossAmount?: number;           // 할인 전 = (상품매출 + 배송비)
  discountAmount?: number;        // = discountSummary.totalDiscountAmount (+배송쿠폰)
  rewardUseAmount?: number;       // = useMileageAmount + useDepositAmount
  dataKind?: 'real' | 'synthetic' | 'mock';                 // sourceType 파생(표기용)
  syntheticSource?: 'legacy' | 'godoRaw' | 'commerce_universe_v1'; // 생성 경로(resolver가 stamp)
  // Baseline Year Synthetic Expansion v0 — synthetic 전용 테스트 metadata(고도몰 원본 API 필드 아님).
  syntheticScenario?: 'baseline_no_promotion' | 'promotion_year';
  syntheticYearLabel?: 'baseline' | 'promotion';
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
// 날짜필드 위치(공식 스펙): paymentDt는 order_data 헤더, invoice/delivery/finish/cancel은
// orderGoodsData(라인)에 위치한다. 따라서 헤더에서 먼저 찾고, 없으면 첫 주문상품 라인에서
// 보강한다(순수 가산 폴백 — 헤더에 값이 있으면 기존 동작 그대로, 라인 전용일 때만 추가 해석).
// 부분취소 등 라인별 상태 상이 케이스는 v0에서 "첫 라인" 대표값을 쓴다(주문 단위 granularity).
export const deriveOrderState = (order: Raw): RevenueOrderState => {
  const firstLine: Raw | undefined = normalizeLines(order['orderGoodsData'])[0];
  // 헤더 우선, 없으면 첫 라인에서 동일 키 보강
  const dateOf = (key: string): unknown => {
    if (isValidDate(order[key])) return order[key];
    return firstLine ? firstLine[key] : undefined;
  };
  const orderStatus = str(order['orderStatus']) || (firstLine ? str(firstLine['orderStatus']) : '');
  // o1(입금대기/미결제, 실측 확정)이면 결제완료로 보지 않는다. 그 외엔 paymentDt 유효성 기준.
  const paid = isValidDate(dateOf('paymentDt')) && orderStatus !== 'o1';
  const shipped = isValidDate(dateOf('invoiceDt')) || isValidDate(dateOf('deliveryDt'));
  const delivered = isValidDate(dateOf('deliveryCompleteDt'));
  const confirmed = isValidDate(dateOf('finishDt'));
  const canceled = isValidDate(dateOf('cancelDt'));
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

  // 라인 할인(주문 반영 결과) — raw에 키가 있을 때만 가산(real 미보유 시 undefined 유지)
  const lineDiscount: Partial<RevenueOrderLine> = {};
  if ('goodsDcPrice' in g) lineDiscount.goodsDiscountAmount = num(g['goodsDcPrice']);
  if ('couponGoodsDcPrice' in g) lineDiscount.couponGoodsDiscountAmount = num(g['couponGoodsDcPrice']);
  if ('couponOrderDcShare' in g || 'divisionCouponOrderDcPrice' in g)
    lineDiscount.couponOrderDiscountShareAmount = num(g['couponOrderDcShare'] ?? g['divisionCouponOrderDcPrice']);

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
      productMatched: true,
      ...lineDiscount
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
    productMatched: false,
    ...lineDiscount
  };
};

// raw 헤더의 할인 필드 → RevenueDiscountSummary (할인 키가 하나도 없으면 undefined).
const DISCOUNT_KEYS = [
  'totalGoodsDcPrice',
  'totalMemberDcPrice',
  'totalCouponGoodsDcPrice',
  'totalCouponOrderDcPrice',
  'totalCouponDeliveryDcPrice'
] as const;
const deriveDiscountSummary = (order: Raw): RevenueDiscountSummary | undefined => {
  if (!DISCOUNT_KEYS.some((k) => k in order)) return undefined;
  const goods = num(order['totalGoodsDcPrice']);
  const member = num(order['totalMemberDcPrice']);
  const couponGoods = num(order['totalCouponGoodsDcPrice']);
  const couponOrder = num(order['totalCouponOrderDcPrice']);
  const couponDelivery = num(order['totalCouponDeliveryDcPrice']);
  const totalCoupon = couponGoods + couponOrder + couponDelivery;
  const total = goods + member + totalCoupon;
  return {
    totalGoodsDiscountAmount: goods,
    totalMemberDiscountAmount: member,
    totalCouponGoodsDiscountAmount: couponGoods,
    totalCouponOrderDiscountAmount: couponOrder,
    totalCouponDeliveryDiscountAmount: couponDelivery,
    totalCouponDiscountAmount: totalCoupon,
    totalDiscountAmount: total,
    hasCoupon: totalCoupon > 0
  };
};

// ── 분석용 가명 식별키 (memNo/memId 원문 비노출) ──────────────────────────────
// real: 안정적 해시(real_member_*), synthetic: 식별 가능한 syn_member_*. 빈값이면 undefined.
const fnv1a = (s: string): string => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};
export const buildMemberKey = (rawId: string, sourceType: RevenueDataSource): string | undefined => {
  const id = str(rawId);
  if (!id || id === '0') return undefined; // 비회원/식별불가
  if (sourceType === 'synthetic_test') return `syn_member_${id}`;
  if (sourceType === 'fixture_mock') return `fixture_member_${id}`;
  return `real_member_${fnv1a(id)}`; // real은 가명 해시 (원문 미노출)
};

// handleMode 코드 → 클레임 타입
const CLAIM_MODE_MAP: Record<string, RevenueClaimType> = { c: 'cancel', r: 'refund', b: 'return', e: 'exchange', z: 'exchange' };

// raw claimData(라인 내부) + cancelDt → claimSummary 축약 (raw 전체는 노출하지 않음)
const deriveClaimSummary = (order: Raw, lines: Raw[]): RevenueClaimSummary | undefined => {
  const types = new Set<RevenueClaimType>();
  let claimAmount = 0;
  let sawClaim = false;
  for (const g of lines) {
    for (const c of normalizeLines(g['claimData'])) {
      sawClaim = true;
      const mode = str(c['handleMode']).toLowerCase();
      const t = CLAIM_MODE_MAP[mode];
      if (t) types.add(t);
      const amt = num(c['refundPrice']);
      if (amt) claimAmount += amt;
    }
  }
  // 주문 헤더 취소일자도 취소 클레임으로 본다
  if (isValidDate(order['cancelDt'])) {
    types.add('cancel');
    sawClaim = true;
  }
  if (!sawClaim && types.size === 0) return undefined;
  return {
    hasClaim: sawClaim || types.size > 0,
    claimTypes: [...types],
    ...(claimAmount > 0 ? { claimAmount } : {})
    // claimReason/Payment/Bank 코드·라벨: raw에 코드 없음/Code_Search 미연결 → undefined (다음 단계)
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

    // ── 분석용 가산 필드 (raw에서 파생, PII 비노출) ──
    const memberKey = buildMemberKey(str(o['memNo']) || str(o['memId']), sourceType);
    const firstSaleRaw = str(o['firstSaleFl']);
    const isFirstPurchase = 'firstSaleFl' in o ? firstSaleRaw.toLowerCase() === 'y' : undefined;
    const settleKind = str(o['settleKind']) || undefined;
    const orderChannel = str(o['orderChannelFl']) || undefined;
    const claimSummary = deriveClaimSummary(o, lines);
    const dataKind: 'real' | 'synthetic' | 'mock' =
      sourceType === 'synthetic_test' ? 'synthetic' : sourceType === 'fixture_mock' ? 'mock' : 'real';

    // ── 마케팅 enrichment: 회원그룹 / 할인 / 마일리지·예치금 (raw 보유 시에만) ──
    const memberGroupName = str(o['memGroupNm']) || undefined;
    const memberGroupCode = str(o['memGroupNo']) || undefined;
    const discountSummary = deriveDiscountSummary(o);
    const useMileageAmount = 'useMileage' in o ? num(o['useMileage']) || undefined : undefined;
    const useDepositAmount = 'useDeposit' in o ? num(o['useDeposit']) || undefined : undefined;

    const productRevenueByLines = revLines.reduce((s, l) => s + l.lineRevenue, 0);
    const productRevenueByHeader = num(o['totalGoodsPrice'] ?? o['amount'] ?? '0');
    const deliveryFee = num(o['totalDeliveryCharge'] ?? o['deliveryCharge'] ?? '0');
    const totalAmount = num(o['settlePrice'] ?? o['amount'] ?? '0') || productRevenueByLines + deliveryFee;
    const revenueMismatch =
      productRevenueByHeader > 0 && productRevenueByLines > 0 && productRevenueByHeader !== productRevenueByLines;

    // 금액 관계(할인/리워드 보유 주문에만): grossAmount − discountAmount − rewardUseAmount === totalAmount
    const rewardUseAmount = (useMileageAmount || 0) + (useDepositAmount || 0) || undefined;
    const hasMoneyEnrichment = !!discountSummary || rewardUseAmount !== undefined;
    const grossBase = (productRevenueByHeader > 0 ? productRevenueByHeader : productRevenueByLines) + deliveryFee;
    const grossAmount = hasMoneyEnrichment ? grossBase : undefined;
    const discountAmount = discountSummary ? discountSummary.totalDiscountAmount : undefined;

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
      lines: revLines,
      // 분석용 가산 (optional)
      ...(memberKey ? { memberKey } : {}),
      ...(isFirstPurchase !== undefined ? { isFirstPurchase } : {}),
      ...(settleKind ? { settleKind, paymentMethodCode: settleKind } : {}),
      ...(orderChannel ? { orderChannel } : {}),
      ...(claimSummary ? { claimSummary } : {}),
      // 마케팅 enrichment 가산 (optional)
      ...(memberGroupName ? { memberGroupName } : {}),
      ...(memberGroupCode ? { memberGroupCode } : {}),
      ...(discountSummary ? { discountSummary } : {}),
      ...(useMileageAmount !== undefined ? { useMileageAmount } : {}),
      ...(useDepositAmount !== undefined ? { useDepositAmount } : {}),
      ...(grossAmount !== undefined ? { grossAmount } : {}),
      ...(discountAmount !== undefined ? { discountAmount } : {}),
      ...(rewardUseAmount !== undefined ? { rewardUseAmount } : {}),
      dataKind
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
