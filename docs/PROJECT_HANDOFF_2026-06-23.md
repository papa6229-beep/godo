# GODO AI OS — 통합 핸드오프 (2026-06-23)

> **목적**: 내일(또는 다음 세션) 바로 이어서 작업할 수 있도록 프로젝트의 철학·시스템·현재 상태·오늘 작업·다음 할 일을 한 문서에 정리한 인수인계 문서.
> **상위/연관 문서**: `docs/PROJECT_STATE.md`(마스터, §29에 Products READ v0 기록) · `docs/EXECUTION_PLAN_2026-06-22.md`(8단계 로드맵) · `docs/TAB_AUDIT_REPORT_2026-06-22.md`(9탭 실측 감사).
> **이 문서 하나만 읽어도** 컨텍스트 복원이 가능하도록 작성했고, 더 깊은 내용은 위 문서를 참조.

---

## 0. 한 줄 요약 (지금 어디까지 왔나)

**고도몰5 Open API 상품조회(Products READ v0)가 real mode로 main + Production에 반영·검증 완료.** API Bridge 화면 문구도 REAL/Mock 구분되게 정리 완료. LM Studio 로컬 LLM 커넥터 복구는 별도 브랜치에서 대기 중(미머지).

---

## 1. 프로젝트 개요 & 철학

* **프로젝트명**: GODO AI OS — NHN 고도몰 쇼핑몰 운영 업무(주문/CS/리뷰/재고/매출/마케팅)를 **다중 AI 에이전트 협업**으로 보조·자동화하는 통합 운영센터.
* **핵심 메시지**: "AI 직원이 실무(수집·분석·요약·초안)를 하고, **사람이 최종 검토·승인(Human-in-the-loop)**."
* **스택**: React 19 + TypeScript + Vite 8, Vercel(정적 + Serverless Functions), 상태는 대부분 `localStorage` 영속화.
* **핵심 철학 4가지**:
  1. **비즈니스 흐름 중심 UI** — 운영자는 업무 상태/PII 유출 여부/승인 여부를 먼저 본다.
  2. **보안·프라이버시 우선 (PII Guard)** — 고객 개인정보는 외부 LLM/클라이언트에 절대 원문 노출 금지. Secure Proxy/normalizer에서 1차 마스킹.
  3. **Human-in-the-loop** — 환불·가격변경·쿠폰·CS 답변 등록 등 고위험 액션은 AI 직접 실행 불가, 승인 필수.
  4. **Local-First Hybrid AI** — 일상 작업은 로컬 경량 모델(Gemma+LM Studio) 무료 우선, 고난도만 Cloud LLM 선택적.

---

## 2. 시스템 구조 (9개 탭)

| 탭 (라우팅키) | 역할 | 핵심 파일 |
|---|---|---|
| 🏢 오늘의 운영 (`office`) | 운영 대시보드 + 픽셀오피스 + Approval Queue + 로그 | `OfficeView.tsx`, `TaskBoard.tsx`, `ChatConsole.tsx` |
| 🤖 AI 직원 (`agents`) | 9인 에이전트 카드/상세 | `AgentPanel.tsx`, `agents.ts` |
| 📡 데이터 가져오기 (`data`) | CSV/JSON 업로드·정규화·PII 마스킹 | `DataPanel.tsx`, `dataNormalizer.ts`, `privacyMask.ts` |
| 📅 운영일지 (`calendar`) | 일별 운영 요약/이슈 타임라인 | `CalendarPanel.tsx`, `dailySummaryBuilder.ts` |
| 📝 작업기록 (`logs`) | 실시간 액티비티 로그 | `ActivityLog.tsx` |
| 🧠 업무 매뉴얼 (`brain`) | RAG 유사 지식 인덱스(13~14 문서) | `BrainPanel.tsx`, `brainKnowledge.ts` |
| ⚙️ AI 설정실 (`studio`) | 무코드 설정 편집기(에이전트/스킬/도구/권한) | `StudioPanel.tsx`, `defaultStudioData.ts` |
| 🚀 AI 두뇌 설정 (`engine`) | LLM 라우팅·로컬/클라우드 엔진·안전규칙 | `EnginePanel.tsx`, `lmsConnector.ts` |
| 🔌 쇼핑몰 연동 (`api`) | 고도몰 Open API 브릿지 + Secure Proxy | `ApiBridgePanel.tsx`, `api/godomall/*`, `api/_shared/*` |

