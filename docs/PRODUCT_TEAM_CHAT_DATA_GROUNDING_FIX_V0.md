# Product Team Chat Data Grounding Fix v0

> **작성일**: 2026-06-26 · **브랜치**: `fix/product-team-chat-data-grounding-v0`
> **코드**: `src/services/productTeamChatFacts.ts` · **smoke**: `scripts/smoke-product-team-chat-grounding.mjs`(13/13)

## 1. 문제 상황
대시보드는 2025-07~2026-06 Universe(826건)를 보는데, 우측 상품팀 채팅이 "2025년 7월 데이터만 있다" 또는 "2025년 8월~2026년 3월이 없다"고 잘못 답함.

## 2. 원인
- **데이터 소스는 이미 통일됨**: `DepartmentWorkspacePanel`이 `ProductTeamDashboard`와 `buildProductTeamChatFacts`에 **같은 `productData.revenue` 객체**를 넘긴다(코드 확인). 소스 문제 아님.
- **facts의 기간 로직 결함**:
  - 단일 월 매칭 `/(\d{1,2})\s*월/`이 "2025년 7월부터 2026년 3월까지" 같은 **범위 질문을 첫 'N월'(7월)로 축소** → 7월만 답하거나 나머지를 없다고 오해 유발.
  - **연도/범위/"최근 N개월" 미처리**.
  - `aggregateMonthly`는 12개월 전부 보지만, 범위 질문 경로가 없어 단일 월로 빠짐.

## 3. 수정한 데이터 흐름
질문 → **기간 범위 파싱(신규)** → 코드가 `revenue.orders`(=Universe)에서 월별 집계 → facts → AI는 facts 안에서만 설명. (AI 숫자 생성 없음)

## 4. 기간 파싱/필터링 정책 (`productTeamChatFacts.ts`)
- **신규 helper**: `parseRequestedMonthRange(userText, monthly)` / `availableMonthRange(monthly)` / `deriveMonthlyRangeLines` (+ `enumerateMonths`, `ymAdd`).
- **지원 패턴**:
  - `YYYY년 M월 ~ YYYY년 M월`, `YYYY년 M월부터 YYYY년 M월까지` → 해당 범위 월별 비교
  - `최근 N개월` → 보유 최신월 기준 직전 N개월
- **신규 intent `monthly_range`** — 단일 월 매칭보다 **먼저** 평가(범위가 단일 월로 축소되지 않게).
- 각 월 라인: `YYYY년 M월: 매출 X원, 주문 N건 (전월 대비 ±%)` — 매출·주문 수 둘 다 제공, `주문` 키워드 시 주문 수 우선 안내.
- 기존 intent(단일월/추이/카테고리/순위/재고/총매출/데이터한계/catalog_taxonomy)는 **무변경**.

## 5. 데이터 없음 판단 기준
- `availableMonthRange`(보유 min~max) 계산 → 요청 범위가 **보유 기간과 전혀 겹치지 않을 때만** "겹치지 않음" 안내.
- 겹치면 보유분으로 클램프해 월별 집계(보유 기간 내 데이터가 있으므로 "데이터 없음"이라 단정 금지 — answerGuidance에 명시).
- 예: 보유 2025-07~2026-06인데 2025-08~2026-03을 없다고 하면 버그 → 이제 8월~3월 전부 집계.

## 6. 검증 질문 (smoke로 단위 검증)
| 질문 | 결과 |
|---|---|
| 2025년 7월~2026년 3월 월별 매출 비교 | `monthly_range`, 7월~3월(9개월) 전부, "없음" 아님 ✅ |
| 2025년 8월~2026년 3월 월별 주문 수 | `monthly_range`, 8월~3월 전부 ✅ |
| 최근 3개월 매출 추이 | `monthly_range`, 2026년 4~6월 ✅ |
| 카테고리별 매출 | `category_share`, `오나홀` 라벨 유지 ✅ |
| 2020년 범위(보유 밖) | "겹치지 않음" 안내 ✅ |
- fake PII 미포함, 기존 intent(단일월/총매출/재고/데이터한계) 무변경 확인.

## 7. 남은 이슈
- 자연어 파서 v0 한계: "올해 월별", "상반기" 등 추가 표현은 미지원(다음 단계).
- 주간/일 단위 범위 채팅 비교는 미지원(현재 월 범위만). 대시보드 차트는 별도(`productDashboardTrendBuckets`).
- 환불 위험 상품은 claimSummary 기반 — 채팅 facts에 별도 intent 미연결(다음).

## 8. 다음 단계 — Analytics Query Engine v0
기간/지표/그룹(월·카테고리·브랜드·결제수단·세그먼트)을 일반화해 파싱·집계하는 쿼리 엔진으로 확장 → CS/마케팅/총괄 facts 라우팅의 공통 기반.
