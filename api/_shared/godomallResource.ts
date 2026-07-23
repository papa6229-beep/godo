// 리소스 단위 로딩 오케스트레이터
// DATA-SOURCE-SERVER-01 계약:
//   real/sandbox 성공          -> 실제 자료 (빈배열이어도 **실제 데이터 0건**, live:true)
//   real/sandbox 실패·미구현·키 부재 -> **연결 안 됨(0건)**. mock 을 자동으로 만들어 넣지 않는다.
//   명시적 mock 모드           -> fixture (사용자가 시험 모드를 선택한 경우에만)
// source 표기: api_proxy_real / api_proxy_sandbox / api_mock_fallback / unavailable
//
// 이 모듈만 사용하면 각 라우트(sync.ts, [resource].ts 등)는 동일한 동작/표기를 보장한다.

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
import { buildSyntheticCommerceUniverse } from './syntheticCommerceUniverse.js';
import type { SyntheticCommerceUniverse } from './syntheticCommerceUniverse.js';
import { buildUniverseAux } from './commerceUniverseAux.js';
import type { UniverseAux } from './commerceUniverseAux.js';
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
// DATA-SOURCE-SERVER-01: 'unavailable' = 실제/샌드박스 요청이 실패·미구현·설정 부재로 **자료를 못 가져온 상태**.
//   'api_mock_fallback' 은 이제 **사용자가 명시적으로 시험(mock) 모드를 선택한 경우에만** 쓴다.
export type ResourceSource = 'api_proxy_real' | 'api_proxy_sandbox' | 'api_mock_fallback' | 'unavailable';

// 실패 사유 문구(비밀값 없음 — 키·URL 파라미터·raw XML·PII 를 절대 담지 않는다).
export const NOT_CONFIGURED_MESSAGE = 'Godomall live mode is not configured (mode/keys missing).';

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
// 주문 리스트 추출 후보 (Order_Search 실응답: data.return.order_data)
// 실제 리스트 키 order_data 를 generic wrapper 'data'보다 앞에 둔다.
export const ADMIN_ORDER_LIST_KEYS = ['order_data', 'order_list', 'order', 'orderInfo', 'orderList', 'orderData', 'item', 'list', 'row', 'data'];
// GODO-ORDER-MAPPING-01: orders 리소스 경로도 admin/revenue 와 **같은 후보 키**를 쓴다.
// (과거 이 상수만 'order_data' 를 빠뜨려 generic 래퍼를 주문 1건으로 오인 → 유령 주문 발생.
//  두 상수가 다시 갈라지지 않도록 별도 배열을 두지 않고 동일 참조로 고정한다.)
export const ORDER_LIST_KEYS = ADMIN_ORDER_LIST_KEYS;

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
    // GODO-ORDER-MAPPING-01: 0건/빈 응답/메타 래퍼를 주문으로 오인하지 않도록
    // admin·revenue 경로와 동일하게 phantom 가드를 매핑 **전에** 적용한다.
    const rawOrders = normalizeOrderData(extractList(parsed.root, ORDER_LIST_KEYS));
    const mappedOrders = mapOrderList(rawOrders);
    return resourceType === 'sales' ? deriveSalesFromOrders(mappedOrders) : mappedOrders;
  }

  // inquiries / reviews: 공식 게시판 endpoint(Board_List.php) 확인 전까지 라이브 미지원.
  // 임의 endpoint를 만들지 않고 명시적으로 미지원 처리 -> 호출부가 '연결 안 됨(0건)'으로 반환한다.
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

// 실패·미구현·설정 부재의 표준 반환 — 자료를 만들어내지 않는다(records 0건).
const unavailableResource = (
  mode: 'real' | 'sandbox' | 'mock',
  errorMessage: string
): ResolvedResource => ({
  records: [],
  count: 0,
  maskedCount: 0,
  source: 'unavailable',
  mode,
  live: false,
  errorMessage
});

