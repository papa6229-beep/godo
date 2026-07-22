# RC-1 잔여 계약 대조 보고 — C-2 · C-3 · C-4 (2026-07-22)

> 상태: **검토용 — 소스 수정 시작 전.** 이 문서는 계약을 확정하기 위한 대조·의사결정 자료다.
> 근거: 현재 `main`(병합 `951881a`) 코드 재관측(초안 `CONTRACT_DRAFT_RC1_METRICS.md`는 기준선 `2d68505`라 줄번호·일부 서술이 이동 — 아래는 실측 정정본).
> 원칙: 이름이 같은 지표는 계산이 같아야 한다. 관점이 다르면 이름을 달리 한다. **임의로 하나로 합치지 않는다.**

---

## 요약 — 각 계약의 한 문장

- **C-2 매출 명명**: "매출"이라는 한 단어가 화면·엔진마다 (취소·미결제 포함 라인합) / (유효주문 정산액) / (라인합−클레임 근사) 세 가지를 가리킨다. **데이터가 실제 제공하는 값부터 확정**해야 한다.
- **C-3 재고 위험**: 같은 재고 수량이 화면마다 다른 위험 단계로 분류된다(경계 5 vs 20). 게다가 **두 개의 서로 다른 재고 유니버스**(합성 투영재고 / 상품별 `safetyStock`)가 화해 없이 공존한다. **구조(고정·상품별·판매속도)를 먼저 정한다.**
- **C-4 정규화 책임**: paid/canceled의 `bool()` 7변종은 매출 경로에서는 **잠재 결함**(이미 boolean). 진짜 **활성 결함은 문의 상태 파서 분기**(`analyticsQueryEngine`가 `=== 'unanswered'` 정확일치라 미답변 과소집계). 정규화는 C-2·C-3 의미 확정 뒤 **입력 경계**에서 한다.

---

# C-2. 매출 명명 계약

## (1) 현재 코드 정의와 불일치 지점

**`revenueMetricContract.ts`의 지표 종류 (실측 8종, 계산식)**

| kind | 라벨 | 계산식 | 비고 |
|---|---|---|---|
| `grossProductRevenue` | 상품매출 | 모든 주문(취소·미결제 포함)의 `Σ line.lineRevenue` | :57–61 |
| `netOrderRevenue` | 총매출 | 유효주문만 `Σ o.totalAmount` | :64–68 |
| `validOrderRevenue` | 유효 주문매출 | 계산 함수 없음, 설명이 "netOrderRevenue와 동일 기준" | :107–113 **← net과 중복** |
| `cancelledRevenue` | 취소 매출 | 라벨만, 계산 없음 | :114 |
| `refundedRevenue` | 환불 매출 | 라벨만, 계산 없음 | :121 |
| `orderCountAll` / `orderCountValid` | 총 주문 / 주문수 | 전체 / `isValidOrder` 필터 | :71,74 |
| `averageOrderValue` | 객단가 | `round(revenue/orderCount)` | :80 |

**핵심**: `totalAmount = settlePrice`(godomallRevenue:385) = `상품합 + 배송비 − 할인 − 리워드`. 즉 "총매출"은 **이미 할인·리워드 차감 후 + 배송비 포함** 금액이다. 이름("총매출")이 실제 값(정산액)과 다르다.

**불일치 실측 (라벨은 매출, 계산은 다른 개념)**

