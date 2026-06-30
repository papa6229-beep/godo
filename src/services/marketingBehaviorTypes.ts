// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Data Contract v0 — 타입 계약
//
// 목적: 실제 고객 행동 데이터(유입/이동/클릭/이탈)가 들어와도 그대로 흐를 수 있는
//   데이터 계약을 먼저 정의한다. 현재는 데모 예시로 채우지만, 같은 타입에 live 이벤트가
//   들어오면 buildMarketingBehaviorInsights()가 동일하게 인사이트로 변환한다.
//
// 흐름: MarketingBehaviorEvent[] → buildMarketingBehaviorInsights() → MarketingCustomerBehaviorModal
//
// ★ PII 금지: 해시(sessionIdHash/orderIdHash)·익명 식별자만 사용. 원문 세션식별자·주문번호·
//   고객 이름/전화/이메일/주소/회원식별자 는 이 계약에 절대 포함하지 않는다.
//   productName/categoryName/bannerName/referrerHost/source 는 쇼핑몰 공개정보라 허용.
// ────────────────────────────────────────────────────────────────────────────

// 행동 이벤트 종류(고객이 쇼핑몰 안팎에서 한 행동의 단위)
export type MarketingBehaviorEventName =
  | 'visit'          // 외부에서 들어옴(세션 시작)
  | 'landing'        // 첫 진입 페이지 노출
  | 'banner_click'   // 배너 클릭
  | 'category_click' // 카테고리 진입/클릭
  | 'product_view'   // 상품 상세 조회
  | 'search'         // 검색
  | 'add_to_cart'    // 장바구니 담기
  | 'checkout_start' // 결제 시작
  | 'purchase'       // 구매 완료
  | 'exit';          // 이탈(세션 종료 지점)

// 외부 유입 채널(어디서 들어왔는가)
export type MarketingTrafficSource =
  | 'blog'
  | 'search'
  | 'ad'
  | 'sns'
  | 'direct'
  | 'referral'
  | 'unknown';

// 단일 행동 이벤트. live 수집/데모 모두 이 형태로 표현된다.
export type MarketingBehaviorEvent = {
  eventId: string;        // 익명 이벤트 식별자(개인정보 아님)
  sessionIdHash: string;  // 세션 해시(원문 세션 식별자 금지)
  occurredAt: string;     // ISO 시각(이벤트 순서/경로 재구성용)

  eventName: MarketingBehaviorEventName;

  // 유입 맥락(visit/landing에 주로 채워짐)
  source?: MarketingTrafficSource;
  medium?: string;
  campaign?: string;
  referrerHost?: string;

  // 페이지 맥락
  pagePath?: string;
  pageTitle?: string;

  // 배너/카테고리/상품(쇼핑몰 공개정보 — 경로/클릭 라벨로 사용)
  bannerId?: string;
  bannerName?: string;
  categoryId?: string;
  categoryName?: string;
  productId?: string;
  productName?: string;

  // 검색
  searchTerm?: string;

  // 구매(주문 매칭은 해시로만)
  orderIdHash?: string;
  revenue?: number;
};

// 데이터 모드: 데모 예시 / 수집 대기 / 실데이터
export type MarketingBehaviorDataMode = 'demo' | 'collecting' | 'live';

// 변환 결과(모달이 그대로 렌더). 모든 수치는 deterministic 집계값(LLM 생성 아님).
export type MarketingBehaviorInsights = {
  dataStatus: {
    mode: MarketingBehaviorDataMode;
    label: string;            // 화면 표기용 상태 라벨
    eventCount: number;       // 실제 수집된 이벤트 수(데모/수집대기는 0)
    connectedSources: string[]; // 실제로 데이터가 들어온 채널/소스
    isDemo: boolean;          // true면 "데모 예시" 배지 노출(실데이터 오해 방지)
  };

  // 1) 어디서 들어왔나 — 외부 유입 경로
  acquisition: {
    topSources: Array<{
      label: string;
      source: MarketingTrafficSource;
      sessions: number;
      sharePercent: number;
    }>;
  };

  // 2) 쇼핑몰 안에서 많이 이동한 경로
  topPaths: Array<{
    rank: number;
    pathLabels: string[]; // 노드 라벨 시퀀스(예: ['메인페이지','메인 배너 2번',...])
    sessions: number;
    sharePercent: number;
  }>;

  // 3) 많이 클릭한 영역
  topClicks: {
    banners: Array<{ label: string; clicks: number; clickPercent: number }>;
    categories: Array<{ label: string; clicks: number; clickPercent: number }>;
    products: Array<{ label: string; clicks: number; clickPercent: number }>;
  };

  // 4) 이탈이 많은 지점
  dropOffs: Array<{
    label: string;
    sessions: number;
    dropOffPercent: number;
  }>;

  // 상단 운영자 요약 카드용 파생값
  summaryCards: {
    topSourceLabel: string;
    topSourcePercent: number;
    topPathLabel: string;
    topClickLabel: string;
    topDropOffLabel: string;
    topDropOffPercent: number;
  };
};
