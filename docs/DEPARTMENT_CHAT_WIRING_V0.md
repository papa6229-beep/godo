# Department Chat Wiring v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/department-chat-wiring-v0`
> **코드**: `src/services/departmentChatFacts.ts` + `DepartmentWorkspacePanel.tsx` · **smoke**: `scripts/smoke-department-chat-wiring.mjs`(16/16)

## 1. 작업 목적
DepartmentFactsBundle을 각 부서 채팅에 **실제 연결**한다. 각 팀이 자기 슬라이스만 보고, 역할 경계대로, facts 숫자만 근거로 답하게 한다. (그래프 팝업/승인 큐 실행/범용 NLP 파서는 아님.)

## 2. Commerce Universe Aux Data Routing과의 관계
`fetchRevenue(..., { includeUniverseAux: true, includeCsFakeContacts: true })`로 받은 `revenue.universeAux`(safe customers/reviews/inquiries + csOnlyFakeContacts)가 bundle 생성의 재료다.

## 3. Department Facts Routing과의 관계
`buildDepartmentFactsBundleFromUniverse({orders, customers, reviews, inquiries, contactsForCsOnly, catalog, source})`로 번들을 만들고, **fake contact는 csTeam.fakeContacts에만** 배치된다(라우팅이 격리).

## 4. 데이터 흐름
```
DepartmentWorkspacePanel
  fetchRevenue(includeUniverseAux+includeCsFakeContacts) → revenue.universeAux 보관
  useMemo: buildDepartmentFactsBundleFromUniverse(...) → DepartmentFactsBundle
  handleSend: buildDepartmentChatContext(team, bundle) → {contextNote, answerGuidance}
  chatWithTeam(team, text, opts)  ← 팀 페르소나 + facts + 역할 지침
```
- 공용 데이터는 **어느 팀을 처음 선택하든 1회 로드**(상품 대시보드 + 모든 부서 채팅 공유).

## 5. 팀별 채팅 역할 (slice만 사용)
| 팀(panel) | bundle slice | context |
|---|---|---|
| 상품팀(product) | productTeam | 매출/상품/카테고리/브랜드 통계 (마케팅 제안 금지) |
| CS팀(cs) | csTeam | 문의/리뷰/클레임 + fakeContacts(가상 표시) (마케팅 제안 금지) |
| 마케팅팀(marketing) | marketingTeam | 상품 handoff + CS handoff + 직접 facts + recommendationCandidates |
| 총괄(hq→manager) | manager | executiveSummary + approvalQueueCandidates |
- 상품팀은 기존 `productTeamChatFacts`(기간 파싱 등)를 **우선** 사용, 미로드 시 bundle/요약 fallback.

## 6. facts 기반 답변 원칙
- 숫자는 facts packet(Analytics Query Engine 계산)만 근거. AI 추측 금지(answerGuidance로 강제).
- 분석/제안은 마케팅팀만. 상품팀/CS팀은 "마케팅팀에 전달 가능"까지만.
- 마케팅팀: 없는 데이터(ROAS/전환/캠페인)는 `requiredData` 안내(adSpend·campaignCalendar·trafficEvents).
- 총괄: 승인/보류/추가조사 후보로 정리, **실제 실행 했다고 말하지 않음**.

## 7. PII guard
- 상품팀/마케팅팀/총괄 context: 연락처/이름/주소/계좌 **없음**(packet 기반, contacts 미포함) — smoke 13.
- CS context: fake contact는 **건수 + metadata 표식만** 노출(원본 이름/전화 미덤프). 사용 시 "synthetic/fake 가상 고객 정보" 명시 지침.
- fake contact origin(isFakePii=true·piiType=fake·syntheticProfile=commerce_universe_v1)은 csTeam.fakeContacts에서 유지 — smoke 6.

## 8. fallback 정책
- 상품팀: bundle/aux 미로드 시 기존 revenue 요약 fallback.
- CS/마케팅/총괄: bundle 없으면 "데이터 로딩 중 — 잠시 후/새로고침" 안내(숫자 추측 금지).

## 9. 수동 검증 질문
- 상품팀: "월별 매출 흐름", "상품별 판매수량 순위", "카테고리별 매출" → 통계 중심, 마케팅 제안 없음.
- CS팀: "미답변 문의", "CS 이슈 많은 상품", "리뷰 평점 낮은 상품" → 이슈 중심, 마케팅 제안 없음.
- 마케팅팀: "상품 통계 + CS 이슈로 제안", "재구매율 높일 방법", "ROAS 가능?" → 분석/제안 + ROAS는 adSpend 필요 안내.
- 총괄: "전체 상황 요약", "마케팅 제안 우선순위", "승인 후보" → 요약 + 승인 후보, 실행 안 함.

## 10. 다음 단계
- ✅ **CS Chat Inquiry Detail Context Patch v0 완료** — CS 채팅이 safe inquiry/review 개별 항목으로 답변(`buildDepartmentChatContext(team, bundle, csDetail)`, `docs/CS_CHAT_INQUIRY_DETAIL_CONTEXT_PATCH_V0.md`).
- **CS Workspace Response Simulation v0**: csTeam.fakeContacts로 응대 초안 생성(가상 표시).
- **Analytics Result Modal v0**: chartHint 기반 그래프 팝업.
- **Approval Queue 실연결**: 마케팅 제안 → 사람 승인 → 실행(Human-in-the-loop).
- 자연어 → QuerySpec 범용 파서.
