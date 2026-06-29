// 부서 업무 관장 > 상품관리팀 대시보드 데이터 서비스 (Orders READ v0)
//
// 관리자 내부 운영 화면 전용 — Products(REAL READ)와 관리자 주문(원본 고객정보 포함)을
// 서버 라우트에서 읽어온다. 프론트는 고도몰 API를 직접 호출하지 않으며, 키도 다루지 않는다.
// 라우트 실패 시(로컬 dev 등) UI가 깨지지 않도록 안전하게 빈 결과로 폴백한다.

export type DataSourceTag = 'real' | 'sandbox' | 'mock' | 'unavailable';

export interface AdminProduct {
  productId: string;
  productName: string;
  price: number;
  stock: number;
  stockEnabled: boolean;
  soldOut: boolean;
}

export interface AdminOrder {
  orderId: string;
  orderNo: string;
  orderDate: string;
  ordererName: string;
  receiverName: string;
  phone: string;
  address: string;
  productName: string;
  quantity: number;
  productAmount: number;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  deliveryStatus: string;
  unpaid: boolean;
  undelivered: boolean;
}

export interface AdminProductsResult {
  products: AdminProduct[];
  count: number;
  source: DataSourceTag;
  live: boolean;
  errorMessage?: string;
}

export interface AdminOrdersResult {
  orders: AdminOrder[];
  count: number;
  unpaidCount: number;
  undeliveredCount: number;
  source: DataSourceTag;
  live: boolean;
  errorMessage?: string;
}

