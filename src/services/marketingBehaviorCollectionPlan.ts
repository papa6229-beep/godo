import type { MarketingBehaviorEventName, MarketingTrafficSource } from './marketingBehaviorTypes';

// ────────────────────────────────────────────────────────────────────────────
// GODO Behavior Tracker Script & Collection Endpoint — Plan v0 (계획/계약 상수)
//
// 목적: docs/GODO_BEHAVIOR_TRACKER_COLLECTION_PLAN_V0.md 의 설계를 코드에서도 참조 가능한
//   "단일 소스" 계약 상수로 남긴다. 향후 tracker script / 수집 endpoint / 고도몰 스킨 가이드가
//   모두 이 상수를 참조해 드리프트를 막는다.
//
// ★ 이 파일은 계획/계약 상수와 타입만 둔다. 실제 수집 구현은 하지 않는다:
//    - fetch 호출 없음 · API route 생성 없음 · GA4/GTM import 없음 · WRITE 없음 · PII 저장 없음.
//   타입은 기존 행동 데이터 계약(marketingBehaviorTypes)에 연결해 컴파일 타임 정합성을 보장한다.
// ────────────────────────────────────────────────────────────────────────────

// ── 추적 이벤트 계획(10종) — eventName은 기존 MarketingBehaviorEventName과 정합 ──────
export interface TrackedEventPlan {
  eventName: MarketingBehaviorEventName;
  easyLabel: string;          // 운영자용 쉬운 말
  description: string;        // 무엇을 잡는지
  piiSafe: boolean;          // 이 이벤트 설계가 PII를 담지 않는지(전부 true여야 함)
  captureFields: string[];   // tracker가 잡을 필드(이벤트 타입/공개정보 범위 내)
}

export const MARKETING_BEHAVIOR_TRACKED_EVENTS: TrackedEventPlan[] = [
  { eventName: 'visit',          easyLabel: '방문 시작',   description: '손님이 쇼핑몰에 들어온 시점(세션 시작)',           piiSafe: true, captureFields: ['sessionIdHash', 'source', 'referrerHost', 'medium', 'campaign'] },
  { eventName: 'landing',        easyLabel: '첫 진입',     description: '처음 들어온 페이지가 어디인지',                    piiSafe: true, captureFields: ['pagePath', 'pageTitle'] },
  { eventName: 'banner_click',   easyLabel: '배너 클릭',   description: '어떤 배너를 눌렀는지',                            piiSafe: true, captureFields: ['bannerId', 'bannerName', 'pagePath'] },
  { eventName: 'category_click', easyLabel: '카테고리 이동', description: '어떤 카테고리로 이동했는지',                       piiSafe: true, captureFields: ['categoryId', 'categoryName'] },
  { eventName: 'product_view',   easyLabel: '상품 상세 보기', description: '어떤 상품을 자세히 봤는지',                       piiSafe: true, captureFields: ['productId', 'productName', 'categoryName'] },
  { eventName: 'search',         easyLabel: '검색',        description: '무엇을 검색했는지',                              piiSafe: true, captureFields: ['searchTerm'] },
  { eventName: 'add_to_cart',    easyLabel: '장바구니 담기', description: '어떤 상품을 장바구니에 담았는지',                  piiSafe: true, captureFields: ['productId', 'productName'] },
  { eventName: 'checkout_start', easyLabel: '결제 시작',   description: '결제를 시작한 시점(금액은 v0 선택)',               piiSafe: true, captureFields: ['pagePath'] },
  { eventName: 'purchase',       easyLabel: '구매 완료',   description: '구매 완료(주문번호 원문 금지 — 해시만)',           piiSafe: true, captureFields: ['orderIdHash', 'revenue'] },
  { eventName: 'exit',           easyLabel: '이탈',        description: '마지막으로 본 페이지/단계 기준 이탈 추정',          piiSafe: true, captureFields: ['pagePath', 'pageTitle'] }
];

// ── 유입 source 정규화 규칙(v0: 데이터로만 정의 — 실제 정규화 구현은 다음 단계) ────────
export interface SourceRule {
  source: MarketingTrafficSource;
  easyLabel: string;
  examples: string[];                 // 대표 referrer/표식 예시
  match: {
    referrerHosts?: string[];         // referrerHost 포함 매칭 후보
    utmMedium?: string[];             // utm_medium 매칭 후보
    utmSource?: string[];             // utm_source 매칭 후보
  };
}

