# GODO AI OS — 최종 마스터 보고서 (2026-07-03 FINAL)

> 이 문서 한 장으로 프로젝트 전체를 이해하고 곧바로 이어서 작업할 수 있도록 작성한 **자기완결(self-contained) 보고서**다.
> 내부 이어작업용이자, 외부 AI(Claude·Gemini·GPT 등) 대화창에 그대로 붙여넣어도 이 프로젝트의 의미·구조·스펙·다음 할 일을 파악할 수 있는 수준을 목표로 한다.
>
> - 작성: Claude Opus 4.8 (1M) · 확정 지시자: 사장님(papa6229, 웹디자인 팀장)
> - main HEAD = `0062912` · 이전 판: `docs/MASTER_REPORT_2026-07-03.md`(오늘 오전판, 역할재편까지) → **본 문서가 최신·최종**
> - 다음 재개: **월요일**, "이식된 상세페이지 생성기의 UI/UX 검수·최적화"부터(사장님이 검수 후 보강안 전달 예정)

---

# PART 0. 이 프로젝트가 무엇인가 (의미·목적)

## 0-1. 한 문장
**GODO AI OS = 쇼핑몰(고도몰5 기반)을 "AI 직원들"이 실제로 운영·보조하는 사내 운영센터.** 각 부서(상품·CS·마케팅·디자인)에 AI 팀장/팀원을 두고, 그들이 실데이터를 계산·보고하고, 사람(팀장·총괄)이 그 위에서 지시·승인·관제한다.

## 0-2. 왜 만드는가 (배경)
- 운영 주체는 **국내 최대 성인용품 쇼핑몰**(19세 인증·법적 허용범위 내 정식 사업). 기존 메인몰은 노후 스택(CentOS 6.3 / PHP 5.3 / MySQL 5, 회원 150만, 일 매출 ₩1000만+)이라 직접 개조는 고위험.
- 그래서 **새 고도몰(godomall5)** 을 별도로 세우고, 그 위에 **AI 운영 레이어(GODO AI OS)** 를 얹는 전략. 실제 오픈 목표 **2026-12**. 지금은 **테스트몰 + AI 가치 증명 단계**.
- 성인상품 특성상 **클라우드 LLM(Claude/GPT/Gemini)은 상품 문구·이미지 처리를 거부**한다. → 팀별 AI가 **각자 다른 LLM(특히 로컬 무검열 모델)** 을 붙일 수 있는 구조가 핵심 설계 이유. (예: Super Gemma 4 Uncensored, LM Studio, 추후 회사 서버 배포)

## 0-3. 설계 철학 (불변 원칙)
1. **사람과 AI가 같은 서비스 API를 쓴다(actor 모델).** 모든 행위 주체는 `human | agent`. 지금 사람이 하는 걸 나중에 AI가 그대로 이어받는다.
2. **단일 진실원(Single Source of Truth).** 상태는 활동 원장/메시지센터에 한 번만 기록하고, 각 화면은 그걸 **읽어서 투영**만 한다(중복 상태 금지).
3. **계산은 canonical 엔진 재사용.** 새 질문마다 case/regex/if 추가 금지 — 원시연산(groupBy/seriesBy/join) 조립으로만. (메모리 `marketing-analytics-query-engine`)
4. **배관 먼저, 실제 AI 구성은 마지막에 사장님과.** 백엔드(로그인/권한/실시간)는 실오픈 직전.
5. **추측 금지.** AI의 "실제 업무"는 각 팀장의 실제 업무를 알아야 채운다. 사장님이 유일하게 아는 도메인 = **디자인** → 디자인팀이 첫 레퍼런스.
6. **작업 하나 끝날 때마다 main 머지 + origin push.** (사장님 실시간 눈검수. 메모리 `push-after-each-task`)
7. **일감(work-order)은 자연어로 통째 지시 → end-to-end 실행, 중간 승인 요청 없이.** (메모리 `no-mid-task-approval`)

---

# PART 1. 기술 스택 · 실행 · 배포

## 1-1. 스택
- **프런트**: React 19.2.6 · Vite 8 · TypeScript 6 (strict: `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`)
  - `erasableSyntaxOnly` → **enum 금지**(const object + union으로). `verbatimModuleSyntax` → **타입 전용 import는 `import type`** 필수.
