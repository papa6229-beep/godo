# RC-1 지표 계약 초안 (DRAFT)

- **상태**: DRAFT — 구현 지시서가 아니다. 승인 후 `revenueMetricContract.ts` 및 CommerceSnapshot 계약에 반영한다.
- **기준선**: `2d68505` / 실패 재현 근거: `scripts/smoke-metric-definition-parity-v0.mjs` (전용 브랜치 `fix/rc-1-metric-parity`)
- **원칙**: 이름이 같은 지표는 계산식이 같아야 한다. 관점이 다르면 **이름을 달리 한다.**

---

## C-1. 카테고리 출처 계약

**규칙 (정정 확정)**
1. 분석 카테고리는 **`RevenueOrderLine.categoryCode` 하나만** 기준으로 한다.
2. 값이 없으면 **`uncategorized`로 확정**한다.
3. **하위 분석 엔진은 현재 `productIndex`로 다시 분류하지 않는다.**

> **왜 "보충"을 없앴나 (2026-07-21 재추적)**
> `line.categoryCode`는 고도몰 원본 라인 필드가 **아니다.** `godomallRevenue.ts:223 mapLine()`이
> **적재 시점에 상품목록과 조인해서** 만든다: `categoryCode: matched.categoryCode || 'uncategorized'`.
> 즉 이미 **"적재 시점 상품 카테고리 스냅샷"**이다.
>
> 여기에 하위 소비자가 **현재** 상품목록으로 다시 보충하면, 상품 카테고리를 재분류하는 순간
> **과거 매출까지 새 카테고리로 소급 재분류**된다. 그래서 보충 규칙 자체를 폐기한다.
>
> `categorySource`는 실제보다 강한 이름(`order_line` 등)을 쓰지 않는다 →
> **`'ingestSnapshot' | 'none'`**.

**검증 기대값 (정정)**: `catLINE = 10,000` / `uncategorized = 50,000`(P5 20,000 + P6 30,000) / `catINDEX`·`catFALLBACK`는 결과에 존재하면 실패.

**기록 의무**: 결과에 `categorySource: 'ingestSnapshot' | 'none'`을 남길 수 있도록 **CommerceSnapshot 계약에 필드를 추가**한다. 어떤 기준으로 집계됐는지 사후 추적이 가능해야 한다.

**표기 규칙**: 키는 `uncategorized`로 통일하고, 화면 표시 라벨만 `미분류`로 한다. 현재 `scopeInsight`는 키 자체를 `미분류`로 만들어(`:320`) 다른 엔진과 대조가 불가능하다.

**현재 상태 (실측 — 금액까지 고정한 검증 결과)**

정답: `catLINE=10,000` / `uncategorized=50,000` / `catINDEX`·`catFALLBACK`는 존재 시 실패

| 엔진 | 실제 반환 | 계약 대비 |
|---|---|---|
| `marketingIntelligencePlanner` (`:510,:514`) | `catINDEX=10,000 \| catFALLBACK=20,000 \| uncategorized=30,000` | ❌ 현재 productIndex로 재분류 |
| `marketingScopeInsightEngine` (`:253-255`) | `카테고리 catINDEX=10,000 \| 카테고리 catFALLBACK=20,000 \| 미분류=30,000` | ❌ 동일 + **키 표기 불일치(미분류)** |
| `analyticsQueryEngine` | `catLINE=10,000 \| uncategorized=50,000` | ✅ **계약 부합 — 소스 수정 불필요** |

→ **`analyticsQueryEngine`은 이미 라인 기준이라 정정된 계약을 그대로 통과한다.** A-3에서 소스를 건드리지 않는다.
planner·scopeInsight만 **현재 상품목록 재분류를 제거**하면 된다.

---

## C-2. 매출 명명 계약 (확정)

| 이름 | 한글 | 계산식 | 용도 |
|---|---|---|---|
| **`validOrderRevenue`** | **유효주문 매출** | 결제완료·미취소 주문의 주문 총액 합 | **기본값.** 화면에서 이름 없이 "매출"이라 하면 이것 |
| **`placedOrderAmount`** | **주문발생금액** | 취소·미입금 포함 전체 주문의 상품 라인합 | 상품 판매흐름·재고 영향 분석 |

**금지어**: **"순매출"·`netRevenue`를 쓰지 않는다.** 반품·환불·할인·정산까지 반영한 것처럼 오해를 준다. 현재 시스템은 그 단계를 계산하지 않으므로 **"유효주문 매출"이 정직한 이름**이다. 정산 단계가 실제로 구현되면 그때 별도 이름을 추가한다.

**개명 대상 (현재 → 계약)**

