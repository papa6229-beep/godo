# SIMULATION-CATALOG-BASELINE-01 D-1.2 — 취소·반품·환불 의미 계약 RED 진단

- 날짜: 2026-07-25
- 브랜치: `fix/simulation-catalog-baseline-01-red` · 기준 HEAD: `c6548d1`
- 성격: **진단 전용. 제품 소스 변경 0.** RED 검사(`scripts/smoke-simulation-catalog-baseline-d12-claim-semantics-red-v0.mjs`) + 본 문서만 추가.
- 실행 근거: 아래 수치는 모두 현재 제품 함수를 직접 실행해 관측(추측 아님).

## 0. 확정 업무 기준(사장 지시)

- **취소** = 발송 전 주문 중단. **반품 건수에 미포함.**
- **반품** = 발송 후 고객 반환. **접수 시점부터 "반품 접수 1건".** 이후 회수·입고·검수·환불 승인/거절은 별도 단계. **반품 접수만으로 환불 완료 단정 금지.**
- **환불** = 실제 돈을 돌려준 금융 결과. 결제취소의 발송 전 환불완료 포함. 반품은 **검수 후 환불완료만** 포함. claim 요청금액을 실제 환불금액으로 추측 금지. **미결제취소·환불대기·환불거절 제외.**
- **정본/커스텀 분리**: 원본 사건 종류·실제 상태는 정본(불변). CS팀장은 어떤 지표를 우선 "표시"할지만 설정. 취소↔반품, 미환불↔환불완료로 **바꾸는 커스텀 불가.**

---

## 1. 현재 데이터 모델과 상태 어휘

### 1.1 계층 (2단 손실 파이프라인)

| 계층 | 타입 | 취소/반품/환불 표현 |
|---|---|---|
| RAW (고도몰 스펙 미러) | `GodomallRawOrderData` / `GodomallRawClaimData` (`api/_shared/godomallOrderTypes.ts`) | **완전**. orderStatus 코드 + claimData(handleMode·handleCompleteFl·handleDt·refundPrice…) |
| 파생 (분석 계약) | `RevenueOrder{ state, claimSummary }` (`api/_shared/godomallRevenue.ts`) | **손실**. state.refunded/returned 항상 false, claimSummary={hasClaim,claimTypes[],claimAmount} |
| 소비 (부서 대시보드) | `RevenueOrderLite{ paid,unpaid,confirmed,canceled, claim{hasClaim,claimTypes[],claimAmount} }` (`src/services/departmentDataService.ts:260,441`) | **추가 손실**. shipped/delivered/refunded/returned 전부 탈락 |

### 1.2 RAW 어휘 — 필요한 것은 이미 다 있다 (`godomallOrderCodes.ts`)

- **orderStatus**: `o1 입금대기·p1 결제완료·g1~g4 준비/발주/입고/출고·d1 배송중·d2 배송완료·s1 구매확정·c1~c4 취소(자동/품절/관리자/고객)·f1~f4 결제실패·b1 반품접수·b2 반송중·b3 반품보류·b4 반품회수완료·e1~e5 교환·r1 환불접수·r2 환불보류·r3 환불완료·z1~z5 추가`
  - **출고 판별**: `g4 상품출고`/`d*`(발송 후) ↔ `o/p/g1~g3`(발송 전) 구분 가능.
  - **반품 단계**: `b1 접수 → b2 반송중 → b3 보류 → b4 회수완료`.
  - **환불 단계**: `r1 접수 → r2 보류 → r3 완료`.
- **claimData.handleMode**: `r 환불접수·b 반품접수·e 교환접수·z 교환추가·c 취소`.
- **claimData.handleCompleteFl**: `y=환불완료 · n=환불접수` ← **환불 완료 여부 필드 존재**.
- **claimData.handleDt**(처리완료일자), **refundPrice**(결제 환불금액), refundUseDeposit/Mileage/DeliveryCharge/Charge(세부 환불) ← 실제 환불 근거 필드 존재.

### 1.3 파생/소비 계층이 실제로 하는 매핑 (`godomallRevenue.ts`)

