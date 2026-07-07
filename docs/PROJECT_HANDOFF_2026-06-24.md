# GODO AI OS — 통합 핸드오프 (2026-06-24)

> **목적**: 내일(또는 다음 세션) 바로 이어서 작업할 수 있도록 오늘 한 작업·현재 상태·다음 할 일을 한 문서에 정리한 인수인계 문서.
> **상위/연관 문서**: `docs/PROJECT_HANDOFF_2026-06-23.md`(어제 핸드오프 = 프로젝트 철학·시스템·보안원칙 전체) · `docs/ORDERS_STATUS_AND_REVENUE_DESIGN.md`(오늘 작성, 주문 상태코드·매출·RevenueOrder 설계 근거) · `docs/PROJECT_STATE.md`(마스터) · `docs/EXECUTION_PLAN_2026-06-22.md`(8단계 로드맵).
> **프로젝트 철학·시스템 9탭·보안원칙은 어제 핸드오프(§1~3)를 그대로 따른다.** 이 문서는 그 위에 오늘 추가된 매출 파이프라인을 얹는다.

---

## 0. 한 줄 요약 (지금 어디까지 왔나)

**어제 완성한 Products READ v0를 기반으로, 오늘 `Orders → RevenueOrder(매출 분석 타입) → 가상 매출/재고 데이터 → 상품관리팀 대시보드 → 운영일지`로 이어지는 매출 파이프라인 한 줄기를 main + (프론트 전용) 검증 완료했다.** Navigation IA도 v1로 정리(운영 탭 + 관리자 설정 드롭다운). 전부 READ-only·키 격리 원칙 유지. main HEAD `84e129b`, working tree clean.

---

## 1. 어제(6/23) 종료 → 오늘(6/24) 시작 컨텍스트

* 어제 종료: Products READ v0(`Goods_Search.php`) real mode로 main + Production 검증 완료. main HEAD `11e1ff2`.
* 어제 제시한 다음 후보 ②(Inventory 파생)를 **크게 확장**해, 매출(Revenue) 도메인 전체를 신설하는 방향으로 진행했다.
* 어제 미완으로 남긴 `fix/lmstudio-connector`(LM Studio 커넥터 복구)는 **오늘 손대지 않음 — 여전히 미머지 대기**.

---

## 2. 오늘 신설된 매출 파이프라인 구조 (★핵심)

```
[고도몰 Order_Search.php] ─real─┐
                                ├─▶ godomallRevenue.ts (mapOrdersToRevenue / deriveOrderState / summarizeRevenue)
[syntheticRevenue.ts]  ─가상─┘        │  + Products 조인(buildProductIndex: goodsNo→productId)
                                       ▼
                          api/godomall/orders-revenue (GET, ?includeSynthetic)
                                       │  { mode, live, count, orders[], summary, stockImpact, errorMessage }
                                       ▼
                   src/services/departmentDataService.ts (fetchRevenue / fetchAdminOrders / fetchAdminProducts)
                                       │
                          ┌────────────┴─────────────┐
                          ▼                            ▼
            ProductTeamDashboard.tsx          CalendarPanel.tsx (운영일지)
            (상품관리팀 매출/재고 대시보드)     (날짜별 집계 · 월 KPI · 이슈 타임라인)
```

### 2-1. 표시용 vs 매출용 = 분리(A안) — 이게 중요
* **표시용**: `orders-admin` 라우트 + `StandardOrderAdmin`(lossy, 라인/코드/날짜 일부 버림). 기존 유지.
* **매출용**: `orders-revenue` 라우트 + `RevenueOrder`/`RevenueOrderLine`(헤더+라인 array 보존, 날짜필드 전체 보존). **신설.**
* 설계 근거·이유는 `ORDERS_STATUS_AND_REVENUE_DESIGN.md` §5. 안정화 후 B안(RevenueOrder를 canonical로 두고 admin을 projection으로 파생) 통합 검토는 TODO.

---

