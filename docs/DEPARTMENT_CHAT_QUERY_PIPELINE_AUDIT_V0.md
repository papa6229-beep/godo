# Department Chat Query Pipeline Audit v0

> **작성일**: 2026-07-02
> **성격**: 코드 수정 없음. 원인 분석·구조 진단 전용.
> **기준 HEAD**: `94db11c`
> **방법**: `DepartmentWorkspacePanel.handleSend` → 마케팅/상품/CS 각 경로를 실제 파일·함수·라인으로 추적. 관찰된 3개 버그를 재현 경로로 확증.

---

## 1. 현재 부서 채팅 처리 흐름 요약

진입점은 `src/components/DepartmentWorkspacePanel.tsx`의 `handleSend`(237–347). `selectedTeamId`에 따라 **팀마다 완전히 다른 코드 경로**로 분기한다. 공통 스키마·공통 실행기가 없다.

```
handleSend(text)
├─ teamId === 'product'     → buildProductTeamChatFacts(text, revenue, catalog)   [문자열 매칭 intent]
│                              → 실패 시 buildDepartmentChatContext('product') / 요약 fallback
│                              → 최종 chatWithTeam('product', text, opts)  ← Claude가 facts로 서술
│
├─ teamId === 'marketing'   → (rev.orders 있으면) 0순위 buildMarketingScopeInsightResponse
│                                 └ 내부 앞단 buildMarketingAnalysisResponse (Query Compiler→Executor)
│                              → 1순위 buildMarketingIntelligenceResponseWithLlm (planner, LLM은 계획만)
│                              → 1b runMarketingChartRequest (fixed-intent chartSpec)
│                              → 각 단계 handled 시 즉시 return (Claude 미호출)
│                              → 2순위 buildMarketingChatContext → chatWithTeam ← 여기서만 Claude 서술
│
└─ teamId === 'cs' | 'hq'   → (CS 초안 요청이면) runCsDraftRequest [deterministic, Claude 없음]
                               → buildDepartmentChatContext(team, bundle, csDetail)
                               → 최종 chatWithTeam(teamId, text, opts)  ← Claude가 facts로 서술
```

**핵심 공통 원칙(코드로 확인)**: 숫자는 항상 deterministic 코드가 계산하고, Claude는 (호출될 때) 계산된 facts를 문장으로 옮기기만 한다. 마케팅 0/1순위에서 `handled=true`면 **Claude는 아예 호출되지 않는다** → 관찰된 마케팅 버그 1·2는 100% deterministic 라우팅 결함이며 LLM 문제가 아니다.

---

## 2. 팀별 채팅 파이프라인 차이

### 2-1. 상품팀 (`productTeamChatFacts.ts`)
- **구조**: 단일 함수 `buildProductTeamChatFacts`가 `norm(userText)` 문자열 포함 검사로 intent를 **순차 if 분기**(먼저 매칭되는 것이 승리).
- intent 순서: `data_limit`(회원/세그먼트) → `current_screen` → **`monthly_range`**(YYYY년M월~YYYY년M월/최근N개월) → **`특정 월`**(`/(\d{1,2})\s*월/`) → `monthly_trend`(월별/추이) → `catalog_taxonomy` → `category_share`(카테고리/비중) → **`top_products`**(순위/랭킹/상위/top/베스트) → `stock_risk` → `total_revenue` → `general`.
- **집계 함수의 기간 인식 차이**:
  - 기간 인식 O: `aggregateMonthly`(월별), `deriveMonthlyRangeLines`(범위), `parseRequestedMonthRange`(두 개의 연-월 또는 "최근 N개월"만).
  - **기간 인식 X**: `aggregateTopProducts`(153–165), `aggregateCategory`(118–128) — **항상 `revenue.orders` 전체를 집계**. 월/기간 파라미터 자체가 없음.
- Claude는 facts를 받아 서술만.

