# Marketing Dashboard Default State UX Optimization v0

> **핵심 원칙**: "마케팅팀 대시보드의 기본 화면은 모든 분석을 펼쳐놓는 화면이 아니라, 핵심 운영 KPI와 요청 가능한 분석 입구를 보여주는 화면이다."

대상: [`src/components/MarketingAnalysisDashboard.tsx`](../src/components/MarketingAnalysisDashboard.tsx) · 모달: [`src/components/MarketingDetailModal.tsx`](../src/components/MarketingDetailModal.tsx)

## 1. 작업 배경

마케팅팀 기본 진입 화면이 너무 길고, 상단 KPI는 상품관리팀 대비 허전했다. 비교 그래프·AI 리포트가 사용자가 요청하기 전부터 크게 펼쳐져 있었다. **데이터 로직은 변경하지 않고** 표시 구조만 최적화한다.

## 2. 기본 화면 문제 → 해결

| 문제 | 해결 |
|---|---|
| KPI 카드가 허전(포인트/보조문구 약함) | 아이콘 + 핵심 수치 + 기준 보조문구 + 포인트 라인/hover glow 추가 |
| 비교 그래프가 기본부터 크게 노출 | 기본은 **compact empty state**(요청 기반 비교) + 빠른 실행 칩, 요청 후에만 그래프 확장 |
| AI 리포트가 기본부터 긴 리스트 | 기본은 **compact placeholder**, 비교 요청 후에만 리포트 리스트 |
| 세부 분석 카드가 길게 펼쳐짐 | 카드별 기본 노출 수 제한(4~5) + **전체보기 모달**(검색/정렬) |

## 3. KPI 카드 개선 (canonical 유지)

상단 고정 KPI 3 + 행동 분석 진입 카드:
- **운영매출** 💰 · 전 부서 공통 유효 주문 기준 (`snap.operationalRevenue`)
- **운영 주문수** 🧾 · 결제완료·미취소 (`snap.operationalOrderCount`)
- **운영 객단가** 🧮 · 운영매출 ÷ 운영 주문수 (`snap.operationalAOV`)
- **고객 행동 분석** 🧭 · `행동추적 미연결`(표시 문구만 개선, 상태 로직 불변)

각 카드는 `OPERATIONAL_METRIC_LABELS`(departmentMetricContract)의 라벨/basis를 그대로 읽는다. **수치/계산은 변경하지 않는다** — Department Data Source of Truth의 canonical 운영 KPI 그대로.

## 4. 비교 그래프 — 요청 기반 확장 (empty state)

- 상태: `hasRequestedComparison`(기본 false). artifact가 없고 요청 전이면 compact empty state.
- empty state: 제목 "요청 기반 비교 분석" + 안내 + 빠른 실행 칩(첫구매 vs 재구매 / 쿠폰 사용 vs 미사용 / 회원그룹 비교 / 주문채널 비교).
- 분석 지표 칩 또는 빠른 실행 칩 클릭 → `requestComparison(key)` → `hasRequestedComparison = true` → 해당 그래프 노출.
- 채팅 artifact(`marketingChartArtifact`)가 오면 기존대로 chartSpec 우선.

## 5. AI 리포트 — collapsed default

- 요청 전(`!hasRequestedComparison`): compact placeholder("비교 그래프가 생성되면 핵심 해석과 추천 액션이 표시됩니다." + 예시 요청).
- 요청 후: 기존 `facts.insights` 리포트 리스트(계산/생성 로직 불변, 기본 상태에서만 접음).

## 6. 세부 분석 카드 재배치 + 기본 노출 제한

마케팅 사고 흐름(누가 샀나 → 어떻게 샀나 → 무엇이 팔렸나):
1. 신규/재구매 고객 비교(요약 카드)
2. 회원그룹별 / 주문채널별 매출
3. 쿠폰 / 리워드 비교
4. 카테고리 TOP / **상품 매출 TOP(2컬럼 wide)** / 브랜드 TOP

기본 노출 수: 회원그룹·주문채널·쿠폰·리워드·카테고리·브랜드 **TOP 4**, 상품 매출 **TOP 5**. 나머지는 "전체보기" 모달. 상품 수가 늘어도 기본 화면이 무한히 길어지지 않는다.

## 7. 전체보기 모달 (`MarketingDetailModal`)

- 표시 전용 — **기존 facts 항목을 검색/정렬만** 한다(새 계산 없음).
- 제목 · 기간 · 전체 항목 리스트 · 검색 입력 · 정렬(매출순/주문수순/객단가순/비중순) · 닫기 · 내부 스크롤.
- 정렬은 **데이터에 실제 있는 필드만**(revenue/orderCount/averageOrderValue/sharePercent). 없는 값(예: 판매수량)은 fake로 만들지 않는다.

## 8. 데이터 로직 불변 원칙

- `marketingAnalysisFacts` / `departmentDataSourceOfTruth` / `departmentMetricContract`의 **계산 로직 변경 없음**(표시용 label/basis만 읽음).
- synthetic 생성·고객흐름 tracking·Vercel gateway·고도몰 route/WRITE 변경 없음. raw event 노출 없음.
- canonical 운영 KPI 기준 유지(상품관리팀과 같은 값).
- 오른쪽 "마케팅팀에게 지시하기" 패널(채팅/지시/승인/WRITE) 변경 없음.
