# GODO Behavior Tracker Script & Collection Endpoint Plan v0

> **한 줄**: 고객 행동 분석 화면(`MarketingBehaviorEvent` 계약 + `buildMarketingBehaviorInsights`)에 **실제 고객 발자국**을 넣기 전에, *어떤 발자국을 / 어떤 모양으로 / 어떻게 안전하게* 받을지 그리는 **바닥 설계도**. 이번 작업은 **설계·계약·보안 정책·구현 순서** 정리이며, 실제 route·스크립트·GA4/GTM 연결은 만들지 않는다.

- 코드 계약 상수: [`src/services/marketingBehaviorCollectionPlan.ts`](../src/services/marketingBehaviorCollectionPlan.ts) — 이 문서의 설계를 머신리더블 단일 소스로 보관.
- 상위 계약: [`docs/MARKETING_BEHAVIOR_DATA_CONTRACT_V0.md`](./MARKETING_BEHAVIOR_DATA_CONTRACT_V0.md)

---

## 1. 왜 이 작업이 필요한가

- 고도몰 **주문/상품 API는 "결과" 데이터**다 — 무엇이 팔렸는지(매출·객단가·쿠폰·재구매)는 알지만, **어떻게 그 구매에 도달했는지**는 모른다.
- 주문/상품 API만으로는 **유입 경로, 배너 클릭, 내부 이동 경로, 이탈 지점**을 알 수 없다.
- 고객 행동 분석을 하려면 **쇼핑몰 화면에서 별도의 행동 이벤트를 수집**해야 한다.
- 이 행동 이벤트가 **`MarketingBehaviorEvent` 계약**으로 들어오면, 이미 만들어 둔 `buildMarketingBehaviorInsights()`와 고객 행동 분석 모달을 **그대로** 쓸 수 있다(UI/타입 변경 불필요).

---

## 2. 전체 구조 (목표 흐름)

```
고도몰 쇼핑몰 화면
  → 공통 레이아웃 / 외부 스크립트 영역에 GODO Behavior Tracker Script 삽입
  → 브라우저에서 방문/클릭/검색/상품조회/장바구니/구매완료 이벤트 수집
  → 향후 POST /api/marketing/behavior-events 로 전송            (★ 아직 미생성)
  → 서버에서 PII 제거 및 검증(allowlist·forbidden·길이·rate limit)
  → MarketingBehaviorEvent[] 저장 또는 요약
  → buildMarketingBehaviorInsights(liveEvents, { mode: 'live', fallbackDemo: false })
  → 마케팅팀 고객 행동 분석 모달 반영
```

현재는 이 사슬의 **마지막 두 단계가 이미 구현**되어 있고(`buildMarketingBehaviorInsights` + 모달), 앞단(tracker → endpoint)이 이 문서가 그리는 설계 대상이다.

---

## 3. 추적 이벤트 정의 (10종)

> 코드 단일 소스: `MARKETING_BEHAVIOR_TRACKED_EVENTS` (eventName은 기존 `MarketingBehaviorEventName`과 정합).

| # | eventName | 쉬운 말 | 무엇을 잡나 | 주요 필드 |
|---|---|---|---|---|
| 1 | **visit** | 방문 시작 | 세션 시작 | source / referrer / utm |
| 2 | **landing** | 첫 진입 | 첫 진입 페이지 | landingPath(pagePath), pageTitle |
| 3 | **banner_click** | 배너 클릭 | 어떤 배너를 클릭 | bannerId, bannerName, targetUrl |
| 4 | **category_click** | 카테고리 이동 | 어떤 카테고리로 이동 | categoryId, categoryName |
| 5 | **product_view** | 상품 상세 보기 | 어떤 상품 상세를 봤나 | productId, productName, categoryName |
| 6 | **search** | 검색 | 검색어 입력 | searchTerm |
| 7 | **add_to_cart** | 장바구니 담기 | 장바구니 담기 | productId, productName |
| 8 | **checkout_start** | 결제 시작 | 결제 시작 | (금액은 v0 선택) |
| 9 | **purchase** | 구매 완료 | 구매 완료 | orderIdHash, revenue — **orderNo 원문 저장 금지** |
| 10 | **exit** | 이탈 | 마지막 본 페이지/단계 기준 이탈 추정 | pagePath, pageTitle |

> `targetUrl`/`landingPath`는 tracker가 잡는 보조 필드로, 서버 정규화 시 매핑한다. 현재 `MarketingBehaviorEvent` 타입은 깨지 않으며, 필요 시 endpoint 구현 단계에서 선택 필드로 확장한다.

