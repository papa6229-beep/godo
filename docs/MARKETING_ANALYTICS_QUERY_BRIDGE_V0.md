# Marketing Analytics Query Bridge v0

> **작성일**: 2026-07-02 · 기준 HEAD `cefb89f` · 브랜치 `feature/marketing-analytics-query-bridge-v0`
> **성격**: Department Analytics Query Layer v0를 마케팅팀 채팅에 연결하는 bridge. 특정 질문 패치가 아님.

## 목적
마케팅 채팅 질문을 공통 `AnalyticsQuery`로 먼저 해석하고, 지원 조합만 bridge에서 처리(기존 broken compiler/scope 선점 우회). 나머지는 기존 마케팅 경로로 fallback(narrow intercept).

## 진입/흐름
`DepartmentWorkspacePanel.handleSend`(marketing) → **-1순위** `runMarketingAnalyticsQueryBridge` → handled 시 즉시 응답+chart / null이면 기존 0순위 scope engine → planner → chatWithTeam.

## 인터셉트 범위 (좁게)
- **Stage (a) 시간축 비교**: 다연도 + 월범위 + "월별"(`monthlyTrend`, startMonth/endMonth 보존). → 기존 `marketingAnalysisExecutor` 재사용(계산 이중화 없음).
- **Stage (b) product rank / category share**: 고신뢰만. → `productSalesAggregation`/`productCategoryDisplay`를 쓰는 **product executor(`executeAnalyticsQuery`)를 team override로 재사용** 후 `MarketingChartSpec`(rankedBar/donut)으로 변환.
- **unsupported**: ROAS/방문자/전환율/장바구니 → fake 없이 안내 + 내부 대체 분석 제안.
- 그 외(단일월 요약, 비월별 yearOverYear, 세그먼트 비교, 전체 12개월 월별)는 **null → 기존 경로**.

## 신규 파일
- `src/services/marketingAnalyticsQueryBridge.ts` — `runMarketingAnalyticsQueryBridge` + AnalyticsQueryResult→MarketingChatChartArtifact 변환기.
- `scripts/smoke-marketing-analytics-query-bridge-v0.mjs` — 34/0.
- `docs/MARKETING_ANALYTICS_QUERY_BRIDGE_V0.md`.

## 수정 파일
- `src/services/analyticsQueryToMarketingPlan.ts` — stub → 실제 adapter(다연도 월범위 월별 → monthlyTrend plan, 범위 보존; 그 외 null).
- `src/services/marketingAnalysisQueryCompiler.ts` — `MarketingComparison.monthlyTrend`에 `startMonth?/endMonth?` 추가.
- `src/services/marketingAnalysisExecutor.ts` — monthlyTrend가 startMonth/endMonth 순회(기본 1~12 → 기존 불변) + `buildMarketingAnalysisResponseFromPlan` 추출(계산 재사용).
- `src/services/analyticsQueryParser.ts` — unsupported에 전환율 패턴 추가.
- `src/components/DepartmentWorkspacePanel.tsx` — 마케팅 분기 scope 앞단에 bridge 배선.

## 버그 처리
- **Bug 1**(월별+1~5월이 12개월로 확장): bridge가 monthRange 보존 plan을 만들어 executor의 확장된 monthlyTrend(1~5월)로 실행 → 1~5월만. compiler 규칙 미변경.
- **Bug 2**(상품 랭킹이 총매출로 축소): bridge가 product rank를 먼저 인식 → product executor 재사용 → 기간 적용 상품 랭킹. 매출 1위 vs 수량 1위 다르면 병기, "상품 라인매출 기준" 명시.

## 검증
- lint ✅ · tsc -b ✅ · build ✅ · route 9 (≤12)
- 신규 bridge smoke **34/0**
- 회귀: mkt-compiler 30 · scope 32 · chart-grammar 23 · facts-core 34 · mkt-dashboard 30 · chartspec-runtime 32 · chartspec-bridge 37 · analytics-query-layer 40 · product catalog 14 / grounding 13 · source-of-truth 23 · parity 19 (전부 green)

## 수동 검수
1. "2024년과 2025년 1월부터 5월까지의 월별 매출을 그래프로 비교해줘" → 1~5월만, 6~12월 없음, 분석도 1~5월.
2. "2024년 7월 매출 중 가장 많이 판매된 상품이 뭐야?" → 상품명+매출+수량, 매출/수량 1위 병기, 외부데이터 안내 없음.
3. "2024년 7월 상품별 매출 순위 그래프로 보여줘" → 7월 기준 상품 rankedBar.
4. "2024년 3월부터 5월까지 카테고리별 매출 비중 보여줘" → 3~5월, 표시명, raw code 없음, 비중 막대.
5. "ROAS 비교해줘" → 계산 없이 unsupported + 대체 분석 제안.

## 불변식
- synthetic/canonical KPI/source-of-truth 불변. 상품 라인매출(gross)은 분석용(대표 KPI 승격 없음).
- 숫자는 코드 계산(기존 executor/product aggregation), LLM 미개입. narrow intercept로 기존 마케팅 smoke 보존.
- 도넛은 렌더러상 rankedBar fallback(실제 파이 렌더 고도화는 범위 밖). Vercel route ≤12. WRITE/RAG/Studio 미변경.

## 다음
- 마케팅 전체 질문의 AnalyticsQuery 이관 지속(비월별 비교/세그먼트도 점진 이관). 궁극적으로 compiler/scope를 AnalyticsQuery 계층 하위로 수렴.
