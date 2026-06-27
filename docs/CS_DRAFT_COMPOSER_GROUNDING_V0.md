# CS Draft Composer Grounding v0

> **작업명**: `CS Draft Composer Grounding v0`
> **브랜치**: `feature/cs-draft-composer-grounding-v0`
> **상위 컨텍스트**: `docs/CS_INQUIRY_ASSOCIATED_ORDER_CONTEXT_PATCH_V0.md`(연결 주문 facts + Evidence Policy) · `docs/CS_INQUIRY_ORDER_GROUNDING_AUDIT_V0.md`(helper).
> **성격**: 연결 주문 facts를 근거로 **고객 발송용 답변 초안 1개**를 짧고 안전하게 생성하는 composer + 검수 정책.

---

## 1. 철학

CS의 목적은 업무 과정을 설명하는 게 아니라 **가능한 범위에서 빠르고 깔끔하게 종결**하는 것. 그래서:

* 기본 출력은 `customerDraft`(고객 발송용 초안) **1개**만.
* `evidenceSummary/missingData/prohibitedClaims/riskLevel/requiresHumanCheck/internalNote`는 **내부 메타데이터**(기본 화면 미노출).
* 종결 가능하면 고객에게 추가 행동(캡처/재문의)을 요구하지 않는다.
* PG 승인번호/transactionId/missingData 같은 **내부 필드명을 고객에게 말하지 않는다**.
* facts로 확정 불가한 고위험 건만 `requiresHumanCheck`로 내부 플래그.

---

## 2. 산출물 / 변경

### 신규
* `src/services/csDraftComposer.ts` — 순수 함수:
  * `composeCsDraft(input)` — facts/policy 기반 초안 생성 + 자체 검수(idempotent).
  * `composeCsDraftFromOrders(inquiry, orders)` — facts/중복후보/policy 자동 구성 후 초안.
  * `validateCsDraftAgainstEvidencePolicy(result, input)` — 위반 검출 → 안전 초안 교정.
  * `normalizeCsTopic`, `renderCsDraftForChat`(고위험 시 초안 밖 "※ 내부 확인 필요" 한 줄 분리).
* `scripts/smoke-cs-draft-composer-grounding.mjs` — **22/22 통과**.
* `docs/CS_DRAFT_COMPOSER_GROUNDING_V0.md`(본 문서).

### 수정
* `src/services/csInquiryOrderGrounding.ts` — `AssociatedOrderFacts`에 optional `duplicatePaymentCandidates?`(호출부가 부착, composer가 읽음).
* `src/services/departmentChatFacts.ts` — CS `answerGuidance`에 "답변 초안 요청" 지침 추가(고객 초안 1개·종결형·내부 필드명 미노출·두 블록 분리 금지·고위험만 초안 밖 주의 한 줄).

> **미변경(격리/최소수정 원칙)**: `DepartmentWorkspacePanel.tsx`, `departmentChatService.ts`는 손대지 않음. composer는 독립 순수 모듈로, 채팅 연결은 guidance-기반(LLM이 초안 작성). product/marketing/manager context 무변경.

---

## 3. composer 출력 구조

```ts
CsDraftComposerResult = {
  customerDraft: string;          // ← 기본 출력(이것만 고객에게)
  topic, evidenceSummary[], missingData[], prohibitedClaims[],
  allowedClaims[], riskLevel('low'|'medium'|'high'),
  requiresHumanCheck, customerActionRequested, internalNote?  // ← 내부 메타데이터
}
```

---

## 4. topic별 안전 응답 기준 (smoke 실측 초안)