| # | 위치 | 라벨 | 실제 계산 | 문제 |
|---|---|---|---|---|
| M1 | `analyticsQueryEngine.ts:158` (계산 :271,:338) | `매출` | `productRevenueByLines` — **취소·미결제 포함** 라인합, `isValidOrder` 미적용 | "매출"인데 값은 주문발생금액. **개명 1순위** |
| M2 | `analyticsQueryEngine.ts:159` (계산 :451–467) | `순매출(라인매출-클레임)` | 취소포함 라인합 − 클레임액(v0 근사) | **초안이 "금지"한 `순매출/netRevenue`가 이미 라이브** |
| M3 | `productTeamChatFacts.ts:90` | (AI 프롬프트) `매출` | 전 주문 `Σ productRevenueByLines`, 취소 필터 없음 | 상품팀 AI가 취소포함 라인합을 "매출"로 서술 |
| M4 | `MarketingAnalysisDashboard.tsx:388` | `매출` 행 | 차트 시리즈 값(상단 기준 상이) | share/percent 차트에서 기준 불명 "매출" 노출 |
| M5 | `revenueMetricContract.ts:15–23` | net/valid/gross 3종 | net과 valid 동일 기준 중복 | "…매출" 3개 이름이 공존 |

## (2) 사용자 화면·AI 판단 영향

- **M1이 가장 크다**: 마케팅 채팅의 월별/결제수단별/채널별 매출, `revenueShare`, `salesGrowthRate`, `periodComparison`, `customerSegmentRevenue`가 전부 이 `revenue` 케이스(:412–449)를 공유 → **취소·미결제 라인합을 "매출"로 반환**. 성장률·비중도 그만큼 부풀려짐. 마케팅 대시보드의 "운영매출 88,116,982원"(유효주문 기준)과 **채팅 "매출"이 다른 정의**라 사용자가 두 숫자를 비교하면 어긋난다.
- **M2**: 사용자가 "순매출"을 물으면 (취소 미제외 라인합 − v0 근사 클레임)을 받는다. 반품·환불·정산을 반영한 것처럼 오해.
- **M3**: 상품팀 AI의 월별 매출 판단이 취소 물량만큼 상방 편향.

## (3) 권장 단일 계약 (초안)

1. **기본 "매출" = `validOrderRevenue`(유효주문 매출)** = 유효주문(결제완료·미취소) `Σ totalAmount`. net/valid/gross 3종을 **`validOrderRevenue` 하나로 통합**.
2. **주문 판매흐름·재고용 = `placedOrderAmount`(주문발생금액)** = 전 주문 라인합. 이름을 분리해 M1을 개명.
3. **"순매출"/`netRevenue`는 헤드라인으로 쓰지 않는다** — 아래 근거로 정직한 원천이 없다. 기존 M2 메트릭은 **유지할지/이름을 "라인매출−클레임(근사)"로 강등할지/숨길지**를 사장 판단으로 결정(현재 화면에 노출 중이라 임의 삭제 금지).
4. 결과에 **기준 문자열(basis)**을 남긴다: `{ metric:'validOrderRevenue', basis:'유효주문·정산액·배송비 포함' }`.

**데이터가 실제 제공하는 값 (사장님 지시대로 먼저 대조)**

| 개념 | 제공 형태 | 원천 |
|---|---|---|
| 실결제/정산액 | **원천 존재** | `settlePrice → totalAmount` |
| 상품 헤더합 | **원천 존재** | `totalGoodsPrice → productRevenueByHeader` |
| 배송비 | **원천 존재** | `totalDeliveryCharge → deliveryFee` |
| 할인(상품/회원/쿠폰) | **원천 존재(조건부)** | `total*DcPrice → discountSummary` (없을 수 있음) |
| 상품 라인합 | **파생(계산)** | `Σ 단가×수량 → productRevenueByLines` |
| 취소 | **원천 날짜 → 파생 bool** | `cancelDt → state.canceled` |
| 환불 | **약함** | `state.refunded`는 **하드코딩 false**(v0 미확정). 환불액은 `claimSummary.claimAmount`로만 존재 |
| 정산/순매출(환불 반영 순액) | **미존재** | 환불 차감 저장 필드 없음 |

## (4) 사장 판단 필요 항목 (C-2)

