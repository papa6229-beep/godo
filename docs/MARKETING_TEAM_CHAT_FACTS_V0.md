# Marketing Team Chat Facts v0 (2026-06-29)

> **종류**: 채팅 grounding service — 실제 WRITE 없음, 고도몰 API 호출 추가 없음, localStorage 변경 없음, 외부(GA/광고) 데이터 생성 없음.
> **한 줄**: 마케팅팀 우측 팀장 채팅이 **대시보드와 동일한 `buildMarketingAnalysisFacts`** 를 근거로 답하도록 grounding했다. 계산 가능한 질문은 facts 숫자로, 외부 데이터가 필요한 질문(ROAS/방문전환/상품조회전환/장바구니/GA4/SNS)은 추정 없이 requiredData로 안내한다.
> **산출물**: `src/services/marketingTeamChatFacts.ts` · `docs/MARKETING_TEAM_CHAT_FACTS_V0.md` · `scripts/smoke-marketing-team-chat-facts-v0.mjs`(32/32) + 최소 수정(`marketingAnalysisFacts.ts` isCounted, `DepartmentWorkspacePanel.tsx` 마케팅 분기).

---

## 1. 작업 목적

상품팀 채팅이 `productTeamChatFacts`로 "코드가 숫자, AI는 설명"을 구현한 것처럼, 마케팅팀 채팅도 같은 방식으로 grounding한다. 단 마케팅은 상품팀보다 **requiredData(외부 데이터 차단)와 PII guard**가 더 중요하다.

## 2. 대시보드와 같은 facts를 공유하는 이유

마케팅 분석 대시보드(`MarketingAnalysisDashboard`)와 팀장 채팅이 **동일한 `buildMarketingAnalysisFacts`** 를 호출한다 → "보는 화면의 숫자"와 "채팅이 말하는 숫자"가 항상 일치한다. `buildMarketingTeamChatFacts`는 그 결과를 채팅 친화 형태(summary/ChatMetric/insights/requiredData/guardrails)로 재구성만 한다(새 계산 없음).

> 일관성 보강: `marketingAnalysisFacts.isCounted`가 중첩 `state{paid,canceled}`(universe)와 평탄 `paid/canceled`(프론트 `RevenueOrderLite`) 두 형태를 모두 수용하도록 최소 보강 → 대시보드/채팅이 동일 기준으로 집계.

## 3. 지원하는 질문 유형 (intent)

`detectMarketingChatIntent(text)`:

| intent | 예시 질문 | 처리 |
|---|---|---|
| `marketing_overview` | "최근 매출 어때?" "객단가 알려줘" | 총매출/주문수/객단가 + 핵심 차원 요약 |
| `member_group_performance` | "VIP 매출 비중", "회원그룹별 매출" | 회원그룹별 매출/주문/객단가/비중 |
| `coupon_performance` | "쿠폰 쓴 주문", "쿠폰 객단가 높아?" | 쿠폰 사용/미사용 비교 |
| `reward_performance` | "마일리지 쓴 주문 많아?" | 마일리지/예치금 사용 비교 |
| `first_repeat_purchase` | "첫구매랑 재구매 비교" | 첫/재구매 매출 비교(관찰) |
| `order_channel_performance` | "주문채널별 매출" | 채널별 매출/주문/객단가 |
| `top_products` | "잘 팔리는 상품" | 상품 매출 TOP |
| `category_brand_performance` | "카테고리별 매출" | 카테고리/브랜드 TOP |
| `required_data_question` | "어떤 데이터가 필요해?" | requiredData 전체 안내 |
| `unsupported_*` | ROAS/방문전환/상품조회전환/장바구니 | **requiredData 안내(미계산)** |

## 4. 계산 가능한 질문

총매출·주문수·객단가·첫/재구매 매출·회원그룹별·주문채널별·쿠폰 사용/미사용·마일리지/예치금·상품/카테고리/브랜드 TOP. 전부 `buildMarketingAnalysisFacts` facts 숫자로만 답하고, AI는 추측하지 않는다.

## 5. requiredData로 막는 질문

