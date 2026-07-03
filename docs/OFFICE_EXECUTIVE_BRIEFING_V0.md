# 오늘의 운영 재편 — 전사 브리핑(활동 원장 프로젝션) V0 — 배관 3단계

> 2026-07-03 · 역할 기반 재편 배관 3단계. 완료보고서.

## 목표
오늘의 운영을 **최고관리자 전용 읽기 관제**로. 우측 오늘의할일/승인대기(부서 보드와 중복) 제거 → **활동 원장을 읽는 전사 브리핑**으로 교체. 중앙 HQ 채팅·좌측 관제보드 유지.

## 구현
### 신규 `ExecutiveBriefing`(우측, 읽기 전용)
- `components/ExecutiveBriefing.tsx`(+css): **활동 원장(activityLedger) + 팀 메시지(teamMessageCenter)를 읽기만** 함(구독으로 실시간 반영). 실행 버튼 없음.
  - **전사 오늘 요약**: 자동업무 완료 n/N · 팀 간 전달 · 승인 · 대기(합계).
  - **팀별 오늘 활동 카드**: 팀별 `teamSummary`(오늘=로컬 자정 이후) — 자동업무 n/N·전달·승인·대기·최근시각. **클릭 → 상세 팝업**(그 팀 `activityForTeam` 목록: 유형·상태·본문·행위자(AI/사람)·대상·시각).
  - **주의 알림**: 대기/진행 활동 + 미처리 팀 간 요청 수. 클릭 시 팀 팝업으로.
- 팝업 하단 명시: "최고관리자 읽기 전용. 지시는 부서 업무 관장·팀 간 요청 또는 HQ 채팅으로."

### OfficeView 교체
- `components/OfficeView.tsx`: 우측 `TaskBoard`(오늘의할일/승인대기) → `ExecutiveBriefing`. 좌측 `TeamOperationsBoard`·중앙 `ChatConsole` 유지.
  - `TaskBoard` 및 `onSelectTask`/`onSelectApproval`(그 전용) 미사용 → 렌더에서 제거(props 인터페이스는 유지해 MainLayout 호환). `TaskBoard.tsx`는 잔존(참조 0, 무해).

## 검증
- `tsc -b`/`lint`/`vite build` 그린. 회귀: ledger 12/0, runner 19/0, message-center 22/0.
- **Playwright E2E**: 마케팅팀 자동업무 실행(원장 기록) → 오늘의 운영에서 **전사 브리핑에 마케팅 "자동업무 1/1 · 오늘 1건 · 12:53" 반영**, 전사 요약 "완료 1/1", 주의 알림 "미처리 요청 1건" → 마케팅 카드 클릭 → **활동 상세 팝업**(🤖 매출 요약 리포트 · 완료 · AI→총괄팀 · 12:53) 확인. 중앙 HQ 채팅·좌측 관제보드 유지 확인.

## 다음 (남은 재편)
4. **역할 전환기**(총괄/팀장 가시성 스코프) — 오늘의 운영은 총괄만, 팀 보드는 본인 팀만.
- (후속) HQ 채팅을 활동 원장/커머스 엔진 인식형으로("상품팀 오늘 뭐 했어?"), 좌측 관제보드도 원장 기반으로 통합, 오늘의 운영 실행요소 완전 제거(역할 게이팅과 함께).
5. (2단계) 로그인/권한/실시간 백엔드.

## 위치
- 신규: `components/ExecutiveBriefing.tsx`(+css).
- 변경: `components/OfficeView.tsx`.