## 3. 오늘 추가/변경된 파일 맵

### 3-1. 서버 (`api/`) — 신규
* `api/godomall/orders-admin.ts` — 표시용 주문 조회 라우트(Orders READ v0).
* `api/godomall/orders-revenue.ts` — **매출 분석용 주문 조회**. `GET`, `?includeSynthetic=true`면 가상 데이터 포함(기본 false=실데이터만). 응답: `{ mode, live, count, orders, summary, stockImpact, errorMessage }`. **고객 PII 미포함, 키/raw XML 미반환, READ 전용.**
* `api/_shared/godomallRevenue.ts` — 매출 도메인 코어:
  * 타입: `RevenueDataSource('real_godomall'|'synthetic_test')`, `RevenueOrderState`, `RevenueOrderLine`, `RevenueOrder`, `RevenueSummary`, `ProductIndex`.
  * `deriveOrderState(order)` — **날짜필드 우선** 상태 파생(paid/shipped/delivered/confirmed/canceled). `o1`=미결제 보조. (설계 §3 규칙 구현체.)
  * `buildProductIndex(products)` / `mapOrdersToRevenue(...)` — `goodsNo→productId`(보조 `goodsCd→productCode`) 조인, 실패 시 uncategorized/unknown_product.
  * `summarizeRevenue(orders)` — 실/가상 동일 함수로 집계(상품매출/배송비/확정매출 등).
  * `isValidDate` / `normalizeLines`(orderGoodsData object|array → 항상 array).
* `api/_shared/syntheticRevenue.ts` — **가상 매출/재고 생성기 v0**:
  * 실제 Products(13개) 기반 6개월치 가상 주문을 **RevenueOrder와 동일 스키마**로 생성 → `summarizeRevenue` 그대로 재사용.
  * **결정적(seeded PRNG, `Math.random` 미사용)** — 같은 seed → 같은 데이터.
  * 상태는 날짜필드로 표현 → `deriveOrderState()`가 동일하게 해석.
  * `sourceType='synthetic_test'`, **고도몰 Write/주문생성 절대 안 함, PII 없음.**
  * **Synthetic Inventory Impact(`stockImpact`)**: 샘플몰의 임시 재고설정(stockEnabled=false/stock=0)을 따르지 않고 "재고가 6개월간 움직이는 가상 세계"를 만듦. 모든 상품 `tracked`, `initialStock=netSold+안전재고(20~80, 결정적)`, `projectedStock=initial−sold+restored(≥0)`. 샘플몰 원본은 `sourceStockEnabled/sourceStock`로 **참고만** 보존.

### 3-2. 서버 (`api/`) — 변경
* `api/_shared/godomallMapper.ts` — `mapOrderList`/주문 라인 매핑 등 보강(중첩 `orderInfoData`/`orderGoodsData` 실필드).
* `api/_shared/godomallResource.ts` — `resolveOrdersRevenue({includeSynthetic})` 오케스트레이터 추가(real/sandbox 호출 + 가상 병합 + summary/stockImpact 구성).

### 3-3. 프론트 (`src/`) — 신규
* `src/services/departmentDataService.ts` — 부서 대시보드 데이터 게이트웨이. `fetchAdminProducts()` / `fetchAdminOrders()` / `fetchRevenue(includeSynthetic=true)`.
* `src/components/DepartmentWorkspacePanel.tsx` + `.css` — '🗂️ 부서 업무 관장' 탭 셸(activeTab `department`).
* `src/components/ProductTeamDashboard.tsx` + `.css` — 상품관리팀 매출·재고 대시보드. `orders-revenue?includeSynthetic=true` 소비. 매출 추세/카테고리 도넛/랭킹 모달/공유 기간(range) 필터/공유 timeMode.