**데이터 흐름**: 외부데이터/API → Data Connector(정규화+1차 마스킹) → `activeOperationsData` → Workflow Engine → AI Agents → Approval Queue(인간 승인) → Report → Calendar/Logs.

> ⚠️ 알려진 구조적 갭(감사 보고서 기준, 미해결): ① 정책 데이터(Studio/Engine/Brain 편집값)가 런타임 `agentExecutor` if/else에 반영 안 됨, ② 레거시 9에이전트(`agents.ts`) ↔ Native 10에이전트(`defaultNativeAgentRuntime.ts`) 수동 매핑 충돌(`campaign_planner` 누락, `finance↔trend_researcher` 중복), ③ "RAG"는 usageCount/로그만, 실제 프롬프트 주입 없음, ④ ActivityLog만 휘발성. → 이건 EXECUTION_PLAN의 Phase 0~3에서 다룰 큰 과제.

---

## 3. 보안 원칙 (반드시 지킬 것)

* **API Key 절대 격리**: partner_key/user_key/클라우드 키를 프론트엔드 코드·localStorage·sessionStorage·indexedDB·로그·응답 JSON 어디에도 저장/노출 금지. **Vercel 환경변수 + Secure Proxy 서버 사이드 전용.**
* `/api/godomall/health`는 키 **존재 여부(boolean)**만 반환, 원문 미반환.
* **PII 마스킹 이중화**: 서버(`api/_shared/piiMaskGuard.ts`) + 클라이언트(`src/utils/privacyMask.ts`). 외부 LLM 전송 전 비식별 확인.
* **READ-only 원칙**: 현재 Write API(상품수정/재고수정/가격/쿠폰/CS등록) 전면 미연결. Phase 8까지 보류.
* **Vercel ESM 규칙**: `api/**` 상대경로 import는 반드시 `.js` 확장자 포함 (`from '../_shared/x.js'`).
* **Vercel 라우트 규칙**: `_`로 시작하는 파일은 라우트로 배포 안 됨(예: `_shared/`는 import 전용 모듈). 진단 라우트는 언더스코어 없이 명명.

---

## 4. 현재 완료 상태 — Godomall Products READ v0 (★오늘의 핵심)

* **상태**: real mode 연결 + 상품조회 + StandardProduct 매핑 → **main 머지(`b722cee`) + Production 검증 완료.**
* **Production health** (`GET /api/godomall/health`): `ok:true, mode:real, status:ready, productionLocked:true`, write disabled, `hasPartnerKey/hasUserKey/hasRealBaseUrl/hasSandboxBaseUrl=true`(원문 미노출).
* **연결 방식**: 쇼핑몰 직접호출 X → **OpenHub** 도메인, `POST` + `XML` 응답.
  * Real base: `https://openhub.godo.co.kr/godomall5`
  * Sandbox base: `http://sbopenhub.godo.co.kr/godomall5`
  * 인증 파라미터: `partner_key`, `key`
* **검증된 동작**: `Goods_Search.php` 실호출 성공, 관리자 상품수 ↔ GODO Products count 일치(상품 추가 시 12→13 반영).
* **리스트 추출**: 실응답 리스트 경로 `data.return.goods_data`. 추출기는 태그명 비의존(가장 큰 객체 배열=리스트)이라 태그 변동에도 견고.

### 4-1. 확정 Products 필드 매핑 (Goods_Search.php 실응답 기준, `api/_shared/godomallMapper.ts`)
```
goodsNo→productId   goodsCd→productCode   goodsNm→productName
goodsPrice→price(number)   fixedPrice→fixedPrice(number)   totalStock→stock(number)
stockFl→stockEnabled(bool)   soldOutFl→soldOut(bool)
goodsDisplayFl→displayPc(bool)   goodsDisplayMobileFl→displayMobile(bool)
goodsSellFl→sellPc(bool)   goodsSellMobileFl→sellMobile(bool)
cateCd→categoryCode   allCateCd→allCategoryCode
regDt→registeredAt   modDt→modifiedAt
makerNm→makerName   originNm→originName   optionName→optionName
```
* 상태는 6종 boolean으로 분리 보존(단일 status 블롭 금지). price/fixedPrice/stock은 number 정규화. `'y'/'1'/'true'`→true.
* `StandardProduct`는 `type` 별칭(서버 `Record<string,unknown>` 파이프라인 호환).

