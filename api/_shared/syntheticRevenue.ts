// 가상 매출 데이터 생성기 (Synthetic Revenue Data v0)
//
// 용도: 대시보드 테스트용. 실제 Products(13개) 기반으로 6개월치 가상 주문을
// 생성하되, 실제 주문(real_godomall)과 "동일한 RevenueOrder 구조"로 만들어
// 같은 집계 함수(summarizeRevenue)를 그대로 쓸 수 있게 한다.
//
// 원칙:
//   - sourceType = 'synthetic_test' (실데이터와 구분/필터 가능)
//   - 고도몰 실제 주문 생성/Write API 절대 사용 안 함 (순수 GODO 내부 생성)
//   - 고객 개인정보 미포함 (RevenueOrder 자체가 PII 없음)
//   - 결정적(seed) 생성: 같은 seed → 같은 데이터 (Math.random 미사용, seeded PRNG)
//   - 상태는 날짜필드로 표현 → 기존 deriveOrderState()로 동일하게 해석됨

import type { StandardProduct } from './godomallMapper.js';
import type { RevenueOrder, RevenueOrderLine, RevenueOrderState } from './godomallRevenue.js';
import { deriveOrderState } from './godomallRevenue.js';

// ── Synthetic Inventory Impact (가상 재고 영향) ──────────────────────────────
// 고도몰 실제 재고는 절대 변경하지 않는다(Write 금지). 아래 값은 GODO 내부 synthetic
// 계산값일 뿐이다.
//
// 방향(v0): 샘플몰의 임시 재고설정(stockEnabled=false/stock=0)을 그대로 따르지 않고,
// "실제 운영 쇼핑몰처럼 6개월간 재고가 움직이는 가상 세계"를 만든다.
//   - 모든 상품을 syntheticStockMode='tracked'로 처리
//   - syntheticInitialStock = netSold + 안전재고(상품별 20~80, 결정적)
//   - syntheticProjectedStock = initial - sold + restored  (항상 ≥ 0)
//   - 샘플몰 원본값은 sourceStockEnabled/sourceStock로 "참고만" 보존
export type SyntheticStockMode = 'tracked';

export type SyntheticStockImpact = {
  productId: string;
  productCode?: string;
  productName: string;
  // 샘플몰 원본 참고값 (읽기 전용, 고도몰 재고 미변경)
  sourceStockEnabled: boolean;
  sourceStock: number;
  // synthetic 가상 재고 세계
  syntheticStockMode: SyntheticStockMode;
  syntheticInitialStock: number;
  syntheticSoldQuantity: number;
  syntheticRestoredQuantity: number;
  syntheticNetSoldQuantity: number;
  syntheticProjectedStock: number;
  // C-3: 상품별 안전재고 — 위험 판정(inventoryRiskContract)의 상품별 기준. 데이터 경계에서 1회 연결.
  safetyStock: number;
  warning?: string;
};

// 상품별 안전재고(20~80) — productId 결정적 해시 (Math.random 미사용)
const safetyStockFor = (productId: string): number => {
  let h = 2166136261;
  for (let i = 0; i < productId.length; i++) {
    h ^= productId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 20 + (Math.abs(h | 0) % 61); // 20..80
};

// C-3 데이터 품질: 재고 위험 분포 비퇴화용 결정적 시나리오.
//   기존 모델은 projectedStock을 항상 safetyStock과 같게 만들어 전 상품이 low_stock으로 붕괴했다.
//   실제 위험 예측이 아니라 UI·업무 검증용 합성 시나리오다. safetyStock 생성 해시와 '별도 salt'로 독립.
//   목표 분포 out_of_stock ~10% / low_stock ~25% / ok ~65% (productId 결정적, Math.random 미사용).
type StockScenario = 'out_of_stock' | 'low_stock' | 'ok';
const saltedHash = (productId: string, salt: string): number => {
  let h = 2166136261;
  const s = salt + productId;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h | 0);
};
const stockScenarioFor = (productId: string): StockScenario => {
  const b = saltedHash(productId, 'c3-stock-scenario:') % 100;
  return b < 10 ? 'out_of_stock' : b < 35 ? 'low_stock' : 'ok';
};
// 시나리오별 목표 projectedStock. out=0 / low=1..safety / ok=safety+1..safety+40 (safety=0이면 low 구간 없음→ok).
const targetProjectedFor = (productId: string, safety: number): number => {
  const scenario = stockScenarioFor(productId);
  if (scenario === 'out_of_stock') return 0;
  if (scenario === 'low_stock') return safety <= 0 ? safety + 1 : 1 + (saltedHash(productId, 'c3-low-band:') % safety);
  return safety + 1 + (saltedHash(productId, 'c3-ok-band:') % 40);
};

