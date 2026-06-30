# Marketing Behavior Collection Endpoint v0

> **한 줄**: tracker prototype이 만든 `MarketingBehaviorEvent` payload를 **서버에서 안전하게 받는** 최소 수집 엔드포인트. validate → PII reject → allowlist sanitize → **dev in-memory buffer**까지. **DB 저장·대시보드 연결·고도몰 WRITE·GA4/GTM은 하지 않는다.**

- route: [`api/marketing/behavior-events.ts`](../api/marketing/behavior-events.ts)
- validator: [`api/_shared/marketingBehaviorCollectionValidator.ts`](../api/_shared/marketingBehaviorCollectionValidator.ts)
- store: [`api/_shared/marketingBehaviorEventStore.ts`](../api/_shared/marketingBehaviorEventStore.ts)
- 상위: [collection plan](./GODO_BEHAVIOR_TRACKER_COLLECTION_PLAN_V0.md) · [tracker prototype](./MARKETING_BEHAVIOR_TRACKER_SCRIPT_PROTOTYPE_V0.md)

## 1. 목적

tracker prototype은 payload를 **만들 수만** 있었다(전송 없음). 이 엔드포인트는 그 payload를 **서버가 받아 검증/정화**하는 첫 수신부다 — 단, 아직 **임시(dev) 보관**까지만.

## 2. Route

```
POST /api/marketing/behavior-events
```

- **GET 금지** — 이벤트 buffer를 조회/노출하지 않는다(405).
- **OPTIONS** — CORS preflight 최소 지원만.

> **POST 수집 vs GET summary 역할 차이**: 이 endpoint(`POST /behavior-events`)는 **수집 전용**(raw event를 받아 검증/저장). 화면이 보는 집계 결과는 별도 **`GET /api/marketing/behavior-summary`**(insights만, raw event 미노출)에서 온다. **raw events를 반환하는 GET은 계속 없다.** 문서: [MARKETING_BEHAVIOR_SUMMARY_LIVE_WIRING_V0.md](./MARKETING_BEHAVIOR_SUMMARY_LIVE_WIRING_V0.md).
>
> **저장 backend**: storage adapter를 통해 저장하므로, `GODO_BEHAVIOR_STORAGE_BACKEND=postgres`+DB url이 설정되면 **Postgres에 영속 저장**된다(미설정 시 dev_buffer). 응답 `storage.backend`로 표기. 문서: [MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md](./MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md).

## 3. 이번 v0에서 **하는** 일

- payload **validate** (body/events 구조)
- **PII reject** (forbidden key deep-scan + email/전화 value 패턴)
- **eventName / source allowlist** 검증
- **batch size 제한** (events 1~50개)
- **문자열 길이 제한** (초과 시 truncate 아닌 **reject** — 보안 명확)
- **unknown field drop** (허용 필드만 sanitize)
- **dev in-memory buffer 저장** (비영속)
- **accepted / rejected count** 반환

## 4. 이번 v0에서 **하지 않는** 일

- ❌ DB 저장 없음 (module-level 메모리 buffer뿐)
- ❌ 대시보드 live 연결 없음 (`buildMarketingBehaviorInsights` 미연결)
- ❌ GA4 / GTM 없음 · 광고 API 없음
- ❌ 고도몰 WRITE 없음 (상품/주문/회원/문의/리뷰 미수정)
- ❌ GET 조회 API 없음 (buffer 노출 없음)
- ❌ tracker 자동 전송 없음 (prototype은 여전히 payload 생성만)

## 5. Request / Response 예시

**요청 (valid):**
```json
{
  "events": [
    { "eventId": "evt_1", "sessionIdHash": "proto_abc", "eventName": "banner_click",
      "occurredAt": "2026-06-30T10:12:00+09:00", "source": "blog", "pagePath": "/",
      "bannerId": "main-hero-02", "bannerName": "여름 기획전 배너" }
  ],
  "client": { "schemaVersion": 0, "shopId": "demo-shop" }
}
```

**성공:**
```json
{ "ok": true, "accepted": 1, "rejected": 0, "mode": "dev_buffer" }
```

**부분 거부 (PII 필드 포함된 이벤트):**
```json
{ "ok": true, "accepted": 1, "rejected": 1, "mode": "dev_buffer",
  "errors": [ { "index": 1, "reason": "Forbidden field detected: email" } ] }
```

**전체 거부 (잘못된 eventName):**
```json
{ "ok": false, "accepted": 0, "rejected": 1,
  "errors": [ { "index": 0, "reason": "Invalid eventName" } ] }
```