- **상태/저장**: 현재 **localStorage 기반 스토어**(백엔드 스왑 대비 설계). 표준 패턴: `load/save/subscribe + 순수함수 + persist API + actor 모델`.
- **AI 연동**: `aiProviderAdapter` → 클라우드는 서버 라우트 `/api/ai/chat`(키 서버측 보관), 로컬은 LM Studio 등 `/chat/completions`. **현재 텍스트 전용**(멀티모달/vision 미지원 — 확장 지점).
- **커머스 데이터**: 고도몰5 Open API 23종 → 게이트웨이 `api/godomall/read.ts?capability=`(READ). WRITE(goods_insert/update)는 전부 `write_locked`(승인 게이트).
- **배포**: Vercel(Hobby, 함수 12개 제한). 로컬 dev엔 `/api/godomall/*` 실데이터 없음 → **커머스 실수치는 배포에서만** 눈검수.

## 1-2. 실행/검증 명령
```
npm run dev      # Vite dev (예: http://localhost:5186)
npx tsc -b       # 타입체크 (0 이어야 함)
npm run lint     # eslint
npm run build    # vite build (그린 확인)
```
- 각 작업 후 **tsc 0 / lint clean / build green + Playwright 눈검수 + 배포 눈검수(사장님)** 를 관문으로 삼는다.

## 1-3. Git 워크플로
- `feature/<슬러그>` 브랜치 → 작업 → `git checkout main` → `git merge --no-ff` → `git push origin main`.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

# PART 2. 시스템 구조 — 데이터/서비스 계층 (사람·AI 공용)

> 위치: `src/services/`, `src/types/`, `src/data/`. 전부 localStorage, 백엔드 스왑 가능.

| 서비스 | 역할 | 핵심 API |
|---|---|---|
| `teamMessageCenter.ts` | 팀 간 메시지(받은/보낸/새·파일첨부·상태). **actor human/agent** | `postTeamMessage` · `resolveTeamMessage` · `markInboxRead` · `inboxFor` |
| `activityLedger.ts` | **업무 활동 원장(단일 진실원)**. 자동업무 실행·메시지·승인이 여기 기록 | `logActivity` · `teamSummary`(refId dedup: inProgress/done/pending/messagesSent/approvals) · `allTeamsSummary` · `activityForTeam` |
| `agentTaskStore.ts` (+`data/defaultAgentTasks.ts`) | 자동업무 스펙(편집가능, **승인모드**) | CRUD, 팀별 |
| `agentTaskRunner.ts` | canonical 계산(`buildDepartmentSourceOfTruthSnapshot`) → 보고. compute/post 분리, 승인모드 경로 | `runAgentTask`(auto) · `stageApprovalTask`(pending) · `approveAgentTask`(done) |
| `sessionRole.ts` | 세션 역할(누구로 보는가) | `loadRole`/`saveRole`/`subscribeRole` · `isHqRole` · `roleMeta` · `VIEWER_ROLES` |
| `aiProviderAdapter.ts` | LLM 호출 단일 창구(클라우드=서버라우트, 로컬=LM Studio) | `chatWithProvider({providerId, modelIdOverride, purpose, messages, ...})` |
| `aiBrainSettings.ts` | 팀별 AI에 어떤 provider/model을 붙일지 | `resolveAgentBrain(team)` · `isBrainConnected(providerId)` |
| `departmentChatService.ts` | 팀 채팅 응답(페르소나·커머스 질의) | `TEAM_AGENT` · `TEAM_PERSONA` |

**타입**: `types/teamMessage.ts`(`DeptTeamId = 'hq'|'product'|'cs'|'marketing'|'design'` + `DEPT_TEAM_META`), `types/activityLedger.ts`, `types/agentTask.ts`.

**actor 모델**: 모든 행위는 `{ kind: 'human'|'agent', teamId, ... }`. → AI 에이전트가 사람과 동일 경로로 메시지/업무/승인에 참여.

---

# PART 3. 화면(탭)별 기능 — 무엇을 어떻게 보여주는가

헤더에 **역할 전환기(👤)**: 총괄=전체 탭, 팀장=본인 탭만.