// sourceType(api_proxy_real 등) → 화면 표기 태그
const toSourceTag = (sourceType: string | undefined): DataSourceTag => {
  if (sourceType === 'api_proxy_real') return 'real';
  if (sourceType === 'api_proxy_sandbox') return 'sandbox';
  return 'mock';
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const bool = (v: unknown): boolean => v === true || v === 'y' || v === '1' || v === 'true';

export const fetchAdminProducts = async (): Promise<AdminProductsResult> => {
  try {
    const res = await fetch('/api/godomall/products');
    if (!res.ok) throw new Error(`products HTTP ${res.status}`);
    const data = await res.json();
    const records = (data.records || []) as Record<string, unknown>[];
    const products: AdminProduct[] = records.map((r) => ({
      productId: str(r.productId),
      productName: str(r.productName),
      price: num(r.price),
      stock: num(r.stock),
      stockEnabled: bool(r.stockEnabled),
      soldOut: bool(r.soldOut)
    }));
    return {
      products,
      count: products.length,
      source: toSourceTag(data.sourceType),
      live: data.sourceType === 'api_proxy_real' || data.sourceType === 'api_proxy_sandbox',
      errorMessage: data.errorMessage
    };
  } catch (err: unknown) {
    return {
      products: [],
      count: 0,
      source: 'unavailable',
      live: false,
      errorMessage: err instanceof Error ? err.message : String(err)
    };
  }
};

// ── 카탈로그 taxonomy (category_search/brand_search → 코드 라벨 lookup) ───────
// 게이트웨이로 카테고리/브랜드를 병렬 조회해 productTeamChatFacts에 넘길 lookup을 만든다.
// 실패해도 상품팀 채팅이 깨지지 않도록 빈 lookup으로 안전 폴백한다.
export interface CatalogLookupResult {
  categoriesByCode: Record<string, { cateCd: string; cateNm?: string }>;
  brandsByCode: Record<string, { brandCd: string; brandNm?: string }>;
  source: DataSourceTag;
  categoryCount: number;
  brandCount: number;
}

export const fetchCatalog = async (): Promise<CatalogLookupResult> => {
  const empty: CatalogLookupResult = {
    categoriesByCode: {},
    brandsByCode: {},
    source: 'unavailable',
    categoryCount: 0,
    brandCount: 0
  };
  try {
    const [catRes, brandRes] = await Promise.all([
      fetch('/api/godomall/read?capability=category_search'),
      fetch('/api/godomall/read?capability=brand_search')
    ]);
    const cat = catRes.ok ? await catRes.json() : {};
    const brand = brandRes.ok ? await brandRes.json() : {};

    const categoriesByCode: CatalogLookupResult['categoriesByCode'] = {};
    for (const it of (cat.items || []) as Record<string, unknown>[]) {
      const code = str(it.cateCd);
      if (code) categoriesByCode[code] = { cateCd: code, cateNm: str(it.cateNm) || undefined };
    }
    const brandsByCode: CatalogLookupResult['brandsByCode'] = {};
    for (const it of (brand.items || []) as Record<string, unknown>[]) {
      const code = str(it.brandCd);
      if (code) brandsByCode[code] = { brandCd: code, brandNm: str(it.brandNm) || undefined };
    }
    // 둘 중 하나라도 real이면 real, 둘 다 mock이면 mock, 그 외 unavailable.
    const src: DataSourceTag =
      cat.source === 'real' || brand.source === 'real'
        ? 'real'
        : cat.source === 'mock' || brand.source === 'mock'
          ? 'mock'
          : 'unavailable';
    return {
      categoriesByCode,
      brandsByCode,
      source: src,
      categoryCount: Object.keys(categoriesByCode).length,
      brandCount: Object.keys(brandsByCode).length
    };
  } catch {
    return empty;
  }
};

export const fetchAdminOrders = async (): Promise<AdminOrdersResult> => {
  try {
    const res = await fetch('/api/godomall/orders-admin');
    if (!res.ok) throw new Error(`orders-admin HTTP ${res.status}`);
    const data = await res.json();
    const records = (data.records || []) as Record<string, unknown>[];
    const orders: AdminOrder[] = records.map((r) => ({
      orderId: str(r.orderId),
      orderNo: str(r.orderNo),
      orderDate: str(r.orderDate),
      ordererName: str(r.ordererName),
      receiverName: str(r.receiverName),
      phone: str(r.phone),
      address: str(r.address),
      productName: str(r.productName),
      quantity: num(r.quantity),
      productAmount: num(r.productAmount),
      deliveryFee: num(r.deliveryFee),
      totalAmount: num(r.totalAmount),
      paymentMethod: str(r.paymentMethod),
      paymentStatus: str(r.paymentStatus),
      deliveryStatus: str(r.deliveryStatus),
      unpaid: bool(r.unpaid),
      undelivered: bool(r.undelivered)
    }));
    return {
      orders,
      count: typeof data.count === 'number' ? data.count : orders.length,
      unpaidCount: typeof data.unpaidCount === 'number' ? data.unpaidCount : orders.filter((o) => o.unpaid).length,
      undeliveredCount:
        typeof data.undeliveredCount === 'number' ? data.undeliveredCount : orders.filter((o) => o.undelivered).length,
      source: toSourceTag(data.sourceType),
      live: data.live === true,
      errorMessage: data.errorMessage
    };
  } catch (err: unknown) {
    return {
      orders: [],
      count: 0,
      unpaidCount: 0,
      undeliveredCount: 0,
      source: 'unavailable',
      live: false,
      errorMessage: err instanceof Error ? err.message : String(err)
    };
  }
};

// ── 매출 분석(RevenueOrder + Synthetic) — /api/godomall/orders-revenue ──
// 상품관리팀 대시보드 전용. includeSynthetic=true 시 실 주문 + 가상 240건 + stockImpact 포함.
export interface RevenueSummary {
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
  realOrderCount: number;
  syntheticOrderCount: number;
  syntheticTrackedProductCount: number;
  syntheticUnlimitedProductCount: number;
  syntheticTotalSoldQuantity: number;
  syntheticTotalRestoredQuantity: number;
  syntheticTotalNetSoldQuantity: number;
}

export interface StockImpactItem {
  productId: string;
  productCode: string;
  productName: string;
  sourceStockEnabled: boolean;
  sourceStock: number;
  syntheticStockMode: string;
  syntheticInitialStock: number;
  syntheticSoldQuantity: number;
  syntheticRestoredQuantity: number;
  syntheticNetSoldQuantity: number;
  syntheticProjectedStock: number;
}

// 대시보드 집계용 경량 주문/라인 (필터·차트 파생용)
export interface RevenueLineLite {
  goodsNo: string;
  goodsName: string;
  quantity: number;
  lineRevenue: number;
  categoryCode: string;
  categoryLabel: string;
}

export interface RevenueOrderLite {
  orderNo: string;
  orderDate: string; // 'YYYY-MM-DD HH:MM:SS'
  sourceType: string; // 'real_godomall' | 'synthetic_test'
  deliveryFee: number;
  totalAmount: number;
  productRevenueByLines: number;
  paid: boolean;
  unpaid: boolean;
  confirmed: boolean;
  canceled: boolean;
  lines: RevenueLineLite[];
  // ── Commerce Data Contract v0 분석 필드(가산, optional) — Analytics Query Engine 입력용 ──
  memberKey?: string;
  paymentMethodCode?: string;
  orderChannel?: string;
  claim?: { hasClaim: boolean; claimTypes: string[]; claimAmount?: number };
  // ── 마케팅 enrichment 가산 필드(Spec-Based Synthetic Enrichment v0) — 마케팅 분석 facts 입력용 ──
  isFirstPurchase?: boolean;
  memberGroupName?: string;
  memberGroupCode?: string;
  discountSummary?: { hasCoupon: boolean; totalCouponDiscountAmount: number; totalDiscountAmount: number };
  discountAmount?: number;
  useMileageAmount?: number;
  useDepositAmount?: number;
  rewardUseAmount?: number;
}

// 가상 매출 소스 (Universe 활성화 v0). 기본 commerce_universe_v1.
export type SyntheticSourceTag = 'commerce_universe_v1' | 'godoRaw' | 'legacy';

// ── Commerce Universe Auxiliary Data (safe, PII 없음) — 서버 commerceUniverseAux.ts 미러 ──
export interface SafeSyntheticCustomer {
  memberKey: string;
  segment: string;
  firstOrderDate: string;
  lastOrderDate: string;
  orderCount: number;
  totalRevenue: number;
  totalPaidAmount: number; // analyticsQueryEngine 입력 호환
  averageOrderValue: number;
  claimCount: number;
  reviewCount: number;
  inquiryCount: number;
}
export interface SafeSyntheticReview {
  reviewId: string;
  orderNo: string;
  goodsNo: string;
  productId: string;
  categoryCode?: string;
  brandCode?: string;
  rating: number;
  sentiment: string;
  topic: string;
  createdAt: string;
  excerpt: string;
}
export interface SafeSyntheticInquiry {
  inquiryId: string;
  orderNo?: string;
  goodsNo?: string;
  productId?: string;
  categoryCode?: string;
  brandCode?: string;
  topic: string;
  status: string;
  urgency: string;
  createdAt: string;
  title: string;
  excerpt: string;
}
// CS 전용 fake contact (fake PII, origin 표식 유지) — csTeam에서만 사용
export interface CsFakeContact {
  customerId: string;
  memberKey: string;
  customerName: string;
  receiverName?: string;
  phone: string;
  email?: string;
  address: string;
  deliveryMemo?: string;
  refundBank?: string;
  refundAccount?: string;
  origin: { isSynthetic: boolean; isFakePii: boolean; piiType: 'fake' | 'real'; sourceType?: string; syntheticProfile?: string };
}
export interface UniverseAux {
  customers: SafeSyntheticCustomer[];
  reviews: SafeSyntheticReview[];
  inquiries: SafeSyntheticInquiry[];
  csOnlyFakeContacts?: CsFakeContact[];
  meta: { syntheticProfile: string; seed?: number; generatedAt?: string };
}

export interface RevenueResult {
  count: number;
  source: DataSourceTag;
  live: boolean;
  summary: RevenueSummary | null;
  stockImpact: StockImpactItem[];
  orders: RevenueOrderLite[];
  syntheticSource?: SyntheticSourceTag; // 요청한 가상 소스(배지 표기용)
  universeAux?: UniverseAux; // includeUniverseAux 요청 시에만(commerce_universe_v1)
  errorMessage?: string;
}

export interface FetchRevenueOptions {
  includeUniverseAux?: boolean;
  includeCsFakeContacts?: boolean;
}

// revenue route는 sourceType 대신 mode/live 를 반환 → 태그로 변환
const tagFromModeLive = (mode: unknown, live: unknown): DataSourceTag => {
  if (live === true) return mode === 'sandbox' ? 'sandbox' : 'real';
  return 'mock';
};

const parseSummary = (s: Record<string, unknown> | undefined): RevenueSummary | null => {
  if (!s) return null;
  return {
    orderCount: num(s.orderCount),
    lineCount: num(s.lineCount),
    productRevenueByHeader: num(s.productRevenueByHeader),
    productRevenueByLines: num(s.productRevenueByLines),
    deliveryFeeTotal: num(s.deliveryFeeTotal),
    totalAmount: num(s.totalAmount),
    paidOrderCount: num(s.paidOrderCount),
    unpaidOrderCount: num(s.unpaidOrderCount),
    confirmedOrderCount: num(s.confirmedOrderCount),
    canceledOrderCount: num(s.canceledOrderCount),
    realOrderCount: num(s.realOrderCount),
    syntheticOrderCount: num(s.syntheticOrderCount),
    syntheticTrackedProductCount: num(s.syntheticTrackedProductCount),
    syntheticUnlimitedProductCount: num(s.syntheticUnlimitedProductCount),
    syntheticTotalSoldQuantity: num(s.syntheticTotalSoldQuantity),
    syntheticTotalRestoredQuantity: num(s.syntheticTotalRestoredQuantity),
    syntheticTotalNetSoldQuantity: num(s.syntheticTotalNetSoldQuantity)
  };
};

export const fetchRevenue = async (
  includeSynthetic = true,
  syntheticSource: SyntheticSourceTag = 'commerce_universe_v1',
  options: FetchRevenueOptions = {}
): Promise<RevenueResult> => {
  try {
    const auxQuery =
      (options.includeUniverseAux ? '&includeUniverseAux=true' : '') +
      (options.includeCsFakeContacts ? '&includeCsFakeContacts=true' : '');
    const res = await fetch(
      `/api/godomall/orders-revenue?includeSynthetic=${includeSynthetic ? 'true' : 'false'}&syntheticSource=${syntheticSource}${auxQuery}`
    );
    if (!res.ok) throw new Error(`orders-revenue HTTP ${res.status}`);
    const data = await res.json();
    const stockImpactRaw = (data.stockImpact || []) as Record<string, unknown>[];
    const stockImpact: StockImpactItem[] = stockImpactRaw.map((r) => ({
      productId: str(r.productId),
      productCode: str(r.productCode),
      productName: str(r.productName),
      sourceStockEnabled: bool(r.sourceStockEnabled),
      sourceStock: num(r.sourceStock),
      syntheticStockMode: str(r.syntheticStockMode),
      syntheticInitialStock: num(r.syntheticInitialStock),
      syntheticSoldQuantity: num(r.syntheticSoldQuantity),
      syntheticRestoredQuantity: num(r.syntheticRestoredQuantity),
      syntheticNetSoldQuantity: num(r.syntheticNetSoldQuantity),
      syntheticProjectedStock: num(r.syntheticProjectedStock)
    }));
    const ordersRaw = (data.orders || []) as Record<string, unknown>[];
    const orders: RevenueOrderLite[] = ordersRaw.map((o) => {
      const st = (o.state || {}) as Record<string, unknown>;
      const linesRaw = (o.lines || []) as Record<string, unknown>[];
      return {
        orderNo: str(o.orderNo),
        orderDate: str(o.orderDate),
        sourceType: str(o.sourceType),
        deliveryFee: num(o.deliveryFee),
        totalAmount: num(o.totalAmount),
        productRevenueByLines: num(o.productRevenueByLines),
        paid: bool(st.paid),
        unpaid: bool(st.unpaid),
        confirmed: bool(st.confirmed),
        canceled: bool(st.canceled),
        // Contract v0 분석 필드(있으면 그대로 — PII 아님)
        memberKey: str(o.memberKey) || undefined,
        paymentMethodCode: str(o.paymentMethodCode) || str(o.settleKind) || undefined,
        orderChannel: str(o.orderChannel) || undefined,
        claim: o.claimSummary
          ? (() => {
              const c = o.claimSummary as Record<string, unknown>;
              return {
                hasClaim: bool(c.hasClaim),
                claimTypes: Array.isArray(c.claimTypes) ? (c.claimTypes as unknown[]).map((x) => str(x)) : [],
                claimAmount: c.claimAmount !== undefined ? num(c.claimAmount) : undefined
              };
            })()
          : undefined,
        // 마케팅 enrichment 가산 필드(있으면 그대로 — 전부 PII 아님)
        isFirstPurchase: typeof o.isFirstPurchase === 'boolean' ? o.isFirstPurchase : undefined,
        memberGroupName: str(o.memberGroupName) || undefined,
        memberGroupCode: str(o.memberGroupCode) || undefined,
        discountSummary: o.discountSummary
          ? (() => {
              const d = o.discountSummary as Record<string, unknown>;
              return {
                hasCoupon: bool(d.hasCoupon),
                totalCouponDiscountAmount: num(d.totalCouponDiscountAmount),
                totalDiscountAmount: num(d.totalDiscountAmount)
              };
            })()
          : undefined,
        discountAmount: o.discountAmount !== undefined ? num(o.discountAmount) : undefined,
        useMileageAmount: o.useMileageAmount !== undefined ? num(o.useMileageAmount) : undefined,
        useDepositAmount: o.useDepositAmount !== undefined ? num(o.useDepositAmount) : undefined,
        rewardUseAmount: o.rewardUseAmount !== undefined ? num(o.rewardUseAmount) : undefined,
        lines: linesRaw.map((l) => ({
          goodsNo: str(l.goodsNo),
          goodsName: str(l.goodsName),
          quantity: num(l.quantity),
          lineRevenue: num(l.lineRevenue),
          categoryCode: str(l.categoryCode) || 'uncategorized',
          categoryLabel: str(l.categoryLabel) || str(l.categoryCode) || 'uncategorized'
        }))
      };
    });
    // universeAux는 서버가 safe하게 구성(PII 없음, csOnlyFakeContacts만 fake) → 형태 신뢰하고 전달.
    const universeAux = data.universeAux ? (data.universeAux as UniverseAux) : undefined;
    return {
      count: num(data.count),
      source: tagFromModeLive(data.mode, data.live),
      live: data.live === true,
      summary: parseSummary(data.summary as Record<string, unknown> | undefined),
      stockImpact,
      orders,
      syntheticSource: includeSynthetic ? syntheticSource : undefined,
      ...(universeAux ? { universeAux } : {}),
      errorMessage: data.errorMessage
    };
  } catch (err: unknown) {
    return {
      count: 0,
      source: 'unavailable',
      live: false,
      summary: null,
      stockImpact: [],
      orders: [],
      errorMessage: err instanceof Error ? err.message : String(err)
    };
  }
};
