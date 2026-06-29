// Marketing Data Coverage Audit v0 — 마케팅 분석에 필요한 고객/주문 데이터 보유 현황 감사(순수 함수).
//
// 목적: 마케팅팀 대시보드 구현 전에, 현재 synthetic Commerce Universe + 고도몰 Open API 스펙으로
//   "지금 계산 가능한 마케팅 지표 / 보강하면 가능한 지표 / 외부 데이터 없이는 계산하면 안 되는 지표"를
//   분류한다. UI/WRITE 없음. 실제 고도몰 API 호출 없음. 추측 데이터 생성 없음.
//
// 핵심 원칙:
//   - PII(이름/전화/이메일/주소)는 마케팅 facts/docs/smoke/LLM context에 직접 노출 금지.
//     마케팅 분석 식별은 가명 memberKey(또는 customerId)만.
//   - 외부 광고/GA/SNS/방문자/상품조회/장바구니 흐름은 추측 생성하지 않고 external_required로 표시.
//   - 부족한 데이터는 status(missing/derived_possible/...) + notes(syntheticEnrichmentNeeded / requiredData)로 표시.
//
// 감사 대상 사실(코드 기준):
//   - SyntheticCustomerProfile: customerId/memberKey/memNo/memId/segment + 주문파생 집계(첫·최근주문일,
//     orderCount, totalPaidAmount, averageOrderValue, repurchaseCount, refundCount, reviewCount).
//     → birthDate/gender/joinDate/memberGroup/joinPath/loginCount/lastLogin/sms·emailOptIn/points 없음.
//   - 가입일(joinDate) 부재 → "가입→구매 전환율"은 do_not_compute. firstOrderDate(첫 주문일)만 존재.
//   - RevenueOrder: memberKey/isFirstPurchase(firstSaleFl)/orderChannel/settleKind/claimSummary 보유
//     → 첫구매·재구매·채널·결제수단·클레임 세그먼트 분석 가능.
//   - 쿠폰/할인·마일리지/예치금: synthetic 미생성. 단 Order_Search 스펙엔 memGroupNm·totalCoupon*DcPrice·
//     useMileage·useDeposit 존재 → real 연결/ synthetic 보강 시 확보 가능(derived/enrichable).
//   - PII(name/phone/email/address)는 contacts(fake)에만 존재. 분석 입력엔 미포함(의도적).

// ── 분류 enum ────────────────────────────────────────────────────────────────
export type MarketingDataCoverageStatus =
  | 'present' //            현재 데이터에 존재하고 분석에 바로 사용 가능
  | 'present_but_fake' //   존재하지만 fake PII (CS contact 경로 전용, 마케팅 분석 미사용)
  | 'present_but_unlinked' // 존재하지만 마케팅 분석 집계에 연결되지 않음(예: CS 세션 local)
  | 'missing' //            현재 데이터에 없음(보강 필요)
  | 'derived_possible' //   필드로 저장돼 있진 않지만 현재 주문 데이터에서 계산 가능
  | 'not_in_spec' //        현재 연결된 Order_Search 스펙 범위 밖(별도 회원/접속 통계 필요)
  | 'external_required'; //  고도몰 밖 외부 데이터(GA/광고/방문자/행동)가 있어야 가능

export type MarketingMetricAvailability =
  | 'available_now' //          현재 synthetic 데이터로 지금 계산 가능
  | 'available_if_enriched' //  고도몰 스펙 필드(회원그룹/쿠폰 등) 보강 시 계산 가능
  | 'requires_external_data' //  GA/광고/행동 등 외부 데이터 필요
  | 'do_not_compute'; //        근거 데이터 부재 → 계산하면 안 됨(왜곡 방지)

export type MarketingPiiLevel = 'none' | 'behavior' | 'identity' | 'contact';

export type MarketingDataCoverageItem = {
  key: string;
  label: string;
  source: 'godomall_spec' | 'synthetic_universe' | 'derived_from_orders' | 'cs_ui_only' | 'external';
  status: MarketingDataCoverageStatus;
  piiLevel: MarketingPiiLevel;
  marketingUse: string;
  notes: string[];
};

export type MarketingMetricAuditItem = {
  key: string;
  label: string;
  availability: MarketingMetricAvailability;
  requiredFields: string[];
  missingFields: string[];
  formula?: string;
  notes: string[];
};

