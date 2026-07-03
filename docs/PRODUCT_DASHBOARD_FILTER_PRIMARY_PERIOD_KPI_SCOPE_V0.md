# 상품관리팀 대시보드 — 필터 개편 (기간 1차 · 카테고리 드롭다운 · KPI 필터 반영) V0

> 2026-07-03 · 사장님 지시(자연어) → A안 확정 후 구현. 완료보고서.

## 1. 배경 — 사장님이 발견한 문제

상품관리팀 대시보드 상단 KPI 카드 위 조건이 **카테고리(칩 4개)**였는데:
1. **카테고리를 눌러도 KPI 카드에 제대로 반영 안 됨** (버그 의심)
2. 그 자리에 카테고리가 맞나? CS팀은 같은 자리에 **기간**이 있음
3. 상품 등록이 늘어 **카테고리가 폭증하면 칩 방식이 무너짐**

## 2. 원인 진단 (확인 완료 — 의심이 정확했음)

상단 KPI 4개 중 **2개만 필터에 반응**하고 있었음:

| 카드 | 계산 출처 | 카테고리 클릭 시 |
|---|---|---|
| 💰 운영매출 | `snap` = `buildDepartmentSourceOfTruthSnapshot(revenue)` — **전체 주문 고정** | ❌ 안 바뀜 |
| 🧾 운영 주문수 | 위와 동일 | ❌ 안 바뀜 |
| 📈 판매수량 | `kpi.sold` ← `relevantOrders`(필터됨) | ✅ 바뀜 |
| 📦 재고 위험 | `filteredStock`(카테고리 필터됨) | ✅ 바뀜 |

`buildDepartmentSourceOfTruthSnapshot`는 `revenue`만 받고 카테고리/기간 인자가 없어 전체로만 계산.
운영매출·운영주문수는 "전 부서 공통 대표값(마케팅과 일치)"이라 **일부러** 전체 고정이었으나,
하필 카테고리 칩 바로 아래 있어 "눌러도 안 바뀌는 고장"처럼 보였음.

## 3. 결정 — A안 (사장님 확정)

**기간을 1차 필터로 + 카테고리는 보조 드롭다운으로 + KPI를 필터 범위로 일관 반영(배지).**

핵심: "전 부서 공통 대표값" 원칙은 **"같은 정의 + 기본화면(전체)이 마케팅과 일치"**를 뜻함.
→ A안에서도 **필터 없는 전체 상태 = 전사 대표값 그대로**(마케팅과 100% 동일).
사용자가 능동적으로 좁혔을 때만 그 범위 값으로 바뀌고 배지로 명시. 정의(builder)는 불변 → 아키텍처 안 깨짐.

## 4. 구현 (`src/components/ProductTeamDashboard.tsx` / `.css`)

- **KPI 필터 반영**: `snap` 제거 → `filteredSnap = buildDepartmentSourceOfTruthSnapshot({ ...revenue, orders: relevantOrders })`.
  같은 canonical builder를 **필터된 주문(relevantOrders)**에 재적용. 전체 선택 시 relevantOrders=전체 → 전사값과 동일(parity).
  운영매출·운영주문수·판매수량 카드가 이제 필터에 반응.
- **기간 1차 승격**: 기존 `renderPeriodControl()`을 필터바 최상단(첫 그룹)으로 이동(CS팀과 통일).
  매출추이·매출구성 패널 head에 있던 **중복 기간 컨트롤 2개 제거**(basis 라벨은 유지).
- **카테고리 드롭다운**: 칩 나열 → `<select>`(`ptd-select` 재사용). 카테고리 50개가 돼도 안 무너짐.
- **필터 배지 + 범위 표시**: KpiCard에 `filterBadge` prop 추가 → 필터 적용 시 카드 라벨에 `필터: OO` 칩.
  재고 카드는 카테고리에만 반응하므로 카테고리 배지만. 필터바에 `적용 범위: {scopeText}` 표기.
- **안내문 정직화**: "마케팅팀과 같은 값입니다" → "**전체 기준일 때** 마케팅팀과 같은 값" + "필터 적용 시 선택 범위로 좁혀 계산".
- **CSS**: `.ptd-kpi-filter-badge`, `.ptd-filter-scope`(우측 정렬), `.ptd-kpi-label` flex 정렬 추가.

**변경 없음(불변)**: 데이터 계산 로직·`buildDepartmentSourceOfTruthSnapshot`·metricContract·synthetic·gateway·고객흐름·고도몰 WRITE. 서비스 레이어 무수정, 컴포넌트만.

## 5. 검증

- `tsc -b` / `lint` / `vite build`: 그린. API 함수 수 불변(≤12).
- **smoke 갱신(옛 설계 가정 → 새 불변식)**: 3개 테스트가 `snap` 리터럴 변수명을 검사하고 있었음.
  핵심 의도(헤드라인=canonical operational, gross 아님)는 유지되므로 `(?:snap|filteredSnap)` 허용 + 신규 핀 추가:
  - `smoke-cross-team-revenue-metric-parity-v0`: **20/0** (신규 `9b. 상품 헤드라인 필터 반영(canonical builder 재적용)` 포함)
  - `smoke-department-data-source-of-truth-v0`: **23/0**
  - 런타임 parity 테스트(operationalRevenue==net 등)는 서비스 무변경이라 그대로 통과.
- `smoke-marketing-dashboard-default-state-ux-v0` test 24(git status 기반 스코프 가드)는 커밋 후 트리 clean → 통과.

## 6. 남은 확인 — 배포 눈검수

로컬 dev엔 `/api/godomall/*` 실데이터 없음 → 브라우저 렌더 검증은 배포에서.
**배포 후 상품관리팀 대시보드에서 카테고리/기간을 눌러 KPI가 그 범위로 바뀌는지(+배지)** 사장님 눈검수 필요.

## 7. 위치
- 변경: `src/components/ProductTeamDashboard.tsx`, `ProductTeamDashboard.css`,
  `scripts/smoke-cross-team-revenue-metric-parity-v0.mjs`, `scripts/smoke-department-data-source-of-truth-v0.mjs`.
- CS/총괄 채팅 차트 배치 건은 "현 상태 유지"로 종결(별도 논의 후 결정).
