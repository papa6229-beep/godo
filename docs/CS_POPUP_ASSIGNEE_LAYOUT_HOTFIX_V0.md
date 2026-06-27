# CS Popup Assignee & Layout Hotfix v0

> **작업명**: `CS Popup Assignee & Layout Hotfix v0`
> **브랜치**: `fix/cs-popup-assignee-layout-hotfix-v0`
> **상위 컨텍스트**: `docs/CS_POPUP_UX_LAYOUT_POLISH_V0.md`.
> **범위**: Problems 9개 진단 / 미처리 담당직원 필드 / 처리완료 연결 구조 / 팝업 좌·우 비율 재조정. **고객관리 제외.**

---

## 1. Problems 9개 처리 결과

* 위치: `HandoffDetailModal.tsx`(8) + `HandoffDetailModal.css`(1).
* **디스크 실제 파일은 정상**: `Select-String "i1mport"` 매칭 없음, 첫 줄 `import React from 'react';` / `.handoff-detail-overlay {` 정상. `npm run lint` · `npx tsc --noEmit` · `npm run build` 모두 통과.
* IDE 진단(getDiagnostics)에는 여전히 `i1mport` 오류가 남아 있음 → **편집기 미저장 버퍼**의 오타(코드/디스크 문제 아님).
* **조치**: 코드로 고칠 대상 없음(이미 정상). 사용자 편집기에서 두 파일 **Revert File / Reload from Disk**(또는 Ctrl+Z) 필요. **그 버퍼를 저장하면 디스크가 깨지므로 저장 금지.** (작업지시서 §3-2 기준)

---

## 2. 산출물 / 변경

### 신규
* `scripts/smoke-cs-popup-assignee-layout-hotfix.mjs` — **15/15 통과**.
* `docs/CS_POPUP_ASSIGNEE_LAYOUT_HOTFIX_V0.md`(본 문서).

### 수정
* `src/components/CsTeamDashboard.tsx`
  * 미처리 문의 상세 "처리 상태 / 메모"에 **담당직원 input**(datalist: CS팀장/담당자 A/B, placeholder "담당직원 이름을 입력하세요") + `assigneeByItem` local state.
  * 처리 이력에 "현재 담당직원: …" 라인.
  * 미처리/처리완료/AI함 cs-pop-body에 `.wide` 클래스(고객관리는 미적용).
* `src/components/CsTeamDashboard.css` — `.cs-pop-body.wide`(좌 0.85fr / 우 1.35fr ≈ 40/60), 좌측 카드 padding 6×8 추가 축소, 팝업 폭 1040px.
* `src/services/csTeamDashboardFacts.ts` — `CsDashboardDetailItem`에 `assignee?`(미처리→처리완료 연결용, v0 미설정) 추가.
* `scripts/smoke-cs-popup-ux-layout-polish.mjs` — padding 단언을 새 값과 호환(6/7px)되게 갱신(#17 무회귀).

> **미변경**: 고객관리(KPI/팝업/상세/태그) 그대로. 직원 등록 탭/직원 DB/영속 API 없음. WRITE/발송 없음.

---

## 3. 담당직원 구조 (미처리 → 처리완료 연결)

* 미처리: 담당직원 값은 `assigneeByItem[item.id]` local state(팝업 세션 내 표시/유지, v0 미영속).
* 처리완료: 상세에 담당직원 표시 = `handledBy || '미기록'` fallback 유지.
* 타입: `CsDashboardDetailItem.assignee?` 추가 + 처리완료 `CsResolvedItem.handledBy` — 향후 상태 전환 시 미처리 assignee → 처리완료 handledBy로 흘릴 수 있는 공통 구조. (실제 전환/영속화는 Approval/WRITE 단계.)

---

## 4. 레이아웃

* 공통: 기본 `.cs-pop-body` = 좌 1fr / 우 1.25fr 유지(고객관리). **3개 팝업만 `.wide`** = 좌 0.85fr / 우 1.35fr(≈40/60). smoke로 wide 2곳(CsItemPopup 공유=미처리·AI함 / CsResolvedPopup) + 기본 1곳(고객관리) 확인.
* 좌측 카드 padding 6×8, line-height 1.35로 추가 컴팩트.
* 팝업 폭 960→1040px(우측 상세 확대 대응).

---

## 5. 안전 검증 (smoke)

HandoffDetailModal 디스크 정상(#1·#2) · 담당직원 라벨/placeholder/local state(#3~#5) · 처리완료 담당직원·미기록 fallback(#6·#7) · 처리 이력 담당직원(#8) · 좌측 축소/우측 확대(#9·#10) · 3팝업 wide·고객관리 기본 유지(#11~#14) · WRITE/네트워크 없음(#15) · 직원 DB 미추가(#16) · 좌측 카드 컴팩트(#17).

---

## 6. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-popup-assignee-layout-hotfix.mjs` **15/15** ✅
* 관련 smoke: popup-ux-layout-polish 19 · admin-workflow 20 · detail-enrichment 19 · kpi-popup-revision 19 · dashboard-data-layout 20 · runtime-wiring 19 — 전부 ✅

---

## 7. 다음 작업 제안

* 고객관리 UX 개편(사용자 컨셉 설명 후).
* CS Draft → Approval Queue HITL(담당직원·처리단계 영속화 + 미처리→처리완료 상태 전환).
* 직원 등록/담당자 관리 탭(직원 DB).

> *문서 끝. (작성: 2026-06-27, 브랜치 `fix/cs-popup-assignee-layout-hotfix-v0`, smoke 15/15)*
