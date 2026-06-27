// CS Inquiry Order Grounding (Audit v0) — 문의 ↔ 주문/결제/클레임 facts 대조 감사.
//
// 목적: CS 문의의 orderNo가 실제 revenue.orders와 매칭되는지 감사하고, 매칭된 주문에서
//   CS 답변 초안에 "안전하게" 넣을 수 있는 facts(결제상태/금액/주문일/취소·환불·클레임)를
//   추출 가능한지 확인한다. 그리고 facts가 없을 때 "확인한 결과/중복결제 아닙니다/환불
//   처리되었습니다" 같은 확정 표현을 쓰지 못하도록 하는 evidence policy를 함께 제공한다.
//
// 원칙(이 모듈이 지켜야 하는 것):
//   - 순수 함수만. LLM 호출 없음. smoke로 단위 검증 가능해야 한다.
//   - PII 절대 미포함: 이름/전화/주소/이메일/계좌/배송메모를 입력으로도 받지 않는다.
//     입력은 safe inquiry(연락처 없음) + RevenueOrderLite(PII 없음, 가명 memberKey만).
//   - memberKey는 분석용 "가명 키"로만 취급(중복주문 후보 anchor 용도).
//   - PG 승인번호/transaction id/카드 승인번호/결제 시도 로그는 주문 데이터에 없다 →
//     중복결제 "최종 확정"은 항상 결제 원장(외부) 확인이 필요하다고 missingData로 안내한다.
//
// ⚠️ 입력 타입은 departmentDataService 의 SafeSyntheticInquiry / RevenueOrderLite 와
//    "구조적으로 호환"되도록 정의했다(여기서 import 하지 않아 helper를 순수하게 유지).

// ── 입력(구조적 호환) ─────────────────────────────────────────────────────────
// SafeSyntheticInquiry 호환(연락처 없음). orderNo는 optional(real 전환 시 없을 수 있음).
export interface GroundingInquiry {
  inquiryId: string;
  orderNo?: string;
  goodsNo?: string;
  productId?: string;
  topic?: string;
  status?: string;
  urgency?: string;
  createdAt?: string;
  title?: string;
  excerpt?: string;
}

// RevenueOrderLite.lines 호환
export interface GroundingOrderLine {
  goodsNo: string;
  goodsName: string;
  quantity: number;
  lineRevenue: number;
}

// RevenueOrderLite 호환(PII 없음, 가명 memberKey만)
export interface GroundingOrder {
  orderNo: string;
  orderDate: string;
  sourceType?: string; // 'real_godomall' | 'synthetic_test'
  deliveryFee: number;
  totalAmount: number;
  productRevenueByLines: number;
  paid: boolean;
  unpaid?: boolean;
  confirmed?: boolean;
  canceled: boolean;
  lines: GroundingOrderLine[];
  memberKey?: string;
  paymentMethodCode?: string;
  orderChannel?: string;
  claim?: { hasClaim: boolean; claimTypes: string[]; claimAmount?: number };
}

// ── 산출 타입 ─────────────────────────────────────────────────────────────────
export interface InquiryOrderAuditSample {
  inquiryId: string;
  orderNo?: string;
  productName?: string;
  topic?: string;
  matched: boolean;
  missingReason?: string;
}

export interface InquiryOrderAuditResult {
  totalInquiries: number;
  inquiriesWithOrderNo: number;
  matchedInquiries: number;
  unmatchedInquiries: number;
  orderNoHoldingRate: number; // inquiriesWithOrderNo / totalInquiries (0..1)
  matchRate: number; // matchedInquiries / totalInquiries (0..1)
  matchRateAmongWithOrderNo: number; // matchedInquiries / inquiriesWithOrderNo (0..1)
  samples: InquiryOrderAuditSample[];
}

export interface AssociatedOrderFacts {
  orderNo: string;
  matched: boolean;

