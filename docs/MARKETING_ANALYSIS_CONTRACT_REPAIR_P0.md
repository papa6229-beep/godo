# Marketing Analysis Contract Repair P0 (2026-06-29)

> **종류**: 분석 계약 복구(버그 수리). 새 기능/리팩터 아님. 실제 고도몰 WRITE/API 호출 없음, localStorage 변경 없음, synthetic data 재수정 없음, LLM prompt 변경 없음.
> **한 줄**: `Marketing Analysis Pipeline Diagnosis v0`에서 확인된 root cause를 수리해, 기본 질문에서 **숫자가 제 이름표를 달고 나오게** 한다 — 단일 기간 질문은 그 기간만 집계, inquiryCount/reviewCount 등이 매출로 둔갑하지 않게, product/category 분석 단위가 사라지지 않게.
> **산출물**: `src/services/marketingIntelligencePlanner.ts`(핵심) + 본 문서 + `scripts/smoke-marketing-analysis-contract-repair-p0.mjs`(21/21).

---

## 1. 진단에서 확인된 root cause

1. **단일 기간 질문에서 `plan.periods`가 execution 필터로 적용되지 않음** — `comparison==='year_over_year'`(periodCompare)일 때만 사용 → "2024년 월별 매출"이 2024+2025 24개월·전역 총합으로 오염.
2. **chartSpec builder가 단일 차원 × 단일 metric만 처리** + `getMarketingDimensionKey`를 **주문 객체**(goodsNo/categoryCode 없음)에 호출 → product/category 차원이 `unknown`으로 붕괴.
3. **`metricFromAcc` default가 `a.revenue`** → 미지원 metric(inquiryCount/reviewCount/averageRating/claimCount)이 **매출 총합으로 둔갑**("문의수 58,716,475건").
4. **product/category dimension 감지가 약함** — "상품의 매출"이 정규식에 안 잡혀 관계형 질문에서 분석 단위 소멸.
5. **smoke가 bucket count·dimension retention·metric binding을 검증하지 않음** — 구조/존재만 봐서 버그 통과.

## 2. P0 범위

고친 것: 기간 필터, metricFromAcc 둔갑 제거, inquiry/review metric 바인딩, product/category 감지, 계약 smoke. **하지 않은 것**(P1/P2로 이월): 관계형 chartSpec 1급(metric A/B 동시), groupedBar 세로화/combo/scatter, LLM prompt, synthetic 재수정, 메모리 UI.

## 3. period filter 수정 (P0-1)

- `isOrderWithinPlannedPeriods(order, periods)` export — periods 비면 전체, 1개면 그 기간, 여러 개면 union.
- `buildPlanChartSpec`의 `counted`에 **항상** 적용: `isCounted && passesPlanFilters && isOrderWithinPlannedPeriods`.
- `year_over_year`는 union으로 두 기간을 포함하고, series 분리는 기존 periodCompare 로직이 담당(2024 vs 2025).
- **결과:** "2024년 1~12월 월별 매출" → bucket 12개(2024-01~2024-12), 2025 미포함, 총합 2024 기준.

## 4. metricFromAcc fallback 제거 (P0-2)

- `default: return a.revenue` → **`default: return 0`**.
- 추가 case: `inquiryCount→a.inquiryCount`, `reviewCount→a.reviewCount`, `averageRating→ratingSum/reviewCount`, `claimCount→a.claimCount`.
- 미지원 metric은 0 + 호출부 warning. **revenue 둔갑 금지.**

## 5. inquiry/review/claim metric 바인딩 (P0-3)