ROAS · 방문→주문 전환율 · 상품조회→구매 전환율 · 장바구니 이탈률 · GA4 행동 · SNS 성과 (그리고 가입→구매 전환율). `guardrails.canAnswerRoas/VisitorConversion/ProductViewConversion/CartAbandonment` 전부 `false`.

### ROAS/방문자/상품조회/장바구니 질문 처리
* intent를 `unsupported_*`로 분류 → contextNote에 "현재 계산하지 않음 + 필요 데이터(예: ROAS는 광고비·캠페인 attribution)" 블록만 제공.
* answerGuidance에 "숫자를 만들지 말고 필요 데이터를 그대로 안내하라" 추가.
* **0/추정값 절대 미생성**(smoke가 `ROAS 0` 패턴 부재 + "현재 계산하지 않" 포함 검증).

## 6. PII 금지 정책

* 금지 키(`name/phone/email/address/receiverName/customerName/...`)와 fake PII 값(가상고객/010-0000/@example.test/샘플로)이 facts·contextNote에 없음(smoke 검증).
* 가명 `memberKey`도 채팅 출력에 노출하지 않음 — 회원그룹/채널/카테고리/브랜드 같은 집계 라벨만 사용.
* `guardrails.containsPii === false`(facts.piiCheck 위임) + `marketingChatContextContainsPii()` self-check 제공.

## 7. 인과관계 단정 금지

answerGuidance가 "때문에 올랐다/덕분에 증가했다" 표현을 금지하고 "높게 나타납니다 / 집중되어 있습니다 / 확인이 필요합니다" 관찰 표현을 강제. insight summary도 facts builder가 관찰 표현으로만 생성(상위 작업에서 검증됨).

## 8. department chat 연결

`DepartmentWorkspacePanel.handleSend`에 마케팅 분기 추가(상품팀이 `buildProductTeamChatFacts`를 우선 쓰는 것과 동일 패턴):

```
teamId === 'marketing' →
  buildMarketingChatContext(text, { orders: revenue.orders, products, reviews, inquiries, period: { preset: 'all' } })
  → { contextNote, answerGuidance } 를 chatWithTeam 에 전달
  → facts 미준비 시 기존 bundle('marketing')로 fallback
```

* `departmentChatFacts.ts` / `departmentChatService.ts`는 **미수정**(패널 분기 + 신규 서비스로 충분).
* CS/상품/총괄 채팅 경로 무변경 → 회귀 없음(dept-wiring/product-chat/cs-chat/facts-routing smoke 통과).

## 9. 실제 WRITE 없음

순수 함수 서비스 + isCounted 보강 + 패널 분기 + 문서 + smoke. route/네트워크 신규 호출 없음(기존 revenue 재사용), localStorage 변경 없음, 고도몰 WRITE 없음.

## 10. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-team-chat-facts-v0` ✅ 32/32
* 회귀: `smoke-marketing-analysis-dashboard-v0` 30/30 · `smoke-marketing-analysis-facts-core-v0` 34/34 · `smoke-marketing-synthetic-commerce-enrichment-v0` 32/32 · `smoke-marketing-data-coverage-audit-v0` 30/30 · `smoke-department-chat-wiring` 16/16 · `smoke-product-team-chat-grounding` 13/13 · `smoke-cs-chat-inquiry-detail-context` 15/15 · `smoke-department-facts-routing` 12/12.

## 11. 다음 작업 후보

1. **마케팅 채팅 ↔ 기간 동기화** — 대시보드의 기간 필터 선택을 채팅 context period로 전달(현재 채팅은 전체 기간 기준).
2. **insight → 승인 큐(HITL)** — recommendedNextAction을 캠페인 후보로 승인 큐에 제출(WRITE는 승인 후).
3. **카탈로그 라벨 연동** — category/brand 코드 → 이름 주입(채팅/대시보드 공통 가독성).
4. **마케팅 기획·실행팀 분리** — 분석팀(현재) + 기획/실행팀 placeholder 확장.
5. **Member READ Contract v0** — 가입일/성별 → requiredData(가입 코호트/연령) 해제.

---

*문서 끝. (작성 2026-06-29, 브랜치 `feature/marketing-team-chat-facts-v0`, chat smoke 32/32, 회귀 없음)*
