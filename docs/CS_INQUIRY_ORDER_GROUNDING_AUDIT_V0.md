# CS Inquiry Order Grounding Audit v0

> **작업명**: `CS Inquiry Order Grounding Audit v0`
> **브랜치**: `audit/cs-inquiry-order-grounding-v0`
> **상위 컨텍스트**: `docs/PROJECT_HANDOFF_2026-06-26.md`(파이프라인 전체) · `CS Chat Inquiry Detail Context Patch v0`(`2981676`, CS가 safe 개별 문의/리뷰까지 답변).
> **성격**: **감사(audit) 우선**. 답변 기능을 바로 고치지 않고, "CS 문의를 주문/결제/클레임 facts와 안전하게 대조할 수 있는가"를 먼저 코드로 확인하고 helper·smoke·문서로 남긴다.

---

## 1. 감사 목적

CS 문의의 `orderNo`가 `revenue.orders`와 실제로 매칭되는지 감사하고, 매칭된 주문에서 CS 답변 초안에 **안전하게 grounding 가능한 facts**(결제상태/금액/주문일/취소·환불·클레임)를 추출할 수 있는지 확인한다.

핵심은 "답변을 자연스럽게 쓰는 것"이 아니라, CS가 **실제로 확인하지 않은 것을 확인한 것처럼 말하지 못하게** 만드는 선행 감사다. 다음 표현이 facts 없이 나오지 않게 하는 것이 목표:

```txt
고객님의 결제 내역을 확인한 결과 / 중복결제가 아닙니다 / 환불 처리되었습니다 / 취소 완료되었습니다 / 확인 결과 문제 없습니다
```

---

## 2. 데이터 흐름

```
DepartmentWorkspacePanel
  └ fetchRevenue(true, 'commerce_universe_v1', { includeUniverseAux: true, includeCsFakeContacts: true })
       └ RevenueResult
            ├ orders: RevenueOrderLite[]        (PII 없음, 가명 memberKey · paid/canceled · claim 요약)
            └ universeAux
                 ├ inquiries: SafeSyntheticInquiry[]   (연락처 없음, orderNo 보유)
                 ├ reviews:   SafeSyntheticReview[]
                 ├ customers: SafeSyntheticCustomer[]
                 └ csOnlyFakeContacts: CsFakeContact[] (fake PII, CS 전용·격리)

감사 대상 결합:  auditInquiryOrderGrounding({ inquiries: universeAux.inquiries, orders: revenue.orders })
                 buildAssociatedOrderFacts(inquiry, revenue.orders)
                 findDuplicatePaymentCandidates(inquiry, revenue.orders)
```

* 생성기: `api/_shared/syntheticCommerceUniverse.ts` — 모든 inquiry는 주문 이벤트(orderMeta)에서 파생되며 `orderNo: m.orderNo`로 주문과 1:1 연결된다(line 423). 즉 **synthetic universe에서는 orderNo 보유·매칭이 구조적으로 100%**.
* safe 변환: `api/_shared/commerceUniverseAux.ts` — `SafeSyntheticInquiry`에 `orderNo`가 보존된다(연락처·본문 PII는 제거/마스킹).
* 신규 helper: `src/services/csInquiryOrderGrounding.ts`(순수 함수, PII 미입력).

---

## 3. inquiry → orderNo 보유율 (실측)

`seed=20260627, endDate=2026-06-27` universe 기준(smoke 실측):

| 항목 | 값 |
|---|---|
| 총 문의 | **135건** |
| orderNo 보유 문의 | **135건 (100.0%)** |
| orderNo 미보유 문의 | 0건 |

* 타입상 `SafeSyntheticInquiry.orderNo`는 **optional**(`orderNo?`) — real 전환 시 비주문 문의(상품 일반문의 등)는 orderNo가 없을 수 있으므로, 보유율은 코드가 **동적으로** 계산한다(`auditInquiryOrderGrounding`).

---

## 4. inquiry.orderNo → revenue.orders 매칭률 (실측)

| 항목 | 값 |
|---|---|
| 매칭 주문 존재 문의 | **135건 (전체 대비 100.0%)** |
| 미매칭 문의 | 0건 |
| orderNo 보유분 중 매칭률 | **100.0%** |
| 대조 주문 수(orders) | 815건 |

