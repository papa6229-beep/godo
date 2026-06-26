// Synthetic Commerce Universe v1 — 1년치 "실제형" 가상 쇼핑몰 세계 생성기.
//
// 목적: real 전환 시 재사용 가능한 data contract/facts flow를 유지하면서, 결제·재구매·취소·환불·
//   반품·교환·리뷰·문의·CS 이슈를 하나의 일관된 가상 세계로 생성한다.
//
// 핵심 원칙:
//   - 실제 상품(StandardProduct) 기반. 허공의 상품 주문 금지.
//   - godoRaw-like 흐름: 가상 Order_Search raw → mapOrdersToRevenue → RevenueOrder(+Contract v0 필드).
//     → real API와 같은 통로. memberKey/settleKind/claimSummary 등은 mapper가 자동 파생.
//   - 결정적(seeded mulberry32, Math.random 미사용).
//   - 분석(Analytics)과 CS contact(fake PII)를 분리. PII는 contact에만, analytics엔 가명 memberKey만.
//   - 모든 산출물에 source metadata(synthetic / commerce_universe_v1) 부착.

import type { StandardProduct } from './godomallMapper.js';
import type { RevenueOrder } from './godomallRevenue.js';
import { buildProductIndex, mapOrdersToRevenue } from './godomallRevenue.js';
import type { PiiOrigin } from './commerceContactContract.js';
import { SYNTHETIC_FAKE_PII_ORIGIN } from './commerceContactContract.js';

const PROFILE = 'commerce_universe_v1' as const;