## 3-1. 오늘의 운영 (OfficeView) — **총괄(HQ) 전용, 읽기 관제**
- **좌: 부서 관제 보드**(`TeamOperationsBoard`) — 팀별 카드 4칩(진행/완료/전달/승인), 활동 원장 연동. "부서 업무 확인" → `DeptActivityModal`(원장 상세).
- **중앙: HQ 콘솔 채팅**(`ChatConsole`) — 통계/그래프 질문(`answerCommerceQuestion`→`MarketingChartSpecPanel`) + 팀 지시(`HqDirectiveComposer`, HQ→팀 `postTeamMessage`, 파일 첨부).
- **우: 승인·확인 필요**(`ExecutiveBriefing`) — 팀별 크리티컬만(진행중은 처리중이라 제외).
- 총괄은 **실행 불가**(읽기·지시·관제만).

## 3-2. 부서 업무 관장 (DepartmentWorkspacePanel) — **팀장(사람) 실행 공간**
- **좌: 팀 선택**(총괄=전체, 팀장=본인 팀만·자동선택).
- **중앙: 팀 대시보드** — 상품/CS/마케팅은 **커머스 데이터**(KPI·차트, Commerce Query 엔진), **디자인은 작업보드**(아래 3-5).
- **우 탭**: [💬 AI 팀장 지시 | 📨 팀 간 메시지 | 🗓️ 자동 업무 일부].

## 3-3. AI 직원 (Studio) → 자동 업무 (AgentTaskStudio)
- 팀별 자동업무 CRUD + **승인모드 3종**: `auto`(즉시 실행·보고) / `approval`(pending으로 대기 후 승인) / `draft`(초안). Studio↔실행 연결.

## 3-4. 운영일지 등 기타 탭 — 활동 원장 기반 조회.

## 3-5. 🎨 디자인팀 워크스페이스 (DesignTeamDashboard) — **오늘의 핵심**
- 커머스 대시보드가 아니라 **작업 보드**:
  ① **상세페이지 생성기**(이식 완료) — [생성기 열기 →] 전체화면 실행.
  ② **제작 요청 큐**(`inboxFor(messages,'design')`) — 상품팀·총괄에서 온 제작 요청(상태·첨부).
  ③ 진행/완료 카운트.

---

# PART 4. 완성된 운영 루프 (오늘까지)

```
[AI 직원/Studio] 자동업무·승인모드 정의
      │
      ▼
[부서 업무 관장] 팀장이 실행/승인  ─── AI 에이전트도 같은 API로 실행
      │  (runAgentTask → canonical 계산 → AI 명의 보고)
      ▼
[활동 원장] 단일 진실원에 기록
      │
      ▼
[오늘의 운영] 총괄이 읽기 관제 (좌 관제카드 · 우 크리티컬 · 중앙 HQ채팅)
      │
      ▼
[팀 간 메시지] HQ→팀 / 팀→팀 지시·보고·완료 (파일첨부, actor human|agent)
      │
   역할 전환기로 가시성 스코프 (총괄=전체 / 팀장=본인 팀)
```

---

# PART 5. 오늘 한 작업 (시간순 · main 커밋)

## 5-A. 어제 Commerce Query 엔진 위 UX 다듬기
1. join 차트 데이터라벨(`67f002f`) — "문의많은 상품×매출" 막대에 1차 지표 라벨.
2. 상품 대시보드 필터 개편 A안(`ae7f03f`) — 카테고리 클릭이 상단 KPI에 반영(`filteredSnap`).
3. 상품 기간 프리셋 CS 통일 + 팀별 채팅 차트 독립(`00f953b`).
4. 부서 업무 관장 3열 폭 재조정(`0bbf0db`) · 좌측 줄맞춤(`06b7ad1`, keep-all).

## 5-B. 역할 기반 재편 배관 1~4단계
5. 팀 간 소통 센터 v0(`ad265b0`) — `teamMessageCenter` + `TeamMessagePanel`(actor human/agent, 파일).
6. [배관1] 활동 원장(`e6c7352`) + 선행 `agentTaskRunner`(`0a1a159`).
7. [배관2] Studio 자동업무·승인모드(`c52655d`).
8. [배관3] 오늘의 운영 재편(`71e5af3`~) — 좌 관제보드·중앙 HQ채팅(통계/그래프+지시)·우 크리티컬. (중간 좌측을 HQ지시함으로 바꿨다 눈검수로 원복 `ef5e6d8`.)
9. 오늘의 운영 디자인/상태 정리(`2709873`) — 카드 상태 refId dedup(진행/완료/전달/승인), '요청'→'메시지'.
10. [배관4] 역할 전환기(`0924da2`) — `sessionRole` + 헤더 드롭다운 + 탭 게이팅.