| topic | 조건 | customerDraft 요지 | risk / humanCheck / 고객행동 |
|---|---|---|---|
| payment | 매칭 + 중복 없음 | "결제 건이 1건만 확인됩니다. 중복 결제 내역은 확인되지 않았습니다." | low / no / **요청 없음** |
| payment | 중복 후보 있음 | "동일 금액의 결제 이력이 함께 확인되어 확인이 필요한 상태입니다." | **high / yes** / 없음 |
| payment | 주문 매칭 없음 | "주문번호 또는 결제내역 확인이 필요합니다." | medium / no / **요청(유일)** |
| refund/return/exchange | 클레임 있으나 완료 미확정 | "{환불/반품/교환} 확인이 필요한 상태입니다." | high / **yes** / 없음 |
| cancel | `canceled=true`(cancelDt) | "취소 내역이 확인됩니다. 반영은 영업일 소요." | medium / no / 없음 |
| delivery | tracking facts 없음(v0) | "배송 상태 확인이 필요한 상태입니다." | medium / yes / 없음 |
| product | 매칭 + 동일 goodsNo | "현재 주문 상품과 동일한 상품으로 확인됩니다." | low / no / 없음 |
| general | — | "문의 내용 확인했습니다. 필요한 안내 도와드리겠습니다." | low / no / 없음 |

핵심: **종결 가능한 건은 추가 행동 요구 없음**(고객 자료 요청은 payment 미매칭 1케이스만).

---

## 5. Evidence Policy 검수 (validateCsDraftAgainstEvidencePolicy)

초안 문자열을 스캔해 위반 시 → `prohibitedClaims` 기록 + `riskLevel=high` + `requiresHumanCheck=true` + `customerDraft`를 안전 fallback으로 교정:

1. 주문 facts 없이 "확인한 결과"
2. 중복 후보 있는데 "중복결제 아닙니다/이중결제 없음"
3. 고객에게 PG 승인번호/카드 승인번호/transaction id/결제 원장 등 내부 결제 필드명 노출
4. `claimCompletionStatus` 없이 "환불/취소/반품/교환 완료"
5. 배송 tracking 없이 "배송 완료/오늘 도착"
6. 초안에 내부 필드명/식별자(`missingData`/`memberKey`/`syn_member_` 등) 노출
7. PII 노출

> v0에서 `claimCompletionStatus`·배송 tracking은 항상 미확정으로 취급 → 완료/도착 단정 불가. composer 자체 출력은 이 규칙을 지켜 생성되며, 외부 초안 주입 시에도 동일 검수로 교정(smoke #12 검증).

---

## 6. 안전 검증 (smoke)

* **customerDraft PII 없음**(#14) · **internal metadata PII 없음**(#15) · **fake contact 혼입 없음**(#16) · **memberKey/내부 식별자 노출 없음**(#17).
* **기본 출력 단일화**: `[고객 발송용 초안]/[내부 확인 메모]` 2블록 분리 안 함(#3). `renderCsDraftForChat`는 고위험만 초안 밖에 "※ 내부 확인 필요" 한 줄.
* **순수 함수**: 같은 입력 → 같은 출력(#18), LLM 호출 없음(#19).
* **무회귀**: cs-associated-order 17 · grounding-audit 15 · cs-detail 15 · dept-chat-wiring 16 · aux-routing 18 전부 통과.

---

## 7. 한계 / 다음 작업 제안

* **결제일/취소일·배송 tracking 미확정**: `RevenueOrderLite`에 `paymentDt`/`cancelDt`·배송 추적 필드가 없어 delivery·정확 일시는 항상 "확인 필요". → **RevenueOrderLite paymentDate/cancelDate(+배송상태) 확장**이 다음 정확도 향상 줄기.
* **CS Draft → Approval Queue 연결**: composer 결과(특히 `requiresHumanCheck=true`)를 사람 승인 큐로 보내 HITL 실행(WRITE는 여전히 OFF). composer가 이미 riskLevel/internalNote를 산출하므로 연결 가능.
* **Board READ v0(real CS)**: synthetic → 실제 문의/리뷰/배송 전환 시 composer 입력만 교체하면 재사용 가능(계약 동일).

---

## 8. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-draft-composer-grounding.mjs` **22/22** ✅
* 관련 smoke: cs-associated-order 17 · grounding-audit 15 · cs-detail 15 · dept-chat-wiring 16 · aux-routing 18 — 전부 ✅

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-draft-composer-grounding-v0`, smoke 22/22)*
