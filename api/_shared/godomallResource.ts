// 리소스 단위 로딩 오케스트레이터
// real/sandbox Open API 호출 -> 실패 시 mock fallback.
// source 표기: api_proxy_real / api_proxy_sandbox / api_mock_fallback
//
// 이 모듈만 사용하면 각 라우트(sync.ts, orders.ts 등)는 동일한 동작/표기를 보장한다.

import { getGodomallConfig, isLiveMode, postGodomall } from './godomallOpenApiClient.js';
import { parseGodomallXml, extractList } from './godomallXmlParser.js';
import {
  mapGoodsToProducts,
  mapOrderList,
  mapOrdersToAdmin,
  deriveSalesFromOrders
} from './godomallMapper.js';
import type { StandardOrderAdmin, StandardProduct } from './godomallMapper.js';
import {
  buildProductIndex,
  mapOrdersToRevenue,
  summarizeRevenue
} from './godomallRevenue.js';
import type { RevenueOrder, RevenueSummary } from './godomallRevenue.js';
import {
  generateSyntheticRevenueOrders,
  computeSyntheticStockImpact,
  summarizeStockImpact
} from './syntheticRevenue.js';
import type { SyntheticStockImpact } from './syntheticRevenue.js';
import { buildSyntheticRevenueOrdersFromGodomallRaw } from './syntheticGodomallOrders.js';
import { normalizeOrderData } from './godomallOrderNormalize.js';
import { deriveInventoryFromProducts } from './godomallInventoryDerive.js';
import { maskRecordsList } from './piiMaskGuard.js';
import {
  getProxyMockOrders,
  getProxyMockInquiries,
  getProxyMockReviews,
  getProxyMockInventory,
  getProxyMockSales
} from './mockProxyData.js';

export type ResourceType = 'orders' | 'inquiries' | 'reviews' | 'inventory' | 'sales' | 'products';
export type ResourceSource = 'api_proxy_real' | 'api_proxy_sandbox' | 'api_mock_fallback';

export interface ResolvedResource {
  records: Record<string, unknown>[]; // PII 마스킹 완료
  count: number;
  maskedCount: number;
  source: ResourceSource;
  mode: 'real' | 'sandbox' | 'mock';
  live: boolean; // 실제 Open API 응답 사용 여부
  errorMessage?: string;
}

// 공식 엔드포인트 (임의 json endpoint 금지)
const GOODS_SEARCH_PATH = '/goods/Goods_Search.php';
const ORDER_SEARCH_PATH = '/order/Order_Search.php';

// 리스트 추출 후보 키 (실 응답 확인: Goods_Search 리스트는 data.return.goods_data)
export const GOODS_LIST_KEYS = ['goods_data', 'goods', 'item', 'list', 'row', 'data'];
export const ORDER_LIST_KEYS = ['order', 'item', 'list', 'row', 'data'];
// 관리자 주문 리스트 추출 후보 (Order_Search 실응답: data.return.order_data)
// 실제 리스트 키 order_data 를 generic wrapper 'data'보다 앞에 둔다.
export const ADMIN_ORDER_LIST_KEYS = ['order_data', 'order_list', 'order', 'orderInfo', 'orderList', 'orderData', 'item', 'list', 'row', 'data'];

// 주문 조회 기본 기간 (최근 30일)
const defaultOrderRange = (): { startDate: string; endDate: string } => {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(end) };
};

// 실제 Open API에서 리소스별 원본(중간구조) 레코드를 가져온다. 실패 시 throw.
const fetchLiveRecords = async (
  resourceType: ResourceType,
  config: ReturnType<typeof getGodomallConfig>
): Promise<Record<string, unknown>[]> => {
  if (resourceType === 'products' || resourceType === 'inventory') {
    const res = await postGodomall(GOODS_SEARCH_PATH, { page: 1, size: 100 }, config);
    if (!res.ok || !res.xml) throw new Error(res.error || 'Goods_Search failed');
    const parsed = parseGodomallXml(res.xml);
    if (!parsed.ok) throw new Error(`Goods_Search error code ${parsed.code}: ${parsed.msg}`);
    const goods = extractList(parsed.root, GOODS_LIST_KEYS);
    const products = mapGoodsToProducts(goods);
    // inventory는 별도 API가 아니라 Products(REAL READ) 데이터에서 재고를 파생한다.
    return resourceType === 'inventory' ? deriveInventoryFromProducts(products) : products;
  }

  if (resourceType === 'orders' || resourceType === 'sales') {
    const { startDate, endDate } = defaultOrderRange();
    const res = await postGodomall(
      ORDER_SEARCH_PATH,
      { dateType: 'order', startDate, endDate, page: 1, size: 50 },
      config
    );
    if (!res.ok || !res.xml) throw new Error(res.error || 'Order_Search failed');
    const parsed = parseGodomallXml(res.xml);
    if (!parsed.ok) throw new Error(`Order_Search error code ${parsed.code}: ${parsed.msg}`);
    const rawOrders = extractList(parsed.root, ORDER_LIST_KEYS);
    const mappedOrders = mapOrderList(rawOrders);
    return resourceType === 'sales' ? deriveSalesFromOrders(mappedOrders) : mappedOrders;
  }

  // inquiries / reviews: 공식 게시판 endpoint(Board_List.php) 확인 전까지 라이브 미지원.
  // 임의 endpoint를 만들지 않고 명시적으로 미지원 처리 -> mock fallback으로 전환된다.
  throw new Error(`Live fetch for [${resourceType}] is not configured yet (requires Board_List.php mapping).`);
};

