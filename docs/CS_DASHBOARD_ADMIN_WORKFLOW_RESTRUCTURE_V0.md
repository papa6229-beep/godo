# CS Dashboard Admin Workflow Restructure v0

> **작업명**: `CS Dashboard Admin Workflow Restructure v0`
> **브랜치**: `feature/cs-dashboard-admin-workflow-restructure-v0`
> **상위 컨텍스트**: `docs/CS_DASHBOARD_KPI_POPUP_UX_REVISION_V0.md` · `docs/CS_INQUIRY_DETAIL_PANEL_ENRICHMENT_V0.md`.
> **성격**: KPI/팝업을 실제 관리자 업무 흐름으로 재편.

---

## 1. 목적

KPI를 [미처리 문의 / 처리완료 문의 / AI 자동처리함 / 고객관리]로 변경. 내부확인은 미처리 문의의 필터/배지로, 미처리 리뷰는 AI 자동처리함 리뷰 탭으로 이동. 고객정보는 CS 처리 화면에서 제대로 표시(AI/타부서/docs/smoke는 PII 차단).

---

## 2. 산출물 / 변경

### 신규
* `scripts/smoke-cs-dashboard-admin-workflow-restructure.mjs` — **20/20 통과**.
* `docs/CS_DASHBOARD_ADMIN_WORKFLOW_RESTRUCTURE_V0.md`(본 문서).

### 수정
* `src/services/csTeamDashboardFacts.ts` — `buildCsAdminWorkflow`(4 KPI 오케스트레이터) + `buildCsResolvedInquiries` + `buildCsCustomerManagementFacts` + `csTypeColorClass` + 타입(`CsAdminWorkflowFacts`/`CsResolvedItem`/`CsCustomerManagementItem`). 기존 helper(buildCsKpiRevision/buildCsDetailItem/buildCsDashboardFacts) 재사용·무변경.
* `src/components/CsTeamDashboard.tsx` — KPI 4카드 + 4팝업(미처리=CsItemPopup 6섹션 상세 / AI함=CsItemPopup+초안·등록(disabled) / 처리완료=CsResolvedPopup / 고객관리=CsCustomerPopup). 타입 색상 배지/라인.
* `src/components/CsTeamDashboard.css` — 타입 색상, disabled 버튼.

> **미변경**: WRITE/발송/전화/알림/Approval 없음. product/marketing/manager 무변경.

---

## 3. KPI 구조

| KPI | 정의 | 보조(예) | 팝업 |
|---|---|---|---|
| 미처리 문의 | 답변/처리 미완료 문의 전체 | AI초안 N · 내부확인 N · 보류 N | 6섹션 상세 + 탭(전체/결제·주문/환불·취소/배송/상품/일반/AI초안가능/내부확인/보류) |
| 처리완료 문의 | answered 계열 이력 | 오늘 N · 최근7일 N · 반복 N | 탭(유형별/반복문의) + 이전답변·처리결과 |
| AI 자동처리함 | **리뷰·배송만** 저위험 일괄 | 리뷰 N · 배송 N | 탭(리뷰답글/배송안내) + 전체/선택 초안 + 등록(disabled) |
| 고객관리 | 고객 단위 이력/위험 | 반복문의 N · 클레임반복 N · 고액 N · 주의 N | 탭(반복/저평점/고액/주의/블랙리스트후보) + 고객 상세 |

**내부확인 필요** = 독립 KPI 제거 → 미처리 문의 필터/배지/상세 처리분류로 이동. **미처리 리뷰** = 독립 KPI 제거 → AI 자동처리함 리뷰답글 탭으로 이동.

---

## 4. AI 자동처리함 정책 (좁게 제한)

* **포함**: 리뷰 답글 + 배송안내. **제외**: 상품문의/결제확인/일반문의/환불·취소/교환·반품 (smoke #3·#4·#5 검증).
* 이유: 리뷰·배송은 정형화·일괄에 적합. 나머지는 문맥/리스크 다양 → 초기 자동처리함 제외.
* **등록 버튼**: "선택 등록"/"전체 등록"은 **disabled** + 안내("WRITE 연결 후 활성화 · AI 자동발송 아님, 운영자 등록 트리거 필요"). 전체/선택 초안 만들기는 미리보기만. **실제 WRITE 없음.**

---

## 5. 고객관리 / PII 정책 (핵심)

* CS 관리자 UI(대시보드/상세/고객관리)에서는 고객정보 **표시**(처리 목적): 회원ID·고객명·연락처·이메일·주문/문의/리뷰/클레임 이력·태그·위험도.
* **차단**: AI prompt/context, 타 부서 context, docs, smoke 기대출력, logs, 장기 분석 데이터.
* 구현: 고객 PII는 helper에 **contacts가 주어진 경로**(=CS UI)에서만 채워짐. contacts 없으면(AI/분석 경로) `name/phone/email` 미포함(smoke #17). bulk KPI counts엔 PII 없음(#18). fake contact는 `isSynthetic` 배지(#13).
* 고객 링크: inquiry/review `orderNo` → order `memberKey` → `csOnlyFakeContacts`.

---

## 6. KPI 결과 (smoke 샘플)

```
미처리: 3 {aiDraftable:2, internalCheck:1, hold:0}
처리완료: 3 (오늘 0 · 7일 1 · 반복 2)
AI자동처리함: 3 {review:2, delivery:1}   ← 상품/결제/일반/환불 제외
고객관리: 3 {repeatInquiry:1, repeatClaim:1, highValue:1, watch:1}
member1: 반복 환불·취소 + 고액 → 주의 고객/블랙리스트 후보 태그, riskLevel high
```

---

## 7. 색상 구분

`csTypeColorClass`: 결제 violet · 환불·취소 orange · 배송 cyan · 상품 pink · 일반 gray · 리뷰 gold · 고객 teal. 배지 + 리스트 좌측 라인(inset box-shadow)으로만 적용(카드 배경 강제 칠 없음, 다크 톤 유지).

---

## 8. 안전 검증 (smoke)

* AI함 리뷰·배송 한정(#2~#5) · 내부확인/미처리리뷰 독립 KPI 제거(#6·#7) · 처리완료 placeholder(#9) · 고객 카운트/태그/위험도(#11·#12) · synthetic 표식(#13) · 색상 token(#14) · helper 순수/WRITE 없음(#15) · CS UI 고객정보 표시(#16) · AI/분석/타부서/bulk PII 차단(#17·#18) · 기존 helper 무회귀(#19).

---

## 9. 한계 / 다음 작업 제안

* 처리완료 "이전 답변 원문"·처리일시는 v0 placeholder(실제 답변 원장 미연동). 처리단계/메모/태그는 local(미영속).
* **다음 작업 후보**:
  1. **CS Draft → Approval Queue HITL**: AI 자동처리함 "등록" → 승인 큐 → 실제 등록(WRITE). 운영자 트리거 유지.
  2. **Board READ v0**: 실제 문의/리뷰/답글 원문·처리완료 상태·회원정보(서버 마스킹) 연동.
  3. **고객 상태/메모 영속화**: 주의/블랙리스트 태그·메모 저장(WRITE 연결 시).

---

## 10. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-dashboard-admin-workflow-restructure.mjs` **20/20** ✅
* 관련 smoke: detail-enrichment 19 · kpi-popup-revision 19 · dashboard-data-layout 20 · runtime-wiring 19 · composer-grounding 22 · associated-order 17 · dept-chat-wiring 16 · aux-routing 18 — 전부 ✅

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-dashboard-admin-workflow-restructure-v0`, smoke 20/20)*
