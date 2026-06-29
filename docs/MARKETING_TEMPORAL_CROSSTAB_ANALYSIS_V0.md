# Marketing Temporal Cross-Tab Analysis v0 (2026-06-29)

> **종류**: 분석 계산 엔진(facts service) — UI 변경 없음, 실제 WRITE 없음, 고도몰 API 호출 추가 없음, synthetic 데이터 추가 생성 없음, 외부(GA/광고) 데이터 생성 없음.
> **한 줄**: `timeBucket × dimension × metric` 범용 시간축 교차분석 엔진을 추가해, 이미 존재하는 주문·상품·매출 데이터를 조합한 임의 마케팅 비교(월별 쿠폰 객단가, 연도별 회원그룹 매출, baseline vs promotion 등)를 계산한다.
> **산출물**: `src/services/marketingTemporalCrosstab.ts` · 본 문서 · `scripts/smoke-marketing-temporal-crosstab-analysis-v0.mjs`(30/30). 기존 파일 미수정(완전 additive).

---

## 1. 작업 목적 / 왜 교차분석 엔진이 필요한가

마케팅 분석팀은 "필드 하나를 그대로 읽는 팀"이 아니라, **주문일 + 쿠폰 사용 여부 + 주문금액 → 월별 쿠폰 사용/미사용 객단가**처럼 데이터 조각을 조합해 비교를 만드는 팀이다. `buildMarketingAnalysisFacts`(대시보드 요약, 전체 기간 차원)만으로는 "월별 × 쿠폰 여부 × 객단가", "연도별 × 회원그룹 × 매출" 같은 임의 교차를 표현할 수 없다. 이 엔진은 그 조합 계산을 한 함수로 일반화한다(향후 채팅 chartSpec/중앙 그래프 동적 출력의 데이터 소스).

## 2. timeBucket × dimension × metric 구조

`buildMarketingTemporalCrosstab({ orders, products?, request })` → `MarketingCrossTabResult`(rows + totals + insights + evidence + requiredData + piiCheck). 한 요청이 **시간 버킷 × 분석 축(1~2개) × 지표**를 정의한다.

* 집계 granularity: order 기반 축(couponUsage/memberGroup/orderChannel/firstRepeat/rewardUsage/scenario)은 주문 단위(revenue=totalAmount), line 기반 축(product/category/brand)은 라인 단위(revenue=lineRevenue, 주문 단위 할인/리워드는 미합산 note).

## 3. 지원하는 timeBucket

`day · week · month · quarter · year · scenario`. `scenario`는 `syntheticYearLabel`(baseline/promotion)을 시간축으로 사용.

## 4. 지원하는 dimensions

`couponUsage(쿠폰 사용/미사용) · memberGroup(VIP/재구매/신규/휴면위험/일반) · orderChannel(자사몰/네이버페이/페이코) · firstRepeat(첫구매/재구매) · rewardUsage(리워드 사용/미사용) · product · category · brand · scenario(baseline/promotion)`. v0는 dimension 1~2개 조합 지원, **3개 이상은 unsupported**.

## 5. 지원하는 metrics

`revenue · orderCount · averageOrderValue · discountAmount · couponDiscountAmount · rewardUseAmount · quantity · revenueShare`. `revenueShare`는 결과 행 매출 합 대비 비중(%).

## 6. 계산 가능한 질문 예시 (v0 실제 계산)

* 월별 쿠폰 사용/미사용 객단가/주문수/매출 (`month × couponUsage`)
* 연도별/시나리오별 baseline vs promotion 매출·객단가·쿠폰 할인 (`scenario × scenario`)
* 연도별 회원그룹 매출·비중 (`year × memberGroup × revenueShare`)
* 월별 첫구매/재구매 매출 (`month × firstRepeat`)
* 월별 주문채널 매출/객단가 (`month × orderChannel`)
* 월별 리워드 사용/미사용 (`month × rewardUsage × rewardUseAmount`)
* 월별 카테고리/상품/브랜드 매출 TOP (`month × category`, line 기준)
* 2축: 월별 쿠폰 × 첫구매/재구매 (`month × [couponUsage, firstRepeat]`)