// mock 원본(중간구조) 반환
const getMockRecords = (resourceType: ResourceType): Record<string, unknown>[] => {
  switch (resourceType) {
    case 'orders':
      return getProxyMockOrders();
    case 'inquiries':
      return getProxyMockInquiries();
    case 'reviews':
      return getProxyMockReviews();
    case 'inventory':
    case 'products':
      return getProxyMockInventory();
    case 'sales':
      return getProxyMockSales();
    default:
      return [];
  }
};

export const resolveResource = async (resourceType: ResourceType): Promise<ResolvedResource> => {
  const config = getGodomallConfig();
  let errorMessage: string | undefined;

  if (isLiveMode(config)) {
    try {
      const liveRecords = await fetchLiveRecords(resourceType, config);
      const { maskedRecords, maskedCount } = maskRecordsList(liveRecords);
      return {
        records: maskedRecords,
        count: maskedRecords.length,
        maskedCount,
        source: config.mode === 'real' ? 'api_proxy_real' : 'api_proxy_sandbox',
        mode: config.mode,
        live: true
      };
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  // mock fallback (mock 모드이거나, 라이브 호출 실패/미지원)
  const raw = getMockRecords(resourceType);
  const { maskedRecords, maskedCount } = maskRecordsList(raw);
  return {
    records: maskedRecords,
    count: maskedRecords.length,
    maskedCount,
    source: 'api_mock_fallback',
    mode: config.mode,
    live: false,
    errorMessage
  };
};

// ── 관리자 주문 조회 (Orders READ v0) ──────────────────────────────────────
// 부서 업무 관장 > 상품관리팀 대시보드 등 관리자 내부 화면 전용.
// 기존 resolveResource('orders')와 달리 PII 마스킹을 하지 않는다(관리자가 주문
// 처리에 필요). 단, 키/raw XML은 절대 노출하지 않으며 READ 전용이다.
// 라이브 실패/미설정 시 mock 주문으로 안전 폴백한다.
export interface ResolvedAdminOrders {
  records: StandardOrderAdmin[];
  count: number;
  source: ResourceSource;
  mode: 'real' | 'sandbox' | 'mock';
  live: boolean;
  unpaidCount: number;
  undeliveredCount: number;
  errorMessage?: string;
}

const summarizeAdminOrders = (
  records: StandardOrderAdmin[]
): { unpaidCount: number; undeliveredCount: number } => ({
  unpaidCount: records.filter((o) => o.unpaid).length,
  undeliveredCount: records.filter((o) => o.undelivered).length
});

export const resolveOrdersAdmin = async (): Promise<ResolvedAdminOrders> => {
  const config = getGodomallConfig();
  let errorMessage: string | undefined;

  if (isLiveMode(config)) {
    try {
      const { startDate, endDate } = defaultOrderRange();
      const res = await postGodomall(
        ORDER_SEARCH_PATH,
        { dateType: 'order', startDate, endDate, page: 1, size: 50 },
        config
      );
      if (!res.ok || !res.xml) throw new Error(res.error || 'Order_Search failed');
      const parsed = parseGodomallXml(res.xml);
      if (!parsed.ok) throw new Error(`Order_Search error code ${parsed.code}: ${parsed.msg}`);
      // 0건 응답 phantom 가드: 의미 있는 주문만 남긴다(빈 래퍼/{} 제거).
      const rawOrders = normalizeOrderData(extractList(parsed.root, ADMIN_ORDER_LIST_KEYS));
      const records = mapOrdersToAdmin(rawOrders);
      return {
        records,
        count: records.length,
        source: config.mode === 'real' ? 'api_proxy_real' : 'api_proxy_sandbox',
        mode: config.mode,
        live: true,
        ...summarizeAdminOrders(records)
      };
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  // mock fallback (mock 데이터는 가상 고객정보 → 마스킹 불필요)
  const records = mapOrdersToAdmin(getProxyMockOrders());
  return {
    records,
    count: records.length,
    source: 'api_mock_fallback',
    mode: config.mode,
    live: false,
    errorMessage,
    ...summarizeAdminOrders(records)
  };
};

// ── 매출 분석용 주문 조회 (RevenueOrder v0) ──────────────────────────────────
// 상품관리팀 매출 대시보드 전용. orders-admin(표시용)과 별개의 매출 분석 구조를 반환한다.
// Order_Search.php(주문) + Goods_Search.php(상품, 카테고리 조인) → RevenueOrder[].
// 고객 개인정보 미포함(매출 분석용). READ 전용. live 실패/미설정 시 mock 폴백.
export interface ResolvedRevenue {
  orders: RevenueOrder[];
  count: number;
  summary: RevenueSummary;
  stockImpact: SyntheticStockImpact[];
  source: ResourceSource;
  mode: 'real' | 'sandbox' | 'mock';
  live: boolean;
  errorMessage?: string;
}

// Products 조인용 상품 목록 조회 (실패해도 매출조회는 진행 → uncategorized 처리)
const fetchProductsForJoin = async (
  config: ReturnType<typeof getGodomallConfig>
): Promise<StandardProduct[]> => {
  try {
    const res = await postGodomall(GOODS_SEARCH_PATH, { page: 1, size: 100 }, config);
    if (!res.ok || !res.xml) return [];
    const parsed = parseGodomallXml(res.xml);
    if (!parsed.ok) return [];
    return mapGoodsToProducts(extractList(parsed.root, GOODS_LIST_KEYS));
  } catch {
    return [];
  }
};

// syntheticSource: 가상 매출 생성 소스 선택(옵션). **기본값 'godoRaw'** (Commerce Data Contract v0).
//   - 'godoRaw' : Order_Search raw 시뮬레이터 → mapOrdersToRevenue 통과(real과 같은 통로). 기본.
//   - 'legacy'  : 기존 syntheticRevenue.ts (곧장 RevenueOrder, mapper 우회) — 명시 옵션으로 유지(삭제 안 함).
// ⚠️ 기본이 legacy→godoRaw로 바뀌며 대시보드/채팅 수치가 일부 달라질 수 있다(의도된 변경 — real 전환 재사용성).
export type SyntheticSource = 'legacy' | 'godoRaw';

// 기본 source 해석: 명시적으로 'legacy'를 요청한 경우만 legacy, 그 외 godoRaw.
export const pickSyntheticSource = (source?: SyntheticSource): SyntheticSource =>
  source === 'legacy' ? 'legacy' : 'godoRaw';

export const resolveOrdersRevenue = async (
  opts: { includeSynthetic?: boolean; syntheticSource?: SyntheticSource } = {}
): Promise<ResolvedRevenue> => {
  const config = getGodomallConfig();
  let errorMessage: string | undefined;
  let realOrders: RevenueOrder[] = [];
  let products: StandardProduct[] = [];
  let source: ResourceSource = 'api_mock_fallback';
  let live = false;

  if (isLiveMode(config)) {
    try {
      const { startDate, endDate } = defaultOrderRange();
      const res = await postGodomall(
        ORDER_SEARCH_PATH,
        { dateType: 'order', startDate, endDate, page: 1, size: 50 },
        config
      );
      if (!res.ok || !res.xml) throw new Error(res.error || 'Order_Search failed');
      const parsed = parseGodomallXml(res.xml);
      if (!parsed.ok) throw new Error(`Order_Search error code ${parsed.code}: ${parsed.msg}`);
      // 0건 응답 phantom 가드: 의미 있는 주문만 남긴다(빈 래퍼/{} 제거).
      const rawOrders = normalizeOrderData(extractList(parsed.root, ADMIN_ORDER_LIST_KEYS));
      products = await fetchProductsForJoin(config);
      realOrders = mapOrdersToRevenue(rawOrders, buildProductIndex(products), 'real_godomall');
      source = config.mode === 'real' ? 'api_proxy_real' : 'api_proxy_sandbox';
      live = true;
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  if (!live) {
    // mock fallback (Products 미조인 → uncategorized). mock 주문도 동일 가드 적용(모두 orderNo 보유 → 유지).
    realOrders = mapOrdersToRevenue(normalizeOrderData(getProxyMockOrders()), buildProductIndex([]), 'real_godomall');
  }

  // 가상 매출 데이터 (옵션). 기본 godoRaw(real과 같은 mapper 통로), 명시 'legacy'만 legacy.
  const chosen = pickSyntheticSource(opts.syntheticSource);
  const syntheticOrders = opts.includeSynthetic
    ? chosen === 'legacy'
      ? generateSyntheticRevenueOrders(products)
      : buildSyntheticRevenueOrdersFromGodomallRaw(products)
    : [];
  // syntheticSource 메타데이터 stamp (legacy는 mapper를 안 타 dataKind 미설정 → 보강).
  for (const o of syntheticOrders) {
    o.syntheticSource = chosen;
    if (!o.dataKind) o.dataKind = 'synthetic';
  }
  const orders = [...realOrders, ...syntheticOrders];

  // 가상 재고 영향 (옵션) — 실 Products 현재 재고 기준으로 역산 (고도몰 재고 미변경)
  const stockImpact = opts.includeSynthetic ? computeSyntheticStockImpact(products, syntheticOrders) : [];
  const summary: RevenueSummary = {
    ...summarizeRevenue(orders),
    ...(opts.includeSynthetic ? summarizeStockImpact(stockImpact) : {})
  };

  return {
    orders,
    count: orders.length,
    summary,
    stockImpact,
    source,
    mode: config.mode,
    live,
    errorMessage
  };
};