// DATA-SOURCE-SERVER-01:
//   - 명시적 시험(mock) 모드 → fixture 반환 (사용자가 선택한 경우에만 허용)
//   - real/sandbox 성공 → 실제 자료. **빈배열이어도 실제 데이터 0건**(live:true 유지)
//   - real/sandbox 실패·미구현·키 부재 → **연결 안 됨(0건)**. mock 자동 주입 금지.
export const resolveResource = async (resourceType: ResourceType): Promise<ResolvedResource> => {
  const config = getGodomallConfig();

  // 1) 명시적 시험 모드 — 여기서만 fixture 를 데이터로 제시한다.
  if (config.mode === 'mock') {
    const { maskedRecords, maskedCount } = maskRecordsList(getMockRecords(resourceType));
    return {
      records: maskedRecords,
      count: maskedRecords.length,
      maskedCount,
      source: 'api_mock_fallback',
      mode: 'mock',
      live: false
    };
  }

  // 2) 실제/샌드박스 요청인데 설정이 갖춰지지 않음 → 사유를 남기고 0건.
  if (!isLiveMode(config)) return unavailableResource(config.mode, NOT_CONFIGURED_MESSAGE);

  // 3) 실제 호출
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
    return unavailableResource(config.mode, err instanceof Error ? err.message : String(err));
  }
};

// ── Sync All 집계 (DATA-SOURCE-SERVER-01) ───────────────────────────────────
// 라우트(sync.ts)가 인라인으로 들고 있으면 검사가 복사본을 검증하게 되므로 여기로 올린다.
//   리소스별 sources 가 권위. 전역 sourceType 은 표시용이며 실제 데이터라고 단언하지 않는다.
export type SyncStatus = 'success' | 'partial' | 'unavailable' | 'fixture';

export interface SyncAllSummary {
  sources: Record<string, ResourceSource>;
  resourceErrors: Record<string, string>;
  syncStatus: SyncStatus;
  sourceType: ResourceSource;
  mode: 'real' | 'sandbox' | 'mock';
  importedCount: number;
  maskedPiiCount: number;
  liveResourceCount: number;
  unavailableResourceCount: number;
}

export const summarizeSyncAll = (
  resources: readonly ResourceType[],
  resolved: readonly ResolvedResource[]
): SyncAllSummary => {
  const sources: Record<string, ResourceSource> = {};
  const resourceErrors: Record<string, string> = {};
  let importedCount = 0, maskedPiiCount = 0, liveResourceCount = 0, unavailableResourceCount = 0;

  resources.forEach((r, i) => {
    const res0 = resolved[i];
    if (!res0) return;
    // 허용된 레코드만 합산 — unavailable 리소스는 0건이다.
    importedCount += res0.count;
    maskedPiiCount += res0.maskedCount;
    sources[r] = res0.source;
    if (res0.live) liveResourceCount++;
    if (res0.source === 'unavailable') unavailableResourceCount++;
    if (res0.errorMessage) resourceErrors[r] = res0.errorMessage;
  });

  const mode = resolved[0]?.mode ?? 'mock';
  const total = resources.length;
  const syncStatus: SyncStatus =
    mode === 'mock' ? 'fixture'
      : unavailableResourceCount === 0 ? 'success'
        : unavailableResourceCount === total ? 'unavailable'
          : 'partial';
  // 부분 실패면 전역은 unavailable — 성공 리소스는 sources 로 보존된다.
  const sourceType: ResourceSource =
    syncStatus === 'fixture' ? 'api_mock_fallback'
      : syncStatus === 'success' ? (mode === 'real' ? 'api_proxy_real' : 'api_proxy_sandbox')
        : 'unavailable';

  return { sources, resourceErrors, syncStatus, sourceType, mode, importedCount, maskedPiiCount, liveResourceCount, unavailableResourceCount };
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

// 실패·미구현·설정 부재 → 주문 0건. 미결제/미배송 집계도 0(없는 주문을 세지 않는다).
const unavailableAdminOrders = (
  mode: 'real' | 'sandbox' | 'mock',
  errorMessage: string
): ResolvedAdminOrders => ({
  records: [],
  count: 0,
  source: 'unavailable',
  mode,
  live: false,
  unpaidCount: 0,
  undeliveredCount: 0,
  errorMessage
});

export const resolveOrdersAdmin = async (): Promise<ResolvedAdminOrders> => {
  const config = getGodomallConfig();

  // 명시적 시험 모드에서만 fixture 주문을 제시한다.
  if (config.mode === 'mock') {
    const records = mapOrdersToAdmin(getProxyMockOrders());
    return {
      records,
      count: records.length,
      source: 'api_mock_fallback',
      mode: 'mock',
      live: false,
      ...summarizeAdminOrders(records)
    };
  }

  if (!isLiveMode(config)) return unavailableAdminOrders(config.mode, NOT_CONFIGURED_MESSAGE);

  {
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
      return unavailableAdminOrders(config.mode, err instanceof Error ? err.message : String(err));
    }
  }
};

