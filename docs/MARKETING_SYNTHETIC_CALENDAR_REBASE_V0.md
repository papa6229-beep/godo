# Marketing Synthetic Calendar Rebase v0 (2026-06-29)

> **종류**: synthetic data 기간 정렬(1단계 안정화). 실제 고도몰 WRITE/API 호출 없음, localStorage 변경 없음, UI 변경 없음, 분석 엔진 로직 변경 없음(데이터 기간만 이동). deterministic seed 유지(Math.random 미사용), PII 추가 없음.
> **한 줄**: synthetic commerce 2년 데이터를 rolling(7월 시작, nowMs 기준)에서 **고정 달력 `2024-01-01 ~ 2025-12-31`**(baseline=2024, promotion=2025)로 재정렬해 연도/월별/상하반기 분석 기준을 명확히 한다.
> **산출물**: `api/_shared/syntheticCommerceUniverse.ts`(날짜 생성 rebase + `SYNTHETIC_CALENDAR` export) + 본 문서 + `scripts/smoke-marketing-synthetic-calendar-rebase-v0.mjs`(31/31) + 기간 의존 기존 smoke 5종 날짜 리터럴 정렬.

---

## 1. 작업 목적 / 기존 7월 시작 구조의 문제

기존 생성기는 `end = options.endDate ?? now`를 기준으로 promotion = 최근 12개월, baseline = 그 직전 12개월을 `windowDays = months*30` 역산으로 배치했다. 그래서:
- baseline/promotion이 7월 등 임의 월에서 시작하는 rolling 구조(예: 2024-07 ~ 2026-06).
- "2025년 1월~12월 월별 매출", 연도 비교, 상/하반기 분석에서 기준이 흐려짐.
- 360일(=12*30) 윈도가 실제 365일 달력과 어긋나 연도 경계가 깔끔히 나뉘지 않음.

## 2. 새 기간

```
전체 synthetic 기간: 2024-01-01 ~ 2025-12-31
baseline year:       2024-01-01 ~ 2024-12-31   (syntheticYearLabel='baseline',   syntheticScenario='baseline_no_promotion')
promotion year:      2025-01-01 ~ 2025-12-31   (syntheticYearLabel='promotion', syntheticScenario='promotion_year')
```

`SYNTHETIC_CALENDAR = { startDate:'2024-01-01', endDate:'2025-12-31', baselineYear:2024, promotionYear:2025 }` 상수로 export. **이 metadata는 테스트·분석 구분용이며 고도몰 API 실제 필드가 아님.**

## 3. 구현

- 주문 날짜를 `end`에서 역산하지 않고 **연도 시작일에서 day-of-year 분산**으로 배치:
  - promotion: `addDays(2025-01-01, floor(pow(rng,1.2)*364))` → 2025-01-01 ~ 2025-12-31.
  - baseline: `addDays(2024-01-01, floor(pow(rng,1.2)*365))` → 2024-01-01 ~ 2024-12-31(윤년).
  - rng 호출 패턴/개수는 기존과 동일 → deterministic 유지(anchor·배수만 변경).
- clamp 기준 `end = 2025-12-31 23:59:59` → 12월 말 주문의 파생일(결제/배송/확정)이 2026으로 새지 않도록 잘라냄.
- `options.endDate`는 무시(고정 달력 우선) — smoke가 `endDate:'2026-06-26'`를 넘겨도 데이터는 2024/2025.
- 단일년 모드(`includeBaselineYear` false)는 promotion(2025)만 생성 → latestDataYear=2025 유지.

## 4. coupon policy

- **2024 baseline**: 쿠폰/프로모션 없음 — `discountSummary.hasCoupon=false`, `totalCouponDiscountAmount=0`, 라인 쿠폰/상품할인=0, coupon usage rate=0. (마일리지/예치금 같은 기본 리워드는 기존 설계대로 낮은 비율 허용.)
- **2025 promotion**: 기존 쿠폰/할인/마일리지/회원그룹 enrichment 유지 — `hasCoupon=true` 주문 존재, `couponDiscountAmount>0` 주문 존재.