export const MARKETING_BEHAVIOR_SOURCE_RULES: SourceRule[] = [
  { source: 'blog',     easyLabel: '블로그',     examples: ['blog.naver.com', 'post.naver.com', 'tistory.com'], match: { referrerHosts: ['blog.naver.com', 'post.naver.com', 'tistory.com'] } },
  { source: 'search',   easyLabel: '검색',       examples: ['search.naver.com', 'google.com/search', 'daum.net'], match: { referrerHosts: ['search.naver.com', 'www.google.', 'daum.net'], utmMedium: ['organic'] } },
  { source: 'ad',       easyLabel: '광고',       examples: ['utm_medium=cpc', 'utm_source=google/naver/meta'], match: { utmMedium: ['cpc', 'paid', 'display'], utmSource: ['google_ads', 'naver_ad', 'meta', 'kakao_ad'] } },
  { source: 'sns',      easyLabel: 'SNS',        examples: ['instagram.com', 'facebook.com', 'x.com', 'tiktok.com'], match: { referrerHosts: ['instagram.com', 'facebook.com', 'x.com', 't.co', 'tiktok.com'] } },
  { source: 'direct',   easyLabel: '직접 방문',  examples: ['referrer 없음(주소 직접 입력/북마크)'], match: {} },
  { source: 'referral', easyLabel: '추천 링크',  examples: ['그 외 외부 사이트 referrer'], match: {} },
  { source: 'unknown',  easyLabel: '알 수 없음', examples: ['판별 불가'], match: {} }
];

// ── 고도몰 화면 추적: data attribute 계약(권장 방식 A — 단일 소스) ──────────────────
export const MARKETING_BEHAVIOR_DATA_ATTRIBUTES = {
  trackAttr: 'data-godo-track', // 값: 'banner' | 'category' | 'product' | 'search' | 'cart'
  banner: { idAttr: 'data-godo-banner-id', nameAttr: 'data-godo-banner-name' },
  category: { idAttr: 'data-godo-category-id', nameAttr: 'data-godo-category-name' },
  product: { idAttr: 'data-godo-product-id', nameAttr: 'data-godo-product-name' }
} as const;

// ── 유입 맥락 수집 후보(브라우저에서 읽을 값) ──────────────────────────────────────
export const MARKETING_BEHAVIOR_ACQUISITION_SIGNALS = [
  'document.referrer', 'location.href',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
] as const;

// ── 세션/매칭 정책(설계값) ───────────────────────────────────────────────────────
export const MARKETING_BEHAVIOR_SESSION_POLICY = {
  identifier: 'sessionIdHash',        // 원문 세션/유저 식별자 저장 금지
  seedStorage: 'sessionStorage',     // 익명 세션 seed 보관 위치(설계안)
  idleTimeoutMinutes: 30,            // 비활동 30분 → 새 세션
  hashAlgorithmCandidate: 'sha256',  // 서버 저장 시 해시(후보)
  longTermTracking: 'review-needed'  // localStorage 장기추적은 신중 검토
} as const;

export const MARKETING_BEHAVIOR_PURCHASE_MATCH_POLICY = {
  storeOrderRaw: false,              // 주문번호 원문 저장 금지
  identifier: 'orderIdHash',         // 해시만 저장
  joinWithOrderData: 'hash-or-aggregate', // 주문 READ와 매칭도 해시/집계 수준
  v0Status: 'ready'                  // v0: "준비 가능" 상태
} as const;

// ── 향후 수집 endpoint 계약 초안(★ route는 생성하지 않음 — 미생성) ─────────────────
export const MARKETING_BEHAVIOR_FUTURE_ENDPOINT = '/api/marketing/behavior-events';

export interface MarketingBehaviorClientMeta {
  schemaVersion: number;             // 현재 0
  shopId: string;                    // 공개 shop 키/별칭(개인정보 아님)
}

// 수집 요청/응답 봉투(계약 초안 — 서버 구현은 다음 단계)
export interface MarketingBehaviorCollectionRequestDraft {
  events: Array<Record<string, unknown>>; // 서버에서 MarketingBehaviorEvent로 검증·정규화
  client: MarketingBehaviorClientMeta;
}
export interface MarketingBehaviorCollectionResponseDraft {
  ok: boolean;
  accepted: number;
  rejected: number;
}

// 서버 검증 정책(설계값 — 향후 route가 이 한도/allowlist를 사용) ─────────────────────
export const MARKETING_BEHAVIOR_COLLECTION_LIMITS = {
  schemaVersion: 0,
  maxEventsPerBatch: 50,
  maxStringLength: 256,
  requireOriginAllowlist: true,
  rateLimitPerMinute: 120
} as const;

// 허용 필드 allowlist(이외 필드는 서버에서 reject) ────────────────────────────────
export const MARKETING_BEHAVIOR_ALLOWED_FIELDS = [
  'eventId', 'sessionIdHash', 'occurredAt', 'eventName',
  'source', 'medium', 'campaign', 'referrerHost',
  'pagePath', 'pageTitle',
  'bannerId', 'bannerName', 'categoryId', 'categoryName',
  'productId', 'productName', 'searchTerm',
  'orderIdHash', 'revenue'
] as const;

// ★ PII 금지 필드 — 서버가 이 키를 발견하면 이벤트 reject. (저장·표시 모두 금지)
export const MARKETING_BEHAVIOR_FORBIDDEN_FIELDS = [
  'name',
  'phone',
  'email',
  'address',
  'customerName',
  'contact',
  'memberKey',
  'orderNo',
  'rawSessionId',
  'rawUserId'
] as const;

// IP/userAgent는 마케팅 행동 계약에 저장하지 않는다(서버 보안 로그 일시 보관과 분리).
export const MARKETING_BEHAVIOR_NON_CONTRACT_FIELDS = ['ipAddress', 'userAgentRaw'] as const;