export type SyntheticRevenueOptions = {
  months?: number;
  orderCount?: number;
  seed?: string;
};

const DEFAULTS = { months: 6, orderCount: 240, seed: 'godo-synthetic-revenue-v0' };

// ── 결정적 PRNG (문자열 seed → mulberry32). Math.random 미사용. ──
const xmur3 = (s: string): (() => number) => {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
};
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

type SynState = 'confirmed' | 'delivered' | 'shipping' | 'paid' | 'unpaid' | 'canceled';

// 상태 분포(누적): 구매확정55 / 배송완료15 / 배송·준비10 / 결제완료10 / 미결제5 / 취소5
// orderStatus 코드는 추정값(o1만 실측 확정) — 상태 해석은 날짜필드가 주도하므로 영향 없음.
const STATE_BUCKETS: { state: SynState; w: number; orderStatus: string }[] = [
  { state: 'confirmed', w: 0.55, orderStatus: 's1' },
  { state: 'delivered', w: 0.15, orderStatus: 'd2' },
  { state: 'shipping', w: 0.1, orderStatus: 'd1' },
  { state: 'paid', w: 0.1, orderStatus: 'p1' },
  { state: 'unpaid', w: 0.05, orderStatus: 'o1' },
  { state: 'canceled', w: 0.05, orderStatus: 'c1' }
];
const pickState = (r: number): { state: SynState; orderStatus: string } => {
  let acc = 0;
  for (const b of STATE_BUCKETS) {
    acc += b.w;
    if (r <= acc) return b;
  }
  return STATE_BUCKETS[0];
};

type DateFields = {
  paymentDt: string;
  invoiceDt: string;
  deliveryDt: string;
  deliveryCompleteDt: string;
  finishDt: string;
  cancelDt: string;
};

// 상태별 날짜필드 구성 (deriveOrderState가 해석). 빈값 = 해당 단계 미도달.
const buildDateFields = (state: SynState, orderDate: Date, clamp: (d: Date) => Date): DateFields => {
  const empty: DateFields = {
    paymentDt: '',
    invoiceDt: '',
    deliveryDt: '',
    deliveryCompleteDt: '',
    finishDt: '',
    cancelDt: ''
  };
  if (state === 'unpaid') return { ...empty, paymentDt: ZERO_DT };

  const paid = fmtDateTime(clamp(orderDate));
  const shippedDt = fmtDateTime(clamp(addDays(orderDate, 1)));
  const doneDt = fmtDateTime(clamp(addDays(orderDate, 3)));
  if (state === 'paid') return { ...empty, paymentDt: paid };
  if (state === 'shipping') return { ...empty, paymentDt: paid, invoiceDt: shippedDt, deliveryDt: shippedDt };
  if (state === 'delivered')
    return { ...empty, paymentDt: paid, invoiceDt: shippedDt, deliveryDt: shippedDt, deliveryCompleteDt: doneDt };
  if (state === 'confirmed')
    return {
      ...empty,
      paymentDt: paid,
      invoiceDt: shippedDt,
      deliveryDt: shippedDt,
      deliveryCompleteDt: doneDt,
      finishDt: fmtDateTime(clamp(addDays(orderDate, 10)))
    };
  // canceled
  return { ...empty, paymentDt: paid, cancelDt: fmtDateTime(clamp(addDays(orderDate, 2))) };
};

