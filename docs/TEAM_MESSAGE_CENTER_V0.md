# 팀 간 소통 센터 (Team Message Center) V0

> 2026-07-03 · 사장님 지시(자연어) → 1단계(앱 내 요청함, 백엔드 스왑 가능) 구현. 완료보고서.

## 지시 / 맥락
- 동시간대에 각 팀(사람)이 서로 **지원요청·확인요청**을 **메시지 + 파일**로 보내고, **완료** 처리할 수 있는 구조.
- 추가 고려사항: 각 팀 **AI 에이전트가 추후 업무 매뉴얼대로 자동 작업**을 수행 → 이 메시지 구조가 그것과 충돌하지 않아야 함.

## 설계 결정 (논의 후 확정)
- **2단계 로드맵**: (1) 지금 = 앱 내 요청함(localStorage·단일 브라우저·데모), 데이터 모델은 백엔드 이관 가능하게.
  (2) 실사용 전 = 공용 DB+실시간+파일 스토리지로 스토어만 교체 → 진짜 다중 사용자.
- **에이전트 대비 핵심**: "보내는 주체(actor)"가 **사람 또는 AI 에이전트** 모두 표현(`kind:'human'|'agent'`, `agentId`).
  생성·상태전이·완료를 **서비스 함수(순수+persist)**로만 수행 → 사람 UI와 미래 에이전트 런타임이 **같은 API** 호출.
  자동 작업이 요청/보고/완료를 남겨도 동일 스토어에 append될 뿐, UI는 storage 이벤트로 반영(충돌 없음).

## 구현
### 데이터/서비스 (에이전트 대면 API)
- `src/types/teamMessage.ts`: `TeamMessage`(from actor·toTeam·kind·title·body·attachments·status·events…),
  actor/kind/status/attachment 타입, `DEPT_TEAM_META`·유형·상태 라벨 상수.
- `src/services/teamMessageCenter.ts`:
  - 스토어: `loadTeamMessages`/`saveTeamMessages`(localStorage, 300건 cap), `subscribeTeamMessages`(storage 이벤트).
  - 순수 함수(결정적, nowIso 주입): `createTeamMessage`·`markRead`·`setStatus`·`inboxFor`·`outboxFor`·`unreadCountFor`·`openInboxCountFor`.
  - **persist API(사람 UI·미래 에이전트 공용)**: `postTeamMessage`(발신), `resolveTeamMessage`(상태전이·자동완료), `markInboxRead`.
  - 첨부: 데모에선 소형(<1.5MB)만 base64 dataUrl 보관, 초과 시 메타만(`omitted`). 실사용은 2단계 스토리지.

### UI
- `src/components/TeamMessagePanel.tsx`: 받은 요청 / 보낸 요청 / 새 요청(받는 팀·유형·제목·내용·파일첨부·보내기).
  받은 요청에 진행중/완료 버튼, 상태 칩, 첨부 다운로드. 발신 actor=현재 팀 운영자(사람).
- `DepartmentWorkspacePanel.tsx`: 우측 컬럼에 탭 **[💬 AI 팀장 지시] [📨 팀 간 요청(배지)]** 추가.
  팀 카드(좌측)에 **안읽음 배지**. 스토어 구독으로 다른 탭/미래 에이전트 쓰기 반영.
- CSS: 탭·배지·요청 카드·상태 칩·첨부·compose 폼.

## 검증
- `smoke-team-message-center-v0`: **22/0** — 생성(사람/에이전트 actor), 상태전이+이력, inbox/outbox/안읽음/미완료,
  첨부 용량 상한, persist API, **에이전트 actor 자동완료·에이전트 발신** 경로 포함.
- `tsc -b` / `lint` / `vite build`: 그린. 기존 서비스/계산 로직 무변경.
- **Playwright 실화면 E2E**: 상품→CS 지원요청 발신 → CS팀 카드/탭 안읽음 배지 → 받은 요청 카드(발신팀·유형·상태·제목·내용)
  → **완료 처리 시 상태 '완료' 전이** 확인(스크린샷).

## 다음(2단계 / 후속)
- 백엔드(공용 DB + 실시간 + Vercel Blob 파일) 연결 → 진짜 다중 사용자 실시간.
- AI 에이전트 스케줄 런타임이 `postTeamMessage`/`resolveTeamMessage`를 호출해 자동 요청·보고·완료(이미 API 준비됨).
- (후속 UX) 팀 카드 배지를 '안읽음' 대신 '미완료(open)'로 바꿀지 논의 가능.

## 위치
- 신규: `src/types/teamMessage.ts`, `src/services/teamMessageCenter.ts`, `src/components/TeamMessagePanel.tsx`, `scripts/smoke-team-message-center-v0.mjs`.
- 변경: `src/components/DepartmentWorkspacePanel.tsx`, `DepartmentWorkspacePanel.css`.
