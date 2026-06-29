# Marketing Chart Width Fit Patch v0.1 (2026-06-29)

> **종류**: 시각 QA 패치(차트 출력 폭 보정). 분석 엔진/narrative/synthetic/LLM/메모리 미변경, 고도몰 WRITE/API/localStorage 변경 없음.
> **한 줄**: Renderer Parity P0 이후 차트가 **넓은 중앙 카드에서 가운데 좁게 몰리던** 문제를, 컨테이너 실제 폭을 측정해 SVG viewBox 폭으로 사용하도록 바꿔 **카드 폭을 꽉 채우게** 보정.
> **산출물**: `src/components/charts/`(useChartWidth · CommerceComboChart · CommerceGroupedBarChart · commerceCharts.css) · `MarketingAnalysisDashboard.css` + 본 문서 + `scripts/smoke-marketing-chart-width-fit-v01.mjs`(20/20).

---

## 1. 문제 요약
중앙 그래프 영역은 넓은데 실제 plot이 가운데 좁게 모이고 좌우 여백이 과도. 12개월 combo·2024/2025 grouped bar가 카드 폭을 못 씀.

## 2. 원인 (상품팀 기준 폭이 그대로 적용된 것처럼 보인 이유)
공통 SVG 차트가 **고정 viewBox `0 0 560 240` + `preserveAspectRatio="xMidYMid meet"** 였다. `.cc-svg`는 `width:100%; height:240px`인데, `meet`는 종횡비(560:240)를 **보존**한다. 카드가 560px보다 넓으면 높이(240px)가 한계가 되어 콘텐츠가 **560px 폭만 차지하고 가운데 정렬 + 좌우 빈 공간**이 생긴다. 즉 viewBox 폭이 상품팀 카드 폭(≈560) 수준에 사실상 고정된 것처럼 보였다.

## 3. 마케팅 중앙 패널 폭 정책
- 컨테이너 실제 렌더 폭을 **ResizeObserver(`useChartWidth`)** 로 측정해 **viewBox 폭 = 측정 px**로 사용 → viewBox 종횡비가 박스와 일치해 `meet`로도 좌우 여백 없이 꽉 참(왜곡 없음, `preserveAspectRatio="none"` 미사용 유지).
- CSS: `.cc-chart / .cc-plot / .cc-svg { width:100%; max-width:none }`, 고정 `max-width: Npx` 없음. `.marketing-chart-spec-graph { width:100% }`.
- 좌우 margin: y축 라벨/툴팁에 필요한 만큼만(padL 56 / padR 26). right margin 과다 제거.
- 12개월은 측정폭 기준 균등 분산. x라벨은 `labelStep`으로 겹침 방지(12개면 전부 표시).

## 4. Q1/Q2 기대 화면
- **Q1 combo**: 막대(매출)+꺾은선 combo 유지, 1~12월이 카드 폭을 넓게 사용, 좌우 여백 자연스러움, y/x 라벨 가독, tooltip 잘림 없음.
- **Q2 grouped vertical**: x축 1~12월, 각 월 2024/2025 막대 나란히, 카드 폭 넓게 사용, 막대 간격 정상(barW가 측정폭 기준 산출), 수평 리스트 아님.

## 5. tooltip clamp
`CommerceChartTooltip`은 absolute + pointer-events:none 유지(레이아웃 안 밂·깜빡임 없음). 추가로 차트에서 hover 중심 x를 **측정폭 기준 px로 clamp**(양 끝 ~92px 여백)한 뒤 %로 변환 → 좌/우 끝 월 hover 시 카드 밖으로 잘리지 않음.

## 6. ProductTeamDashboard 회귀 금지
상품팀 `TrendChart`/`ptd-*` **미변경**. 공통 `cc-*` CSS는 `ptd-*`에 영향 없음(클래스 scope 분리) — smoke 15·16으로 검증.

## 7. 검증
- `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
- `smoke-marketing-chart-width-fit-v01` ✅ **20/20**
- 회귀 16종 전부 green: chart-renderer-parity 24 · scope-insight 32 · contract-p0 21 · calendar-rebase 31 · insight-ux 42 · llm-planner 31 · intelligence-planner 32 · dynamic-render 30 · runtime-connection 32 · bridge 37 · temporal-crosstab 30 · baseline-year 29 · focused-layout 27 · dashboard-v0 30 · facts-core 34 · team-chat 32.

## 8. 남은 P1 / 다음 작업
- **dualMetricBar 실렌더**(쿠폰사용률 vs 매출비중 / 문의수 vs 매출 이중 metric) + secondaryValue 보존.
- **scatter 실렌더**(관계형).
- 모바일 long-press tooltip, 막대 애니메이션, 상품팀 `TrendChart` 공통 컴포넌트 전환(선택).