export const generateSyntheticRevenueOrders = (
  products: StandardProduct[],
  options: SyntheticRevenueOptions = {}
): RevenueOrder[] => {
  const months = options.months ?? DEFAULTS.months;
  const orderCount = options.orderCount ?? DEFAULTS.orderCount;
  const seed = options.seed ?? DEFAULTS.seed;

  const base = products.filter((p) => p.productId);
  if (base.length === 0) return []; // 실 상품 없으면 생성 안 함 (가상은 실 Products 기반)

  const rng = mulberry32(xmur3(seed)());
  const end = new Date(); // 윈도우 끝 = 호출 시점 (금액/상품/상태는 seed로 고정, 절대일자만 today 기준)
  const windowDays = months * 30;
  const clamp = (d: Date): Date => (d.getTime() > end.getTime() ? end : d);

  const orders: RevenueOrder[] = [];
  for (let i = 0; i < orderCount; i++) {
    // 최근일 약간 가중(지수 바이어스) — 최근 월이 조금 더 많게
    const dayBack = Math.floor(Math.pow(rng(), 1.3) * windowDays);
    const orderDate = addDays(end, -dayBack);
    orderDate.setHours(8 + Math.floor(rng() * 14), Math.floor(rng() * 60), Math.floor(rng() * 60), 0);

    const { state, orderStatus } = pickState(rng());

    const { paymentDt, invoiceDt, deliveryDt, deliveryCompleteDt, finishDt, cancelDt } = buildDateFields(
      state,
      orderDate,
      clamp
    );

    // 라인: 단일 80% / 복수 20%(2~3개)
    const multi = rng() < 0.2;
    const lineN = multi ? 2 + Math.floor(rng() * 2) : 1;
    const lines: RevenueOrderLine[] = [];
    for (let l = 0; l < lineN; l++) {
      const p = base[Math.floor(rng() * base.length)];
      const quantity = 1 + Math.floor(rng() * 3); // 1~3
      const price = p.price && p.price > 0 ? p.price : 1000 + Math.floor(rng() * 9000); // price 없으면 안전 fallback
      const lineRevenue = price * quantity;
      lines.push({
        orderNo: '',
        goodsNo: p.productId,
        goodsCd: p.productCode,
        goodsName: p.productName || 'unknown_product',
        quantity,
        goodsPrice: price,
        lineRevenue,
        lineOrderStatus: orderStatus,
        categoryCode: p.categoryCode || 'uncategorized',
        allCategoryCode: p.allCategoryCode || undefined,
        categoryLabel: p.categoryCode || p.allCategoryCode || 'uncategorized',
        productMatched: true
      });
    }

    const productRevenueByLines = lines.reduce((s, x) => s + x.lineRevenue, 0);
    // 배송비: 무료15% / 2500원 75% / 3000원 10%
    const fr = rng();
    const deliveryFee = fr < 0.15 ? 0 : fr < 0.9 ? 2500 : 3000;

    const ym = `${orderDate.getFullYear()}${pad(orderDate.getMonth() + 1)}`;
    const orderNo = `SYN-${ym}-${pad(i + 1, 4)}`;
    for (const x of lines) x.orderNo = orderNo;

    const state2: RevenueOrderState = deriveOrderState({
      orderStatus,
      paymentDt,
      invoiceDt,
      deliveryDt,
      deliveryCompleteDt,
      finishDt,
      cancelDt
    });

    orders.push({
      orderId: orderNo,
      orderNo,
      orderDate: fmtDateTime(orderDate),
      orderStatus,
      paymentMethod: ['무통장', '신용카드', '간편결제'][Math.floor(rng() * 3)],
      paymentDt,
      invoiceDt,
      deliveryDt,
      deliveryCompleteDt,
      finishDt,
      cancelDt,
      productRevenue: productRevenueByLines,
      deliveryFee,
      totalAmount: productRevenueByLines + deliveryFee,
      productRevenueByHeader: productRevenueByLines,
      productRevenueByLines,
      revenueMismatch: false,
      sourceType: 'synthetic_test',
      state: state2,
      lines
    });
  }
  return orders;
};

