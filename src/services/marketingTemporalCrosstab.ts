// Marketing Temporal Cross-Tab Analysis v0 — timeBucket × dimension × metric 범용 교차분석 엔진(순수 함수).
//
// 목적: 미리 만든 통계만 읽는 게 아니라, 이미 존재하는 주문·고객·상품·매출 데이터를 조합해
//   "월별 × 쿠폰 사용 여부 × 객단가", "연도별 × 회원그룹 × 매출" 같은 임의 교차분석을 계산한다.
//   buildMarketingAnalysisFacts(대시보드 요약)를 대체하지 않고, 시간축 교차분석을 보강한다.
//
// 원칙:
//   - 숫자는 이 엔진(순수 함수)이 계산. 외부 광고/방문/GA/SNS 데이터는 생성/추정하지 않고 requiredData 안내.
//   - PII(name/phone/email/address/memberKey) 미포함. 식별은 집계 라벨(회원그룹/채널/카테고리 등)만.
//   - 인과관계 단정 금지. 관찰 표현만("높게 나타났습니다", "해석 시 주문수 확인이 필요합니다").
//   - deterministic(Math.random 미사용). baseline/promotion은 syntheticYearLabel로 구분.

// ── 타입 ─────────────────────────────────────────────────────────────────────
export type MarketingTimeBucket = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'scenario';

export type MarketingCrossTabDimension =
  | 'couponUsage'
  | 'memberGroup'
  | 'orderChannel'
  | 'firstRepeat'
  | 'rewardUsage'
  | 'product'
  | 'category'
  | 'brand'
  | 'scenario';

export type MarketingCrossTabMetric =
  | 'revenue'
  | 'orderCount'
  | 'averageOrderValue'
  | 'discountAmount'
  | 'couponDiscountAmount'
  | 'rewardUseAmount'
  | 'quantity'
  | 'revenueShare';

export type MarketingCrossTabRequest = {
  timeBucket: MarketingTimeBucket;
  dimensions: MarketingCrossTabDimension[];
  metrics: MarketingCrossTabMetric[];
  period?: { startDate?: string; endDate?: string };
  limit?: number;
  includeEmptyBuckets?: boolean;
};

export type MarketingCrossTabRow = {
  bucketKey: string;
  bucketLabel: string;
  dimensionKey: string;
  dimensionLabel: string;
  secondaryDimensionKey?: string;
  secondaryDimensionLabel?: string;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  discountAmount: number;
  couponDiscountAmount: number;
  rewardUseAmount: number;
  quantity?: number;
  revenueSharePercent?: number;
  notes?: string[];
};

export type MarketingCrossTabTotals = {
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  discountAmount: number;
  couponDiscountAmount: number;
  rewardUseAmount: number;
};

export type MarketingCrossTabInsight = {
  id: string;
  title: string;
  summary: string;
  severity: 'info' | 'positive' | 'warning';
  evidenceIds: string[];
  recommendedNextAction?: string;
};

export type MarketingCrossTabEvidence = {
  id: string;
  label: string;
  value: string | number;
  source: 'orders' | 'orderLines' | 'products' | 'syntheticScenario' | 'derived';
};

export type MarketingCrossTabResult = {
  request: MarketingCrossTabRequest;
  bucketLabel: string;
  generatedAt: string;
  rows: MarketingCrossTabRow[];
  totals: MarketingCrossTabTotals;
  available: boolean;
  unavailableReason?: string;
  requiredData?: string[];
  insights: MarketingCrossTabInsight[];
  evidence: MarketingCrossTabEvidence[];
  piiCheck: { containsPii: boolean; checkedKeys: string[] };
};

// ── PII 정책 (결과에 절대 포함 금지) ──────────────────────────────────────────
export const MARKETING_CROSSTAB_FORBIDDEN_PII_KEYS = [
  'name',
  'customerName',
  'phone',
  'mobile',
  'email',
  'address',
  'receiverName',
  'receiverPhone',
  'receiverAddress',
  'memberKey'
] as const;
const FORBIDDEN = new Set<string>(MARKETING_CROSSTAB_FORBIDDEN_PII_KEYS);