// ── 매출 분석용 주문 조회 (RevenueOrder v0) ──────────────────────────────────
// 상품관리팀 매출 대시보드 전용. orders-admin(표시용)과 별개의 매출 분석 구조를 반환한다.
// Order_Search.php(주문) + Goods_Search.php(상품, 카테고리 조인) → RevenueOrder[].
// 고객 개인정보 미포함(매출 분석용). READ 전용. live 실패/미설정 시 mock 폴백.
export interface ResolvedRevenue {
  orders: RevenueOrder[];
  count: number;
  // DATA-SOURCE-SERVER-01: 실제 주문 연결이 안 됐고 시뮬레이션도 없으면 null.
  //   소비자는 null 을 "계산 불가(미확인)"로 다루고 0원으로 환산하지 않는다.
  summary: RevenueSummary | null;
  stockImpact: SyntheticStockImpact[];
  source: ResourceSource;
  mode: 'real' | 'sandbox' | 'mock';
  live: boolean;
  errorMessage?: string;
  /** 실제 주문 slice 의 연결 상태(시뮬레이션과 분리해 보존). */
  realOrdersStatus: 'success' | 'unavailable' | 'fixture';
  /** 시뮬레이션 slice 의 상태. 상품 조회까지 실패하면 unavailable. */
  syntheticStatus: 'not_requested' | 'success' | 'unavailable';
  /** 실제 주문 연결 실패 사유(시뮬레이션 성공과 무관하게 보존). */
  realOrdersErrorMessage?: string;
  /** 시뮬레이션 불가 사유(상품 카탈로그 조회 실패 등). */
  syntheticErrorMessage?: string;
  // commerce_universe_v1 + includeUniverseAux일 때만. 기본 응답엔 없음(PII 미포함).
  universeAux?: UniverseAux;
}

// Products 조인용 상품 목록 조회.
// DATA-SOURCE-SERVER-01: 주문 조회와 **독립적으로** 수행한다. 주문이 실패해도 상품이 성공하면
//   2년치 시뮬레이션은 그대로 생성돼야 하기 때문이다(시뮬레이션은 fallback 이 아니라 독립 시험자료).
//   실패는 빈 배열이 아니라 ok:false 로 구별한다 — 조용히 작은 mock 상품으로 대체하지 않는다.
const fetchProductsForJoin = async (
  config: ReturnType<typeof getGodomallConfig>
): Promise<{ ok: boolean; products: StandardProduct[]; errorMessage?: string }> => {
  if (!isLiveMode(config)) return { ok: false, products: [], errorMessage: NOT_CONFIGURED_MESSAGE };
  try {
    const res = await postGodomall(GOODS_SEARCH_PATH, { page: 1, size: 100 }, config);
    if (!res.ok || !res.xml) return { ok: false, products: [], errorMessage: res.error || 'Goods_Search failed' };
    const parsed = parseGodomallXml(res.xml);
    if (!parsed.ok) return { ok: false, products: [], errorMessage: `Goods_Search error code ${parsed.code}: ${parsed.msg}` };
    return { ok: true, products: mapGoodsToProducts(extractList(parsed.root, GOODS_LIST_KEYS)) };
  } catch (err: unknown) {
    return { ok: false, products: [], errorMessage: err instanceof Error ? err.message : String(err) };
  }
};