### 3-4. 프론트 (`src/`) — 변경 (주요)
* `src/App.tsx` — `activeTab`에 `'department'` 추가(전체: agents/office/logs/brain/studio/engine/data/api/calendar/department).
* `src/components/MainLayout.tsx` + `MainLayout.css` — **Navigation IA v1**: 운영 탭(오늘의 운영 / 부서 업무 관장 / AI 직원 / 운영일지)을 전면에, 관리/설정성 탭(data/api/logs/brain/studio/engine)은 **"관리자 설정" 드롭다운**(`ADMIN_NAV_GROUPS`, 외부클릭/ESC 닫기)으로 묶음. **라우팅 키/화면 동작은 그대로**, IA만 재배치.
* `src/components/CalendarPanel.tsx` + `.css` — 운영일지 매출 바인딩(§4 참조).
* `src/index.css` + 다수 `*.css` — **다크모드 테마 retheme: 네온그린 → teal/slate** (색상만, 레이아웃/구조 무변경).

---

## 4. 운영일지(Calendar) 매출 바인딩 — 가장 최근 작업 (18:21~19:45)

* `CalendarPanel`이 탭 진입 시 `fetchRevenue(true)` 1회 호출 → `orderDate(YYYY-MM-DD)`별 집계.
* **캘린더 셀 배지**: ORD(주문수) / ₩(상품매출 k) / STK(당일 거래 위험상품 수), 위험거래일 warning dot, 데이터 없는 날 빈 칸.
* **우측 일일 요약**: 상품매출/총주문금액/주문건수/배송비/판매수량/실제·가상/재고위험.
* **월간 KPI**: 데이터일수/월간총주문/월간총매출/재고위험(stockImpact 스냅샷). 고객문의·부정리뷰는 실데이터 없어 **0 placeholder(미연동)**.
* **운영 이슈·AI 활동 타임라인**(우측 메인): 매출·재고 기반 감지 이슈를 `[시각] 에이전트 / 설명`으로. 감지 규칙 = 재고주의 당일판매(danger)·카테고리 비중 50%+(warning)·최근7일 평균±30%·주문>0 매출0 등 이상치(danger). 안내문구: "실제 AI 실행 로그는 아직 연결 전 — 매출·재고 데이터 기반 감지".

---

## 5. 오늘(2026-06-24) 작업 로그 (커밋 순, 7개 블록)

1. `d7ea19a`/`740605b` **부서 업무 관장 탭 셸** 신설(Merge `feature/department-workspace-shell`).
2. `0b56b75`~`8bee446` **Orders READ v0(admin)** + 상품관리팀 대시보드 1차 연결. `Order_Search.php` 실연동, probe로 `data.return.order_data` 구조 실측 후 매핑, probe 라우트 머지 전 제거(Merge `feature/orders-read-v0`).
3. `8ab5f8b`/`ba7ab95`/`d093d5b` **설계 문서** — `o1=미결제` 확정 + 매출기준/할인/RevenueOrder 설계(`ORDERS_STATUS_AND_REVENUE_DESIGN.md`, Merge `chore/revenue-design-doc-update`).
4. `1fad437`/`463944a` **RevenueOrder/RevenueOrderLine v0 + orders-revenue 라우트(A안)** (Merge `feature/revenue-order-model`).
5. `54466ab`/`aab878d`/`bcd93a3`/`4901f57` **Synthetic Revenue Data v0** + Inventory Impact(`stockImpact`), 가상 재고를 "가상 세계"로(전량 추적, 실재고 reference)(Merge `feature/synthetic-revenue-data`).
6. `79b5060`/`b90021d` 상품관리팀 대시보드 ↔ `orders-revenue?includeSynthetic=true` 연결 → `2b79f0b`/`1c59569` polish → `770e2be` **teal/slate retheme**(색상만) → `1a69709`/`48b4875` 공유 기간 필터 + timeMode 통일 → `d8ba21f` **Navigation IA v1** (Merge `9d3e8d8` `feature/product-team-dashboard-polish`).
7. `6cb88c9`/`07e2521`/`9fc2eba`/`84e129b` **운영일지 매출 바인딩 v0** + 한글 셀 라벨 + 이슈 타임라인(Merge `feature/operation-calendar-revenue-binding`). **← 가장 최근.**