// ── PII 분리 정책 (마케팅 facts에 절대 싣지 않는 키) ──────────────────────────
// 마케팅 분석 facts/LLM context로 넘길 때 허용되는 식별 키(가명/집계만)와,
// 절대 포함하면 안 되는 identity/contact PII 키를 명시한다.
export const MARKETING_FACTS_ALLOWED_IDENTITY_KEYS = ['memberKey', 'customerId', 'segment'] as const;

export const MARKETING_FACTS_FORBIDDEN_PII_KEYS = [
  'name',
  'customerName',
  'receiverName',
  'nickname',
  'phone',
  'mobile',
  'email',
  'address',
  'deliveryMemo',
  'refundBank',
  'refundAccount',
  'memId', // 원문 회원 식별자(가명 memberKey만 허용)
  'memNo'
] as const;

const FORBIDDEN_SET = new Set<string>(MARKETING_FACTS_FORBIDDEN_PII_KEYS);

// 객체(중첩 포함)에서 마케팅 facts 금지 PII 키가 있으면 그 키 목록을 반환한다(없으면 []).
// 마케팅 facts builder가 출력 직전 self-check 용도로 사용한다.
export function marketingFactsContainPii(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 5) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_SET.has(k)) found.add(k);
      visit(val, depth + 1);
    }
  };
  visit(value, 0);
  return [...found];
}

// ── 데이터 보유 현황 감사 ─────────────────────────────────────────────────────
const collectKeys = (rows?: unknown[]): Set<string> => {
  const set = new Set<string>();
  for (const r of rows || []) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      for (const k of Object.keys(r as Record<string, unknown>)) set.add(k);
    }
  }
  return set;
};

const collectLineKeys = (orders?: unknown[]): Set<string> => {
  const set = new Set<string>();
  for (const o of orders || []) {
    if (!o || typeof o !== 'object') continue;
    const rec = o as Record<string, unknown>;
    const lines = (rec.lines ?? rec.orderGoodsData) as unknown;
    const arr = Array.isArray(lines) ? lines : lines ? [lines] : [];
    for (const l of arr) {
      if (l && typeof l === 'object') for (const k of Object.keys(l as Record<string, unknown>)) set.add(k);
    }
  }
  return set;
};

/**
 * 현재 입력 데이터(synthetic 또는 real)를 스캔해 마케팅 관련 필드의 보유 상태를 분류한다.
 * 정적 분류(코드 감사 결과)를 기준으로 하되, 입력에 실제로 enrich된 필드가 있으면 present로 승격한다.
 * → real API 연결/synthetic 보강 후 다시 돌리면 상태가 자동으로 갱신된다.
 */
