# Department Analytics Query Layer v0

> **작성일**: 2026-07-02 · 기준 HEAD `94db11c` · 브랜치 `feature/department-analytics-query-layer-v0`
> **성격**: 개별 버그 픽스가 아니라 부서 채팅이 자연어 질문을 **공통 AnalyticsQuery 스키마**로 이해하고 **대시보드와 같은 계산 경로**로 답하게 하는 기반. 첫 적용은 상품팀.

## 목적
- 팀 공통 Query Schema(`AnalyticsQuery`) + 공통 Executor 뼈대 도입.
- 상품팀 대시보드 집계(기간필터·상품순위·카테고리비중·추이)를 순수 서비스로 추출 → **대시보드=채팅 동일 계산**.
- 상품팀 채팅에서 기간+상품순위/카테고리비중을 공통 경로로 처리(버그 2·3의 상품팀 케이스 해소).
- 마케팅/CS는 확장 지점만 열어둠(이번엔 동작 불변).

## 신규 파일
- `src/services/analyticsQueryTypes.ts` — `AnalyticsQuery`/`AnalyticsQueryResult` 등 공통 스키마(팀/지표/차원/집계/비교/기간). marketing·cs·일부 dimension은 **reserved**.
- `src/services/analyticsQueryParser.ts` — `parseAnalyticsQuery(question, ctx)`. product 중심 파싱. **"월별"+"1~5월" 동시 보존**(마케팅 버그 1 원인 차단), **"특정월+상품순위"→rank**(총매출 축소 금지), 일범위/최근N개월/분기/반기/상대 파싱, unsupported(ROAS/방문/조회/장바구니).
- `src/services/analyticsQueryExecutor.ts` — `executeAnalyticsQuery(query, dataset)`. team=product의 product(rank)/category(share)/time(trend)/summarize 실행. **미지원 team/dimension/metric/다연도/범위밖→null(not handled)→기존 fallback**(wrong data 금지).
- `src/services/productSalesAggregation.ts` — 대시보드에서 추출한 순수 집계: `filterProductOrdersByPeriod`/`filterOrdersByCategory`/`filterOrdersBySource`/`aggregateProductRanking`/`aggregateProductCategoryShare`/`buildProductSalesTrend`. **상품 라인매출(gross line revenue) 기준 유지 · 대표 KPI 아님.**
- `src/services/analyticsQueryToMarketingPlan.ts` — 옵션 A adapter **stub**(TODO). 수렴 방향을 코드로 표식(영구 이중 파서 방지). v0는 항상 null(마케팅 미연결).
- `scripts/smoke-department-analytics-query-layer-v0.mjs` — 34 케이스.
- `docs/DEPARTMENT_ANALYTICS_QUERY_LAYER_V0.md` (본 문서).

## 수정 파일
- `src/components/ProductTeamDashboard.tsx` — 인라인 `aggregateProducts`/`srcFilter`/`ordersFiltered`/`relevantOrders`/`categoryData`를 추출 함수 호출로 대체(**계산식 동일 · 화면 값 불변**).
- `src/services/productTeamChatFacts.ts` — 상단에서 공통 parser 우선 시도: **고신뢰 rank/share + unsupported만 인터셉트**, 그 외는 기존 분기로. `factsFromAnalyticsResult` 변환기 추가(숫자는 executor, Claude는 문장화).
- `scripts/smoke-product-team-catalog-facts.mjs`, `scripts/smoke-product-team-chat-grounding.mjs` — 하니스에 `.js` 재작성 추가(productTeamChatFacts가 런타임 모듈을 import하게 됨). 상품순위 1건은 신규 intent(`analytics_product_rank`)로 갱신(의도된 이관).

## 인터셉트 범위(v0)
- **인터셉트**: `unsupported` / (고신뢰 & `rank`) / (고신뢰 & `share`).
- **미인터셉트(기존 분기 유지)**: 추이(trend)·범위/최근N개월·단일월 요약·총합·회원/세그먼트/현재화면 — 이미 정상 동작. executor는 trend도 지원하나(직접/미래용) 채팅 게이트에는 아직 미포함.

## 검증
- lint ✅ · `tsc -b` ✅ · build ✅ · route 9 (≤12) ✅
- 신규 smoke: **34/0**
- 기존 smoke: product-trend 10/0 · catalog-facts 14/0 · chat-grounding 13/0 · dept-chat-wiring 16/0 · facts-routing 12/0 · source-of-truth 23/0 · parity 19/0 · mkt-compiler 30/0 · scope 32/0 · facts-core 34/0 · chart-grammar 23/0 · mkt-dashboard 30/0 · chartspec-runtime 32/0

## 수동 검수(상품팀 채팅)
1. "2024년 7월 상품별 매출 순위" → 대시보드 7월 필터 순위와 동일 상위 상품/금액.
2. "2024년 7월 가장 많이 판매된 상품" → 총매출만이 아니라 상품 1위(상품명+매출/수량).
3. "2024년 3월부터 5월까지 카테고리별 매출 비중" → 3~5월만 반영.
4. "최근 3개월 상품별 매출 순위" → 최근 3개월 순위(기간 표기).
5. "상품별 매출 순위" (기간 미지정) → 전체 기간 순위.
6. (구조 확인) "2024년과 2025년 1월부터 5월까지 월별 매출 비교" → AnalyticsQuery에서 monthRange 1~5 보존(12개월 확장 아님). *마케팅 채팅 UI 답변은 다음 작업에서 연결.*

## 불변식(준수 확인)
- synthetic 생성/canonical KPI 계산 변경 없음. 대표 KPI = net 유효주문 유지. 상품 랭킹은 상품팀 전용 gross 라인매출(대표 KPI 승격 안 함).
- 숫자는 코드(executor) 계산, LLM은 문장화만. 없는 데이터(ROAS/방문/전환/장바구니)는 fake 없이 안내.
- 대시보드=채팅 동일 계산 함수(parity smoke로 증명). Vercel route ≤12. 고도몰 WRITE/Tool/RAG/Agent Studio 미변경. PII 노출 없음.

## 합의된 단계
- **이번 v0로 마케팅팀 채팅의 관찰 버그 1·2는 UI에 남는다**(의도된 단계). 공통 도로를 깔고 상품팀부터 태웠다.
- **다음 작업(Marketing Analytics Query Bridge v0)**: `analyticsQueryToMarketingPlan` 스텁을 구현해 마케팅 채팅을 AnalyticsQuery 계층으로 이관(월범위+월별 보존, product-rank 차원 신설). 그다음 CS(review/inquiry/customer dimension) 확장.
