# GODO AI OS — 통합 핸드오프 (2026-06-25)

> **목적**: 다음 세션에서 바로 이어서 작업할 수 있도록 오늘 한 작업·현재 상태·다음 할 일을 정리한 인수인계 문서.
> **상위/연관 문서**: `docs/PROJECT_HANDOFF_2026-06-24.md`(어제 핸드오프 = 매출 파이프라인) · `docs/PROJECT_HANDOFF_2026-06-23.md`(프로젝트 철학·시스템 9탭·보안원칙 전체) · `docs/ORDERS_STATUS_AND_REVENUE_DESIGN.md`(주문 상태/매출 설계).
> **프로젝트 철학·시스템·보안원칙은 6/23 핸드오프(§1~3)를 그대로 따른다.** 이 문서는 그 위에 오늘 추가된 **AI 두뇌 연결·라우팅·팀장 채팅** 줄기를 얹는다.

---

## 0. 한 줄 요약 (지금 어디까지 왔나)

**어제까지 "고도몰 데이터를 읽어 대시보드/운영일지로 재구성"하는 단계였다면, 오늘은 그 위에 실제 AI 두뇌(Claude/OpenAI/Gemini/LM Studio)를 GODO 안에서 연결하고, 운영 채팅·AI 직원·부서 팀장 채팅이 그 두뇌로 실제 대화하도록 연결했다.** 상품관리팀 채팅은 데이터 기반(facts)으로 정확히 답하고, 상품 대시보드의 매출 추이 필터(전체/월별/주간별/일별/직접) 의미도 정리했다. 전부 READ-only·키 격리 원칙 유지. **main HEAD `7965df1`, origin 동기화 완료.**

---

## 1. 어제(6/24) 종료 → 오늘(6/25) 시작 컨텍스트

* 어제 종료: main HEAD `84e129b`. 매출 파이프라인(Products/Orders READ → RevenueOrder → Synthetic Revenue/stockImpact → 상품관리팀 대시보드 → 운영일지 매출 바인딩) + Navigation IA v1 + teal 테마 완료.
* 오늘 시작 시 보류 브랜치였던 `feature/inventory-derived-v0`, `fix/lmstudio-connector`를 감사 후 최신 main 위로 재적용(v1)하며 시작 → 이어서 AI 두뇌 연결 줄기를 신설.

---

## 2. 오늘 신설/완성된 줄기 (★핵심: AI 두뇌 연결·라우팅)

```
[AI Providers 탭(🚀 AI 두뇌 설정 → 🧩 AI Providers)]
   OpenAI / Gemini / Claude 카드(키 입력·연결확인·저장·삭제·채팅테스트)  +  LM Studio Local(dev 전용)
        │  연결 키는 aiKeyVault(localStorage, 마스킹)  ·  cloud 실호출은 /api/ai/chat 서버 route 경유(키 미저장)
        ▼
   aiProviderAdapter.chatWithProvider({providerId, ...})  ← 공통 호출 통로
        │  local_lmstudio → lmsConnector,  cloud → /api/ai/chat
        ▼
   aiBrainSettings (기본 AI=Claude, 직원별 brain, resolveAgentBrain, chatAsAgent)
        ├─▶ 운영 채팅(ChatConsole → controlChatService): 기본 AI로 응답, HQ 비서 페르소나, 탭 이동 유지
        ├─▶ AI 직원(AgentPanel/AgentDetailModal/StudioPanel): 직원별 "사용할 AI" 선택
        └─▶ 부서 업무 관장(DepartmentWorkspacePanel → departmentChatService): 팀장 AI 채팅(팀별 페르소나/기록 분리)
                 └─ 상품관리팀: productTeamChatFacts로 코드가 숫자 계산 → Claude는 facts 안에서만 답변
```

---

## 3. 오늘 작업 로그 (머지 순서, 14블록)

> 6/24 종료 `84e129b` → 오늘 HEAD `7965df1`.