### 4-2. 서버 모듈 맵 (`api/`)
* `api/_shared/secretGuard.ts` — env 모드/존재여부 해석(키 원문 미반환).
* `api/_shared/godomallOpenApiClient.ts` — real/sandbox base 선택, partner_key/key 주입, 30s timeout, 키 미로그.
* `api/_shared/godomallXmlParser.ts` — fast-xml-parser, header.code/msg 검사, `collectObjectArrays`/`extractList`(견고한 리스트 추출).
* `api/_shared/godomallMapper.ts` — `mapGoodsToProducts`(확정), `StandardProduct`, + 기존 `mapGoodsList`/`mapGoodsToInventory`(inventory 파생, 미변경 유지), `mapOrderList`/`deriveSalesFromOrders`.
* `api/_shared/godomallResource.ts` — 오케스트레이터: real/sandbox 호출 → 실패 시 mock fallback. source: `api_proxy_real`/`api_proxy_sandbox`/`api_mock_fallback`. `GOODS_LIST_KEYS=['goods_data','goods','item','list','row','data']`.
* `api/_shared/{piiMaskGuard,proxyResponse,mockProxyData}.ts` — 기존 유지(마스킹/응답규격/mock fallback).
* 라우트 `api/godomall/`: `health.ts`, `sync.ts`, `products.ts`(신규), `orders.ts`/`inquiries.ts`/`reviews.ts`/`inventory.ts`/`sales.ts`. (임시 `debug-goods.ts`는 **제거됨**.)

### 4-3. 프론트 (`src/`)
* `services/secureProxyClient.ts` — sync 시 `mode:'auto'`(서버 env가 모드 권위), `sourceType`/`errorMessage` 노출, 서버 fallback도 fallback 표기.
* `types/dataConnector.ts` — `DataSourceType`에 `api_proxy_real`/`api_proxy_sandbox`/`api_mock_fallback` 추가.
* `types/proxy.ts` — health 응답에 partner/user/real/sandbox boolean 확장.
* `components/ApiBridgePanel.tsx` — 마운트 시 health 자동 fetch → `isLive` 파생, 모드/출처/마지막 동기화 결과 표시. (products는 snapshot 미적재, count/표시용.)

> **중요**: 모드/REAL 표시의 source of truth는 **서버 env(`GODOMALL_API_MODE`) + `/api/godomall/health`**. 프론트는 그걸 읽어 표시만 함.

### 4-4. 환경변수 (서버/Vercel 전용, `.env.example` 템플릿 참고)
```
GODOMALL_API_MODE=real        # real | sandbox | mock
GODOMALL_PARTNER_KEY=...       # 제휴사키
GODOMALL_USER_KEY=...          # 고도몰5 (테스트)키
GODOMALL_REAL_BASE_URL=https://openhub.godo.co.kr/godomall5
GODOMALL_SANDBOX_BASE_URL=http://sbopenhub.godo.co.kr/godomall5
```
* Preview·Production 각 스코프에 설정. **env 변경 후엔 반드시 Redeploy** 해야 Serverless에 반영.
* env 없으면 자동으로 `mock` 폴백(안전, 안 깨짐).

---

## 5. 오늘(2026-06-23) 작업 로그 (커밋 순)

1. `5e8c9f2` fix: API Bridge overview가 live sandbox/real health 반영 (마운트 health fetch 누락 수정).
2. `9a6e481` fix: Goods_Search 다건 리스트 추출 견고화 + (임시) 진단 엔드포인트.
3. `ed154cc` fix: 진단 라우트 `_debug_goods`→`debug-goods` 리네임(Vercel 언더스코어 라우트 제외 이슈).
4. `64a2bfd` feat: Products READ v0 mapper 실필드 확정(`mapGoodsToProducts`, `StandardProduct`), `goods_data` 키 등록, debug 라우트/헬퍼 제거.
5. `b722cee` **Merge** feature/godomall-read-bridge → main (Products READ v0).
6. `299ed70` docs: PROJECT_STATE §29 등 Production 검증 기록.
7. `28e46f6` chore: API Bridge 문구 정리(copy only) — REAL/Mock 구분.
8. `11e1ff2` **Merge** chore/api-bridge-copy-polish → main.