---

## 4. 고도몰 화면에서 이벤트를 잡는 방식

### A. 권장 — data attribute 기반
> 코드 단일 소스: `MARKETING_BEHAVIOR_DATA_ATTRIBUTES`

```html
<!-- 배너 -->
<a data-godo-track="banner" data-godo-banner-id="main-hero-02" data-godo-banner-name="여름 기획전 배너"> ... </a>

<!-- 카테고리 -->
<a data-godo-track="category" data-godo-category-id="new" data-godo-category-name="신상품"> ... </a>

<!-- 상품 -->
<a data-godo-track="product" data-godo-product-id="1000000123" data-godo-product-name="상품명"> ... </a>
```

장점: 가장 정확 · selector가 깨질 가능성 낮음 · 배너/카테고리/상품명을 운영자가 관리하기 쉬움.

### B. 보조 — URL path / href / alt / class 추론
- `/goods/goods_view.php?goodsNo=...` → product_view
- `/goods/goods_list.php?cateCd=...` → category_click
- 검색 결과 URL → search
- 장바구니 버튼 class → add_to_cart

단점: 고도몰 스킨 변경 시 깨질 수 있어 selector 보정 필요.

### C. 초기 권장
전체 자동 추적보다 **핵심 영역부터 data attribute**를 붙인다 — 메인 배너 → 주요 카테고리 → 상품 상세 → 검색 → 장바구니 버튼 순.

---

## 5. 유입 경로(외부) 수집 방식

> 코드 단일 소스: `MARKETING_BEHAVIOR_ACQUISITION_SIGNALS`, `MARKETING_BEHAVIOR_SOURCE_RULES`

수집 후보: `document.referrer`, `location.href`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.

**source 정규화 규칙(예시)** — v0에서는 **데이터/상수로만 정의**, 실제 정규화 구현은 다음 단계:

| source | 판별 예시 |
|---|---|
| **blog** | blog.naver.com / post.naver.com / tistory.com |
| **search** | search.naver.com / google.com 검색 / daum.net, utm_medium=organic |
| **ad** | utm_medium=cpc·paid, utm_source=google_ads/naver_ad/meta/kakao_ad |
| **sns** | instagram / facebook / x / tiktok |
| **direct** | referrer 없음(주소 직접 입력·북마크) |
| **referral / unknown** | 그 외 외부 referrer / 판별 불가 |

---

## 6. 세션 식별 방식

> 코드 단일 소스: `MARKETING_BEHAVIOR_SESSION_POLICY`

- **raw user id 저장 금지 · raw session id 저장 금지 → `sessionIdHash`만 사용.**
- 설계안: 브라우저 `sessionStorage`에 익명 session seed 생성 → 서버 저장 시 `sha256`(후보) 해시.
- **비활동 30분** 이상 → 새 세션.
- `localStorage` 장기 추적은 신중히 검토(review-needed).
- 고객 이름·이메일·전화번호·주소·회원ID는 **수집하지 않는다.**

---

## 7. 구매 이벤트와 주문 데이터 매칭

> 코드 단일 소스: `MARKETING_BEHAVIOR_PURCHASE_MATCH_POLICY`

- purchase 이벤트는 **orderNo 원문을 저장하지 않는다 → `orderIdHash`만 저장.**
- 고도몰 주문 READ 데이터와 매칭할 때도 **해시 기준** 사용.
- 매칭이 어려우면 purchase event ↔ 주문 데이터는 **집계 수준**으로만 연결.
- **v0에서는 구매 매칭을 "준비 가능" 상태**로 둔다 — 실제 주문완료 페이지 구조 확인 후 설계.

---

## 8. 수집 API 계약 초안 (★ route는 만들지 않음 — 미생성)

> 코드 단일 소스: `MARKETING_BEHAVIOR_FUTURE_ENDPOINT`, `MARKETING_BEHAVIOR_COLLECTION_LIMITS`, `MarketingBehaviorCollectionRequestDraft/ResponseDraft`

**향후 route(미생성):** `POST /api/marketing/behavior-events`

Request body 초안:
```json
{
  "events": [
    {
      "eventId": "evt_xxx",
      "sessionIdHash": "sess_hash_xxx",
      "eventName": "banner_click",
      "occurredAt": "2026-06-30T10:12:00+09:00",
      "source": "blog",
      "pagePath": "/",
      "bannerId": "main-hero-02",
      "bannerName": "여름 기획전 배너"
    }
  ],
  "client": { "schemaVersion": 0, "shopId": "public_shop_key_or_alias" }
}
```