  orderDate?: string;
  paymentDate?: string; // RevenueOrderLite에 결제일시 없음 → 현재 항상 미확정(missingData 참조)
  paid?: boolean;

  orderAmount?: number;
  paidAmount?: number;
  goodsAmount?: number;
  deliveryCharge?: number;

  productNames?: string[];
  goodsNos?: string[];

  canceled?: boolean;
  cancelDate?: string; // RevenueOrderLite에 취소일시 없음 → 미확정

  refunded?: boolean;
  returned?: boolean;
  exchanged?: boolean;
  claimSummary?: {
    claimCount?: number;
    claimTypes?: string[];
    claimAmount?: number;
  };

  memberKey?: string; // 분석용 가명 키(중복주문 후보 anchor). PII 아님.
  sourceType?: 'real_godomall' | 'synthetic_test' | string;
  syntheticSource?: string;

  missingData: string[];
}

export interface DuplicatePaymentCandidate {
  orderNo: string;
  memberKey?: string;
  orderDate: string;
  totalAmount: number;
  paid: boolean;
  sharedGoodsNos: string[];
  hoursApart: number;
  reason: string;
}

export interface DuplicatePaymentResult {
  anchorOrderNo?: string;
  anchorMatched: boolean;
  candidates: DuplicatePaymentCandidate[];
  // 주문 데이터만으로는 확정 불가한 항목(결제 원장 필요)
  confirmationLimits: string[];
  note: string;
}

export interface ResponseEvidencePolicy {
  hasMatchedOrder: boolean;
  allowedClaims: string[]; // facts 근거로 CS가 안전하게 말할 수 있는 것
  forbiddenClaims: string[]; // facts 없이는 금지된 확정 표현
  missingData: string[];
  guidance: string;
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────
// 주문 데이터에 절대 존재하지 않는(결제 원장 필요) 필드 — 중복결제 최종 확정용.
const PAYMENT_LEDGER_ONLY = [
  'pgApprovalNo',
  'transactionId',
  'cardApprovalNo',
  'paymentAttemptLog',
  'cardTempApproval'
] as const;

// RevenueOrderLite가 떨어뜨리는(서버 RevenueOrder엔 있으나 Lite엔 없는) 일시 필드.
const LITE_DROPPED_DATE_FIELDS = ['paymentDate', 'cancelDate'] as const;

const indexOrdersByOrderNo = (orders: GroundingOrder[]): Map<string, GroundingOrder> => {
  const m = new Map<string, GroundingOrder>();
  for (const o of orders) if (o.orderNo) m.set(o.orderNo, o);
  return m;
};

const firstProductName = (o: GroundingOrder): string | undefined =>
  o.lines.find((l) => l.goodsName)?.goodsName;

const parseDateMs = (s?: string): number => {
  if (!s) return NaN;
  // 'YYYY-MM-DD HH:MM:SS' → ISO 호환
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? NaN : t;
};

const claimTypesOf = (o: GroundingOrder): string[] =>
  o.claim?.claimTypes && Array.isArray(o.claim.claimTypes) ? o.claim.claimTypes : [];

// ── 1) 문의 ↔ 주문 매칭 감사 ──────────────────────────────────────────────────
export function auditInquiryOrderGrounding(params: {
  inquiries: GroundingInquiry[];
  orders: GroundingOrder[];
  sampleLimit?: number;
}): InquiryOrderAuditResult {
  const inquiries = params.inquiries || [];
  const orders = params.orders || [];
  const sampleLimit = params.sampleLimit ?? 20;
  const byOrderNo = indexOrdersByOrderNo(orders);

  let inquiriesWithOrderNo = 0;
  let matchedInquiries = 0;
  const samples: InquiryOrderAuditSample[] = [];

  for (const q of inquiries) {
    const hasOrderNo = !!(q.orderNo && q.orderNo.trim());
    if (hasOrderNo) inquiriesWithOrderNo += 1;
    const matchedOrder = hasOrderNo ? byOrderNo.get(q.orderNo as string) : undefined;
    const matched = !!matchedOrder;
    if (matched) matchedInquiries += 1;

    if (samples.length < sampleLimit) {
      const missingReason = !hasOrderNo
        ? 'inquiry에 orderNo 없음'
        : !matched
          ? 'orderNo가 revenue.orders에 없음'
          : undefined;
      samples.push({
        inquiryId: q.inquiryId,
        orderNo: q.orderNo,
        productName: matchedOrder ? firstProductName(matchedOrder) : undefined,
        topic: q.topic,
        matched,
        ...(missingReason ? { missingReason } : {})
      });
    }
  }

  const total = inquiries.length;
  const rate = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 1000) / 1000 : 0);
  return {
    totalInquiries: total,
    inquiriesWithOrderNo,
    matchedInquiries,
    unmatchedInquiries: total - matchedInquiries,
    orderNoHoldingRate: rate(inquiriesWithOrderNo, total),
    matchRate: rate(matchedInquiries, total),
    matchRateAmongWithOrderNo: rate(matchedInquiries, inquiriesWithOrderNo),
    samples
  };
}