| 현재 | 계약 | 위치 |
|---|---|---|
| `grossProductRevenue` / "상품매출" | `placedOrderAmount` / "주문발생금액" | `revenueMetricContract.ts:57, 93-99` |
| `netOrderRevenue` / "총매출" | `validOrderRevenue` / "유효주문 매출" | `revenueMetricContract.ts:64, 100-106` |
| `RevenueMetricKind`의 `netOrderRevenue`·`grossProductRevenue`·`validOrderRevenue` 3종 중복 | `validOrderRevenue` 1개로 통합 | `revenueMetricContract.ts:15-23` (`validOrderRevenue`가 이미 있고 설명이 `netOrderRevenue와 동일 기준`이라 명시 — 중복) |

**현재 상태**: `analyticsQueryEngine.ts:156`의 metric 라벨이 그냥 `'매출'`인데 계산은 `productRevenueByLines`(취소 포함 라인합)를 쓴다 → **이름은 "매출"인데 값은 주문발생금액.** 개명 1순위.

---

## C-3. 재고위험 단계 계약 — `demo-default-v1`

**하나의 임계값으로 합치지 않는다.** 단계형으로 두되, **영구 규칙이 아니라 초기 기본값**이다.

| 단계 | 조건 | 의미 |
|---|---|---|
| `soldOut` | 재고 = 0 | 품절 |
| `urgent` | 1 ~ 5 | 긴급 |
| `warning` | 6 ~ 20 | 주의 |
| `normal` | 21 이상 | 정상 |

**결과에 판정 근거를 반드시 남긴다.**

```
{ level: 'warning', threshold: { min: 6, max: 20 }, policyVersion: 'demo-default-v1' }
```
화면 표기 예: `재고 상태: 주의 · 판정 기준: 6~20개 · 정책 demo-default-v1`

**교체 계획**: 고정 수량 임계는 회전율을 무시한다 — **하루 100개 팔리는 상품과 한 달 1개 팔리는 상품을 같은 20개 기준으로 판단하면 안 된다.** 향후 **판매속도 기반 재고 소진 예상일**(예: 잔여일 ≤3 긴급 / ≤7 주의)로 교체한다. 이를 위해 단계 판정을 **한 함수 안에 격리**하고, 호출부는 단계와 근거만 소비한다.

**현재 상태 (실측)**: 채팅 `productTeamChatFacts.ts:409`는 ≤0 위험 / ≤5 주의, 대시보드 `ProductTeamDashboard.tsx:589-590`은 ≤20 danger / ≤40 warn, 스냅샷 `departmentDataSourceOfTruth.ts:113`은 ≤20, 캘린더 `CalendarPanel.tsx:27`은 20. → **"틀린 것"이 아니라 단계가 정의되지 않은 채 각자 다른 컷을 쓴 것.**

---

## C-4. 정규화 책임 계약

**원시값 정규화는 계산 모듈이 아니라 각 데이터 어댑터의 책임이다.**

```
고도몰 어댑터 ─┐
합성 어댑터   ─┼→ [정규화: boolean · canonical status] → CommerceSnapshot → 계산 모듈
CSV 어댑터    ─┘
```

| 항목 | 어댑터가 해야 할 일 | 계산 모듈이 받는 것 |
|---|---|---|
| 결제 여부 | `'Y'`/`'y'`/`'true'`/`1`/`true` → **boolean** | `paid: boolean` |
| 취소 여부 | 동일 | `canceled: boolean` |
| 문의 상태 | 원시 상태 문자열 → **canonical status** | `status: 'open' \| 'in_progress' \| 'answered' \| 'closed' \| 'unknown'` |

**문의 canonical status 5종 (확정)**: `open` / `in_progress` / `answered` / `closed` / `unknown`
계산 엔진 안에서 `미답변`·`unanswered`·`pending` 등을 정규식으로 해석하는 코드는 **최종적으로 전부 제거**한다(현재 6정의 — `csTeamDashboardFacts.ts:83`, `:320,378`, `csDashboardStatistics.ts:79`, `departmentDataSourceOfTruth.ts:76,125`, `analyticsQueryEngine.ts:572`, `departmentChatFacts.ts:83`).

> **⚠️ 긴급도 정정 (2026-07-21 재추적)**
> 매출분석 주문은 `godomallRevenue.ts:180 deriveOrderState()`를 거치며, 여기서 `paid`/`canceled`는
> **원시 `'Y'`를 읽는 것이 아니라 결제일·취소일·주문상태로 판정한 boolean**이다.
> 그리고 합성 데이터도 `syntheticCommerceUniverse.ts:504`에서 **같은 `mapOrdersToRevenue`를 통과**한다.
> 따라서 아래 `bool()` 3변종은 **이 경로에서는 이미 boolean을 받으므로 현재 활성 결함이 아니라 잠재 결함**이다.
> "고도몰이 `'Y'`를 보내면 엔진마다 갈린다"는 이전 서술은 **이 경로에 한해 성립하지 않는다 — 철회한다.**
> 제거는 모든 진입점이 canonical boolean으로 잠긴 것을 확인한 뒤에 한다.