### 2-2. CS팀 (`csDraftRuntime.ts` + `departmentChatFacts.ts` + `csTeamDashboardFacts.ts`)
- **구조**: "답변 초안" 요청은 `runCsDraftRequest`가 deterministic 처리(Claude 없음, 종결형 초안). 그 외는 `buildDepartmentChatContext('cs', bundle, csDetail)`로 safe 문의/리뷰/주문 대조 facts를 만들어 `chatWithTeam` → Claude 서술.
- intent 감지는 `detectCsDraftRequestIntent`(초안/대상/랭크/토픽 힌트)로 CS 초안 전용. 일반 통계 질의용 query schema는 없음.
- 계산은 `csTeamDashboardFacts`(우선순위 점수·위험도 등)로, 기간 필터는 `csDashboardTimeFilter`가 담당하지만 **채팅 경로에서는 시간 필터가 연결돼 있지 않다**(대시보드 팝업 전용).

### 2-3. 마케팅팀 (`marketingScopeInsightEngine.ts` + Compiler/Executor + Planner)
- **구조**: 0순위 scope engine이 내부에서 먼저 **Query Compiler(`compileMarketingAnalysisQuery`)→Executor(`executeMarketingAnalysisPlan`)**를 시도(`buildMarketingAnalysisResponse`). 컴파일러가 처리 못 하면(`null`) scope engine의 broad 경로(`interpretMarketingQuestion`+`buildInsightPack`+`buildPrimaryChart`)로 위임.
- 유일하게 **공통 계획 스키마(`MarketingAnalysisPlan`)를 가진 팀**. 단, 이 스키마는 마케팅에만 존재하고 상품/CS에는 없다.
- **차원(dimension) 한계**: 컴파일러의 `dimension`은 `'time' | coupon | firstRepeat | memberGroup | channel`뿐. **`product`(상품 랭킹) 차원이 없다.** rank intent는 타입에만 있고 컴파일러가 생성하지 않는다.

---

## 3. 관찰된 문제의 실제 원인 (재현 경로 확증)

### 버그 1 — "2024년과 2025년 1월부터 5월까지의 월별 매출을 그래프로 비교" → 1~12월 전체·전체 연도

두 개의 결함이 **중첩**되어 발생:

**결함 1-A (Compiler): "월별"이 월 범위를 삼킨다.**
`parsePeriodDescriptor`(compiler:96–117)는 `월별`을 **line 104에서** `{type:'monthlyTrend'}`로 반환 — 월 범위 정규식(line 106)보다 **먼저** 검사. 따라서 "1월부터 5월까지"가 파싱되기 전에 버려진다.
그 뒤 규칙 흐름:
- rule 3 yearOverYear(174): `desc.type !== 'monthlyTrend'` 조건에 걸려 **skip**.
- rule 4 monthlyTrend(186): `metric !== 'revenue'` 조건 — 지금 metric은 `revenue`라 **skip**(설계상 revenue 월별/연도 비교는 broad에 위임).
- rule 7(210): `{intent:'summarize', confidence:'low', answerScope:'broad'}`.
→ Executor `buildMarketingAnalysisResponse`가 `confidence==='low'`이므로 **`null` 반환**(executor:190).

**결함 1-B (Scope broad): 다연도 분기가 월 범위를 무시한다.**
scope engine이 broad로 위임 → `interpretMarketingQuestion`:
- 월 범위는 line 144–146에서 `mStart='01', mEnd='05'`로 **정상 파싱된다.**
- 그러나 `years.length >= 2` 분기(line 152–155)는 `dateRange = {2024-01-01 ~ 2025-12-31}`로 **하드코딩** — mStart/mEnd를 쓰지 않는다. (월 범위를 쓰는 건 `years.length === 1` 분기(149–151)뿐.)
- `focus='year_compare'`, 그리고 `buildPrimaryChart` year_compare 분기(412–427)는 **항상 `months = 1..12`** 12개월을 생성하고 연도만 필터.
→ 결과: 두 해 전체 12개월 그래프.

> **역설**: "월별"을 빼고 "2024년과 2025년 1~5월 매출 비교"라고만 하면 rule 3(yearOverYear, period=monthRange 1–5)로 잡혀 **정상 동작**한다. 사용자가 원한 "월별(월 단위 막대)"이라는 표현이 오히려 파이프라인을 broad로 밀어낸다.

