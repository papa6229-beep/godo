// CS Draft Composer Grounding v0 — 연결 주문 facts 기반 "고객 발송용 답변 초안" 생성기.
//
// 철학(작업지시서 §2):
//   - 기본 출력은 고객에게 보낼 최종 초안(customerDraft) 1개만.
//   - evidenceSummary/missingData/prohibitedClaims/riskLevel/requiresHumanCheck는 내부 메타데이터.
//   - 종결 가능한 건은 바로 종결형으로, 고객에게 불필요한 기다림/추가 행동을 요구하지 않는다.
//   - 고객에게 PG 승인번호/transactionId/missingData 같은 내부 필드명을 설명하지 않는다.
//   - facts로 확정 불가한 고위험 건만 운영자 내부 플래그(requiresHumanCheck)로 남긴다.
//
// 안전(작업지시서 §10/§13):
//   - facts 없이 "확인한 결과" 금지 / 중복 후보 있는데 "중복결제 아닙니다" 금지 /
//     claimCompletionStatus 없이 "환불·취소·반품·교환 완료" 금지 / 배송 tracking 없이 "배송 완료/오늘 도착" 금지.
//   - customerDraft·internalNote에 PII/fake contact/memberKey 노출 금지.
//   - 전부 순수 함수. LLM 호출 없음.

import {
  buildAssociatedOrderFacts,
  findDuplicatePaymentCandidates,
  evaluateResponseEvidencePolicy,
  type GroundingInquiry,
  type GroundingOrder,
  type AssociatedOrderFacts,
  type ResponseEvidencePolicy
} from './csInquiryOrderGrounding';

export type CsDraftTopic =
  | 'payment'
  | 'refund'
  | 'cancel'
  | 'return'
  | 'exchange'
  | 'delivery'
  | 'product'
  | 'general';

export interface CsDraftInquiry {
  inquiryId: string;
  orderNo?: string;
  productName?: string;
  goodsNo?: string;
  topic?: string;
  status?: string;
  urgency?: string;
  title?: string;
  excerpt?: string;
  createdAt?: string;
}

export interface CsDraftComposerInput {
  inquiry: CsDraftInquiry;
  associatedOrderFacts?: AssociatedOrderFacts;
  evidencePolicy?: ResponseEvidencePolicy;
}

export type CsRiskLevel = 'low' | 'medium' | 'high';

export interface CsDraftComposerResult {
  customerDraft: string;
  // 내부 메타데이터(기본 화면 미노출)
  topic: CsDraftTopic;
  evidenceSummary: string[];
  missingData: string[];
  prohibitedClaims: string[];
  allowedClaims: string[];
  riskLevel: CsRiskLevel;
  requiresHumanCheck: boolean;
  customerActionRequested: boolean;
  internalNote?: string;
}

// ── 안전 패턴 ─────────────────────────────────────────────────────────────────
const PII_RE = /고객님\s*성함|[가-힣]{2,4}\s*고객님께|010-\d{3,4}-\d{4}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[가-힣]+(로|길)\s*\d+|\d{2,}-\d{2,}-\d{2,}|가상고객|가상수령자/;
const INTERNAL_FIELD_RE = /missingData|pgApprovalNo|cardApprovalNo|paymentAttemptLog|cardTempApproval|transactionId|claimCompletionStatus|memberKey|syn_member_|real_member_/i;
const INTERNAL_TERM_RE = /PG\s*승인번호|카드\s*승인번호|결제\s*원장|트랜잭션\s*아이디|transaction\s*id/i;
const COMPLETION_RE = /환불\s*완료|취소\s*완료|반품\s*완료|교환\s*완료|환불\s*처리되었습니다|취소\s*처리되었습니다|취소\s*완료되었습니다|환불되었습니다|취소되었습니다|반품되었습니다|교환되었습니다/;
const DELIVERY_DONE_RE = /배송\s*완료|오늘\s*도착|택배사\s*확인\s*완료|배송이\s*완료/;
const DUP_DENY_RE = /중복\s*결제(가)?\s*아닙니다|이중\s*결제(는)?\s*없습니다|중복\s*결제\s*내역(은|이)?\s*확인되지\s*않/;
const CONFIRMED_RESULT_RE = /확인한\s*결과/;

