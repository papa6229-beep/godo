// 리소스 단위 로딩 오케스트레이터
// real/sandbox Open API 호출 -> 실패 시 mock fallback.
// source 표기: api_proxy_real / api_proxy_sandbox / api_mock_fallback
//
// 이 모듈만 사용하면 각 라우트(sync.ts, orders.ts 등)는 동일한 동작/표기를 보장한다.

import { getGodomallConfig, isLiveMode, postGodomall } from './godomallOpenApiClient.js';
import { parseGodomallXml, extractList } from './godomallXmlParser.js';
import {
  mapGoodsList,
  mapGoodsToInventory,
  mapOrderList,
  deriveSalesFromOrders
} from './godomallMapper.js';
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
    const res = await postGodomall(GOODS_SEARCH_PATH, { page: 1, size: 50 }, config);
    if (!res.ok || !res.xml) throw new Error(res.error || 'Goods_Search failed');
    const parsed = parseGodomallXml(res.xml);
    if (!parsed.ok) throw new Error(`Goods_Search error code ${parsed.code}: ${parsed.msg}`);
    const goods = extractList(parsed.root, ['goods', 'item', 'list', 'data', 'row']);
    return resourceType === 'inventory' ? mapGoodsToInventory(goods) : mapGoodsList(goods);
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
    const rawOrders = extractList(parsed.root, ['order', 'item', 'list', 'data', 'row']);
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