### 버그 2 — "2024년 7월 매출 중 가장 많이 판매된 상품이 뭐야?" → 7월 총매출만 / 외부데이터 없음

- Compiler: `detectMetric`은 "가장 많이 판매된"을 metric으로 인식 못 함(`판매량/수량`만 quantity) → `revenue`. desc = `{singleMonth: 7}`. segment 없음.
- **`상품 랭킹` / topN / product 차원을 파싱하는 규칙이 컴파일러에 아예 없다.** → rule 5(195, 단일연도+단일월)로 잡혀 `{intent:'summarize', period: singleMonth(2024,7)}`, `confidence:'high'`.
- Executor `plan.period` 분기(160–168) → `aggregateRange(2024,7,7)` → **7월 총매출 1행**. `handled=true` → scope engine 즉시 return.
- scope engine의 broad 경로에는 `focus='product'` + `productBreakdown` **상품 랭킹이 존재하지만**, 컴파일러가 high-confidence로 먼저 가로채 broad에 **도달하지 못한다.**
- "외부 데이터 없음" 문구: broad로 갔을 경우 scope narrative가 `CAUSAL_CAUTION`("원인 판단에는 방문자·광고비·노출수 등 외부 데이터가 필요합니다")을 **모든 답변에 무조건 append**(engine:491,570). 내부로 답 가능한 질문에도 붙는다.

### 버그 3 — 상품팀 채팅 "7월 상품별 순위" → 순위 없음 / 엉뚱

- `buildProductTeamChatFacts`에서 **"특정 월" 분기(254–294)가 "상품별 순위" 분기(338–347)보다 먼저** 실행. `monthMatch = /(\d{1,2})\s*월/`이 "7월"에 걸려 `monthly_revenue`(7월 총매출)로 종료 → 순위 분기 도달 못 함.
- 설령 순위 분기에 도달해도 `aggregateTopProducts(revenue)`(153–165)는 **월 필터가 없어 전체 기간 순위**를 낸다. 카테고리도 동일(`aggregateCategory`, 118–128, 기간 무시).
- `parseRequestedMonthRange`(79–97)는 **두 개의 연-월** 또는 "최근 N개월"만 파싱. "2024년 7월 1일~7월 31일"(일 단위/단일월)은 매칭 실패 → 범위 인식 안 됨.

---

## 4. 대시보드 vs 채팅 계산 경로 (질문 5·6 답)

**결론: 완전히 별개 경로. 공통 함수를 쓰지 않는다.**

| | 상품팀 대시보드 (`ProductTeamDashboard.tsx`) | 상품팀 채팅 (`productTeamChatFacts.ts`) |
|---|---|---|
| 기간 필터 | `ordersFiltered`(effStart~effEnd + source, 543–552) — 단일 필터셋 공유 | 없음(전체 `revenue.orders`) |
| 상품 순위 | `ranking = aggregateProducts(relevantOrders, category)`(632–637) — **기간 필터됨** | `aggregateTopProducts(revenue.orders)` — **전체 기간** |
| 카테고리 | `categoryData`(ordersFiltered, 618–630) — 기간 필터됨 | `aggregateCategory(revenue.orders)` — 전체 기간 |
| 추이 | `buildTrendBuckets(relevantOrders, {start,end,granularity,category})`(613) | `aggregateMonthly`(월 skeleton 없음) |
| 기간 상태 | 컴포넌트 내부 state(timeMode/rangeStart/rangeEnd/category) | 접근 불가(채팅 facts가 명시적으로 "대시보드 필터 못 읽음"이라 안내) |

→ **질문 5**: 아니다. 대시보드는 `ordersFiltered` 기반의 날짜 인식 집계(`aggregateProducts`, `categoryData`, `buildTrendBuckets`)를 쓰고, 채팅은 날짜 인식이 없는 별도 함수(`aggregateTopProducts`, `aggregateCategory`)를 쓴다.
→ **질문 6**: 없다. 대시보드 차트 데이터/상태를 채팅이 재사용할 구조가 없다. (`DepartmentWorkspacePanel`이 대시보드와 채팅을 나란히 렌더하지만 상태를 공유하지 않음. 게다가 `MainLayout`은 이 패널을 prop 없이 렌더.)