// 실제 주문 slice 만 조회 (시뮬레이션과 독립).
const fetchRealRevenueOrders = async (
  config: ReturnType<typeof getGodomallConfig>,
  index: ReturnType<typeof buildProductIndex>
): Promise<{ ok: boolean; orders: RevenueOrder[]; errorMessage?: string }> => {
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
    return { ok: true, orders: mapOrdersToRevenue(rawOrders, index, 'real_godomall') };
  } catch (err: unknown) {
    return { ok: false, orders: [], errorMessage: err instanceof Error ? err.message : String(err) };
  }
};

// syntheticSource: 가상 매출 생성 소스 선택(옵션). **기본값 'commerce_universe_v1'** (Activation v0).
//   - 'commerce_universe_v1' : Synthetic Commerce Universe(고객/주문/리뷰/문의 일관 세계)의 주문. 기본·운영 시뮬레이션용.
//   - 'godoRaw' : Order_Search raw 시뮬레이터 → mapOrdersToRevenue 통과(raw mapper 통로 검증용). 명시 옵션.
//   - 'legacy'  : 기존 syntheticRevenue.ts (곧장 RevenueOrder, mapper 우회) — 과거 비교/후퇴용. 명시 옵션.
// ⚠️ 기본이 godoRaw→commerce_universe_v1로 바뀌며 대시보드/채팅 수치가 달라진다(의도된 변경 — Universe 활성화).
export type SyntheticSource = 'legacy' | 'godoRaw' | 'commerce_universe_v1';

// 기본 source 해석: 명시적으로 legacy/godoRaw를 요청한 경우만 그것, 그 외 commerce_universe_v1.
export const pickSyntheticSource = (source?: SyntheticSource): SyntheticSource =>
  source === 'legacy' || source === 'godoRaw' ? source : 'commerce_universe_v1';

