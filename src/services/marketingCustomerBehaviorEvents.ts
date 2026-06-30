// ────────────────────────────────────────────────────────────────────────────
// Marketing Customer Behavior — 추적 이벤트 단일 소스 (데이터/헬퍼 전용, 컴포넌트 아님)
//
// KPI 카드 "0/8"과 고객 행동 분석 modal이 같은 정의를 공유하도록 분리.
// (component 파일에서 상수 export 시 react-refresh 규칙 위반 → 별도 .ts로 분리)
// 가오픈 단계: 실제 추적 미연결 → 전부 connected=false. 행동 수치는 만들지 않는다.
// ────────────────────────────────────────────────────────────────────────────

export interface BehaviorTrackingEvent {
  id: string;
  label: string; // 이벤트명 (예: page_view)
  description: string; // 무엇을 수집하는지
  connected: boolean; // 실제 추적 연결 여부 — 현재 전부 false
}

// 8개 추적 이벤트. 연결되면 해당 항목의 connected만 true로 바뀐다(수동 fake 금지).
export const CUSTOMER_BEHAVIOR_EVENTS: BehaviorTrackingEvent[] = [
  { id: 'page_view', label: 'page_view', description: '사용자가 어떤 페이지를 봤는지', connected: false },
  { id: 'landing_view', label: 'landing_view', description: '첫 진입 페이지가 어디인지', connected: false },
  { id: 'banner_click', label: 'banner_click', description: '어떤 배너를 클릭했는지', connected: false },
  { id: 'category_view', label: 'category_view', description: '어떤 카테고리로 이동했는지', connected: false },
  { id: 'view_item', label: 'view_item', description: '어떤 상품 상세를 봤는지', connected: false },
  { id: 'search', label: 'search', description: '어떤 검색어를 입력했는지', connected: false },
  { id: 'add_to_cart', label: 'add_to_cart', description: '어떤 상품을 장바구니에 담았는지', connected: false },
  { id: 'begin_checkout', label: 'begin_checkout / purchase', description: '결제 시작 및 구매 완료 이벤트', connected: false }
];

export const TOTAL_BEHAVIOR_EVENTS = CUSTOMER_BEHAVIOR_EVENTS.length;

// 연결된 이벤트 수(현재 0). 카드 "0/8"과 모달 상태 카드가 같은 값을 쓰도록 helper로 노출.
export const connectedBehaviorEventCount = (): number => {
  let n = 0;
  for (const e of CUSTOMER_BEHAVIOR_EVENTS) if (e.connected) n += 1;
  return n;
};
