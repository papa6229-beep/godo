# CS Draft Composer Runtime Wiring v0

> **작업명**: `CS Draft Composer Runtime Wiring v0`
> **브랜치**: `feature/cs-draft-composer-runtime-wiring-v0`
> **상위 컨텍스트**: `docs/CS_DRAFT_COMPOSER_GROUNDING_V0.md`(composer) · `docs/CS_INQUIRY_ASSOCIATED_ORDER_CONTEXT_PATCH_V0.md`.
> **성격**: CS 답변 초안 요청을 **코드(composer)가 직접 처리**하도록 런타임에 연결. LLM이 초안을 자유 생성하지 못하게 한다.

---

## 1. 목적

직전까지 composer는 만들어졌지만 채팅 런타임에서는 answerGuidance(LLM에게 "composer 기준을 따르라")에 의존했다. 이번 작업으로 CS 채팅에서 초안 요청이 감지되면:

```
draft intent 감지 → 대상 inquiry 선택 → composer 직접 실행 → customerDraft 중심 출력
(고위험/requiresHumanCheck만 초안 밖 "※ 내부 확인 필요" 한 줄)
```

→ **초안 생성의 주도권이 LLM이 아니라 코드 composer**에 있다. CS draft request는 **LLM 호출 없이 deterministic 반환**(작업지시서 §6 우선순위 1).

---

## 2. 산출물 / 변경

### 신규
* `src/services/csDraftRuntime.ts` — 순수 함수:
  * `detectCsDraftRequestIntent(userText)` — 초안/답장 요청 감지(+rank/targetHint/topicHint).
  * `selectCsDraftTargetInquiry({inquiries, intent})` — shortlist(미답변/긴급/최근) + rank/topic 기준 대상 선택.
  * `runCsDraftRequest({userText, inquiries, orders})` — 감지→선택→`composeCsDraftFromOrders`→`renderCsDraftForChat`까지 오케스트레이션. `handled=false`면 일반 채팅 흐름 유지.
* `scripts/smoke-cs-draft-composer-runtime-wiring.mjs` — **19/19 통과**.
* `docs/CS_DRAFT_COMPOSER_RUNTIME_WIRING_V0.md`(본 문서).

### 수정
* `src/components/DepartmentWorkspacePanel.tsx` — CS 채팅 `handleSend`에서 draft 요청이면 `runCsDraftRequest`를 먼저 실행하고, `handled`면 결과를 채팅에 직접 출력하고 **LLM(`chatWithTeam`) 호출을 건너뛴다**. 비-draft면 기존 흐름 그대로.

> **미변경**: composer(`csDraftComposer.ts`)·grounding(`csInquiryOrderGrounding.ts`)·`departmentChatService.ts`는 손대지 않음. product/marketing/manager 경로 무변경(격리). 새 모달/발송버튼/WRITE 없음.

---

## 3. 동작 결과 (smoke 실측)

| 요청 | 처리 |
|---|---|
| "1순위 미답변 문의 답변 써줘" | draft 감지 → recentUnanswered 1순위 선택 |
| "긴급 문의 답변 초안 써줘" | urgent 목록에서 선택 |
| "환불 문의 답변 초안 만들어줘" | topicHint=refund 매칭 inquiry 선택 |
| "고객에게 보낼 답장 만들어줘" | draft 감지 |
| "답변 대기 문의만 정리해줘" | **draft 아님** → 일반 채팅 흐름 |
| "미답변 문의 몇 건이야?" | **draft 아님(handled=false)** → 일반 흐름 |
| 대상 없음 | "현재 초안을 만들 수 있는 미답변 문의가 없습니다." (composer 미호출) |
| 중복 후보 건(high risk) | customerDraft + 초안 밖 "※ 내부 확인 필요: …" |

rank 파싱: `1순위`/`2번`/`첫 번째`/`두 번째` 등.

---

## 4. 출력 정책

* **기본 출력 = customerDraft 중심**: `"아래처럼 답변하시면 됩니다."` + 인사~감사 종결형.
* **내부 메타데이터 숨김**: `[내부 확인 메모]` 블록·evidenceSummary·missingData·PG/transaction 필드명 미노출(smoke #10·#11).
* **고위험 운영자 주의 분리**: `requiresHumanCheck`/high risk일 때만 초안 **밖**에 `"※ 내부 확인 필요: …"` 한 줄. customerDraft 안에는 섞지 않음(#12·#13).
* **고객 추가 행동 최소화**: 종결 가능건은 캡처/자료 요청 없음(#14). 자료 요청은 주문 미매칭 케이스만(composer 정책).
* **확정 표현 차단 유지**: 중복 후보 있으면 "중복결제가 아닙니다" 미사용(#15) — composer 검수 그대로.

---

## 5. 안전 검증 (smoke)

* **PII/fake contact/memberKey 미노출**(#16) — composer가 보장, 출력에도 없음.
* **타 부서 무회귀**: 비-draft는 `handled=false`로 일반 흐름 유지(#17), 패널은 CS 분기에서만 단락. product/marketing/manager 관련 smoke(dept-chat-wiring 16, aux-routing 18) 통과.
* **deterministic**: 동일 입력 → 동일 출력, LLM 호출 없음(#18).

---

## 6. 한계 / 다음 작업 제안

* **결제일/취소일·배송 tracking 미확정**: composer 입력(RevenueOrderLite)에 없어 delivery·정확 일시는 "확인 필요". → **RevenueOrderLite paymentDate/cancelDate(+배송상태) 확장**.
* **CS Draft → Approval Queue 연결**: `runCsDraftRequest`가 이미 `composer.requiresHumanCheck`/`riskLevel`/`internalNote`를 산출 → 고위험 초안을 사람 승인 큐로(HITL). WRITE는 OFF 유지.
* **Board READ v0(real CS)**: synthetic → 실제 문의/주문 전환 시 입력만 교체(계약 동일).

---

## 7. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-draft-composer-runtime-wiring.mjs` **19/19** ✅
* 관련 smoke: composer-grounding 22 · associated-order 17 · grounding-audit 15 · cs-detail 15 · dept-chat-wiring 16 · aux-routing 18 — 전부 ✅

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-draft-composer-runtime-wiring-v0`, smoke 19/19)*