// ── 2) 매칭 주문 → 안전한 associatedOrderFacts ─────────────────────────────────
export function buildAssociatedOrderFacts(
  inquiry: GroundingInquiry,
  orders: GroundingOrder[]
): AssociatedOrderFacts {
  const orderNo = (inquiry.orderNo || '').trim();
  const order = orderNo ? indexOrdersByOrderNo(orders).get(orderNo) : undefined;

  // 항상 안내되는 한계(결제 원장 필요 + Lite가 떨어뜨린 일시).
  const baseMissing = [...LITE_DROPPED_DATE_FIELDS, ...PAYMENT_LEDGER_ONLY];

  if (!order) {
    return {
      orderNo,
      matched: false,
      missingData: [orderNo ? 'orderNo가 revenue.orders에 없음' : 'inquiry에 orderNo 없음', ...baseMissing]
    };
  }

  const types = claimTypesOf(order);
  const canceled = order.canceled || types.includes('cancel');
  const facts: AssociatedOrderFacts = {
    orderNo: order.orderNo,
    matched: true,
    orderDate: order.orderDate || undefined,
    paid: order.paid,
    orderAmount: order.totalAmount,
    paidAmount: order.paid ? order.totalAmount : undefined,
    goodsAmount: order.productRevenueByLines,
    deliveryCharge: order.deliveryFee,
    productNames: order.lines.map((l) => l.goodsName).filter((n) => !!n),
    goodsNos: order.lines.map((l) => l.goodsNo).filter((n) => !!n),
    canceled,
    // refunded/returned/exchanged 는 claimTypes 로만 판단(서버 state.refunded/returned 는 v0 항상 false).
    refunded: types.includes('refund'),
    returned: types.includes('return'),
    exchanged: types.includes('exchange'),
    ...(order.claim?.hasClaim
      ? {
          claimSummary: {
            claimCount: types.length,
            claimTypes: types,
            ...(order.claim.claimAmount !== undefined ? { claimAmount: order.claim.claimAmount } : {})
          }
        }
      : {}),
    ...(order.memberKey ? { memberKey: order.memberKey } : {}),
    ...(order.sourceType ? { sourceType: order.sourceType } : {}),
    // RevenueOrderLite는 syntheticSource를 싣지 않음(서버 RevenueOrder엔 있음) → 미확정.
    missingData: [...baseMissing, 'claimCompletionStatus(클레임 완료 여부 미확정)']
  };
  return facts;
}