- `deriveOrderState`: `paid=paymentDt유효&&status≠o1`, `canceled=cancelDt유효`, `shipped=invoiceDt||deliveryDt`, `delivered=deliveryCompleteDt`, `confirmed=finishDt`. **`refunded=false`, `returned=false` 하드코딩**(주석 "v0 미확정").
- `deriveClaimSummary`: `CLAIM_MODE_MAP={c:cancel,r:refund,b:return,e:exchange,z:exchange}`로 handleMode→claimTypes. **헤더 cancelDt 유효 시 'cancel' 강제 추가.** `claimAmount = Σ refundPrice`(**handleCompleteFl 무관·완료여부 무시**).
- **미참조(전량 폐기)**: `handleCompleteFl`, `handleDt`, `refundUseDeposit/Mileage/DeliveryCharge/Charge`, orderStatus `r3`, 반품 단계 `b1~b4`, 교환 차액 `exchageInfoData`.

### 1.4 존재/부재 단정

| 개념 | RAW | 파생/소비 |
|---|---|---|
| 환불 완료 여부(refundStatus 등) | 있음(handleCompleteFl) | **없음**(폐기) |
| 환불 완료 시각(refundedAt 등) | 있음(handleDt) | **없음**(폐기) |
| 실제 환불 완료금액(요청과 분리) | 있음(refundPrice+완료여부) | **없음** — `claimAmount`(요청/기재) 단일 |
| 반품 처리 단계 | 있음(b1~b4) | **없음** — `'return'` 토큰 1개 |
| 교환 | 있음(e1~e5·차액) | 토큰 `'exchange'`만 |
| 발송 전/후 | 있음(g4/d*) | state엔 shipped/delivered 있으나 **RevenueOrderLite에서 탈락** |
| `claimCompletionStatus` | — | **타입/필드로 존재 안 함**(주석·`=false` 상수·"미확정" 문자열뿐, `csDraftComposer.ts`) |

---

## 2. 취소·반품·환불 계산 경로 전수

| 지표 | 위치 | 판정식 | 문제 |
|---|---|---|---|
| cancelledOrders | `departmentDataSourceOfTruth.ts:111` | `orders.filter(o.canceled)` | canceled=cancelDt유효. 취소claim(claimTypes)은 무시. 반품/환불도 cancelDt로 canceled=true라 섞임 |
| returnedOrders | `departmentDataSourceOfTruth.ts:113` | `claimTypes.some(/refund\|return\|cancel\|환불\|반품/i)` | **취소·환불까지 포함**. 이름과 의미 불일치 |
| refundedRevenue | `departmentDataSourceOfTruth.ts:117` | `Σ claimAmount where claimTypes.some(/refund\|return\|환불\|반품/i)` | **완료여부 무시**. 요청금액(claimAmount) 합산. cancel만 제외(returnedOrders와 정규식 불일치) |
| claimAmount(원천) | `godomallRevenue.ts:340` | `Σ refundPrice`(완료무관) | 요청금액. 실제환불 아님 |
| netRevenue(별도) | `analyticsQueryEngine.ts:466` | 라인매출 − `claimAmount` **타입무관 전액** | 취소·교환 claim까지 순매출 차감 |
| claimAmount 메트릭 | `analyticsQueryEngine.ts:519` | `Σ claim.claimAmount`(타입무관) | 취소/교환 포함 |
| cancelRate/refundRate/returnRate/exchangeRate | `analyticsQueryEngine.ts:508`, `syntheticCommerceFacts.ts:82` | `claimTypes.includes(t)` 정확일치 | 타입 분리(정상). 단 헤더 cancelDt로 refund/return에 cancel이 붙어 cancelRate 과대 |

**정규식/조건 불일치 (동일 의미 제각각 판정)**

| 경로 | 판정 | cancel | i·한글 |
|---|---|---|---|
| `departmentDataSourceOfTruth.ts:113` returnedOrders | `/refund\|return\|cancel\|환불\|반품/i` | 포함 | O |
| `departmentDataSourceOfTruth.ts:117` refundedRevenue | `/refund\|return\|환불\|반품/i` | 제외 | O |
| `csCustomerManagementFacts.ts:140` / `csTeamDashboardFacts.ts:768` refundCancelCount | `/refund\|cancel\|return/ \|\| o.canceled` | 포함 | **X**(한글·대문자 누락) |
| `analyticsQueryEngine.ts:569` / `syntheticCommerceFacts.ts:124` refundRisk | `t==='refund'\|\|t==='return'` | 제외 | X |
| `csInquiryOrderGrounding.ts:267` | `includes('cancel'/'refund'/'return'/'exchange')` 개별 | 구별 | X |
| `godomallRevenue.ts:327` 원천 | handleMode 코드맵 + cancelDt→cancel | 구별(단 강제 cancel) | 코드 |

