# Marketing Behavior Tracker Send Adapter v0

> **한 줄**: tracker prototype이 만든 `MarketingBehaviorEvent` payload를 collection endpoint로 **선택적으로(opt-in)** 보내는 transport adapter. **기본값은 전송 없음** — `transport` 옵션을 명시했을 때만 보낸다. 고도몰 삽입·대시보드 wiring·DB 저장은 하지 않는다.

- 코드: [`src/services/marketingBehaviorTrackerSendAdapter.ts`](../src/services/marketingBehaviorTrackerSendAdapter.ts)
- 연결: [tracker prototype](./MARKETING_BEHAVIOR_TRACKER_SCRIPT_PROTOTYPE_V0.md) · [collection endpoint](./MARKETING_BEHAVIOR_COLLECTION_ENDPOINT_V0.md)

## 1. 목적

prototype은 payload를 만들고 debug buffer에 쌓을 수만 있었다. 이 adapter는 그 payload를 **endpoint로 보낼 수 있는 통로**를 제공한다 — 단, **기본 비활성**. 나중에 고도몰 공통 레이아웃에 tracker를 심을 때 같은 adapter로 실제 전송을 켜면 된다.

```
MarketingBehaviorEvent[] → MarketingBehaviorTransport → createMarketingBehaviorFetchTransport() → POST /api/marketing/behavior-events
```

## 2. 하지 않는 것

- ❌ 자동 전송 기본 활성화 아님 (`transport` 없으면 기존처럼 debug buffer만)
- ❌ 고도몰 스킨 실제 삽입 아님
- ❌ GA4/GTM 연결 아님 · 광고 API 아님
- ❌ DB 저장 아님 · 대시보드 live wiring 아님
- ❌ 모듈 import만으로 fetch 실행 안 됨 (fetch는 `send()` 호출 시에만)

## 3. 기본 사용 예시

```ts
import { attachMarketingBehaviorTrackerPrototype } from '@/services/marketingBehaviorTrackerPrototype';
import { createMarketingBehaviorFetchTransport } from '@/services/marketingBehaviorTrackerSendAdapter';

const transport = createMarketingBehaviorFetchTransport({
  endpoint: '/api/marketing/behavior-events', // 기본값(생략 가능)
  shopId: 'demo-shop',
  schemaVersion: 0, // 기본값
  debug: true,
});

// transport를 넘겼을 때만 클릭 이벤트가 endpoint로 전송된다.
const cleanup = attachMarketingBehaviorTrackerPrototype({ debug: true, transport });
// 전송을 끄려면 transport를 빼면 됨:
// const cleanup = attachMarketingBehaviorTrackerPrototype({ debug: true }); // 전송 없음(기존 동작)
cleanup();
```

## 4. visit / landing 전송 예시

```ts
import { createPrototypeVisitEvents } from '@/services/marketingBehaviorTrackerPrototype';

const events = createPrototypeVisitEvents({ sessionIdHash: 'proto_xxx' }); // payload 생성만
const result = await transport.send(events);                              // 명시적으로 전송
// result: { ok, accepted, rejected, status?, errors? }
```

> `createPrototypeVisitEvents`는 v0에서 **자동 전송하지 않는다**(payload만 생성). 전송이 필요하면 위처럼 `transport.send(events)`를 명시적으로 호출한다.

## 5. 동작 정책

- **batch 1~50개만 전송.** 빈 배열 → endpoint 호출 없이 `{ ok: true, accepted: 0, rejected: 0 }`(보낼 게 없음 = no-op 성공). 51개+ → endpoint 호출 없이 `{ ok: false, ... }`(client에서 reject, split 안 함). 서버도 50 제한(이중 방어).
- **payload shape:** `{ "events": [...], "client": { "schemaVersion": 0, "shopId": "..." } }`
- **response normalize:** 서버의 `{ ok, accepted, rejected, errors, mode }` → `MarketingBehaviorSendResult`.

## 6. 실패 처리

- 네트워크 실패 / non-2xx(400·403 등) 시 **throw하지 않고 `{ ok: false, ... }` 반환** — 페이지 UI가 깨지지 않는다.
- `debug: true`면 `console.warn`으로 알림(전송 자체는 조용히 실패).

## 7. PII 정책

- **client 1차 차단:** `send()`가 payload를 deep key scan해서 forbidden key(`name`(정확) · `phone` · `email` · `address` · `customerName` · `contact` · `memberKey` · `orderNo` · `rawSessionId` · `rawUserId`)가 있으면 **endpoint를 호출하지 않고** `ok: false` 반환.
- `productName` / `bannerName` / `categoryName`은 공개정보라 허용 — `'name'`은 **정확 key만** 금지(substring 방식 아님).
- **서버 validator가 최종 차단** (이 adapter는 1차 방어).
- forbidden 목록은 `marketingBehaviorCollectionPlan`의 `MARKETING_BEHAVIOR_FORBIDDEN_FIELDS` 단일 소스를 소비.

## 8. 고도몰 삽입은 아직 하지 않는다

- 실제 삽입 전에는 **도메인 allowlist가 필요**하다.
- Vercel 환경변수 **`GODO_BEHAVIOR_ALLOWED_ORIGINS`** 에 실제 고도몰 도메인을 추가해야 외부에서 전송이 받아진다.
- **wildcard(`*`) 금지.**

## 9. 다음 단계

- **Godo Skin Integration Guide v0** — 고도몰 스킨에 tracker + transport 삽입 가이드.
- **Persistent Storage v0** — dev buffer → DB/로그.
- **Live Behavior Dashboard Wiring v0** — 수집 이벤트 → `buildMarketingBehaviorInsights(liveEvents, { mode: 'live', fallbackDemo: false })`.
