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
}

export interface RevenueResult {
  count: number;
  source: DataSourceTag;
  live: boolean;
  summary: RevenueSummary | null;
  stockImpact: StockImpactItem[];
  orders: RevenueOrderLite[];
  errorMessage?: string;
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

export const fetchRevenue = async (includeSynthetic = true): Promise<RevenueResult> => {
  try {
    const res = await fetch(`/api/godomall/orders-revenue?includeSynthetic=${includeSynthetic ? 'true' : 'false'}`);
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
    return {
      count: num(data.count),
      source: tagFromModeLive(data.mode, data.live),
      live: data.live === true,
      summary: parseSummary(data.summary as Record<string, unknown> | undefined),
      stockImpact,
      orders,
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