→ 같은 파일 안에서도(returned vs refunded) cancel 포함/제외가 다르고, `i`/한글 플래그가 제각각.

---

## 3. 소비자 전수

- **snapshot 필드(cancelledOrders/returnedOrders/refundedRevenue)**: 실제 UI/AI **미소비**(감사/스모크만). 소비자 3곳(`ProductTeamDashboard.tsx:561`, `MarketingAnalysisDashboard.tsx:750`, `agentTaskRunner.ts:57`)은 operational/productUniverse/csUniverse만 읽음. → **오집계가 아직 화면엔 안 뜨나 정본 스냅샷엔 존재**.
- **AI facts로 실제 노출되는 경로**:
  - `analyticsQueryEngine`(netRevenue·claimAmount·각종 Rate) → `departmentFactsRouting.ts:119` (claimRate·refundRate 팩) → 팀 채팅 AI.
  - `csCustomerManagementFacts.ts:140` refundCancelCount, `csTeamDashboardFacts.ts:768` refundCancelCount → CS 대시보드/프로필 facts.
  - `departmentChatFacts.ts:127` claimAmount 문자열, `csInquiryOrderGrounding.ts:275` claimSummary → 채팅/그라운딩.
- **표시 라벨**: `csDashboardStatistics.ts:40`('환불/취소'), `csTeamDashboardFacts.ts:366`('환불·취소'), `CLAIM_KO`(refund:환불/cancel:취소/return:반품/exchange:교환).

---

## 4. 현재 실제 오집계 값 (제품 함수 직접 실행)

### 4.1 claim 변형 6건 (RED 스모크 fixture)

| 지표 | 값 | 의미 |
|---|---|---|
| cancelledOrders | 1 | `o.canceled` 플래그만. 취소claim(플래그 없음)은 미포함 |
| returnedOrders | 5 | 취소·환불·반품 claim 전부(교환 제외) |
| refundedRevenue | 30,000 | 환불10000+반품8000+**환불대기12000**(완료무관 합산). cancel/exchange 제외 |

### 4.2 현재 가상 2년치 universe (1,315주문, 실측)

| 항목 | 값 |
|---|---|
| 실제 종류별 (claimTypes) | 취소 81 · 환불 24 · 반품 20 · 교환 12 (claim 보유 93건) |
| 그 중 cancel+refund/return 이중태그 | **44건** (환불/반품이 헤더 cancelDt로 'cancel'까지 획득) |
| state.refunded / state.returned | **0 / 0** (하드코딩 false) |
| **cancelledOrders (현재식)** | **81** (실제 순수취소는 37건 — 44건은 반품/환불) |
| **returnedOrders (현재식)** | **81** (실제 반품은 20건 — **61건 과다계상**) |
| **refundedRevenue (현재식)** | **3,051,446원** (환불1,685,274+반품1,366,172, 요청금액·완료무관·반품접수 포함) |

→ 오늘의 데이터에서 이미 **반품 20건이 81건으로, 환불금액이 미완료·반품접수분까지 305만원으로** 잘못 집계됨.

---

## 5. 기존 88,116,982원(운영 순매출) 영향 여부

- **직접 영향 없음**: net(operationalRevenue) = `computeNetOrderRevenue`(유효주문=paid&&!canceled의 totalAmount)로, **claimAmount/refundedRevenue를 읽지 않는다.** claimAmount를 바꿔도 net 불변(RED F7로 실증). 현재 net = **88,116,982** 재확인.
- **간접 결합(결정 필요)**: 반품/환불 주문이 생성기에서 cancelDt를 받아 **canceled=true → 유효주문에서 제외**되어 있다. 해당 주문 **44건(전부 paid), totalAmount 합 3,016,404원**. 반품을 취소와 분리해 이들을 net에 재진입시키면 net이 **88,116,982 → 최대 91,133,386원**으로 바뀔 수 있다. → 사용자 결정 필요(§8-1).

---

## 6. 11개 시나리오 표현 가능성

건수 열: 취소 / 반품접수 / 실제환불완료건 · 금액. 반품단계·환불상태는 현재 모델 표현 여부.