export function auditMarketingDataCoverage(input: {
  customers?: unknown[];
  orders?: unknown[];
  products?: unknown[];
  reviews?: unknown[];
  inquiries?: unknown[];
}): MarketingDataCoverageItem[] {
  const custKeys = collectKeys(input.customers);
  const orderKeys = collectKeys(input.orders);
  const lineKeys = collectLineKeys(input.orders);
  const inAny = (...names: string[]): boolean =>
    names.some((n) => custKeys.has(n) || orderKeys.has(n) || lineKeys.has(n));

  // 입력에 enrich 필드가 실제로 들어오면 present로 올린다.
  const upgrade = (
    base: MarketingDataCoverageStatus,
    probeKeys: string[],
    promoted: MarketingDataCoverageStatus = 'present'
  ): MarketingDataCoverageStatus => (probeKeys.length && inAny(...probeKeys) ? promoted : base);

  const items: MarketingDataCoverageItem[] = [
    // ── 식별/가명 키 ──
    {
      key: 'customerId',
      label: '고객 ID(customerId)',
      source: 'synthetic_universe',
      status: upgrade('missing', ['customerId']),
      piiLevel: 'none',
      marketingUse: '고객 단위 집계 키',
      notes: ['SyntheticCustomerProfile.customerId 존재']
    },
    {
      key: 'memberKey',
      label: '가명 분석키(memberKey)',
      source: 'derived_from_orders',
      status: upgrade('missing', ['memberKey']),
      piiLevel: 'none',
      marketingUse: '마케팅 분석 식별(PII-safe)',
      notes: ['real=해시(real_member_*), synthetic=syn_member_*', '마케팅 facts에서 허용되는 유일한 고객 식별자']
    },
    {
      key: 'memberId',
      label: '원문 회원 식별자(memId/memNo)',
      source: 'synthetic_universe',
      status: upgrade('present_but_unlinked', ['memId', 'memNo'], 'present'),
      piiLevel: 'identity',
      marketingUse: '없음(마케팅 facts엔 memberKey만 노출)',
      notes: ['원문 식별자 — 마케팅 분석 facts/LLM context에 직접 노출 금지']
    },
    // ── 회원 프로필 PII (contacts 전용 fake, 분석 입력엔 미포함) ──
    {
      key: 'name',
      label: '성명',
      source: 'cs_ui_only',
      status: 'present_but_fake',
      piiLevel: 'contact',
      marketingUse: '마케팅 분석 미사용',
      notes: ['contacts(fake PII)에만 존재 · CS 관리자 UI 경로 전용', '마케팅 분석 입력에서 의도적 제외']
    },
    {
      key: 'phone',
      label: '핸드폰/전화번호',
      source: 'cs_ui_only',
      status: 'present_but_fake',
      piiLevel: 'contact',
      marketingUse: '마케팅 분석 미사용',
      notes: ['contacts(fake PII) 전용', 'SMS 마케팅은 별도 동의/채널 데이터 필요(미연동)']
    },
    {
      key: 'email',
      label: '이메일',
      source: 'cs_ui_only',
      status: 'present_but_fake',
      piiLevel: 'contact',
      marketingUse: '마케팅 분석 미사용',
      notes: ['contacts(fake PII) 전용', '이메일 마케팅은 emailOptIn(수신동의) 보강 필요']
    },
    {
      key: 'address',
      label: '주소',
      source: 'cs_ui_only',
      status: 'present_but_fake',
      piiLevel: 'contact',
      marketingUse: '마케팅 분석 미사용(지역 세그먼트는 비식별 시군구로만)',
      notes: ['contacts(fake PII) 전용', '지역 세그먼트가 필요하면 시/군/구 단위 비식별 파생으로만 사용']
    },
    // ── 회원 속성 (현재 미생성, 보강 필요) ──
    {
      key: 'birthDate',
      label: '생년월일',
      source: 'synthetic_universe',
      status: upgrade('missing', ['birthDate', 'birthDt', 'birth']),
      piiLevel: 'identity',
      marketingUse: '연령 세그먼트',
      notes: ['synthetic 미생성', 'syntheticEnrichmentNeeded', 'requiredData: 회원(Member) API birthDt']
    },
    {
      key: 'gender',
      label: '성별',
      source: 'synthetic_universe',
      status: upgrade('missing', ['gender', 'sex']),
      piiLevel: 'identity',
      marketingUse: '성별 세그먼트',
      notes: ['synthetic 미생성', 'syntheticEnrichmentNeeded', 'requiredData: 회원(Member) API']
    },
    {
      key: 'joinedAt',
      label: '가입일(joinDate/registeredAt)',
      source: 'synthetic_universe',
      status: upgrade('missing', ['joinedAt', 'joinDate', 'registeredAt', 'signupDate', 'memRegDt']),
      piiLevel: 'none',
      marketingUse: '가입 코호트 · 가입→구매 전환',
      notes: [
        '★ 가입일 부재 — 현재는 firstOrderDate(첫 주문일)만 존재',
        '가입→구매 전환율은 do_not_compute (가입일 없이 계산 금지)',
        'syntheticEnrichmentNeeded',
        'requiredData: 회원(Member) API joinDt'
      ]
    },
    {
      key: 'memberGroup',
      label: '회원등급/회원그룹(memGroupNm)',
      source: 'godomall_spec',
      status: upgrade('missing', ['memberGroup', 'memGroupNm', 'memberGrade']),
      piiLevel: 'none',
      marketingUse: '회원그룹별 매출/객단가/주문수 세그먼트',
      notes: [
        'Order_Search 스펙에 memGroupNm 존재 → real 연결/synthetic 보강 시 즉시 확보',
        'syntheticEnrichmentNeeded'
      ]
    },
    {
      key: 'memberType',
      label: '회원구분(회원/비회원)',
      source: 'godomall_spec',
      status: upgrade('missing', ['memberType']),
      piiLevel: 'none',
      marketingUse: '회원/비회원 매출 분리',
      notes: ['CS UI는 상수 "회원" 표시(데이터 아님)', 'syntheticEnrichmentNeeded']
    },
    {
      key: 'joinPath',
      label: '가입경로',
      source: 'synthetic_universe',
      status: upgrade('missing', ['joinPath']),
      piiLevel: 'none',
      marketingUse: '유입 채널 코호트',
      notes: ['synthetic 미생성', 'requiredData: 회원(Member) API · 유입 메타']
    },
    {
      key: 'emailOptIn',
      label: '메일수신 동의',
      source: 'godomall_spec',
      status: upgrade('missing', ['emailOptIn', 'mailReceive']),
      piiLevel: 'none',
      marketingUse: '이메일 캠페인 발송 대상 산정',
      notes: ['synthetic 미생성', 'requiredData: 회원(Member) API 수신동의']
    },
    {
      key: 'smsOptIn',
      label: 'SMS수신 동의',
      source: 'godomall_spec',
      status: upgrade('missing', ['smsOptIn', 'smsReceive']),
      piiLevel: 'none',
      marketingUse: 'SMS 캠페인 발송 대상 산정',
      notes: ['synthetic 미생성', 'requiredData: 회원(Member) API 수신동의']
    },
    {
      key: 'memberPointsBalance',
      label: '적립금/포인트/예치금 잔액',
      source: 'synthetic_universe',
      status: upgrade('missing', ['points', 'pointAmount', 'mileage', 'deposit', 'rewardAmount']),
      piiLevel: 'none',
      marketingUse: '리텐션/리워드 세그먼트(잔액 기준)',
      notes: ['고객 잔액은 synthetic 미생성', 'requiredData: 회원(Member) API 잔액', '주문 내 사용액은 별도 항목(useMileage/useDeposit) 참조']
    },
    {
      key: 'loginCount',
      label: '로그인 횟수',
      source: 'external',
      status: upgrade('not_in_spec', ['loginCount']),
      piiLevel: 'behavior',
      marketingUse: '활성도/이탈 위험 신호',
      notes: ['Order_Search 범위 밖', 'requiredData: 회원/접속 통계 API']
    },
    {
      key: 'lastLoginAt',
      label: '최근 접속일',
      source: 'external',
      status: upgrade('not_in_spec', ['lastLoginAt', 'lastLogin']),
      piiLevel: 'behavior',
      marketingUse: '휴면/리텐션 세그먼트',
      notes: ['Order_Search 범위 밖', 'requiredData: 회원/접속 통계 API', '대체: lastOrderDate(최근 주문일)는 주문에서 derived_possible']
    },
    // ── 주문 보유 마케팅 재료(현재 가능) ──
    {
      key: 'isFirstPurchase',
      label: '첫구매 플래그(firstSaleFl)',
      source: 'godomall_spec',
      status: upgrade('derived_possible', ['isFirstPurchase', 'firstSaleFl'], 'present'),
      piiLevel: 'none',
      marketingUse: '첫구매 vs 재구매 분리',
      notes: ['RevenueOrder.isFirstPurchase로 보유', '회원 단위 첫/재구매는 memberKey+orderDate로도 파생 가능']
    },
    {
      key: 'orderChannel',
      label: '주문채널(orderChannelFl)',
      source: 'godomall_spec',
      status: upgrade('missing', ['orderChannel', 'orderChannelFl'], 'present'),
      piiLevel: 'none',
      marketingUse: '채널별(shop/naverpay/payco) 매출 분리',
      notes: ['RevenueOrder.orderChannel로 보유']
    },
    {
      key: 'paymentMethod',
      label: '결제수단(settleKind)',
      source: 'godomall_spec',
      status: upgrade('missing', ['settleKind', 'paymentMethodCode', 'paymentMethod'], 'present'),
      piiLevel: 'none',
      marketingUse: '결제수단 분포/세그먼트',
      notes: ['RevenueOrder.settleKind/paymentMethodCode로 보유 · 라벨(Code_Search)은 미연결']
    },
    {
      key: 'claimSummary',
      label: '클레임 요약(취소/환불/반품/교환)',
      source: 'godomall_spec',
      status: upgrade('missing', ['claimSummary'], 'present'),
      piiLevel: 'none',
      marketingUse: '환불·취소 리스크 세그먼트(광고 주의 상품/고객)',
      notes: ['RevenueOrder.claimSummary.claimTypes로 보유']
    },
    {
      key: 'couponDiscount',
      label: '쿠폰/할인 적용 결과',
      source: 'godomall_spec',
      status: upgrade('missing', ['couponGoodsDcPrice', 'totalCouponGoodsDcPrice', 'totalCouponOrderDcPrice', 'memberDcPrice']),
      piiLevel: 'none',
      marketingUse: '쿠폰 사용/미사용 고객군, 할인 민감 세그먼트',
      notes: [
        'synthetic 미생성',
        'Order_Search 스펙에 totalCoupon*DcPrice/totalMemberDcPrice 등 존재 → 보강 가능',
        'syntheticEnrichmentNeeded'
      ]
    },
    {
      key: 'mileageDepositUse',
      label: '주문 내 마일리지/예치금 사용액',
      source: 'godomall_spec',
      status: upgrade('missing', ['useMileage', 'useDeposit']),
      piiLevel: 'none',
      marketingUse: '리워드 사용 성향 세그먼트',
      notes: ['synthetic 미생성', 'Order_Search 스펙에 useMileage/useDeposit 존재 → 보강 가능', 'syntheticEnrichmentNeeded']
    },
    // ── 파생/세션 ──
    {
      key: 'riskTags',
      label: '리스크 태그(반복문의/반복환불/주의/블랙리스트/고액)',
      source: 'derived_from_orders',
      status: 'derived_possible',
      piiLevel: 'none',
      marketingUse: '제외 세그먼트(광고 주의) / 고액 고객 타겟',
      notes: ['csCustomerManagementFacts에서 주문/클레임/리뷰로 실시간 파생']
    },
    {
      key: 'blacklistCandidate',
      label: '블랙리스트 후보',
      source: 'derived_from_orders',
      status: 'derived_possible',
      piiLevel: 'none',
      marketingUse: '캠페인 제외 대상',
      notes: ['반복 환불·취소 기반 파생 + CS 세션 toggle(local)']
    },
    {
      key: 'csMemo',
      label: 'CS 메모',
      source: 'cs_ui_only',
      status: 'present_but_unlinked',
      piiLevel: 'none',
      marketingUse: '없음(자유 텍스트 — 마케팅 facts 미반입)',
      notes: ['CS 세션 localStorage 전용', '자유 텍스트라 PII 혼입 가능 → 마케팅 facts로 넘기지 않음']
    },
    // ── 외부 데이터(고도몰 밖) ──
    {
      key: 'behaviorEvents',
      label: '행동 이벤트(상품조회/장바구니/페이지 이동)',
      source: 'external',
      status: 'external_required',
      piiLevel: 'behavior',
      marketingUse: '퍼널/전환율(조회→장바구니→구매)',
      notes: ['고도몰 Order/Member 스펙 밖', '추측 생성 금지', 'requiredData: GA4/행동 로그']
    },
    {
      key: 'adSpend',
      label: '광고비/노출/클릭(광고 플랫폼)',
      source: 'external',
      status: 'external_required',
      piiLevel: 'none',
      marketingUse: 'ROAS/CPA/CTR',
      notes: ['고도몰 밖', '추측 생성 금지', 'requiredData: 광고 매체 API(Google/Naver/Meta 등)']
    },
    {
      key: 'ga4Behavior',
      label: 'GA4 행동/유입 데이터',
      source: 'external',
      status: 'external_required',
      piiLevel: 'behavior',
      marketingUse: '유입 경로/세션/이탈 분석',
      notes: ['고도몰 밖', '추측 생성 금지', 'requiredData: GA4']
    },
    {
      key: 'visitorTraffic',
      label: '방문자/유입 수',
      source: 'external',
      status: 'external_required',
      piiLevel: 'behavior',
      marketingUse: '방문→주문 전환',
      notes: ['고도몰 밖', '추측 생성 금지', 'requiredData: 웹 analytics/방문자 로그']
    }
  ];

  return items;
}