* orderNo는 `orderSeq` 전역 시퀀스가 포함돼 **전역 유일** → 충돌 없음.
* real 전환 시 위험 요인: ① 주문 검색 30일 윈도우(`Order_Search`) 밖의 과거 주문이면 매칭 실패 ② 비주문 문의 ③ orderNo 표기 차이. 모두 audit가 `unmatched + missingReason`으로 드러낸다.

---

## 5. 추출 가능한 주문/결제/클레임 facts

`buildAssociatedOrderFacts(inquiry, orders)` 산출(매칭 샘플 `orderNo=2603170804000003`):

| facts | 추출원(RevenueOrderLite) | 샘플값 | 가능 |
|---|---|---|---|
| `paid`(결제상태) | `paid` | `true` | ✅ |
| `orderAmount`/`paidAmount` | `totalAmount`(settlePrice) | `62,500` | ✅ |
| `goodsAmount` | `productRevenueByLines` | `60,000` | ✅ |
| `deliveryCharge` | `deliveryFee` | `2,500` | ✅ |
| `orderDate`(주문일) | `orderDate` | `'YYYY-MM-DD HH:MM:SS'` | ✅ |
| `productNames`/`goodsNos` | `lines[]` | (라인 상품) | ✅ |
| `canceled` | `canceled` ∪ `claim.claimTypes∋cancel` | `true` | ✅ |
| `refunded`/`returned`/`exchanged` | **`claim.claimTypes`** | `returned=true` | ✅ |
| `claimSummary` | `claim`{hasClaim/claimTypes/claimAmount} | `["return","cancel"] / 60,000` | ✅ |
| `memberKey`(가명) | `memberKey` | `syn_member_*` | ✅(PII 아님) |
| **`paymentDate`(결제일시)** | — (Lite가 떨어뜨림) | — | ⚠️ missingData |

* **중요 1**: 서버 `RevenueOrderState.refunded/returned`는 v0에서 **항상 false**(하드코딩, `godomallRevenue.ts:169-170`). 따라서 환불/반품/교환 판정은 반드시 **`claimSummary.claimTypes`**로 한다. helper가 이 규칙을 강제한다.
* **중요 2**: `cancel`은 `cancelDt`와 `claimData.handleMode` 양쪽에서 파생되므로 한 주문에 `["return","cancel"]`처럼 복수 클레임 타입이 함께 나올 수 있다(취소+반품 동시). "완료 여부"는 알 수 없다 → §6 참고.
* **중요 3**: 프론트 `RevenueOrderLite`는 서버 `RevenueOrder`의 `paymentDt`/`cancelDt`/`syntheticSource`를 **싣지 않는다** → `paymentDate`/`cancelDate`는 현재 항상 미확정(missingData). real 정확 일시가 필요하면 Lite 확장이 선행돼야 한다.

---

## 6. 중복결제 탐지 가능 범위

`findDuplicatePaymentCandidates(inquiry, orders, options)` — anchor 주문(=inquiry.orderNo)의 `memberKey`를 기준으로 **유사 주문 후보**를 찾는다(결정적 smoke 시나리오에서 동일 memberKey·동일 금액·6분 차 후보를 탐지, 타 고객·고액 주문은 제외 확인).

**주문 데이터로 가능한 것:**
```txt
- 주문번호 매칭 / 결제상태·결제금액·주문일 확인
- 같은 memberKey + 동일(±tol) 금액 + 근접 시간(window) + 공통 상품 기준 "유사 주문 후보" 탐지
```
옵션: `amountTolerancePct`(기본 0=정확), `timeWindowHours`(기본 72), `requireSharedGoods`(기본 true).

**주문 데이터만으로 불가능한 것(`confirmationLimits` = 결제 원장 필요):**
```txt
pgApprovalNo · transactionId · cardApprovalNo · paymentAttemptLog · cardTempApproval
```

→ 따라서 중복결제 문의에 대한 안전한 답변 기준은:
> "주문 데이터 기준으로는 유사 주문 후보를 확인할 수 있습니다. 다만 PG 승인내역 기준 **최종** 중복결제 여부는 별도 결제 원장 확인이 필요합니다."
> 또는 (후보 없음) "현재 연결된 주문 데이터에서는 동일 주문의 중복 결제 후보가 확인되지 않았습니다. 다만 카드사 임시 승인/PG 승인 중복 여부는 결제 승인내역 기준 추가 확인이 필요합니다."

---

## 7. PG/transaction 기준 한계