1. `d736a1d` **inventory-derived-v1** — 보류 v0 감사 후 최신 main 위 재적용(`godomallInventoryDerive.ts`: Products REAL READ에서 재고 파생). v0은 stale라 직접 머지 대신 cherry-pick으로 충돌 1곳만 정리.
2. `18657ed` **AI Provider Foundation v0** — `fix/lmstudio-connector`(c2a9937) cherry-pick으로 LM Studio 커넥터 복구 + provider 슬롯 구조(`aiProvider.ts`, `aiProviderRegistry.ts`, `AiProviderFoundationPanel`) + EnginePanel '🧩 AI Providers' 탭.
3. `de8817f` **v0.1 Polish** — Production/local dev 구분(LM Studio 테스트 dev 전용), 26B timeout 분리(모델목록 12s/chat 90s), 한국어 에러 문구.
4. `8926d16` **Agent Runtime Provider Bridge v0** — `aiProviderAdapter.chatWithProvider()` 공통 통로 + 패널 내 실행 테스트.
5. `f9596f5` **AI 연결 마법사 v0** — OpenAI/Gemini/Claude 키 입력·연결확인·저장·삭제 + 모델 선택 채팅. `aiKeyVault.ts`, `/api/ai/chat`(+`api/_shared/aiProviderServer.ts`), vite dev 미들웨어로 dev에서도 cloud 동작.
6. `042815f` **v0.1 인라인** — 연결 UI를 각 provider 카드 안으로(별도 하단 섹션 제거), 카드별 접이식 채팅 테스트, `.aip-pane` 스크롤.
7. `6fdc668` **v0.2 모델/에러** — Gemini→gemini-2.5-*, Claude→claude-sonnet-4-6/opus-4-8/haiku-4-5. 404→model_not_found 등 에러 구체화, 직접 입력 가시성.
8. `a3327d0` **Agent Brain Routing Foundation v0** — `aiBrainSettings.ts`(기본 AI=Claude, 직원별 brain, resolveAgentBrain, chatAsAgent). 운영 채팅을 기본 AI 경유로 전환, AI 직원 카드/상세/StudioPanel에 "사용할 AI" 선택.
9. `a85efae` **AI Connection Sync v0.4** — 근본원인: 연결 확인 성공 시 키 미저장. → 연결 확인=자동 저장(key/model/verified), 상태 3단계, 단일 저장소(aiKeyVault)로 카드·채팅·직원 설정 통일.
10. `b79970a` **HQ Chat v0.5** — HQ 채팅 페르소나(의도 우선·운영요약 강제 안 함·모델질문 답변) + 연결 모델 주입 + 탭 이동/새로고침 유지(`hqChatMemory.ts`).
11. `03b9513` **Department Team Chat v0.6** — 부서 업무 관장 우측 채팅 활성화(`departmentChatService.ts`, `departmentChatMemory.ts`). 팀별 페르소나(상품/CS/마케팅/총괄), 팀별 기록 분리, 탭 유지, 실행 전 승인 가드.
12. `1db0ffa` **Product Team Chat Facts v0.7** — `productTeamChatFacts.ts`: 질문 의도 감지 + 코드가 월/전체/카테고리/순위/재고/데이터한계 값 계산 → Claude는 facts 안에서만. "고도몰 관리자 확인" 문구 제거.
13. `7965df1` **Product Dashboard Trend Filter v0.8** — 매출 추이 필터를 "모드=집계 단위(전체/월별/주간별/일별/직접) + 공유 날짜 범위"로 정리. 월별이 일자축으로 나오던 문제 해결, KPI/추이/도넛/순위 동일 기간 기준. **← 가장 최근.**

---

## 4. 오늘 추가/변경된 파일 맵

### 4-1. 서버 (`api/`)
* `api/_shared/aiProviderServer.ts` (신규) — `handleAiChat`: OpenAI/Gemini/Claude fetch 호출+normalize, errorKind 분류. **apiKey는 요청 단위로만 사용, 저장/로그/응답 노출 없음.**
* `api/ai/chat.ts` (신규) — `POST /api/ai/chat`(handleAiChat 재사용).
* `api/_shared/godomallInventoryDerive.ts` (신규, v1) — Products REAL READ 재고 파생.
* `vite.config.ts` — dev에서 `/api/ai/chat` 처리 미들웨어(같은 handleAiChat 재사용). 기존 lmstudio 프록시 유지.