// 상품별 가상 재고 영향 계산. (synthetic 전용 가상 재고 세계)
//   차감 대상: 결제완료~구매확정(미취소) = state.paid && !state.canceled
//   복구 대상: 취소/반품/환불 = state.canceled
//   제외:     입금대기/미결제 = !state.paid
//   initial = max(0, netSold) + safety(20~80),  projected = initial - sold + restored  (≥ safety > 0)
//   샘플몰 원본값은 sourceStockEnabled/sourceStock로 참고만 보존(읽기 전용).
export const computeSyntheticStockImpact = (
  products: StandardProduct[],
  syntheticOrders: RevenueOrder[]
): SyntheticStockImpact[] => {
  const sold = new Map<string, number>();
  const restored = new Map<string, number>();
  for (const o of syntheticOrders) {
    const isRestore = o.state.canceled;
    const isSale = o.state.paid && !o.state.canceled;
    if (!isRestore && !isSale) continue; // 미결제 등 제외
    const bucket = isRestore ? restored : sold;
    for (const line of o.lines) {
      if (!line.goodsNo) continue;
      bucket.set(line.goodsNo, (bucket.get(line.goodsNo) || 0) + (line.quantity || 0));
    }
  }

  return products.map((p) => {
    const soldQ = sold.get(p.productId) || 0;
    const restoredQ = restored.get(p.productId) || 0;
    const netSold = soldQ - restoredQ;
    const safety = safetyStockFor(p.productId);
    // C-3 데이터 품질: 목표 재고 시나리오로 projectedStock을 분산(안전재고선 붕괴 방지).
    //   initialStock = 목표재고 + netSold 로 두면 projectedStock = 목표재고(netSold≥0)이며
    //   initialStock − netSoldQuantity = projectedStock 관계를 유지한다. 음수 방지 위해 0으로 클램프.
    const targetProjected = targetProjectedFor(p.productId, safety);
    const initialStock = Math.max(0, targetProjected + netSold);
    const projectedStock = initialStock - soldQ + restoredQ; // = targetProjected (netSold≥0)
    const warning =
      netSold < 0 ? '복구수량 > 판매수량 (synthetic 변동상 정상 — 재고 상향)' : undefined;

    return {
      productId: p.productId,
      productCode: p.productCode || undefined,
      productName: p.productName || 'unknown_product',
      // 원본 참고값 (고도몰 재고 미변경 — 읽기 전용)
      sourceStockEnabled: p.stockEnabled,
      sourceStock: p.stock,
      // synthetic 가상 재고
      syntheticStockMode: 'tracked',
      syntheticInitialStock: initialStock,
      syntheticSoldQuantity: soldQ,
      syntheticRestoredQuantity: restoredQ,
      syntheticNetSoldQuantity: netSold,
      syntheticProjectedStock: projectedStock,
      safetyStock: safety, // C-3: 이미 계산한 상품별 안전재고를 소비자에 전달(버리지 않는다)
      ...(warning ? { warning } : {})
    };
  });
};

export type SyntheticStockSummary = {
  syntheticTrackedProductCount: number;
  syntheticUnlimitedProductCount: number;
  syntheticTotalSoldQuantity: number;
  syntheticTotalRestoredQuantity: number;
  syntheticTotalNetSoldQuantity: number;
};

export const summarizeStockImpact = (impact: SyntheticStockImpact[]): SyntheticStockSummary => {
  let tracked = 0;
  let totalSold = 0;
  let totalRestored = 0;
  let totalNet = 0;
  for (const s of impact) {
    if (s.syntheticStockMode === 'tracked') tracked++;
    totalSold += s.syntheticSoldQuantity;
    totalRestored += s.syntheticRestoredQuantity;
    totalNet += s.syntheticNetSoldQuantity;
  }
  return {
    syntheticTrackedProductCount: tracked,
    syntheticUnlimitedProductCount: impact.length - tracked, // v0: 항상 0
    syntheticTotalSoldQuantity: totalSold,
    syntheticTotalRestoredQuantity: totalRestored,
    syntheticTotalNetSoldQuantity: totalNet
  };
};
