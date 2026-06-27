# CS Dashboard KPI/Popup UX Revision v0

> **작업명**: `CS Dashboard KPI/Popup UX Revision v0`
> **브랜치**: `fix/cs-dashboard-kpi-popup-ux-revision-v0`
> **상위 컨텍스트**: `docs/CS_TEAM_DASHBOARD_UX_DATA_LAYOUT_V0.md`(처리판 v0).
> **성격**: 데이터 엔진 신규가 아니라 **KPI/팝업 UX 재구성**. 접수 현황 vs 처리 방식을 분리해 실무 흐름에 맞춤.

---

## 1. 목적

기존 KPI(미답변/긴급/저평점/내부확인)는 "접수된 업무"와 "처리 방식"이 섞여 혼란. 이번에 두 그룹으로 재구성:

```
[접수 현황]  미처리 문의 · 미처리 리뷰
[처리 분류]  AI 자동처리 가능 · 내부확인 필요

공식:  미처리 문의 + 미처리 리뷰 = AI 자동처리 가능 + 내부확인 필요
규칙:  각 미처리 항목은 처리 분류에서 "하나만" (우선순위: 내부확인 > AI 자동처리)
```

---

## 2. 산출물 / 변경

### 신규
* `scripts/smoke-cs-dashboard-kpi-popup-ux-revision.mjs` — **19/19 통과**.
* `docs/CS_DASHBOARD_KPI_POPUP_UX_REVISION_V0.md`(본 문서).

### 수정
* `src/services/csTeamDashboardFacts.ts` — `buildCsKpiRevision(...)` + 타입(`CsKpiRevisionFacts`/`CsKpiInquiryItem`/`CsKpiReviewItem`) 추가. 분류 규칙(접수→처리방식) + breakdown + 카드별 detail items. 기존 `buildCsDashboardFacts`는 그대로(우선처리/주의리뷰/이슈상품용).
* `src/components/CsTeamDashboard.tsx` — KPI를 2그룹 4카드로 재구성(클릭 가능) + **KPI 팝업**(필터 탭·리스트·상세 패널·메모·AI 초안 미리보기). 하단 "저평점/부정 리뷰" → "주의 리뷰"로 명칭 조정.
* `src/components/CsTeamDashboard.css` — KPI 그룹·팝업 스타일.

> **미변경**: WRITE/발송/Approval 없음. product/marketing/manager 무변경.

---

## 3. KPI 재구성

| 카드 | 정의 | 보조(예) | 클릭 시 |
|---|---|---|---|
| 미처리 문의 | 답변완료 아닌 문의 전체 | 오늘 N · 1일+ N · 3일+ N | 팝업(전체/결제·주문/취소·환불/배송/상품/일반) |
| 미처리 리뷰 | 답글 없는 리뷰 전체 | 좋음 N · 보통 N · 저평점 N | 팝업(전체/좋은/보통/저평점/부정) |
| AI 자동처리 가능 | 미처리 중 AI 초안→승인 처리 후보 | 리뷰 N · 배송 N · 일반 N | 팝업 + **전체/선택 초안 만들기**(미리보기) |
| 내부확인 필요 | 사람이 주문/결제/상품/배송 확인 필요 | 결제 N · 환불·취소 N · 상품 N | 팝업(전체/결제/환불·취소/상품/배송) |

**분류 기준(deterministic)**:
* 내부확인: 중복결제 후보 / 주문 매칭 실패(결제) / 환불·취소·반품·교환 완료여부 불명확 / 저평점+상품 결함 신호.
* AI 자동처리: 단순 결제확인(주문 1건 명확) / 배송 안내 / 상품·일반 문의 / 리뷰 답글.

---

## 4. KPI 결과 (smoke 샘플: 문의 8(answered 1 제외 7) · 리뷰 3)

```
intake:  { unresolvedInquiries: 7, unresolvedReviews: 3 }
routing: { aiProcessable: 6, needsInternalCheck: 4 }   ← 7+3 = 6+4 = 10 ✓
aiByType:       { 단순결제확인 1, 배송 1, 상품정보 1, 일반 1, 리뷰 2 }
internalByType: { 결제 2, 환불·취소 1, 상품 1 }
```

---

## 5. 팝업 UX

* 공통: 제목 + 총 건수 + 필터 탭(탭별 카운트) + 리스트 + 상세 패널 + 닫기.
* 리스트 항목: 제목/평점 · 상품명 · 유형 · 경과일 · 처리단계 · 배지(AI 처리 가능/내부확인 필요/사유).
* 상세 패널: 상품/주문연결/유형/접수·경과/처리단계/처리분류/요약 + **내부 메모(local state, v0 미영속)** + (AI 팝업) AI 초안 미리보기.
* **AI 자동처리 팝업만**: 체크박스 + "전체 초안 만들기"/"선택 초안 만들기" → 초안 **미리보기**만(실제 발송/등록 없음). 문의는 `composeCsDraftFromOrders`, 리뷰는 안전 답글 템플릿.

처리단계 v0: AI 자동처리 → "AI 초안 가능", 내부확인 → "내부 확인 중".

---

## 6. 안전 / 역할 경계 (smoke)

* **공식 불변식**(#5)·**겹침 없음**(#6: 내부확인 항목은 AI 후보에서 제외).
* **PII/fake contact/memberKey 미노출**(#16·#17·#18).
* **실제 발송/등록 없음**: 초안은 미리보기만, WRITE/Approval 미연결.
* **마케팅 제안 없음**: 산출물에 광고/캠페인 필드 없음(CS=이슈 공급자).
* **무회귀**: 기존 `buildCsDashboardFacts`(#19) + CS dashboard/runtime/grounding/dept-chat smoke 통과.

---

## 7. 한계 / 다음 작업 제안

* v0 분류는 topic/claim/dup 기반 deterministic — 배송정보없음/상품불량(문의 본문 기반)·반복이슈는 정밀 탐지 미구현(향후 Board READ + 본문 분석).
* 메모는 local state(미영속). 영속화/처리단계 확장은 Approval Queue 연계 시.
* **다음 작업 후보**:
  1. **CS Draft → Approval Queue HITL**: AI 자동처리 "초안 만들기" → 승인 → 등록(WRITE) 연결. 내부확인 카드 ↔ 승인 큐.
  2. **RevenueOrderLite paymentDate/cancelDate(+배송상태) 확장**: 배송/결제일 분류 정확도.
  3. **Board READ v0**: 실제 문의/리뷰/답글 상태 → 미처리 판정 정밀화.

---

## 8. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-dashboard-kpi-popup-ux-revision.mjs` **19/19** ✅
* 관련 smoke: dashboard-data-layout 20 · runtime-wiring 19 · composer-grounding 22 · associated-order 17 · cs-detail 15 · dept-chat-wiring 16 · aux-routing 18 — 전부 ✅

> *문서 끝. (작성: 2026-06-27, 브랜치 `fix/cs-dashboard-kpi-popup-ux-revision-v0`, smoke 19/19)*
