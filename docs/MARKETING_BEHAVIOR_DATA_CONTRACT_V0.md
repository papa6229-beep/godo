# Marketing Behavior Data Contract v0

> **한 줄**: 고객 행동 분석 모달을 "UI 내부 하드코딩 데모"에서 **`이벤트 → 빌더 → 인사이트 → 화면`** 데이터 계약 위로 올렸다. 지금은 데모 예시를 보여주지만, 실제 행동 데이터가 들어오면 **UI 변경 없이 동일 화면**이 실데이터로 채워진다.

## 1. 목적

쇼핑몰 정식 오픈 후 실제 고객의 유입/이동/클릭/이탈 흐름이 발생하면, 그 데이터를 **그대로 반영**할 수 있는 구조를 미리 만든다. 실 수집 전까지는 계속 "데모 예시"를 보여주되, 화면을 떠받치는 내부 구조는 live-ready로 둔다.

흐름:

```
MarketingBehaviorEvent[]            (수집된 행동 이벤트 — 지금은 데모 샘플)
  → buildMarketingBehaviorInsights() (deterministic 집계: 유입/경로/클릭/이탈/요약)
  → MarketingCustomerBehaviorModal   (운영자 친화 화면 — 수치를 직접 만들지 않음)
```

## 2. 왜 고도몰 주문/상품 API만으로는 부족한가

| 구분 | 주문 데이터(고도몰 API) | 행동 데이터(이 계약) |
|---|---|---|
| 답하는 질문 | 무엇이 **팔렸나**(매출·객단가·쿠폰·재구매) | 손님이 **어떻게 움직였나**(유입·이동·클릭·이탈) |
| 단위 | 주문 / 상품 / 회원(집계) | 세션(익명) / 이벤트 |
| 구매 전 행동 | 보이지 않음 | 보임(배너 클릭, 상품 조회, 검색, 이탈 지점) |
| 유입 출처 | 없음 | 있음(블로그/검색/광고/SNS/직접) |
| 개선 액션 | 가격·프로모션·재고 | 배너 위치·카테고리 노출 순서·추천 위치·이탈 페이지 |

주문 데이터는 "결과"만 보여준다. 마케팅이 배너/카테고리/추천 배치를 바꿔 **전환을 끌어올리려면** 구매 이전의 이동·클릭·이탈 흐름이 필요하고, 그건 행동 데이터로만 알 수 있다.

## 3. 데모 → 라이브 전환 구조

`buildMarketingBehaviorInsights(events, options)` 한 곳이 분기점이다.

| 호출 | 결과 |
|---|---|
| `(demoEvents, { mode: 'demo', fallbackDemo: true })` | **승인된 데모 예시값**(현재 모달이 사용, `isDemo: true`) |
| `([], { fallbackDemo: true })` | 데모 예시(이벤트 없을 때 폴백) |
| `([], { fallbackDemo: false })` | **수집 대기(empty/collecting)** 상태 |
| `(liveEvents, { mode: 'live', fallbackDemo: false })` | **실데이터 집계** — 같은 화면, 진짜 수치 |

→ 실 수집이 시작되면 모달의 호출 인자만 마지막 줄로 바꾸면 된다. **타입·UI·렌더 경로는 그대로.**

> 데모 예시값은 단일 이벤트 스트림으로는 상호 모순(예: top-path의 배너와 클릭TOP 배너가 다름)이라 raw 이벤트로 역산하지 않고, 운영자가 승인한 정확값을 **큐레이팅 seed**(`DEMO_BEHAVIOR_INSIGHTS`)로 보존한다. 동시에 `demoMarketingBehaviorEvents` raw 샘플로 실집계 경로가 정상 동작함을 smoke로 증명한다.

## 4. 타입 — `src/services/marketingBehaviorTypes.ts`

### `MarketingBehaviorEvent`
단일 행동 이벤트. 유입 맥락(source/medium/campaign/referrerHost), 페이지(pagePath/Title), 배너/카테고리/상품(공개정보), 검색어, 구매(orderIdHash/revenue)를 담는다.

### `MarketingBehaviorInsights`
화면이 그대로 렌더하는 변환 결과:
- `dataStatus`: mode(`demo|collecting|live`) · label · eventCount · connectedSources · **isDemo**
- `acquisition.topSources`: 유입 채널별 세션수/비중
- `topPaths`: 이동 경로 순위/노드/비중
- `topClicks`: 배너/카테고리/상품 클릭 TOP
- `dropOffs`: 이탈 지점별 비중
- `summaryCards`: 상단 요약 카드 파생값

## 5. PII / 개인정보 정책

**금지(저장·표시 모두):** `name`, `phone`, `email`, `address`, `customerName`, `contact`, `memberKey`, `orderNo`(원문), `rawSessionId`, `rawUserId`

**허용:** `sessionIdHash`, `orderIdHash`, 익명 `eventId`, `pagePath`, `bannerName`, `categoryName`, `productName`, `referrerHost`, `source/medium/campaign`

> productName·categoryName·bannerName은 쇼핑몰 공개정보라 허용. 고객 식별 정보는 어떤 형태로도 계약에 넣지 않는다. 세션/주문은 해시로만 참조한다.

## 6. 실제 연결 후보 (이번 작업에서 만들지 않음 — 향후)

1. **GODO 외부스크립트 / 공통 레이아웃 기반 자체 추적** — 고도몰 공통 HTML(헤더/푸터)에 경량 트래커를 심어 `MarketingBehaviorEvent`를 자체 수집 → `/api/marketing/behavior-events`(미생성)로 전송.
2. **GA4 Data API adapter** — GA4 수집 후 Data API로 읽어 `MarketingBehaviorEvent[]`로 매핑.
3. **GTM dataLayer bridge** — GTM `dataLayer` 이벤트를 같은 타입으로 정규화.
4. **광고 픽셀 / UTM adapter** — UTM 파라미터 → `source/medium/campaign` 매핑.

향후 확장 지점(코드 주석에도 명시):
- `/api/marketing/behavior-events` (수집 엔드포인트 — **미생성**)
- GODO Behavior Tracker Script (**미생성**)
- GA4 Data API adapter / GTM dataLayer bridge (**미생성**)

## 7. 이번 작업에서 하지 않은 것 (명시)

- ❌ 실제 GA4 연결 없음
- ❌ 실제 GTM 연결 없음
- ❌ 광고 API 연결 없음
- ❌ 실제 행동 수집 API route(`/api/marketing/behavior-events`) 생성 없음
- ❌ 행동 추적 스크립트 생성 없음
- ❌ 고도몰 WRITE 없음
- ❌ 방문/클릭/전환/ROAS/CPA/CTR fake 실데이터 생성 없음(데모는 `isDemo`로 명시)
- ❌ 고객 PII 저장/표시 없음

## 8. 파일

| 파일 | 역할 |
|---|---|
| `src/services/marketingBehaviorTypes.ts` | 이벤트/인사이트/모드 타입 계약 |
| `src/services/marketingBehaviorDemoData.ts` | 큐레이팅 데모 인사이트 + live 형태 raw 샘플 |
| `src/services/marketingBehaviorInsights.ts` | `buildMarketingBehaviorInsights()` 변환 레이어 |
| `src/components/MarketingCustomerBehaviorModal.tsx` | 인사이트 기반 렌더(수치 직접 생성 안 함) |
| `scripts/smoke-marketing-behavior-data-contract-v0.mjs` | 계약/분리/PII/금지사항 검증 |
