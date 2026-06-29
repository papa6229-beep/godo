# Marketing Insight UX + Analysis Memory v0 (2026-06-29)

> **종류**: 차트 UX 개선 + AI 리포트 강화 + 비PII 분석 메모리. 실제 고도몰 WRITE/API 호출 없음, 신규 synthetic 데이터 없음, LLM 숫자 생성 없음.
> **한 줄**: 마케팅팀을 "수치 낭독"에서 "관계·차이·패턴을 그래프와 근거로 설명하는 분석팀"으로 끌어올린다 — 비교형 차트 자동 선택, 시리즈 색/tooltip, proxy 차트 능동 표시, 차이/최대격차/패턴 리포트, 분석 요청을 비PII로 누적.
> **산출물**: `marketingIntelligencePlanner.ts`(차트추천·비교인사이트) · `MarketingAnalysisDashboard.tsx/.css`(시리즈 스타일·tooltip·proxy 배지·메모리 마커) · `marketingAnalysisMemory.ts`(신규) · `DepartmentWorkspacePanel.tsx`(메모리 연결) + 본 문서 + `scripts/smoke-marketing-insight-ux-analysis-memory-v0.mjs`(42/42).

---

## 1. 작업 목적 / 실제 화면 검수에서 확인된 문제

1. 연도 비교 그래프 2025/2026 색 구분 약함 2. 월별 매출 비교가 line만 → 비교력 약함 3. hover tooltip 없음 4. AI 리포트가 수치 낭독 수준 5. partial_with_proxy인데 proxy 차트가 locked처럼 보임 6. 분석 요청 누적 로그/메모리 없음.

## 2. 차트 UX 개선

### 시리즈 색/스타일 구분
`getMarketingSeriesVisualStyle(seriesKey, index, label)` — 결정적(Math.random/inline color 금지). 연도(2025/2026)는 짝/홀(`mkt-s-year-even/odd`)로, 쿠폰/첫재구매/시나리오/리워드는 의미 색(`mkt-s-coupon/noncoupon/first/repeat/baseline/promotion/...`)으로 구분. 막대 fill·범례 dot·line stroke(미사용군은 dash)·line dot fill 모두 같은 색으로 연결.

### hover tooltip
`buildMarketingTooltipPayload({chartSpec, bucketKey?, seriesKey?})` → `{title, rows[label/value], delta?}`. groupedBar(막대)·line(point circle)·rankedBar(행) 모두 `onMouseEnter/onMouseLeave`(+`onFocus/onBlur` 접근성)로 hover state 관리, `ChartTooltip` 읽기 영역에 bucket·series·값·주문수·**다른 시리즈 대비 delta(±값, ±%)** 표시.

### 연도별 월별 비교 groupedBar 우선
`recommendMarketingChartForPlan` 재정렬: 비교형(comparison ≠ none)을 trend→line 규칙보다 **먼저** 판정. `year_over_year + timeBucket month + periods≥2` → groupedBar, reason "월별 연도 비교는 각 월의 차이를 나란히 보는 것이 중요하므로 groupedBar가 적합합니다". (※ "월별"이 detectGoal에서 trend로 잡혀도 비교가 우선이라 groupedBar.) "추이/흐름"만 강조한 비교 아닌 질문은 line 유지.

### partial_with_proxy proxy 차트
**버그 수정**: 전환율처럼 정확지표 불가 plan은 parse 시 chartRecommendation이 `unsupported`로 잡히는데, proxyPlan이 spread로 이를 **상속**해 locked로 보였다. validate에서 `out.proxyPlan.chartRecommendation = recommendMarketingChartForPlan(out.proxyPlan)`로 **재산출**(proxy는 계산 가능한 지표만 가짐) → 중앙에 proxy 차트(available true)를 표시. 대시보드는 `cs.available && requiredData`면 `marketing-chart-proxy-badge`로 필요 데이터를 작게 안내.

### unsupported 처리 정책
`renderMarketingChartSpecGraph`는 `!chartSpec.available || chartType==='unsupported'`일 때만 UnsupportedChart(locked). proxy가 있으면 available true → 차트 렌더. 즉 **proxy 가능하면 locked만 보여주지 않음.**

## 3. AI 분석 리포트 강화

