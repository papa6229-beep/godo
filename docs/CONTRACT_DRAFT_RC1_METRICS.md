# RC-1 지표 계약 초안 (DRAFT)

- **상태**: DRAFT — 구현 지시서가 아니다. 승인 후 `revenueMetricContract.ts` 및 CommerceSnapshot 계약에 반영한다.
- **기준선**: `2d68505` / 실패 재현 근거: `scripts/smoke-metric-definition-parity-v0.mjs` (전용 브랜치 `fix/rc-1-metric-parity`)
- **원칙**: 이름이 같은 지표는 계산식이 같아야 한다. 관점이 다르면 **이름을 달리 한다.**

---

## C-1. 카테고리 출처 계약

**우선순위**
1. **주문라인의 주문 당시 `categoryCode`** — 주문 시점 사실을 보존한다.
2. 라인에 없으면 **상품 인덱스의 현재 `categoryCode`**로 보충한다.
3. 둘 다 없으면 `uncategorized`.

**기록 의무**: 결과에 `categorySource: 'orderLine' | 'productIndex' | 'none'`을 남길 수 있도록 **CommerceSnapshot 계약에 필드를 추가**한다. 카테고리 재분류가 일어난 상품의 과거 매출이 어떤 기준으로 집계됐는지 사후 추적이 가능해야 한다.

**현재 상태 (실측)**

| 엔진 | 카테고리 해석 | 근거 | 계약 대비 |
|---|---|---|---|
| `marketingIntelligencePlanner` | products 인덱스만 | `:510, :514` | ① 미구현 (라인 무시) |
| `marketingScopeInsightEngine` | products 인덱스만 | `:253-255` (`goodsMeta`) | ① 미구현 |
| `analyticsQueryEngine` | `lines[].categoryCode`만 | `orderRevenue`/`lineInFilters` | ② 미구현 (보충 없음) |

→ **세 엔진이 서로 다른 절반씩만 구현**하고 있다. 같은 데이터로 카테고리 분석 결과가 갈린다.

---

## C-2. 매출 명명 계약

| 이름 | 계산식 | 용도 |
|---|---|---|
| **`netRevenue` (일반 명칭 "매출")** | 유효 주문(결제완료·미취소)의 주문 총액 합 | **기본값.** 이름 없이 "매출"이라고 하면 이것을 뜻한다 |
| **`grossOrderDemand` ("주문발생금액")** | 취소·미입금 포함 전체 주문의 상품 라인합 | 상품 판매흐름·재고 영향 분석. **반드시 별도 이름으로 표기** |

**변경점**: 기존 `grossProductRevenue`(`revenueMetricContract.ts:57`)는 이름에 "Revenue(매출)"가 들어가 일반 명칭과 혼동된다. **`grossOrderDemand` / "주문발생금액"으로 개명**한다.

**규칙**: 화면·응답 문구에서 "매출"이라는 단어를 쓸 때는 net 기준이어야 한다. gross를 보여줄 때는 "주문발생금액"으로 쓰고 취소 포함 사실을 함께 표기한다.

**현재 상태**: `analyticsQueryEngine.ts:156`의 metric 라벨이 그냥 `'매출'`인데 계산은 `productRevenueByLines`(gross, 유효성 미판정)를 쓴다 → **개명 대상 1순위.**

---

## C-3. 재고위험 단계 계약

**하나의 임계값으로 합치지 않는다.** 단계형으로 둔다.

| 단계 | 조건 | 의미 |
|---|---|---|
| `soldOut` | 재고 = 0 | 품절 |
| `urgent` | 1 ~ 5 | 긴급 |
| `warning` | 6 ~ 20 | 주의 |
| `normal` | 21 이상 | 정상 |

**향후 교체 가능성**: 고정 수량 임계는 회전율이 다른 상품을 같은 기준으로 본다는 한계가 있다. **판매속도 기반 재고 소진 예상일**(예: 잔여일 ≤3 긴급 / ≤7 주의)로 교체할 수 있도록, 단계 판정을 **한 함수 안에 격리**한다.

**현재 상태 (실측)**: 채팅 `productTeamChatFacts.ts:409`는 ≤0 위험 / ≤5 주의, 대시보드 `ProductTeamDashboard.tsx:589-590`은 ≤20 danger / ≤40 warn, 스냅샷 `departmentDataSourceOfTruth.ts:113`은 ≤20, 캘린더 `CalendarPanel.tsx:27`은 20. → **"틀린 것"이 아니라 단계가 정의되지 않은 채 각자 다른 컷을 쓴 것.**

---

## C-4. 정규화 책임 계약

**원시값 정규화는 계산 모듈이 아니라 각 데이터 어댑터의 책임이다.**

```
고도몰 어댑터 ─┐
합성 어댑터   ─┼→ [정규화: boolean · canonical status] → CommerceSnapshot → 계산 모듈
CSV 어댑터    ─┘
```

| 항목 | 어댑터가 해야 할 일 | 계산 모듈이 받는 것 |
|---|---|---|
| 결제 여부 | `'Y'`/`'y'`/`'true'`/`1`/`true` → **boolean** | `paid: boolean` |
| 취소 여부 | 동일 | `canceled: boolean` |
| 문의 상태 | 원시 상태 문자열 → **canonical status** | `status: 'unanswered' \| 'answered' \| ...` |

**금지**: 계산 모듈이 `bool()` 헬퍼를 각자 구현하는 것. **현재 상태 — 실측 3변종:**
- `revenueMetricContract.ts:38` / `planner:153` / `scopeInsight:107` / `marketingAnalysisFacts:227` → `'y'`만
- `marketingAnalysisExecutor.ts:49` → `'Y'`·`1` 포함
- `departmentDataService.ts:68` → `'1'`·`'true'` 포함, **`'Y'` 없음**

→ 고도몰 원시값이 `'Y'`로 오면 엔진마다 유효주문 판정이 갈린다. **어댑터에서 한 번 정규화하면 이 문제 자체가 사라진다.**

---

## 미해결 (계약 확정 전 확인 필요)

1. 실제 고도몰 `Order_Search` 응답의 `paid`/취소 필드 원시 표기 — 실데이터 확인 필요
2. 문의 원시 상태값의 전체 목록 — 어떤 값들이 오는지 확인 후 canonical 매핑표 작성
3. 재고 단계 경계(5 / 20)가 사업 기준으로 타당한지 — 운영 판단 필요
