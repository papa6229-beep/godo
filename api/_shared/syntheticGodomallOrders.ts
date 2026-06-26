// 고도몰 Order_Search.php "raw 응답 시뮬레이터" (Synthetic Godomall Raw Orders)
//
// 목적:
//   실제 Order_Search.php raw 응답과 유사한 형태의 synthetic 주문 데이터를 생성한다.
//   기존 syntheticRevenue.ts(곧장 RevenueOrder 생성)와 달리, 본 모듈은 한 단계 앞단인
//   "고도몰 raw 응답(GodomallOrderSearchResponse)"을 만든 뒤, 기존 mapOrdersToRevenue를
//   그대로 통과시켜 RevenueOrder[]로 변환한다(= 실데이터와 동일 변환 경로 검증).
//
// 원칙(기존 syntheticRevenue.ts와 동일):
//   - 결정적(seeded PRNG, Math.random 미사용): 같은 seed → 같은 데이터.
//   - 고도몰 Write/주문생성 절대 안 함. 순수 GODO 내부 생성.
//   - PII는 "명백히 가상"임을 알 수 있는 값만 사용(Synthetic User 001 / 010-0000-0001 등).
//   - 상태 흐름은 공식 코드표(godomallOrderCodes)에 맞춘다.
//
// 변환 호환 메모(중요):
//   기존 mapOrdersToRevenue→deriveOrderState 는 "주문 헤더" 레벨의 날짜필드를 읽는다.
//   공식 스펙은 invoice/delivery/finish/cancel 일자를 orderGoodsData(라인)에 두지만,
//   본 시뮬레이터는 변환 호환을 위해 상태 구동 날짜필드를 헤더+라인 양쪽에 채운다.

import type { StandardProduct } from './godomallMapper.js';
import type { RevenueOrder } from './godomallRevenue.js';
import { buildProductIndex, mapOrdersToRevenue } from './godomallRevenue.js';
import { asArray } from './godomallOrderNormalize.js';
import type {
  GodomallOrderSearchResponse,
  GodomallRawOrderData,
  GodomallRawOrderGoodsData,
  GodomallRawOrderInfoData,
  GodomallRawOrderDeliveryData,
  GodomallRawClaimData
} from './godomallOrderTypes.js';

export interface SyntheticGodomallOrderOptions {
  months?: number; // 기간(개월). 기본 12
  orderCount?: number; // 생성 주문 수. 기본 480
  seed?: number; // 결정적 시드(숫자). 기본 DEFAULT_SEED
  endDate?: string; // 윈도우 종료일(YYYY-MM-DD). 기본: 호출 시점
  includeClaims?: boolean; // 취소/반품/교환 클레임 포함. 기본 true
  includeMembers?: boolean; // 회원/비회원 혼합. 기본 true(false면 전부 비회원)
  // 수치 필드를 문자열로 emit(기본 true). 실 고도몰 XML은 parseTagValue=false로 파싱되어
  // 모든 값이 문자열로 내려온다(godomallXmlParser). raw 충실도를 위해 기본 true.
  numericAsString?: boolean;
}

const DEFAULTS = {
  months: 12,
  orderCount: 480,
  seed: 20260626,
  includeClaims: true,
  includeMembers: true,
  numericAsString: true
};

// 깊은 숫자→문자열 변환 (실 XML 파싱 결과 충실도). 날짜/플래그/이름은 이미 문자열.
const deepStringifyNumbers = (value: unknown): unknown => {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(deepStringifyNumbers);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepStringifyNumbers(v);
    return out;
  }
  return value;
};

// ── 결정적 PRNG (숫자 seed → mulberry32). Math.random 미사용. ──
const mulberry32 = (a: number): (() => number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
const fmtDateTime = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86400000);
const ZERO_DT = '0000-00-00 00:00:00';

// 가중 선택
const pickWeighted = <T extends { w: number }>(items: T[], r: number): T => {
  let acc = 0;
  for (const it of items) {
    acc += it.w;
    if (r <= acc) return it;
  }
  return items[items.length - 1];
};

