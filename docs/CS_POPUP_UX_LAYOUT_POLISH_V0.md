# CS Popup UX Layout Polish v0

> **작업명**: `CS Popup UX Layout Polish v0`
> **브랜치**: `fix/cs-popup-ux-layout-polish-v0`
> **상위 컨텍스트**: `docs/CS_DASHBOARD_ADMIN_WORKFLOW_RESTRUCTURE_V0.md`.
> **범위**: 미처리 문의 / 처리완료 문의 / AI 자동처리함 팝업의 레이아웃·정보 우선순위 재설계. **고객관리 제외.**

---

## 1. 목적

좌측 리스트=빠르게 선택 / 우측 상세=실제 판단. 우측 비중 확대·좌측 컴팩트, 처리완료 상세 강화(질문·이전답변·담당직원), 라이트모드 가독성 개선.

---

## 2. 산출물 / 변경

### 신규
* `scripts/smoke-cs-popup-ux-layout-polish.mjs` — **19/19 통과**.
* `docs/CS_POPUP_UX_LAYOUT_POLISH_V0.md`(본 문서).

### 수정
* `src/services/csTeamDashboardFacts.ts` — `CsDetailOrderBlock`/`CsDetailCustomerBlock` 타입 추출 + `buildOrderBlock`/`buildCustomerBlock` 공유 helper(buildCsDetailItem 리팩터). `CsResolvedItem`에 `questionText`/`prevAnswer`/`handledBy`/`order`/`customer` 보강.
* `src/components/CsTeamDashboard.tsx` — 처리완료 팝업 상세 **6섹션**(기본정보+담당직원 / 질문 내용 / 이전 답변 / 주문 정보 / 고객 정보 / 처리 기록). AI함 등록→"승인요청"(disabled, 승인큐 의미) + 좌측 "승인큐 미연결" 배지. 좌측 카드 컴팩트(긴 사유 배지는 우측 상세로).
* `src/components/CsTeamDashboard.css` — 우측 상세 확대(좌 `1fr` / 우 `1.25fr` ≈ 45/55), 좌측 카드 padding 축소, 라이트모드 가독성 미디어쿼리.

> **미변경**: 고객관리(KPI/팝업/상세/태그) 그대로. WRITE/발송/Approval 백엔드 없음. product/marketing/manager 무변경.

---

## 3. 공통 레이아웃

* `cs-pop-body` grid `minmax(0,1fr) minmax(380px,1.25fr)` → 우측 상세가 더 넓음.
* 좌측 카드: padding 7×9, gap 축소, 3행(제목+유형배지 / 상품+경과 / 상태배지). 긴 internalReason 텍스트는 리스트에서 제거 → 우측 상세 처리분류로.

---

## 4. 처리완료 문의 상세 강화

| 섹션 | 내용 |
|---|---|
| 처리완료 기본 정보 | 제목·유형·상품·주문번호·고객·처리일·처리결과·후속문의·**담당직원** |
| 질문 내용 | 고객 질문 원문(safe excerpt) / 없으면 "문의 원문 없음" |
| 이전 답변 | placeholder("이전 답변 원문 미연동") |
| 주문 정보 | 주문번호·주문일·결제상태·금액·클레임·상품목록 |
| 고객 정보 | 회원ID·고객명·연락처·이메일·최근주문(CS UI 경로만) |
| 처리 기록 | 처리단계·처리결과·담당직원·후속문의 |

* **담당직원**: 데이터 없음 → `미기록` placeholder(v0). 데이터 연결 시 표시.

---

## 5. AI 자동처리함

* 좌측: 유형(리뷰답글/배송안내)·상품·경과·AI 처리 가능·**승인큐 미연결** 배지.
* 우측: 원문 + 주문/리뷰 정보 + 고객 + AI 초안 미리보기 + 액션.
* 액션: 전체/선택 초안 만들기(미리보기) + **"선택/전체 승인요청"(disabled, "승인큐 미연결")**. 실제 WRITE/발송 없음. 승인큐/WRITE 연결 후 활성화(운영자 트리거).

---

## 6. 라이트 모드 가독성

`@media (prefers-color-scheme: light)`: 연한 노랑/시안 텍스트 → 진한 amber(`#92600A`/`#8A5A00`/`#B8860B`)·teal(`#0E7C70`/`#0F766E`)·blue(`#0B72A6`). 배지는 진한 텍스트 + 연한 배경 + 선명한 테두리. 유형 색상 구분은 유지(배지+좌측 라인).

---

## 7. 안전 검증 (smoke)

레이아웃 grid/컴팩트(#1·#2) · 처리완료 질문/이전답변/담당직원/placeholder(#4~#8) · 주문·고객 블록(#9) · AI함 미리보기·승인요청 disabled(#10·#11) · 라이트모드 amber(#12) · 유형 색상 유지(#13) · **고객관리 무변경(#14)** · AI함 리뷰·배송 정책 유지(#15) · **WRITE/네트워크 호출 없음(#16)** · CS UI 고객정보 표시(#17) · AI/분석 PII 차단(#18) · detail helper 무회귀(#19).

---

## 8. 참고: 미존재 의존성

지시서 §12가 참조한 `smoke-cs-draft-approval-queue-hitl.mjs`는 **아직 구현되지 않은 기능(Approval Queue HITL)**이라 저장소에 없어 실행에서 제외. AI함 "승인요청" 버튼은 해당 기능 연결 전 **disabled placeholder**로 둠(백엔드 미구현).

---

## 9. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-popup-ux-layout-polish.mjs` **19/19** ✅
* 관련 smoke: admin-workflow 20 · detail-enrichment 19 · kpi-popup-revision 19 · dashboard-data-layout 20 · runtime-wiring 19 · composer-grounding 22 · dept-chat-wiring 16 — 전부 ✅

---

## 10. 다음 작업 제안

* **고객관리 UX 대개편**(이번 제외 범위).
* **CS Draft → Approval Queue HITL**: AI함 "승인요청" → 승인큐 → 실제 등록(WRITE). 그때 §12 smoke도 신설.
* **Board READ v0**: 처리완료 이전 답변 원문·담당직원·실제 답글 상태 연동.

> *문서 끝. (작성: 2026-06-27, 브랜치 `fix/cs-popup-ux-layout-polish-v0`, smoke 19/19)*
