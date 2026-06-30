import type {
  MarketingBehaviorEvent,
  MarketingBehaviorEventName,
  MarketingBehaviorInsights
} from './marketingBehaviorTypes';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Data Contract v0 — 데모 데이터(실데이터 아님)
//
// 두 가지를 분리해 둔다:
//  (A) DEMO_BEHAVIOR_INSIGHTS — 화면에 그대로 표시할 "승인된 데모 예시" 수치(큐레이팅).
//        승인된 데모값(블로그 32% 등)은 단일 이벤트 스트림으로는 상호 모순이라(예: top-path
//        배너 ≠ 클릭TOP 배너) raw 역산이 불가 → demo는 큐레이팅 seed로 정확히 보존한다.
//  (B) demoMarketingBehaviorEvents — live 계약(MarketingBehaviorEvent[]) 형태를 보여주는
//        실제 raw 샘플. buildMarketingBehaviorInsights()가 실집계를 수행할 수 있음을 증명한다.
//        (실 수집 시작 시 이 자리에 진짜 이벤트가 들어오고 동일 빌더가 변환한다.)
//
// 모두 isDemo / mode='demo' 로 명시 → 실데이터로 오해 금지. PII 없음(해시/익명 식별자만).
// ────────────────────────────────────────────────────────────────────────────

// (A) 큐레이팅 데모 인사이트 — 운영자가 승인한 정확 예시값.
export const DEMO_BEHAVIOR_INSIGHTS: MarketingBehaviorInsights = {
  dataStatus: {
    mode: 'demo',
    label: '데모 예시 (실제 데이터 아님)',
    eventCount: 0, // 실제 수집 이벤트는 0 — 화면 수치는 데모 예시
    connectedSources: [],
    isDemo: true
  },
  acquisition: {
    topSources: [
      { label: '블로그', source: 'blog', sessions: 32, sharePercent: 32 },
      { label: '검색', source: 'search', sessions: 28, sharePercent: 28 },
      { label: '광고', source: 'ad', sessions: 21, sharePercent: 21 },
      { label: 'SNS', source: 'sns', sessions: 11, sharePercent: 11 },
      { label: '직접 방문', source: 'direct', sessions: 8, sharePercent: 8 }
    ]
  },
  topPaths: [
    { rank: 1, pathLabels: ['메인페이지', '메인 배너 2번', '신상품 카테고리', '스위트 00 젤'], sessions: 34, sharePercent: 34 },
    { rank: 2, pathLabels: ['메인페이지', '베스트 카테고리', '에그 00'], sessions: 21, sharePercent: 21 },
    { rank: 3, pathLabels: ['메인페이지', '검색', '스위트 00 젤'], sessions: 16, sharePercent: 16 },
    { rank: 4, pathLabels: ['메인페이지', '신상품 카테고리', '미니 00'], sessions: 12, sharePercent: 12 },
    { rank: 5, pathLabels: ['메인페이지', '이벤트 페이지', '젤/로션 카테고리'], sessions: 9, sharePercent: 9 }
  ],
  topClicks: {
    banners: [
      { label: '여름 기획전 배너', clicks: 24, clickPercent: 24 },
      { label: '베스트 상품 배너', clicks: 18, clickPercent: 18 },
      { label: '신규 회원 쿠폰 배너', clicks: 13, clickPercent: 13 }
    ],
    categories: [
      { label: '신상품', clicks: 31, clickPercent: 31 },
      { label: '바이브레이터', clicks: 22, clickPercent: 22 },
      { label: '젤/로션', clicks: 17, clickPercent: 17 }
    ],
    products: [
      { label: '스위트 00 젤', clicks: 12, clickPercent: 12 },
      { label: '에그 00', clicks: 10, clickPercent: 10 },
      { label: '미니 00', clicks: 8, clickPercent: 8 }
    ]
  },
  dropOffs: [
    { label: '메인페이지', sessions: 42, dropOffPercent: 42 },
    { label: '카테고리 보기 후 이탈', sessions: 27, dropOffPercent: 27 },
    { label: '상품 상세 보기 후 이탈', sessions: 18, dropOffPercent: 18 },
    { label: '장바구니 후 이탈', sessions: 9, dropOffPercent: 9 },
    { label: '결제 시작 후 이탈', sessions: 4, dropOffPercent: 4 }
  ],
  summaryCards: {
    topSourceLabel: '블로그',
    topSourcePercent: 32,
    topPathLabel: '메인 > 신상품 > 상품상세',
    topClickLabel: '메인 배너 2번',
    topDropOffLabel: '메인페이지',
    topDropOffPercent: 42
  }
};