// ── 주문 시나리오 정의 (상태 흐름 → 최종 코드 + 날짜필드 + 재고/클레임) ──
// 정상 비중을 가장 높게, 취소/반품/교환은 낮게. 코드는 공식 코드표 기준.
type ScenarioKey =
  | 'confirmed'
  | 'delivered'
  | 'shipping'
  | 'preparing'
  | 'paid'
  | 'unpaid'
  | 'cancel'
  | 'return'
  | 'exchange';

interface ScenarioDef {
  key: ScenarioKey;
  w: number;
  orderStatus: string; // 최종 라인/주문 상태 코드
  // 날짜 단계 도달 여부 (orderDate 기준 상대일)
  hasPayment: boolean;
  hasShip: boolean; // invoice/delivery
  hasDeliveryComplete: boolean;
  hasFinish: boolean;
  hasCancel: boolean; // 취소/환불 등 금액 역전(=재고 복원)
  // 재고 플래그 (라인)
  minusStockFl: 'y' | 'n';
  minusRestoreStockFl: 'y' | 'n';
  // 클레임 (있으면 claimData 부착)
  claim?: { handleMode: string; reason: string; refund: boolean; exchange: boolean };
}

const SCENARIOS: ScenarioDef[] = [
  // 정상 완료(구매확정) — p1→g1→d1→d2→s1
  { key: 'confirmed', w: 0.5, orderStatus: 's1', hasPayment: true, hasShip: true, hasDeliveryComplete: true, hasFinish: true, hasCancel: false, minusStockFl: 'y', minusRestoreStockFl: 'n' },
  // 배송완료(미확정)
  { key: 'delivered', w: 0.12, orderStatus: 'd2', hasPayment: true, hasShip: true, hasDeliveryComplete: true, hasFinish: false, hasCancel: false, minusStockFl: 'y', minusRestoreStockFl: 'n' },
  // 배송중
  { key: 'shipping', w: 0.1, orderStatus: 'd1', hasPayment: true, hasShip: true, hasDeliveryComplete: false, hasFinish: false, hasCancel: false, minusStockFl: 'y', minusRestoreStockFl: 'n' },
  // 상품준비중
  { key: 'preparing', w: 0.06, orderStatus: 'g1', hasPayment: true, hasShip: false, hasDeliveryComplete: false, hasFinish: false, hasCancel: false, minusStockFl: 'y', minusRestoreStockFl: 'n' },
  // 결제완료(준비 전)
  { key: 'paid', w: 0.05, orderStatus: 'p1', hasPayment: true, hasShip: false, hasDeliveryComplete: false, hasFinish: false, hasCancel: false, minusStockFl: 'y', minusRestoreStockFl: 'n' },
  // 입금대기(미결제) — o1
  { key: 'unpaid', w: 0.05, orderStatus: 'o1', hasPayment: false, hasShip: false, hasDeliveryComplete: false, hasFinish: false, hasCancel: false, minusStockFl: 'n', minusRestoreStockFl: 'n' },
  // 취소 — p1→c3/c4 (결제 후 취소, 재고 복원)
  { key: 'cancel', w: 0.05, orderStatus: 'c4', hasPayment: true, hasShip: false, hasDeliveryComplete: false, hasFinish: false, hasCancel: true, minusStockFl: 'y', minusRestoreStockFl: 'y', claim: { handleMode: 'c', reason: '고객 변심', refund: true, exchange: false } },
  // 반품→환불완료 — d2→b1→b2→b4→r3 (배송완료 후 반품, 재고 복원)
  { key: 'return', w: 0.04, orderStatus: 'r3', hasPayment: true, hasShip: true, hasDeliveryComplete: true, hasFinish: false, hasCancel: true, minusStockFl: 'y', minusRestoreStockFl: 'y', claim: { handleMode: 'b', reason: '단순 변심 반품', refund: true, exchange: false } },
  // 교환완료 — d2→e1→e2→e3→e5 (상품 교환, 매출 유지/재고 비복원)
  { key: 'exchange', w: 0.03, orderStatus: 'e5', hasPayment: true, hasShip: true, hasDeliveryComplete: true, hasFinish: true, hasCancel: false, minusStockFl: 'y', minusRestoreStockFl: 'n', claim: { handleMode: 'e', reason: '사이즈 교환', refund: false, exchange: true } }
];

interface DateFields {
  paymentDt: string;
  invoiceDt: string;
  deliveryDt: string;
  deliveryCompleteDt: string;
  finishDt: string;
  cancelDt: string;
}