| # | 시나리오 | 취소 | 반품접수 | 현재 반품단계 | 환불완료 건·금액 | 운영순매출 영향 | 현재 표현 | 누락 최소 근거 필드 |
|---|---|---|---|---|---|---|---|---|
| 1 | 미결제 발송전 취소 | 1 | 0 | — | 0 (환불 불요) | 없음(paid=false 이미 제외) | △ 취소는 O, "환불 불요"를 완료금액과 구별 못함 | refundStatus=`none` |
| 2 | 결제후 발송전 취소·환불대기 | 1 | 0 | — | 0 (대기) | 제외(canceled) | ✗ 대기/완료 구별 불가 → refundedRevenue에 요청액 합산 | refundStatus=`pending`, completedRefundAmount |
| 3 | 결제후 발송전 취소·환불완료 | 1 | 0 | — | 1 · =환불액 | 제외(canceled) | ✗ 완료 표현 필드 없음 | refundStatus=`completed`, completedRefundAmount, refundedAt |
| 4 | 발송후 반품 요청 접수 | 0 | 1 | 접수 | 0 | (현재)취소로 제외 | ✗ 반품이 취소로 뭉침, 접수단계·미완료 표현 불가 | eventKind=`return`, returnStage=`received`, shipped, refundStatus=`pending` |
| 5 | 상품 회수 중 | 0 | 1 | 회수중 | 0 | 〃 | ✗ 단계 없음 | returnStage=`collecting` |
| 6 | 창고 입고·검수 대기 | 0 | 1 | 입고/검수 | 0 | 〃 | ✗ 단계 없음 | returnStage=`warehoused`/`inspecting` |
| 7 | 검수후 환불승인·환불대기 | 0 | 1 | 승인 | 0 (대기) | 〃 | ✗ 승인/대기 없음 | returnStage=`approved`, refundStatus=`pending` |
| 8 | 환불 완료 | 0 | 1 | 완료 | 1 · =실제액 | 결정 필요 | ✗ 완료여부·완료액·완료일 없음 | refundStatus=`completed`, completedRefundAmount, refundedAt |
| 9 | 환불 거절(사용·훼손) | 0 | 1 | 거절 | 0 | 〃 | ✗ 거절 상태 없음(handleCompleteFl 항상 y) | refundStatus=`rejected`, returnStage=`rejected` |
| 10 | 반품 없이 부분 환불 | 0 | 0 | — | 1 · =부분액 | 결정 필요 | ✗ 부분·완료 구별 불가 | eventKind=`refund_only`, refundStatus, completedRefundAmount |
| 11 | 교환 요청·완료 | 0 | 0 | (교환) | 0 (차액 별도) | 포함(canceled 아님) | △ 토큰만, 요청/완료·차액 구별 불가 | exchangeStage(요청/완료), 교환 차액 |

현재 **명확히 표현 가능한 시나리오는 0개**(취소 자체 건수만 부분적으로). RAW에는 근거가 있으나 파생/소비 계층에서 전량 폐기됨.

---

## 7. 최소 GREEN 예상 (아직 미구현 — 새 거대 시스템 금지, 기존 타입에 사실만 추가)

필드명·상태어휘는 **RAW 스펙(godomallOrderCodes)에 이미 있는 것**만 승격. 임의 별칭 추가 안 함.

### 7.1 타입에 추가할 최소 사실
- `RevenueClaimSummary`(`godomallRevenue.ts`) + `RevenueOrderLite.claim`(`departmentDataService.ts`)에:
  - `eventKind: 'cancel' | 'return' | 'exchange' | 'refund_only'` — 원본 사건 **단일 분류**(handleMode 기반, cancelDt 강제 cancel 제거). 다중 토큰 중복 종식.
  - `refundStatus: 'none' | 'pending' | 'completed' | 'rejected'` — `handleCompleteFl`(+orderStatus r3/거절)에서 파생.
  - `completedRefundAmount?: number` — `refundStatus==='completed'`일 때의 `refundPrice`(요청 claimAmount와 분리).
  - `refundedAt?: string` — `handleDt`.
  - (2단계) `returnStage?: 'received'|'collecting'|'warehoused'|'inspecting'|'approved'|'rejected'|'completed'` — orderStatus `b1~b4`.
- `RevenueOrderLite`에 `shipped`/`delivered` 승격(state에 이미 존재, 탈락만 중단) — 발송 전/후 근거.

