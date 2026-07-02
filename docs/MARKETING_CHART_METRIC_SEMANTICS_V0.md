# Marketing Chart Metric Semantics Patch v0

> 작성 2026-07-02 · 기준 HEAD `360287a` · 브랜치 `fix/marketing-chart-metric-semantics-v0`
> 성격: 계산/정렬/share 계산식 불변 — **표시 지표 의미(semantics) 보정**. 진짜 도넛은 별도 후속(`Marketing Share Donut Chart Renderer v0`).

## 문제 (실화면 스샷)
1. 상품 랭킹 hover 카드가 **"주문수 0건"** — product rank point에 orderCount가 없어 generic tooltip이 `seriesOrderCount`=0을 표기(판매수량과 혼동).
2. 카테고리 **"비중" 질문인데 그래프 메인 값이 매출(₩)** — 비중 질문의 주인공은 %여야 함.

## 수정
### 1) product rank 툴팁/detail semantics
- `productSalesAggregation.aggregateProductRanking`: **상품별 주문 건수(distinct orderNo)** = `orderCount`를 `ProductAgg`에 추가(판매수량 quantity와 별개). 대시보드 수치 불변(가산 필드).
- `analyticsQueryExecutor` product rank row에 `orderCount` 전달. bridge point에 `quantity`/`orderCount` 실음.
- `MarketingChartSpec` point 타입에 `quantity?` 추가.
- `buildMarketingTooltipPayload` rows 재구성:
  - 판매수량은 `quantity>0`일 때만 "판매수량 N개"
  - 주문수는 `orderCount>0`일 때만 "주문수 N건" — **0/미계산이면 아예 표시 안 함**(가짜 "주문수 0건" 제거)
  - percent 차트면 "매출 ₩"를 보조로
  - `seriesQuantity`/`seriesRevenue` 헬퍼 추가

### 2) category share = percent 메인
- bridge `toMarketingChartSpec`: category share는 `metric='share'`, `unit='percent'`, **point.value = round1(share×100)**(막대·메인라벨이 %), `point.revenue`는 보존(툴팁 "매출" 보조). raw code 미노출(표시명 유지).
- rankedBar 렌더는 그대로(막대 길이 ∝ %, 우측 라벨 `formatMetricValue(v,'percent')`="62.9%").
- time comparison(groupedBar/line)은 미변경(unit≠percent → 매출 보조줄 미추가, 기존과 동일).

## 검증
- lint ✅ · tsc -b ✅ · build ✅ · route 9 (≤12)
- bridge smoke **50/0**: product point `quantity>0`·`orderCount>0`(선풍기 판매3/주문2로 혼동 없음)·unit krw / category unit `percent`·value=41.7(share%)·revenue=50000 보존·value≤100.
- 회귀 green: chart-grammar 23 · chart-renderer-parity 24 · dashboard 30 · chartspec-runtime 32 · chartspec-bridge 37 · compiler 30 · scope 32 · analytics-query-layer 40 · product catalog 14 / grounding 13 / trend-buckets 10.

### 실제 렌더 검증 (Playwright computed style, fixture)
`scripts/fixtures/ranked-chart-visual-check.html` + `scripts/serve-fixtures.mjs`:
| | 값(우측 라벨) | trackH | fillH | fillW | bg |
|---|---|---|---|---|---|
| 상품 가습기 | 826,200원 | 10 | 10 | 520 | teal |
| 상품 청소기 | 248,400원 | 10 | 10 | 157 | teal |
| **카테고리 생활가전** | **62.9%** | 14 | 14 | 520 | teal |
| **카테고리 주방가전** | **20.4%** | 14 | 14 | 168 | teal |
| **카테고리 공기·청정** | **16.6%** | 14 | 14 | 137 | gold |
→ 카테고리 막대 메인 라벨이 **%로 표시**·폭 비례·색상 정상. 상품 막대 정상 유지.
비고: hover 카드(툴팁)는 React hover라 dev-data 미로딩으로 실앱 자동캡처 불가 → **툴팁이 읽는 데이터(quantity/orderCount>0, percent+revenue)를 smoke로 검증**(0 fallback 제거·판매수량 표기 보장).

## 불변식
계산 기준·정렬 기준·share 계산식 불변 · synthetic/canonical KPI 불변 · 신규 도넛/복합차트 미구현 · 숫자 LLM 없음 · WRITE/Tool/RAG/Agent Studio 미변경 · route 추가 없음 · time comparison 회귀 없음 · 그래프 억제 유지.

## 수동 검수
1. "2024년 5월 상품별 매출 순위 그래프로 보여줘" → 막대 위 hover 카드에 **판매수량 N개**(+ 주문 N건, 실제값), "주문수 0건" 없음.
2. "2024년 3월부터 5월까지 카테고리별 매출 비중 보여줘" → 막대 메인 값 **%**(생활가전 62.9% …), 매출은 카드 보조, raw code 없음.
3. "2024년과 2025년 1월부터 5월까지의 월별 매출을 그래프로 비교해줘" → 기존 정상.
4. "2024년 7월 상품별 매출 순위 그래프 없이 텍스트로만 알려줘" → 차트 없음.

## 후속
- `Marketing Share Donut Chart Renderer v0`: 진짜 도넛(또는 도넛+막대) — 별도 스코프.