// ── (B) live 형태 raw 샘플 ───────────────────────────────────────────────────
// 실제 수집 시 들어올 MarketingBehaviorEvent[] 형태를 그대로 보여주는 익명 샘플.
// 빌더 실집계 동작 증명용(smoke). 큐레이팅 데모와 수치가 같을 필요는 없다.
type Step = Partial<MarketingBehaviorEvent> & { eventName: MarketingBehaviorEventName };

const buildSession = (sid: string, hour: number, steps: Step[]): MarketingBehaviorEvent[] =>
  steps.map((st, i) => ({
    eventId: `demo_evt_${sid}_${i}`,
    sessionIdHash: `sesshash_${sid}`, // 데모용 해시(원문 세션 식별자 아님)
    occurredAt: `2026-06-30T${String(hour).padStart(2, '0')}:${String(i * 2).padStart(2, '0')}:00.000Z`,
    ...st
  }));

export const demoMarketingBehaviorEvents: MarketingBehaviorEvent[] = [
  ...buildSession('a', 9, [
    { eventName: 'visit', source: 'blog', referrerHost: 'blog.example.com', pagePath: '/', pageTitle: '메인페이지' },
    { eventName: 'banner_click', bannerId: 'b2', bannerName: '메인 배너 2번' },
    { eventName: 'category_click', categoryId: 'c-new', categoryName: '신상품 카테고리' },
    { eventName: 'product_view', productId: 'p-sweet', productName: '스위트 00 젤' },
    { eventName: 'add_to_cart', productId: 'p-sweet', productName: '스위트 00 젤' },
    { eventName: 'exit', pagePath: '/goods', pageTitle: '상품 상세 보기 후 이탈' }
  ]),
  ...buildSession('b', 10, [
    { eventName: 'visit', source: 'search', medium: 'organic', pagePath: '/', pageTitle: '메인페이지' },
    { eventName: 'search', searchTerm: '젤' },
    { eventName: 'product_view', productId: 'p-sweet', productName: '스위트 00 젤' },
    { eventName: 'exit', pagePath: '/goods', pageTitle: '상품 상세 보기 후 이탈' }
  ]),
  ...buildSession('c', 11, [
    { eventName: 'visit', source: 'ad', campaign: 'summer', pagePath: '/', pageTitle: '메인페이지' },
    { eventName: 'banner_click', bannerId: 'b-summer', bannerName: '여름 기획전 배너' },
    { eventName: 'category_click', categoryId: 'c-vibe', categoryName: '바이브레이터' },
    { eventName: 'exit', pagePath: '/category', pageTitle: '카테고리 보기 후 이탈' }
  ]),
  ...buildSession('d', 12, [
    { eventName: 'visit', source: 'sns', pagePath: '/', pageTitle: '메인페이지' },
    { eventName: 'category_click', categoryId: 'c-gel', categoryName: '젤/로션' },
    { eventName: 'product_view', productId: 'p-egg', productName: '에그 00' },
    { eventName: 'exit', pagePath: '/goods', pageTitle: '상품 상세 보기 후 이탈' }
  ]),
  ...buildSession('e', 13, [
    { eventName: 'visit', source: 'direct', pagePath: '/', pageTitle: '메인페이지' },
    { eventName: 'exit', pagePath: '/', pageTitle: '메인페이지' }
  ]),
  ...buildSession('f', 14, [
    { eventName: 'visit', source: 'blog', referrerHost: 'blog.example.com', pagePath: '/', pageTitle: '메인페이지' },
    { eventName: 'banner_click', bannerId: 'b-best', bannerName: '베스트 상품 배너' },
    { eventName: 'category_click', categoryId: 'c-new', categoryName: '신상품 카테고리' },
    { eventName: 'product_view', productId: 'p-mini', productName: '미니 00' },
    { eventName: 'purchase', orderIdHash: 'orderhash_f1', revenue: 39000 },
    { eventName: 'exit', pagePath: '/order/done', pageTitle: '결제 시작 후 이탈' }
  ]),
  ...buildSession('g', 15, [
    { eventName: 'visit', source: 'search', medium: 'organic', pagePath: '/', pageTitle: '메인페이지' },
    { eventName: 'search', searchTerm: '에그' },
    { eventName: 'category_click', categoryId: 'c-gel', categoryName: '젤/로션' },
    { eventName: 'exit', pagePath: '/category', pageTitle: '카테고리 보기 후 이탈' }
  ]),
  ...buildSession('h', 16, [
    { eventName: 'visit', source: 'ad', campaign: 'signup', pagePath: '/', pageTitle: '메인페이지' },
    { eventName: 'banner_click', bannerId: 'b-coupon', bannerName: '신규 회원 쿠폰 배너' },
    { eventName: 'exit', pagePath: '/', pageTitle: '메인페이지' }
  ])
];