---

## 5. 나머지 진단 질문 답

- **Q1 처리 순서**: §1 참조. 팀별 분기 → 마케팅만 0/1/1b/2 사다리, 상품/CS/HQ는 facts→chatWithTeam.
- **Q2 누가 먼저 가로채나(마케팅)**: 0순위 `buildMarketingScopeInsightResponse` → 그 내부 앞단 `buildMarketingAnalysisResponse`(Query Compiler+Executor)가 최우선. 컴파일러가 handled면 여기서 끝. 아니면 scope broad. 그 다음 LLM planner, 마지막에만 `chatWithTeam`.
- **Q3 월 범위가 12개월로 확장되는 지점**: (a) 컴파일러 `parsePeriodDescriptor` line 104(월별이 범위를 선점) → broad 위임, (b) scope `interpretMarketingQuestion` line 152–155(다연도 분기가 범위 무시), (c) `buildPrimaryChart` line 421(항상 12개월 생성), (d) executor `monthlyTrend` 분기(135–140)도 항상 12개월(단 여기는 revenue에서 안 탐).
- **Q4 상품 랭킹/topN/sort desc 파싱 구조**: 마케팅 컴파일러에는 **없음**(product 차원·rank intent 미생성). scope broad에는 `focus='product'`+productBreakdown 랭킹이 **있으나** 컴파일러가 선점해 도달 못 함. 상품팀 채팅에는 `top_products` 분기가 있으나 **기간 필터 없음 + "특정 월" 분기에 선점됨.**
- **Q7 "외부 데이터 없음" 조건**: (1) 컴파일러 UNSUPPORTED(ROAS/방문/조회전환/장바구니)만 정당. (2) scope narrative `CAUSAL_CAUTION`을 **모든 broad 답변에 무조건 append** → 내부로 답 가능한 질문에도 과도하게 붙음.
- **Q8 Claude vs deterministic**: 숫자는 항상 deterministic. Claude 호출 지점 = (마케팅) 2순위 `chatWithTeam`뿐 / (상품·CS·HQ) facts 생성 후 `chatWithTeam`에서 항상 서술. 마케팅 버그 1·2는 0순위 deterministic에서 종료돼 **Claude가 개입조차 안 함.**
- **Q9 공통 query intent schema**: 없음. 마케팅만 `MarketingAnalysisPlan`. 상품/CS는 문자열 매칭 if-분기. → **팀 공통 스키마 부재가 근본 구조 문제.**

---

## 6. 가장 유력한 원인 1~3순위

1. **[구조] 팀 공통 Query Intent Schema + 공통 Executor 부재.** 마케팅만 Plan/Executor가 있고, 상품/CS는 문자열 if-분기. 대시보드와 채팅이 서로 다른 집계 함수를 씀 → 같은 질문이 화면과 채팅에서 다른 답. (버그 3의 근본, 버그 2의 절반)
2. **[파싱] 기간·차원 파싱의 우선순위/커버리지 결함.**
   - "월별"이 월 범위를 선점(compiler:104) → 버그 1-A.
   - 다연도 분기가 월 범위 무시(scope:152) + 차트 항상 12개월(scope:421) → 버그 1-B.
   - product/topN 차원 미파싱(compiler) → 버그 2.
   - "특정 월"이 "상품 순위"를 선점 + 순위 집계에 기간 필터 없음(productFacts:255,153) → 버그 3.
3. **[UX 정확성] broad 폴백의 과잉 안내.** 내부로 답 가능한 질문에도 `CAUSAL_CAUTION`/requiredData가 무조건 붙어 "데이터 없음"처럼 보임(scope:491,570). → 버그 2의 체감 악화.

---

## 7. 수정 우선순위