### 4-2. 프론트 서비스 (`src/services/`)
* `aiKeyVault.ts` (신규) — provider별 키/모델 localStorage 저장·마스킹·삭제 + `markProviderConnected`/`isProviderVerified`/`hasUsableProvider`. (`godo_ai_provider_keys_v0`/`_models_v0`/`_verified_v0`)
* `aiProviderAdapter.ts` (신규) — `chatWithProvider`: local→lmsConnector, cloud→`/api/ai/chat`(vault 키 사용).
* `aiBrainSettings.ts` (신규) — 기본 AI(global brain=Claude/claude-sonnet-4-6) + 직원별 brain, `resolveAgentBrain`, `chatAsAgent`, `isBrainConnected`, `providerLabel`. (`godo_ai_global_brain_v0`/`_agent_brains_v0`)
* `hqChatMemory.ts` (신규) — HQ 채팅 기록 영속화(`godo_hq_chat_messages_v0`, 최근 50).
* `departmentChatService.ts` (신규) — 팀→lead agent→brain→chatWithProvider, 팀별 페르소나.
* `departmentChatMemory.ts` (신규) — 팀별 채팅 기록(`godo_department_chat_messages_v0`, 팀별 분리).
* `productTeamChatFacts.ts` (신규) — 상품관리팀 질문 의도 감지 + 데이터셋 값 계산(facts).
* `controlChatService.ts` (변경) — 최종 LLM 호출을 LM Studio 직접→기본 AI(chatWithProvider) 경유로 교체, HQ 페르소나/연결정보 주입.

### 4-3. 프론트 컴포넌트 (`src/components/`)
* `AiProviderFoundationPanel.tsx`/`.css` (신규/대폭) — provider 카드(키/모델/연결확인/저장/삭제/상태 3단계/기본 AI 지정/채팅 테스트).
* `EnginePanel.tsx` — '🧩 AI Providers' 탭 추가.
* `ChatConsole.tsx` — 헤더 "사용 중인 AI / 기본 AI·연결 키 필요", 환영문구 정리, 기록 복원/저장.
* `AgentPanel.tsx`/`.css`, `AgentDetailModal.tsx`/`.css`, `StudioPanel.tsx` — AI 직원 "사용할 AI" 선택/표시(전체 기본 AI 따라가기 / X로 고정).
* `DepartmentWorkspacePanel.tsx` — 우측 팀장 채팅 실연결 + 팀별 기록 + 상품팀 facts 전달.
* `ProductTeamDashboard.tsx`/`.css` — 매출 추이 필터(모드=집계단위 + 공유 날짜 범위) 재정리.
* `aiProviderRegistry.ts`, `types/aiProvider.ts` — provider/brain/chat 타입·모델 목록.

---

## 5. 현재 상태 / 데이터 기준과 한계 (★중요)

* **연결 가능한 AI**: Claude/OpenAI/Gemini(클라우드, 사용자가 GODO 화면에서 키 입력 → 서버 route 경유 실호출) + LM Studio Local(dev 전용). **현재 기본 AI = Claude.**
* **상품관리팀 데이터 기준**: 고도몰 Products REAL READ(13개) + synthetic revenue/order(가상 240건) + stockImpact(가상 재고). 채팅·대시보드 모두 이 데이터셋 기준.
* **상품관리팀 데이터 한계(아직 없음)**: 회원 유형/신규·비회원/연령/재구매율/고객 세그먼트/유입 경로/실제 결제·환불 세부. 이런 질문엔 "없다"고 솔직히 안내(추측 금지).
* **CS팀/마케팅팀/총괄팀 채팅**: 라우팅·페르소나는 동작하나 전용 데이터(Inquiries/Reviews/Campaign/세그먼트)는 **미연결(placeholder)**. facts builder는 상품팀만 존재.
* **dev 한계**: 로컬 `npm run dev`(순수 vite)는 `/api/godomall/*`를 서빙하지 않아 상품 데이터가 비어 대시보드/상품팀 채팅 수치 검증 불가 → **실수치 눈검수는 배포(Vercel) 환경에서.** `/api/ai/chat`은 vite 미들웨어로 dev에서도 동작.