## 5-C. 디자인팀 도입 (오후~저녁 — 본 문서의 신규분)
11. **[0단계] 디자인팀 스캐폴드**(merge `8beb852`) — `DeptTeamId`에 `design` 추가 → 팀 메시지·활동 원장·오늘의 운영 오버사이트·역할(디자인팀장)·자동업무에 **자동 연동**. 신규 `DesignTeamDashboard`(작업보드: 생성기 자리 + 제작 요청 큐). 문서 `DESIGN_TEAM_SCAFFOLD_V0.md`.
12. **[1단계a] 상세페이지 생성기 격리 이식 + AI 재연결**(feat `5025c45` / merge `0062912`) — 아래 PART 6 상세. 문서 `DESIGN_TEAM_GENERATOR_PORT_ANALYSIS.md`(분석) · `DESIGN_TEAM_GENERATOR_PORT_DONE.md`(완료).

---

# PART 6. 상세페이지 생성기 이식 (1단계a) — 상세 스펙

## 6-1. 무엇을 이식했나
- 원본: `github.com/papa6229-beep/detail-page-builder` (React19/Vite/TS · Tailwind CDN · html-to-image·jszip·file-saver·react-rnd).
- **성인상품 상세페이지/섬네일을 만드는 반자동 생성기.** 왼쪽 Editor에 상품정보·이미지 입력 → 오른쪽 Preview 실시간 렌더 → **JPG 이미지로 내보내기**(여러 장이면 zip).
- 원본 AI 문구생성은 **OpenRouter(google/gemini-2.0-flash, OpenAI 호환)** 를 직접 호출했으나, **유료 토큰 소진으로 사망** 상태였음.

## 6-2. GODO 내 배치 (`src/components/detailBuilder/`)
```
detailBuilder/
├─ types.ts                    # ProductData·SummaryInfo·OptionItem + ImageType(const object+union으로 변환)
├─ constants.ts                # 테마·프리셋 등 (벤더 원본 + @ts-nocheck)
├─ DetailPageBuilder.tsx       # 전체 앱(레이아웃·상단툴바·상태). default export (벤더 + @ts-nocheck)
├─ components/
│  ├─ Editor.tsx               # 좌측 입력 패널 (벤더 + @ts-nocheck)
│  ├─ Preview.tsx              # 우측 상세페이지 프리뷰 (벤더 + @ts-nocheck)
│  └─ ThumbnailPreview.tsx     # 섬네일 프리뷰 (벤더 + @ts-nocheck)
└─ services/
   └─ geminiService.ts         # ★재작성★ — GODO AI 어댑터 경유 문구생성
```
- **벤더 원본 최소 수정 원칙**: 원본 파일들엔 `// @ts-nocheck` 부여 + eslint `globalIgnores`. → GODO strict 규칙과 충돌 없이 원본을 거의 그대로 유지. (UI/UX 수정 시 이 파일들을 직접 편집하되, 매번 build/화면 확인으로 안전 확보.)
- **필수 변환 2가지**(strict 대응):
  - `enum ImageType` → `const ImageType = {...} as const; type ImageType = ...`(erasableSyntaxOnly).
  - 타입 전용 import → `import type`(verbatimModuleSyntax).

## 6-3. 마운트 방식 (기존 GODO 무수정, 신규만)
- `DesignTeamDashboard.tsx`: `[생성기 열기 →]` 버튼 + `builderOpen` 상태 + **전체화면 오버레이**(`z-index:10000`, GODO 나브 위 완전 커버) 안에 `<DetailPageBuilder/>`. 상단에 `🖼️ 상세페이지 생성기 / ✕ 닫기` 바.
- `DesignTeamDashboard.css`: `.dtd-gen-open`, `.dtd-builder-overlay/-bar/-close/-body`.
- `index.html`: 생성기 전용 **Tailwind Play CDN**(`preflight: false` → 전역 리셋 꺼 GODO 기존 스타일 불변) + Fira/Pretendard 폰트.
- 새 deps: `html-to-image@^1.11` · `jszip@^3.10` · `file-saver@^2.0`(+`@types/file-saver`) · `react-rnd@^10.5`.

