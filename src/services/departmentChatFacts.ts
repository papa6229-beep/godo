// Department Chat Facts — DepartmentFactsBundle 슬라이스를 팀별 채팅 context로 변환.
//
// 원칙(역할 경계):
//   - 각 팀 채팅은 자기 슬라이스(productTeam/csTeam/marketingTeam/manager)만 본다.
//   - 숫자는 facts packet(엔진 계산)만 근거로. AI가 추측 금지.
//   - 분석/제안은 마케팅팀만. 상품팀/CS팀은 통계/이슈 정리 + "마케팅팀 전달" 안내까지.
//   - fake PII는 CS팀 context에만(가상/fake 표시 필수). 상품/마케팅/총괄 context엔 절대 미포함.

import type { DepartmentFactsBundle, AnalyticsPacket, MarketingRecommendationCandidate } from './departmentFactsRouting';
import {
  buildAssociatedOrderFacts,
  findDuplicatePaymentCandidates,
  type GroundingOrder,
  type AssociatedOrderFacts,
  type DuplicatePaymentCandidate
} from './csInquiryOrderGrounding';

export type ChatTeam = 'product' | 'cs' | 'marketing' | 'manager';

export interface DepartmentChatContext {
  contextNote: string;
  answerGuidance: string;
}

const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;
const fmtVal = (r: AnalyticsPacket['rows'][number]): string =>
  r.valueLabel ?? (r.revenue != null ? won(r.value) : `${r.value}`);

// packet → "제목: a, b, c" 라인 (상위 rows만)
const packetLine = (p: AnalyticsPacket, topN = 6): string => {
  if (!p.rows.length) return `- ${p.title}: (계산 불가/데이터 없음 · ${p.supportLevel})`;
  const top = p.rows.slice(0, topN).map((r) => `${r.label} ${fmtVal(r)}`).join(', ');
  return `- ${p.title}: ${top}`;
};
const packetLines = (packets: AnalyticsPacket[], maxPackets = 10, topN = 6): string =>
  packets.slice(0, maxPackets).map((p) => packetLine(p, topN)).join('\n');

const recLines = (recs: MarketingRecommendationCandidate[]): string =>
  recs
    .map((r) => {
      const ext = r.requiredData?.length ? ` [필요 데이터: ${r.requiredData.join(', ')}]` : '';
      return `- (${r.priorityHint || 'medium'}) ${r.title} — 근거: ${r.rationale} → 제안: ${r.suggestedAction}${ext}`;
    })
    .join('\n');

const basisOf = (bundle: DepartmentFactsBundle): string =>
  `기준 데이터: ${bundle.meta.syntheticSource || bundle.meta.sourceType}` +
  (bundle.meta.generatedAt ? ` (${bundle.meta.generatedAt})` : '');

// ── CS safe inquiry/review detail shortlist (PII 없음, universeAux 기반) ───────
export interface SafeInquiryChatItem {
  inquiryId?: string;
  createdAt?: string;
  status?: string;
  urgency?: string;
  topic?: string;
  orderNo?: string; // 연결 주문 facts 대조 키(있을 때만). PII 아님.
  goodsNo?: string;
  productId?: string;
  title?: string;
  excerpt?: string;
}
export interface SafeReviewChatItem {
  reviewId?: string;
  createdAt?: string;
  rating?: number;
  sentiment?: string;
  topic?: string;
  goodsNo?: string;
  productId?: string;
  excerpt?: string;
}
// CS 채팅 detail 입력(universeAux의 safe inquiries/reviews + goodsNo→상품명). contact 원본은 절대 미포함.
export interface CsChatDetailInput {
  inquiries?: SafeInquiryChatItem[];
  reviews?: SafeReviewChatItem[];
  orders?: GroundingOrder[]; // CS 전용: 문의↔주문 대조용(RevenueOrderLite 호환, PII 없음). 타 팀 미전달.
  goodsNames?: Record<string, string>;
}

const byCreatedDesc = (a: { createdAt?: string }, b: { createdAt?: string }): number =>
  (b.createdAt || '').localeCompare(a.createdAt || '');
