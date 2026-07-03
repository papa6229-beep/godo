# 오늘의 운영 — HQ 지시/보고 채널 + 레거시 관제보드 제거 (V0)

> 2026-07-03 · 눈검수 중 사장님 지적 2건 반영. 완료보고서.

## 배경 (사장님 지적)
1. **중앙 채팅에서 최고관리자가 각 팀에 지시/메시지 보내는 기능이 없다.** (팀 메시지 센터는 있으나 부서 업무 관장→총괄팀에만 노출)
2. 좌측 "부서 관제 보드 · 부서 보기"(레거시 nativeAgentRuntime lastRun)가 **새 전사 브리핑(활동 원장)과 겹친다.**
   추가 지시: 중앙 채팅 하단 **Quick Task Add는 불필요 → 팀 메시지 주고받기로 활용**.

## 처리 (3열 재배치, 레거시 제거)
- **좌: HQ 지시/보고** — 레거시 `TeamOperationsBoard`/`DepartmentCommandPanel`/`OperationBriefingModal` 제거,
  대신 `TeamMessagePanel`(teamId='hq') = 받은 보고 / 보낸 지시 / 새 지시. 최고관리자가 팀에 지시하고 팀·AI 보고를 확인·처리.
- **중앙: HQ AI 채팅 유지** + **Quick Task Add → "📣 팀에 지시" 바로 교체**(팀 선택 + 입력 + 보내기 → HQ→팀 발송).
  - `ChatConsole`에 `quickBarSlot?: ReactNode` 추가(있으면 Quick Task Add 대체). 기존 사용처(다른 탭)는 그대로.
- **우: 전사 브리핑 유지**(활동 원장, 읽기 전용).
- 발송/처리 모두 `teamMessageCenter`(HQ actor={human, hq, '최고관리자'}) + `activityLedger` 기록.

이로써: (1) 최고관리자가 오늘의 운영에서 직접 지시·보고 수신, (2) 팀 상세는 **우측 브리핑(원장) 하나로 일원화**(레거시 중복 제거), (3) Quick Task Add를 팀 지시로 재활용.

## 검증
- `tsc -b`/`lint`/`vite build` 그린. 회귀: ledger 12/0, message-center 22/0, runner 19/0.
- **Playwright E2E**: 오늘의 운영 3열(좌 HQ 지시/보고·중앙 채팅+지시바·우 브리핑) 렌더 확인 →
  중앙 "📣 팀에 지시"에서 상품관리팀에 "품절 상품 응대 우선 처리해주세요" 발송 →
  localStorage 팀 메시지 **HQ(최고관리자)→product** + 활동 원장 **message_sent(hq→product)** 기록 확인.
  (상품팀은 부서 업무 관장 → 상품관리팀 → 팀 간 요청 → 받은 요청에서 수신)

## 참고
- 두 발송 경로(좌측 패널 '새 지시' + 중앙 '팀에 지시' 바)는 같은 스토어를 씀 — 좌측=전체 관리(받은/보낸/새), 중앙=빠른 인라인 지시. 의도된 편의 중복.
- `TaskBoard.tsx`/`TeamOperationsBoard.tsx`/`DepartmentCommandPanel.tsx`는 이제 오늘의 운영에서 미사용(참조 0, 파일은 잔존·무해).
- OfficeView props 인터페이스는 유지(MainLayout 호환), 미사용 board/모달 props는 구조분해에서 제외.

## 다음
- 4단계 **역할 전환기**(총괄/팀장 가시성 스코프).
- (후속) HQ 채팅을 활동 원장/커머스 엔진 인식형으로("상품팀 오늘 뭐 했어?").

## 위치
- 변경: `components/OfficeView.tsx`(재작성), `components/OfficeView.css`, `components/ChatConsole.tsx`(quickBarSlot).