## 6-4. AI 문구 연결 (핵심 — geminiService.ts 재작성)
- 죽은 OpenRouter 호출 제거 → `resolveAgentBrain('design') → chatWithProvider(...)`.
- **텍스트(스펙) 기반**: 상품명·브랜드·`summaryInfo`(특징/타입/재질/치수/무게/전원/제조사)를 프롬프트로 → 태그형 출력(`[FEATURE]`,`[POINT1_1]`…) → regex 추출 → `aiFeatureDesc`/`aiPoint1Desc`… 로 `Partial<ProductData>` 반환.
- 디자인팀 AI **미연결 시 명확한 안내 에러**("AI 직원 설정에서 디자인팀 AI 연결" 유도).
- **성인상품 대응**: 클라우드는 거부하므로 설정에서 디자인팀 AI를 **로컬 무검열(Super Gemma 등)** 로 지정하면 그대로 동작. GODO의 팀별 provider 선택 + 로컬 엔드포인트 구조를 그대로 활용.

## 6-5. 검증 결과
- `tsc -b` 0 · `eslint` clean · `vite build` green(199 modules).
- Playwright: 부서 업무 관장 → 디자인팀 → 생성기 열기 → 전체화면 렌더(컬러테마·입력필드·워터마크·AI문구 버튼·라이브 프리뷰 정상) → 닫기 동작. **콘솔 에러 0**(경고 1: "Tailwind CDN은 운영용 비권장" — 무해).

---

# PART 7. 현재 알려진 이슈 · 후속 보강 필요 (우선순위)

## 7-1. [다음, 월요일] 생성기 UI/UX 검수·최적화 ← **사장님 결정: 최우선**
- 기능 추가·업그레이드는 **뒤로 미룸.** 먼저 **본연 기능 정상 동작 + 이식 과정의 사용 편의성** 점검.
- 사장님이 직접 검수 후 **보강안(스크린샷+설명 또는 자연어 리스트)** 전달 → **한 건씩 수정 → 화면 확인 → 통과 → 다음** 방식.
- 수정 대상 파일 지도: 좌측 입력=`components/Editor.tsx`, 우측 프리뷰=`Preview.tsx`/`ThumbnailPreview.tsx`, 레이아웃·툴바·상태=`DetailPageBuilder.tsx`, 오버레이/닫기바=`DesignTeamDashboard.css`.
- 주의: 벤더 파일은 `@ts-nocheck`(타입검사 꺼짐) → 수정 시 **build·화면 확인 반드시 재실행**.

## 7-2. [비차단] 기술 부채
- Tailwind가 **Play CDN**(콘솔 경고 1건). 내부 도구라 무해하나 추후 **build-time Tailwind(PostCSS)** 로 전환 가능.
- 이미지 **vision 문구**: `aiProviderAdapter`가 텍스트 전용 → 멀티모달 확장해야 이미지 기반 카피 가능(현재는 스펙 텍스트만).
- 레거시 死코드 정리 대상: `engine/nativeAgentRuntime/*`(START OPERATION 구동, 미사용), `engine/taskExecutor/taskPlanner/taskRouter`, `TaskBoard.tsx`, `DepartmentCommandPanel.tsx`, `MetricDrilldownModal`. (참조 0·무해. 메모리 `agent-runtime-state`.)

## 7-3. [향후 단계 로드맵]
- **2단계 — 상품팀 → 디자인 워크플로우**: 상품팀이 보낸 **엑셀(여러 브랜드 상품정보)** → 디자인 제작 요청 큐 **프리필**(SheetJS 등 파서, 컬럼 규격 합의) → 팀장이 4명 팀원에게 배분 → 작업 → **매일 검수(검수 보드)**. 산출물 요약·검수 체크리스트 추가.
- **3단계 — 자동 상품등록**: 고도몰5 `goods_insert`(WRITE, 현재 write_locked·승인게이트) 연동. 과거 파이썬 매크로로 하던 등록을 승인 하에 자동화. "등록 준비 완료 데이터"까지가 선행.
- **백엔드 — 실오픈(2026-12) 직전**: 로그인/권한/실시간/데이터 격리. **디자인팀 4명 동시작업**이 다중사용자 백엔드를 정당화(현재 생성기는 클라이언트 완결이라 동시 접속 자체는 무해, 단 배분·검수 등 **공유 협업 상태**는 백엔드 필요).

---