// ── 결정적 PRNG ──────────────────────────────────────────────────────────────
const mulberry32 = (a: number): (() => number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pad = (n: number, w = 6): string => String(n).padStart(w, '0');
const fmtDateTime = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86400000);
const pickW = <T extends { w: number }>(items: T[], r: number): T => {
  let acc = 0;
  for (const it of items) {
    acc += it.w;
    if (r <= acc) return it;
  }
  return items[items.length - 1];
};
const intIn = (rng: () => number, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

// ── 타입 ─────────────────────────────────────────────────────────────────────
export type CustomerSegment =
  | 'new'
  | 'returning'
  | 'vip_candidate'
  | 'dormant_risk'
  | 'discount_sensitive'
  | 'high_refund_risk';

export type SyntheticCustomerProfile = {
  customerId: string;
  memberKey: string; // 분석용 가명키 (syn_member_*)
  memNo: string;
  memId: string;
  segment: CustomerSegment;
  firstOrderDate: string;
  lastOrderDate: string;
  orderCount: number;
  totalPaidAmount: number;
  averageOrderValue: number;
  repurchaseCount: number; // orderCount-1 (>=0)
  refundCount: number;
  reviewCount: number;
  sourceType: 'synthetic';
  syntheticProfile: typeof PROFILE;
};

export type SyntheticReview = {
  reviewId: string;
  orderNo: string;
  customerId: string;
  memberKey: string;
  productId: string;
  goodsNo: string;
  categoryCode?: string;
  brandCode?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  sentiment: 'positive' | 'neutral' | 'negative';
  topic: 'quality' | 'delivery' | 'price' | 'effect' | 'packaging' | 'repurchase' | 'refund';
  createdAt: string;
  sourceType: 'synthetic';
  syntheticProfile: typeof PROFILE;
};

export type SyntheticInquiry = {
  inquiryId: string;
  customerId?: string;
  memberKey?: string;
  productId?: string;
  goodsNo?: string;
  orderNo?: string;
  categoryCode?: string;
  brandCode?: string;
  topic: 'delivery' | 'payment' | 'refund' | 'exchange' | 'product_question' | 'stock' | 'coupon' | 'account';
  status: 'unanswered' | 'answered' | 'needs_human';
  urgency: 'low' | 'medium' | 'high';
  inquiryText?: string;
  createdAt: string;
  sourceType: 'synthetic';
  syntheticProfile: typeof PROFILE;
};

// CS 응대용 fake PII contact (analytics엔 절대 미포함)
export type SyntheticCsContact = {
  customerId: string;
  memberKey: string;
  customerName: string;
  receiverName: string;
  phone: string;
  email: string;
  address: string;
  deliveryMemo: string;
  refundBank: string;
  refundAccount: string;
  origin: PiiOrigin;
};

export type SyntheticCommerceUniverse = {
  meta: {
    seed: number;
    months: number;
    endDate: string;
    productCount: number;
    customerCount: number;
    orderCount: number;
    reviewCount: number;
    inquiryCount: number;
    sourceType: 'synthetic';
    syntheticProfile: typeof PROFILE;
  };
  customers: SyntheticCustomerProfile[];
  orders: RevenueOrder[]; // Analytics 계약(가명, PII 없음)
  reviews: SyntheticReview[];
  inquiries: SyntheticInquiry[];
  contacts: SyntheticCsContact[]; // CS 계약(fake PII)
};

export type SyntheticCommerceOptions = {
  seed?: number;
  months?: number;
  customers?: number;
  endDate?: string;
};

// ── 세그먼트 정의 (행동 파라미터) ────────────────────────────────────────────
type SegDef = { key: CustomerSegment; w: number; ordLo: number; ordHi: number; refundProb: number; reviewProb: number; aovMul: number };
const SEGMENTS: SegDef[] = [
  { key: 'new', w: 0.3, ordLo: 1, ordHi: 1, refundProb: 0.05, reviewProb: 0.25, aovMul: 1.0 },
  { key: 'returning', w: 0.28, ordLo: 2, ordHi: 4, refundProb: 0.06, reviewProb: 0.4, aovMul: 1.1 },
  { key: 'vip_candidate', w: 0.12, ordLo: 4, ordHi: 8, refundProb: 0.04, reviewProb: 0.5, aovMul: 1.5 },
  { key: 'dormant_risk', w: 0.12, ordLo: 1, ordHi: 2, refundProb: 0.07, reviewProb: 0.15, aovMul: 0.9 },
  { key: 'discount_sensitive', w: 0.1, ordLo: 2, ordHi: 5, refundProb: 0.1, reviewProb: 0.3, aovMul: 0.8 },
  { key: 'high_refund_risk', w: 0.08, ordLo: 1, ordHi: 3, refundProb: 0.35, reviewProb: 0.2, aovMul: 1.0 }
];

// 결제수단/주문채널 분포 (Code_Search settleKind / orderChannel 코드 기준)
const SETTLE = [
  { v: 'pc', w: 0.4 },
  { v: 'gb', w: 0.18 },
  { v: 'pn', w: 0.16 },
  { v: 'pk', w: 0.12 },
  { v: 'fc', w: 0.09 },
  { v: 'pv', w: 0.05 }
];
const CHANNEL = [
  { v: 'shop', w: 0.78 },
  { v: 'naverpay', w: 0.14 },
  { v: 'payco', w: 0.08 }
];

// 정상 주문 상태 분포 (클레임 아닌 경우)
const NORMAL_STATUS = [
  { v: 'confirmed', w: 0.55, code: 's1' },
  { v: 'delivered', w: 0.16, code: 'd2' },
  { v: 'shipping', w: 0.12, code: 'd1' },
  { v: 'preparing', w: 0.07, code: 'g1' },
  { v: 'paid', w: 0.06, code: 'p1' },
  { v: 'unpaid', w: 0.04, code: 'o1' }
];
// 클레임 종류 분포
const CLAIM_KIND = [
  { v: 'cancel', w: 0.4, code: 'c4', handleMode: 'c', reason: '고객 변심 취소' },
  { v: 'refund', w: 0.3, code: 'r3', handleMode: 'r', reason: '환불 요청' },
  { v: 'return', w: 0.2, code: 'b4', handleMode: 'b', reason: '단순 변심 반품' },
  { v: 'exchange', w: 0.1, code: 'e5', handleMode: 'e', reason: '사이즈 교환' }
];

type DateFields = { paymentDt: string; invoiceDt: string; deliveryDt: string; deliveryCompleteDt: string; finishDt: string; cancelDt: string };
const ZERO_DT = '0000-00-00 00:00:00';
const emptyDates = (): DateFields => ({ paymentDt: '', invoiceDt: '', deliveryDt: '', deliveryCompleteDt: '', finishDt: '', cancelDt: '' });

// 상태 키 → 헤더/라인 날짜필드 (deriveOrderState가 해석; godoRaw와 동일 규약)
const buildDates = (statusKey: string, orderDate: Date, clamp: (d: Date) => Date): DateFields => {
  const f = emptyDates();
  if (statusKey === 'unpaid') return { ...f, paymentDt: ZERO_DT };
  const paid = fmtDateTime(clamp(orderDate));
  const ship = fmtDateTime(clamp(addDays(orderDate, 1)));
  const done = fmtDateTime(clamp(addDays(orderDate, 3)));
  const finish = fmtDateTime(clamp(addDays(orderDate, 10)));
  if (statusKey === 'paid') return { ...f, paymentDt: paid };
  if (statusKey === 'preparing') return { ...f, paymentDt: paid };
  if (statusKey === 'shipping') return { ...f, paymentDt: paid, invoiceDt: ship, deliveryDt: ship };
  if (statusKey === 'delivered') return { ...f, paymentDt: paid, invoiceDt: ship, deliveryDt: ship, deliveryCompleteDt: done };
  if (statusKey === 'confirmed' || statusKey === 'exchange')
    return { ...f, paymentDt: paid, invoiceDt: ship, deliveryDt: ship, deliveryCompleteDt: done, finishDt: finish };
  // cancel / refund / return → 결제 후 금액 역전(cancelDt)
  if (statusKey === 'return' || statusKey === 'refund')
    return { ...f, paymentDt: paid, invoiceDt: ship, deliveryDt: ship, deliveryCompleteDt: done, cancelDt: fmtDateTime(clamp(addDays(orderDate, 6))) };
  return { ...f, paymentDt: paid, cancelDt: fmtDateTime(clamp(addDays(orderDate, 2))) }; // cancel
};

// ── 메인 생성기 ──────────────────────────────────────────────────────────────
export function buildSyntheticCommerceUniverse(
  products: StandardProduct[],
  options: SyntheticCommerceOptions = {}
): SyntheticCommerceUniverse {
  const seed = options.seed ?? 20260626;
  const months = options.months ?? 12;
  const base = products.filter((p) => p.productId);
  const endBase = options.endDate ? new Date(`${options.endDate}T23:59:59`) : new Date();
  const end = Number.isNaN(endBase.getTime()) ? new Date() : endBase;
  const windowDays = months * 30;
  const clamp = (d: Date): Date => (d.getTime() > end.getTime() ? end : d);
  const endStr = fmtDateTime(end).slice(0, 10);

  const empty: SyntheticCommerceUniverse = {
    meta: { seed, months, endDate: endStr, productCount: base.length, customerCount: 0, orderCount: 0, reviewCount: 0, inquiryCount: 0, sourceType: 'synthetic', syntheticProfile: PROFILE },
    customers: [], orders: [], reviews: [], inquiries: [], contacts: []
  };
  if (base.length === 0) return empty;

  const rng = mulberry32(seed);
  const customerCount = Math.max(1, options.customers ?? 320);

  // 1) 고객 + 주문(raw) 생성 ────────────────────────────────────────────────
  type RawOrder = Record<string, unknown>;
  const rawOrders: RawOrder[] = [];
  const customers: SyntheticCustomerProfile[] = [];
  const contacts: SyntheticCsContact[] = [];
  // 주문→리뷰/문의 생성을 위해 주문 메타 보관
  type OrderMeta = { orderNo: string; customerIdx: number; statusKey: string; isClaim: boolean; claimKind?: string; goodsNo: string; productId: string; categoryCode?: string; brandCode?: string; orderDate: Date; confirmed: boolean };
  const orderMetas: OrderMeta[] = [];

  let orderSeq = 0;
  for (let ci = 0; ci < customerCount; ci++) {
    const seg = pickW(SEGMENTS, rng());
    const nOrders = intIn(rng, seg.ordLo, seg.ordHi);
    const memNo = String(100000 + ci);
    const memId = `syn_user_${pad(ci + 1)}`;
    // 고객 주문일자: 윈도우 내에서 정렬된 nOrders개
    const dayBacks = Array.from({ length: nOrders }, () => Math.floor(Math.pow(rng(), 1.2) * windowDays)).sort((a, b) => b - a);
    let firstDate = '';
    let lastDate = '';
    let totalPaid = 0;
    let refundCount = 0;
    const custOrderNos: string[] = [];

    for (let oi = 0; oi < nOrders; oi++) {
      orderSeq += 1;
      const orderDate = addDays(end, -dayBacks[oi]);
      orderDate.setHours(8 + Math.floor(rng() * 13), Math.floor(rng() * 60), Math.floor(rng() * 60), 0);

      // 클레임 여부 → 상태
      const isClaim = rng() < seg.refundProb;
      const claim = isClaim ? pickW(CLAIM_KIND, rng()) : null;
      const normal = !isClaim ? pickW(NORMAL_STATUS, rng()) : null;
      const statusKey = claim ? claim.v : (normal as { v: string }).v;
      const statusCode = claim ? claim.code : (normal as { code: string }).code;
      const df = buildDates(statusKey, orderDate, clamp);

      // 라인: 1~3개 (aov 영향)
      const lineN = rng() < 0.7 ? 1 : intIn(rng, 2, 3);
      const lines: Record<string, unknown>[] = [];
      let totalGoods = 0;
      let firstP: StandardProduct | undefined;
      for (let l = 0; l < lineN; l++) {
        const p = base[Math.floor(rng() * base.length)];
        if (!firstP) firstP = p;
        const cnt = intIn(rng, 1, 3);
        const price = Math.round((p.price && p.price > 0 ? p.price : 1000 + Math.floor(rng() * 9000)) * seg.aovMul);
        totalGoods += price * cnt;
        const line: Record<string, unknown> = {
          goodsNo: String(p.productId), goodsCd: String(p.productCode), goodsNm: p.productName || 'unknown_product',
          goodsCnt: String(cnt), goodsPrice: String(price), orderStatus: statusCode,
          cateAllCd: p.allCategoryCode || p.categoryCode || '',
          paymentDt: df.paymentDt, invoiceDt: df.invoiceDt, deliveryDt: df.deliveryDt,
          deliveryCompleteDt: df.deliveryCompleteDt, finishDt: df.finishDt, cancelDt: df.cancelDt
        };
        if (claim) {
          line.claimData = { handleMode: claim.handleMode, handleCompleteFl: 'y', handleReason: claim.reason, refundPrice: String(price * cnt), regDt: df.cancelDt || df.finishDt || df.paymentDt };
        }
        lines.push(line);
      }
      const deliveryFee = rng() < 0.2 ? 0 : rng() < 0.85 ? 2500 : 3000;
      const settlePrice = totalGoods + deliveryFee;
      const isFirst = oi === 0;
      const yy = String(orderDate.getFullYear() % 100).padStart(2, '0');
      const orderNo = `${yy}${String(orderDate.getMonth() + 1).padStart(2, '0')}${String(orderDate.getDate()).padStart(2, '0')}${String(orderDate.getHours()).padStart(2, '0')}${String(orderDate.getMinutes()).padStart(2, '0')}${pad(orderSeq)}`;

      rawOrders.push({
        orderNo, memNo, memId, orderStatus: statusCode,
        orderTypeFl: rng() < 0.6 ? 'mobile' : 'pc',
        orderChannelFl: pickW(CHANNEL, rng()).v,
        settleKind: pickW(SETTLE, rng()).v,
        firstSaleFl: isFirst ? 'y' : '',
        orderDate: fmtDateTime(orderDate),
        totalGoodsPrice: String(totalGoods), totalDeliveryCharge: String(deliveryFee), settlePrice: String(settlePrice),
        paymentDt: df.paymentDt, invoiceDt: df.invoiceDt, deliveryDt: df.deliveryDt,
        deliveryCompleteDt: df.deliveryCompleteDt, finishDt: df.finishDt, cancelDt: df.cancelDt,
        orderGoodsData: lines.length === 1 ? lines[0] : lines
      });

      // 고객 집계 (미결제는 매출 미포함)
      const counted = statusKey !== 'unpaid';
      if (counted) totalPaid += settlePrice;
      if (claim && (claim.v === 'refund' || claim.v === 'return')) refundCount += 1;
      const ds = fmtDateTime(orderDate);
      if (!firstDate || ds < firstDate) firstDate = ds;
      if (!lastDate || ds > lastDate) lastDate = ds;
      custOrderNos.push(orderNo);
      orderMetas.push({
        orderNo, customerIdx: ci, statusKey, isClaim: !!claim, claimKind: claim?.v,
        goodsNo: String(firstP!.productId), productId: String(firstP!.productId),
        categoryCode: firstP!.categoryCode || undefined, brandCode: firstP!.brandCode || undefined,
        orderDate, confirmed: statusKey === 'confirmed' || statusKey === 'exchange'
      });
    }

    const memberKey = `syn_member_${memNo}`;
    customers.push({
      customerId: `cust_${pad(ci + 1)}`, memberKey, memNo, memId, segment: seg.key,
      firstOrderDate: firstDate, lastOrderDate: lastDate, orderCount: nOrders,
      totalPaidAmount: totalPaid, averageOrderValue: nOrders ? Math.round(totalPaid / nOrders) : 0,
      repurchaseCount: Math.max(0, nOrders - 1), refundCount, reviewCount: 0,
      sourceType: 'synthetic', syntheticProfile: PROFILE
    });
    // CS contact (fake PII)
    contacts.push({
      customerId: `cust_${pad(ci + 1)}`, memberKey,
      customerName: `가상고객 ${pad(ci + 1)}`, receiverName: `가상수령자 ${pad(ci + 1)}`,
      phone: `010-0000-${pad((ci + 1) % 10000, 4)}`, email: `syn${pad(ci + 1)}@example.test`,
      address: `서울시 테스트구 샘플로 ${1 + (ci % 100)} ${1 + (ci % 50)}동 ${1 + (ci % 20)}호`,
      deliveryMemo: ['문 앞에 놓아주세요', '경비실에 맡겨주세요', '부재 시 연락주세요'][ci % 3],
      refundBank: ['(가상)테스트은행', '(가상)샘플은행', '(가상)데모뱅크'][ci % 3],
      refundAccount: `000-0000-${pad((ci + 1) % 1000000)}`,
      origin: { ...SYNTHETIC_FAKE_PII_ORIGIN }
    });
  }

  // 2) raw → RevenueOrder (real과 같은 mapper 통로) + syntheticSource stamp ──
  const orders = mapOrdersToRevenue(rawOrders, buildProductIndex(base), 'synthetic_test');
  for (const o of orders) {
    o.syntheticSource = PROFILE;
    o.dataKind = 'synthetic';
  }

  // 3) 리뷰 (구매확정 주문 일부) ────────────────────────────────────────────
  const reviews: SyntheticReview[] = [];
  let reviewSeq = 0;
  for (const m of orderMetas) {
    if (!m.confirmed) continue;
    const cust = customers[m.customerIdx];
    const seg = SEGMENTS.find((s) => s.key === cust.segment)!;
    if (rng() > seg.reviewProb) continue;
    // 감성: 재구매 고객 긍정↑, 환불 이력 부정↑
    const posBias = (cust.repurchaseCount > 0 ? 0.15 : 0) - (cust.refundCount > 0 ? 0.25 : 0);
    const r = rng() + posBias;
    const sentiment: SyntheticReview['sentiment'] = r > 0.55 ? 'positive' : r > 0.3 ? 'neutral' : 'negative';
    const rating: SyntheticReview['rating'] = (sentiment === 'positive' ? (rng() < 0.6 ? 5 : 4) : sentiment === 'neutral' ? 3 : rng() < 0.6 ? 2 : 1) as SyntheticReview['rating'];
    const topic = pickW(
      [
        { v: 'quality', w: 0.3 }, { v: 'effect', w: 0.2 }, { v: 'delivery', w: 0.15 },
        { v: 'price', w: 0.12 }, { v: 'packaging', w: 0.1 }, { v: 'repurchase', w: 0.08 }, { v: 'refund', w: 0.05 }
      ],
      rng()
    ).v as SyntheticReview['topic'];
    reviewSeq += 1;
    cust.reviewCount += 1;
    reviews.push({
      reviewId: `rev_${pad(reviewSeq)}`, orderNo: m.orderNo, customerId: cust.customerId, memberKey: cust.memberKey,
      productId: m.productId, goodsNo: m.goodsNo, categoryCode: m.categoryCode, brandCode: m.brandCode,
      rating, sentiment, topic, createdAt: fmtDateTime(clamp(addDays(m.orderDate, 12))),
      sourceType: 'synthetic', syntheticProfile: PROFILE
    });
  }

  // 4) 문의/CS 이슈 (주문/클레임 이벤트 기반) ────────────────────────────────
  const inquiries: SyntheticInquiry[] = [];
  let inqSeq = 0;
  const INQ_TEXT: Record<string, string> = {
    delivery: '배송이 언제 도착하나요? 배송지가 잘못 입력된 것 같아요.',
    payment: '결제가 두 번 된 것 같은데 확인 부탁드려요.',
    refund: '환불은 언제 처리되나요?',
    exchange: '상품 교환 가능한가요? 사이즈가 안 맞아요.',
    product_question: '이 상품 사용법이 궁금합니다.',
    stock: '재입고 예정일이 있나요?',
    coupon: '쿠폰 적용이 안 돼요.',
    account: '회원정보 변경은 어떻게 하나요?'
  };
  for (const m of orderMetas) {
    // 클레임 주문은 거의 문의 발생, 정상 주문은 일부
    const claimTopic = m.claimKind === 'refund' ? 'refund' : m.claimKind === 'return' ? 'refund' : m.claimKind === 'exchange' ? 'exchange' : m.claimKind === 'cancel' ? 'payment' : null;
    const makeInq = m.isClaim ? rng() < 0.7 : rng() < 0.12;
    if (!makeInq) continue;
    const cust = customers[m.customerIdx];
    const topic = (claimTopic ??
      pickW(
        [
          { v: 'delivery', w: 0.3 }, { v: 'product_question', w: 0.2 }, { v: 'stock', w: 0.15 },
          { v: 'payment', w: 0.12 }, { v: 'coupon', w: 0.1 }, { v: 'account', w: 0.08 }, { v: 'exchange', w: 0.05 }
        ],
        rng()
      ).v) as SyntheticInquiry['topic'];
    const urgency: SyntheticInquiry['urgency'] = m.isClaim || topic === 'refund' ? (rng() < 0.5 ? 'high' : 'medium') : rng() < 0.3 ? 'medium' : 'low';
    const status: SyntheticInquiry['status'] = rng() < 0.5 ? 'answered' : rng() < 0.7 ? 'unanswered' : 'needs_human';
    inqSeq += 1;
    inquiries.push({
      inquiryId: `inq_${pad(inqSeq)}`, customerId: cust.customerId, memberKey: cust.memberKey,
      productId: m.productId, goodsNo: m.goodsNo, orderNo: m.orderNo, categoryCode: m.categoryCode, brandCode: m.brandCode,
      topic, status, urgency, inquiryText: INQ_TEXT[topic], createdAt: fmtDateTime(clamp(addDays(m.orderDate, 2))),
      sourceType: 'synthetic', syntheticProfile: PROFILE
    });
  }

  return {
    meta: { seed, months, endDate: endStr, productCount: base.length, customerCount: customers.length, orderCount: orders.length, reviewCount: reviews.length, inquiryCount: inquiries.length, sourceType: 'synthetic', syntheticProfile: PROFILE },
    customers, orders, reviews, inquiries, contacts
  };
}
