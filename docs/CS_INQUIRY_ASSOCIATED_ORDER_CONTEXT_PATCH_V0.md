# CS Inquiry Associated Order Context Patch v0 + CS Response Evidence Policy v0

> **작업명**: `CS Inquiry Associated Order Context Patch v0` (+ `CS Response Evidence Policy v0`)
> **브랜치**: `fix/cs-inquiry-associated-order-context-v0`
> **상위 컨텍스트**: `docs/CS_INQUIRY_ORDER_GROUNDING_AUDIT_V0.md`(직전 감사, helper 신설) · `docs/PROJECT_HANDOFF_2026-06-26.md`.
> **성격**: 감사에서 만든 grounding helper를 **실제 CS 채팅 context에 연결**하고, facts 없이 확정 표현을 못 쓰게 하는 **Evidence Policy**를 채팅 지침에 주입한다.

---

## 1. 목적

직전 감사 결론은 "데이터는 충분한데(문의 orderNo 100% 매칭, 결제/금액/클레임/중복후보 추출 가능) CS 채팅 context로 안 들어오고, 답변 표현 가드도 없다"였다. 이번 패치로:

1. CS 문의 → `orderNo` → `revenue.orders` 매칭 결과를 CS context에 전달
2. connected order facts를 CS 답변 근거로 사용
3. 주문 facts가 없거나 일부면 확정 표현 금지(Evidence Policy)
4. 중복결제 문의는 "주문 데이터 기준 확인 가능 범위"와 "PG 원장 기준 확인 필요 범위"를 분리
5. PII 없이 safe facts만, CS팀에만 전달

---

## 2. 변경 사항

### 2-1. `src/services/departmentChatFacts.ts` (주 변경)
* `SafeInquiryChatItem`에 `orderNo?: string` 추가(대조 키 — universe safe inquiry는 보유했으나 이 경계에서 누락되던 필드).
* `CsChatDetailInput`에 `orders?: GroundingOrder[]` 추가(CS 전용, RevenueOrderLite 호환, PII 없음).
* 직전 helper(`csInquiryOrderGrounding.ts`)의 `buildAssociatedOrderFacts` / `findDuplicatePaymentCandidates`를 import해 **`[연결 주문 facts]` 섹션** 생성(`buildConnectedOrderFactsSection`).
  * shortlist(미답변 ∪ 긴급 ∪ 최근) 상위 **최대 6건**에 대해 문의별 facts 블록 렌더.
  * 매칭 시: 결제상태/주문금액/상품금액/배송비/주문일/상품명/클레임(claimTypes)/missingData. 결제 topic이면 중복결제 후보 + PG 원장 안내.
  * 미매칭 시: `주문 매칭: 아니오` + 사유 + missingData.
  * `memberKey`는 **사람이 읽는 섹션에 노출하지 않음**(중복 후보 anchor 내부 용도만).
* CS `answerGuidance`에 **Evidence Policy** 주입(§3).

### 2-2. `src/components/DepartmentWorkspacePanel.tsx`
* CS detail 생성 시 `orders: rev.orders`를 추가 전달(기존 inquiries/reviews/goodsNames 유지). **product/marketing/manager 경로는 변경 없음** → 타 팀 격리 유지.

### 2-3. 재사용
* `src/services/csInquiryOrderGrounding.ts` — 신규 코드 없이 직전 helper 재사용.

### 2-4. 신규 산출물
* `docs/CS_INQUIRY_ASSOCIATED_ORDER_CONTEXT_PATCH_V0.md` (본 문서)
* `scripts/smoke-cs-inquiry-associated-order-context.mjs` (17/17 통과)

---

## 3. CS Response Evidence Policy v0 (answerGuidance 주입)