# PART 8. 실무 컨텍스트 (디자인팀 실제 업무 — 시스템 설계 근거)

- **팀 구성**: 사장님(디자인 팀장) + 팀원 4명. AI 에이전트는 **사람 1:1이 아니라 기능별(function)** 로 배치.
- **현행 업무 흐름**: 상품팀이 여러 브랜드 상품정보 **엑셀을 메신저로** 전달 → 팀장이 4명에게 **배분** → 팀원은 상세페이지/섬네일 제작(생성기/포토샵) + **메인몰 관리자에서 상품등록** → 팀장이 **매일 검수**.
- **동시성**: 생성기 작업은 클라이언트 완결(shared-nothing)이라 4명 동시 웹접속 문제 없음. 협업 상태(배분/검수)만 백엔드 대상.
- **이미지 생성은 범위 밖**: 실제 상품 이미지는 벤더 제공, 배경제거(누끼)는 Adobe Express 사용. **AI 이미지 생성은 만들지 않는다.** (배너/이벤트는 외부 AI 생성+포토샵 보정 — 지금 고려 안 함.)
- **성인 콘텐츠 제약**: 클라우드 LLM 거부 → **로컬 무검열 LLM**(Super Gemma 4 Uncensored/LM Studio, 추후 회사 서버)이 정답. 팀원 개인 PC에 로컬AI 없어도 회사 서버로 공용 사용하는 그림.
- **메인몰 직접적용은 보류**: 노후·고위험. 새 고도몰 집중. (read-replica + 마스킹 브리지 패턴은 향후 참고.)

---

# PART 9. 위치·참조 정보

- **브랜치/커밋**: `main` HEAD = `0062912`. 오늘 주요 머지: 역할재편 `0924da2` → 디자인 스캐폴드 `8beb852` → 생성기 이식 `0062912`.
- **오늘 생성 문서**(docs/):
  - `MASTER_REPORT_2026-07-03.md`(오전판, 역할재편까지) · **`MASTER_REPORT_2026-07-03_FINAL.md`(본 문서·최신)**
  - `DESIGN_TEAM_SCAFFOLD_V0.md` · `DESIGN_TEAM_GENERATOR_PORT_ANALYSIS.md` · `DESIGN_TEAM_GENERATOR_PORT_DONE.md`
  - (역할재편 세부: COMMERCE_JOIN_CHART_… · PRODUCT_DASHBOARD_FILTER_… · TEAM_MESSAGE_CENTER_V0 · ACTIVITY_LEDGER_V0 · STUDIO_AGENT_TASKS_APPROVAL_MODE_V0 · OFFICE_EXECUTIVE_BRIEFING_V0 · OFFICE_3ZONE_REWORK_V0 · SESSION_ROLE_SWITCHER_V0)
- **관련 메모리**(`C:\Users\BNN\.claude\projects\D--godo\memory\`): `role-based-restructure-plan` · `agent-runtime-state` · `team-message-center` · `marketing-analytics-query-engine` · `marketing-os-state-2026-06-30` · `godo-shop-open-timeline` · `push-after-each-task` · `no-mid-task-approval` · `godomall-live-api-via-server-route` · `godomall-test-mall-keys` · `reading-pdfs-in-this-env`.
- **데이터 출처**: 부서 대시보드/채팅 = `fetchRevenue`(commerce_universe_v1). 로컬 dev 실데이터 없음 → 커머스 실수치는 **배포에서** 확인.

---

# PART 10. 월요일 재개 체크리스트

1. 이 문서 + `DESIGN_TEAM_GENERATOR_PORT_DONE.md` 읽기.
2. `npm run dev` → 부서 업무 관장 → 🎨 디자인팀 → [생성기 열기] 로 현재 상태 확인.
3. 사장님의 **생성기 UI/UX 보강안** 접수 → 항목별로 `detailBuilder/` 해당 파일 수정.
4. 각 수정마다: `tsc -b` / `build` / Playwright 화면확인 → 통과 시 커밋·머지·**push**.
5. UI/UX 안정화 후에야 2단계(엑셀→요청큐 프리필) 착수 여부를 사장님과 결정.

---
*오늘 완료: 역할 기반 재편 배관(1~4) + 디자인팀 신설(0단계) + 상세페이지 생성기 이식(1단계a). 다음: 생성기 UI/UX 검수·최적화(월요일).*