**P0 — 대시보드=채팅 계산경로 단일화(상품팀 우선).**
`ProductTeamDashboard`의 날짜 인식 집계(`ordersFiltered` → `aggregateProducts`/`categoryData`/`buildTrendBuckets`)를 **순수 서비스 함수로 추출**해 채팅 facts도 동일 함수를 호출하게 한다. 채팅이 기간·카테고리·상품랭킹을 대시보드와 동일 값으로 답하게 됨. (버그 3 직접 해결)

**P1 — 상품팀 채팅 facts 기간/차원 파싱 보강 + 분기 순서 교정.**
"특정 월/월 범위/일 범위"를 먼저 해석해 랭킹/카테고리 집계에 **기간을 주입**. "순위+월" 동시 질문 시 순위 분기가 월 필터를 갖도록. (버그 3 완결)

**P2 — 마케팅 Query Compiler에 product 차원(rank) + 기간 결합 추가.**
"가장 많이 판매된 상품/베스트/순위"를 `intent:'rank', dimension:'product', period:...`로 컴파일 → Executor에 상품 라인 기반 topN(기간 필터) 실행기 추가. (버그 2)

**P3 — 월범위+월별+다연도 조합 정합화.**
컴파일러: "월별"이 있어도 월 범위가 있으면 `monthlyTrend`의 표시 범위를 그 범위로 제한(또는 rule 4의 revenue 제외를 완화하고 monthRange를 monthlyTrend에 전달). scope broad: 다연도 분기가 monthRange를 반영, `buildPrimaryChart`가 요청 월 범위만 렌더. (버그 1)

**P4 — broad 폴백 과잉 안내 정리.**
내부 데이터로 답한 경우 `CAUSAL_CAUTION`은 "원인 해석 시" 조건부로만. requiredData는 실제 미연결 지표를 요구한 질문에만. (버그 2 체감)

> 순서 근거: P0가 "화면=채팅 일치"라는 사용자의 최우선 요구를 직접 충족하고 회귀 위험이 가장 낮다(계산식 이동만). P2~P3는 마케팅 파이프라인 로직 변경이라 기존 smoke 회귀 점검이 크다.

---

## 8. 건드리면 안 되는 불변식

- `revenueMetricContract` / `departmentDataSourceOfTruth` / `departmentMetricContract` / synthetic 생성 로직 **계산 변경 금지**. canonical = net 유효주문.
- **숫자는 코드 계산, LLM은 해석만**(마케팅 planner의 "숫자 결과 필드 금지" 검증 유지).
- 없는 데이터(ROAS/방문자/전환/장바구니)는 fake 금지 → "지원 범위 밖" 유지. (단 §P4는 "내부로 답 가능"과 "정말 외부 필요"를 **구분**하는 것이지, unsupported 완화가 아님.)
- 차트 문법: 도넛/파이는 share 전용, 독립 값 비교는 막대, AOV는 도넛 금지(`marketingChartGrammar`).
- 기존 smoke 전부 보존(특히 마케팅 compiler/scope/chartspec/routing). Vercel route ≤12. 고도몰 WRITE 금지, PII/ raw event 노출 금지.
- 상품팀 채팅 규칙: "고도몰 관리자 확인" 문구 금지, 없는 값은 없다고.

---

## 9. 추천 작업명

1차: **Department Chat Shared Aggregation Wiring v0** (P0 — 상품팀 대시보드 집계 함수 추출·채팅 공유)
2차: **Product Chat Period & Ranking Grounding v0** (P1)
3차: **Marketing Query Compiler Product-Rank Dimension v0** (P2)
4차: **Marketing Month-Range × MonthlyTrend Reconciliation v0** (P3)
5차: **Marketing Broad Fallback Caution Scoping v0** (P4)

---

## 10. 다음 구현 작업지시서 초안 — Department Chat Shared Aggregation Wiring v0 (P0)

**목표**: 상품팀 대시보드가 이미 정확히 계산하는 기간 필터·상품별 순위·카테고리·추이를 채팅도 **같은 함수**로 계산하게 만들어, 화면과 채팅의 답을 일치시킨다.