export function assertCrosstabNoPii(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN.has(k)) found.add(k);
      visit(val, depth + 1);
    }
  };
  visit(value, 0);
  return [...found];
}

// ── 외부 데이터 필요(미계산) 키워드 → requiredData ────────────────────────────
const EXTERNAL_REQUIRED: Record<string, string[]> = {
  roas: ['adSpend', 'campaignAttribution'],
  ad_ctr: ['adClicks', 'adImpressions'],
  adctr: ['adClicks', 'adImpressions'],
  visitor_conversion: ['visitorSessions'],
  visitorconversion: ['visitorSessions'],
  product_view_conversion: ['productViewEvents'],
  productviewconversion: ['productViewEvents'],
  cart_abandonment: ['cartEvents'],
  cartabandonment: ['cartEvents'],
  ga4: ['ga4'],
  sns: ['snsMetrics']
};

// ── 유틸 ──────────────────────────────────────────────────────────────────────
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 'y' || v === 1;
const parseMs = (v: unknown): number => {
  const t = Date.parse(str(v).replace(' ', 'T'));
  return Number.isNaN(t) ? NaN : t;
};
const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;

const CHANNEL_LABEL: Record<string, string> = { shop: '자사몰', naverpay: '네이버페이', payco: '페이코' };

const LINE_DIMS = new Set<MarketingCrossTabDimension>(['product', 'category', 'brand']);
const KNOWN_DIMS = new Set<string>(['couponUsage', 'memberGroup', 'orderChannel', 'firstRepeat', 'rewardUsage', 'product', 'category', 'brand', 'scenario']);

type OrderLine = { goodsNo?: unknown; goodsName?: unknown; categoryCode?: unknown; categoryLabel?: unknown; lineRevenue?: unknown; quantity?: unknown; brandCode?: unknown };
type Order = {
  orderNo?: unknown; orderDate?: unknown; totalAmount?: unknown;
  isFirstPurchase?: unknown; memberGroupName?: unknown; memberGroupCode?: unknown;
  orderChannel?: unknown; discountSummary?: { hasCoupon?: unknown; totalCouponDiscountAmount?: unknown; totalDiscountAmount?: unknown };
  discountAmount?: unknown; useMileageAmount?: unknown; useDepositAmount?: unknown; rewardUseAmount?: unknown;
  state?: { paid?: unknown; canceled?: unknown }; paid?: unknown; canceled?: unknown;
  syntheticYearLabel?: unknown; lines?: OrderLine[];
};

const isCounted = (o: Order): boolean => {
  if (o.state && (o.state.paid !== undefined || o.state.canceled !== undefined)) return bool(o.state.paid) && !bool(o.state.canceled);
  if (o.paid !== undefined || o.canceled !== undefined) return bool(o.paid) && !bool(o.canceled);
  return num(o.totalAmount) > 0;
};
const orderDiscount = (o: Order): number => num(o.discountAmount) || num(o.discountSummary?.totalDiscountAmount);
const orderCoupon = (o: Order): number => num(o.discountSummary?.totalCouponDiscountAmount);
const orderReward = (o: Order): number => num(o.rewardUseAmount) || num(o.useMileageAmount) + num(o.useDepositAmount);
const orderQty = (o: Order): number => (o.lines || []).reduce((s, l) => s + num(l.quantity), 0);
const scenarioLabel = (o: Order): { key: string; label: string } => {
  const y = str(o.syntheticYearLabel);
  if (y === 'baseline') return { key: 'baseline', label: 'baseline(기준년도)' };
  if (y === 'promotion') return { key: 'promotion', label: 'promotion(프로모션년도)' };
  return { key: 'unknown', label: '미상' };
};