| 중복결제 확정용 필드 | 주문 데이터 | 결론 |
|---|---|---|
| PG 승인번호(pgApprovalNo) | 없음 | 결제 원장 필요 |
| transaction id | 없음 | 결제 원장 필요 |
| 카드 승인번호(cardApprovalNo) | 없음 | 결제 원장 필요 |
| 결제 시도 로그(paymentAttemptLog) | 없음 | 결제 원장 필요 |
| 카드사 임시 승인(cardTempApproval) | 없음 | 결제 원장 필요 |

helper는 위 항목을 `AssociatedOrderFacts.missingData`와 `DuplicatePaymentResult.confirmationLimits`에 **항상** 싣고, evidence policy가 "PG 승인내역을 확인했다"는 표현을 **항상 금지**한다.

---

## 8. PII 격리 확인

* 입력 자체가 PII-free: helper는 `GroundingInquiry`(연락처 없음) + `GroundingOrder`(`RevenueOrderLite` 호환, PII 없음)만 받는다. 이름/전화/주소/이메일/계좌/배송메모는 입력 타입에 존재하지 않는다.
* `memberKey`는 분석용 **가명 키**(`syn_member_*` / real은 해시)로만 취급 — 중복주문 후보 anchor 용도.
* `csOnlyFakeContacts`(fake PII)는 별도 채널로 격리되며 `associatedOrderFacts`에 **혼입되지 않음**(smoke #8·#9: facts JSON에 PII 패턴·fake contact 이름·`isFakePii` 없음).

---

## 9. 다음 작업 제안

감사 결론: **데이터는 있는데(orderNo 100% 매칭, 결제/금액/클레임 facts 추출 가능), 현재 CS chat context로는 들어오지 않고, 답변 표현 가드도 없다.** 두 갈래가 동시에 필요.

1. **(우선) `CS Inquiry Associated Order Context Patch v0`** — *데이터는 있는데 context로 안 들어옴*.
   * 근거: `departmentChatFacts.ts`의 `SafeInquiryChatItem`에 **`orderNo` 필드가 없어** 문의가 주문과 끊겨 있고(`inqLine`도 미표시), `DepartmentWorkspacePanel`이 `revenue.orders`를 `csDetail`로 넘기지 않는다(현재 `csDetail = { inquiries, reviews, goodsNames }`).
   * 할 일: `SafeInquiryChatItem`에 `orderNo` 추가 → 패널이 `csDetail`에 `orders`(또는 inquiry별 `associatedOrderFacts`) 전달 → CS context에 "연결 주문 facts(결제완료/금액/클레임 내역)" 섹션 추가. 답변 가드(`evaluateResponseEvidencePolicy`) 지침을 answerGuidance에 주입.

2. **`CS Response Evidence Policy v0`** — *답변 표현만 위험* (1과 함께 가능).
   * helper의 `evaluateResponseEvidencePolicy`를 채팅 guidance로 승격: facts 없으면 확정표현 금지, facts 있으면 "현재 연결된 주문 데이터 기준" 한정, PG 최종확인은 원장 필요 안내.

3. **(후속) `RevenueOrderLite 결제일시/취소일시 확장`** — *데이터 일부 부족*.
   * `paymentDate`/`cancelDate`/`syntheticSource`가 Lite에서 누락. real 정확 일시 답변이 필요하면 서버 orders-revenue → Lite 매핑에 `paymentDt`/`cancelDt` 가산(PII 아님).

4. **(real 전환 시) Board READ + 결제 원장**: 중복결제 최종 확정은 PG/결제 원장 READ가 선행돼야 한다(이번 범위 밖).

---

## 10. 산출물 / 검증

* `src/services/csInquiryOrderGrounding.ts` — `auditInquiryOrderGrounding` / `buildAssociatedOrderFacts` / `findDuplicatePaymentCandidates` / `evaluateResponseEvidencePolicy` / `summarizeInquiryOrderGroundingAudit`(전부 순수 함수, PII 미입력).
* `scripts/smoke-cs-inquiry-order-grounding-audit.mjs` — 실제 universe 생성 → audit/ facts/ 중복후보/ PII 격리/ 정책 **15/15 통과**.
* 검증: `npm run lint` · `npx tsc --noEmit` · `npm run build` · smoke 통과(아래 §11 결과 참조).

> *문서 끝. (작성: 2026-06-27, 브랜치 `audit/cs-inquiry-order-grounding-v0`, smoke 15/15)*