---

## 6. Git / 브랜치 상태 (2026-06-25 종료 시점)

* **main HEAD**: `7965df1` (origin/main 동기화 완료).
* **오늘 머지된 feature 브랜치**(머지 후 정리 가능): inventory-derived-v1, ai-provider-foundation-v0/-v0-1-polish, agent-runtime-provider-bridge-v0, ai-connection-wizard-v0/-v0-1-inline/-v0-2-models, agent-brain-routing-foundation-v0, ai-connection-sync-v0-4, hq-chat-persona-persist-v0-5, department-team-chat-v0-6, product-team-chat-facts-v0-7, product-dashboard-trend-filter-v0-8.
* **보류(미머지)**: `feature/inventory-derived-v0`(v1로 대체됨, 정리 후보), `fix/lmstudio-connector`(복구분 main 반영됨, 정리 후보), 기타 과거 브랜치.
* **Repo**: https://github.com/papa6229-beep/godo · **Prod**: https://godo-psi.vercel.app
* **미커밋 산출물**(커밋 금지): `.playwright-mcp/`, 눈검수 스크린샷 `*.png`, `docs/PROJECT_HANDOFF_2026-06-24.md`(untracked).

---

## 7. 내일 바로 시작할 수 있는 작업 후보

1. **태준님 실키/Production 실검수** — Claude 키로 ① 운영 채팅(모델질문/일상/운영현황) ② 부서 팀장 채팅(상품/CS/마케팅) ③ 상품팀 facts(6월 매출만/전체/카테고리/순위/재고) ④ 대시보드 추이 필터(월별→월축, 일별 6/22~6/28, KPI·도넛 기준 일치) 확인.
2. **AI 직원별 역할·권한·업무 세팅** — 직원별 brain은 선택 가능하나 실제 역할/권한 매트릭스·업무 기준서는 미완. agentExecutor가 `chatAsAgent`를 쓰도록 실연결.
3. **CS/Reviews READ v0 + csTeamChatFacts** — 고도몰 게시판(`Board_List.php`) 매핑 후 CS팀 데이터 facts builder 추가(상품팀 패턴 재사용).
4. **마케팅팀 facts(marketingTeamChatFacts)** — 상품/매출 성과 기반 캠페인 후보.
5. **HQ Run Now / 상품팀 6개월 분석 리포트 / 상품팀→마케팅팀 handoff** — Agent Runtime v2 단계.

---

## 8. 작업 규칙 / 검증 (매 작업 공통)

* **검증 3종 필수**(커밋 전): `npm run lint` · `npx tsc --noEmit` · `npm run build`.
* **브랜치 전략**: main 직접 작업 금지 → 작업별 브랜치 → 검증 통과 → `--no-ff` merge → push. 커밋 말미 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
* **AI 연결 보안**: API key를 브라우저 코드/로그/응답에 원문 노출 금지(마스킹·서버 요청단위 사용·미저장). 클라우드는 서버 route(`/api/ai/chat`) 경유, 브라우저 직접 호출 금지. 고도몰 Write/임의 endpoint 금지. 가상 데이터는 GODO 내부 전용.
* **상품팀 채팅 규칙**: 숫자는 코드(facts)가 계산, "고도몰 관리자에서 확인" 류 문구 금지, 없는 데이터는 없다고 안내.
* **신규 세션 컨텍스트 복원**: 이 문서 + 6/23·6/24 핸드오프 + `ORDERS_STATUS_AND_REVENUE_DESIGN.md`.

---

*문서 끝. (작성: 2026-06-25, main HEAD 7965df1)*