// ── time bucket key ───────────────────────────────────────────────────────────
export function getMarketingTimeBucketKey(dateLike: string | number | Date, bucket: MarketingTimeBucket): string {
  if (bucket === 'scenario') return 'scenario'; // scenario는 날짜가 아닌 syntheticYearLabel로 분기(엔진이 처리)
  const ms = dateLike instanceof Date ? dateLike.getTime() : typeof dateLike === 'number' ? dateLike : parseMs(dateLike);
  if (Number.isNaN(ms)) return 'unknown';
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = d.getMonth(); // 0-based
  const day = d.getDate();
  if (bucket === 'year') return `${y}`;
  if (bucket === 'quarter') return `${y}-Q${Math.floor(mo / 3) + 1}`;
  if (bucket === 'month') return `${y}-${String(mo + 1).padStart(2, '0')}`;
  if (bucket === 'day') return `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // week (간이 주차: 연내 일수 기준)
  const startOfYear = new Date(y, 0, 1).getTime();
  const dayOfYear = Math.floor((new Date(y, mo, day).getTime() - startOfYear) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

const BUCKET_LABEL: Record<MarketingTimeBucket, string> = {
  day: '일별', week: '주별', month: '월별', quarter: '분기별', year: '연도별', scenario: '시나리오별(baseline/promotion)'
};

// ── dimension key/label ───────────────────────────────────────────────────────
export function getMarketingDimensionKey(orderOrLine: unknown, dimension: MarketingCrossTabDimension): { key: string; label: string } {
  const r = (orderOrLine || {}) as Order & OrderLine;
  switch (dimension) {
    case 'couponUsage':
      return bool(r.discountSummary?.hasCoupon) ? { key: 'coupon', label: '쿠폰 사용' } : { key: 'non_coupon', label: '쿠폰 미사용' };
    case 'memberGroup': {
      const label = str(r.memberGroupName) || str(r.memberGroupCode) || '미분류';
      return { key: str(r.memberGroupCode) || label, label };
    }
    case 'orderChannel': {
      const code = str(r.orderChannel);
      return code ? { key: code, label: CHANNEL_LABEL[code] || code } : { key: 'unknown', label: '채널 미상' };
    }
    case 'firstRepeat':
      return bool(r.isFirstPurchase) ? { key: 'first', label: '첫구매' } : { key: 'repeat', label: '재구매' };
    case 'rewardUsage':
      return num(r.useMileageAmount) > 0 || num(r.useDepositAmount) > 0 || num(r.rewardUseAmount) > 0
        ? { key: 'reward', label: '리워드 사용' }
        : { key: 'non_reward', label: '리워드 미사용' };
    case 'scenario':
      return scenarioLabel(r as Order);
    case 'product': {
      const g = str(r.goodsNo);
      return g ? { key: g, label: str(r.goodsName) || `상품 ${g}` } : { key: 'unknown', label: '상품 미상' };
    }
    case 'category': {
      const c = str(r.categoryCode) || 'uncategorized';
      const label = str(r.categoryLabel) || (c === 'uncategorized' ? '미분류' : `카테고리 ${c}`);
      return { key: c, label };
    }
    case 'brand': {
      const b = str(r.brandCode);
      return b ? { key: b, label: `브랜드 ${b}` } : { key: 'unknown', label: '브랜드 미연동' };
    }
    default:
      return { key: 'unknown', label: '미상' };
  }
}

// ── 지원 여부 판정 ────────────────────────────────────────────────────────────
export function isMarketingCrossTabRequestSupported(request: MarketingCrossTabRequest): {
  supported: boolean;
  reason?: string;
  requiredData?: string[];
} {
  // 외부 데이터 필요 키워드(dimension/metric에 섞여 들어온 경우) → requiredData
  const tokens = [...(request.dimensions || []), ...(request.metrics || [])].map((t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const t of tokens) {
    if (EXTERNAL_REQUIRED[t]) return { supported: false, reason: `${t}는 외부 데이터가 필요해 현재 계산하지 않습니다.`, requiredData: EXTERNAL_REQUIRED[t] };
  }
  const dims = request.dimensions || [];
  if (dims.length === 0) return { supported: false, reason: '분석 축(dimension)을 1개 이상 지정하세요.' };
  if (dims.length > 2) return { supported: false, reason: 'v0는 dimension 2개까지 지원합니다(3개 이상 unsupported).' };
  for (const d of dims) if (!KNOWN_DIMS.has(String(d))) return { supported: false, reason: `알 수 없는 dimension: ${d}` };
  return { supported: true };
}

// ── metric 계산기 ─────────────────────────────────────────────────────────────
type Acc = {
  bucketKey: string; bucketLabel: string;
  dimKey: string; dimLabel: string; dim2Key?: string; dim2Label?: string;
  revenue: number; discount: number; coupon: number; reward: number; quantity: number;
  orderSet: Set<string>; lineGran: boolean;
};
export function calculateMarketingCrossTabMetric(acc: Acc, metric: MarketingCrossTabMetric, rowsRevenueTotal: number): number {
  const orderCount = acc.orderSet.size;
  switch (metric) {
    case 'revenue': return acc.revenue;
    case 'orderCount': return orderCount;
    case 'averageOrderValue': return orderCount > 0 ? Math.round(acc.revenue / orderCount) : 0;
    case 'discountAmount': return acc.discount;
    case 'couponDiscountAmount': return acc.coupon;
    case 'rewardUseAmount': return acc.reward;
    case 'quantity': return acc.quantity;
    case 'revenueShare': return rowsRevenueTotal > 0 ? +((acc.revenue / rowsRevenueTotal) * 100).toFixed(1) : 0;
    default: return 0;
  }
}

// ── 기본 요청 프리셋 ──────────────────────────────────────────────────────────
export function buildDefaultMarketingCrosstabRequests(): MarketingCrossTabRequest[] {
  return [
    { timeBucket: 'month', dimensions: ['couponUsage'], metrics: ['averageOrderValue', 'orderCount', 'revenue', 'couponDiscountAmount'] },
    { timeBucket: 'year', dimensions: ['scenario'], metrics: ['revenue', 'orderCount', 'averageOrderValue', 'couponDiscountAmount'] },
    { timeBucket: 'year', dimensions: ['memberGroup'], metrics: ['revenue', 'orderCount', 'averageOrderValue', 'revenueShare'] },
    { timeBucket: 'month', dimensions: ['firstRepeat'], metrics: ['revenue', 'orderCount', 'averageOrderValue'] },
    { timeBucket: 'month', dimensions: ['orderChannel'], metrics: ['revenue', 'orderCount', 'averageOrderValue'] },
    { timeBucket: 'month', dimensions: ['rewardUsage'], metrics: ['revenue', 'orderCount', 'averageOrderValue', 'rewardUseAmount'] },
    { timeBucket: 'month', dimensions: ['category'], metrics: ['revenue', 'orderCount', 'quantity'] }
  ];
}

// ── 메인 엔진 ─────────────────────────────────────────────────────────────────
export function buildMarketingTemporalCrosstab(input: {
  orders: unknown[];
  products?: unknown[];
  request: MarketingCrossTabRequest;
  nowMs?: number;
}): MarketingCrossTabResult {
  const request = input.request;
  const nowMs = input.nowMs ?? Date.now();
  const generatedAt = new Date(nowMs).toISOString();
  const bucketLabel = BUCKET_LABEL[request.timeBucket] ?? '구간';
  const emptyTotals: MarketingCrossTabTotals = { revenue: 0, orderCount: 0, averageOrderValue: 0, discountAmount: 0, couponDiscountAmount: 0, rewardUseAmount: 0 };

  const support = isMarketingCrossTabRequestSupported(request);
  if (!support.supported) {
    return {
      request, bucketLabel, generatedAt,
      rows: [], totals: emptyTotals,
      available: false, unavailableReason: support.reason, requiredData: support.requiredData,
      insights: [], evidence: [],
      piiCheck: { containsPii: false, checkedKeys: [...MARKETING_CROSSTAB_FORBIDDEN_PII_KEYS] }
    };
  }

  const orders = (input.orders || []) as Order[];
  // 기간 필터
  const startMs = request.period?.startDate ? parseMs(request.period.startDate) : NaN;
  const endMs = request.period?.endDate ? parseMs(`${request.period.endDate} 23:59:59`) : NaN;
  const inPeriod = (o: Order): boolean => {
    if (Number.isNaN(startMs) && Number.isNaN(endMs)) return true;
    const t = parseMs(o.orderDate);
    if (Number.isNaN(t)) return false;
    if (!Number.isNaN(startMs) && t < startMs) return false;
    if (!Number.isNaN(endMs) && t > endMs) return false;
    return true;
  };
  const counted = orders.filter((o) => isCounted(o) && inPeriod(o));

  // 상품 메타 인덱스(goodsNo → brandCode/categoryCode)
  const products = (input.products || []) as { productId?: unknown; brandCode?: unknown; categoryCode?: unknown }[];
  const prodById = new Map<string, { brandCode?: unknown; categoryCode?: unknown }>();
  for (const p of products) {
    const id = str(p.productId);
    if (id) prodById.set(id, p);
  }

  const dims = request.dimensions;
  const lineGran = dims.some((d) => LINE_DIMS.has(d));

  const map = new Map<string, Acc>();
  const getAcc = (bucketKey: string, bLabel: string, d1: { key: string; label: string }, d2?: { key: string; label: string }): Acc => {
    const k = `${bucketKey}\u0000${d1.key}\u0000${d2?.key ?? ''}`;
    let a = map.get(k);
    if (!a) {
      a = { bucketKey, bucketLabel: bLabel, dimKey: d1.key, dimLabel: d1.label, dim2Key: d2?.key, dim2Label: d2?.label, revenue: 0, discount: 0, coupon: 0, reward: 0, quantity: 0, orderSet: new Set<string>(), lineGran };
      map.set(k, a);
    }
    return a;
  };

  // 권위 totals(주문 단위)
  const totals: MarketingCrossTabTotals = { ...emptyTotals };
  for (const o of counted) {
    totals.revenue += num(o.totalAmount);
    totals.discountAmount += orderDiscount(o);
    totals.couponDiscountAmount += orderCoupon(o);
    totals.rewardUseAmount += orderReward(o);
  }
  totals.orderCount = counted.length;
  totals.averageOrderValue = totals.orderCount > 0 ? Math.round(totals.revenue / totals.orderCount) : 0;

  const bucketKeyOf = (o: Order): { key: string; label: string } =>
    request.timeBucket === 'scenario' ? scenarioLabel(o) : { key: getMarketingTimeBucketKey(str(o.orderDate), request.timeBucket), label: '' };
  const dimKeyOf = (o: Order, l: OrderLine | undefined, dim: MarketingCrossTabDimension): { key: string; label: string } => {
    if (LINE_DIMS.has(dim)) {
      const meta = l ? prodById.get(str(l.goodsNo)) : undefined;
      const merged = { ...(l || {}), brandCode: (l && 'brandCode' in l ? l.brandCode : undefined) ?? meta?.brandCode, categoryCode: str(l?.categoryCode) || meta?.categoryCode };
      return getMarketingDimensionKey(merged, dim);
    }
    return getMarketingDimensionKey(o, dim);
  };

  for (const o of counted) {
    const bk = bucketKeyOf(o);
    if (lineGran) {
      for (const l of o.lines || []) {
        const d1 = dimKeyOf(o, l, dims[0]);
        const d2 = dims[1] ? dimKeyOf(o, l, dims[1]) : undefined;
        const a = getAcc(bk.key, bk.label, d1, d2);
        a.revenue += num(l.lineRevenue);
        a.quantity += num(l.quantity);
        if (o.orderNo) a.orderSet.add(str(o.orderNo));
      }
    } else {
      const d1 = dimKeyOf(o, undefined, dims[0]);
      const d2 = dims[1] ? dimKeyOf(o, undefined, dims[1]) : undefined;
      const a = getAcc(bk.key, bk.label, d1, d2);
      a.revenue += num(o.totalAmount);
      a.discount += orderDiscount(o);
      a.coupon += orderCoupon(o);
      a.reward += orderReward(o);
      a.quantity += orderQty(o);
      if (o.orderNo) a.orderSet.add(str(o.orderNo));
    }
  }

  const accs = [...map.values()];
  const rowsRevenueTotal = accs.reduce((s, a) => s + a.revenue, 0);
  let rows: MarketingCrossTabRow[] = accs.map((a) => ({
    bucketKey: a.bucketKey,
    bucketLabel: a.bucketLabel || a.bucketKey,
    dimensionKey: a.dimKey,
    dimensionLabel: a.dimLabel,
    ...(a.dim2Key !== undefined ? { secondaryDimensionKey: a.dim2Key, secondaryDimensionLabel: a.dim2Label } : {}),
    revenue: calculateMarketingCrossTabMetric(a, 'revenue', rowsRevenueTotal),
    orderCount: calculateMarketingCrossTabMetric(a, 'orderCount', rowsRevenueTotal),
    averageOrderValue: calculateMarketingCrossTabMetric(a, 'averageOrderValue', rowsRevenueTotal),
    discountAmount: calculateMarketingCrossTabMetric(a, 'discountAmount', rowsRevenueTotal),
    couponDiscountAmount: calculateMarketingCrossTabMetric(a, 'couponDiscountAmount', rowsRevenueTotal),
    rewardUseAmount: calculateMarketingCrossTabMetric(a, 'rewardUseAmount', rowsRevenueTotal),
    quantity: calculateMarketingCrossTabMetric(a, 'quantity', rowsRevenueTotal),
    revenueSharePercent: calculateMarketingCrossTabMetric(a, 'revenueShare', rowsRevenueTotal),
    ...(a.lineGran ? { notes: ['라인 기준 집계 — 주문 단위 할인/리워드는 미합산'] } : {})
  }));

  // 정렬: bucketKey 오름차순 → revenue 내림차순
  rows.sort((x, y) => x.bucketKey.localeCompare(y.bucketKey) || y.revenue - x.revenue);
  if (request.limit && request.limit > 0) rows = rows.slice(0, request.limit);

  const insights = buildCrosstabInsights(rows, request);
  const evidence = buildCrosstabEvidence(rows, totals, request);

  const draft = { request, bucketLabel, generatedAt, rows, totals, available: true, insights, evidence };
  const leaked = assertCrosstabNoPii(draft);

  return {
    ...draft,
    piiCheck: { containsPii: leaked.length > 0, checkedKeys: [...MARKETING_CROSSTAB_FORBIDDEN_PII_KEYS] }
  };
}

// ── insights (deterministic, 인과 단정 금지) ──────────────────────────────────
function buildCrosstabInsights(rows: MarketingCrossTabRow[], request: MarketingCrossTabRequest): MarketingCrossTabInsight[] {
  const out: MarketingCrossTabInsight[] = [];
  if (rows.length === 0) {
    out.push({ id: 'ct_empty', title: '데이터 없음', summary: '선택한 조건에 해당하는 주문이 없습니다. 기간/조건을 확인해 주세요.', severity: 'info', evidenceIds: [] });
    return out;
  }
  const dims = request.dimensions;

  // 1) 최대 매출 구간
  let top = rows[0];
  for (const r of rows) if (r.revenue > top.revenue) top = r;
  out.push({
    id: 'ct_top_revenue',
    title: '최대 매출 구간',
    summary: `${top.bucketLabel} · ${top.dimensionLabel}${top.secondaryDimensionLabel ? ` × ${top.secondaryDimensionLabel}` : ''} 구간의 매출이 ${won(top.revenue)}으로 가장 높게 나타났습니다.`,
    severity: 'info',
    evidenceIds: ['ev_total_revenue']
  });

  // 2) couponUsage 객단가 관찰
  if (dims.includes('couponUsage')) {
    const byBucket = new Map<string, { used?: number; unused?: number }>();
    for (const r of rows) {
      const b = byBucket.get(r.bucketKey) || {};
      if (r.dimensionKey === 'coupon') b.used = r.averageOrderValue;
      if (r.dimensionKey === 'non_coupon') b.unused = r.averageOrderValue;
      byBucket.set(r.bucketKey, b);
    }
    let higher = 0, compared = 0;
    for (const b of byBucket.values()) if (b.used != null && b.unused != null) { compared++; if (b.used > b.unused) higher++; }
    if (compared > 0) {
      out.push({
        id: 'ct_coupon_aov',
        title: '쿠폰 사용/미사용 객단가 관찰',
        summary: `쿠폰 사용/미사용을 모두 비교 가능한 ${compared}개 구간 중 ${higher}개 구간에서 쿠폰 사용 주문의 객단가가 더 높게 나타났습니다. (관찰값, 인과관계 아님)`,
        severity: 'info',
        evidenceIds: ['ev_total_revenue']
      });
    }
  }

  // 3) scenario(baseline vs promotion) 매출 차이
  if (dims.includes('scenario') || request.timeBucket === 'scenario') {
    let baseRev = 0, promoRev = 0;
    for (const r of rows) {
      const k = r.dimensionKey === 'baseline' || r.dimensionKey === 'promotion' ? r.dimensionKey : r.bucketKey;
      if (k === 'baseline') baseRev += r.revenue;
      if (k === 'promotion') promoRev += r.revenue;
    }
    if (baseRev > 0 && promoRev > 0) {
      const diff = +(((promoRev - baseRev) / baseRev) * 100).toFixed(1);
      out.push({
        id: 'ct_scenario_diff',
        title: 'baseline vs promotion 매출',
        summary: `promotion 시나리오 매출이 baseline 대비 ${diff >= 0 ? '+' : ''}${diff}% 차이로 나타났습니다. (관찰값)`,
        severity: 'info',
        evidenceIds: ['ev_total_revenue']
      });
    }
  }

  // 4) memberGroup 최대 비중
  if (dims.includes('memberGroup')) {
    let topG = rows[0];
    for (const r of rows) if ((r.revenueSharePercent ?? 0) > (topG.revenueSharePercent ?? 0)) topG = r;
    out.push({
      id: 'ct_member_group_share',
      title: '매출 비중 1위 회원그룹',
      summary: `${topG.dimensionLabel} 그룹이 ${topG.bucketLabel} 기준 매출 비중 ${topG.revenueSharePercent}%로 가장 높게 나타났습니다.`,
      severity: 'info',
      evidenceIds: ['ev_total_revenue'],
      recommendedNextAction: `${topG.dimensionLabel} 대상 리텐션/타겟 후보 검토`
    });
  }

  // 5) firstRepeat 비중 관찰
  if (dims.includes('firstRepeat')) {
    let firstRev = 0, repeatRev = 0;
    for (const r of rows) { if (r.dimensionKey === 'first') firstRev += r.revenue; if (r.dimensionKey === 'repeat') repeatRev += r.revenue; }
    const tot = firstRev + repeatRev;
    if (tot > 0) {
      const share = +((repeatRev / tot) * 100).toFixed(1);
      out.push({ id: 'ct_first_repeat', title: '재구매 매출 비중', summary: `재구매 주문이 전체 매출의 ${share}%로 나타났습니다.`, severity: share >= 50 ? 'positive' : 'info', evidenceIds: ['ev_total_revenue'] });
    }
  }

  // 6) 주문수 적은 구간 경고
  const lowRows = rows.filter((r) => r.orderCount > 0 && r.orderCount <= 5).length;
  if (lowRows > 0) {
    out.push({
      id: 'ct_low_count',
      title: '주문수 적은 구간 주의',
      summary: `주문수가 적은(5건 이하) 구간이 ${lowRows}개 있어 해석 시 주문수 확인이 필요합니다.`,
      severity: 'warning',
      evidenceIds: ['ev_bucket_count']
    });
  }

  return out;
}

function buildCrosstabEvidence(rows: MarketingCrossTabRow[], totals: MarketingCrossTabTotals, request: MarketingCrossTabRequest): MarketingCrossTabEvidence[] {
  const buckets = new Set(rows.map((r) => r.bucketKey));
  return [
    { id: 'ev_total_revenue', label: '전체 매출(결제·미취소)', value: totals.revenue, source: 'orders' },
    { id: 'ev_total_orders', label: '전체 주문수', value: totals.orderCount, source: 'orders' },
    { id: 'ev_total_coupon_discount', label: '쿠폰 할인 총액', value: totals.couponDiscountAmount, source: 'orders' },
    { id: 'ev_bucket_count', label: `${BUCKET_LABEL[request.timeBucket]} 구간 수`, value: buckets.size, source: 'derived' },
    { id: 'ev_row_count', label: '교차분석 행 수', value: rows.length, source: 'derived' }
  ];
}
