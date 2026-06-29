# Marketing Chart Renderer Parity P0 (2026-06-29)

> **종류**: 차트 렌더러 수리(UI). 실제 고도몰 WRITE/API 호출 없음, 분석 엔진/synthetic/메모리/LLM 미변경, localStorage 변경 없음.
> **한 줄**: 마케팅 그래프가 깨지던 원인은 분석 엔진이 아니라 **렌더러 구현**이었다(왜곡 viewBox line-only + 수평 div 막대 + in-flow tooltip). 상품관리팀 `TrendChart`의 SVG 패턴을 **공통 차트 컴포넌트**로 추출해, 단일 월별 매출=**막대+꺾은선 combo**, 연도 비교=**세로 grouped bar**, tooltip=**absolute·pointer-events:none**로 정상화.
> **산출물**: `src/components/charts/`(CommerceComboChart · CommerceGroupedBarChart · CommerceChartTooltip · marketingChartRoute · commerceChartUtils · commerceCharts.css) + `MarketingAnalysisDashboard.tsx` 라우팅 연결 + 본 문서 + `scripts/smoke-marketing-chart-renderer-parity-p0.mjs`(24/24).

---

## 1. 진단 요약 (Parity Diagnosis v0 결과)
- 차트 라이브러리 없음(양 팀 손수 SVG/div).
- **상품팀 `TrendChart`**: SVG viewBox 560×240(정상 비율), 세로 `<rect>` 막대 + smooth line + area + y-grid/축 + x라벨 + **absolute pointer-events:none tooltip** = 깔끔한 combo.
- **마케팅 렌더러**: `LineChart`가 viewBox `0 0 100 40 preserveAspectRatio="none"`(가로 왜곡) + **막대 없는 line-only**, `GroupedBarChart`가 CSS width% **수평 막대를 세로로 12행 쌓음**, tooltip이 **in-flow div**(레이아웃 밂/깜빡임). → Q1 combo 안 나옴, Q2 horizontal list.

## 2. 공통 SVG 차트 추가 이유
상품팀 패턴이 정답이므로 그 **패턴을 공통 컴포넌트로 추출**(상품팀 `TrendChart`는 이번 P0에서 **그대로 유지** — 회귀 방지). 마케팅이 새 공통 컴포넌트를 사용. 후속에서 상품팀도 공통화 가능(선택).

## 3. CommerceComboChart 구조
`points: CommerceComboChartPoint[]{key,label,barValue,lineValue,orderCount?,delta?,deltaRate?}` + `barLabel/lineLabel/valueFormatter/countFormatter/height`.
- SVG `viewBox 0 0 560 240`, `preserveAspectRatio="xMidYMid meet"`(왜곡 없음).
- 세로 `<rect>` 막대(barValue) + `smoothPath` 추세선(lineValue) + area gradient + y 5단계 grid/금액축 + x 라벨(겹침 시 labelStep 축약) + hover dot(r 3→5).
- **Q1 매핑**: barValue=월매출, lineValue=월매출(추세선), orderCount=월주문수, delta/deltaRate=전월 대비(시리즈 인접값에서 계산 — **엔진 미변경**, 수치 왜곡 없음). tooltip에 매출·주문수·전월대비 표시 → 막대·라인 동일값이어도 정보 가치 유지.

## 4. CommerceGroupedBarChart 구조
`points: CommerceGroupedBarChartPoint[]{key,label,values:[{key,label,value,orderCount?}]}`.
- x축=구간(1월~12월), 각 구간마다 series(2024/2025) 세로 막대를 **나란히**(groupCenter/barW 배치) + legend + y grid/축.
- **Q2 매핑**: 구간=월 bucket, values=[{2024},{2025}]. hover 시 두 연도 값 + **차이** 표시. **수평 list 금지**.

## 5. tooltip 안정화 정책
`CommerceChartTooltip` = chart container 내부 **`position:absolute` + `pointer-events:none` + z-index** → ① 레이아웃을 밀지 않음(차트 높이 불변), ② 마우스 이벤트를 잡지 않아 mouseleave 토글(깜빡임) 없음. dot/막대가 충분히 커 hover hit target 안정. (기존 in-flow `ChartTooltip`은 다른 차트용으로 잔존.)

## 6. Q1/Q2 적용 기준 — `resolveMarketingChartRoute(chartSpec)` (순수 함수)
- **combo**: `chartType==='line'` && primaryMetric=revenue && series 1개 && 시점 6~24개(월/분기형). → Q1.
- **groupedVertical**: `chartType==='groupedBar'|'stackedBar'` && series ≥2 && 구간 ≥3. → Q2.
- 그 외(line/groupedBar 소규모/rankedBar/table/unsupported)는 **기존 렌더러 유지**(switch 마커 보존 → dynamic-render smoke 무회귀).
- 대시보드는 이 함수로 판정 후 combo/groupedVertical만 신규 컴포넌트로, 나머지는 기존 switch로 폴백.
- **smoke가 이 순수 함수를 직접 단위 검증**(source-regex보다 견고): Q1→combo, Q2→groupedVertical, 소규모/미지원 회귀까지.

## 7. 검증
- `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
- `smoke-marketing-chart-renderer-parity-p0` ✅ **24/24** (Q1 combo, Q2 groupedVertical, tooltip absolute, 상품팀 회귀 없음)
- 회귀 15종 전부 green: scope-insight 32 · contract-p0 21 · calendar-rebase 31 · insight-ux 42 · llm-planner 31 · intelligence-planner 32 · dynamic-render 30 · runtime-connection 32 · bridge 37 · temporal-crosstab 30 · baseline-year 29 · focused-layout 27 · dashboard-v0 30 · facts-core 34 · team-chat 32.

## 8. 실제 WRITE 없음 / 미변경
신규 차트 컴포넌트 + 대시보드 라우팅 연결만. `marketingScopeInsightEngine` 데이터 집계 로직, synthetic data, LLM prompt, localStorage, `ProductTeamDashboard` 전부 **미변경**. 신규 차트 코드에 fetch/localStorage/WRITE 없음.

## 9. 남은 P1 / 다음 작업
- **dualMetricBar 실렌더**(category 쿠폰사용률 vs 매출비중, product 문의수 vs 매출 — 두 metric 막대 나란히/이중축) + adapter가 secondaryValue 보존.
- **scatter 실렌더**(관계형).
- 상품팀 `TrendChart`도 공통 컴포넌트로 전환(선택, 회귀 주의).
- 모바일 long-press tooltip, 막대 애니메이션 polish.