- **D2-a**: 마케팅 분석 "매출"의 의미 — **유효주문 매출(취소·미결제 제외)** 로 통일할지, 아니면 이름을 "주문발생금액"으로 바꿔 현행 값을 유지할지. (전자면 채팅의 모든 매출·성장률 숫자가 바뀐다.)
- **D2-b**: "매출"에 **배송비 포함** 여부. 현재 `totalAmount`는 배송비 포함. 사업 정의상 포함이 맞는지.
- **D2-c**: "매출"의 기준을 **할인 차감 후(정산액)** 으로 볼지, **할인 전 주문금액**으로 볼지. 현재 `totalAmount`는 할인·리워드 차감 후.
- **D2-d**: 기존 `netRevenue`(순매출) 메트릭 처리 — 유지/강등/숨김.

## (6) 실패 재현 · 완료 조건 (C-2)

- **RED**: 취소·미결제 주문이 섞인 고정 데이터셋에서 `analyticsQueryEngine`의 `revenue`가 유효주문 매출보다 크게(취소분 포함) 나오는 것을 하네스로 고정 → 현재 결함 재현.
- **완료**: `revenue`(또는 개명된 `placedOrderAmount`/`validOrderRevenue`)가 계약 정의와 정확히 일치, net/valid/gross 이름 정리, basis 문자열 노출, 지표 정합성 하네스에 T-C2 케이스 추가(fail 0), 채팅·대시보드 "매출" 숫자 일치.

## (7) 수정 예상 범위 / 범위 밖 (C-2)

- **범위**: `revenueMetricContract.ts`(이름 통합), `analyticsQueryEngine.ts`(M1/M2 라벨·기준), `productTeamChatFacts.ts`(M3), `MarketingAnalysisDashboard.tsx`(M4 라벨 basis).
- **범위 밖**: 실제 환불/정산 파이프라인 구현(원천 없음), `claimSummary` 기반 진짜 순매출 산출.

---

# C-3. 재고 위험 단계 계약

## (1) 현재 코드 정의와 불일치 지점

**유니버스 A — 합성 투영재고 `syntheticProjectedStock` (초안이 지목한 4화면)**

| 위치 | 경계 | 단계명 |
|---|---|---|
| `productTeamChatFacts.ts:409` | ≤0 / ≤5 / else | danger / warning / ok |
| `ProductTeamDashboard.tsx:589–590` | ≤20 / 21–40 | riskCount / warnCount |
| `departmentDataSourceOfTruth.ts:113` | ≤20 (단일) | riskyStockCount |
| `CalendarPanel.tsx:27` | =20 (단일) | riskGoods |

**유니버스 B — 상품별 `safetyStock` (초안에 없음, 별도 경로)**

| 위치 | 경계 | 산출 |
|---|---|---|
| `utils/dataNormalizer.ts:356+` | stock≤0 danger / stock≤safetyStock warning / 기본 safetyStock=5 | `status: ok\|warning\|danger` + riskFlags |
| `engine/nativeAgentRuntime/agentExecutor.ts:69` | `stock ≤ safetyStock` | 재고 에이전트 저재고 |
| 타입 `types/dataConnector.ts:56–64` | `StandardInventoryItem{stock, safetyStock, status}` | 상품별 표준형 |

**불일치**: 경고 경계가 **4배 차이**(채팅 5 vs 대시보드/스냅샷/캘린더 20). 밴드 수도 다름(3/3/2/2). 두 유니버스는 서로 참조하지 않음(A는 `safetyStock` 무시, B는 투영재고 무시). `policyVersion`·판정근거 객체·`soldOut/urgent/normal` 단계명은 **어디에도 없음**(초안 제안은 아직 미구현).

## (2) 사용자 화면·AI 판단 영향

- 투영재고 8인 상품: 채팅은 **정상(ok, ≤5 경고)**, 대시보드·캘린더는 **위험(≤20)**. 30인 상품: 채팅·스냅샷 정상, 대시보드 **주의(21–40)**.
- AI 근거 분리: 상품팀 채팅 AI는 ≤5 기준(`productTeamChatFacts`), 운영/보고 AI는 ≤20 `riskyStockCount`(`departmentDataSourceOfTruth`)를 먹는다 → **"위험 상품 몇 개?"의 답이 소스마다 다름**.
- 판정근거 미표기라 사용자가 불일치를 화면에서 조정할 근거가 없음.