Response 초안:
```json
{ "ok": true, "accepted": 1, "rejected": 0 }
```

**서버 검증 정책(설계값):**
- `eventName` allowlist · `source` allowlist
- 문자열 길이 제한(maxStringLength 256)
- **PII 위험 필드 reject** — `orderNo` / `memberKey` / `name` / `phone` / `email` / `address` 등
- batch 과다 reject(maxEventsPerBatch 50)
- **origin allowlist** 검토 · **rate limit** 필요(rateLimitPerMinute 120)

---

## 9. 개인정보 / PII 금지 정책

> 코드 단일 소스: `MARKETING_BEHAVIOR_FORBIDDEN_FIELDS`, `MARKETING_BEHAVIOR_ALLOWED_FIELDS`

**금지(저장·표시·전송 모두):** `name`, `phone`, `email`, `address`, `customerName`, `contact`, `memberKey`, `orderNo`, `rawSessionId`, `rawUserId`, **IP address 저장**, **userAgent 원문 장기 저장**.

**허용:** `sessionIdHash`, `orderIdHash`, 익명 `eventId`, `source/medium/campaign`, `referrerHost`, `pagePath`, `bannerName`, `categoryName`, `productName`, public `productId`, `revenue`(aggregate).

> userAgent·IP는 서버 보안 로그에 일시적으로 남을 수 있으나, **마케팅 행동 데이터 계약에는 저장하지 않는다**(`MARKETING_BEHAVIOR_NON_CONTRACT_FIELDS`로 분리 명시).

---

## 10. 실제 구현 단계 로드맵

| Phase | 산출물 | 핵심 |
|---|---|---|
| **1** | **Marketing Behavior Tracker Script Prototype v0** ✅ *(문서: [MARKETING_BEHAVIOR_TRACKER_SCRIPT_PROTOTYPE_V0.md](./MARKETING_BEHAVIOR_TRACKER_SCRIPT_PROTOTYPE_V0.md))* | 브라우저에서 이벤트 payload **생성·debug buffer까지만** · console/debug mode · **fetch/API 전송 없음**(다음 Collection Endpoint v0에서 검토) |
| **2** | **Collection Endpoint v0** ✅ *(문서: [MARKETING_BEHAVIOR_COLLECTION_ENDPOINT_V0.md](./MARKETING_BEHAVIOR_COLLECTION_ENDPOINT_V0.md))* | `POST /api/marketing/behavior-events` · validation/PII reject/allowlist/batch limit · **dev in-memory buffer까지만**(DB·대시보드 live wiring은 후속) · **PII reject smoke** |
| **2.5** | **Persistent Storage v0** ✅ *(문서: [MARKETING_BEHAVIOR_PERSISTENT_STORAGE_V0.md](./MARKETING_BEHAVIOR_PERSISTENT_STORAGE_V0.md))* | endpoint를 storage 인터페이스 뒤로 정리(dev_buffer↔persistent 갈아끼움) · 영속 저장소 없으면 fake 금지·`persistentReady:false` · **누적 패턴 분석엔 영속 저장소 필요** |
| **3** | **Godo Skin Integration Guide v0** | 고도몰 공통 레이아웃/외부 스크립트 삽입 가이드 · data attribute 적용 · 배너/카테고리/상품/검색/장바구니 selector 확인 |
| **4** | **Live Behavior Dashboard Wiring v0** | 수집 이벤트 → `buildMarketingBehaviorInsights(liveEvents, { mode: 'live', fallbackDemo: false })` · demo/live toggle 또는 dataStatus 자동 전환 |
| **5** | **GA4/GTM Adapter v0** | 필요 시 외부 분석 도구 데이터를 **같은 MarketingBehaviorEvent/Insights 계약**으로 변환 |

---

## 11. 이번 작업에서 하지 않은 것 (명시)

- ❌ 실제 `/api/marketing/behavior-events` route 생성 없음
- ❌ 실제 fetch 수집 코드 없음
- ❌ 실제 고도몰 스킨 삽입 스크립트 없음
- ❌ 실제 GA4 / GTM 연결 없음 · 광고 API 연결 없음
- ❌ 고도몰 WRITE 없음
- ❌ 방문/클릭/전환/ROAS/CPA/CTR fake 실데이터 생성 없음
- ❌ 고객 PII 저장/표시 없음