**문구 정리 내용**: 전역 배지 `LOCAL DEMO MODE`→`LOCAL APP MODE`, `Sync All Mock Resources`→`Sync All Resources`, Sync Source `Secure Proxy Server Mock (추천)`→`Secure Proxy Server (추천)`(+live면 `(REAL READ)`), Products 카드 `Endpoint: Goods_Search.php`/`Source: REAL (Live)`. (Orders 등 비-products 카드는 정직하게 `Sync Mock …` 유지.)

> 별도(분리 진행): LM Studio 커넥터 복구 `c2a9937`(브랜치 `fix/lmstudio-connector`) — URL 조립 견고화(`resolveLmsBase`, `/v1` 1회만, localhost/127.0.0.1:1234는 dev 프록시 경유), 연결테스트를 실제 chat completion으로 전환(성공기준 `object==="chat.completion"` + content), 에러 세분화(endpoint_not_found/server_off/model_not_found/timeout), dev 프록시 타깃 `localhost→127.0.0.1`, 기본 endpoint `http://127.0.0.1:1234/v1`. **main 미머지, 로컬 검증 단계.**

---

## 6. Git / 브랜치 상태 (2026-06-23 종료 시점)

* **main HEAD**: `11e1ff2` (origin/main 동기화 완료). Production Ready.
* **열린 브랜치**:
  * `fix/lmstudio-connector` (`c2a9937`, 원격 푸시됨) — **미머지**. LM Studio 로컬 검증/머지 대기.
  * `chore/api-bridge-copy-polish` (`28e46f6`) — **이미 main에 머지됨**. 삭제 가능(원격에도 있음).
  * 구 브랜치들(`checkpoint/llm-bridge-mvp-local-gemma`, `feature/data-workflow-binding`, `feature/operation-calendar`, `feature/ux-simplified-navigation`) — 과거 작업물.
* **삭제 완료**: `feature/godomall-read-bridge`(머지 후 정리).
* **Repo**: https://github.com/papa6229-beep/godo  ·  **Prod**: https://godo-psi.vercel.app

---

## 7. 내일 바로 시작할 수 있는 작업 후보 (우선순위 제안)

1. **API Bridge UI 문구 정리 마무리/확인** — Production에서 5개 문구 눈 확인(LOCAL APP MODE / Sync All Resources / Secure Proxy Server(REAL READ) / Products 실연동 READ / Source: REAL (Live)). 이상 없으면 `chore/api-bridge-copy-polish` 브랜치 삭제.
2. **Inventory 파생 v0** — Goods_Search 응답의 재고/품절 필드로 inventory 파생(현재 `mapGoodsToInventory`는 기존 로직 유지 상태). Products와 동일하게 real READ로 정합화. (※ 별도 브랜치, READ-only 유지)
3. **`fix/lmstudio-connector` 재개** — 로컬 `npm run dev`로 Gemma 연결테스트 검증(작업기록에서 `method/finalUrl/status/object` 라인 확인) → 성공 시 main 머지. (LM Studio 켜고 `google/gemma-4-e4b` 로드 + 127.0.0.1:1234 서버 ON 전제. Vercel Preview에선 테스트 불가 — dev 프록시 전용/mixed-content.)

> **다음 단계 큰 그림**(EXECUTION_PLAN): Orders/Inquiries/Reviews 라이브(게시판은 `Board_List.php` 매핑 필요, 임의 endpoint 금지) → RAG 실주입(Phase 6) → Auto Run(Phase 4) → Write Action(Phase 8). 구조적 갭(2번 끝 ⚠️)은 Phase 0~3에서.

---

## 8. 작업 규칙 / 검증 (매 작업 공통)

* **검증 3종 필수** (커밋 전):
  ```bash
  npm run lint
  npx tsc --noEmit       # 또는 npm run build (tsc -b + vite)
  npm run build
  ```
* **브랜치 전략**: main 직접 작업 금지 → 작업별 브랜치(feat/fix/chore) → 검증 통과 → `--no-ff` merge → push. 작업 섞지 말 것(예: Godomall과 LM Studio 분리).
* **커밋 메시지 말미**: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
* **고도몰 작업 시 금지**: 임의 json endpoint 생성, Write API, mockProxyData 삭제, 키를 프론트/로그/응답에 노출.
* **신규 세션 컨텍스트 복원**: 이 문서 + `docs/PROJECT_STATE.md`(특히 §29) 읽으면 됨.

---

*문서 끝. (작성: 2026-06-23)*