const isUnansweredStatus = (s?: string): boolean => !!s && /unanswered|pending|open|미답변|needs_human/i.test(s);
const isUrgent = (u?: string): boolean => !!u && /high|urgent|긴급/i.test(u);
const statusKo = (s?: string): string =>
  /needs_human/i.test(s || '') ? '담당자 확인 필요' : /unanswered|pending|open|미답변/i.test(s || '') ? '미답변' : /answered/i.test(s || '') ? '답변완료' : (s || '미상');
const urgencyKo = (u?: string): string =>
  /high|urgent|긴급/i.test(u || '') ? '높음' : /medium/i.test(u || '') ? '중간' : /low/i.test(u || '') ? '낮음' : (u || '보통');
const prodName = (goodsNo?: string, productId?: string, names?: Record<string, string>): string =>
  (goodsNo && names?.[goodsNo]) || (productId && names?.[productId]) || goodsNo || productId || '상품미상';

const CS_SHORTLIST_MAX = 5;
const inqLine = (q: SafeInquiryChatItem, i: number, names?: Record<string, string>): string =>
  `${i + 1}. [${urgencyKo(q.urgency)} · ${q.topic || '기타'}] ${prodName(q.goodsNo, q.productId, names)} — 접수 ${q.createdAt || '?'} · 상태 ${statusKo(q.status)} · 제목 ${q.title || '문의'} · 요약 ${q.excerpt || ''}`;
const revLine = (r: SafeReviewChatItem, i: number, names?: Record<string, string>): string =>
  `${i + 1}. ${prodName(r.goodsNo, r.productId, names)} — 평점 ${r.rating ?? '?'}점 · ${r.sentiment || ''} · 주제 ${r.topic || ''} · 요약 ${r.excerpt || ''}`;

// ── 연결 주문 facts(associatedOrderFacts) 렌더 — CS 전용 ───────────────────────
const wonOpt = (n?: number): string => (typeof n === 'number' ? `${Math.round(n).toLocaleString()}원` : '미상');
const isPaymentTopic = (t?: string): boolean => !!t && /payment|결제|중복/i.test(t);
const CONNECTED_FACTS_MAX = 6;

// associatedOrderFacts → 사람이 읽는 블록. memberKey 등은 노출하지 않는다(PII/가명 보호).
const assocFactsBlock = (
  q: SafeInquiryChatItem,
  facts: AssociatedOrderFacts,
  dupCands: DuplicatePaymentCandidate[],
  names?: Record<string, string>
): string => {
  if (!facts.matched) {
    return (
      `- 문의ID ${q.inquiryId || '?'} · 주문번호 ${facts.orderNo || '없음'} · 주문 매칭: 아니오\n` +
      `  · 사유: ${facts.missingData[0] || '주문 미확인'} · missingData: ${facts.missingData.join(', ')}`
    );
  }
  const claim = facts.claimSummary;
  const claimTypes =
    claim?.claimTypes && claim.claimTypes.length
      ? claim.claimTypes
      : [facts.canceled && 'cancel', facts.refunded && 'refund', facts.returned && 'return', facts.exchanged && 'exchange'].filter(Boolean) as string[];
  const prodNames = (facts.productNames && facts.productNames.length
    ? facts.productNames
    : (facts.goodsNos || []).map((g) => names?.[g] || g)
  ).slice(0, 3).join(', ');
  const claimLine = claimTypes.length
    ? `\n  · 클레임 ${claimTypes.join(', ')}${claim?.claimAmount ? ` / claimAmount ${wonOpt(claim.claimAmount)}` : ''} (완료 여부 미확정)`
    : '\n  · 클레임 없음';
  const dupLine = isPaymentTopic(q.topic)
    ? `\n  · 중복결제 점검: ${
        dupCands.length
          ? `동일 고객/동일 금액/근접 시간대 후보 ${dupCands.length}건(${dupCands.slice(0, 3).map((c) => c.orderNo).join(', ')})`
          : '주문 데이터 기준 중복 주문 후보 없음'
      } (PG 승인내역 기준 최종 확인은 결제 원장 필요)`
    : '';
  return (
    `- 문의ID ${q.inquiryId || '?'} · 주문번호 ${facts.orderNo} · 주문 매칭: 예\n` +
    `  · 결제상태 ${facts.paid ? '결제완료' : '미결제/미완료'} · 주문금액 ${wonOpt(facts.orderAmount)} · 상품금액 ${wonOpt(facts.goodsAmount)} · 배송비 ${wonOpt(facts.deliveryCharge)}\n` +
    `  · 주문일 ${facts.orderDate || '미상'} · 결제일 현재 연결 데이터에 없음` +
    (prodNames ? `\n  · 상품 ${prodNames}` : '') +
    claimLine +
    dupLine +
    `\n  · missingData: ${facts.missingData.join(', ')}`
  );
};