- `Acc`에 `lineRevenue/inquiryCount/reviewCount/ratingSum/claimCount` 추가.
- **goods 모드**(dim ∈ {product, category, brand}): 주문 **라인(goodsNo)** 기반 집계 + products 인덱스로 category/brand 매핑. revenue=Σ lineRevenue, orderCount=라인 수, 쿠폰/리워드/첫재구매도 라인에 분배.
- reviews/inquiries를 **같은 goods key + 기간 내**로 merge(`createdAt` 기간 필터). 시간버킷 없으면 `all` 버킷, 있으면 createdAt으로 분해.
- **집계값만** artifact에 들어감 — raw review/inquiry row·customer·memberKey·PII 미포함.
- **claimCount**: 접근 경로 불명확 → v0에서는 **0 + warning**(필요: claimData). revenue 둔갑 안 함.
- goods가 아닌 축(시간/쿠폰/회원그룹 등)에서 문의/리뷰 metric 요청 시 0 + warning("상품·카테고리·브랜드 축에서만 집계").

## 6. product/category dimension 감지 보강 (P0-4)

- `detectDimensions`: category에 `품목군` 추가; product에 `상품의/상품이/상품에/상품 중/어떤 상품/특정 상품/상품 순위/상품` 등 폭넓은 패턴 추가.
- `choosePrimaryAnalysisDimension(plan)` export — **relationship/diagnose** goal에서 분석 단위를 우선순위 `product > category > brand > memberGroup > orderChannel > couponUsage > firstRepeat > rewardUsage`로 선택(조건 차원보다 분석 단위 우선). 그 외 goal은 기존 첫 번째 차원 유지.
- **결과:** "문의가 많은 상품…" → product 차원 유지, "카테고리별 쿠폰 사용률…" → couponUsage가 아니라 category가 분석 축.

## 7. smoke 강화 (P0-5)

`smoke-marketing-analysis-contract-repair-p0.mjs`(21 checks):
- **Q1**: handled/available, periods=2024 전체, timeBucket=month, **bucket count===12**, 2025 버킷 없음, 총합이 2024 기준(2년 전체로 오염 안 됨), narrative 2025 오염 없음.
- **Q4**: goal relationship/diagnose, dimensions에 product/category, metrics에 inquiryCount+revenue, **primaryMetric=inquiryCount**, 값이 revenue 총합과 다름·매출급 금액 아님·실제 문의수와 정합, 금지 문구("문의수 58,716,475건"·`문의수 \d{7,}건`) 부재, series가 상품 단위, relationship 언급, PII false.
- metricFromAcc 일반 둔갑 회귀(count/percent unit인데 value가 매출급이면 실패).

## 8. Q1 / Q4 검증 결과

| | Q1 (2024 월별 매출) | Q4 (문의 많은 상품 매출) |
|---|---|---|
| route | deterministic planner | deterministic planner |
| bucket/series | 12 buckets(2024-01~12), series "전체" | series=상품 6개, bucket "all" |
| primaryMetric 값 | revenue, 총합 27,589,595(2024만) | inquiryCount, 최대 **46건**(매출 아님) |
| narrative | 2024 총합, 2025 미오염 | "상품4: 문의수 46건", relationshipNotes(문의수↔매출 corr) |
| PII | false | false |

## 9. 실제 WRITE / PII

`marketingIntelligencePlanner.ts` 한 파일의 집계 로직만 수정. route/네트워크/localStorage/UI 변경 없음, 고도몰 WRITE/API 없음, Math.random 없음. 집계값만 사용(raw row/memberKey/이름·전화·이메일·주소 미포함).

## 10. 남은 P1/P2

**P1:** 관계형 chartSpec 1급 — category × couponUsageRate **vs** revenueShare, product × inquiryCount **vs** revenue를 metric A/B **동시 표현**(현재는 primaryMetric 1개 + relationshipSummary 분리). goods+시간버킷에서 문의/리뷰 분해, goods+scenario 지원.
**P2:** groupedBar 세로 막대화, combo chart, scatter chart, tooltip 위치/모바일 개선.

## 11. 다음 작업 후보
1. **P1 관계형 chartSpec 1급 지원**(metric A/B 동시 + scatter 데이터 shape).
2. goods 모드 couponDiscountAmount/리워드 정밀 집계(라인 레벨).
3. claimData 연결 → claimCount 실집계(requiredData 졸업).