// ── topic 정규화 ──────────────────────────────────────────────────────────────
export function normalizeCsTopic(t?: string): CsDraftTopic {
  const s = (t || '').toLowerCase();
  if (/refund|환불/.test(s)) return 'refund';
  if (/cancel|취소/.test(s)) return 'cancel';
  if (/return|반품/.test(s)) return 'return';
  if (/exchange|교환/.test(s)) return 'exchange';
  if (/payment|pay|결제|중복/.test(s)) return 'payment';
  if (/delivery|ship|배송/.test(s)) return 'delivery';
  if (/product|goods|상품/.test(s)) return 'product';
  return 'general';
}

const GREET = '안녕하세요, 고객님.';
const THANKS = '감사합니다.';
const draft = (...lines: string[]): string => lines.join('\n');

const claimActionWord = (topic: CsDraftTopic): string =>
  topic === 'refund' ? '환불' : topic === 'return' ? '반품' : topic === 'exchange' ? '교환' : topic === 'cancel' ? '취소' : '취소/환불';

// ── evidenceSummary(내부, PII/memberKey 제외) ─────────────────────────────────
const buildEvidenceSummary = (facts?: AssociatedOrderFacts): string[] => {
  if (!facts) return ['연결 주문 facts 없음'];
  if (!facts.matched) return [`주문 매칭 실패(orderNo=${facts.orderNo || '없음'})`];
  const out: string[] = [`주문 매칭: 예(orderNo=${facts.orderNo})`];
  out.push(`결제상태: ${facts.paid ? '결제완료' : '미결제/미완료'}`);
  if (facts.orderAmount !== undefined) out.push(`주문금액: ${facts.orderAmount.toLocaleString()}원`);
  const types = facts.claimSummary?.claimTypes || [];
  if (types.length) out.push(`클레임: ${types.join(', ')} (완료 여부 미확정)`);
  const dup = facts.duplicatePaymentCandidates || [];
  if (dup.length) out.push(`중복 주문 후보: ${dup.length}건(${dup.slice(0, 3).map((c) => c.orderNo).join(', ')})`);
  return out;
};

// ── 본문 생성(검수 전 1차 초안) ───────────────────────────────────────────────
interface DraftPick {
  customerDraft: string;
  riskLevel: CsRiskLevel;
  requiresHumanCheck: boolean;
  customerActionRequested: boolean;
  internalNote?: string;
}