**범위(작게)**:
1. 신규 순수 서비스 `src/services/productSalesAggregation.ts`:
   - `filterOrdersByPeriod(orders, {start,end,source,category})` — 대시보드 `ordersFiltered`/`relevantOrders` 로직 이식.
   - `aggregateProductRanking(orders)` / `aggregateCategoryShare(orders)` — 대시보드 `aggregateProducts`/`categoryData`와 **동일 계산**(라인 기반).
   - `ProductTeamDashboard.tsx`는 이 함수들을 import해 기존 useMemo를 대체(계산식 불변, 순수 이동만 → 화면 회귀 없음).
2. `productTeamChatFacts.ts`:
   - 기간 파서를 단일 월/월 범위/일 범위/"최근 N개월"까지 인식하도록 확장(단일 `resolveChatPeriod` 헬퍼).
   - `top_products`·`category_share`가 파싱된 기간을 위 공통 집계 함수에 주입.
   - **분기 순서 교정**: "순위/랭킹/베스트"가 "특정 월"보다 우선하거나, "특정 월 + 순위" 동시 감지 시 기간 필터를 가진 순위로 라우팅.
3. 스모크 `scripts/smoke-department-chat-shared-aggregation-v0.mjs`: 대시보드 July 2024 필터 결과와 채팅 "2024년 7월 상품별 순위" facts가 **동일 상위 상품/값**을 내는지 대조.

**제외**: 마케팅 컴파일러 변경(별도 작업 P2~P4), CS 경로, LLM 배선, Agent Studio.

**검증**: lint / tsc -b / build / 신규+기존 상품팀 smoke green / route ≤12. 대시보드 화면 값 불변(계산식 이동만).

**수동 검수 질문**:
- 상품팀 채팅 "2024년 7월 상품별 매출 순위" → 대시보드 7월 필터의 순위와 동일 상위 상품/값.
- "2024년 3월~5월 카테고리 비중" → 대시보드 동기간 도넛과 동일 비중.
- "최근 3개월 상품 순위" → 보유 최근 3개월 기준 순위.
- 월 미지정 "상품 순위" → 전체 기간 순위(기존 유지) + "특정 월을 말하면 그 기준으로 답한다" 안내.

---

## 부록 — Claude가 제안하는 근본 해결 방향(중장기)

버그 1~3은 개별 패치로 막을 수 있으나(위 P0~P4), 재발을 막는 근본책은 **팀 공통 Analytics Query 계층**이다.

```
사용자 질문
 → parseAnalyticsQuery(text)  → AnalyticsQuery {
        team, metric, period(단일월/월범위/분기/반기/연도/상대/일범위),
        dimension(time|product|category|coupon|firstRepeat|memberGroup|channel),
        comparison(yearOverYear|monthlyTrend|segmentCompare|none),
        aggregation(sum|avg|ratio|rank|trend), topN?, sort?, chartPref
     }
 → executeAnalyticsQuery(query, dataset)  ← 대시보드·채팅이 공유하는 단일 실행기
        · 기간 필터 → dimension 집계 → metric 계산(canonical net) → chartSpec
 → narrative + chartGrammar
```

- 마케팅의 `MarketingAnalysisPlan`을 일반화해 **상품/CS/마케팅 공통 스키마**로 승격.
- 대시보드의 `ordersFiltered`+집계도 이 실행기를 호출 → "화면=채팅=운영일지" 값 원천 일원화(이미 KPI는 `departmentDataSourceOfTruth`로 일원화됨 — 그 조회(query) 버전).
- `dimension:'product'`+`topN`+`period`가 1급 시민이 되어 버그 2·3이 구조적으로 불가능해짐.
- "월별 + 월범위" 같은 조합은 파서가 `comparison:'monthlyTrend'` + `period:{monthRange}`로 **함께** 보존해 버그 1이 원천 차단.

이 계층은 **P0(상품팀 집계 추출)을 첫 벽돌**로 삼아 점진적으로 확장하는 것이 안전하다(빅뱅 리라이트 금지, 기존 smoke 보존).

*문서 끝.*