## (3) 권장 단일 계약 (초안)

1. **판정을 한 순수 함수에 격리** → `{ level, threshold:{min,max}, policyVersion }` 반환. 호출부는 단계·근거만 소비. 화면 표기: `재고 상태: 주의 · 기준 6~20개 · 정책 demo-default-v1`.
2. **구조 선택은 사장 판단**(아래 D3-a). 권장: **1단계로 고정 단계형 `demo-default-v1`** 을 4화면에 통일(즉시 불일치 해소), 함수 격리로 뒤에 **판매속도(잔여일)** 로 교체 가능하게. 상품별 정책은 이미 `safetyStock`(유니버스 B)로 존재하므로 중간 옵션으로 승격 가능.

**구조별 데이터 가용성**

| 구조 | 가용성 | 근거 |
|---|---|---|
| (a) 고정 단계형 | **즉시 가능** | `StockImpactItem.syntheticProjectedStock` |
| (b) 상품별 정책 | **부분 존재(경로 다름)** | `safetyStock` 있으나 위험화면(유니버스 A)엔 미연결. `StockImpactItem`엔 `safetyStock` 필드 없음 → 배관 필요 |
| (c) 판매속도/잔여일 | **입력만 존재, 계산 없음** | `syntheticSoldQuantity`·라인 `quantity`+`orderDate`로 산출 가능. 현재 velocity는 에이전트 카피/목데이터로만 등장(미배선) |

## (4) 사장 판단 필요 항목 (C-3)

- **D3-a**: 구조 — 고정 단계형 / 상품별 정책(`safetyStock`) / 판매속도(잔여일) 중 택. (즉시 통일=고정, 정확도=판매속도.)
- **D3-b**: 경계 수치(품절0 / 긴급≤5 / 주의≤20 등)가 사업 기준으로 타당한지.
- **D3-c**: 유니버스 A(투영재고)와 B(`safetyStock`)를 **통합할지, 용도 분리 유지**할지.
- **D3-d**: 단계 명칭 어휘(현행 danger/warning/ok vs 초안 soldOut/urgent/warning/normal).

## (6) 실패 재현 · 완료 조건 (C-3)

- **RED**: 재고 8·30 같은 고정 상품이 채팅/대시보드/스냅샷/캘린더에서 **서로 다른 단계**로 분류됨을 하네스로 고정.
- **완료**: 네 소비자가 **동일 판정 함수**를 통해 같은 재고에 같은 단계를 반환, 결과에 `threshold`·`policyVersion` 포함, 화면 근거 표기, 회귀 하네스에 "동일 재고 → 동일 단계" 가드 추가(fail 0).

## (7) 수정 예상 범위 / 범위 밖 (C-3)

- **범위**: 신설 판정 함수 + 위 4화면 호출부 교체, `StockImpactItem`에 판정결과/근거 필드.
- **범위 밖**: (a) 선택 시 판매속도 계산 구현, 유니버스 B 리팩터, `safetyStock` 정책 UI.

---

# C-4. 정규화 책임 계약

## (1) 현재 코드 정의와 불일치 지점

**`bool()`/`boolv()` 변종 (실측 7개 — 초안 6개 + 신규 1)**

| 위치 | 허용 truthy | 비고 |
|---|---|---|
| `revenueMetricContract.ts:38` | true,'true','y',1 | 'Y' 없음 |
| `marketingAnalysisFacts.ts:231` | true,'true','y',1 | hasCoupon 전용 |
| `marketingIntelligencePlanner.ts:155` | true,'true','y',1 | |
| `marketingScopeInsightEngine.ts:109` | true,'true','y',1 | |
| `marketingAnalysisExecutor.ts:52` | true,'true','**Y**','y',1 | 'Y' 포함 |
| `departmentDataService.ts:68` | true,'y','**1**','true' | '1' 포함, 'Y' 없음 |
| **`marketingTemporalCrosstab.ts:158`** | true,'true','y',1 | **초안 누락분** |
| `firstPurchaseContract.ts:44` | 'y','Y' → first / 'n','N' → repeat / else unknown | **정본(canonical) — 유일하게 대소문자+unknown 모델** |