const pickDraft = (topic: CsDraftTopic, inq: CsDraftInquiry, facts?: AssociatedOrderFacts): DraftPick => {
  const matched = facts?.matched === true;
  const dup = facts?.duplicatePaymentCandidates || [];
  const claimTypes = facts?.claimSummary?.claimTypes || [];

  // payment ──────────────────────────────────────────────────────────────────
  if (topic === 'payment') {
    if (!matched) {
      return {
        customerDraft: draft(GREET, '문의 주신 결제 건을 확인하기 위해 주문번호 또는 결제내역 확인이 필요합니다.', '', '관련 정보를 보내주시면 바로 확인 도와드리겠습니다.', THANKS),
        riskLevel: 'medium', requiresHumanCheck: false, customerActionRequested: true
      };
    }
    if (dup.length) {
      return {
        customerDraft: draft(GREET, '문의 주신 결제 건은 동일 금액의 결제 이력이 함께 확인되어 확인이 필요한 상태입니다.', '', '확인 후 필요한 조치를 도와드리겠습니다.', '불편을 드려 죄송합니다.'),
        riskLevel: 'high', requiresHumanCheck: true, customerActionRequested: false,
        internalNote: `동일 금액 결제 후보 ${dup.length}건(${dup.slice(0, 3).map((c) => c.orderNo).join(', ')}). 처리 전 결제 원장(PG/카드 승인내역) 확인 필요.`
      };
    }
    return {
      customerDraft: draft(GREET, '문의 주신 결제 건 확인 결과, 현재 주문 기준으로는 해당 상품 결제 건이 1건만 확인됩니다.', '', '중복 결제 내역은 확인되지 않았습니다.', THANKS),
      riskLevel: 'low', requiresHumanCheck: false, customerActionRequested: false
    };
  }

  // refund / cancel / return / exchange ────────────────────────────────────────
  if (topic === 'refund' || topic === 'cancel' || topic === 'return' || topic === 'exchange') {
    // cancel은 cancelDt(=canceled flag)로 상태 확정 가능 → "내역 확인" 종결형(완료 단정은 안 함).
    if (topic === 'cancel' && facts?.canceled) {
      return {
        customerDraft: draft(GREET, '문의 주신 주문 건은 취소 내역이 확인됩니다.', '', '결제 취소 반영은 결제수단에 따라 영업일 기준으로 시간이 소요될 수 있습니다.', THANKS),
        riskLevel: 'medium', requiresHumanCheck: false, customerActionRequested: false
      };
    }
    // 그 외: 완료 여부 미확정(claimCompletionStatus 없음) → "확인이 필요한 상태"
    return {
      customerDraft: draft(GREET, `문의 주신 주문 건은 ${claimActionWord(topic)} 확인이 필요한 상태입니다.`, '', '처리 내역 확인 후 필요한 조치를 도와드리겠습니다.', THANKS),
      riskLevel: claimTypes.length ? 'high' : 'medium', requiresHumanCheck: true, customerActionRequested: false,
      internalNote: `${claimActionWord(topic)} 관련. claimCompletionStatus 미확정 → 처리 완료 단정 금지, 운영자 처리내역 확인 필요.`
    };
  }

  // delivery ───────────────────────────────────────────────────────────────────
  if (topic === 'delivery') {
    // associatedOrderFacts에는 배송 tracking facts가 없음 → 확정 금지, 확인 필요 안내.
    return {
      customerDraft: draft(GREET, '문의 주신 주문 건의 배송 상태 확인이 필요한 상태입니다.', '', '확인 후 필요한 안내 도와드리겠습니다.', THANKS),
      riskLevel: 'medium', requiresHumanCheck: true, customerActionRequested: false,
      internalNote: '배송 tracking facts 미연결 → 배송 완료/도착 단정 금지, 택배 상태 확인 필요.'
    };
  }

  // product ──────────────────────────────────────────────────────────────────
  if (topic === 'product') {
    const sameGoods = !!(matched && inq.goodsNo && facts?.goodsNos?.includes(inq.goodsNo));
    if (sameGoods) {
      return {
        customerDraft: draft(GREET, '문의 주신 상품은 현재 주문 상품과 동일한 상품으로 확인됩니다.', '', THANKS),
        riskLevel: 'low', requiresHumanCheck: false, customerActionRequested: false
      };
    }
    return {
      customerDraft: draft(GREET, '문의 주신 상품 내용 확인했습니다.', '', '상품 이용에 불편이 없도록 확인 후 안내 도와드리겠습니다.', THANKS),
      riskLevel: 'low', requiresHumanCheck: false, customerActionRequested: false
    };
  }

  // general ──────────────────────────────────────────────────────────────────
  return {
    customerDraft: matched
      ? draft(GREET, '문의 내용 확인했습니다.', '', '필요한 안내 도와드리겠습니다.', THANKS)
      : draft(GREET, '문의 내용 확인했습니다.', '', '확인 후 필요한 안내 도와드리겠습니다.', THANKS),
    riskLevel: 'low', requiresHumanCheck: false, customerActionRequested: false
  };
};