**too large batch (51개+):** → `400` `{ "ok": false, "errors": [{ "index": -1, "reason": "Too many events: 51 > 50" }] }`

## 6. PII 정책

- **forbidden key (reject):** `name`(정확 key만) · `phone` · `email` · `address` · `customerName` · `contact` · `memberKey` · `orderNo` · `rawSessionId` · `rawUserId` — 대소문자/구분자 변형(`order_no`, `Email`, `phoneNumber` 등) 정규화 후 탐지, 중첩 객체까지 재귀 스캔.
- **allowed public fields:** `eventId` · `sessionIdHash` · `occurredAt` · `eventName` · `source/medium/campaign` · `referrerHost` · `pagePath` · `pageTitle` · `bannerId/Name` · `categoryId/Name` · `productId/Name` · `searchTerm` · `orderIdHash` · `revenue`
- `productName`/`bannerName`/`categoryName`은 공개정보라 허용 — `'name'` substring만으로 막지 않고 **정확 key `name`만** 금지.
- **value scan:** 모든 문자열에서 email 패턴 reject, 자유 텍스트 필드(검색어/제목/배너·카테고리·상품명/캠페인)에서 전화번호 패턴 reject. id/hash 필드는 오탐 방지를 위해 전화 스캔 제외.
- 세션/주문은 **`sessionIdHash` / `orderIdHash`만** 허용(원문 금지).

## 7. unknown fields 정책

- 이벤트에서 **허용 필드만 sanitize**해서 저장한다.
- forbidden key가 있으면 그 **이벤트 전체를 reject**.
- 단순 unknown key(허용/금지 아님)는 조용히 **drop**(저장 안 함).

## 8. Origin / CORS 정책

- 환경변수 `GODO_BEHAVIOR_ALLOWED_ORIGINS`(comma-separated)가 있으면 그 allowlist로 검사.
- 미설정 시 dev에서는 `localhost` / `127.0.0.1`만 허용, **production 미지 도메인은 conservative reject**.
- **와일드카드(`*`) 허용 금지.**
- Origin 헤더 부재(same-origin/server-to-server/curl)는 허용.
- ⚠️ **실제 고도몰 도메인 연결 전에 반드시 `GODO_BEHAVIOR_ALLOWED_ORIGINS`에 운영 도메인을 추가**해야 한다 (예: 실제 운영 `*.godomall.com` 형태의 정확한 도메인). 와일드카드는 쓰지 않는다.

## 8-1. Storage interface (Persistent Storage v0 이후)

endpoint는 이제 **storage 인터페이스**(`getMarketingBehaviorStorage()`)를 통해 저장한다 — dev buffer와 future persistent(DB/KV)를 갈아끼울 수 있다. 응답에 `mode`와 `storage.persistentReady`가 포함된다(현재 `dev_buffer` / `persistentReady: false`). 환경에 영속 백엔드 env가 감지되면 `pending`(손실 없이 dev buffer 보존 + 신호)으로 전환된다. 상세: [MARKETING_BEHAVIOR_PERSISTENT_STORAGE_V0.md](./MARKETING_BEHAVIOR_PERSISTENT_STORAGE_V0.md).

## 9. dev buffer 한계

- module-level **in-memory 배열**(최대 1000개, 초과 시 FIFO 제거).
- **Vercel serverless 인스턴스는 재활용/소멸되므로 영속 보장 없음.** production 저장소가 아니다.
- UI에서 조회하지 않으며 GET route로 노출하지 않는다. test helper(`clearMarketingBehaviorEventStoreForTest`)는 route가 아닌 내부 함수.
- 실제 운영 단계에서는 **DB/로그 저장소(Persistent Storage v0)** 가 필요하다.

## 10. 다음 단계

- **Tracker Send Adapter v0** ✅ — prototype에 optional `transport` 추가, 이 엔드포인트를 `fetch`로 호출 가능. 문서: [MARKETING_BEHAVIOR_TRACKER_SEND_ADAPTER_V0.md](./MARKETING_BEHAVIOR_TRACKER_SEND_ADAPTER_V0.md). **단, 고도몰 실제 삽입과 dashboard live wiring은 여전히 후속.**
- **Godo Skin Integration Guide v0** — 고도몰 스킨에 tracker 삽입.
- **Persistent Storage v0** — dev buffer → DB/로그.
- **Live Behavior Dashboard Wiring v0** — 수집 이벤트 → `buildMarketingBehaviorInsights(liveEvents, { mode: 'live', fallbackDemo: false })`.