`buildMarketingComparisonInsights({chartSpec, plan})` → `{totalComparison, largestGap, strongestPeriod, weakestPeriod, trendNote, evidence, warnings}`. 계산: 시리즈 총합 비교(상위 2), 같은 버킷 최대 차이 구간, 우세 버킷 수, 최고/최저 구간, 표본 적은(≤5건) 구간 경고. narrative에 8섹션(`MarketingInsightNarrativeSections`: headline/comparisonSummary/largestGaps/patternNotes/possibleExplanations/evidence/requiredData/nextQuestions/causalCautions)을 추가하고 bullets에 차이/최대격차/패턴을 반영 → **단순 낭독 제거**. 가능한 해석은 "추가 데이터 필요" 수준의 관찰로만.

### 인과관계 단정 금지
"때문에/덕분에/원인입니다" 부재(smoke 검증). causalCautions 상시("관찰값이며 인과관계를 단정하지 않습니다").

## 4. 분석 메모리 (`marketingAnalysisMemory.ts`)

### 저장 key / 항목
- key: `godo.marketing.analysisMemory.v0` (단일). 최대 `100`건, 초과 시 오래된 것부터 제거. JSON parse 실패 시 빈 배열, 저장 실패 시 무시(앱 중단 금지).
- 항목: `originalQuestionMasked`(마스킹), `normalizedQuestion`, `resultType`, `plannerSource`, `planSummary`(goal/metrics/dimensions/segments/filters/comparison/timeBucket/chartType — 전부 enum), `chartSummary`(chartType/seriesCount/bucketCount/primaryMetric), `requiredData`, `createdAt`.

### PII masking / raw 저장 금지
`maskMarketingMemoryText` — 전화/이메일/주민/syn_member_/긴 숫자 마스킹. **raw order/customer/orderNo/memberKey/이름/전화/이메일/주소 저장 안 함**(집계·계획 enum만). smoke로 entry JSON에 금지 키 부재 검증.

### 유사 질문 검색
`findSimilarMarketingAnalysisMemories({question, plan?, limit})` — `metricOverlap*3 + dimensionOverlap*2 + segmentOverlap*2 + comparisonMatch*2 + tokenOverlap` 점수. "학습"이 아니라 **최근 분석 패턴 힌트**. capability validation이 항상 우선.

### runtime 연결 / 메모리 활용
패널 마케팅 분기에서 planner/fixed가 handled되면 `try{ findSimilar → setHintCount → save }catch{}`로 저장(안전). 활용은 v0에서 보수적: dev marker + 작은 안내(`🧠 유사 분석 힌트 N건 참고`). 관리/검색/히스토리 UI는 후속.

### UI / dev marker
AI 리포트 하단 `marketing-analysis-memory-hint` + `data-marketing-analysis-memory-count` / `data-marketing-analysis-memory-used`.

## 5. localStorage 사용 범위 / 실제 WRITE 없음

신규 localStorage는 분석 메모리 1 key만(대시보드/패널에 신규 `setItem` 없음). 고도몰 WRITE/API route 추가 없음, fetch 없음, Math.random 없음. 기존 계산 엔진(crosstab/facts) 미변경.

## 6. 검증 질문 결과

| 질문 | 결과 |
|---|---|
| 2025/2026 1~6월 월별 매출 그래프 | groupedBar 우선, 2025/2026 색 구분, tooltip, 총합/최대격차 리포트 |
| 2026년 신규 가입회원 구매전환율 | partial_with_proxy, proxy 차트 available(미locked) + requiredData 배지 |
| 쿠폰기간 신규회원 반응 | 쿠폰/세그먼트 분해 분석 |
| 카테고리 쿠폰/매출비중 관계 | 관계 분석 |
| VIP 재구매 vs 일반 객단가 | memberGroup groupedBar 비교 |
| 문의 많은 상품 매출 관계 | relationship summary |
| ROAS | required_data, available false(fake 0 금지) |

## 7. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-insight-ux-analysis-memory-v0` ✅ **42/42**
* 회귀: llm-planner-adapter 31 · intelligence-planner 32 · dynamic-smart-chart-render 30 · chat-chartspec-runtime-connection 32 · chat-driven-chartspec-bridge 37 · temporal-crosstab 30 · baseline-year 29 · focused-insight-layout-v01 27 · analysis-dashboard-v0 34 · facts-core 32 · team-chat-facts (green).

## 8. 다음 작업 후보

1. **메모리 관리 UI** — 히스토리/검색/피드백(userFeedback) 패널.
2. **메모리 → planner 힌트 주입** — 이전 chartType/proxy를 recommend/LLM prompt에 반영(capability 우선 유지).
3. **scatter 차트** — 관계 분석 전용 시각화 + tooltip.
4. **tooltip 위치 고도화** — 커서 추적/모바일 long-press.
5. **Member READ Contract** — 가입일 연결 → proxy 졸업(정확 전환율).