// 시나리오 + 주문일 → 날짜필드 (deriveOrderState가 해석). clamp: 미래일 방지.
const buildDateFields = (s: ScenarioDef, orderDate: Date, clamp: (d: Date) => Date): DateFields => {
  const empty: DateFields = { paymentDt: '', invoiceDt: '', deliveryDt: '', deliveryCompleteDt: '', finishDt: '', cancelDt: '' };
  if (s.key === 'unpaid') return { ...empty, paymentDt: ZERO_DT };

  const f = { ...empty };
  if (s.hasPayment) f.paymentDt = fmtDateTime(clamp(orderDate));
  if (s.hasShip) {
    const ship = fmtDateTime(clamp(addDays(orderDate, 1)));
    f.invoiceDt = ship;
    f.deliveryDt = ship;
  }
  if (s.hasDeliveryComplete) f.deliveryCompleteDt = fmtDateTime(clamp(addDays(orderDate, 3)));
  if (s.hasFinish) f.finishDt = fmtDateTime(clamp(addDays(orderDate, 10)));
  if (s.hasCancel) f.cancelDt = fmtDateTime(clamp(addDays(orderDate, s.key === 'return' ? 6 : 2)));
  return f;
};

// 코드 선택용 가중 풀
const SETTLE_KINDS = [
  { v: 'pc', w: 0.4 }, // 신용카드
  { v: 'gb', w: 0.2 }, // 무통장
  { v: 'pn', w: 0.15 }, // 네이버페이
  { v: 'pk', w: 0.12 }, // 카카오페이
  { v: 'fc', w: 0.08 }, // 간편결제 신용카드
  { v: 'pv', w: 0.05 } // 가상계좌
];
const ORDER_TYPES = [
  { v: 'mobile', w: 0.6 },
  { v: 'pc', w: 0.37 },
  { v: 'write', w: 0.03 }
];
const ORDER_CHANNELS = [
  { v: 'shop', w: 0.8 },
  { v: 'naverpay', w: 0.13 },
  { v: 'payco', w: 0.07 }
];
const MEMBER_GROUPS = ['일반회원', 'VIP', '신규회원', '단골회원'];