**금지**: 계산 모듈이 `bool()` 헬퍼를 각자 구현하는 것. **현재 상태 — 실측 3변종(잠재):**
- `revenueMetricContract.ts:38` / `planner:153` / `scopeInsight:107` / `marketingAnalysisFacts:227` → `'y'`만
- `marketingAnalysisExecutor.ts:49` → `'Y'`·`1` 포함
- `departmentDataService.ts:68` → `'1'`·`'true'` 포함, **`'Y'` 없음**

→ 위 3변종은 **현재 경로에서는 잠재 결함**이다(바로 위 정정 참조). 제거는 모든 진입점이 canonical boolean으로 잠긴 것을 확인한 뒤에 하며, 어댑터 하나를 고쳤다는 이유로 소멸했다고 보고하지 않는다.

---

## RC-1 범위 밖 — 별도 등록

**`handled:true` 인데 `result`가 없는 질의 라우팅** — RC-3/RC-5 항목으로 등록. **이번 RC-1 수정에 섞지 않는다.**

- 재현: `buildMarketingScopeInsightResponse({ message: '2025년 3월 카테고리별 주문수 알려줘', ... })`
  → `handled: true`, 반환 키 `handled, artifact, reply, suppressChart` — **`result` 필드 자체가 없음**
- 대조: `'카테고리별 매출 알려줘'` → `result` 포함, `insightPack` 정상
- 의미: **시스템은 질문을 처리했다고 표시하지만 사용자에게 결과물을 주지 않는다.** 숫자 계산 오류가 아니라 "질문 라우팅 후 결과 소실"이며, 화면에는 성공처럼 보인다.

## 미해결 (계약 확정 전 확인 필요)

1. 실제 고도몰 `Order_Search` 응답의 `paid`/취소 필드 원시 표기 — 실데이터 확인 필요
2. 문의 원시 상태값의 전체 목록 — 어떤 값들이 오는지 확인 후 canonical 매핑표 작성
3. 재고 단계 경계(5 / 20)가 사업 기준으로 타당한지 — 운영 판단 필요

---

## C-5. 라인 축 집계 규칙 (신설)

라인 반복문이 오염시키는 것은 `orderCount` 하나가 아니다. **`marketingIntelligencePlanner.ts:517-527` 실측**:

```ts
for (const l of (o.lines || [])) {
  acc.revenue += lr; acc.lineRevenue += lr; acc.orderCount += 1; acc.quantity += numv(l.quantity);
  if (oCoupon) acc.couponOrders += 1; if (oReward) acc.rewardOrders += 1;
  if (oFirst) { acc.firstOrders += 1; ... } else { acc.repeatOrders += 1; ... }
}
```

→ `orderCount` / `couponOrders` / `rewardOrders` / `firstOrders` / `repeatOrders`가 **전부 라인마다 증가**한다.
`marketingScopeInsightEngine.ts:321-324`의 `couponOrders`도 같다.

**규칙**

| 지표 | 집계 방식 |
|---|---|
| `revenue`, `lineRevenue`, `quantity` | **라인별 합산** |
| `orderCount`, `couponOrders`, `rewardOrders`, `firstOrders`, `repeatOrders` | **같은 집계칸 안에서 `orderNo` 기준 중복 제거** |

**부분 수정 금지**: `orderCount`만 주문 기준으로 고치고 `couponOrders`를 라인 기준으로 두면 **쿠폰 사용률이 100%를 초과**한다. 반드시 함께 고친다. 회귀 가드로 `T13`(모든 카테고리의 쿠폰 사용률 ≤ 100%)을 둔다.

## C-6. 기간 필터 계약 (B단계)

- `AnalyticsReview` / `AnalyticsInquiry` 타입에 **현재 `createdAt`이 없다**(`analyticsQueryEngine.ts:42-59`). B단계에서 `createdAt?: string`을 추가한다.
- **시작일·종료일 포함**(경계 포함).
- **기간을 지정하면 `createdAt`이 없는 자료는 제외**한다. 기간 미지정 시에는 전체를 포함한다.

## C-7. share 계약 (C단계)

`share` 연산은 분모뿐 아니라 **정렬 기준·본문 값·단위까지 `plan.metric`을 따른다.**

| metric | 분모 | 본문 값 | 단위 |
|---|---|---|---|
| `revenue` | 매출 합 | 매출액 | 원 |
| `quantity` | 수량 합 | 수량 | 개 |

현재는 `commerceDataQueryEngine.ts:394`가 항상 `r.acc.rev`를 써서 **계산·정렬·표시가 전부 매출 기준**이다.