| 상황 | 정책 |
|---|---|
| 주문 facts 있음(매칭: 예) | "현재 연결된 주문 데이터 기준으로는…"으로 범위 한정, [연결 주문 facts]의 사실(결제상태/금액/주문일/클레임)만 전달 |
| 주문 facts 없음(매칭: 아니오 / 섹션 없음) | "확인한 결과 / 중복결제가 아닙니다 / 환불 처리되었습니다 / 취소 완료되었습니다 / 문제 없습니다" **확정 표현 금지** → "현재 연결된 주문 데이터만으로는 최종 확인이 어렵고 주문번호/결제 승인내역 확인이 필요합니다" |
| 클레임(취소/환불/반품/교환) | "내역이 확인됩니다"까지만, "처리 완료"로 단정 금지(완료 여부 미확정) |
| 중복결제 문의 | 주문 데이터 기준 "유사 주문 후보"까지만. PG 승인번호·카드 승인번호·transaction id 부재 → **최종 여부는 결제 원장 확인 필요** 반드시 안내 |
| 중복 후보 없음 | "동일 고객/동일 금액/근접 시간대 후보는 확인되지 않습니다(최종 확인은 결제 원장 필요)" — "중복결제가 아닙니다/이중 결제 없음/문제 없음" 단정 금지 |

---

## 4. `[연결 주문 facts]` 섹션 출력 예 (smoke 실측)

```
[연결 주문 facts]
- 문의ID q4 · 주문번호 NO-SUCH-ORDER · 주문 매칭: 아니오
  · 사유: orderNo가 revenue.orders에 없음 · missingData: orderNo가 revenue.orders에 없음, paymentDate, cancelDate, pgApprovalNo, transactionId, cardApprovalNo, paymentAttemptLog, cardTempApproval
- 문의ID q1 · 주문번호 O-1001 · 주문 매칭: 예
  · 결제상태 결제완료 · 주문금액 62,500원 · 상품금액 60,000원 · 배송비 2,500원
  · 주문일 2026-06-25 10:00:00 · 결제일 현재 연결 데이터에 없음
  · 상품 모자
  · 클레임 return, cancel / claimAmount 60,000원 (완료 여부 미확정)
  · missingData: paymentDate, cancelDate, pgApprovalNo, transactionId, cardApprovalNo, paymentAttemptLog, cardTempApproval, claimCompletionStatus(...)
- 문의ID q2(결제) · 주문번호 O-DUP1 · 주문 매칭: 예
  · ... · 중복결제 점검: 동일 고객/동일 금액/근접 시간대 후보 1건(O-DUP2) (PG 승인내역 기준 최종 확인은 결제 원장 필요)
```

---

## 5. 안전/격리 검증 (smoke)

* **PII 없음**: connected facts/CS context에 이름/전화/주소/이메일/계좌/배송메모/`isFakePii` 미포함(#9). `memberKey`(가명)도 섹션에 미노출(#10).
* **fake contact 혼입 없음**(#10).
* **타 부서 격리**: product/marketing/manager context에 `연결 주문 facts`/`주문 매칭:` 미포함(#12).
* **기존 기능 무회귀**: 기존 CS shortlist(미답변/긴급/최근/저평점 리뷰/CS 이슈 상품) 유지(#15), orders 미전달 시 안내 + shortlist 유지(#17). 관련 smoke 4종(grounding-audit 15, cs-detail 15, dept-chat-wiring 16, aux-routing 18) 무회귀.

---

## 6. 한계 / 다음 작업 제안

* **결제일/취소일 미확정**: `RevenueOrderLite`가 `paymentDt`/`cancelDt`를 싣지 않아 정확 일시는 missingData. real 정확 일시 답변이 필요하면 **RevenueOrderLite paymentDate/cancelDate 확장**(서버 매핑 가산, PII 아님)이 선행.
* **중복결제 최종 확정 불가**: PG 승인/transaction/카드 승인/결제 로그 부재 → 결제 원장 READ 필요(범위 밖).
* **다음 작업 후보**:
  1. **CS Draft Composer Grounding v0** — connected facts + Evidence Policy를 근거로 한 **응대 초안 생성**(가상 contact 결합 시 "synthetic/fake 가상 고객" 표시 필수).
  2. **RevenueOrderLite paymentDate/cancelDate 확장** — 일시 facts 보강.
  3. **Approval Queue 연결** — 초안→사람 승인→실행(HITL), WRITE는 여전히 OFF.

---

## 7. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-inquiry-associated-order-context.mjs` **17/17** ✅
* 관련 smoke: grounding-audit 15 · cs-detail 15 · dept-chat-wiring 16 · aux-routing 18 · analytics 25 — 전부 ✅

> *문서 끝. (작성: 2026-06-27, 브랜치 `fix/cs-inquiry-associated-order-context-v0`, smoke 17/17)*
