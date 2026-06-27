# CS Customer Management Profile Hub v0

> **작업명**: `CS Customer Management Profile Hub v0`
> **브랜치**: `feature/cs-customer-management-profile-hub-v0`
> **상위 컨텍스트**: `docs/CS_WORK_COMPLETION_FLOW_V0.md` · `docs/CS_DASHBOARD_ADMIN_WORKFLOW_RESTRUCTURE_V0.md`.
> **범위**: 고객관리 탭을 회원상세+이력 허브로 재구성. **실제 WRITE 없음. 타 KPI/부서 무변경.**

---

## 1. 목적

고객관리를 "리스트+요약"에서 **회원 상세 + 주문 + 문의/리뷰 + 클레임 + 관리상태 허브**로. 옛 관리자 페이지의 정보량을 카드·탭·클릭 상세로 현대화. 블랙리스트는 별도 KPI가 아니라 고객관리 내부 필터/태그/toggle.

---

## 2. 산출물 / 변경

### 신규
* `src/services/csCustomerManagementFacts.ts` — `buildCsCustomerProfileHub`(요약/기본/주문/문의·리뷰/클레임/관리 + `completed` 병합 + PII 게이트) + `searchCustomerProfiles` + 타입(`CsCustomerProfileHubItem` 등).
* `scripts/smoke-cs-customer-management-profile-hub.mjs` — **22/22 통과**.
* `docs/CS_CUSTOMER_MANAGEMENT_PROFILE_HUB_V0.md`(본 문서).

### 수정
* `src/components/CsTeamDashboard.tsx` — `CsCustomerPopup` → **`CsCustomerProfilePopup`**(좌 고객 리스트 + 검색/필터 / 우 프로필 탭: 요약·기본정보·주문내역·문의/리뷰·클레임·메모/관리상태, 클릭 상세). 메인에서 `buildCsCustomerProfileHub`(completed 병합) 계산해 전달.
* `src/components/CsTeamDashboard.css` — 검색·좌우 비율(36/64)·헤더·프로필 탭·지표 grid·이력 row·상세 스타일.

> **미변경**: 미처리/처리완료/AI함 팝업, 타 KPI, product/marketing/manager. 실제 WRITE/회원수정/블랙리스트 등록 없음.

---

## 3. 고객관리 UX

* **좌측**: 필터 탭(전체/반복문의/반복환불·취소/저평점반복/고액/주의/블랙리스트후보) + 검색(고객명·ID·연락처·이메일·주문번호·상품명) + 고객 카드(이름·ID·연락처·주문/구매금액·문의·클레임·위험도·태그 ≤4 +N, high는 라인 강조).
* **우측 프로필 탭**:
  - **요약**: 헤더(이름·등급·위험·fake/주의/블랙리스트 배지) + 핵심 지표 8카드 + 최근 주문/문의·리뷰/클레임 3블록(클릭 → 해당 탭 상세).
  - **기본정보**: 2열 key-value grid(성명·닉네임·아이디·구분·등급·전화·핸드폰·이메일·주소·생년월일·성별·가입일·가입경로·최근접속·로그인수·SMS·메일·접속허용·적립금·포인트·배송방법). 미연동 필드는 "미연동". 수정 미반영 안내.
  - **주문내역**: 리스트 + row 클릭 상세(결제/배송/금액/상품목록, 송장·쿠폰·적립금 미연동).
  - **문의/리뷰**: 문의·리뷰 리스트 + 클릭 상세(원문/답변/담당직원/처리일/처리방식/등록상태).
  - **클레임**: 환불·취소·반품·교환 리스트 + 클릭 상세.
  - **메모/관리상태**: 주의/블랙리스트 toggle(local) + 메모 + 관리태그 + writeTargets + "local_only(WRITE 미연결)".

좌우 비율 36/64(고객 상세 정보량 ↑).

---

## 4. completedWorkItems 연동

`CS Work Completion Flow v0`의 세션 완료 이력(`completed`)을 허브에 주입 → 문의/리뷰 이력에 병합:
* 문의: `answerText`·`assignee`·`completedAt`·`completionMethod`·`writeStatus` 표시, 상태 "처리 완료".
* 리뷰: `replyText`(답글)·담당직원·처리일 표시.
(smoke: q1 완료 이력이 고객 프로필 문의 탭에 answerText/assignee/completedAt/writeStatus로 반영 확인.)

---

## 5. 고객정보 / PII 정책

| 경로 | 고객 PII |
|---|---|
| CS 관리자 UI(고객관리, contacts 전달) | 표시(처리 목적) — fake는 synthetic 배지 |
| AI context / 타 부서 / docs / smoke / logs | **없음** |

* helper는 `contacts`가 주어진 CS UI 경로에서만 `basic.name/phone/email/address` 채움. contacts 미전달(AI/분석 경로) → basic PII 없음(smoke #21~#23). fake는 `isSynthetic` 배지(#24).

---

## 6. 블랙리스트 / WRITE 대비

* 블랙리스트: 별도 KPI/메인 탭 없음. 고객관리 필터·태그·메모탭 toggle + `byTag.blacklist` 집계.
* WRITE 대비: 각 고객에 `management.writeTargets`(`member_update`/`member_memo`/`blacklist_flag`, memberId) + `writeStatus:'local_only'`. v0 실제 WRITE/등록 없음, UI "WRITE 연결 후 활성화".

---

## 7. 데이터 결과 (smoke 샘플)

```
member1: 주문 3 · 클레임 2 · 위험 high · 태그[반복문의·반복환불·취소·고액·주의·블랙리스트후보]
completed(q1) 병합: 문의 탭에 answerText/assignee(CS팀장)/completedAt/writeStatus(not_connected) 표시
기본정보 미연동 필드(nickname/grade 등)는 undefined → UI "미연동"
contacts 미전달 시 basic PII 없음
```

---

## 8. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-customer-management-profile-hub.mjs` **22/22** ✅
* 관련 smoke(고객관리 팝업 교체로 단언 갱신): work-completion 19 · assignee-layout 15 · popup-ux-polish 19 · admin-workflow 20 · detail-enrichment 19 · kpi-popup-revision 19 · dashboard-data-layout 20 · runtime-wiring 19 — 전부 ✅

---

## 9. 다음 작업 제안

* **CS Draft → Approval Queue HITL**: 완료/관리 트리거 → 승인 큐 → 실제 등록.
* **Godomall WRITE Bridge v0**: writeTargets(member_update/memo/blacklist + inquiry/review reply) 실제 반영.
* 고객 수정/메모/관리상태 영속화, 회원 기본정보 실데이터(Board/Member READ) 연동.

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-customer-management-profile-hub-v0`, smoke 22/22)*