// CS shortlist(미답변∪긴급∪최근) 상위 문의에 연결 주문 facts 섹션 생성. orders 없으면 안내.
const buildConnectedOrderFactsSection = (
  detail: CsChatDetailInput | undefined,
  names?: Record<string, string>
): string => {
  const inquiries = (detail?.inquiries || []).filter((q) => q.createdAt || q.inquiryId);
  if (!inquiries.length) return '';
  const orders = detail?.orders || [];
  if (!orders.length) {
    return '\n[연결 주문 facts]\n- (주문 데이터가 연결되지 않아 문의-주문 대조 불가 — 주문번호/결제 승인내역 확인 필요)';
  }
  const sorted = [...inquiries].sort(byCreatedDesc);
  const union: SafeInquiryChatItem[] = [];
  const seen = new Set<string>();
  const add = (items: SafeInquiryChatItem[]): void => {
    for (const q of items) {
      const k = q.inquiryId || `${q.createdAt || ''}|${q.orderNo || ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      union.push(q);
    }
  };
  add(sorted.filter((q) => isUnansweredStatus(q.status)));
  add(sorted.filter((q) => isUrgent(q.urgency)));
  add(sorted);
  const lines = union.slice(0, CONNECTED_FACTS_MAX).map((q) => {
    const probe = { inquiryId: q.inquiryId || '', orderNo: q.orderNo };
    const facts = buildAssociatedOrderFacts(probe, orders);
    const dup =
      isPaymentTopic(q.topic) && facts.matched
        ? findDuplicatePaymentCandidates(probe, orders).candidates
        : [];
    return assocFactsBlock(q, facts, dup, names);
  });
  return `\n[연결 주문 facts]\n${lines.join('\n')}`;
};

// CS detail 섹션 문자열 생성(없으면 빈 문자열). 모든 항목은 safe fields만(연락처/이름 없음).
const buildCsDetailSections = (detail: CsChatDetailInput | undefined, csIssuePacketRows: { key: string; label: string; value: number }[], names?: Record<string, string>): string => {
  const inquiries = (detail?.inquiries || []).filter((q) => (q.createdAt || q.inquiryId));
  const reviews = detail?.reviews || [];
  const sorted = [...inquiries].sort(byCreatedDesc);
  const unanswered = sorted.filter((q) => isUnansweredStatus(q.status)).slice(0, CS_SHORTLIST_MAX);
  const urgent = sorted.filter((q) => isUrgent(q.urgency)).slice(0, CS_SHORTLIST_MAX);
  const recent = sorted.slice(0, CS_SHORTLIST_MAX);
  const lowReviews = [...reviews]
    .filter((r) => (typeof r.rating === 'number' && r.rating <= 2) || /negative|부정/i.test(r.sentiment || ''))
    .sort(byCreatedDesc)
    .slice(0, CS_SHORTLIST_MAX);

  const sec = (title: string, lines: string[], emptyMsg: string): string =>
    `\n[${title}]\n${lines.length ? lines.join('\n') : emptyMsg}`;

  const issueProducts = csIssuePacketRows.slice(0, CS_SHORTLIST_MAX)
    .map((r, i) => `${i + 1}. ${names?.[r.key] || r.label || r.key} — 문의/이슈 ${r.value}건`);

  return (
    sec('최근 미답변 문의 목록', unanswered.map((q, i) => inqLine(q, i, names)), '- (현재 safe 미답변 문의 없음 — 전체/미답변/긴급 수는 위 요약 참고)') +
    sec('긴급 문의 목록', urgent.map((q, i) => inqLine(q, i, names)), '- (현재 safe 긴급 문의 없음)') +
    sec('최근 문의 목록', recent.map((q, i) => inqLine(q, i, names)), '- (현재 safe 문의 없음)') +
    sec('저평점/부정 리뷰 목록', lowReviews.map((r, i) => revLine(r, i, names)), '- (현재 safe 저평점/부정 리뷰 없음)') +
    sec('CS 이슈 상품', issueProducts, '- (CS 이슈 상품 데이터 없음)') +
    buildConnectedOrderFactsSection(detail, names)
  );
};

// 팀별 context. bundle/슬라이스가 없으면 null(호출부 fallback).
// csDetail: CS팀 전용 safe inquiry/review shortlist(universeAux 기반). 다른 팀은 무시.
export function buildDepartmentChatContext(
  team: ChatTeam,
  bundle: DepartmentFactsBundle | null,
  csDetail?: CsChatDetailInput
): DepartmentChatContext | null {
  if (!bundle) return null;

  if (team === 'product') {
    const b = bundle.productTeam;
    if (!b) return null;
    return {
      contextNote:
        `${basisOf(bundle)}\n[상품팀 매출/상품 통계]\n${packetLines(b.salesStatisticsPacket)}`,
      answerGuidance:
        '상품팀은 매출/상품/카테고리/브랜드 "통계 공급자"다. 제공된 facts 숫자만 사용해 통계 중심으로 답하라. ' +
        '마케팅 전략/캠페인/광고/고객메시지/세그먼트 분석을 제안하지 마라. CS 이슈 원인 분석도 하지 마라. ' +
        '필요하면 "이 통계는 마케팅팀 분석 자료로 전달할 수 있습니다"라고만 덧붙여라. 숫자를 추측하지 마라.'
    };
  }

  if (team === 'cs') {
    const b = bundle.csTeam;
    if (!b) return null;
    // CS 이슈 상품 packet rows(csIssueTopProducts) 재사용 → 상품명 해석.
    const issuePkt = b.customerIssuePacket.find((p) => p.metric === 'csIssueTopProducts');
    const issueRows = (issuePkt?.rows || []).map((r) => ({ key: r.key, label: r.label, value: r.value }));
    const detailSections = buildCsDetailSections(csDetail, issueRows, csDetail?.goodsNames);
    const contactNote = b.fakeContacts?.length
      ? `\n[응대용 가상 고객 contact] ${b.fakeContacts.length}건 보유 — 모두 synthetic(isFakePii=true · piiType=fake · syntheticProfile=commerce_universe_v1). ` +
        `이 patch의 문의/리뷰 목록에는 contact 원본을 넣지 않는다. 연락처는 응대 시뮬레이션 기능에서만 사용한다.`
      : '';
    return {
      contextNote:
        `${basisOf(bundle)}\n현재 CS팀은 Commerce Universe 기준 safe 문의/리뷰/클레임 데이터를 봅니다. ` +
        `개별 문의/리뷰는 아래 safe 목록(개인정보 제외)으로 답하세요. 고객명/전화/주소/이메일/계좌/배송메모는 표시하지 마세요.\n` +
        `[CS팀 문의/리뷰/클레임 요약]\n${packetLines(b.customerIssuePacket)}` +
        detailSections +
        contactNote,
      answerGuidance:
        'CS팀은 문의/리뷰/클레임/주문 이슈 "공급자"다. 제공된 facts와 safe 목록으로 고객 이슈를 정리해 답하라. ' +
        '사용자가 "가장 최근 미답변 문의", "최근 문의", "긴급 문의", "미답변 목록"을 물으면 위 [최근 미답변 문의 목록]/[최근 문의 목록]/[긴급 문의 목록]을 기준으로 개별 항목을 답하라. ' +
        '"리뷰 평점 낮은 상품"을 물으면 [저평점/부정 리뷰 목록]을 기준으로 답하라. ' +
        'safe 목록이 context에 있으면 "조회할 수 없다"·"고도몰 CS 관리자에서 직접 확인해 주세요"를 1차 답변으로 쓰지 마라. ' +
        '목록이 비어 있을 때만 "조건에 맞는 문의를 찾지 못했습니다"라고 안내하고 요약 수치를 제시하라. ' +
        '맨 아래 보조로만 "이 목록은 Commerce Universe synthetic safe data 기준이며 실제 고도몰 실시간 CS 원장은 별도 확인이 필요합니다"를 덧붙일 수 있다. ' +
        '마케팅 전략/프로모션/캠페인/광고를 제안하지 마라. 고객명/전화/주소/이메일/계좌는 절대 표시하지 마라. 숫자를 추측하지 마라. ' +
        // ── CS Response Evidence Policy v0 ──
        '[Evidence Policy] 결제/주문/환불/취소/중복결제 관련 답변은 반드시 위 [연결 주문 facts]를 근거로 하라. ' +
        '주문 facts가 있으면(주문 매칭: 예) "현재 연결된 주문 데이터 기준으로는…"으로 범위를 한정해 해당 facts(결제상태/금액/주문일/클레임 내역)만 전달하라. ' +
        '주문 facts가 없으면(주문 매칭: 아니오 또는 [연결 주문 facts] 없음) "확인한 결과", "중복결제가 아닙니다", "환불 처리되었습니다", "취소 완료되었습니다", "문제 없습니다" 같은 확정 표현을 절대 쓰지 마라. ' +
        '대신 "현재 연결된 주문 데이터만으로는 최종 확인이 어렵고, 주문번호 또는 결제 승인내역 확인이 필요합니다"라고 안내하라. ' +
        '클레임(취소/환불/반품/교환)은 "내역이 확인됩니다"까지만 말하고 "처리 완료되었습니다"로 단정하지 마라(완료 여부 미확정). ' +
        '중복결제 문의는 주문 데이터 기준 "유사 주문 후보"까지만 확인할 수 있고, PG 승인번호·카드 승인번호·transaction id가 없어 최종 중복결제 여부는 결제 원장 확인이 필요하다고 반드시 안내하라. ' +
        '중복 후보가 없으면 "현재 연결된 주문 데이터 기준으로는 동일 고객/동일 금액/근접 시간대의 중복 주문 후보는 확인되지 않습니다(최종 확인은 결제 원장 필요)"라고 답하고, "중복결제가 아닙니다/이중 결제는 없습니다/문제 없습니다"로 단정하지 마라.'
    };
  }

  if (team === 'marketing') {
    const b = bundle.marketingTeam;
    if (!b) return null;
    return {
      contextNote:
        `${basisOf(bundle)}\n` +
        `[상품팀 전달 자료]\n${packetLines(b.receivedFromProductTeam)}\n` +
        `[CS팀 전달 자료]\n${packetLines(b.receivedFromCsTeam)}\n` +
        `[마케팅 직접 facts(고객/세그먼트/채널)]\n${packetLines(b.directMarketingFacts)}\n` +
        `[제안 후보(코드 산출)]\n${recLines(b.recommendationCandidates)}`,
      answerGuidance:
        '마케팅팀은 분석/기획/제안 담당이다. 상품팀 전달 자료 + CS팀 전달 자료 + 직접 facts를 연결해 해석하고, ' +
        '제안 후보(recommendationCandidates)를 중심으로 실행 제안을 정리하라. 숫자는 제공된 facts만 사용하라. ' +
        '없는 데이터(ROAS/전환율/캠페인 등)는 지어내지 말고 "필요 데이터"를 안내하라(예: ROAS는 adSpend 필요). ' +
        '고객 개인정보(이름/전화/주소/이메일/계좌)는 절대 언급하지 마라. 가명 memberKey·세그먼트만 사용하라.'
    };
  }

  // manager
  const b = bundle.manager;
  if (!b) return null;
  const approvals = b.approvalQueueCandidates
    .map((a) => `- ${a.title} — ${a.summary} (승인 필요: ${a.requiresApproval ? '예' : '아니오'})`)
    .join('\n');
  return {
    contextNote:
      `${basisOf(bundle)}\n[총괄 요약 지표]\n${packetLines(b.executiveSummary)}\n` +
      `[승인 대기 후보(마케팅 제안)]\n${approvals || '- (없음)'}`,
    answerGuidance:
      '총괄은 승인/우선순위 판단 보조다. executiveSummary로 전체 상황을 요약하고, approvalQueueCandidates를 ' +
      '승인/보류/추가조사 후보로 나눠 정리하라. 세부 통계를 길게 나열하지 마라. ' +
      '절대 실제 실행/발송/WRITE를 했다고 말하지 마라(승인 전 단계임을 명확히). 고객 연락처를 노출하지 마라. 숫자를 추측하지 마라.'
  };
}

// panel team id(hq/product/cs/marketing) → ChatTeam
export const toChatTeam = (teamId: 'hq' | 'product' | 'cs' | 'marketing'): ChatTeam =>
  teamId === 'hq' ? 'manager' : teamId;