→ 'Y' 수용은 executor·firstPurchaseContract만, '1'은 departmentDataService만. **공용 헬퍼 없음.**

**`isValidOrder`(paid&&!canceled)**: 정본 `revenueMetricContract.ts:46`. `marketingAnalysisFacts.ts:281`은 **정본에 위임**(초안 서술 과장 — 이 파일은 이미 중앙화). `scopeInsight:113`·`planner:160–161`·`temporalCrosstab:181–182`는 각자 인라인 재구현.

**문의 상태 파서 (3개 상이 스킴)**

| 위치 | 매핑 | 대상 |
|---|---|---|
| `csTeamDashboardFacts.ts:83`, `departmentChatFacts.ts:83` | `/unanswered\|pending\|open\|미답변\|needs_human/i` | 미답변 계열 |
| `csTeamDashboardFacts.ts:320`, `csDashboardStatistics.ts:34`, `departmentDataSourceOfTruth.ts:76` | `/answered\|답변완료\|처리완료\|resolved\|closed\|done/i`, 그 외 미해결 | 답변 계열 |
| **`analyticsQueryEngine.ts:590`** | **`status === 'unanswered'` 정확일치** | **리터럴만 — 이상치** |

→ 정본 5종(open/in_progress/answered/closed/unknown) 구현체 없음. `in_progress` 미표현, `hold/보류`는 CS 통계에만 있는 사실상 4번째 상태, `closed`는 answered에 흡수.

## (2) 사용자 화면·AI 판단 영향

- **활성 결함**: `analyticsQueryEngine:590`이 `=== 'unanswered'`라, 상태가 `pending`/`open`/`미답변`/`needs_human`인 문의를 **미답변으로 세지 않음** → 마케팅 분석 채팅의 `unansweredInquiryCount`가 CS 대시보드·source-of-truth보다 **과소집계**. 같은 문의 집합에 "미답변 몇 건?"의 답이 화면마다 다름.
- **잠재(매출 경로)**: paid/canceled `bool()` 변종은 이미 boolean을 받으므로 현재 오작동 아님(아래 (판정)).

## (판정) bool() = 매출 경로에서 잠재 결함 (초안 확인)

`deriveOrderState`(godomallRevenue:189–203)가 실제 boolean 반환 → 실·합성 모두 동일 `mapOrdersToRevenue` 통과(:355 / synthetic :504) → JSON boolean 직렬화 → `fetchRevenue`의 `bool()`은 항등(departmentDataService:434–437) → 계산 모듈은 boolean 수령. **따라서 raw `'Y'/'N'`를 보는 지점이 없다 → 잠재.** 제거/중앙화는 안전하나, **모든 진입점이 canonical boolean으로 잠긴 것을 확인한 뒤** 하고, 어댑터 하나 고쳤다고 소멸 보고하지 않는다.

**단, 활성 raw-string 위험 1건**: `departmentDataService.ts:81–82` `fetchAdminProducts`의 `bool(r.stockEnabled)`·`bool(r.soldOut)`는 **raw `/api/godomall/products`** 를 읽고 `bool`이 'Y'를 빠뜨림 → 고도몰이 대문자 'Y'를 보내면 false 오독(매출 경로 아님, 상품 재고 표시 경로).

## (3) 권장 단일 계약 (초안)

1. **입력 경계(어댑터)에서 정규화**: paid/canceled → boolean, 문의 상태 → canonical status. 계산 모듈은 canonical만 소비.
2. **canonical 상태 어휘 확정 후** 각 파서를 그 표로 대체. 활성 결함(`analyticsQueryEngine:590`)을 우선 교정.
3. `bool()` 변종은 공용 정본 헬퍼(예: `firstPurchaseContract` 방식)로 수렴하되 **매출 경로는 잠재라 진입점 잠금 확인 후** 정리.
4. `fetchAdminProducts`의 'Y' 누락은 어댑터 경계에서 canonical bool 적용(작은 독립 패치 후보).