// ── 마케팅 지표 산출 가능성 감사 ──────────────────────────────────────────────
type Flags = {
  hasSignupDate: boolean;
  hasOrders: boolean;
  hasOrderLines: boolean;
  hasMemberId: boolean;
  hasMemberGroup: boolean;
  hasCouponDiscountFields: boolean;
  hasOrderChannel: boolean;
  hasBehaviorEvents: boolean;
  hasAdSpend: boolean;
  hasGa4: boolean;
};

/**
 * 입력 가용 플래그를 받아 마케팅 지표별 산출 가능성을 분류한다.
 * - 주문+회원ID 있으면 첫구매/재구매/누적/최근 등은 available_now
 * - 회원그룹/쿠폰 필드 없으면 available_if_enriched (고도몰 스펙엔 존재)
 * - 가입일 없으면 가입→구매 전환율은 do_not_compute
 * - 행동/광고/GA 데이터 없으면 requires_external_data (추측 금지)
 */
export function auditMarketingMetricAvailability(input: Flags): MarketingMetricAuditItem[] {
  const sat: Record<string, boolean> = {
    orders: input.hasOrders,
    orderLines: input.hasOrderLines,
    memberId: input.hasMemberId,
    memberGroup: input.hasMemberGroup,
    couponDiscountFields: input.hasCouponDiscountFields,
    orderChannel: input.hasOrderChannel,
    signupDate: input.hasSignupDate,
    behaviorEvents: input.hasBehaviorEvents,
    adSpend: input.hasAdSpend,
    ga4: input.hasGa4
  };
  const missingOf = (required: string[]): string[] => required.filter((r) => !sat[r]);

  // 주문기반(외부 불필요): 충족 시 available_now, 아니면 available_if_enriched
  const orderBased = (
    key: string,
    label: string,
    required: string[],
    formula: string,
    notes: string[] = []
  ): MarketingMetricAuditItem => {
    const missing = missingOf(required);
    return {
      key,
      label,
      availability: missing.length === 0 ? 'available_now' : 'available_if_enriched',
      requiredFields: required,
      missingFields: missing,
      formula,
      notes
    };
  };

  // 외부 데이터 필요: 충족 시 available_now, 아니면 requires_external_data
  const externalBased = (
    key: string,
    label: string,
    required: string[],
    formula: string,
    notes: string[] = []
  ): MarketingMetricAuditItem => {
    const missing = missingOf(required);
    return {
      key,
      label,
      availability: missing.length === 0 ? 'available_now' : 'requires_external_data',
      requiredFields: required,
      missingFields: missing,
      formula,
      notes: ['고도몰 스펙 밖 · 추측 생성 금지', ...notes]
    };
  };

  const items: MarketingMetricAuditItem[] = [
    // 첫구매 분석
    orderBased('first_purchase_orders', '첫구매 주문수', ['orders', 'memberId'], 'count(회원별 첫 주문)', [
      'isFirstPurchase(firstSaleFl) 또는 memberKey+min(orderDate)'
    ]),
    orderBased('first_purchase_revenue', '첫구매 매출', ['orders', 'memberId'], 'Σ(첫 주문 totalAmount)'),
    orderBased('first_purchase_aov', '첫구매 객단가', ['orders', 'memberId'], '첫구매 매출 / 첫구매 주문수'),
    // 재구매 분석
    orderBased('repurchase_orders', '재구매 주문수', ['orders', 'memberId'], 'count(회원별 2번째 이후 주문)'),
    orderBased('repurchase_revenue', '재구매 매출', ['orders', 'memberId'], 'Σ(재구매 주문 totalAmount)'),
    orderBased('repurchase_aov', '재구매 객단가', ['orders', 'memberId'], '재구매 매출 / 재구매 주문수'),
    orderBased('time_to_repurchase', '첫구매→재구매 소요기간', ['orders', 'memberId'], 'avg(2번째 orderDate − 1번째 orderDate)'),
    // 고객 단위
    orderBased('customer_order_count', '고객별 주문횟수', ['orders', 'memberId'], 'count(memberKey)'),
    orderBased('customer_total_revenue', '고객별 누적매출', ['orders', 'memberId'], 'Σ(memberKey totalAmount, paid)'),
    orderBased('customer_first_order_date', '고객별 첫 구매일', ['orders', 'memberId'], 'min(orderDate)'),
    orderBased('customer_last_order_date', '고객별 최근 구매일', ['orders', 'memberId'], 'max(orderDate)'),
    // 채널
    orderBased('revenue_by_order_channel', '주문채널별 매출', ['orders', 'orderChannel'], 'groupBy(orderChannel) Σ totalAmount'),
    // 회원그룹 (보강 필요)
    orderBased('revenue_by_member_group', '회원그룹별 매출', ['orders', 'memberGroup'], 'groupBy(memGroupNm) Σ totalAmount', [
      'Order_Search memGroupNm 보강 시 가능'
    ]),
    orderBased('aov_by_member_group', '회원그룹별 객단가', ['orders', 'orderLines', 'memberGroup'], '그룹 매출 / 그룹 주문수'),
    orderBased('order_count_by_member_group', '회원그룹별 주문수', ['orders', 'memberGroup'], 'groupBy(memGroupNm) count'),
    // 쿠폰 (보강 필요)
    orderBased('coupon_user_segment', '쿠폰 사용 고객군', ['orders', 'couponDiscountFields'], 'filter(couponDcPrice>0) → memberKey set', [
      'Order_Search totalCoupon*DcPrice 보강 시 가능'
    ]),
    orderBased('coupon_nonuser_segment', '쿠폰 미사용 고객군', ['orders', 'couponDiscountFields'], 'filter(couponDcPrice==0) → memberKey set'),
    // 가입 전환 (가입일 없으면 계산 금지)
    {
      key: 'signup_to_purchase_conversion',
      label: '가입→구매 전환율',
      availability: input.hasSignupDate ? 'available_now' : 'do_not_compute',
      requiredFields: ['signupDate', 'orders', 'memberId'],
      missingFields: missingOf(['signupDate', 'orders', 'memberId']),
      formula: '구매한 가입회원 수 / 전체 가입회원 수',
      notes: input.hasSignupDate
        ? ['가입일 보유 시 코호트 전환 계산 가능']
        : ['★ 가입일 부재 → 계산 금지(do_not_compute)', '대체: 첫구매 고객 분석으로 분리']
    },
    // 행동/외부
    externalBased('product_view_to_purchase_conversion', '상품조회→구매 전환율', ['behaviorEvents', 'orders'], '구매 수 / 상품조회 수', [
      'requiredData: GA4/행동 로그'
    ]),
    externalBased('cart_abandonment_rate', '장바구니 이탈률', ['behaviorEvents'], '1 − (구매 / 장바구니 담기)', ['requiredData: 행동 로그']),
    externalBased('visitor_to_order_conversion', '방문→주문 전환율', ['behaviorEvents', 'orders'], '주문 수 / 방문자 수', [
      'requiredData: 방문자/유입 로그'
    ]),
    externalBased('roas', '광고 ROAS', ['adSpend', 'orders'], '광고기여 매출 / 광고비', ['requiredData: 광고 매체 API']),
    externalBased('ad_ctr', '광고 클릭률(CTR)', ['adSpend'], '클릭수 / 노출수', ['requiredData: 광고 매체 API']),
    externalBased('ga4_behavior', 'GA4 행동/유입 분석', ['ga4'], 'GA4 세션/이벤트 집계', ['requiredData: GA4'])
  ];

  return items;
}

// ── 요약 헬퍼 ─────────────────────────────────────────────────────────────────
export function summarizeMarketingDataCoverage(
  items: MarketingDataCoverageItem[]
): Record<MarketingDataCoverageStatus, number> {
  const acc: Record<MarketingDataCoverageStatus, number> = {
    present: 0,
    present_but_fake: 0,
    present_but_unlinked: 0,
    missing: 0,
    derived_possible: 0,
    not_in_spec: 0,
    external_required: 0
  };
  for (const it of items) acc[it.status] += 1;
  return acc;
}

export function summarizeMarketingMetricAvailability(
  items: MarketingMetricAuditItem[]
): Record<MarketingMetricAvailability, number> {
  const acc: Record<MarketingMetricAvailability, number> = {
    available_now: 0,
    available_if_enriched: 0,
    requires_external_data: 0,
    do_not_compute: 0
  };
  for (const it of items) acc[it.availability] += 1;
  return acc;
}
