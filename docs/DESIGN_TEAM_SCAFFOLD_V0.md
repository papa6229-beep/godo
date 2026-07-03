# 디자인팀 스캐폴드 (Design Team Scaffold) V0 — 0단계

> 2026-07-03 · 디자인팀 도입 0단계(집 만들기). 완료보고서.

## 목표
디자인팀(웹디자인)을 시스템에 **1급 팀으로 등록** → 이미 깔린 배관(팀 메시지·활동 원장·오늘의 운영 오버사이트·역할·승인)에 자동 연동. 그 위에 생성기(1단계)·상품팀 워크플로(2단계)를 얹을 **집**을 만든다.

## 구현 (열거에 'design' 추가 + 워크스페이스 신규)
### 팀 등록(배관 자동 연동)
- 타입: `types/teamMessage.ts`(DeptTeamId + DEPT_TEAM_META 🎨), `services/departmentChatMemory.ts`(DeptTeamId + emptyLog), `engine/nativeAgentRuntime/types.ts`(DepartmentId).
- 역할: `services/sessionRole.ts`(ViewerRole + VIEWER_ROLES: **디자인팀장**).
- 열거 배열: ExecutiveBriefing/HqDirectiveComposer/AgentTaskStudio/TeamMessagePanel TEAMS·DIRECTIVE_TEAMS·TEAM_IDS, OfficeView/TeamOperationsBoard DEPT_TO_TEAM, `data/defaultNativeAgentRuntime`(디자인 부서 + `design_lead` 에이전트).
- 채팅: `departmentChatService`(TEAM_AGENT + **디자인 팀장 페르소나**), `departmentChatFacts.toChatTeam`(design 폴백). DepartmentWorkspacePanel handleSend에 **디자인 전용 초기 분기**(커머스 경로 안 탐 → 일반 AI 응답).

### 디자인 워크스페이스(신규)
- `components/DesignTeamDashboard.tsx`(+css): 커머스 대시보드가 아니라 **작업 보드** —
  ① **상세페이지 생성기 자리**("연결 예정", 1단계 이식 지점) ② **제작 요청 큐**(디자인팀이 받은 팀 메시지 = 상품팀 등에서 온 요청, 상태·첨부 표시) ③ 진행/완료 카운트.
- DepartmentWorkspacePanel: `renderDesignData` + 중앙 렌더 분기 + TeamId/TEAMS/engineChartByTeam에 design.

### 자동 연동된 것(추가 작업 없이)
- 좌측 팀 목록에 🎨 디자인팀, 팀 간 메시지(상품팀↔디자인 등), 활동 원장 기록, 오늘의 운영 오버사이트(관제 카드·크리티컬·HQ 지시 대상), **역할(디자인팀장)** 스코프.

## 검증
- `tsc -b`/`lint`/`vite build` 그린. 회귀 smoke: team-message-center 22/0·activity-ledger 12/0·agent-task-store 8/0·agent-task-runner 19/0.
- **Playwright E2E**: 총괄 뷰에서 디자인팀 목록·워크스페이스(생성기 자리·요청 큐) 확인 / **디자인팀장 역할** 전환 시 탭이 "부서 업무 관장" 하나로, 좌측 "내 팀"에 디자인팀만 표시·자동 선택 확인.

## 다음
- **1단계 — 상세페이지 생성기 격리 이식 + AI 재연결**(analysis: `DESIGN_TEAM_GENERATOR_PORT_ANALYSIS.md`). 직전 스파이크: GODO `aiProviderAdapter`의 vision(이미지) 지원 확인.
- 2단계 — 상품팀 엑셀·자료 → 디자인 제작 요청 큐 프리필 / 산출물 요약·체크리스트.

## 위치
- 신규: `components/DesignTeamDashboard.tsx`(+css).
- 변경: types/teamMessage · services/(departmentChatMemory·sessionRole·departmentChatFacts·departmentChatService) · engine/nativeAgentRuntime/types · data/defaultNativeAgentRuntime · components/(DepartmentWorkspacePanel·ExecutiveBriefing·HqDirectiveComposer·AgentTaskStudio·TeamMessagePanel·OfficeView·TeamOperationsBoard).