// ── 메인: synthetic raw Order_Search 응답 생성 ────────────────────────────────
export function buildSyntheticGodomallOrderSearchResponse(
  products: StandardProduct[],
  options: SyntheticGodomallOrderOptions = {}
): GodomallOrderSearchResponse {
  const months = options.months ?? DEFAULTS.months;
  const orderCount = options.orderCount ?? DEFAULTS.orderCount;
  const seed = options.seed ?? DEFAULTS.seed;
  const includeClaims = options.includeClaims ?? DEFAULTS.includeClaims;
  const includeMembers = options.includeMembers ?? DEFAULTS.includeMembers;
  const numericAsString = options.numericAsString ?? DEFAULTS.numericAsString;

  const base = products.filter((p) => p.productId);
  if (base.length === 0) {
    // 실 상품이 없으면 생성하지 않는다(가상은 실 Products 기반).
    return { code: 200, msg: 'success', order_data: [] };
  }

  const rng = mulberry32(seed);
  const endBase = options.endDate ? new Date(`${options.endDate}T23:59:59`) : new Date();
  const end = Number.isNaN(endBase.getTime()) ? new Date() : endBase;
  const windowDays = months * 30;
  const clamp = (d: Date): Date => (d.getTime() > end.getTime() ? end : d);

  const orderRows: GodomallRawOrderData[] = [];

  for (let i = 0; i < orderCount; i++) {
    const seq = i + 1;
    // 최근일 약간 가중(지수 바이어스)
    const dayBack = Math.floor(Math.pow(rng(), 1.3) * windowDays);
    const orderDate = addDays(end, -dayBack);
    orderDate.setHours(8 + Math.floor(rng() * 14), Math.floor(rng() * 60), Math.floor(rng() * 60), 0);

    const scenario = pickWeighted(SCENARIOS, rng());
    const df = buildDateFields(scenario, orderDate, clamp);

    // 라인: 단일 75% / 복수 25%(2~3개)
    const lineN = rng() < 0.25 ? 2 + Math.floor(rng() * 2) : 1;

    // orderNo: 공식 예시 형태(YYMMDDHHMM + 6자리 시퀀스)의 숫자 문자열
    const yy = pad(orderDate.getFullYear() % 100);
    const orderNo = `${yy}${pad(orderDate.getMonth() + 1)}${pad(orderDate.getDate())}${pad(orderDate.getHours())}${pad(orderDate.getMinutes())}${pad(seq, 6)}`;

    const goodsLines: GodomallRawOrderGoodsData[] = [];
    let totalGoodsPrice = 0;
    let totalGoodsCnt = 0;
    let firstGoodsNm = '';

    for (let l = 0; l < lineN; l++) {
      const p = base[Math.floor(rng() * base.length)];
      const goodsCnt = 1 + Math.floor(rng() * 3); // 1~3
      const goodsPrice = p.price && p.price > 0 ? p.price : 1000 + Math.floor(rng() * 9000);
      totalGoodsPrice += goodsPrice * goodsCnt;
      totalGoodsCnt += goodsCnt;
      if (!firstGoodsNm) firstGoodsNm = p.productName || 'unknown_product';

      const line: GodomallRawOrderGoodsData = {
        sno: Number(`${seq}${pad(l + 1)}`),
        orderNo,
        orderCd: l + 1,
        orderStatus: scenario.orderStatus,
        goodsNo: Number(p.productId) || p.productId,
        goodsCd: Number(p.productCode) || p.productCode,
        goodsNm: p.productName || 'unknown_product',
        goodsCnt,
        goodsPrice,
        fixedPrice: p.fixedPrice && p.fixedPrice > 0 ? p.fixedPrice : goodsPrice,
        minusStockFl: scenario.minusStockFl,
        minusRestoreStockFl: scenario.minusRestoreStockFl,
        cateAllCd: p.allCategoryCode || p.categoryCode || '',
        // 상태 구동 날짜필드(라인) — 공식 스펙 위치 반영
        paymentDt: df.paymentDt,
        invoiceDt: df.invoiceDt,
        deliveryDt: df.deliveryDt,
        deliveryCompleteDt: df.deliveryCompleteDt,
        finishDt: df.finishDt,
        cancelDt: df.cancelDt
      };

      if (includeClaims && scenario.claim) {
        const claim: GodomallRawClaimData = {
          beforeStatus: scenario.key === 'return' ? 'd2' : scenario.key === 'exchange' ? 'd2' : 'p1',
          handleMode: scenario.claim.handleMode,
          handleCompleteFl: 'y',
          handleReason: scenario.claim.reason,
          handleDt: df.cancelDt || df.finishDt || df.paymentDt,
          regDt: df.cancelDt || df.deliveryCompleteDt || df.paymentDt
        };
        if (scenario.claim.refund) claim.refundPrice = goodsPrice * goodsCnt;
        if (scenario.claim.exchange) {
          claim.exchageInfoData = {
            ehDifferencePrice: 0,
            ehCancelDeliveryPrice: 0,
            ehAddDeliveryPrice: 0,
            ehRefundMethod: 'none'
          };
        }
        line.claimData = claim;
      }

      goodsLines.push(line);
    }

    // 배송비: 무료 18% / 2500원 72% / 3000원 10%
    const fr = rng();
    const deliveryFee = fr < 0.18 ? 0 : fr < 0.9 ? 2500 : 3000;

    // 회원/비회원
    const isMember = includeMembers && rng() < 0.75;
    const memNo = isMember ? 10000 + seq : 0;
    const memId = isMember ? `synthetic_user_${pad(seq, 3)}` : '';
    const memGroupNm = isMember ? MEMBER_GROUPS[Math.floor(rng() * MEMBER_GROUPS.length)] : '비회원';

    // 명백히 가상인 PII (실제 개인정보처럼 보이지 않게)
    const orderInfo: GodomallRawOrderInfoData = {
      orderInfoCd: 1,
      orderName: `Synthetic User ${pad(seq, 3)}`,
      orderEmail: `synthetic${pad(seq, 3)}@example.test`,
      orderPhone: `02-0000-${pad(seq % 10000, 4)}`,
      orderCellPhone: `010-0000-${pad(seq % 10000, 4)}`,
      orderZipcode: '00000',
      orderAddress: `서울시 테스트구 샘플로 ${1 + (seq % 100)}`,
      orderAddressSub: `${1 + (seq % 50)}동 ${1 + (seq % 20)}호`,
      receiverName: `Synthetic User ${pad(seq, 3)}`,
      receiverCellPhone: `010-0000-${pad(seq % 10000, 4)}`,
      receiverZipcode: '00000',
      receiverAddress: `서울시 테스트구 샘플로 ${1 + (seq % 100)}`,
      receiverAddressSub: `${1 + (seq % 50)}동 ${1 + (seq % 20)}호`,
      orderMemo: '',
      smsFl: 'y'
    };

    const delivery: GodomallRawOrderDeliveryData = {
      scmNo: 1,
      commission: 0,
      deliveryCharge: deliveryFee,
      deliveryPolicyCharge: deliveryFee,
      deliveryAreaCharge: 0,
      deliveryFixFl: deliveryFee === 0 ? 'free' : 'fixed',
      deliveryCollectFl: 'pre',
      orderInfoSno: 1
    };

    const order: GodomallRawOrderData = {
      orderNo,
      memNo,
      memId,
      memGroupNm,
      orderTypeFl: pickWeighted(ORDER_TYPES, rng()).v,
      orderChannelFl: pickWeighted(ORDER_CHANNELS, rng()).v,
      orderStatus: scenario.orderStatus,
      orderEmail: `synthetic${pad(seq, 3)}@example.test`,
      orderGoodsNm: lineN > 1 ? `${firstGoodsNm} 외 ${lineN - 1}건` : firstGoodsNm,
      orderGoodsCnt: totalGoodsCnt,
      settlePrice: totalGoodsPrice + deliveryFee,
      totalGoodsPrice,
      totalDeliveryCharge: deliveryFee,
      firstSaleFl: rng() < 0.2 ? 'y' : '',
      settleKind: pickWeighted(SETTLE_KINDS, rng()).v,
      multiShippingFl: 'n',
      mallSno: 1,
      // orderDate: 매퍼/대시보드 일자 집계용 (헤더)
      orderDate: fmtDateTime(orderDate),
      // 상태 구동 날짜필드(헤더) — 기존 deriveOrderState 호환을 위해 라인과 동일하게 채움
      paymentDt: df.paymentDt,
      invoiceDt: df.invoiceDt,
      deliveryDt: df.deliveryDt,
      deliveryCompleteDt: df.deliveryCompleteDt,
      finishDt: df.finishDt,
      cancelDt: df.cancelDt,
      orderInfoData: orderInfo,
      orderDeliveryData: delivery,
      orderGoodsData: goodsLines.length === 1 ? goodsLines[0] : goodsLines
    };

    orderRows.push(order);
  }

  // 실 XML 파싱 충실도: 수치 필드를 문자열로(기본). mapper(num/int)가 동일하게 해석.
  const rows = numericAsString
    ? (orderRows.map((o) => deepStringifyNumbers(o)) as GodomallRawOrderData[])
    : orderRows;

  // 실 응답 충실도: 주문 1건이면 order_data는 단일 객체, 다건이면 배열.
  const order_data: GodomallRawOrderData | GodomallRawOrderData[] = rows.length === 1 ? rows[0] : rows;
  return { code: 200, msg: 'success', order_data };
}

// ── Bridge: synthetic raw → RevenueOrder[] (기존 mapOrdersToRevenue 재사용) ──
// 흐름: buildSyntheticGodomallOrderSearchResponse → asArray(order_data)
//       → mapOrdersToRevenue(rawOrders, buildProductIndex(products), 'synthetic_test')
// 결과는 기존 syntheticRevenue.generateSyntheticRevenueOrders 와 동일한 RevenueOrder[] 형태.
export function buildSyntheticRevenueOrdersFromGodomallRaw(
  products: StandardProduct[],
  options: SyntheticGodomallOrderOptions = {}
): RevenueOrder[] {
  const resp = buildSyntheticGodomallOrderSearchResponse(products, options);
  const rawOrders = asArray(resp.order_data) as unknown as Record<string, unknown>[];
  return mapOrdersToRevenue(rawOrders, buildProductIndex(products), 'synthetic_test');
}
