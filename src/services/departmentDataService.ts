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