---

## 6. Git / 브랜치 상태 (2026-06-24 종료 시점)

* **main HEAD**: `84e129b` (origin/main 동기화 완료, working tree clean).
* **오늘 머지된 feature 브랜치**(머지 후 정리 가능): `feature/department-workspace-shell`, `feature/orders-read-v0`, `chore/revenue-design-doc-update`, `feature/revenue-order-model`, `feature/synthetic-revenue-data`, `feature/product-team-dashboard-polish`, `feature/operation-calendar-revenue-binding`.
* **확인 후 정리할 probe 브랜치**: `chore/orders-status-probe`(주문 상태 실측용, main 미머지 — 설계 근거 확보 후 정리).
* **여전히 미머지(어제부터)**: `fix/lmstudio-connector`(`c2a9937`) — LM Studio 로컬 검증/머지 대기.
* **Repo**: https://github.com/papa6229-beep/godo  ·  **Prod**: https://godo-psi.vercel.app

---

## 7. 내일 바로 시작할 수 있는 작업 후보 (우선순위 제안)

1. **매출 파이프라인 Production 실연동 확인** — orders-revenue가 real mode에서 실주문(현재 미결제 1건)으로 동작하는지, `?includeSynthetic` on/off 차이 눈 확인. (현재까지 검증은 프론트 stub 기준 — 어제 Products처럼 Production health/실응답으로 잠그기.)
2. **`goodsPrice` 단가 vs 라인합계 확정** — 수량 2개 이상 테스트 주문 1건 만들어 probe로 확인(설계 §4-1). 확정 전까지는 헤더 `totalGoodsPrice` 대조 기준 유지.
3. **비-`o1` 상태 코드 실값 잠그기** — 결제완료/배송/구매확정/취소 실주문 발생 시 동일 probe로 `ORDERS_STATUS_AND_REVENUE_DESIGN.md` §2 표 확정. 그 전까지 날짜필드 우선 규칙(§3) 신뢰.
4. **운영일지 0 placeholder 실연동** — 고객문의(Inquiries)·부정리뷰(Reviews) 라이브 연결(게시판은 `Board_List.php` 매핑 필요, 임의 endpoint 금지). AI 실행 로그 실연결.
5. **`fix/lmstudio-connector` 재개**(어제부터 보류) — LM Studio 켜고 로컬 `npm run dev`로 Gemma 연결테스트 검증 → 성공 시 머지.

> **할인/쿠폰/적립 전용 필드, 취소/환불 금액 표현 방식(원주문 갱신 vs 별도 레코드), Products 100개 초과 시 페이징** — 설계 §6 TODO. 해당 조건 발생 시 처리.
> **B안 통합**(RevenueOrder canonical, admin을 projection으로) — 매출 도메인 안정화 후 검토.

---

## 8. 작업 규칙 / 검증 (어제와 동일, 매 작업 공통)

* **검증 3종 필수**(커밋 전): `npm run lint` · `npx tsc --noEmit`(또는 `npm run build`) · `npm run build`.
* **브랜치 전략**: main 직접 작업 금지 → 작업별 브랜치(feat/fix/chore) → 검증 통과 → `--no-ff` merge → push. 작업 섞지 말 것.
* **커밋 메시지 말미**: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
* **고도몰/매출 작업 시 금지**: 임의 json endpoint 생성, Write API, mockProxyData 삭제, 키를 프론트/로그/응답에 노출. **가상 데이터는 고도몰 실주문/실재고에 절대 쓰지 않음(GODO 내부 전용).**
* **신규 세션 컨텍스트 복원**: 이 문서 + `docs/PROJECT_HANDOFF_2026-06-23.md`(철학·시스템·보안 전체) + `docs/ORDERS_STATUS_AND_REVENUE_DESIGN.md`(매출 설계 근거) 읽으면 됨.

---

*문서 끝. (작성: 2026-06-24)*
