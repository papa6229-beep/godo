# Marketing Chart Grammar & Compact Renderer v0

> **핵심 문장**: "객단가, 주문수, 매출처럼 독립 값을 비교하는 차트는 도넛/파이가 아니라 막대 비교가 기본이다. 도넛/파이는 구성비와 share 전용이다."

문법: [`marketingChartGrammar.ts`](../src/services/marketingChartGrammar.ts) · 렌더: `MarketingAnalysisDashboard.tsx`(차트 컴포넌트)

## 1. 문제 상황

Query Compiler 이후 해석/계산은 정상이나 차트 레이어가 의도와 어긋났다.
1. compact 비교 차트에서 hover 시 불필요한 카드/tooltip이 뜨고 **깜빡임**(값은 이미 막대에 표시됨).
2. "쿠폰 사용/미사용 객단가 비교"가 부적절한 그래프(세그먼트 1막대 합산 / 도넛 우려). 객단가는 part-to-whole이 아님 → **2막대 비교가 정답**.
3. chart type 선택이 plan/metric/dimension을 충분히 반영하지 못함.

## 2. 왜 Chart Grammar가 필요한가

executor가 분기마다 chartType을 하드코딩하면 같은 실수가 반복된다. **plan/metric/rowCount/share 여부를 보고 chart type을 결정하는 단일 문법**(`selectMarketingChartType`)으로 일원화한다.

## 3. chart type 선택 기준 (`selectMarketingChartType`)

| 조건 | chart type |
|---|---|
| suppressed / unsupported | none(unsupported) |
| 표 요청 / 다중 metric | table |
| **구성비·비중·share** (단, AOV 제외) | **donut** |
| 월별/다중 series 추이 | groupedBar → (렌더가 groupedVertical/line 라우팅) |
| 5개 이상 ranking | rankedBar(horizontal) |
| 2~4개 독립 값 비교(단일월/월범위/연도/세그먼트) | **compact groupedBar** |

**도넛/파이 금지**: 객단가·주문수·매출·기간 비교·연도 비교. **AOV는 isShare여도 절대 donut 아님.**

## 4. compact comparison 렌더링

- compact(막대 ≤4개)는 값이 막대에 이미 표시되므로 **hover tooltip 카드를 렌더하지 않는다**(깜빡임 방지). 막대 highlight 정도만.
- 상단 빈 여백 축소(`mkt-chart-compact`/`mkt-chart-compact-bars`): tooltip placeholder 제거 + padding 축소.
- 12개월 월별 차트(combo/groupedVertical)는 compact가 아니므로 기존 tooltip 유지.

## 5. 세그먼트 비교 차트 교정

"쿠폰 사용 고객과 미사용 고객의 객단가 비교" →
- chartType: **groupedBar(compact)** — 2막대(쿠폰 미사용 / 쿠폰 사용).
- (이전엔 rankedBar로 series 랭킹돼 1막대로 잘못 렌더 → groupedBar로 N buckets=N bars 교정.)
- value: 객단가(원) + 주문수 보조. donut/pie 아님. 제목 "쿠폰 사용/미사용 객단가 비교".

## 6. metric label / unit 문법 (`MARKETING_METRIC_GRAMMAR`)

| metric | label | unit | format |
|---|---|---|---|
| revenue | 매출 | 원 | currency |
| orderCount | 주문수 | 건 | integer |
| averageOrderValue | 객단가 | 원 | currency (+주문수·매출 보조) |
| quantity | 판매수량 | 개 | integer |

series.label = metric label → **객단가 그래프에 "매출" 범례가 나오지 않는다**. 제목/범례/툴팁/축이 metric과 일치.

## 7. 회귀 방지(유지)

- 2024·2025 월별 매출 비교 → 기존 12개월 비교(groupedVertical) 유지.
- 2024·2025 월별 객단가/주문수 비교 → 12개월 비교(metric honoring).
- 2024년 7월 vs 2025년 7월 매출 → compact groupedBar.
- 그래프 없이 ... → chart 없음. ROAS → unsupported, chart 없음.

## 8. 이번 범위 / 제외

- 범위: **차트 선택 문법 + compact renderer UX만**. Query Compiler/Executor 계산 로직 무변경.
- 제외: synthetic/department source·contract/facts 계산, Vercel gateway, 고객흐름 tracking, 고도몰 WRITE, Agent Studio wiring, Tool 실행/RAG.