export const resolveOrdersRevenue = async (
  opts: { includeSynthetic?: boolean; syntheticSource?: SyntheticSource; includeUniverseAux?: boolean; includeCsFakeContacts?: boolean } = {}
): Promise<ResolvedRevenue> => {
  const config = getGodomallConfig();
  let realOrders: RevenueOrder[] = [];
  let products: StandardProduct[] = [];
  let source: ResourceSource = 'unavailable';
  let live = false;
  let realOrdersStatus: 'success' | 'unavailable' | 'fixture' = 'unavailable';
  let realOrdersErrorMessage: string | undefined;
  let syntheticStatus: 'not_requested' | 'success' | 'unavailable' = 'not_requested';
  let syntheticErrorMessage: string | undefined;
  // 상품 카탈로그 조회 성공 여부 — 시뮬레이션 가능 여부의 근거(주문 성패와 독립).
  let productsOk = false;

  if (config.mode === 'mock') {
    // 명시적 시험 모드에서만 fixture 주문을 제시한다. **real_godomall/dataKind:'real' 로 표시하지 않는다.**
    realOrders = mapOrdersToRevenue(normalizeOrderData(getProxyMockOrders()), buildProductIndex([]), 'fixture_mock');
    source = 'api_mock_fallback';
    realOrdersStatus = 'fixture';
  } else if (!isLiveMode(config)) {
    realOrdersErrorMessage = NOT_CONFIGURED_MESSAGE;
    syntheticErrorMessage = NOT_CONFIGURED_MESSAGE;
  } else {
    // 주문 조회와 상품 조회를 **독립적으로** 수행한다(한 try 블록에 묶지 않는다).
    const productRes = await fetchProductsForJoin(config);
    productsOk = productRes.ok;
    products = productRes.products;
    if (!productRes.ok) syntheticErrorMessage = productRes.errorMessage;

    const orderRes = await fetchRealRevenueOrders(config, buildProductIndex(products));
    if (orderRes.ok) {
      realOrders = orderRes.orders;
      source = config.mode === 'real' ? 'api_proxy_real' : 'api_proxy_sandbox';
      live = true;
      realOrdersStatus = 'success';
    } else {
      // 실제 주문 실패 → mock 을 실제 자리에 넣지 않는다. 0건 + 사유 보존.
      realOrdersErrorMessage = orderRes.errorMessage;
    }
  }

  // 가상 매출 데이터 (옵션). 기본 commerce_universe_v1, 명시 godoRaw/legacy만 그 경로.
  // 시뮬레이션은 실제 주문 실패의 대체물이 아니라 **독립 시험자료**다 — 상품 조회만 성공하면 생성한다.
  const chosen = pickSyntheticSource(opts.syntheticSource);
  const canSynthesize = opts.includeSynthetic === true && (config.mode === 'mock' || productsOk);
  if (opts.includeSynthetic === true) {
    syntheticStatus = canSynthesize ? 'success' : 'unavailable';
    if (!canSynthesize && !syntheticErrorMessage) {
      // 상품 카탈로그 없이 새 baseline 을 임의 생성하지 않는다 → 후속 SIMULATION-CATALOG-BASELINE-01.
      syntheticErrorMessage = 'Simulation requires the product catalog, which is unavailable.';
    }
  }
  let universe: SyntheticCommerceUniverse | undefined; // aux 공급용으로 전체 세계 보관(commerce_universe_v1만)
  const syntheticOrders = canSynthesize
    ? chosen === 'legacy'
      ? generateSyntheticRevenueOrders(products)
      : chosen === 'godoRaw'
        ? buildSyntheticRevenueOrdersFromGodomallRaw(products)
        : (universe = buildSyntheticCommerceUniverse(products, { includeBaselineYear: true })).orders // commerce_universe_v1 (기본, baseline+promotion 2년)
    : [];
  // syntheticSource 메타데이터 stamp (legacy는 mapper를 안 타 dataKind 미설정 → 보강).
  for (const o of syntheticOrders) {
    o.syntheticSource = chosen;
    if (!o.dataKind) o.dataKind = 'synthetic';
  }
  const orders = [...realOrders, ...syntheticOrders];

  // 가상 재고 영향 (옵션) — 실 Products 현재 재고 기준으로 역산 (고도몰 재고 미변경)
  const stockImpact = canSynthesize ? computeSyntheticStockImpact(products, syntheticOrders) : [];
  // 실제 주문도 연결 안 됐고 시뮬레이션도 없으면 요약은 **null(계산 불가)** — 0원으로 환산하지 않는다.
  // 실제 성공 빈배열(realOrdersStatus==='success')은 유효한 0값 요약을 그대로 낸다.
  const hasAnyBasis = realOrdersStatus !== 'unavailable' || syntheticOrders.length > 0;
  const summary: RevenueSummary | null = hasAnyBasis
    ? { ...summarizeRevenue(orders), ...(canSynthesize ? summarizeStockImpact(stockImpact) : {}) }
    : null;

  // Auxiliary data 공급: commerce_universe_v1 + includeUniverseAux일 때만(기본 응답엔 PII/aux 없음).
  // csOnlyFakeContacts는 includeCsFakeContacts 명시 시에만(synthetic universe라 fake 보장).
  const universeAux = opts.includeUniverseAux && canSynthesize && chosen === 'commerce_universe_v1' && universe
    ? buildUniverseAux(universe, { includeCsFakeContacts: !!opts.includeCsFakeContacts })
    : undefined;

  return {
    orders,
    count: orders.length,
    summary,
    stockImpact,
    source,
    mode: config.mode,
    live,
    // 응답 전체의 대표 사유(하위호환) — 실제 주문 사유를 우선 노출한다.
    errorMessage: realOrdersErrorMessage ?? syntheticErrorMessage,
    realOrdersStatus,
    syntheticStatus,
    ...(realOrdersErrorMessage ? { realOrdersErrorMessage } : {}),
    ...(syntheticErrorMessage ? { syntheticErrorMessage } : {}),
    ...(universeAux ? { universeAux } : {})
  };
};
