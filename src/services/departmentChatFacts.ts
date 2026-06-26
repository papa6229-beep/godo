// Department Chat Facts — DepartmentFactsBundle 슬라이스를 팀별 채팅 context로 변환.
//
// 원칙(역할 경계):
//   - 각 팀 채팅은 자기 슬라이스(productTeam/csTeam/marketingTeam/manager)만 본다.
//   - 숫자는 facts packet(엔진 계산)만 근거로. AI가 추측 금지.
//   - 분석/제안은 마케팅팀만. 상품팀/CS팀은 통계/이슈 정리 + "마케팅팀 전달" 안내까지.
//   - fake PII는 CS팀 context에만(가상/fake 표시 필수). 상품/마케팅/총괄 context엔 절대 미포함.

import type { DepartmentFactsBundle, AnalyticsPacket, MarketingRecommendationCandidate } from './departmentFactsRouting';

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

// 팀별 context. bundle/슬라이스가 없으면 null(호출부 fallback).
export function buildDepartmentChatContext(team: ChatTeam, bundle: DepartmentFactsBundle | null): DepartmentChatContext | null {
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
    const contactNote = b.fakeContacts?.length
      ? `\n[응대용 가상 고객 contact] ${b.fakeContacts.length}건 보유 — 모두 synthetic(isFakePii=true · piiType=fake · syntheticProfile=commerce_universe_v1). ` +
        `응대 초안에 사용할 수 있으나 반드시 "synthetic mode 가상 고객 정보"임을 명시하라.`
      : '';
    return {
      contextNote:
        `${basisOf(bundle)}\n[CS팀 문의/리뷰/클레임 이슈]\n${packetLines(b.customerIssuePacket)}${contactNote}`,
      answerGuidance:
        'CS팀은 문의/리뷰/클레임/주문 이슈 "공급자"다. 제공된 facts로 고객 이슈를 정리해 답하라. ' +
        '마케팅 전략/프로모션/캠페인/광고를 제안하지 마라. 고객 연락처(가상)는 응대 초안이 필요한 경우에만 쓰고, ' +
        '쓸 때는 "가상 고객 정보(synthetic/fake)"임을 반드시 표시하라. ' +
        '필요하면 "이 CS 이슈는 마케팅팀에 전달할 수 있습니다"라고만 덧붙여라. 숫자를 추측하지 마라.'
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