### 7.2 집계 GREEN (`departmentDataSourceOfTruth.ts`)
- `cancelledOrders` = `eventKind==='cancel'` (발송 전 취소).
- `returnReceivedOrders` = `eventKind==='return'` (접수 시점 1건). ← `returnedOrders` 이름·의미 정정, cancel 제외.
- `refundedRevenue` = `Σ completedRefundAmount where refundStatus==='completed'`. (요청·대기·거절 제외)
- (선택) `pendingRefundRevenue`, `returnStageBreakdown` — 대시보드 표시용.

### 7.3 함께 고쳐야 하는 곳
- `godomallRevenue.ts` `deriveClaimSummary`/`deriveOrderState`: handleCompleteFl·handleDt·refundPrice·handleMode·orderStatus로 위 필드 파생. **cancelDt→'cancel' 강제 추가 제거**(반품/환불 오염 원인).
- 생성기 `syntheticCommerceUniverse.ts`/`syntheticGodomallOrders.ts`: 반품/환불에 cancelDt 세팅 중단(취소와 분리), `handleCompleteFl` 항상 'y' → 대기/완료/거절 다양화, 반품 단계 코드 생성.
- 소비자 정규식 통일: `csCustomerManagementFacts.ts:140`, `csTeamDashboardFacts.ts:768`, `analyticsQueryEngine.ts:466/508/519/569`, `syntheticCommerceFacts.ts:82/124` → 공통 predicate(eventKind/refundStatus) 사용.
- **`c6548d1` D-1.1 스모크**: 현재 잘못된 의미(returnedOrders에 cancel 포함, refundedRevenue 완료무관 합산)를 기대값으로 잠갔으므로, GREEN 시 정정 필요. (지금은 증거로 보존)

### 7.4 최소 GREEN 대상 파일(예상)
`api/_shared/godomallRevenue.ts`, `src/services/departmentDataService.ts`, `src/services/departmentDataSourceOfTruth.ts`, `api/_shared/syntheticCommerceUniverse.ts`(+`syntheticGodomallOrders.ts`), 소비자 4~5곳, 그리고 검사 갱신(`smoke-...-d11...`, `smoke-...-d12...`). 신규 대형 모듈 없음 — 기존 타입 필드 추가가 핵심.

---

## 8. 정본 영역 vs CS팀장 커스텀 영역 경계

- **정본(불변, 데이터가 결정)**: `eventKind`(취소/반품/교환), `refundStatus`(대기/완료/거절), `returnStage`, `completedRefundAmount`, `refundedAt`. CS팀장이 취소↔반품, 미환불↔환불완료로 **바꿀 수 없음**.
- **커스텀(표시 설정만)**: 대시보드에서 "반품 접수/회수 중/입고/검수/환불 완료" 중 **어떤 지표를 우선 표시**할지 선택. 정본 사건·상태는 그대로, 뷰(정렬·강조·기본 카드)만 사용자 설정. → 표시 설정은 별도 preference로 저장, 집계 함수는 정본만 계산.

---

## 9. 추가로 사용자(사장) 결정이 필요한 항목

1. **반품/환불 주문의 순매출 취급**: 현재 취소로 묶여 net에서 제외(88,116,982). 반품을 분리하면 44건·3,016,404원이 net 재진입 → 최대 91,133,386. "발송된 반품 주문을 환불 완료 전까지 매출로 볼지, 반품 접수 즉시 뺄지" 결정.
2. **반품 단계 세분 수준**: v0에서 접수/완료 이진만 먼저 도입 vs 회수/입고/검수/거절까지 전 단계.
3. **부분 환불(반품 없이, 시나리오10)** 표현 우선순위.
4. **교환 차액(exchageInfoData)** 매출 반영 여부.
5. **미결제 취소**를 `refundStatus='none'`(환불 불요)로 명시할지.
6. 실제 고도몰 미연동 상태(현재 전부 synthetic)이므로, 실연동 시 orderStatus 코드 관측값으로 파생 규칙 확정 필요(현재는 스펙 기준).

---

## 부록: 관련 후속

- 기존 lint 1건(`scripts/flowRouteSmoke.ts:49` no-explicit-any)은 이번 작업과 무관하며 **`LINT-FLOWROUTE-01`** 별도 후속으로 기록만 유지(이번 커밋에 미포함).