## 7. 계산하지 않는 질문 (unsupported / requiredData)

`isMarketingCrossTabRequestSupported`가 외부 데이터 키워드를 감지해 `available:false` + `requiredData`로 반환(0/추정 미생성):

| 요청 키워드 | requiredData |
|---|---|
| roas | adSpend, campaignAttribution |
| adCtr | adClicks, adImpressions |
| visitorConversion | visitorSessions |
| productViewConversion | productViewEvents |
| cartAbandonment | cartEvents |
| ga4 | ga4 |
| sns | snsMetrics |

> 분모 데이터/외부 광고·행동 데이터가 없으므로 계산하지 않는다. `rows: []`, `available: false`, `unavailableReason` + `requiredData`만 반환.

## 8. baseline / promotion year 활용

직전 작업의 2년치 데이터(`syntheticYearLabel`)를 사용:
* baseline 월/시나리오: 쿠폰 미사용만 존재(couponDiscountAmount=0) — smoke 검증.
* promotion 월/시나리오: 쿠폰 사용/미사용 모두, couponDiscountAmount>0.
* `timeBucket: 'scenario'` 또는 `dimension: 'scenario'`로 baseline vs promotion 직접 비교.
* 실측(seed 42): baseline 매출 28,650,795(쿠폰 0) vs promotion 31,911,718(쿠폰 할인 1,389,433).

## 9. 인사이트 생성 규칙 (deterministic, 인과 단정 금지)

규칙 기반(LLM 미사용): 최대 매출 구간 · 쿠폰 사용/미사용 객단가 비교(관찰) · baseline vs promotion 매출 차이 · 회원그룹 최대 비중 · 재구매 매출 비중 · 주문수 적은 구간(≤5건) 주의. 표현은 "더 높게 나타났습니다 / 해석 시 주문수 확인이 필요합니다" 같은 관찰형. **금지어 때문에/덕분에/원인입니다 부재**(smoke 검증).

## 10. PII self-check

금지 키 `name/customerName/phone/mobile/email/address/receiverName/receiverPhone/receiverAddress/memberKey`. `assertCrosstabNoPii`가 결과(rows/insights/evidence/totals)를 스캔 → `piiCheck.containsPii`. dimensionKey는 회원그룹 코드(G_VIP)·채널·카테고리 코드 등 집계 라벨만 사용, memberKey 미노출. (`piiCheck.checkedKeys`는 금지 키 목록 메타.)

## 11. 기존 facts와의 관계 (역할 분리)

* `buildMarketingAnalysisFacts`: 대시보드 요약/KPI/전체 기간 차원 — **이번 작업에서 미변경**(회귀 없음).
* `buildMarketingTemporalCrosstab`: 월별/연별/시나리오별 교차분석 — 향후 채팅 chartSpec/중앙 그래프 동적 출력의 계산 기반. 대시보드 UI는 변경하지 않음.

## 12. 실제 WRITE 없음

순수 함수 1개 파일 + 문서 + smoke만 추가. route/네트워크/localStorage/고도몰 WRITE 없음. Math.random 미사용. 기존 파일 0개 수정.

## 13. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-temporal-crosstab-analysis-v0` ✅ 30/30
* 회귀: `baseline-year` 29/29 · `dashboard-focused-insight-layout-v01` 27/27 · `dashboard-v0` 30/30 · `facts-core` 34/34 · `enrichment` 30/30 · `coverage-audit` 30/30 · `team-chat-facts` 32/32.

## 14. 다음 작업 후보

1. **채팅 chartSpec 연결** — 마케팅 채팅 요청(자연어) → MarketingCrossTabRequest 파싱 → 엔진 호출.
2. **중앙 그래프 동적 출력** — 대시보드/채팅에서 cross-tab 결과를 그래프로 렌더(이번 v0는 데이터만).
3. **2축 교차 UI** — 월 × 쿠폰 사용/미사용 교차표/히트맵.
4. **includeEmptyBuckets 확장** — 고정 도메인 외 dimension zero-fill.
5. **Member READ Contract** — 가입일/성별 → 가입 코호트 교차(requiredData 해제).