// ── 3) 중복결제 의심 후보 탐지(주문 데이터 한정) ───────────────────────────────
export function findDuplicatePaymentCandidates(
  inquiry: GroundingInquiry,
  orders: GroundingOrder[],
  options: { amountTolerancePct?: number; timeWindowHours?: number; requireSharedGoods?: boolean } = {}
): DuplicatePaymentResult {
  const amountTolerancePct = options.amountTolerancePct ?? 0; // 0 = 정확히 같은 금액
  const timeWindowHours = options.timeWindowHours ?? 72;
  const requireSharedGoods = options.requireSharedGoods ?? true;

  const confirmationLimits = [...PAYMENT_LEDGER_ONLY];
  const baseNote =
    '주문 데이터 기준 "유사 주문 후보"만 제시한다. PG 승인내역/카드 승인번호/transaction id 기준 ' +
    '최종 중복결제 여부는 결제 원장(외부) 확인이 필요하다.';

  const anchorNo = (inquiry.orderNo || '').trim();
  const anchor = anchorNo ? indexOrdersByOrderNo(orders).get(anchorNo) : undefined;
  if (!anchor || !anchor.memberKey) {
    return {
      anchorOrderNo: anchorNo || undefined,
      anchorMatched: !!anchor,
      candidates: [],
      confirmationLimits,
      note: anchor ? `${baseNote} (anchor 주문에 memberKey 없음 → 후보 탐지 불가)` : `${baseNote} (anchor 주문 매칭 실패)`
    };
  }

  const anchorMs = parseDateMs(anchor.orderDate);
  const anchorGoods = new Set(anchor.lines.map((l) => l.goodsNo).filter(Boolean));
  const tol = Math.abs(anchor.totalAmount) * (amountTolerancePct / 100);

  const candidates: DuplicatePaymentCandidate[] = [];
  for (const o of orders) {
    if (!o.orderNo || o.orderNo === anchor.orderNo) continue;
    if (o.memberKey !== anchor.memberKey) continue;
    const amountOk = Math.abs(o.totalAmount - anchor.totalAmount) <= tol;
    if (!amountOk) continue;

    const oMs = parseDateMs(o.orderDate);
    const hoursApart =
      Number.isNaN(anchorMs) || Number.isNaN(oMs) ? NaN : Math.abs(oMs - anchorMs) / 3600000;
    const timeOk = Number.isNaN(hoursApart) ? false : hoursApart <= timeWindowHours;
    if (!timeOk) continue;

    const shared = o.lines.map((l) => l.goodsNo).filter((g) => g && anchorGoods.has(g));
    if (requireSharedGoods && shared.length === 0) continue;

    candidates.push({
      orderNo: o.orderNo,
      memberKey: o.memberKey,
      orderDate: o.orderDate,
      totalAmount: o.totalAmount,
      paid: o.paid,
      sharedGoodsNos: [...new Set(shared)],
      hoursApart: Math.round(hoursApart * 10) / 10,
      reason:
        `같은 memberKey · 금액 차 ${Math.abs(o.totalAmount - anchor.totalAmount).toLocaleString()}원 · ` +
        `${Math.round(hoursApart)}시간 차${shared.length ? ` · 공통상품 ${shared.length}건` : ''}`
    });
  }
  candidates.sort((a, b) => a.hoursApart - b.hoursApart);

  return {
    anchorOrderNo: anchor.orderNo,
    anchorMatched: true,
    candidates,
    confirmationLimits,
    note: candidates.length
      ? `${baseNote} (유사 주문 후보 ${candidates.length}건)`
      : `${baseNote} (현재 연결된 주문 데이터에서는 동일 주문의 중복 결제 후보가 확인되지 않음)`
  };
}

// ── 4) 답변 근거 정책(facts 없이 확정 표현 금지) ───────────────────────────────
const ALWAYS_FORBIDDEN = [
  '결제 원장 없이 "중복결제가 아닙니다"라고 단정',
  '결제 원장 없이 "중복결제가 맞습니다"라고 단정',
  'PG 승인내역 확인 없이 "결제 승인내역을 확인한 결과"라고 단정'
];