## (4) 사장 판단 필요 항목 (C-4)

- **D4-a**: canonical 문의 상태 어휘 — 초안 5종(open/in_progress/answered/closed/unknown)이 맞는지, `hold/보류`·`needs_human`을 정식 상태로 포함할지.
- **D4-b**: 실제 고도몰/합성 문의 **원시 상태값 전체 목록** 확인(초안 미해결#2) — 실데이터 확인 후 매핑표 확정.
- **D4-c**: 고도몰 paid/취소 원시 표기('Y'/'N' 여부) 실데이터 확인(초안 미해결#1) — bool 제거 안전성 최종 확인용.

## (6) 실패 재현 · 완료 조건 (C-4)

- **RED**: `pending`/`open`/`미답변`/`needs_human` 문의가 섞인 데이터셋에서 `analyticsQueryEngine`의 미답변수 ≠ `csTeamDashboardFacts` 미답변수임을 하네스로 고정.
- **완료**: 모든 상태 소비자가 어댑터가 부여한 canonical status만 읽어 미답변수 일치, `bool()`는 진입점 잠금 확인 후 공용 헬퍼로 수렴(잠재 제거는 별도 확인 커밋), 회귀 하네스에 "엔진 간 미답변수 동일" 가드(fail 0).

## (7) 수정 예상 범위 / 범위 밖 (C-4)

- **범위**: 어댑터(godomallRevenue/synthetic/departmentDataService) 상태·bool 정규화, 상태 파서 8지점 통일, `fetchAdminProducts` bool.
- **범위 밖**: 존재하지 않는 CSV/파일 어댑터 신설, 진입점 미확인 상태의 `bool()` 물리 삭제, 계산 엔진 내부 임시 보정 추가(**금지**).

---

# (5) 세 항목 의존관계 · 권장 작업 순서

```
C-2(매출 의미) ─┐
                 ├─→ C-4(입력 경계 정규화: 확정된 의미를 canonical로)
C-3(위험 의미) ─┘
        │
        └─ C-4의 '문의 상태 파서'만은 C-2/C-3와 무관한 독립 활성결함
```

- **C-4는 C-2·C-3에 의존**한다(무엇을 canonical로 정규화할지는 매출·재고 의미가 정해져야 함). 사장님 지시와 일치.
- 단 **C-4의 문의 상태 파서 교정은 독립적**이고 유일한 **활성** 결함이라, 원하면 **선행 독립 슬라이스**로 뽑을 수 있음.

**권장 순서**
1. **C-2** (가장 사용자 노출·M1 활성 인플레이션) — 의미 확정 → 개명 → 분석 "매출" 교정.
2. **C-3** (C-2와 독립) — 판정 함수 격리로 4화면 통일. 구조 결정 필요.
3. **C-4** — C-2·C-3 확정 의미를 어댑터에서 canonical화(잠재 bool 정리 포함). **문의 상태 파서(활성)** 는 필요 시 1~2 전 어느 시점에 독립 착수 가능.

각 단계는 **실패 재현(RED) → 최소 수정(GREEN) → 지표 정합성/전체 스모크/tsc·build/신규 lint 0/제어문자 가드 → 별도 커밋** 순서를 지킨다(C-10 편집 규칙 준수).

---

# 미해결 (계약 확정 전 실데이터 확인 필요)

1. 고도몰 `Order_Search` paid/취소 원시 표기 ('Y'/'N' 여부) — bool 제거 안전성.
2. 문의 원시 상태값 전체 목록 — canonical 매핑표.
3. 재고 단계 경계(5/20)의 사업적 타당성 — 운영 판단.
4. "매출"의 배송비 포함·할인 차감 기준 — 사업 정의(D2-b/c).