## 5. firstPurchase 재계산 정책

기존 전역 재계산 로직 유지: 같은 `memberKey`의 **가장 이른 결제완료·미취소 주문 1건만** `isFirstPurchase=true`. 2년치 합산 기준이므로 2024에 결제 구매한 고객이 2025에 다시 구매하면 2025 주문은 재구매. (2024 주문이 모두 취소/미결제면 첫 결제는 2025일 수 있음 — 결제 기준이라 정상.) `memberKey` 등 식별자는 분석 artifact/메모리/응답에 노출하지 않음(내부 계산용).

## 6. 주문/리뷰/문의/클레임 정합성

- review.createdAt = 주문일+12일(clamp), inquiry.createdAt = 주문일+2일(clamp) → 모두 2024-01-01 ~ 2025-12-31 안.
- 주문 파생일(결제/배송/취소/완료)도 clamp로 ≤ 2025-12-31.
- orderNo/goodsNo 연결 유지(orderSeq 6자리 → orderNo 고유).

## 7. relative year 해석 정책

실제 현재 날짜(2026)로 "작년/올해"를 해석하면 synthetic data(2024/2025)와 어긋난다. v0 정책:
- **명시 연도 질문 우선 지원**("2024년", "2025년", "2024년과 2025년 비교").
- 상대 연도 표현은 **데이터 최신연도 기준**: `latestDataYear=2025`, `previousDataYear=2024` → 올해=2025, 작년=2024, 전년 대비=2024 vs 2025.
- planner는 현재연도를 하드코딩하지 않음. "작년 대비"는 명시 연도가 없을 때 `year_over_year`로 인식되어 baseline(2024)/promotion(2025) **scenario 축**으로 매핑되므로 새 달력과 정합. (별도 파서 변경 없음.)
- **실제 고도몰 live data 전환 시에는 실제 data max date 기준으로 동작**하도록 설계(이번 rebase는 synthetic 한정).

## 8. 검증 fixture(기간 정합성만)

신규 smoke는 깊은 narrative 품질이 아니라 기간 정합성만 본다: 2024/2025 월별 질문 handled, 2024/2025 비교 chartSpec에 양년 series 존재 + 2026 미참조, 2025 상/하반기·쿠폰 월별 handled, baseline coupon=0 / promotion coupon>0, 12개월 bucket, firstPurchase 재계산, reviews/inquiries 기간, PII false.

## 9. 분석 안정화 다음 단계

이번은 데이터 정렬 1단계. 다음 단계에서 그래프/narrative 복구·상하반기 프리셋·relative year UI 안내·실데이터 max-date 기반 동작을 진행.

## 10. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-synthetic-calendar-rebase-v0` ✅ **31/31**
* 회귀(기간 리터럴 정렬 후 전부 green): baseline-year 29 · insight-ux 42 · llm-planner-adapter 31 · intelligence-planner 32 · dynamic-smart-chart-render 30 · chat-chartspec-runtime-connection 32 · chat-driven-chartspec-bridge 37 · temporal-crosstab 30 · focused-insight-layout-v01 27 · analysis-dashboard-v0 30 · facts-core 34 · team-chat-facts 32.
* (회귀 smoke 5종은 2026/now-relative 날짜 리터럴을 2024/2025 고정 달력으로 정렬 — 데이터 rebase에 따른 필연적 갱신.)

## 11. 실제 WRITE / PII

synthetic 생성기 날짜 로직만 변경. route/네트워크/localStorage/UI 변경 없음, 고도몰 WRITE 없음, Math.random 없음. fake PII(contacts)는 기존대로 CS 경로 전용, 분석 orders는 memberKey/aggregate만(이름·전화·이메일·주소 미포함).

## 12. 다음 작업 후보

1. **상/하반기·분기 프리셋** — 2024/2025 H1/H2/Q 분석 단축.
2. **relative year UI 안내** — "올해=2025(데이터 최신연도)" 배지.
3. **live data max-date 기반 기간** — 실데이터 전환 시 자동 anchor.
4. **분석/그래프/narrative 복구 2단계** — rebase된 달력 위에서 비교 품질 재점검.
