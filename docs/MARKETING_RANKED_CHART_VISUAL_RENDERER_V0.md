# Marketing Ranked Chart Visual Renderer Patch v0

> 작성일 2026-07-02 · 기준 HEAD `dd58722` · 브랜치 `fix/marketing-ranked-chart-visual-renderer-v0`
> 성격: 계산/데이터/chartSpec 아님 — **rankedBar 시각 렌더(CSS) 보정**.

## 원인 (확정: flex/height collapse)
`RankedBarChart`는 track를 **세로(column) bucket**(`.marketing-chart-bucket`) 안에 둔다. 그런데 `.marketing-chart-series-bar-track`의 `flex: 1`은 원래 **가로 행**(`.marketing-chart-series-bar`)용이라, column 컨텍스트에서 `flex-basis:0`이 `height:10px`를 눌러 **track 높이를 0으로** 접었다. → fill(`height:100%`) 높이 0 → **막대가 안 보이고 텍스트만** 남음("막대 없는 막대그래프"). 데이터·width%·색상 클래스는 정상이었음.
부수 원인: `getMarketingSeriesVisualStyle`가 key의 4자리 숫자를 "연도 시리즈"로 오인 → 상품 goodsNo가 year 색으로 몰림(가시성엔 문제없으나 항목 구분색 저하).

## 수정 (CSS + 색상 오인 보정만)
- `src/components/MarketingAnalysisDashboard.css`
  - `.marketing-chart-ranked-bars .marketing-chart-series-bar-track { flex: 0 0 auto; height: 10px; width: 100%; }`
  - `.mkt-chart-compact-bars .marketing-chart-series-bar-track { flex: 0 0 auto; height: 14px; width: 100%; }`
  - `.marketing-chart-series-fill { min-width: 2px; }` (값>0인데 비율이 작아도 최소 가시 폭)
- `src/components/MarketingAnalysisDashboard.tsx`
  - `getMarketingSeriesVisualStyle(..., rankItemMode=false)` 추가 — `rankItemMode`면 연도 감지 skip → 세그먼트 매핑→index 팔레트(s0~s3). **RankedBarChart 호출부만 `true`**. time chart(2024/2025 연도색)는 불변.

계산 로직·chartSpec 데이터 구조·synthetic·canonical KPI **미변경**.

## 실제 렌더 검증 (Playwright, computed style)
`file://` 차단으로 초경량 정적 서버(`scripts/serve-fixtures.mjs`)로 repo를 서빙하고, **실제 CSS + RankedBarChart DOM을 그대로 재현한 fixture**(`scripts/fixtures/ranked-chart-visual-check.html`)를 Playwright로 열어 computed style 확인:

| 항목 | trackH | fillH | fillW(px) | backgroundColor |
|---|---|---|---|---|
| 상품 가습기(1위) | 10 | 10 | **520** | rgb(49,214,196) |
| 상품 선풍기 | 10 | 10 | 359 | rgb(49,214,196) |
| 상품 공기청정기 | 10 | 10 | 337 | rgb(251,191,36) |
| 상품 밥솥 | 10 | 10 | 293 | rgb(90,200,250) |
| 상품 청소기 | 10 | 10 | 157 | rgb(49,214,196) |
| 카테고리 생활가전(1위) | 14 | 14 | **520** | rgb(49,214,196) |
| 카테고리 주방가전 | 14 | 14 | 169 | rgb(49,214,196) |
| 카테고리 공기·청정 | 14 | 14 | 137 | rgb(251,191,36) |

- track/fill offsetHeight > 0 ✓ (붕괴 해소) · fill offsetWidth > 0 ✓ · **1위 fill 최장, 하위 감소** ✓ · backgroundColor transparent 아님 ✓ · product/category 모두 확인 ✓.
- 재현: `node scripts/serve-fixtures.mjs` → 브라우저에서 fixture URL 열기.
- 비고: `--success`와 `--accent-primary` 토큰이 동일(#31d6c4)이라 s0/s1이 같은 teal로 보임(가시성/순위엔 무영향). 전용 랭킹 팔레트는 후속 선택 과제.

## 회귀 (time comparison 등)
- CSS는 `.marketing-chart-ranked-bars`/`.mkt-chart-compact-bars` track에만 스코프 → time 비교(GroupedBarChart/CommerceGroupedBarChart, route `groupedVertical`)는 미영향. `rankItemMode`도 RankedBarChart에만 적용 → 2024/2025 연도색 불변.

## 검증
- lint ✅ · tsc -b ✅ · build ✅ · route 9 (≤12)
- marketing bridge smoke 42/0 · chart-grammar 23 · chart-renderer-parity 24 · dashboard 30 · chartspec-runtime 32 · chartspec-bridge 37 · compiler 30 · scope 32 · analytics-query-layer 40 · product catalog 14 (전부 green)
- Playwright computed-style 검증(위 표) 통과.

## 수동 검수
1. "2024년 5월 상품별 매출 순위 그래프로 보여줘" → 상품별 가로 막대 실제 표시, 1위 최장.
2. "2024년 3월부터 5월까지 카테고리별 매출 비중 보여줘" → 카테고리 막대 표시, 생활가전 최장, raw code 없음.
3. "2024년과 2025년 1월부터 5월까지의 월별 매출을 그래프로 비교해줘" → 기존 월별 비교 그래프 정상.
4. "2024년 7월 상품별 매출 순위 그래프 없이 텍스트로만 알려줘" → 차트 없음, 텍스트만.

## 불변식
계산/synthetic/canonical KPI 불변 · 상품 라인매출(gross) 분석용 유지 · 숫자 LLM 없음 · WRITE/Tool/RAG/Agent Studio 미변경 · API route 추가 없음(9≤12) · time comparison 회귀 없음.
