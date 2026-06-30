# Marketing Behavior Tracker Script Prototype v0

> **한 줄**: 나중에 고도몰 쇼핑몰에 넣을 행동 추적 스크립트의 **prototype**. 이번 단계는 "수집"이 아니라 **"수집 payload 생성 검증"** — 브라우저에서 `MarketingBehaviorEvent` payload를 만들어 **debug buffer/console로만** 확인한다. 실제 전송·API·삽입은 하지 않는다.

- 코드: [`src/services/marketingBehaviorTrackerPrototype.ts`](../src/services/marketingBehaviorTrackerPrototype.ts)
- 계약/계획: [`docs/GODO_BEHAVIOR_TRACKER_COLLECTION_PLAN_V0.md`](./GODO_BEHAVIOR_TRACKER_COLLECTION_PLAN_V0.md) · [`docs/MARKETING_BEHAVIOR_DATA_CONTRACT_V0.md`](./MARKETING_BEHAVIOR_DATA_CONTRACT_V0.md)

## 1. 목적

데이터 계약(`MarketingBehaviorEvent`)이 화면과 builder까지 이어져 있는데, **정작 그 이벤트가 실제 브라우저 화면/유입에서 제대로 뽑히는지**는 아직 검증된 적이 없었다. 이 prototype은 그걸 미리 확인한다 — **실제 쇼핑몰을 열기 전에**, 우리가 정의한 모양대로 payload가 나오는지.

## 2. 왜 아직 fetch/API 전송을 하지 않는가

- 전송 라우트(`/api/marketing/behavior-events`)는 아직 설계 단계(미생성)다.
- payload 모양이 확정되기 전에 전송부터 만들면, 모양이 바뀔 때 양쪽을 다시 고쳐야 한다.
- 그래서 **순서**: ① payload 생성 검증(이번) → ② Collection Endpoint(전송/검증) → ③ 고도몰 스킨 삽입 → ④ live 대시보드 연결.

## 3. prototype이 **하는** 일

- 현재 페이지 정보 읽기 (`readMarketingPageContext`) — pathname 중심
- 유입 경로/UTM/referrer 후보 읽기 + source 정규화 (`readMarketingTrafficSource`)
- 익명 세션 seed 생성 (`createMarketingBehaviorSessionSeed`) — `proto_` prefix 임시 익명값
- `data-godo-track` 요소에서 메타데이터 읽기 (`readTrackableElementMetadata`)
- `MarketingBehaviorEvent` payload 생성 (`createMarketingBehaviorEvent`) — allowlist만, PII 방어
- 진입 시 visit/landing payload 생성 (`createPrototypeVisitEvents`)
- 클릭 리스너 장착 + debug 확인 (`attachMarketingBehaviorTrackerPrototype`) — **cleanup 함수 반환**

## 4. prototype이 **하지 않는** 일

- ❌ 서버 전송 (`fetch` / `navigator.sendBeacon` / `XMLHttpRequest`) 없음
- ❌ `/api/marketing/behavior-events` 호출 없음 · API route 생성 없음
- ❌ GA4/GTM import · `window.gtag` 호출 · `dataLayer` push 없음
- ❌ 고도몰 스킨 자동 삽입 없음 · React 앱 자동 장착 없음 (호출 시에만 동작)
- ❌ 고객 PII 수집 없음 · query string 원문 저장 없음

> **세션 식별 주의**: prototype의 `sessionIdHash`는 `proto_` prefix 임시 익명값이다. **실제 live에서는 서버에서 sha256 등 hash 처리가 필요**하다(설계 문서 §6 참고).

## 5. 지원 data attribute

| `data-godo-track` | 매핑 이벤트 | 읽는 속성 |
|---|---|---|
| `banner` | `banner_click` | `data-godo-banner-id`, `data-godo-banner-name` |
| `category` | `category_click` | `data-godo-category-id`, `data-godo-category-name` |
| `product` | `product_view` | `data-godo-product-id`, `data-godo-product-name` |
| `cart` | `add_to_cart` | `data-godo-product-id`, `data-godo-product-name` |
| `checkout` | `checkout_start` | — |
| `search` | `search` | `data-godo-search-term` |

> `product_click`은 계약 union에 없으므로 새 이벤트명을 만들지 않고 `product_view`로 매핑한다. (기존 10종 안에서만 처리)

## 6. 예시 HTML

```html
<a
  href="/goods/goods_view.php?goodsNo=1000001"
  data-godo-track="banner"
  data-godo-banner-id="main-hero-02"
  data-godo-banner-name="여름 기획전 배너"
>
  여름 기획전
</a>
```

## 7. 예시 debug 사용

```ts
import { attachMarketingBehaviorTrackerPrototype } from '@/services/marketingBehaviorTrackerPrototype';

const cleanup = attachMarketingBehaviorTrackerPrototype({ debug: true });
// 배너/카테고리/상품/장바구니 클릭 후 콘솔에서 확인하거나:
window.__GODO_MARKETING_BEHAVIOR_DEBUG__   // MarketingBehaviorEvent[]
cleanup(); // 리스너 해제
```

## 8. 예시 payload

**visit** / **landing** (`createPrototypeVisitEvents`):
```json
[
  { "eventId": "evt_...", "sessionIdHash": "proto_...", "occurredAt": "2026-06-30T01:00:00.000Z",
    "eventName": "visit", "source": "blog", "referrerHost": "blog.naver.com" },
  { "eventId": "evt_...", "sessionIdHash": "proto_...", "occurredAt": "2026-06-30T01:00:00.000Z",
    "eventName": "landing", "pagePath": "/" }
]
```

**banner_click**:
```json
{ "eventId": "evt_...", "sessionIdHash": "proto_...", "occurredAt": "...",
  "eventName": "banner_click", "pagePath": "/", "bannerId": "main-hero-02", "bannerName": "여름 기획전 배너" }
```

**category_click**:
```json
{ "eventName": "category_click", "categoryId": "new", "categoryName": "신상품", "...": "..." }
```

**product_view**:
```json
{ "eventName": "product_view", "productId": "1000000123", "productName": "상품명", "...": "..." }
```

**add_to_cart**:
```json
{ "eventName": "add_to_cart", "productId": "1000000123", "productName": "상품명", "...": "..." }
```

## 9. PII 정책

- 이름 / 전화번호 / 이메일 / 주소 / 회원ID / `orderNo` 수집 금지
- `sessionIdHash`만 사용 (원문 세션/유저 식별자 금지)
- `orderIdHash`만 사용 (주문번호 원문 금지)
- query string 원문 저장 금지 (pathname 중심)
- payload는 `MARKETING_BEHAVIOR_ALLOWED_FIELDS` allowlist로 필터 — 그 외 키는 자동 제거(PII 방어막)

## 10. 다음 단계

- **Collection Endpoint v0** — `POST /api/marketing/behavior-events` + validation + PII reject (이 prototype payload를 받는 쪽)
- 이후 **Godo Skin Integration Guide v0** → **Live Behavior Dashboard Wiring v0**
