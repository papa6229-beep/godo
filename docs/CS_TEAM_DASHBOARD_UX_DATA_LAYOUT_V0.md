# CS Team Dashboard UX/Data Layout v0

> **작업명**: `CS Team Dashboard UX/Data Layout v0`
> **브랜치**: `feature/cs-team-dashboard-ux-data-layout-v0`
> **상위 컨텍스트**: `docs/CS_DRAFT_COMPOSER_RUNTIME_WIRING_V0.md` · `docs/CS_INQUIRY_ASSOCIATED_ORDER_CONTEXT_PATCH_V0.md`.
> **성격**: CS팀 중앙 영역을 placeholder → 실제 **처리판(work board)** 으로. 새 API 호출 없이 기존 데이터 재사용.

---

## 1. 목적

CS팀 선택 시 중앙이 "오늘 무엇을 먼저 처리할지"를 한눈에 보여주는 대시보드가 되도록 한다. 분석 리포트가 아니라 **처리판** — 숫자보다 우선순위, 차트보다 리스트.

---

## 2. 산출물 / 변경

### 신규
* `src/services/csTeamDashboardFacts.ts` — 순수 helper:
  * `buildCsDashboardFacts({inquiries, reviews, orders, goodsNames})` → `CsDashboardFacts`
  * `rankCsPriorityInquiries` / `summarizeLowRatingReviews` / `summarizeCsIssueProducts` / `csTopicKo`
  * orderLinked/draftable/needsHumanCheck/riskLevel은 `buildAssociatedOrderFacts` + `composeCsDraftFromOrders`로 deterministic 산출(재사용).
* `src/components/CsTeamDashboard.tsx` + `CsTeamDashboard.css` — KPI/우선처리/리뷰/이슈상품/채팅힌트 렌더.
* `scripts/smoke-cs-team-dashboard-data-layout.mjs` — **20/20 통과**.
* `docs/CS_TEAM_DASHBOARD_UX_DATA_LAYOUT_V0.md`(본 문서).

### 수정
* `src/components/DepartmentWorkspacePanel.tsx` — CS팀 선택 시 중앙에 `<CsTeamDashboard>` 렌더(`renderCsData`), 이미 로드된 `productData.revenue`(universeAux) 재사용. **새 API 호출 없음.** product/marketing/manager 경로 무변경.

---

## 3. 화면 구성 (4영역)

1. **상단 KPI 카드(4)**: 미답변 문의 / 긴급 문의 / 저평점 리뷰 / 내부 확인 필요. + 보조 지표(주문 연결 문의 / 초안 가능 문의 / CS 이슈 상품).
2. **우선 처리 문의 리스트**: 우선순위 번호 + 제목 + 상품명·topic·status·urgency·날짜 + 배지(주문 연결됨/미연결 · 초안 가능/보류 · 내부 확인 필요 · 위험도). 정렬: **긴급+미답변 → 미답변 → 긴급 → 기타**, 동순위는 최신순.
3. **저평점/부정 리뷰**: 상품명·평점·감성·topic·excerpt·날짜 (rating≤2 또는 negative).
4. **CS 이슈 상품**: 상품별 문의수·리뷰이슈수·주요 topic·위험도 집계.
+ **채팅 연결 힌트**: "우측 CS팀장에게 이렇게 물어보세요" + 칩(예: "1순위 미답변 문의 답변 써줘"). 실제 자동실행 버튼 없음(v0 텍스트 힌트).

---

## 4. 데이터 결과 (smoke 샘플)

샘플 입력(문의 6 / 리뷰 3 / 주문 4)에서:

```
KPI: unanswered 5(needs_human 포함) · urgent 3 · lowRatingReview 2 · needsHumanCheck 3
     orderLinked 5 · draftable 6 · issueProduct 3
우선처리 1위: payment 문의 · 모자 · 미답변 · 긴급 · 주문연결됨 · 초안가능 · 내부확인필요 · 위험 높음
```

* `needsHumanCheckCount` = composer `requiresHumanCheck`(중복결제 후보 / 환불·취소·반품·교환 완료 미확정 / 배송 tracking 없음)로 deterministic 산출.
* `orderLinked` = associatedOrderFacts.matched, `draftable` = orderLinked || topic∈{product,general}.

---

## 5. 역할 경계 / 안전 (smoke)

* **마케팅 제안 없음**: 산출물에 광고/캠페인/프로모션 필드 자체가 없음(#20). CS는 이슈 공급자.
* **PII/fake contact/memberKey 미노출**(#15·#16·#17) — 입력도 safe(universeAux), 산출물에도 없음.
* **타 부서 무회귀**: 패널은 CS 분기만 추가, product/marketing/manager 동작·facts routing 무변경(관련 smoke 통과).
* **새 API 호출 없음**: 기존 `fetchRevenue(... includeUniverseAux ...)` 결과 재사용.

---

## 6. 한계 / 다음 작업 제안

* 배송 tracking·결제일/취소일 facts 부재 → delivery·정확 일시는 "확인 필요"로 산출(composer와 동일 한계).
* **다음 작업 후보**:
  1. **CS Draft → Approval Queue 연결**(HITL): needsHumanCheck 건을 승인 큐로. 대시보드 "내부 확인 필요" 카드와 자연 연결.
  2. **RevenueOrderLite paymentDate/cancelDate(+배송상태) 확장**: KPI/리스트 정확도 향상.
  3. **Board READ v0**: synthetic → real 문의/리뷰 전환(입력만 교체, 계약 동일).

---

## 7. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-team-dashboard-data-layout.mjs` **20/20** ✅
* 관련 smoke: runtime-wiring 19 · composer-grounding 22 · associated-order 17 · cs-detail 15 · dept-chat-wiring 16 · aux-routing 18 — 전부 ✅

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-team-dashboard-ux-data-layout-v0`, smoke 20/20)*