export function evaluateResponseEvidencePolicy(facts: AssociatedOrderFacts): ResponseEvidencePolicy {
  if (!facts.matched) {
    return {
      hasMatchedOrder: false,
      allowedClaims: [
        '문의 내용을 접수했고 주문 데이터를 추가 확인하겠다는 안내',
        '문의에 연결된 주문번호가 현재 데이터에서 확인되지 않는다는 사실 안내(있을 때)'
      ],
      forbiddenClaims: [
        '"고객님의 결제 내역을 확인한 결과"',
        '"중복결제가 아닙니다"',
        '"환불 처리되었습니다"',
        '"취소 완료되었습니다"',
        '"확인 결과 문제 없습니다"',
        ...ALWAYS_FORBIDDEN
      ],
      missingData: [...facts.missingData],
      guidance:
        '주문 facts가 없다. 확인/완료/이상없음 류 확정 표현을 절대 쓰지 마라. ' +
        '"주문 데이터를 추가 확인 후 안내드리겠습니다" 수준으로만 답하라.'
    };
  }

  const allowed: string[] = [];
  // 결제상태
  allowed.push(
    facts.paid
      ? '현재 연결된 주문 데이터 기준 "결제완료" 상태로 확인된다는 안내'
      : '현재 연결된 주문 데이터 기준 "미결제/결제 미완료" 상태로 보인다는 안내'
  );
  // 금액
  if (facts.orderAmount !== undefined) allowed.push('주문/결제 금액(연결된 주문 데이터 기준) 안내');
  if (facts.orderDate) allowed.push('주문일(연결된 주문 데이터 기준) 안내');
  // 클레임
  if (facts.canceled) allowed.push('해당 주문에 "취소 내역"이 있다는 사실 안내(완료 여부는 미확정)');
  if (facts.refunded) allowed.push('해당 주문에 "환불 클레임 내역"이 있다는 사실 안내(완료 여부는 미확정)');
  if (facts.returned) allowed.push('해당 주문에 "반품 클레임 내역"이 있다는 사실 안내(완료 여부는 미확정)');
  if (facts.exchanged) allowed.push('해당 주문에 "교환 클레임 내역"이 있다는 사실 안내(완료 여부는 미확정)');

  const forbidden = [
    '"환불 처리되었습니다"(완료 단정 — 완료 여부 미확정)',
    '"취소 완료되었습니다"(완료 단정 — 완료 여부 미확정)',
    '"중복결제가 아닙니다"(PG 원장 없이 단정)',
    'PG 승인내역을 확인했다는 표현',
    ...ALWAYS_FORBIDDEN
  ];

  return {
    hasMatchedOrder: true,
    allowedClaims: allowed,
    forbiddenClaims: forbidden,
    missingData: [...facts.missingData],
    guidance:
      '주문 facts가 있다. 반드시 "현재 연결된 주문 데이터 기준으로는…"으로 범위를 한정해 사실만 전달하라. ' +
      '클레임은 "내역 존재"까지만 말하고 "처리 완료"로 단정하지 마라. ' +
      '중복결제 최종 여부 및 PG 승인내역은 결제 원장 확인이 필요하다고 안내하라.'
  };
}

// ── 5) 감사 요약 문자열(문서/로그용) ──────────────────────────────────────────
export function summarizeInquiryOrderGroundingAudit(audit: InquiryOrderAuditResult): string {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  return (
    `총 문의 ${audit.totalInquiries}건 · orderNo 보유 ${audit.inquiriesWithOrderNo}건(${pct(audit.orderNoHoldingRate)}) · ` +
    `매칭 ${audit.matchedInquiries}건(${pct(audit.matchRate)}) · 미매칭 ${audit.unmatchedInquiries}건 · ` +
    `orderNo 보유분 중 매칭률 ${pct(audit.matchRateAmongWithOrderNo)}`
  );
}