// ── 안전 검수 (작업지시서 §10) ────────────────────────────────────────────────
const SAFE_FALLBACK = draft(GREET, '문의 내용 확인 후 필요한 안내 도와드리겠습니다.', THANKS);
const raise = (a: CsRiskLevel, b: CsRiskLevel): CsRiskLevel => {
  const order: CsRiskLevel[] = ['low', 'medium', 'high'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
};

export function validateCsDraftAgainstEvidencePolicy(
  result: CsDraftComposerResult,
  input: CsDraftComposerInput
): CsDraftComposerResult {
  const facts = input.associatedOrderFacts;
  const matched = facts?.matched === true;
  const dupCount = facts?.duplicatePaymentCandidates?.length || 0;
  const claimCompletionKnown = false; // v0: claimCompletionStatus 항상 미확정
  const deliveryTrackingKnown = false; // v0: 배송 tracking facts 미연결
  const d = result.customerDraft;
  const violations: string[] = [];

  if (!matched && CONFIRMED_RESULT_RE.test(d)) violations.push('주문 facts 없이 "확인한 결과" 사용');
  if (dupCount > 0 && DUP_DENY_RE.test(d)) violations.push('중복 후보가 있는데 "중복결제 아닙니다/이중결제 없음" 사용');
  if (INTERNAL_TERM_RE.test(d)) violations.push('고객에게 내부 결제 필드명(PG 승인번호/transaction id 등) 노출');
  if (!claimCompletionKnown && COMPLETION_RE.test(d)) violations.push('claimCompletionStatus 없이 "환불/취소/반품/교환 완료" 표현');
  if (!deliveryTrackingKnown && DELIVERY_DONE_RE.test(d)) violations.push('배송 tracking 없이 "배송 완료/오늘 도착" 표현');
  if (INTERNAL_FIELD_RE.test(d)) violations.push('고객 초안에 내부 필드명/식별자 노출');
  if (PII_RE.test(d)) violations.push('고객 초안에 PII 노출');

  if (violations.length === 0) return result;
  return {
    ...result,
    customerDraft: SAFE_FALLBACK,
    prohibitedClaims: [...new Set([...result.prohibitedClaims, ...violations])],
    riskLevel: raise(result.riskLevel, 'high'),
    requiresHumanCheck: true,
    internalNote: [result.internalNote, `정책 위반 교정됨: ${violations.join(' / ')}`].filter(Boolean).join(' | ')
  };
}

// ── 메인 composer ─────────────────────────────────────────────────────────────
export function composeCsDraft(input: CsDraftComposerInput): CsDraftComposerResult {
  const topic = normalizeCsTopic(input.inquiry.topic);
  const facts = input.associatedOrderFacts;
  const policy = input.evidencePolicy ?? (facts ? evaluateResponseEvidencePolicy(facts) : undefined);
  const pick = pickDraft(topic, input.inquiry, facts);

  const base: CsDraftComposerResult = {
    customerDraft: pick.customerDraft,
    topic,
    evidenceSummary: buildEvidenceSummary(facts),
    missingData: facts?.missingData ? [...facts.missingData] : [],
    prohibitedClaims: [],
    allowedClaims: policy?.allowedClaims ? [...policy.allowedClaims] : [],
    riskLevel: pick.riskLevel,
    requiresHumanCheck: pick.requiresHumanCheck,
    customerActionRequested: pick.customerActionRequested,
    ...(pick.internalNote ? { internalNote: pick.internalNote } : {})
  };
  // 항상 자체 검수 통과시킨 결과를 반환(외부에서 또 호출해도 idempotent).
  return validateCsDraftAgainstEvidencePolicy(base, input);
}

// ── 편의: inquiry + orders → 초안 (facts/중복후보/policy 자동 구성) ────────────
export function composeCsDraftFromOrders(
  inquiry: CsDraftInquiry,
  orders: GroundingOrder[]
): CsDraftComposerResult {
  const probe: GroundingInquiry = { inquiryId: inquiry.inquiryId, orderNo: inquiry.orderNo, goodsNo: inquiry.goodsNo, topic: inquiry.topic };
  const facts = buildAssociatedOrderFacts(probe, orders);
  const topic = normalizeCsTopic(inquiry.topic);
  // 결제 topic이고 매칭됐을 때만 중복 후보 부착.
  if (topic === 'payment' && facts.matched) {
    facts.duplicatePaymentCandidates = findDuplicatePaymentCandidates(probe, orders).candidates;
  }
  return composeCsDraft({ inquiry, associatedOrderFacts: facts });
}

// 기본 화면 출력용: customerDraft만(+고위험 시 초안 바깥 내부 주의 한 줄). 메타데이터는 숨김.
export function renderCsDraftForChat(result: CsDraftComposerResult): string {
  const head = '아래처럼 답변하시면 됩니다.';
  const warn = result.requiresHumanCheck
    ? `\n\n※ 내부 확인 필요: ${result.internalNote || '처리 전 운영자 확인이 필요한 건입니다.'}`
    : '';
  return `${head}\n\n${result.customerDraft}${warn}`;
}
