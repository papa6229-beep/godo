# 현재 상태 (사실 기준선)

정본 위치: `D:\godo\docs\governance\CURRENT_STATE.md`
최종 갱신: 2026-07-30 (Local migration 5 — 사용되지 않는 `syntheticCommerceFacts` 제거)

**규칙**: 이 문서는 **관측된 사실만** 적는다. 계획·의도·추정은 `MASTER_PLAN.md`에 쓴다.
주장에는 확인 범위를 함께 쓴다(헌법 §10). 확인하지 않은 것은 "미확인"으로 남긴다.

---

## 1. Git·배포

| 항목 | 값 | 확인 방법 |
|---|---|---|
| local main | **2026-07-30 사용자 승인 아래 `codex/b-use-5-preview-acceptance` 를 `--ff-only` 로 통합**(merge commit 없음, **28커밋**). 통합 시점의 값은 문서에 적지 않는다 — **`git rev-parse main` 직접 관측을 우선한다**. 이전 값은 `364f417454a3c4d5ae7a6a503c6fac0fdc9e3864`(B-use-3 HQ 지시 흐름까지) | `git rev-parse main` |
| origin/main = Production Source 기준 | `5190f685ebfc0b7bb686817fa9d37216797171e1` — **변경 없음. 원격 push 는 승인받지 않았고 하지 않았다.** local main 이 이보다 앞선다 | `git rev-parse origin/main` |
| 인증 기능 브랜치 | `fix/auth-foundation-01-red` → `838e2c447f5f7f813845330746e377f156628bde` · **main 미병합** | `git rev-parse` / `git branch --merged main` |
| 직전 작업 브랜치 | `codex/b-use-3-remaining-route-closure` (`364f417`에서 분기, **main 미통합**) · HEAD `c22586b` · Codex 전체검증 통과 → `codex/b-use-2-server-records-decision-input` (`c22586b`에서 분기) HEAD `61296fb`, 문서 조사만 | `git rev-parse` |
| B-use-4 구현 브랜치 | `codex/b-use-4-auth-integration` (`61296fb`에서 분기, **main 미통합**) · HEAD **`e599ce2`** — 인증 선별 통합 + 권한 정본 단일화 + 계정 전환 잔여 경로 마감 · **Codex 독립검증 통과** | `git rev-parse` |
| DB 조사 브랜치 | `codex/b-use-2-db-options-research` (`e599ce2`에서 분기, **main 미통합**) — DB 후보 조사(문서 전용, 제품 코드 0변경) | `git rev-parse` |
| B-use 최종 브랜치 | `codex/b-use-5-preview-acceptance` — B-use-5 Preview 인수검사 결함 7건 마감 + Codex 지적 4건 교정 · 실제 Preview 화면 재확인 통과(2026-07-28) · Local migration 3건. **2026-07-30 local main 에 `--ff-only` 통합됨. 브랜치는 삭제하지 않았다** | `git rev-parse --abbrev-ref HEAD` / `git branch --merged main` |
| B-use 종료·최종 게이트 기준 | **`f8a1e9a403a4aaad29154ad6e2ee4af6b8aa82df`** — Codex 최종 전체 게이트 통과 지점(§2). **문서 커밋이 뒤에 더 쌓여도 이 값은 그대로다** | `git rev-parse f8a1e9a` |
| B-use-5 인수검사 Preview | `https://godo-git-codex-b-use-5-preview-f2d73c-taejuns-projects-e5fc4e75.vercel.app` (Target **Preview** · Status **Ready**). **Production 아님** | Codex 자동화 브라우저 실조작 (2026-07-28) |
| B-use-5 제품 교정·독립검증 기준 | **`bcf91a426c530f07f7d32c0d3454e29fa8c95421`** — Codex 2차 독립검증 통과 지점. **문서 커밋이 뒤에 더 쌓여도 이 값은 그대로다** | `git rev-parse bcf91a4` |
| 브랜치 HEAD | **이 문서에 적지 않는다.** 문서 커밋이 자기 자신을 낡게 만들기 때문이다. **세션 시작 시 `git rev-parse HEAD` 직접 관측을 우선한다** | 헌법 §2 직접 Git 관측 |
| 실행 장소 | **최종 미확정.** 유력 방향 = 회사가 관리하는 서버 또는 고도몰 전용 서버. **개인 데스크톱은 운영 서버로 쓰지 않는다.** 지금은 사용자 컴퓨터·기존 개발환경에서 개발·검사하고, 최종 서버 선택과 시험 이식은 11월 실작동 시험 전에 한다 | 사용자 확정 방향 (2026-07-28) |
| DB | **미결정.** Supabase·Neon·Prisma 중 어떤 것도 채택하지 않았다. 특정 DB·클라우드 어댑터는 지금 구현하지 않는다 | `MASTER_PLAN §11` |
| 실행 환경 | **현재** Vercel 이 개발·검증·Production 을 담당한다. **최종 배포처로 확정된 것은 아니다**(위 '실행 장소' 행 참조) | Vercel 대시보드 관측 |

## 2. 검사·빌드 — **Codex 독립검증 확정 (기준 HEAD `e599ce2`, 2026-07-28)**

**Codex 가 직접 실행한 결과다.** 아래 수치가 현재 기준선이다.

| 항목 | 값 | 확인 방법 |
|---|---|---|
| B-use-4 집중검사 | **206/206 통과** | `node scripts/smoke-b-use-4-auth-integration-v0.mjs` |
| 전체 smoke | **124/124 통과 · 109.4초** | `npm run smoke` |
| manifest | include **124** / exclude **0** | `node scripts/run-regression.mjs --discover` |
| build | 통과 (`tsc -b` + `typecheck:api` + `vite build`) | `npm run build` |
| `tsc -b` | exit 0 | `npx tsc -b` |
| 변경 파일 lint | **오류·경고 0** | `npx eslint <변경 파일>` |
| `git diff --check` | exit 0 | `git diff --check` |
| `npm test` | **exit 0 · 전체 약 131초** | `npm test` |
| 원격 push·배포·환경변수 | **변경 없음** | — |

**과거 기록(삭제하지 않는다)**: 직전 전체 게이트(Codex 실행, `9e38197`)는 smoke **123/123** 이었다. smoke 파일이 124개가 된 것은 B-use-4 통합검사 1건이 추가된 결과다.

**위 기준선 이후 변화(2026-07-28, 브랜치 `codex/b-use-5-preview-acceptance`)**: B-use-5 결함 마감 검사 1건이 추가되어 **manifest include 124 → 125 / exclude 0** 이다.
**현재 기준선 — Codex 2차 독립검증 (기준 `bcf91a4`, 2026-07-28)**: manifest include **125** / exclude **0** · smoke **125/125 통과 · 125.7초** · build(`tsc -b` + `typecheck:api` + Vite build) 통과 · lint 오류 **0**.
위 `e599ce2` 표는 그 시점 기록으로 보존한다(삭제하지 않는다).

**현재 기준선 — Codex 전체 게이트 (기준 HEAD `814f07c`, 2026-07-30)**

**Codex 가 직접 실행했다.** 이 값이 지금의 전체 게이트 기준선이다.

| 항목 | 값 |
|---|---|
| `npm test` | **exit 0** |
| smoke | **125/125 통과 · 113.8초** |
| manifest | include **125** / exclude **0** |
| `tsc -b` | 통과 |
| API 타입검사 | 통과 |
| Vite build | 통과 |
| 전체 lint | 통과 |
| 작업 트리 | clean |

→ **직전 Local migration 묶음(오늘의 운영 헤더 `실제 주문 0건` 표시 교정 · CS 고객 구매금액 계산 정본 단일화)은 Codex 독립검증 완료다.**
**이것은 자동검사 기준이다. 이 게이트로 Preview·Production 을 확인한 것이 아니다**(배포·환경변수 무변경).

**최종 기준선 — Codex 전체 게이트 (기준 HEAD `f8a1e9a`, 2026-07-30) · B-use 종료 판정 근거**

**Codex 가 직접 실행했다. 이 값이 현재 기준선이다.**

| 항목 | 값 |
|---|---|
| 환불 위험 상품 집중검사 | **29/29 통과** |
| `npm test` | **exit 0** |
| smoke | **125/125 통과 · 136.2초** |
| manifest | include **125** / exclude **0** |
| build | `tsc -b` + API 타입검사 + Vite build 통과 |
| 전체 lint | 통과 |
| `git diff --check` | 통과 |
| 작업 트리 | clean |

→ **`analyticsQueryEngine` `refundRiskProducts` 클레임 계약화 Local migration 도 Codex 독립검증 완료.**
**자동검사 기준이다. 이 게이트로 Preview·Production 을 확인한 것이 아니다**(배포·환경변수 무변경).
위 `814f07c` 문단은 그 시점 기록으로 보존한다(삭제하지 않는다).

### 전체 4단계 B-use — 종료 (2026-07-30)

관측된 충족 근거(각각 확인 범위를 함께 적는다):

| 항목 | 근거 | 증거의 종류 |
|---|---|---|
| 핵심 업무 흐름 완주 | HQ 지시 → 팀장 수락·수행 → 결과 제출 → 팀장 확인 → HQ 최종 확인. 원본 메시지·업무·승인·활동 원장이 `inputRefs`(`teammsg:<id>`)·`taskId`·`correlationId` 로 연결 | 집중검사 실행 + 실제 브라우저 |
| 인증·권한·계정 전환 | 가입 신청 → `member`+`pending` → 같은 팀장/HQ 승인 → 보호 API·대시보드. 권한 정본 `effectiveIdentity` 한 곳. 시험 역할 전환기가 인증 모드에서 권한·열람 범위를 넓히지 못하고, 계정 전환 시 이전 계정 상세·승인·보고서 노출 차단 | 집중검사 실행 |
| 실제 Preview 로그인 흐름 | 2026-07-28 Codex 가 **별도 자동화 브라우저**로 Preview 직접 조작. 최종 앱 흐름 브라우저 콘솔 오류 0 | 실제 화면 동작 |
| 실제·시험·미연결·실제 0건 구분 | `dataSourceProvenanceContract` 리소스별 판정 + `screenStateFromRevenue`/`resolveRealOrdersDisplay`/`realOrdersPhrase`. 관제 채팅 헤더 4상태 실행 검사 | 실행 검사 |
| 정식 검사 게이트 | `npm test` exit 0 · smoke **125/125** · manifest include 125/exclude 0(사유 없는 제외 0건) | 자동검사 |

**B-use 종료가 뜻하지 않는 것 (완료로 덮지 않는다)**

- **DB 미결정 · 최종 실행 서버 미확정** — `B_USE_2_DB_OPTIONS_RESEARCH.md` 는 결정자료이지 채택안이 아니다
- **서버 공용 업무기록 어댑터 미구현** — 현재 업무·메시지·승인 기록은 **브라우저 localStorage 중심**이다(§4)
- **시험자료 보존·선택 이관 여부 미결정** — 지금 삭제하거나 변환하지 않는다
- **새 고도몰 API 키 발급 대기**
- **Production 미배포 · 원격 `main` 미푸시 · Vercel 환경변수 무변경**
- **실제 고도몰 READ 계약 검증은 전체 5단계 C 의 일이다**
- **회사 서버 이식과 실작동 시험은 11월 시험 전에 수행한다**

**"B-use 완료 = 전체 프로젝트 완료" 도 "오픈 준비 완료" 도 아니다.**

**local main 통합 (2026-07-30, 사용자 명시 승인)**: `codex/b-use-5-preview-acceptance` → `main` **`--ff-only`**, merge commit 없음, **28커밋**(`364f417` → `8ad9557`). **origin push·배포·환경변수·브랜치 삭제·데이터 변경은 승인 범위 밖이며 하지 않았다.**

> **수치 교정 (헌법 §10)**: 이 줄에 처음 적었던 **27커밋**은 기록 수치 오류다. 결론(통합 사실·방식)이 바뀐 것이 아니라 **분모 시점이 달랐다** — 27은 제품 기준 `f8a1e9a` 시점의 `main..HEAD` 값이고, 실제 통합은 그 뒤에 종료 문서 커밋 `8ad9557` 1개가 더 쌓인 상태에서 이뤄져 **28**이 됐다. 통합 직전 재관측값이 28이다.

주의: 과거 과제의 스모크 8건이 `git status --porcelain`으로 **미커밋 작업 트리**를 검사한다. 제품 파일을 고친 뒤 커밋 전에 `npm test`를 돌리면 그 8건이 실패한다(결함 아님, 커밋 후 통과).

## 3. 고도몰 연결

- 기존 시험몰: 사용자는 **계정 만료**로 알고 있으나, **2026-07-27 07:24~07:25 GMT 관측 시점에 Open API는 정상 응답했다**(아래). 계정 만료와 API 차단 시점이 다를 수 있음 → **사용자 확인 필요**
- 새 판매몰 계정 생성 완료, **개발자 등록·API 키 발급 대기 중**
- 키는 채팅으로 전달받지 않는다. **Preview 환경변수 등록 → 검증 → Production 등록** 순서
- 서버 기본 모드: `GODOMALL_API_MODE` 미설정 시 **`mock`** (`api/_shared/secretGuard.ts:25`). **현재 Production은 `real`**, partner/user 키 present (`/api/godomall/health` 관측 — 값 미확인)

### 상품 13건의 출처 — **확정 (B1-0, 2026-07-27)**

**출처 = 현재 Production에 설정된 real 모드 고도몰 Open API의 실제 응답. 프로젝트 기록상 기존 시험몰 자료로 판단한다. `sourceType: api_proxy_real`은 애플리케이션 실행 경로와 일치한다.**

- 확인 대상: **Production** `godo-psi.vercel.app` / Source `5190f68` / branch `main`
  (최초 13건 관측은 Preview `838e2c4`였고, 두 배포의 조사 대상 코드 경로는 동일)
- `api_proxy_real`은 `godomallResource.ts:187` 한 곳에서만 할당되며 **외부 호출 성공 후**에만 붙는다. 실패 시 mock으로 떨어지는 경로가 **없다**(실패 = `unavailable` + 0건)
- 시뮬레이션 카탈로그는 이 경로에 진입하지 않는다 — `loadSimCatalogV1`은 `resolveResource`가 아니라 Sync All 합성 경로(`:465`)에서만 사용
- **지문 일치의 방향**: `simCatalogV1.data.ts` 매니페스트가 `capturedFrom: '/api/godomall/products (Production, sourceType api_proxy_real)'`라고 스스로 기록한다. 카탈로그가 **이 응답에서 떠 온 사본**이므로 13건이 같은 것이 당연하다(주입이 아님)
- mock fixture는 **4건**이고 productId 체계가 다르다 → 후보 탈락
- CDN 캐시 아님: `x-vercel-cache: MISS` · `age: 0`. 왕복 **1832 ms**는 외부 호출과 양립하는 보조 정황이며, 외부 호출 성공 판정은 코드 분기와 `api_proxy_real` 응답을 함께 근거로 한다
- 라벨이 상태를 구분함(같은 시점 관측): products/inventory **api_proxy_real 13건** · orders **api_proxy_real 0건**(실제 0) · inquiries/reviews **unavailable 0건**(미연결). 소요도 각각 600~3000 ms vs ~220 ms로 갈린다

증거·재현 명령: `docs/governance/evidence/B1-0_PRODUCT_SOURCE_AUDIT.md`

**미확인**: Vercel 함수 런타임 로그 원문 · 시험몰 계정의 실제 만료 상태 · 최초 Preview 관측 시점의 응답 원본(미보존)

## 4. 데이터·저장

- 업무 기록은 **브라우저 localStorage 중심**
- `taskLifecycleStore.ts:16` `MAX_TASKS = 500` · `:52` `slice(-500)` · `:54` 저장 실패를 조용히 무시
- `activityLedger.ts:10` `MAX_EVENTS = 500` · `:37` `slice(-500)`
- → **501번째부터 오래된 이력이 경고 없이 사라짐** (헌법 §5 위반 상태, B5에서 해소)

### 다섯 기록 영역의 저장 구조 — **관측 (B-use-2 준비, 2026-07-28)**

확인 범위: 다섯 영역의 생산자·포트·어댑터·주요 소비자만. 전체 저장소 재감사 아님.
전체 표·계산 변수·재현 명령: `docs/governance/evidence/B_USE_2_SERVER_RECORDS_WORKLOAD.md`

| 영역 | 저장키 | schemaVersion | 건수 상한 | 구독 | 삭제 API | 멱등 키 |
|---|---|---|---|---|---|---|
| lifecycle 업무·결과·승인·수행자 이력 | `godo.rc2.taskLifecycle.v1` | **1** (구형 배열 후퇴 읽기 `taskLifecycleStore.ts:41`) | **500** (`:16,52`) | **없음** | 없음 | HQ 확인요청만 (`taskLifecycleAppAdapter.ts:926-927`) |
| activity ledger | `godo_activity_ledger_v0` | 없음 | **500** (`activityLedger.ts:10,37`) | 있음 (`:43-48`) | 없음 (append 전용) | **없음** |
| team messages | `godo_team_messages_v0` | 없음 | **300** (`teamMessageCenter.ts:14,44`) | 있음 (`:52-57`) | 없음 | **없음** |
| CS completion·처리 이력 | `godo_ai_os.cs_state.v0` | **0** — 불일치 시 **`null` 반환=조용히 버림** (`csLocalStatePersistence.ts:70`) | 없음 | **없음** | **있음** (`:116-120`) | `completionKey`·`csApprovalKey` |
| agent task 정의 | `godo_agent_tasks_v0` | 없음 | 없음 | 있음 (`agentTaskStore.ts:38-43`) | 있음 (`:61`) | `lifecycleTaskId(spec)` (`agentTaskRunner.ts:51`) |

**추가로 관측된 사실**

- **agent task 실행 결과에는 전용 저장소가 없다.** 결과는 팀 메시지 1건 + 활동 원장 1~2건으로 흩어져 저장된다 (`agentTaskRunner.ts:62-78`).
- **다섯 영역 모두 저장 실패를 `catch {}` 로 삼킨다** — 실패 여부를 사용자도 개발자도 알 수 없다 (헌법 §5 “저장 실패를 숨기지 않는다”와 어긋나는 현재 상태).
- **모든 쓰기가 전체 목록 재작성이다** (`activityLedger.ts:126-128` · `teamMessageCenter.ts:122-143` · `taskLifecycleStore.ts:65-82` · `agentTaskStore.ts:56-65` · CS 는 전체 객체 `CsTeamDashboard.tsx:810-817`).
  **동시 저장의 현재 의미 (2026-07-28 표현 교정)**
  - **다른 직원의 브라우저**: localStorage 를 공유하지 않는다 → 서로 덮어쓰는 것이 아니라 **각자 고립돼 보이지 않는다.**
  - **같은 브라우저의 여러 탭**: localStorage 를 공유하므로 전체 배열 재저장 과정에서 **덮어쓰기가 발생할 수 있다**(현재도).
  - **서버로 옮긴 뒤**: 전체 배열 교체 방식을 그대로 쓰면 다중 사용자 **lost update** 가 생긴다 → 행 단위 저장 필요.
- **화면의 저장 구현 직접 import 0건** (facade 경계 유지). facade 사용 화면 9개 파일, lifecycle 어댑터 사용 화면 10개 파일.
- **다섯 영역의 저장 API 는 전부 동기(sync)** 다. 선례 Postgres 포트는 async(`api/_shared/marketingBehaviorPersistentStore.ts`) → `repositories/README.md:6` 의 “저장소 교체 시 화면 무변경” 주장은 **localStorage 계열 교체에는 성립하지만 네트워크 저장에는 성립하지 않는다.**
- **첨부 base64 가 저장량의 지배 변수다.** 텍스트 레코드는 **412 B ~ 1,218 B**(실측)인데 팀 메시지 첨부 1건은 **약 1.2 MB**(실측, 원본 900KB → base64 1.33배). 인라인 상한은 원본 1.5MB (`teamMessageCenter.ts:16,61`) → 최대 약 2.0MB/건.
- lifecycle 은 base64 유입을 차단한다(`taskLifecycleStore.ts:23-32`, 실측으로 확인). **첨부 원문을 보관하는 곳은 팀 메시지뿐이다.**
- **CS 완료 기록에 고객 이름·전화·이메일 필드가 있고 저장 경로가 연결돼 있다** (`csTeamDashboardFacts.ts:496-504` · `CsTeamDashboard.tsx:902,913`). 현재 값은 합성이고 문의·리뷰는 미연결이라 **오늘 실제 PII 는 없다.** C단계에서 실데이터가 연결되면 그 시점부터 실제 PII 가 저장된다.
- **백업·export 수단이 없다** (다섯 영역 전수 검색 0건).
- 재사용 가능한 선례: `api/_shared/marketingBehaviorStorageTypes.ts`(포트) ← `marketingBehaviorPostgresStore.ts`(어댑터, lazy Pool `:50-58` · 자동 DDL 없음 · 비밀값 미노출) ← `marketingBehaviorPersistentStore.ts:80-107`(env 감지 선택기). `pg@^8.22.0` **이미 설치됨**.
- 데이터 세계가 둘: `activeOperationsData`(적재 스냅샷, 소비자 12파일 + `src/engine` 2파일) / `fetchRevenue`(라이브 읽기, 호출자 3곳, **공유 캐시 없음·인자 상이**)

### 재고위험 판정 — **단일화 완료 (B-core-2a, 2026-07-27)**

**판정 정본은 `src/services/inventoryRiskContract.ts` 하나다.** 같은 상품의 재고위험 여부가 A 화면과 B 화면에서 갈리지 않는다.

- 추가: `classifyStockRiskWithSaleState(input)` — 우선순위 ① `soldOut===true` → `out_of_stock` ② `stockEnabled===false` → `ok`(무제한) ③ 그 외(신호 없음 포함) → 기존 `classifyStockRisk`
  → 신호 없는 CSV/JSON 업로드는 ③으로 떨어져 **기존 계약과 동일**
- `StockRiskBasis`(`sold_out_flag`/`unlimited_stock`/`stock_number`)로 판정 근거 보존
- 제거: `godomallInventoryDerive.DEFAULT_SAFETY_STOCK = 3` · `computeInventoryStatus`
  → Goods_Search 응답에 상품별 안전재고 필드가 없는데 `'3'`을 실으면 계약의 `resolveSafetyStock`이 이를 **유효한 상품별 값**으로 받아 정본 기본값 5가 적용될 여지를 없앤다. 근거 없으면 빈 문자열로 보존
  → `computeInventoryStatus`의 `status` 출력은 **소비자 0건**(전수 검색)인 dead output이면서 판정 규칙만 한 벌 더 존재했다
  → api 번들이 브라우저 계층을 import 하지 않도록, **계약을 끌어오는 대신 판정을 걷어냈다**(api→src import 선례 0건 유지)
- `dataNormalizer.normalizeInventoryItem`: 자체 2갈래 분기(임계 `<=` vs `<`) 제거 → 계약 호출
- `agentExecutor.ts`: `item.stock <= item.safetyStock` 직접 비교 제거(**계약 우회 3건 중 1건 해소**)
- `StandardInventoryItem.status`에 **`'unknown'` 추가** — 해석 불가 재고를 정상으로 숨기지 않는다
  → `AiBriefing.tsx:35`(`warning||danger` 판정)와 `DataPanel.tsx:899`(초록 `success` 배지)에서 unknown이 조용히 정상으로 보이던 것 보정

**재고 임계 직접 비교 전수 재검색**(`src/` + `api/`, 계약 파일 제외, 정규식 `stock\s*[<>]=?\s*(\w+\.)*(safetyStock|0)`): **0건**

**행동이 바뀐 지점**(의도된 교정)
| 대상 | 이전 | 이후 | 이유 |
|---|---|---|---|
| 고도몰 파생 재고의 안전재고 | 3 (조작된 값) | 정본 5 (전역 기본값) | 근거 없는 값을 만들어내지 않는다 |
| CSV/JSON 업로드 경계값 | `stock < safetyStock` | `stock <= safetyStock` | 계약 기준. `stock === safetyStock`이 이제 위험 |
| 경고 문구(비파생 경로) | "…보다 적습니다" | "…이하입니다" | 계약이 `<=`이므로 이전 문구가 부정확했다 |
| 비수치·누락 재고 | `status='ok'` (숨김) | `status='unknown'` | 헌법 §10 — 확인 못한 것을 정상으로 단정하지 않는다 |

검사: `scripts/smoke-b-core-2a-inventory-risk-single-source-v0.mjs` **43/43** · `audit-b-core-2-ab-parity.mjs` **[재고] RED 없음**

### A/B 데이터 세계 차이 — **실측 (B-core-2, 2026-07-27)**

동일 raw fixture(주문 10건·상품 6건)를 A·B로 투영해 **기존 공통 계약으로** 계산한 결과, 비교 20축 중 **10축 일치 / 10축 불일치**.

**일치한 축**: 전체 주문 수 · B 내부 일관성(중첩 `state` ↔ 평탄 `Lite`) · 출처 판정 6종(실제/실제 0건/시험(시험모드)/시험(실제요청=fail-closed)/합성/연결 안 됨)
→ **실제·시험·미연결 구분은 이미 하나의 계약으로 서 있다.**

**불일치한 축** (분류: 구조=A에 필드 없음 · 계산=같은 이름 다른 식 · 입력=계약은 옳으나 입력 부족)

> **갱신 (B-core-2a, 2026-07-27)**: 아래 불일치 중 **재고 관련 축은 해소**됐다(위 절 참조). 남은 RED는 **주문 7축**이며 출처 8축은 계속 일치한다.
> 현재 audit 결과: **전체 14/21 축 일치 · [재고] RED 없음 · [주문] RED 7축 · [출처] RED 없음**.
> 아래 표는 B-core-2 시점의 최초 실측 기록이다. **과거에도 일치했던 것처럼 고치지 않는다.**

| 축 | A | B | 분류 |
|---|---|---|---|
| 유효 주문 수 | 0 | 5 | 구조 (`StandardOrder`에 `paid`/`canceled`/`totalAmount` 없음) |
| 취소 주문 건수 | 표현 불가 | 2 | 구조 |
| 상품 라인 매출 | 0 | 416,000 | 구조 (`lines` 없음) |
| 배송비 합계 | 0 | 5,500 | 구조 (`deliveryFee`가 `mapOrderList` 출력에서 탈락) |
| 운영매출 | 0 | 210,500 | 구조 |
| 결제완료 건수 | 9 | 7 | **계산** — `godomallMapper.ts:328` `hasPaymentDate \|\| isPaidStatus` vs `godomallRevenue.ts:199` `isValidDate && orderStatus!=='o1'` |
| ~~기본 안전재고 상수~~ | ~~**3**~~ | ~~**5**~~ | **B-core-2a 해소** |
| ~~재고위험 건수~~ | ~~3~~ | ~~4~~ | **B-core-2a 해소** |

- **`isValidOrder`·`classifyStockRisk` 계약의 소비자는 전부 B 세계다. A 세계 소비자는 0건.**
  → 위 `A: 0`은 "지금 화면에 0원이 나온다"가 아니라 "A 투영은 공통 계약에 넣을 수 없다"는 뜻
- ~~**지금 화면에서 실제로 다른 값**: **재고위험 건수**~~ → **B-core-2a 에서 해소.** 아래는 당시 관측 기록이다. A(`DataPanel:609`·`AiBriefing:35`·`reportComposer:35,80`·`controlChatService:158,415`·`dailySummaryBuilder:101`)와 B(`CalendarPanel:102`·`ProductTeamDashboard:582`·`departmentDataSourceOfTruth:172`·`productTeamChatFacts:431`)가 다른 기준을 쓴다
- ~~재고 임계 구현이 **네 곳**으로 갈라져 있음~~ → **B-core-2a 에서 계약 한 곳으로 통합**(직접 비교 전수 0건)
- 실제 데이터 경로에는 `stockImpact`가 **아예 생성되지 않는다**(`godomallResource.ts:490` 합성 전용)
- `CalendarPanel.tsx:14`는 `activeOperationsData`를 prop으로 받지만 **본문 참조 0건** — 그 화면은 B만 소비
- `OfficeView.tsx:75`는 `.catch(() => {})`로 실패를 무시하고 `orders.length>0`일 때만 상태를 세팅 → **실패와 "실제 0건"이 화면에서 구분되지 않음**

증거·재현 명령·전체 차이표: `docs/governance/evidence/B-CORE-2_AB_PARITY_AUDIT.md`
검사: `scripts/audit-b-core-2-ab-parity.mjs`(RED 재현, **exit 1** — 주문 축만 남음, 정식 manifest 밖) / `scripts/smoke-b-core-2-ab-data-world-parity-v0.mjs`(특성화 기준선, **37 pass**, manifest 등록)

### B-core 독립 구현 묶음 — **구현 완료, Codex 검증 대기 (2026-07-27)**

브랜치 `codex/b-core-independent-foundation` (`ca95a5e` 에서 분기). **Claude 는 완료·무회귀 판정을 하지 않았다.**

| 경계 | 변경 | 보존 근거 |
|---|---|---|
| 주문 공통 입구 | `OrderIntermediate`·`StandardOrder` 에 중첩 `orderFacts` 추가(취소·라인·배송비·금액·결제근거). 취소·발송·배송완료·구매확정은 `deriveOrderState` **재사용** | 기존 평탄 필드 전부 유지. `orderFacts` 는 optional — 상류가 줄 때만 존재 |
| 저장 경계 | `src/services/repositories/` 6 facade 신설. 화면의 저장소 직접 결합 **15지점 → 0건** | 저장키 6개·저장 형식·함수 동작 불변. facade 는 재수출만 함 |
| actor/executor | `assignExecutor` 가 행위자를 수행자로 자동 덮어쓰던 것 교정. `ActorRef.identitySource` 로 로그인 미연결 명시 | 두 필드 모두 optional. 구버전 저장분 `undefined` 를 단정하지 않음 |
| TeamId 정본 | `teamIdContract.ts` 신설. 3곳 중복 정의 통합. 마케팅 두 팀의 저장 의미·scope 비교 규칙 고정 | **소비자 저장 값 0건 변경** |

**결제완료 정본은 고르지 않았다.** `paymentEvidence` 가 **두 규칙의 결과**와 `conflicted` 를 모두 보존한다.
`revenueRulePaid` = `deriveOrderState` 규칙(`isValidDate(paymentDt) && orderStatus !== 'o1'`) · `mapperRulePaid` = `interpretOrderRecord` 규칙(`hasPaymentDate || isPaidStatus`).
**두 값 모두 우리 코드의 추정 규칙이며 고도몰 공식 정답이 아니다.**
최상위 평탄 `paid`/`canceled` 를 두지 않은 이유: `isValidOrder` 폴백 순서상 `canceled` 만 정의되면 **전 주문이 무효**로 판정되어 "미확정"이 "전부 무효"라는 오답이 된다.

audit `[주문]` RED **7축 → 4축**(사실 유실 해소). 남은 4축은 전부 결제 정본 미확정에서 파생된다 — C단계 선행.

**Claude 가 수행한 최소 확인만**: `tsc -b` 0 · `typecheck:api` 0 · `eslint`(변경 영역) 0 · 인접 기존 스모크 8건 PASS · 작업 트리 clean · 비밀값 0.
**수행하지 않음**: 전체 `npm test` · 전체 회귀 · Vercel/Preview/Production · 눈검증. → Codex 검증 범위.

### B-use-1 대표 경로 연결 — **1경로 구현 완료, Codex 검증 대기 (2026-07-27)**

브랜치 `codex/b-use-1-representative-data-path` (`5dcb703` 에서 분기).

선택 경로: **오늘의 운영(OfficeView) → 총괄 콘솔(ChatConsole) 운영 요약 = `controlChatService`**
근거: 마운트된 A 세계 운영 요약 경로가 이곳뿐이다. `AiBriefing`·`ReportModal` 은 렌더 호출자 0건, `CalendarPanel` 은 `activeOperationsData` 를 받고 본문에서 쓰지 않으며, `ProductTeamDashboard` 는 B 세계만 본다.

| 이전 | 이후 |
|---|---|
| `buildSystemPrompt` 와 LEVEL 1 응답이 **같은 수치를 각자 계산** | `buildHqOperationsSummary` **한 곳**에서 생성 |
| `orders.length` 만 — 취소·배송비·라인매출 표현 없음 | `orderFacts` 소비: 취소·배송비·상품 라인 매출 |
| 결제 상태를 한 규칙 결과로 단정 | `conflicted` 건수를 **결제 미확정**으로 보고, 한쪽을 정답으로 표시하지 않음 |
| 재고 `status !== 'ok'` (unknown 을 위험에 합침) | `danger/warning`(위험)과 `unknown`(확인 필요)을 분리 |
| "오늘 주문 N건" · "송장 없는 주문이 일부 있으니" (근거 없는 단정) | "적재된 주문 N건" · 송장 누락은 `riskFlags` 근거가 있을 때만 |
| 실제 0건과 연결 실패가 같은 문장 | `isActualZero` 로 분리, `연결 안 됨` 이면 수치를 만들지 않음 |
| 주문 배열 하나로 **전역 출처 판정** → 문의·재고에 그대로 사용 | `resourceProvenance` 를 정본으로 **리소스별 판정**. 주문 질문은 주문 신분, 문의 질문은 문의 신분. 구자료는 `migrateResourceProvenance` 가 fail-closed 로 판정 |

fixture 실측(주문 10·상품 6): 취소 2 · 배송비 5,500 · 상품 라인 매출 416,000 · 결제 미확정 2 · 재고 위험 4
→ **B 세계 audit 값과 일치**. 구자료(`orderFacts` 없음)는 취소·매출·배송비를 아예 말하지 않는다(거짓 0 금지).

리소스별 출처 조합 확인: 주문 actual 10 / 문의 unavailable → 문의는 '연결 안 됨'만 · 주문 actual 0 / 문의 actual 0 → 둘 다 '실제 0건(연결 실패 아님)' · 주문 fixture / 재고 actual → 각각 [시험 데이터] / [실제 데이터] · 구자료(리소스별 기록 없음)는 전역 `api_proxy_real` 만으로 actual 을 허용하지 않고 전부 '연결 안 됨'.

**Claude 최소 확인만**: `tsc -b` 0 · `typecheck:api` 0 · lint 0 · 인접 기존 스모크 10건 PASS · 4개 데이터 상태 동작 확인 · 트리 clean · 비밀값 0.
**수행하지 않음**: 전체 `npm test` · Vercel/Preview/Production · 화면 눈검증. → Codex 검증 범위.

### B-use-3 HQ 지시 흐름 — **구현 완료, Codex 검증 대기 (2026-07-27)**

브랜치 `codex/b-use-3-hq-directive-flow` (`7ba257e` 에서 분기). local main = `7ba257e`, origin/main = `5190f685`(미푸시).

| 이전 | 이후 |
|---|---|
| `OfficeView.sendDirective` 가 메시지·원장만 생성 → **업무 카드 없음** | `App.handleSendDirective` 가 메시지 1 + 업무 1 + 원장 1 을 한 흐름으로 생성 |
| 하드코딩 `HQ_ACTOR`(userId·identitySource 없음) | App 의 `sessionActor()` — 실제 로그인 미연결이 `identitySource` 로 드러남 |
| 원본 메시지와 업무가 연결되지 않음 | `inputRefs: [messageRef(id)]` 참조만. 본문·첨부는 메시지 저장소에만 |
| 원장에 `refId` 만 | `refId` + `taskId` + `correlationId` 로 역추적 |

권한 판정을 **저장보다 먼저** 하여 사람 HQ 가 아니면 셋 중 어느 것도 만들지 않는다.
**트랜잭션은 아니다** — 저장 도중 장애가 나면 세 저장을 자동 롤백하지 않는다. 저장 실패·트랜잭션은 예정된 서버 기록 작업(B-use-2 서버 기록)에서 다룬다.
수행자는 `unassigned` 로 두고 담당 팀장이 정한다 — actor 와 executor 를 합치지 않는다.

검사: `scripts/smoke-b-use-3-hq-directive-flow-v0.mjs` — HQ 지시 경로 당시 RED 26 pass/6 fail → GREEN 32/32.
(같은 파일을 이후 네 경로 마감 검사로 확장해 **현재 71/71** — 아래 절 참조.)
**Claude 최소 확인만**: tsc·lint·diff --check·비밀값·지정 스모크 4건. 전체 `npm test`·화면 눈검증은 B-use 묶음 인수검사에서 Codex 수행.

### B-use-3 네 승인 의미의 실제 마운트 경로 — **구현 완료, Codex 검증 대기 (2026-07-27)**

| 승인 의미 | 실제 마운트 경로 | 연결 결과 |
|---|---|---|
| HQ 지시 (`hq_directive`) | 오늘의 운영 → `HqDirectiveComposer` → `App.handleSendDirective` | 메시지 1 + 업무 1 + 원장 1. 업무에 `messageRef` |
| 팀 내부 (`team_internal`) | ~~총괄 콘솔 빠른 업무 추가~~ → **아래 절에서 교정됨** | 업무 1 + **원장 1 신규**(`taskId`·`correlationId`). 원본 메시지가 없으므로 `inputRefs` 를 만들지 않는다 |
| 팀 간 협업 (`collaboration`) | 부서 업무 관장 → `TeamMessagePanel` 지원요청 → `App.handleCollaborationRequest` | 추적 부모 1 + 수행 자식 1. **자식에만** `messageRef`. 원장 1건에 자식 `taskId`·`correlationId` |
| 팀→HQ 확인 (`escalation`) | 부서 업무 관장 → `TeamMessagePanel` 확인요청 → `App.handleHqReview` | review-only 카드 1(멱등). 원장 1건에 카드 `taskId`·`correlationId` |

- 원본 메시지 본문·첨부(`dataUrl`)는 **메시지 저장소에만** 있다. 업무에는 참조만 남는다.
- 협업 요청팀 상세는 `resultOf`(= 수행 자식) 규칙으로 같은 원본 연결을 본다 — 두 카드에 중복 저장하지 않는다.
- 같은 사용자 행동으로 활동 원장 이벤트를 중복 생성하지 않는다(경로별 1건).
- 승인 경로·권한 규칙·업무 생명주기는 **기존 계약 그대로**다(`routeFor`·`routeTeamMessage`·`APPROVAL_ROUTES`).

**확인 범위**: `scripts/smoke-b-use-3-hq-directive-flow-v0.mjs` **71 pass / 0 fail**(네 경로) · 인접 lifecycle 스모크 5건 · `tsc -b` · `typecheck:api` · 변경 파일 lint · `git diff --check` · 비밀값 0.
**미수행**: 전체 `npm test` · 브라우저 화면 눈검증 · Vercel/Preview/Production. → B-use-3 묶음 종료 후 Codex 가 한 번 수행.

**남은 한계(숨기지 않음)**: 메시지 저장 후 업무 생성이 실패할 수 있다. 이번에 롤백 계층을 만들지 않았고, 실패는 기존 사용자 로그로 드러난다. 저장 실패·트랜잭션은 서버 기록 작업에서 다룬다.

### B-use-3 팀 내부 업무 진입점 교정 — **구현 완료, Codex 검증 대기 (2026-07-28)**

**이전 주장의 오류(범위 오류로 기록, 헌법 §10)**: 위 표는 팀 내부 경로의 실제 마운트 경로를 "총괄 콘솔 빠른 업무 추가 → `App.handleAddTask`" 로 적었다. **틀렸다.** 확인 범위가 계약(어댑터 함수)에만 있었고 화면 진입 경로를 열어 보지 않았다.

관측한 사실(파일:행 직접 확인):

- `src/components/MainLayout.tsx:209` — `if (!hq && activeTab !== 'department') setActiveTab('department')` : 비HQ 사용자는 **항상 부서 업무 관장 탭으로 강제 이동**한다.
- `src/components/MainLayout.tsx:355` — `activeTab !== 'office' && activeTab !== 'department'` 일 때만 `ChatConsole` 을 렌더한다.
- → **총괄 콘솔의 빠른 업무 추가 바는 팀장 화면에 존재하지 않는다.** 팀 내부 업무에는 실제 진입점이 없었다(헌법 §6).
- 남은 `ChatConsole` 렌더 위치는 `OfficeView.tsx:117`(오늘의 운영 = **총괄 전용 탭**, `MainLayout.tsx:276`)뿐이고, 거기서도 `quickBarSlot` 이 빠른 업무 추가 바를 `HqDirectiveComposer` 로 대체한다.

교정 내용(기존 화면 안에서만):

| 항목 | 값 |
|---|---|
| 실제 마운트 경로 | 부서 업무 관장 탭(`MainLayout.tsx:407`) → `DepartmentWorkspacePanel` 우측 **업무 탭** → `TeamTaskPanel` 상단 한 줄 입력 |
| 권한 판정 | `taskLifecycleAppAdapter.createTeamInternalTask` 한 곳. **사람 팀장이 자기 팀에만.** AI actor·총괄(HQ)·다른 팀·총괄팀 대상·빈 제목 거부 |
| 화면 노출 조건 | `TeamTaskPanel` 의 `canCreateTeamTask = onCreateTask && isOwningLead && teamId !== 'hq'` — 총괄이 남의 팀 화면을 볼 때는 보이지 않는다 |
| 승인 경로 | **새로 만들지 않았다.** 기존 `createDirectiveTask` 안의 `routeFor` 가 `creator.teamId === ownerTeamId` 를 보고 `team_internal`(담당 팀장 확인 1단계) 로 판정 |
| 생성 결과 | 업무 1건 · 수행자 `unassigned` · `inputRefs` 0건(가짜 원본 참조 없음) · `requestingTeamId` 없음 |
| 활동 원장 | 1건. `taskId`·`correlationId` 보유, 원본 메시지가 없으므로 `refId` 를 지어내지 않는다 |

새 화면·새 모달·새 승인 규칙은 만들지 않았다. **협업·HQ 확인 경로는 재설계하지 않았다**(해당 파일의 그 경로 코드 무변경).

**확인 범위**: `scripts/smoke-b-use-3-hq-directive-flow-v0.mjs` **RED 18 fail → GREEN 103/103**(다섯 경로) · 인접 lifecycle 스모크 5건 PASS · `tsc -b` 0 · `typecheck:api` 0 · 변경 파일 lint 0 · `git diff --check` 0 · 비밀값 0 · **음성 변형 2회로 검사가 실제 결함을 잡는지 확인**(권한 가드 4개 제거 → 6 fail / 가짜 `inputRefs`+수행자 덮어쓰기 → 2 fail, 이후 원상복구·재실행 103/103).
**미수행**: 전체 `npm test` · 브라우저 화면 눈검증 · Vercel/Preview/Production. → Codex 최종 검증 범위.

**주의 기록**: `node scripts/run-regression.mjs --discover` 는 manifest 파일을 **덮어쓴다**. 미커밋 작업 트리 상태에서 실행하면 §2에 적힌 "작업 트리를 검사하는 스모크"들이 실패로 잡혀 `exclude` 로 자동 이동한다(이번에 11건 발생, `git checkout` 으로 즉시 복원해 include **123**/exclude **0** 유지). 게이트 축소는 D-003상 사용자 승인 사항이므로 `--discover` 는 트리 clean 상태에서만 쓴다.

## 5. 실행 방식

- **사실상 수동 실행 기반**. `runScheduledAgentTask`(`src/services/agentTaskRunner.ts:169`)는 정의만 있고 **제품 코드 내 호출자 0건**
- 살아 있는 진입점: `runManualAgentTask` ← `src/components/AgentTaskPanel.tsx:38`
- AI 실행은 `kind:'agent'`로, 사람의 승인·반려·중단은 `kind:'human'`으로 활동 원장에 분리 기록됨(`agentTaskRunner.ts:53,63,70,74,117,126`). 다만 사람 라벨이 `'운영자'` 하드코딩 → B3에서 실제 계정 연결

### B-use-4 인증 선별 통합 — **1차 구현 기록 (2026-07-28 당시)**

브랜치 `codex/b-use-4-auth-integration` (`61296fb` 에서 분기).
**인증 브랜치 `fix/auth-foundation-01-red`(`838e2c4`) 는 손대지 않았다** — merge·rebase·일괄 cherry-pick 없이 최종 상태 파일을 참고해 현재 코드 위에 선별 이식했다.

**이식한 것**

| 계층 | 파일 |
|---|---|
| 서버 인증·계정 (신규 6) | `api/_shared/accountContract.ts` · `accountDirectory.ts` · `authActor.ts` · `authConfigContract.ts` · `clerkAuthAdapter.ts` · `api/auth/[action].ts` |
| 클라이언트 (신규 5) | `src/services/authGate.ts` · `authorizedFetch.ts` · `authAccountActor.ts`(신규 작성) · `src/components/AuthGateScreen.tsx` · `components/auth/ClerkAuthBridge.tsx` · `components/auth/AccountAdminPanel.tsx` |
| 보호 라우트 (6) | `api/ai/chat.ts` · `api/godomall/[resource].ts` · `orders-revenue.ts` · `products.ts` · `read.ts` · `sync.ts` (전부 `export default protectedHandler(handler)`) |
| fetch 호출부 (12지점) | `secureProxyClient.ts` 6 · `departmentDataService.ts` 4 · `aiProviderAdapter.ts` 1 · `useMarketingBehaviorSummary.ts` 1 |
| 패키지 | `@clerk/react@6.12.8` · `@clerk/backend@3.13.1` (**이미 `node_modules` 에 설치돼 있던 버전** — 새 설치·네트워크 없음) |

11개 호출부 파일은 분기 이후 B-core·B-use 변경이 **0건**이었고 3-way 로 깨끗이 적용됐다(`git diff --stat 5190f685..HEAD -- <11파일>` 빈 출력으로 확인). `App.tsx`·`main.tsx` 는 수동 선별 이식했다.

**가져오지 않은 것과 이유**

| 항목 | 이유 |
|---|---|
| 인증 브랜치의 `App.tsx` 전체 | 오래된 상태다. B-use-3 네 업무 경로·결과 상세 진입·리소스별 출처 판정을 덮어쓴다 |
| RED 스모크 2종(`smoke-auth-foundation-01-red-v0` · `-01-1-red-v0`) | 과거 진단 재현용. 인증 브랜치에 증거로 남아 있고, 복사하면 검사 수만 늘어난다 |
| GREEN 스모크 원본(`smoke-auth-foundation-01-green-v0`) | 현재 구조에 맞춰 **하나의 통합검사로 교체**했다(아래) |
| `docs/DIAG_*`·`docs/GREEN_*` 4종 | 인증 브랜치의 당시 보고서. governance 정본이 아니다 |
| 비밀번호 초기화·계정 정지 | **미채택 결정 유지.** 앱 경로에서 세션 검증 이전 503, 상태 변경 0 |

**교정 1 — 회사 서버에서도 fail-closed** (`api/_shared/authConfigContract.ts`)

인증 브랜치는 배포환경을 `VERCEL_ENV` 하나로만 판정했다(`isDeploymentEnv`). Vercel 밖에서는 이 변수가 없으므로 **회사 서버에서 인증 환경변수가 빠지면 로컬 개발로 오인해 익명으로 열린다.** `resolveProtectedEnv` 로 넓히고 **기본값을 보호환경**으로 바꿨다.

| 입력 | 판정 | 근거 코드 |
|---|---|---|
| `AUTH_ENFORCE=true` | 보호 | `auth_enforce` |
| `VERCEL_ENV=production\|preview` | 보호 | `vercel_deployment` |
| `NODE_ENV=production` (회사 서버형) | 보호 | `node_production` |
| `NODE_ENV=development` · `VERCEL_ENV=development` · `AUTH_DEV_OPEN=true` | **개방** | `explicit_local_dev` |
| 그 밖 전부(환경 불명, `NODE_ENV=test` 포함) | 보호 | `unknown_fail_closed` |

허용 출처는 `AUTH_AUTHORIZED_PARTIES` **단독으로 완결**된다. Vercel 도메인 변수(`VERCEL_URL` 등)는 Vercel 위에서만 채워지는 **추가 입력**이며 유일 경로가 아니다.
추가 강화: 세션 검증·계정 조회가 **throw** 하면(잘못된 키 형식·SDK 오류·디렉터리 장애) 500 으로 터지거나 조용히 통과하지 않고 **503 으로 닫는다**(`authActor.ts` `protectedHandler` 내 try/catch). 인증 브랜치 주석의 의도("SDK/키 오류 크래시도 아닌 정적 503")를 실제로 강제한 것이다.

`isDeploymentEnv` 는 `@deprecated` 로 남겨 두었다(삭제하지 않음).

**교정 2 — 로그인 신원 → 업무 행위자** · **구조 패치** (actor 경계 변경)

| 항목 | 내용 |
|---|---|
| 변경 | `ActorRef` 에 `accountRole?: 'hq' \| 'team_lead' \| 'member'` **optional 추가**(`taskLifecycleContract.ts`). 서버 계정 역할의 **사본**이며 화면이 만들 수 없다 |
| 이유 | 인증 브랜치의 `App` 은 로그인 후에도 행위자를 역할 전환기에서 만들었다. 그대로면 실제 로그인 신원이 업무 이력에 연결되지 않고, 역할 전환기만 바꿔도 권한·열람 범위가 올라간다 |
| 영향 | `isCurrentStageApprover` · `canDecide(stop/return)` · `isOwningLead` · `createTeamInternalTask` · `TeamTaskPanel` 의 팀장 판정에 `hasLeadAuthority`/`hasHqAuthority` 가 추가로 걸린다 |
| **하위호환** | **`accountRole` 이 `undefined` 면 기존 규칙 그대로다.** 구형 저장분과 데모 역할 행위자에는 이 필드가 없다 — **없는 것을 `member` 로도, 실제 로그인으로도 단정하지 않는다.** 기존 검증 시나리오가 팀장·HQ 역할을 그대로 재현한다(집중검사 R-3·R-7·R-8 로 고정) |

로그인 계정 → 행위자 변환 규칙(`src/services/authAccountActor.ts`)

| ActorRef 필드 | 값 |
|---|---|
| `kind` | `'human'` |
| `userId` | 서버 계정 `userId` |
| `label` | 서버 계정 `name`(공백이면 `userId`) |
| `teamId` | 서버 계정 `team` 을 **정본 `teamIdContract.isDeptTeamId`** 로 해석. 모르는 값은 `'unresolved_team'` 자리표시자(추측·`hq` 로 뭉개기 금지) |
| `identitySource` | `'session_login'` |
| `accountRole` | 서버 계정 `role` 그대로 |

`marketing` 저장값을 `marketing_internal`/`marketing_external` 로 **승격하지 않는다**(집중검사 R-4·T-3·T-5).

App 배선: `actorForView(role)` 하나가 **열람 범위와 권한의 단일 출처**다. 인증 구성 + 로그인 계정이 있으면 서버 계정이 이기고, 미구성에서만 `actorForRole`(=`demo_role`)을 쓴다. `visibleTasksFor`·`taskFlowsFor`·`pendingForActor`·`sessionActor` 5지점이 모두 이 함수를 통과한다 → **역할 전환기로 보이는 범위도 권한도 넓어지지 않는다.**

**팀 어휘**: 인증 계층은 별도 TeamId 정본을 만들지 않는다. `accountContract.ACCOUNT_TEAMS` 는 정본 `DEPT_TEAM_IDS` 에서 `hq` 를 뺀 **미러**이며, 어긋나면 집중검사 T-2 가 실패한다.
직접 import 하지 않은 이유: `api/` 가 `src/` 를 import 한 선례가 **0건**(B-core-2a 에서 의도적으로 유지한 경계)이고, Vercel 함수 번들러가 api 트리 밖 상대 경로를 어떻게 해석하는지 이번 범위에서 실증할 수 없다. 검증되지 않은 런타임 위험 대신 **깨지면 게이트가 실패하는 미러**로 두었다.

**공개·보호 경로 (집중검사 P 구간으로 고정)**

| 경로 | 정책 |
|---|---|
| 고도몰 READ·동기화·주문매출·AI 프록시·마케팅 행동 요약·인증 계정 API | **보호** |
| `/api/marketing/behavior-events`(방문자 수집) | 공개 유지 |
| `/api/godomall/health` | 공개 유지(회사 서버 fail-closed 중에도 200) |
| `/api/godomall/orders-admin` | 기존 403 `ADMIN_ACCESS_DISABLED` 유지 |
| `/api/detail/[action]` | 이번 범위 미보호(기존 rate-limit·SSRF 유지) |

**검사(이 시점 기준)**: `scripts/smoke-b-use-4-auth-integration-v0.mjs` **114/114**(manifest include **124**/exclude 0) · B-use-3 집중검사 **103/103** 유지 · `npm test` exit 0.
`scripts/smoke-build-typecheck-api-red2-v0.mjs` 는 인증 브랜치의 교정(`c913cd1`)을 함께 적용했다 — `@clerk/backend` 정적 import 로 SDK 내부 d.ts 가 프로그램에 들어오면서 그 시뮬레이션(skipLibCheck 없음)에서 선택적 peer 의존 오류 6건이 잡힌다. "우리 api 코드 0오류" 단언을 `api/` 파일 진단으로 한정했다(실패 6건이 전부 `node_modules/@clerk/shared` 내부임을 직접 확인). BASE 단언(저장소 tsconfig 전체 api 0오류)은 그대로다.

**음성 변형 3회**로 새 경계가 실제 결함을 잡는지 확인: ① 회사 서버 fail-closed 제거 → F 구간 6건 실패 ② `member` 팀장 권한 차단 제거 → R 구간 10건 실패 ③ 로그인 신원 연결 제거 → R-30 실패. 전부 원상복구 후 114/114 재확인(**당시 수치**).

**미실증(이번 완료 주장에 포함하지 않음)**: 실제 Clerk 가입·브라우저 로그인·HQ 부트스트랩·승인 후 화면 진입 · Preview/Production · 화면 눈검증 · Vercel 함수 번들 동작. → **Preview 인수검사에서 실증한다.**
main 병합·push·배포·환경변수 변경·인증 브랜치 변경은 하지 않았다.

#### 보완 1 — 로그인 권한 정본 단일화 (2026-07-28 당시 기록)

Codex 독립검증이 자동검사가 놓친 실사용 결함 **2건**을 찾아냈고 이 브랜치에서 마감했다.

**결함 A — 로그인 계정과 시험 역할이 분리되지 않음** (확인된 지점)
`App.tsx` 의 업무·흐름 상태가 마운트 시점(계정 도착 전) 시험 역할로 만들어지고 **서버 계정이 들어와도 다시 계산되지 않았다.** `MainLayout` 은 자체 `loadRole()` 로 HQ 메뉴를 판정했고, `DepartmentWorkspacePanel`·`AgentDetailModal` 도 각자 `loadRole()` 을 읽었으며, `viewerRole` 이 업무 생성·협업 요청·직접 지시 판단에 남아 있었다. → 로그인 전 시험 역할이 HQ 였다면 로그인 뒤에도 HQ 목록·메뉴가 남을 수 있었다.

교정: **권한 정본 한 곳**을 만들었다.

| 항목 | 내용 |
|---|---|
| 신설 | `src/services/effectiveIdentity.ts` — `computeEffectiveIdentity()` 순수 함수가 `mode / actor / teamId / role / isHq / isLead / roleSwitcherEnabled / label / key` 를 한 번에 계산 |
| 신설 | `authGate.useServerAccount()` — 기존 auth subscriber 를 그대로 쓰는 반응형 계정 구독(알림 경로 1개) |
| 규칙 | 인증 구성 + 계정 있음 → **서버 계정만** 신원 근거 · 인증 구성인데 계정 없음 → **시험 역할로 대체하지 않고 권한 0** · 인증 미구성 → 시험 역할 전환기 |
| App | 업무 목록·흐름·확인대기를 `useState` 가 아니라 **`identity.actor` 파생값**으로 바꿨다. 신원이 바뀌면 자동으로 그 계정 기준이 된다. 저장 후 갱신은 `lifecycleRevision` 한 곳 → **effect 안에서 setState 하지 않는다**(무한 effect·중복 저장 없음) |
| MainLayout | 자체 `loadRole()`/`isHqRole` 판정 제거 → `identity.isHq`. 역할 전환기는 `identity.roleSwitcherEnabled` 일 때만 조작 가능하고, 로그인 모드에서는 **읽기 전용 신원 배지**로 대체 |
| DepartmentWorkspacePanel | `loadRole()` 0건. 보고 있는 팀은 파생값(총괄만 선택, 팀장·팀원은 항상 자기 팀). `messageActor` 는 `identity.actor` 에서 오고, 신원 미확인이면 발신하지 않는다 |
| AgentDetailModal | `loadRole()` 제거 → `actorTeamId`·`actorIsLead` prop |
| 저장 전 권한 | `taskLifecycleAppAdapter.canCreateDirective(actor, targetTeamId)` 신설 — 자기 팀=팀장 권한 · 다른 팀=HQ만 · AI actor 불가. 오늘의 운영 일괄 지시·일반 업무 추가가 **저장 직전에** 통과한다. 협업 `requestingTeamId` 와 직접 지시도 `identity.teamId` 기준 |
| 남은 `loadRole()` | App 4곳(시험 모드 초기값·전환기 값)과 MainLayout 1곳(전환기 표시값)뿐. 인증과 무관한 시험 모드 용도는 유지했다 |

**결함 B — 서버 권한 자료 검증이 느슨함** (확인된 지점)
`clerkAuthAdapter.ts` 의 `metaToAccount` 가 `role`·`status` 를 검사 없이 단언하고 **`team` 누락 시 `'hq'` 로 기본 처리**했다.

교정: `accountFromPublicMetadata(userId, publicMetadata, fallbackName)` 로 분리·공개(순수 함수)하고 fail-closed 검증을 넣었다. `role` ∈ `hq|team_lead|member`, `status` ∈ `pending|active|suspended`, 역할·팀 조합(`isValidRoleTeamPair`: hq→`'hq'`, team_lead·member→실제 운영팀)을 모두 만족해야 계정으로 인정하고 **아니면 `null`(계정 없음 → 보호 API 403)**. **`team` 누락을 어떤 값으로도 보정하지 않는다.**

**검사(이 시점 기준)**: 집중검사 **162/162**(기존 114 + 신규 48 — `[S]` 단일 권한 문맥 25건 · `[M]` metadata 14건 · R 구간 갱신). 시나리오는 문자열 확인이 아니라 `computeEffectiveIdentity`·`canCreateDirective`·`accountFromPublicMetadata` **순수 함수 실행**과 실제 `taskFlowsFor` 열람 범위로 확인한다. B-use-3 집중검사 **103/103** 유지.

**검사 갱신 2건(사실은 동일, 단언이 옛 구현 문구를 겨냥했던 것)**: `smoke-b-use-3` 의 E-30·E-31 과 `smoke-rc2-app-integration` 의 A35 를 새 구현 기준으로 고쳤다. 고정하는 사실(비HQ→`department` 제한 · `ChatConsole` 미렌더 · App 이 세션 신원을 결정 권한 ActorRef 로 연결)은 그대로이며 판정이 더 앞·더 강해졌다. **게이트를 줄인 것이 아니다.**

#### 보완 2 — 계정 전환 잔여 권한 경로 마감 (2026-07-28 당시 기록)

Codex 재검증이 같은 근본원인의 잔여 3건을 찾아냈고 이 브랜치에서 마감했다.

| # | 남아 있던 것 (확인 지점) | 마감 |
|---|---|---|
| **A** | `App.tsx:1255` `identity.actor ?? actorForRole(viewerRole)` — "계정 없으면 권한 0" 계약과 모순 | fallback 제거. 계정이 없으면 **`departmentLifecycle` 을 아예 넘기지 않는다**(`identity.actor ? {...} : undefined`). App 에서 `actorForRole` **import 자체를 제거**해 업무·권한 경로에 0건 |
| **B-1** | `MainLayout.tsx:216-219` 탭 강제이동이 `useEffect` → 첫 렌더 뒤 실행. 로그인 직후(기본 `office`)·HQ→member 전환 시 HQ 화면이 **한 렌더 동안** 보일 수 있었다 | `resolveActiveTab(activeTab, isHq)` 순수 함수 신설. `MainLayout` 은 **`effectiveActiveTab` 으로만** 렌더·네비 판정(원본 `activeTab` 직접 비교 0건). effect 는 저장 상태 정리용으로만 남고 경계가 아니다 |
| **B-2** | `handleStartSimulation` 이 `setIsSimulating`·`setReport` 를 권한 확인보다 **먼저** 하고, HQ 가 아니어도 아래 런타임·보고서·에이전트 상태·운영이력이 계속 실행됐다 | 함수 시작부에서 ① 실행 중 확인 ② `identity.actor` + `identity.isHq` 확인 ③ 실패 시 경고 후 **즉시 반환**. 그 뒤에만 상태 변경·런타임 실행 |
| **C** | `report`·`selectedTaskForResult`·`selectedApprovalDetail` 이 객체를 직접 들고 있어, HQ 가 상세를 연 채 로그아웃하고 다른 직원이 로그인하면 이전 계정 자료가 다시 표시될 수 있었다 | `isTaskVisibleToIdentity()` · `isReportOwnedBy()` 순수 함수로 **표시 직전 검증**. 상세는 현재 열람 범위(`tasks`)에 있을 때만, 보고서는 만든 신원 키와 현재 키가 같을 때만 렌더. **기존 자료는 삭제하지 않고 노출만 차단**하며, effect+setState 를 쓰지 않는 파생 판정이다 |

**검사(이 시점 기준)**: 집중검사 **162 → 188/188**(`[X]` 구간 26건 신규). 탭 허용·상세 노출 판단을 순수 함수(`resolveActiveTab`·`canAccessTab`·`isTaskVisibleToIdentity`·`isReportOwnedBy`)로 분리해 **실행 검사**한다 — 문자열 개수로 동작 검증을 대신하지 않는다. B-use-3 **103/103** · RC-2 lifecycle 스모크 10건 전부 PASS · lint 오류·경고 0.

#### 보완 3 — 승인 상세 격리를 결정 권한 기준으로 교정 (2026-07-28 당시 기록)

`visibleApprovalDetail` 이 `selectedApprovalDetail.taskId` 가 현재 `tasks` 에 있는지만 봤다.
`visibleTasksFor` 는 팀만 보므로(`taskLifecycleAppAdapter.ts:859-865`) **같은 팀 일반 팀원도 업무를 열람**하는데, 승인 담당자 판정은 `pendingForActor` → `canDecide` → `hasLeadAuthority` 를 거친다(`:311-315`). 그래서 팀장이 연 승인 상세가 같은 팀 팀원 계정 전환 후에도 남았다.
교정: `isApprovalVisibleToIdentity(approvalId, decidableApprovalIds)` 신설 — **지금 결정할 수 있는 승인 항목의 고유 `id`** 로만 판정한다(승인 항목은 `appr-<taskId>` 로 업무 단위라 `taskId` 대조는 부정확). 업무 상세는 기존 열람 범위 기준 유지 · `applyDecision` 도메인 검사 유지 · 저장 자료 삭제 없음.
검사(이 시점 기준): 집중검사 **188 → 206/206**(`[Y]` 21건 신규, X-32 삭제).

---

### Local migration — 오늘의 운영 주문 통계 출처 상태 연결 (2026-07-28, 브랜치 `codex/b-use-5-preview-acceptance`)

**분류**: Local migration (`MASTER_PLAN §14` 후속 대장 기존 항목). Patch 도 구조 패치도 아니다 — 핵심 데이터 경계를 바꾸지 않고 **소비자 한 곳을 기존 정본 계약에 연결**했다.

**종료조건**: 오늘의 운영 화면에서 주문 통계 조회의 `불러오는 중 / 실제 데이터 0건 / 시험 데이터 / 연결 안 됨` 이 **기존 정본 계약으로** 구분되고, 연결 실패가 다른 데이터 경로로 **조용히 대체되지 않는다.**

**직접 확인한 근본 원인 3가지**

| # | 원인 | 근거(직접 확인) |
|---|---|---|
| 1 | 후속 대장에 적힌 `.catch(()=>{})` 는 **일반 실패 경로가 아니었다** | `departmentDataService.fetchRevenue` 의 `catch` 블록이 throw 하지 않고 `{ source:'unavailable', orders:[], summary:null, errorMessage }` 를 **반환**한다 |
| 2 | `OfficeView` 가 **상태를 버렸다** | `rev.orders.length` 가 있을 때만 `{orders, reviews, inquiries}` 얇은 복사본을 저장 → **실제 성공 0건 · 연결 실패 · 아직 불러오는 중이 전부 `commerceData === null`** 로 합쳐졌다. 출처·slice 상태·오류 사유·요약을 전부 유실 |
| 3 | `ChatConsole` 이 **조용히 다른 경로로 넘어갔다** | `commerceData.orders.length` 가 있을 때만 Commerce Query 엔진 사용 → 0건·연결 실패면 **안내 없이** `activeOperationsData` 관제 채팅으로 폴백 |

**조치 (새 판정 규칙을 만들지 않았다)**

- `OfficeView`: `RevenueResult` **전체를 보존**한다(0건도 저장). `null` 은 **'아직 불러오는 중'** 의미로만 쓴다. 화면 판정은 공통 계약 `screenStateFromRevenue` 가 한다. 계약상 오지 않는 `catch` 는 상태를 지어내지 않고 fail-closed `unavailable` 응답을 만들어 넣는다. 언마운트 가드(`alive`)는 유지.
- `ChatConsole`: prop 을 얇은 `commerceData` → **`revenue: RevenueResult | null` + `revenueScreenState`** 로 바꿨다. **`undefined` = 이 기능을 쓰지 않는 기존 화면**(MainLayout 의 다른 호출은 그대로). 헤더 부제 자리에 짧은 상태만 표시(새 패널·경고창 없음, 내부 오류 원문·URL·키 미노출).
- 통계 질문 분기: 쓸 주문이 없을 때 **기존 `understandCommerceQuery` 로 분류**해 통계 질문이면 출처 상태를 답하고, 통계와 무관한 지시·승인·에이전트 질문은 **기존 `processControlChat` 경로 유지**. 별도 키워드 목록을 만들지 않았다.

**네 가지 상태별 실제 결과**

| 상태 | 헤더 | 통계 질문 답변 |
|---|---|---|
| 요청 완료 전(`revenue === null`) | `주문 통계: 불러오는 중` | "아직 불러오는 중입니다" |
| 실제 성공 0건 | `주문 통계: 실제 주문 0건` | **"실제 주문이 0건입니다(연결 실패가 아닙니다)"** |
| 사용 가능(실제/시험) | `주문 통계: <정본 사용자 라벨>` · 실제 주문만 실패면 ` · 실제 주문 연결 안 됨` 병기 | Commerce Query 엔진 사용(시험 데이터 사용을 막지 않는다) |
| 전부 불가 | `주문 통계: 연결 안 됨` | **"연결되지 않아 답할 수 없습니다. 다른 운영 숫자를 주문 통계로 대신 쓰지 않습니다"** |

**검사**: 새 파일을 만들지 않고 **기존 `smoke-data-source-server-01-green-f-screen-state-v0.mjs` 를 확장**했다(소비자 전수 구조가 이미 있었다). G1~G10 추가 → BASE 5/5 · RED **24/24**. RED 단계에서 **8건이 예상한 이유로 실패**하는 것을 먼저 확인했다.
**음성 변형 2회로 검사 실효성을 확인했고, 그 과정에서 검사 자체의 결함 2건을 찾아 보강했다** — ① G2 정규식이 옵셔널 체이닝(`rev?.orders?.length`)을 놓쳤고, 작성 중 삽입된 **제어문자(0x08)** 때문에 항상 참이 되고 있었다(제거 후 변경 3파일 제어문자 0 확인) ② G5·G6 이 import 줄만으로 매칭돼 호출 삭제를 놓쳤다(`await understandCommerceQuery(` 요구로 보강). 보강 후 두 변형 모두 정확히 실패한다.

**이번에 확인하지 않은 것**: 전체 `npm test` **미실행**(다음 Local migration 묶음 경계 또는 통합 직전에 한 번) · **무회귀 전체를 주장하지 않는다** · Preview·Vercel·브라우저 확인 **미수행**(관련 UI 수정이 모였을 때 한 번).

---

### Local migration — CS 고객 누적 구매금액 계산 정본 단일화 (2026-07-30, 브랜치 `codex/b-use-5-preview-acceptance`)

**분류**: Local migration (`MASTER_PLAN §14` 후속 대장 `계산 우회` 항목). 구조 패치가 아니다 — `revenueMetricContract` 자체를 바꾸지 않고 **소비자 두 곳을 기존 정본 계약에 연결**했다.

**종료조건**: CS 고객 화면의 누적 구매금액이 **두 활성 경로 모두** 공통 정본 `revenueMetricContract` 기준(결제완료·미취소)으로 계산된다.

**교정 전 계산 (직접 확인)**

| 활성 경로 | 함수 | 이전 계산 | 소비 화면 |
|---|---|---|---|
| `csCustomerManagementFacts.ts:144-146` | `buildCsCustomerProfileHub` | `orders.filter(o => o.paid)` 합계 — `canceled` 미검사 | 고객 상세·검색 팝업, 통계 |
| `csTeamDashboardFacts.ts:766-767` | `buildCsCustomerManagementFacts` | 동일 패턴 | `buildCsAdminWorkflow` 고객관리 요약 |

→ **결제 후 취소된 주문이 구매금액과 고액 고객(10만원) 판정에 함께 들어갔다.** 두 경로가 같은 화면에서 각자 계산하므로 한쪽만 고치면 금액이 갈린다.

**조치**: 두 경로 모두 기존 공통 함수 `computeValidOrderPaymentAmount`(= `computeOperationalRevenue`, 판정 `isValidOrder` = `paid && !canceled`)를 호출한다. **새 유효 주문 판정식·별도 helper 0건.** `recentYearOrderAmount` 는 날짜로 최근 365일을 먼저 좁힌 뒤 같은 함수를 적용한다.

**의도적으로 바꾸지 않은 것**: `orderCount`(전체 주문 건수) · 개별 주문 이력의 금액·결제상태 표시 · 클레임·취소·환불 건수와 위험도 판정 · 최근 주문 목록 · PII 게이트 · 검색·정렬·화면 구조 · 고액 고객 기준 `100000원` · `revenueMetricContract` 자체.

**RED → GREEN** (신규 검사 파일 없음 — 기존 2건 확장, manifest **125 불변**)

| 대상 | RED (수정 전 실제 반환값) | GREEN |
|---|---|---|
| `syn_member_1` 누적 구매금액 (두 경로) | **127,500**(취소 12,500 포함) | **115,000** (62,500 + 52,500) |
| `syn_member_1` 최근 1년 구매금액 | **127,500** | **115,000** |
| `syn_member_1` 주문 수 | 3 (유지) | 3 (유지) |
| `syn_member_1` 고액 고객 태그 | 있음 | 있음 (115,000 ≥ 100,000) |
| 경계 고객(결제완료·취소된 150,000원 1건만) | **1건 / 150,000원 / 최근1년 150,000원 / 고액 태그 있음** | **1건 / 0원 / 0원 / 고액 태그 없음** |

검사는 문자열 존재가 아니라 **두 순수 함수의 실제 반환값**으로 확인한다.
`scripts/smoke-cs-customer-management-profile-hub.mjs` **23 pass/3 fail → 26/26** · `scripts/smoke-cs-dashboard-admin-workflow-restructure.mjs` **20 pass/3 fail → 23/23**.

**이번에 실행한 것**: 위 집중검사 2건 · `npx tsc -b` exit 0 · 변경 4파일 lint 오류 0 · `git diff --check` exit 0 · 변경분 비밀값·외부 WRITE 추가 검색 **0건**.
**당시 실행하지 않은 것**: 전체 `npm test` · API 타입검사(api 무변경) · Preview·Vercel·브라우저 확인 · main 통합·push·배포.

**→ Codex 독립검증 완료 (기준 HEAD `814f07c`, 2026-07-30).** 전체 게이트 수치는 §2 참조(`npm test` exit 0 · smoke 125/125 · 113.8초). **자동검사 기준이며 Preview·Production 확인은 포함하지 않는다.**

---

### Local migration — 환불 위험 상품의 클레임 판정 정본 연결 (2026-07-30, 브랜치 `codex/b-use-5-preview-acceptance`)

**분류**: Local migration (`MASTER_PLAN §14` 후속 대장 `analyticsQueryEngine:574 클레임 필터 계약화`). 구조 패치가 아니다 — `claimEventContract` 자체를 바꾸지 않고 **소비자 한 곳을 기존 정본에 연결**했다.

**종료조건**: 환불 위험 상품이 공통 분류 결과가 `return` 또는 `refund_only` 인 주문만 포함하고, `cancel`·`exchange`·`unknown` 은 제외한다.

**교정 전 (직접 확인)**: `src/services/analyticsQueryEngine.ts:574`

```
o.claim?.claimTypes?.some((t) => t === 'refund' || t === 'return')
```

같은 파일이 `:17` 에서 `classifyClaimEvent` 를 **이미 import** 하고 `:517`(클레임율)에서 쓰고 있는데, **이 경로만 원시 문자열을 직접 비교**했다. 계약은 `claimTypes` 를 소문자로 정규화하고 `return > refund_only > exchange > cancel` 우선순위로 **단일 사건**을 확정하므로, 원시 비교는 ① 호환 표기(대문자 등)를 놓치고 ② 계약의 중복 사건 제거를 받지 못했다.

**조치**: 주문별로 `classifyClaimEvent(o.claim, { paid: o.paid }).eventKind` 만 판단 근거로 쓴다. 포함 `return`·`refund_only` / 제외 `cancel`·`exchange`·`unknown`. **별도 정규식·`claimTypes` 직접 비교·새 클레임 판정 helper 0건.**

**바꾸지 않은 것**: `claimEventContract` 자체 · 환불률·취소율·반품률·클레임 금액 등 다른 지표 · 상품 집계 구조(상품별 정렬·상위 10개·행 구조 `key`/`label`/`value` 유지).

**RED → GREEN** (신규 검사 파일 없음 — 기존 `scripts/smoke-analytics-query-engine.mjs` 확장, manifest **125 불변**)

기존 120건 데이터 검사(1~25)는 그대로 두고, 별도의 작은 실행 데이터셋으로 **실제 반환값**을 확인했다.

| 경계 주문 | `claimTypes` | 공통 분류 | 기대 |
|---|---|---|---|
| 상품 A | `['REFUND']` | `refund_only` | 포함 |
| 상품 B | `['RETURN']` | `return` | 포함 |
| 상품 C | `['cancel']` | `cancel` | 제외 |
| 상품 D | `['exchange']` | `exchange` | 제외 |
| 상품 E | `['알수없는태그']` | `unknown` | 제외 |

| | RED (수정 전 실제 반환값) | GREEN (실제 반환값) |
|---|---|---|
| 결과 행 | **`{}` (빈 결과)** — 대문자 호환 태그를 원시 비교가 놓쳐 A·B가 모두 빠졌다 | **`{"A":1,"B":1}`** |
| 결과 키 | `[]` | `["A","B"]` — C·D·E 없음 |
| 총 포함 주문 | **0** | **2** (한 주문 중복 집계 없음) |
| 검사 전체 | **27 pass / 2 fail** | **29 pass / 0 fail** (orders=120 · metrics=61) |

기존 `17. refundRiskProducts` 와 `12. claim/refund/cancel rate` 는 RED·GREEN 양쪽에서 PASS — 120건 데이터셋은 전부 소문자 태그라 값이 바뀌지 않는다.

**이번에 실행한 것**: `node scripts/smoke-analytics-query-engine.mjs` **29/29** · `npx tsc -b` exit 0 · 변경 2파일 lint 오류 0 · `git diff --check` exit 0 · 변경분 비밀값·외부 WRITE 추가 검색 **0건**.
**당시 실행하지 않은 것**: 전체 `npm test` · API 타입검사(api 무변경) · Preview·Vercel·브라우저 확인 · main 통합·push·배포.

**→ Codex 독립검증 완료 (기준 HEAD `f8a1e9a`, 2026-07-30).** 전체 게이트 수치는 §2 참조(집중검사 29/29 · `npm test` exit 0 · smoke 125/125 · 136.2초). **자동검사 기준이며 Preview·Production 확인은 포함하지 않는다.**

---

### Local migration — 도달 불가능한 legacy 업무 UI 제거 (2026-07-30, 브랜치 `codex/local-migration-legacy-task-ui-cleanup`) — **완료 · Codex 독립검증 통과**

**분류**: Local migration (`MASTER_PLAN §14` 후속 대장 `TaskBoard`·`TaskListModal` 미마운트 컴포넌트 정리). 새 화면을 만들지도, 미마운트 화면을 다시 살리지도 않았다.

**삭제 근거는 줄 수가 아니라 호출 관계다 (직접 관측)**

| 파일 | 관측된 호출 관계 |
|---|---|
| `TaskBoard.tsx` | 제품 코드 **import·렌더 호출자 0건** |
| `TaskListModal.tsx` | `TaskBoard.tsx` 에서만 사용 |
| `TaskBoard.css` · `TaskListModal.css` | 각각 위 미마운트 파일에서만 import |
| `TaskResultModal.tsx` | App 에 조건부 렌더는 있었으나 **여는 경로가 끊겨 있었다** |

`TaskResultModal` 의 유일한 setter 배선은 `App onSelectTask` → `MainLayout onSelectTask` → `OfficeView onSelectTask` 였는데, **`OfficeView` 는 그 prop 을 인터페이스(`:38`)에만 선언하고 props 구조분해·본문에서 쓰지 않았다**(파일 전체 등장 1회). 따라서 `selectedTaskForResult` 가 사용자 행동으로 설정되는 경로가 없었다 — 렌더 코드가 있어도 **도달 불가능**했다. 이 화면에는 업무와 무관한 고정 재고·매출·배송 데모 문구도 들어 있었다.

**삭제한 파일 5개** (합계 2,337줄): `TaskBoard.tsx`(474) · `TaskBoard.css`(799) · `TaskListModal.tsx`(122) · `TaskListModal.css`(268) · `TaskResultModal.tsx`(674)

**제거한 끊어진 배선**

| 파일 | 제거 |
|---|---|
| `App.tsx` | `TaskResultModal` import · `selectedTaskForResult` state · `visibleTaskIds` · `visibleTaskDetail` · `onSelectTask={...}` 전달 · `TaskResultModal` 렌더 블록 · `isTaskVisibleToIdentity` import |
| `MainLayout.tsx` | `onSelectTask` prop 선언 · 구조분해 · `OfficeView` 전달 |
| `OfficeView.tsx` | 쓰이지 않던 `onSelectTask` prop 선언 |
| `effectiveIdentity.ts` | `isTaskVisibleToIdentity` export (삭제 후 제품 호출자 0건) |

**함께 죽은 것 1건(지정 제거의 직접 낙진)**: `App.approvalHistory` state. 유일한 소비자가 삭제한 `TaskResultModal` 의 `approvalQueue` prop 이었고 읽는 곳이 0건이 됐다(`tsc -b` 가 `TS6133` 로 드러냄). **저장 정본은 건드리지 않았다** — `hydrateAppState().history` 는 그대로라 필요해지면 다시 파생한다.

**보존한 활성 경로**: `DepartmentWorkspacePanel` → `TeamTaskPanel` → 업무 카드/지난 업무 `상세` → `TaskDetailModal`. 상세 격리는 `TeamTaskPanel.tsx:93-94` 가 선택 id 를 **현재 `teamFlows` 에서 다시 찾아**(`detailFlow`) 열람 범위 밖이면 `null` 이 되는 구조가 담당한다(`:431` 에서 `detailFlow` 일 때만 렌더). `OperationTask` 타입·`ApprovalListModal`·`ApprovalDetailModal`·`MetricDrilldownModal`·lifecycle 저장/결정/권한 계약·네 업무 흐름·승인/수정/중단/반송 이력·화면 디자인은 **무변경**.

**RED → GREEN** (신규 smoke 파일 없음 — 기존 7개 교정, manifest **125 불변**)

`smoke-rc2-app-integration-red-v0.mjs` 에 `L1~L8` 을 먼저 넣고 삭제 전 실패를 확인했다.

| | RED (삭제 전 실제 출력) | GREEN |
|---|---|---|
| L1 legacy 5파일 부재 | **잔존 5개** (5파일 경로 전부 출력) | 5개 전부 삭제됨 |
| L2 제품 코드 참조 0 | **4파일**: `App.tsx` · `TaskBoard.tsx` · `TaskListModal.tsx` · `TaskResultModal.tsx` | 참조 0건 |
| L3 끊어진 배선 0 | **6파일**: `App.tsx` · `MainLayout.tsx` · `OfficeView.tsx` · `TaskBoard.tsx` · `TaskListModal.tsx` · `effectiveIdentity.ts` | 죽은 배선 0건 |
| L4~L8 (활성 경로·격리 실행·자료 보존) | **RED 단계에서도 MET** — 안전망 | MET 유지 |
| 검사 전체 | RED 44 met / **3 unmet** · exit 1 | **48 met / 0 unmet** · exit 0 |

**검사를 활성 경로로 옮긴 방식** (파일이 없어졌다고 빈 문자열에 통과시키거나 정책을 삭제하지 않았다)

| 검사 | 이전 대상 | 이후 |
|---|---|---|
| `smoke-b-use-4` X-31·X-33 | `isTaskVisibleToIdentity` 실행 | `taskFlowsFor(actor)` 에 **화면과 같은 find 규칙**을 적용한 실행 검사 + `TeamTaskPanel` 구조 단언(X-31a). `212/212` |
| 〃 X-37·X-39·Y-51·Y-52 | `visibleTaskDetail`·`setSelectedTaskForResult` 문자열 | App 에 업무 열람 판정 **자체가 없음**을 요구(X-37a·Y-51 **강화**) · Y-52 는 활성 경로 구조로 |
| `smoke-b-use-5` A-14 | TaskBoard·TaskResultModal 의 `onReject` 부재 | 활성 화면 **7곳** 전수. 판정 기준을 선언이 아니라 **호출**(`onReject(` / `onReject?.(`)로 정확화. `71/71` |
| `smoke-rc2-app-integration` A19 | ApprovalDetailModal + 죽은 2화면 | ApprovalDetailModal·ApprovalListModal·**TaskDetailModal·TeamTaskPanel** (활성 4화면) |
| `smoke-rc2-d12` P17 | TaskBoard 의 AI 직접 배정 | **활성 생성 경로** `HqDirectiveComposer`·`TeamTaskPanel` 이 AI 선택 입력을 갖지 않고 생성 계약이 제목만 받음 |
| 〃 P11·P36 | `apprList + taskBoard` | `apprList + MetricDrilldownModal + TeamTaskPanel` |
| `smoke-rc2-d13` W19 | TaskBoard 정확일치 검색 | `src/components` **전 `.tsx` 전수**로 정확일치 안티패턴 0건(대상 확대) |
| `smoke-rc2-d1331` V13 | `onCancel` 이 TaskResultModal 에 존재 | 활성 중단 화면 `ApprovalDetailModal` 의 `작업 중단` + App `cancelHandlerFor` 게이트 |
| `smoke-rc2-d1332` B6 | TaskResultModal 렌더 게이트 | `ApprovalDetailModal` 렌더 게이트 + App reviewOnly 차단 |
| 〃 **A5** | TaskBoard 의 `approvalActorDisplay` | **삭제.** 승인 표시의 활성 소비자는 A3·A4·A6 세 곳이 전부(전수 검색)이고 옮길 활성 대체 화면이 없어 **중복 단언**이었다. 대신 세 화면을 한 번에 확인하는 단언으로 대체했다 |

**관측했으나 이번에 손대지 않은 것(범위 밖 — Codex 판단 대기)**: `TeamOperationsBoard.tsx:31` 에 `onReject?: (id: string) => void;` **타입 선언만** 남아 있다. 구조분해·호출·전달 **0건**으로 `OfficeView.onSelectTask` 와 같은 종류의 죽은 prop 선언이다. 지시 범위에 없어 삭제하지 않았고, A-14 판정을 "호출" 기준으로 정확히 써서 통과시켰다.

**이번에 실행한 것**: 관련 집중검사 **7종 전부 exit 0**(app-integration 48/48 · b-use-4 212/212 · b-use-5 71/71 · d12 51/51 · d13 30/30 · d1331 15/15 · d1332 11/11) · `npx tsc -b` exit 0 · 변경 파일 lint 오류 0 · `git diff --check` exit 0 · 변경분 비밀값·외부 WRITE 추가 검색 **0건** · manifest include **125** / exclude **0**.
**Claude 가 실행하지 않은 것**: 전체 `npm test` · Preview·Vercel·브라우저 확인 · main 통합·push·배포·환경변수 변경.

**→ Codex 독립검증 통과 (기준 HEAD `6fce72141052dd989133dd2cb9b4635c1e92d195`, 2026-07-30)**

**Codex 가 직접 실행했다.**

| 항목 | 값 |
|---|---|
| `npm test` | **exit 0** |
| smoke | **125/125 통과 · 147.3초** |
| `tsc -b` | 통과 |
| API 타입검사 | 통과 |
| Vite build | 통과 |
| 전체 lint | 통과 |
| `git diff --check` | 통과 |
| 작업 트리 | clean |
| main 이후 신규 커밋 | **1개** · merge commit **0개** |

Codex 가 직접 재확인한 것: 삭제 5파일과 줄 수(합계 2,337) · 삭제 전 호출 관계(`TaskBoard` 제품 호출자 0건 · `TaskListModal` 은 `TaskBoard` 에서만 · `TaskResultModal` 의 유일 배선 `App → MainLayout → OfficeView` 에서 `OfficeView.onSelectTask` 가 **선언만 있고 사용 0건**) · 보존된 활성 경로(`DepartmentWorkspacePanel → TeamTaskPanel → 상세 → TaskDetailModal`, 선택 ID 를 현재 `teamFlows` 에서 재조회) · lifecycle 저장 자료와 승인·수정·중단·반송 이력 **미삭제** · 관련 집중검사 7종 exit 0.

**이것은 자동검사 근거다. Preview·Production 을 확인한 것이 아니다.**
**마운트된 화면 동작을 바꾸지 않은 dead-code 제거이므로 Preview·Vercel·브라우저 검사는 이번 작업에 추가하지 않는다**(Codex 판정).

---

### Local migration 5 — 사용되지 않는 `syntheticCommerceFacts` 제거 (2026-07-30, 브랜치 `codex/local-migration-synthetic-facts-cleanup`) — **완료 · Codex 독립검증 통과**

**분류**: Local migration (`MASTER_PLAN §14` 후속 대장 `syntheticCommerceFacts 계약 우회 3건(제품 import 0)`). 계약 우회를 **고치는 대신 파일을 제거**했다 — 제품 소비자가 0건이라 그 우회가 제품 경로에 존재하지 않았다.

**이 작업은 synthetic 데이터 생성 기능을 없애는 작업이 아니다.**

**착수 전 독립 재조사 (보고를 전제하지 않고 직접 검색)**

| 확인 | 결과 |
|---|---|
| `api/`·`src/` 의 `syntheticCommerceFacts` 참조 | **0건** |
| 동적 import·문자열 기반 런타임 호출 | **0건** (`import(`/`require(` 전수) |
| 직접 소비자 | `scripts/smoke-synthetic-commerce-universe.mjs` **한 곳**(`:19` emit · `:26` import) |
| 나머지 언급 | 과거 설명 문서 **7파일**(`COMMERCE_DATA_CONTRACT_V0` · `CONTRACT_C4_INQUIRY_STATUS` · `DIAG_SIMCATALOG_D12` · `GODOMALL_API_IMPLEMENTATION_ROADMAP_V1` · `SYSTEM_ARCHITECTURE_REPORT` · `PROJECT_HANDOFF` · `SYNTHETIC_COMMERCE_UNIVERSE_V1`) |
| synthetic universe·revenue 제품 경로 | **끊기지 않음** — 두 모듈은 그대로 |

**삭제**: `api/_shared/syntheticCommerceFacts.ts` 1파일.
**보존**: `syntheticCommerceUniverse.ts` · `syntheticRevenue.ts` · 제품의 universe 생성 경로 · `smoke-synthetic-commerce-universe.mjs`(같은 manifest 항목) · **manifest include 125 / exclude 0**.

**RED → GREEN** (신규 smoke 파일 없음 · manifest 무변경 · `--discover` 미실행)

| | RED (삭제 전) | GREEN |
|---|---|---|
| `26. 제품 소비자 0건이던 facts helper 파일이 없다` | **FAIL** (파일 잔존) | PASS |
| `27. 제품 코드(api·src) 참조 0건` | **삭제 전에 이미 PASS** — 제품 참조 0건이 검사로 독립 확인됨 | PASS |
| `28. 활성 생성 모듈은 그대로 있다` | PASS | PASS |
| 검사 전체 | **28 pass / 1 fail · exit 1** | **29 pass / 0 fail · exit 0** |

**facts 전용 단언 교체 대응표** (빈 값에 통과시키지 않았다 — 각 단언을 *그 계산이 성립할 수 있는 원본 사실*로 옮겼다)

| # | 이전 (facts 출력) | 이후 (universe 원본 사실) |
|---|---|---|
| 8 | `facts.averageOrderValue > 0` | 결제완료 주문 존재 + 모든 결제완료 주문에 `totalAmount` 숫자 + smoke 가 직접 계산한 객단가 > 0 |
| 9 | `facts.paymentMethodDistribution` 길이·pct | **모든 주문**에 `paymentMethodCode \|\| settleKind` 존재 + 값 종류 **≥2**(한 값으로 몰리지 않음) |
| 10 | `facts.orderChannelDistribution` 길이 | **모든 주문**에 `orderChannel` 존재 + 값 종류 ≥1 |
| 18 | `orders + facts` JSON 에 PII 없음 | `orders + reviews + inquiries + customers`(실제 분석 대상 자료)에 PII 없음 — **대상 확대** |
| 19 | `facts.categoryRevenue` 라벨 존재 | 모든 라인의 `categoryCode` 가 입력 카탈로그 코드 집합 안 + **두 카테고리가 모두** 등장 |
| 20 | `facts.brandRevenue` 라벨 존재 | 라인에 `brandCode` 가 **없음을 고정**하고, `goodsNo` → 입력 상품의 `brandCode` 로 해석 가능 + **두 브랜드가 모두** 등장 |
| 21 | `facts.averageReviewRating > 0` + `categoryReviewRating` 길이 | 리뷰 `rating` 이 **1~5 정수** + `categoryCode`/`brandCode` 가 알려진 집합 안 + 둘 다 실제로 채워진 리뷰 존재 |
| 22 | `facts.csTopTopics` 길이 | 문의 `topic` 이 허용 8종 안 + 종류 ≥2 + `status` 가 허용 3종 안이며 **세 상태가 모두** 등장 |
| — | (없음) | **26·27·28 신규**: helper 파일 부재 · 제품 참조 0건 · 활성 모듈 보존 |

제거만 한 단언은 없다. 단언 수를 맞추려고 의미 없는 검사를 만들지도 않았다(26 → **29**, 순증 3건은 전부 삭제 사실 자체를 고정하는 것).

**이번에 실행한 것**: `smoke-synthetic-commerce-universe` **29/29 exit 0** · `smoke-synthetic-commerce-universe-activation` **10/10 exit 0** · 인접 `smoke-marketing-analysis-facts-core-v0` **34/34** · `smoke-department-data-source-of-truth-v0` **23/23** · `npx tsc -b` exit 0 · `npx tsc -p api/tsconfig.json --noEmit` exit 0 · 변경 파일 lint 0 · `git diff --check` 0 · 변경분 비밀값·외부 WRITE 추가 **0건** · manifest **125/0** 불변.
**Claude 가 실행하지 않은 것**: 전체 `npm test` · Preview·Vercel·브라우저 확인 · main 통합·push·배포·환경변수 변경 · manifest `--discover`.

**→ Codex 독립검증 통과 (기준 HEAD `9e196ba40062ef19e5c63aecf2af1141ee271e90`, 2026-07-30)**

**Codex 가 직접 실행했다.**

| 항목 | 값 |
|---|---|
| `smoke-synthetic-commerce-universe.mjs` | **29/29 통과** |
| `npm test` | **exit 0** |
| 전체 smoke | **125/125 통과 · 123.7초** |
| manifest | include **125** / exclude **0** |
| `tsc -b` | 통과 |
| API 타입검사 | 통과 |
| Vite build | 통과 |
| 전체 lint | 통과 |
| `git diff --check` | 통과 |
| 검증 후 작업 트리 | clean |

**Codex 판정**: `syntheticCommerceFacts.ts` 제거는 안전하다 — 제거 전 제품 호출자 **0건**이었고 직접 소비자는 해당 smoke 하나뿐이었다. 활성 경로 `syntheticCommerceUniverse.ts`·`syntheticRevenue.ts` 는 보존됐다. **화면·API 동작을 바꾼 작업이 아니므로 Preview·Vercel·브라우저 검사는 불필요했다.** 과거 문서는 시점 기록으로 보존하며, **현재 상태 안내가 있는 정본을 우선한다**(`docs/SYNTHETIC_COMMERCE_UNIVERSE_V1.md` 상단 블록).

**이것은 자동검사 근거다. Preview·Production 을 확인한 것이 아니다.**

---

### Local migration 6 — 미사용 고도몰 상품 매퍼 제거 (2026-07-30, 브랜치 `codex/local-migration-godomall-dead-mapper-cleanup`) — **완료 · Codex 독립검증 통과**

**분류**: Local migration (`MASTER_PLAN §14` 후속 대장 `godomallMapper.mapGoodsToInventory`/`mapGoodsList` dead code). 계약·화면·API 경로를 바꾸지 않고 **호출자 0건인 死코드만** 없앴다.

**삭제 전 전체 호출 관계 (직접 전수 검색: `api`·`src`·`scripts`)**

| 이름 | 정의 | 호출자 |
|---|---|---|
| `mapGoodsToInventory` | `godomallMapper.ts:74` | **0건** |
| `mapGoodsList` | `:54` | `mapGoodsToInventory`(`:75`) **하나뿐** |
| `ProductIntermediate` | `:45` | `mapGoodsList` 반환 타입뿐 |
| `InventoryIntermediate` | `:67` | `mapGoodsToInventory` 반환 타입뿐 |

→ **닫힌 死코드 묶음.** 바깥에서 들어오는 호출이 없다.

**활성 경로는 별개이며 보존됐다(직접 확인)**: `mapGoodsToProducts`(**현재 `godomallMapper.ts:81`** — 처음 이 절에 적었던 `:109` 는 삭제 **전** 위치였다. 위 호출관계 표의 `:45`·`:54`·`:67`·`:74` 는 삭제 전 기록이므로 그대로 둔다) ← `godomallResource.ts:14,100,377`(제품) · `deriveInventoryFromProducts`(`godomallInventoryDerive.ts:45`) ← `godomallResource.ts:38,102`(제품). 두 함수와 상품 READ 경로·주문 매퍼·재고위험 계약·전역 기본값 규칙·고도몰 API 경로·환경변수·화면·manifest는 **무변경**.

**함께 사라진 것**: `godomallMapper.ts:61` 의 `pick(g, ['safetyStock','minStock','soldOutLimit'], '5')` — Goods_Search 응답에 없는 값을 지어내던 **근거 없는 `safetyStock` 기본값 `'5'`**. 안전재고 기본값은 이제 `src/services/inventoryRiskContract` 의 전역 기본값 하나뿐이다(B-core-2a 판정 그대로).

**RED → GREEN** (기존 `smoke-b-core-2a-inventory-risk-single-source-v0.mjs` 에 최소 단언만 추가 · 신규 smoke 파일 0 · manifest **125/0 불변**)

| | RED (삭제 전 실제 출력) | GREEN |
|---|---|---|
| 6-1 legacy 4종 부재 | **FAIL** — 잔존: `ProductIntermediate, InventoryIntermediate, mapGoodsList, mapGoodsToInventory` | PASS |
| 6-2 런타임 export 부재 | **FAIL** — 잔존 export: `mapGoodsList, mapGoodsToInventory` | PASS |
| 6-3 활성 `mapGoodsToProducts` 유지 | **RED 단계에서도 PASS**(안전망) | PASS |
| 6-4 `mapGoodsToProducts → deriveInventoryFromProducts` 동작 | **RED 단계에서도 PASS**(안전망) | PASS |
| 6-5 `safetyStock:'5'` 미생성 | **FAIL** | PASS |
| 검사 전체 | **45 pass / 3 fail · exit 1** | **48 pass / 0 fail · exit 0** |

6-1·6-5 는 삭제 사유를 기록한 **주석**까지 훑어 한 번 더 실패했다. 이 저장소의 다른 smoke 와 같이 **코드 줄만** 판정하도록 고쳤다(주석 보존은 헌법 §6, 재도입은 코드 줄에 나타나므로 여전히 잡힌다).

**이번에 실행한 것**: `smoke-b-core-2a-inventory-risk-single-source-v0` **48/48 exit 0** · 인접 고도몰 상품 READ `smoke-godomall-read-gateway` **13/13** · `smoke-godomall-catalog` **15/15** · `smoke-godomall-api-registry` **13/13** · `npx tsc -b` exit 0 · `npx tsc -p api/tsconfig.json --noEmit` exit 0 · 변경 파일 lint 0 · `git diff --check` 0 · 네 이름 코드 잔여 **각 0건** · manifest **125/0**.
**Claude 가 실행하지 않은 것**: 전체 `npm test` · Preview·Vercel·브라우저 검사 · push·배포·환경변수 변경 · main 통합 · 다른 후속 대장 항목 조사·수정.
**제품 동작 영향**: 없음. 삭제한 4종은 제품 실행 경로에 들어가지 않았고, 상품·재고 READ 는 활성 두 함수를 그대로 쓴다.

**→ Codex 독립검증 통과 (기준 HEAD `359cdf24523c3ac353a85434d8ea62f99ecd340e`, 2026-07-30)**

**Codex 가 직접 실행했다.**

| 항목 | 값 |
|---|---|
| 집중검사 | **48/48 통과** |
| `npm test` | **exit 0** |
| 전체 smoke | **125/125 통과 · 141.3초** |
| manifest | include **125** / exclude **0** |
| `tsc -b` | 통과 |
| API 타입검사 | 통과 |
| Vite build | 통과 |
| 전체 lint | 통과 |
| `git diff --check` | 통과 |
| 검증 후 작업 트리 | clean |

**Codex 판정**: 삭제한 네 이름은 **닫힌 미사용 코드 묶음**이었다. 활성 `mapGoodsToProducts → deriveInventoryFromProducts` 경로는 유지됐다. 상품·재고 READ · 주문 매퍼 · 재고위험 계약은 바뀌지 않았다. **화면 동작 변경이 없어 Preview·Vercel·브라우저 검사는 불필요했다.**

**이것은 자동검사 근거다. Preview·Production 을 확인한 것이 아니다.**

---

### B-use-5 Preview 인수검사 — **완료 · 실제 Preview 화면 재확인 통과 (브랜치 `codex/b-use-5-preview-acceptance`, 제품 기준 `bcf91a4`, 2026-07-28)**

> **B-use-5 Preview 인수검사는 완료했다.** 사용자가 관측했던 화면 결함 7건이 실제 Preview 화면에서 재확인됐다.
> **이것은 B-use 전체 완료도 Production 완료도 아니다.** 아래 '완료로 주장하지 않는 것' 을 그대로 유지한다.

**사용자가 실제 화면으로 확인한 것**(사용자 관측, 2026-07-28)

핵심 흐름 **HQ 지시 → 상품팀장 직접 처리 → 결과 제출 → 팀장 확인 → HQ 최종 확인** 이 끊기지 않고 이어졌다.
같은 검사에서 화면 결함 **7건**이 관측됐다.

**이번에 마감한 7건**

| # | 사용자가 본 증상 | 원인(직접 확인) | 조치 |
|---|---|---|---|
| 1 | HQ 지시 직후 같은 화면이 갱신되지 않고, 브라우저를 다시 접속해야 `전달 1`·메시지·업무가 보였다 | 브라우저 `storage` 이벤트는 **쓴 탭 자신에게는 발생하지 않는다**. 저장은 성공했는데 같은 탭 구독자가 다시 읽지 못했다 | `activityLedger`·`teamMessageCenter` 가 저장 **성공 시에만** 같은 탭 CustomEvent 를 발생시킨다(`sessionRole` 선례). 저장 함수는 `boolean` 을 돌려주고 실패 시 알리지 않는다 |
| 2 | HQ 최종 확인 뒤에도 오른쪽 `승인·확인 필요`에 원래 지시 메시지가 계속 남았다 | 업무 상태와 그 업무를 만든 **원본 팀 메시지 상태가 연결되어 있지 않았다** | `src/services/linkedMessageSync.ts` 신설 — 업무의 `inputRefs`(`teammsg:<id>`)를 따라 원본 메시지 상태를 맞춘다. **비종료 결정(수정 요청·반송·중단 후속)과 같은 메시지를 참조하는 열린 업무가 남아 있으면 닫지 않는다.** 트랜잭션이 아니다 |
| 3 | 왼쪽 요약 `승인 대기`와 오른쪽 항목이 눌리지 않고 우측 하단 플로팅 버튼만 승인창을 열었다 | 진입점이 플로팅 버튼 하나였다 | 플로팅 버튼 **제거**. 사용자가 먼저 보는 왼쪽 요약 숫자와 오른쪽 승인 항목이 같은 목록을 연다(승인 정본 `myPendingApprovals` 는 그대로) |
| 4 | 승인 상세 화면이 지나치게 복잡했다 | 기술 메타데이터·원본/마스킹·5개 동작이 한 화면에 평평하게 놓여 있었다 | 기본 화면은 **제출된 결과 · 확인이 필요한 이유 · 담당팀/수행자/상태**만. 주 버튼 `확인 완료`, 보조 `승인하지 않음`(한 줄 사유 필수 · 사유 기록 전 창을 닫지 않음). 수정 요청·작업 중단·협업 반송은 **삭제하지 않고** 접힌 `다른 처리` 안에 둔다 |
| 5 | 다크모드에서 일부 본문이 짙은 초록색이라 읽을 수 없었다 | 앱 테마는 `[data-theme]` 속성인데 `CsTeamDashboard.css` 4곳만 **OS 설정(`prefers-color-scheme`)** 을 따랐다. OS 라이트 + 앱 다크 조합에서 라이트용 짙은 초록이 어두운 배경 위에 찍혔다 | 4곳을 `[data-theme='light']` 로 교정(저장소 전체 `prefers-color-scheme` **0건**). 승인 화면의 고정 연파랑 `#93c5fd`(라이트 배경에서 안 읽힘)도 테마 변수로 교체 |
| 6 | `계정 관리` 버튼이 화면 왼쪽 아래에 fixed 로 붙어 있었다 | 임시 배치 | 상단 헤더의 신원·로그아웃 옆으로 이동. **권한 판정은 그대로**(인증 모드 + `hq`/`team_lead`) |
| 7 | HQ 지시 입력창이 성공 여부와 무관하게 입력을 지웠고 성공 여부가 화면에 안 보였다 | `onSend` 가 결과를 돌려주지 않았다 | `DirectiveSendResult { ok, message }` 계약 신설. **성공해야 입력을 지우고**, 실패하면 입력을 보존한 채 같은 자리에서 이유를 보여준다 |

**부수 교정**: `createRevisionTask` 가 원본 `inputRefs` 를 물려받지 않아 수정 요청 후속 업무가 원본 메시지와의 연결을 잃었다(신규 검사 L-11 이 잡았다).

**검증 범위**(이 브랜치에서 직접 실행)

| 대상 | 결과 | 명령 |
|---|---|---|
| B-use-5 집중검사(신규) | **54/54 통과** | `node scripts/smoke-b-use-5-preview-defects-v0.mjs` |
| B-use-3 집중검사 | 103/103 통과 | `node scripts/smoke-b-use-3-hq-directive-flow-v0.mjs` |
| B-use-4 집중검사 | 210/210 통과 | `node scripts/smoke-b-use-4-auth-integration-v0.mjs` |
| 앱 타입검사 | 오류 0 | `npx tsc -b` |
| api 타입검사 | 오류 0 | `npx tsc -p api/tsconfig.json --noEmit` |
| 변경 파일 lint | 오류 0 | `npx eslint <변경 12파일>` |
| 공백 오류 | 0 | `git diff --check` |
| manifest | include **125** / exclude 0 (신규 검사 등록) | `scripts/regression-manifest.json` |
| 비밀·키 유출 · 외부 WRITE 추가 | 변경분 검색 **0건** | `git diff` 검색 |

**Codex 1차 독립검증(2026-07-28) 결과와 교정** — 위 커밋 `2bd80a2` 는 **무회귀 완료로 인정되지 않았다.**
Codex 실행 결과: 신규 집중검사 54/54 · build · typecheck:api · lint 통과, 그러나 **전체 `npm test` 실패**(smoke 123/125).
지적 4건을 모두 재현하고 마감했다.

| 지적 | 무엇이 문제였나(직접 재현) | 교정 |
|---|---|---|
| 1. 승인 대기열 배선 | `App.tsx` 가 `MainLayout` 에 **전체** `approvalQueue` 를 넘겼고 `OfficeView` 가 그대로 `TeamOperationsBoard.approvalItems` 로 전달했다. 전체 3건·내 1건이면 **왼쪽 숫자 3 / 열린 목록 1** 로 다시 어긋난다. `ExecutiveBriefing` 은 실제 승인 배열이 아니라 활동 원장 `status === 'pending'` 을 승인으로 **추측**했다 | 별도 prop `pendingApprovalsForIdentity` 신설(전체 `approvalQueue` 는 다른 화면용으로 보존). App 이 `myPendingApprovals` 를 넘기고, 왼쪽 요약·오른쪽 브리핑이 **이 배열 하나만** 쓴다. 브리핑은 활동 원장 의존을 제거하고 팀 귀속은 기존 정본 `approvalTeamId` 재사용 |
| 2. 무사유 미채택 | `handleReject` 의 기본값 `'이번 결과 사용 안 함'` 때문에 목록·업무 카드·결과 모달·채팅 명령이 **사유 없이** 미채택할 수 있었다. Codex 목록 외 1건(`OperationBriefingModal → MetricDrilldownModal`)도 발견 | 기본 사유 제거 → TypeScript 가 무사유 호출을 전부 드러냈다. 즉시 거절 버튼을 5개 화면에서 제거하고 **승인 상세 한 경로**로 모았다. ChatConsole 의 `reject_item`·`reject_all` 은 실행하지 않고 사유 입력을 안내한다 |
| 3. 전체검사 실패 2건 | 제품 수정이 맞고 **검사가 낡았다**. `smoke-cs-popup-ux-layout-polish` 는 옛 `@media (prefers-color-scheme: light)` 를 강제했고, `smoke-rc2-d1331-review-only-card-red-v0` 의 V13 은 `onCancel && (` 형태만 찾아 `onCancel && <button` 을 놓쳤다 | 앞은 새 정본 `[data-theme='light']` + 진한 amber 로 교정하고 `prefers-color-scheme` 잔존 시 실패하는 12a 를 **추가**했다(느슨하게 하지 않음). 뒤는 JSX 두 유효 형태 `onCancel && [(<]` 를 받되 정책 확인은 그대로 |
| 4. 문서 브랜치명 오기 | `MASTER_PLAN.md` 가 결함 마감 브랜치를 `codex/b-use-3-remaining-route-closure` 로 적었다 | `codex/b-use-5-preview-acceptance` 로 교정 |

**검사 강화**(기존 E-2·E-4 는 문자열 존재만 봐서 지적 1을 놓쳤다): E-10~E-16·E-20~E-23·A-10~A-15 를 추가해 54 → **71건**.
음성 변형 2회로 검사가 실제 결함을 잡는지 확인했다 — 왼쪽 숫자를 전체 대기열로 되돌리면 **E-12 실패**, 기본 사유를 되살리면 **A-10 실패**.

**전송 성공 표시의 주장 범위(제한)** — 과장하지 않는다.

- 보장: **권한·신원 검사에서 거부되면** 실패 이유를 표시하고 입력을 보존한다. 정상 경로에서는 성공 안내를 표시한다.
- 미보장: `postTeamMessage` 는 `saveTeamMessages` 의 반환값을 사용하지 않고, lifecycle 저장소도 localStorage 실패를 조용히 무시한다. **localStorage 다중 저장은 트랜잭션이 아니며 저장소 실패 전체를 원자적으로 판정하지 못한다.**
- 이 제한은 **서버 저장 경계 작업 전까지 미검증·제약으로 남긴다.** 이번에 저장소 구조를 확대하지 않았다.

**실제 브라우저 재확인 — 통과 (2026-07-28)**

Codex 가 **앱 내부 브라우저가 아닌 별도 자동화 브라우저**로 Preview
`https://godo-git-codex-b-use-5-preview-f2d73c-taejuns-projects-e5fc4e75.vercel.app` 를 직접 조작했다.
시험 지시문 `[재확인 1720] 품절 위험 상품을 확인하고 결과를 보고해 주세요.` · 제출 결과
`재고 위험 상품 4건을 확인했습니다. 품절 0건, 위험 4건이며 재고 보충 검토가 필요합니다.`

| 원래 증상 | 재확인에서 관측된 것 |
|---|---|
| 1. 지시 직후 갱신 안 됨 | **새로고침 없이** 성공 안내 · 입력 초기화 · 왼쪽 `전달 1` · 오른쪽 지시 항목이 즉시 표시됐다 |
| 7. 전송 결과 미표시 | 위와 같은 관측(성공 안내가 뜨고 성공했을 때만 입력이 비워졌다) |
| 2. 원본 메시지가 계속 남음 | HQ `확인 완료` 직후 **같은 화면에서** 왼쪽 `승인 대기 0` · 오른쪽 `0건` · 해당 항목 제거를 확인했다 |
| 3. 승인 진입점이 플로팅뿐 | 왼쪽 `승인 대기 1` 과 오른쪽 승인 항목 1건이 **같은 제목**으로 뜨고, **두 진입점 모두** 같은 승인 목록을 정상적으로 열었다 |
| 4. 승인 화면 복잡 | 기본 화면에 제출 결과·확인 이유·담당팀·수행자·상태만 보이고 **기술 상세와 다른 처리는 접혀 있었다.** `승인하지 않음` 은 즉시 처리되지 않고 **필수 한 줄 사유** 입력이 나타났으며, 사유가 비면 `사유 남기고 반려` 가 **비활성**이었다 |
| 5. 다크모드 짙은 초록 본문 | **다크모드로 승인 상세에 진입**해 위 항목들을 읽었다 |
| 6. 계정 관리 버튼 위치 | 상단 **신원·로그아웃 옆**에 있음을 확인했다 |

중간 흐름도 끊기지 않았다 — 상품팀장이 업무를 직접 수락하고 결과를 제출하자 **같은 화면에서** 결과와 `확인 필요` 가 즉시 표시됐고, 팀장 확인 후 HQ 로 전환됐다.

**최종 앱 흐름의 브라우저 콘솔 오류 0.** Preview 의 기존 경고 2건(Tailwind CDN 경고 · Clerk 개발 키 경고)은 **이번 B-use-5 결함으로 확대하지 않는다.**

**증거의 종류를 구분한다**: 위 §검사 표(smoke 125/125·build·lint)는 **배선과 계약**을 증명하고, 이 절은 **실제 화면 동작**을 증명한다. 둘은 서로를 대신하지 못한다. B-use-5 는 이번에 **둘 다** 확보했다.

**완료로 주장하지 않는 것**

- **B-use 전체 완료가 아니다.** B-use-5 는 Preview 인수검사 한 건이다.
- **Production 완료가 아니다.** main 미통합 · Production 미배포 · 환경변수 무변경.
- **고도몰 새 키는 발급 대기** 상태다.
- **DB 미결정.** 특정 서버 어댑터를 구현하지 않는다.
- **시험자료 보존 여부 미결정.** 지금 쌓인 업무·메시지·승인 기록을 서버 이관 시 보존할지 버릴지 정해지지 않았다. 삭제하거나 변환하지 않는다.

---

### B-use-4 — **로컬 구현·자동검증 완료 · Codex 독립검증 통과 (기준 HEAD `e599ce2`, 2026-07-28)**

> **B-use-4 는 로컬 구현과 자동검증 기준으로 완료했다. 실제 Clerk 가입·로그인·HQ 부트스트랩·계정 전환 렌더·승인 후 화면 진입은 아직 완료 주장에 포함하지 않으며, B-use-3 화면 확인과 함께 통합 Preview 인수검사에서 실증한다.**

**완료로 인정하는 범위**(Codex 직접 실행으로 확인 — 수치는 §2)

- 채택 기능 4가지: 가입 신청 · `member`+`pending` 생성 · 같은 팀장/HQ 승인(팀장 승격은 HQ만) · 승인 후 보호 API·대시보드 이용
- 회사 서버형 `NODE_ENV=production`·환경 불명 포함 **fail-closed**
- 로그인 신원 → 업무 행위자 연결 · `member`/`team_lead`/`hq` 권한 구분
- 시험 역할 전환기가 인증 모드에서 권한·열람 범위를 바꾸지 못함
- 계정 전환 시 이전 계정의 업무 상세·승인 상세·보고서 노출 차단(자료 삭제 없음)
- Clerk `publicMetadata` 권한 자료 fail-closed 검증
- 기존 B-core·B-use 무회귀(B-use-3 집중검사 103/103 · 전체 smoke 124/124)

**완료 주장에 포함하지 않는 것(미실증)**: 실제 Clerk 가입·브라우저 로그인·HQ 부트스트랩 실행·계정 전환 시 실제 렌더·승인 후 화면 진입 · Preview/Production · Vercel 함수 번들 동작. → **통합 Preview 인수검사에서 B-use-3 화면 확인과 함께 실증한다.**

main 병합·push·배포·환경변수 변경·인증 보존 브랜치 변경은 하지 않았다.

### B-use-2 DB 후보 조사 — **결정자료 작성 완료 (2026-07-28)**

브랜치 `codex/b-use-2-db-options-research` (`e599ce2` 에서 분기). **제품 코드·검사 코드 0변경(문서 전용).**
산출물: `docs/governance/evidence/B_USE_2_DB_OPTIONS_RESEARCH.md`

**이것은 채택안이 아니라 결정자료다.** DB 를 고르지 않았고 서버 어댑터도 만들지 않았다. `DECISIONS.md` 에 새 결정을 추가하지 않았으며 **DB 미결정 상태를 그대로 유지**한다.

후보 3종(직접 운영 PostgreSQL · Supabase · Neon)을 **각 제품 공식 가격표·공식 문서 16개 URL**(2026-07-28 확인)로만 비교했다. Prisma 는 DB 제품이 아니라 ORM 이므로 후보에서 제외했다.

관측된 주요 사실:

- 입력 문서 §7 의 **12조건 중 1·2·4·5·11 은 후보 간 차이가 아니다**(셋 다 표준 PostgreSQL). 실제로 갈리는 것은 **3(첨부)·6(연결)·8(개인정보)·9(백업)·10(무료 등급 운영 조건)** 이다.
- **무료 등급의 적합 여부는 판정 보류(`미확인`)** — 실제 사용량이 아직 없다. 입력 문서의 180 MB·2.5 GB 는 전사 15명 등을 **가정한 예시**다. 무료 등급에서 확정된 것은 용량 적합성이 아니라 **운영 조건**(Supabase Free 1주 미사용 시 정지·백업 없음 · Neon Free 는 자원별로 초과 동작이 다름)이다.
- **한국 리전**: Supabase **서울 `ap-northeast-2` 있음** · Neon **없음**. **양쪽 모두 생성 후 리전 변경 불가**(새 프로젝트 + 데이터 이관). Supabase 공식 문서는 **"선택한 지역 안에 모든 데이터가 남는다"** 고 명시하며(지역 선택·읽기 복제본 지역은 고객 책임), 이는 **기술적 저장 지역 사실**이지 국내 보관 법적 의무 충족을 뜻하지 않는다. CS 완료 기록에 PII 그릇이 있으므로 **첫 실제 개인정보 저장 전 — 즉 C단계 실데이터 연결 *전* 에 확정해야 하는 진입 조건**이다(실데이터를 넣은 뒤 검토하는 항목이 아니다).
- **Neon Object Storage 는 beta · AWS `us-east-2` 전용** — 첨부 저장소로 지금 전제할 수 없다.
- 직접 운영 PITR 은 PostgreSQL **기본 기능**이지만 `wal_level`·`archive_mode`·`archive_command` 설정 + `pg_basebackup` + **아카이빙 모니터링**을 우리가 직접 해야 한다.
- 회사·고도몰 서버 직접 운영 확인표 **10개 항목은 전부 미확인** — 서버 제공 조건을 받아야 채울 수 있다.

**사실 교정 (2026-07-28, Codex 독립검토)**: 초판에서 오류 2종이 발견돼 교정했다.
① **계산 오류** — "무료 등급은 셋 다 우리 규모에 못 미친다"는 틀렸다(**가정 텍스트 180 MB < 무료 DB 한도 500 MB**). 판정을 `미확인`으로 되돌렸다. "무료로 운영하자"는 새 결론은 만들지 않았다.
② **공식 자료가 있는데 `미확인`으로 둔 6건** 확정 — Supabase 데이터 저장 지역·연결 수(직접 60~380 · Pooler 200~1,500)·파일 한도(업로드 상한과 총 저장량은 다른 숫자)·Realtime 포함 여부, Neon `pg_dump` 이전 공식 절차(직접 연결 필수)·**월 최소금액 폐지**.
부수 교정: Neon 무료 초과 동작을 **자원별로 분리**(저장 초과는 쓰기 실패 — 컴퓨트를 멈추지 않는다).
공식 출처 **16 → 21개** · 확정 사실 15 → **20** · 미확인 **21개 항목**(초판의 "31곳"은 낱말 수를 센 것이라 부정확했다).

**2차 사실 교정 (2026-07-28, Codex 독립검토 2차)** — **결론은 바뀌지 않았다.** 사실·판정 등급·표현만 고쳤다.

| 교정 | 내용 | 근거 |
|---|---|---|
| C. 공식 자료가 있는데 `미확인` 이던 **5건 확정** | Supabase **리전 생성 후 변경 불가**(새 프로젝트 + migration) · Supabase **at-rest AES-256 · 프로젝트별 키 · FIPS 140-2 HSM · TLS 1.2** · Supabase **Vercel Marketplace 통합 존재(단 `Public Alpha`)** · Neon **at-rest AES-256 · SSL/TLS 필수 · TLS 1.2/1.3 · `verify-full`** · Neon **AWS IPv4+IPv6 · Azure 현재 IPv4만** | S9·S10·S11·N11·N12 |
| D. 확정처럼 쓴 **조건부 값 1건 강등** | Neon 직접 연결 상한 `104/209/419/839/4000` 은 **고정값이 아니다.** 공식은 `max(100, min(4000, floor(min(max_cu, 8×min_cu) × 419.66)))` 이며 **실제 값의 정본은 Neon Console 또는 `SHOW max_connections`** 다. 표의 수치는 이 공식의 **예시**다 | N13·N3 |
| E. **과장된 동일성 표현 제한** | "셋 다 표준 PostgreSQL 이라 (연결까지) 같다" → **풀링 transaction mode 에서 빠지는 세션 기능이 공급자마다 다르다.** Neon PgBouncer: `SET`/`RESET`·`LISTEN`/`NOTIFY`·`WITH HOLD CURSOR`·SQL `PREPARE`/`DEALLOCATE`·임시 테이블·`LOAD`·세션 advisory lock 미지원. Supabase Supavisor transaction mode: **prepared statement 미지원**(Node `pg` 는 query `name` 생략). **`pg_dump`·migration·논리 복제는 직접 연결 필요** | N3·S3·S12 |
| F. **판단 시점 오류 교정** | 개인정보 저장 위치는 "실데이터 연결 이후에야 조건이 된다"가 아니라 **첫 실제 개인정보 저장 전에 확정해야 하는 진입 조건** | — |
| G. **`미확인` 두 종류 분리** | (A) 우리가 덜 조사한 것 / (B) 공급자가 아직 공개하지 않은 것. Neon Object Storage 가격·한도는 **B** 다(beta 무료, 공개 수치 자체가 없음) | N5 |

**3차 소규모 정합 교정 (2026-07-28, Codex 독립검증 3차)** — 항목 **1건**만 손댔다.

- **`Neon 실시간 반영 수단` 을 통째로 `미확인` 으로 둔 것이 공식 원문과 맞지 않았다** → **미확인에서 제거하고 조건부 사실로 옮겼다.**
  **직접 연결의 `LISTEN`/`NOTIFY` 는 조건부 가능**(N3 가 "Use a direct connection for … queries that depend on SET, **LISTEN/NOTIFY**, or session-level state." 라고 안내) · **풀링(transaction mode) 연결로는 불가**(N3 미지원 목록) · **세션이 끝나면 listener·notification 이 사라지므로**(N13) 재연결·재구독 또는 폴링 대안이 필요하다(Free 는 비활성 5분 후 정지·해제 불가, 유료 플랜은 Scale to Zero 해제 가능 — N1·N13).
  **Supabase Realtime 같은 별도 관리형 실시간 제품의 존재는 여전히 미확인이며, 있다고 쓰지 않는다.**
- **`419.66` 계산식과 그 조건부 판정은 다시 바꾸지 않았다.** 2차에서 제시됐던 `450.5` 는 이전 문서 사본의 값이었고 현재 공식 원문(N13)은 `419.66` 이다. 실제 값의 정본이 **Neon Console 또는 `SHOW max_connections`** 라는 판정도 유지한다.
- 새 출처 추가 0 · 후보 재조사 0 · 후보 추가 0 · **DB 선택 0.**

**수치 재계산(표에서 직접 셈)**: 공식 출처 21 → 28 → **28** · 확정 사실 20 → 27 → **27** · 조건부 사실 3 → 4 → **5** · 미확인 21 → 17 → **16개**(개별 6 + 회사 서버 확인표 10).

**여전히 미확인 (6 + 10)**: 무료 프로젝트 자동 삭제 규정(양쪽) · Neon 백업 방식(물리/논리) · Neon **계약적 데이터 레지던시 약정**(*배치 지역 선택 가능은 확정*) · Neon Object Storage **GA 가격·확정 한도**(공급자 미공개) · **무료 등급 적합 여부**(우리 사용량 부재) · **Neon 직접 연결 상한 실제 값**(우리 프로젝트 부재) · 회사 서버 확인표 10항목.
*`Neon 실시간 반영 수단` 은 이 목록에서 빠졌다 — 전체가 미확인이 아니라 조건부 가능이기 때문이다(위 3차 교정). 미확인으로 남은 것은 **별도 관리형 Realtime 제품의 존재** 뿐이며, 이는 위 항목 안에 기록했다.*

**DB 는 여전히 미결정이다.** 회사·고도몰 서버 조건을 받기 전 공급자를 확정하지 않고, **특정 DB 서버 어댑터를 지금 구현하지 않는다.** 표준 PostgreSQL 공통분모 권고, 첨부는 DB 내부 base64 가 아니라 **object storage 참조 우선**, 최종 선택은 **11월 실서버 시험 준비 전** — 전부 그대로 유지한다. **`DECISIONS.md` 에 DB 결정을 추가하지 않았다.**

## 6. 화면·기능 — "있는데 실무에서 안 되는" 것

헌법 §6("화면에서 실제로 진입할 수 없는 기능은 완료로 인정하지 않는다") 적용 대상.

| 기능 | 코드 | 실무 | 해소 단계 |
|---|---|---|---|
| 업무 카드 → 결과 상세 | ✅ **B-use-2 에서 복구** | 부서 업무 관장 탭 → `TeamTaskPanel` 카드 [상세] → `TaskDetailModal`. 끝난 업무는 `지난 업무` 접힘에서 진입 | 완료 |
| CS 답변 발송 | 초안·검수 대기실 동작 | `writeStatus:'not_connected'` — **고객에게 나가지 않음** | G |
| 예약 실행 | 함수 존재 | **호출자 0건** | E |
| 마케팅 1팀/2팀 분리 | 없음 (`marketing` 단일) | 리터럴 `'marketing'` **95곳/41파일** | 저장 의미 = B-core-5 / 소비자 이관 = Local migration |
| 오늘의 운영 주문 통계 출처 표시 | ✅ **2026-07-28 Local migration 으로 해소** | 관제 채팅 헤더에 `주문 통계: 불러오는 중 / 실제 주문 N건 / 시험 데이터(+실제 주문 연결 안 됨) / 연결 안 됨` 표시. 통계 질문이 연결 실패·0건일 때 `activeOperationsData` 로 조용히 대체되지 않음 | 완료(자동검사 기준) |
| ~~`TaskBoard`·`TaskListModal`·`TaskResultModal` (코드는 있으나 진입 불가)~~ | **2026-07-30 Local migration 으로 삭제** | 세 화면 모두 실제 진입 경로가 없었다(호출자 0건 / 끊어진 setter 배선). 헌법 §6 대상이 **다시 마운트가 아니라 제거**로 해소됐다. 업무 상세의 활성 경로는 위 첫 행 그대로 | **완료 · Codex 독립검증 통과** (기준 `6fce721`) |

## 7. 팀별 기능 — 존재 상태

**존재하며 동작**: 상품(매출·주문·재고 통계, 재고위험, 카탈로그, 팀 채팅) · CS(문의·리뷰 분류, AI 초안, 검수 대기실, 고객 프로필·통계) · 디자인(상세페이지 생성기, 고도몰 변환기 6,790줄, 팀 화면) · 마케팅(분석 대시보드, 질문형 분석, 행동수집 기반) · HQ(오늘의 운영, 팀 지시, 승인 대기, 활동 원장) · 공통(업무 생명주기, 팀 메시지, AI 설정실·두뇌 설정, 데이터 가져오기, 고도몰 연동 화면 — 총 10개 메뉴)

**존재하지만 실무 미완주**: 문의·리뷰 실제 API 미연결 · 고객 답글·상품등록 WRITE 잠김 · 자동발주 · 상담 챗봇 · 광고 운영

## 8. 계산 계약

정본으로 살아 있음: `revenueMetricContract` · `inventoryRiskContract` · `claimEventContract` · `inquiryStatusContract` · `dataSourceProvenanceContract`

**소비자 수 교정 (2026-07-30 실측)** — 이전 기록 "`isValidOrder` **5파일** import" 는 낡았다.

| 항목 | 값 | 집계 기준(다시 낡지 않도록 명시) |
|---|---|---|
| `isValidOrder` 직접 import 소비자 | **6** | `grep -rln "isValidOrder" --include=*.ts --include=*.tsx src api` 결과 **8**파일에서 ① 계약 파일 자신(`revenueMetricContract.ts`) ② 본문 언급이 **주석 1줄뿐**인 `src/types/dataConnector.ts:25` 를 뺀 수. 대상: `analyticsQueryEngine` · `commerceDataQueryEngine` · `departmentDataSourceOfTruth` · `marketingAnalysisExecutor` · `marketingAnalysisFacts` · `marketingChatQueryRouting` |
| `revenueMetricContract` 모듈 import 파일 | **10** | `grep -rln "from '.*revenueMetricContract'" --include=*.ts --include=*.tsx src api`. 위 6 + `ProductTeamDashboard.tsx` · `departmentMetricContract.ts` + 2026-07-30 신규 연결 `csCustomerManagementFacts.ts` · `csTeamDashboardFacts.ts` |

`departmentDataSourceOfTruth.ts:250` 은 `isValidOrder` 를 **재수출**한다(부서가 같은 판정을 쓰도록). 재수출 경유 소비자는 위 수에 포함하지 않았다.

**제품 경로 우회 — 기록 교정 (2026-07-30, 직접 재조사)**

이전 기록 "**우회 3건 남음**(`dataNormalizer.ts` · `agentExecutor.ts:70` · `csCustomerManagementFacts.ts:144-146`)"은 **현재 코드와 맞지 않았다.** 두 종류의 오류가 있었다(헌법 §10 — 새 사실이 아니라 이전 주장의 오류로 기록).

| # | 이전 기록 | 실측 (2026-07-30) |
|---|---|---|
| 1 | `src/utils/dataNormalizer.ts` 우회 | **이미 해소.** `:14` 에서 `inventoryRiskContract` 를 import 하고 `:469` 에서 `classifyStockRiskWithSaleState` 를 호출한다(B-core-2a) |
| 2 | `src/engine/nativeAgentRuntime/agentExecutor.ts:70` 우회 | **이미 해소.** `:3` import · `:77` `classifyStockRiskWithSaleState` 호출. 직접 임계 비교 제거됨(B-core-2a) |
| 3 | `src/services/csCustomerManagementFacts.ts:144-146` 우회 | 실재했다. **2026-07-30 Local migration 으로 해소**(아래) |
| — | **기록에 없던 활성 중복 소비자** | `src/services/csTeamDashboardFacts.ts:766-767` 이 **같은 계산을 한 벌 더** 갖고 있었다. 이전 기록은 한 경로만 적어 **범위가 좁았다.** 같은 화면에서 금액이 갈릴 수 있었으므로 두 경로를 함께 마감했다 |

**확인 범위 확장 (2026-07-30 같은 날, 헌법 §10)** — 위 표 직후 적었던 "현재 남은 계산 계약 우회 **0건**" 은 **확인 범위가 `revenueMetricContract`·`inventoryRiskContract` 관련 4지점뿐**이었다. 그 범위를 `claimEventContract` 로 넓히자 **`analyticsQueryEngine.ts:574`(환불 위험 상품)이 원시 `claimTypes` 문자열을 직접 비교**하고 있었다. 결론을 번복한 것이 아니라 **이전 주장의 확인 범위가 좁았던 것**이며, 이 건은 아래 Local migration 으로 마감했다.

**현재 남은 계산 계약 우회: 0건** — 확인 범위 = ① 위 표의 4지점 ② `claimEventContract` 소비 경로. **저장소 전수 재감사는 하지 않았다.**

## 9. 미확인 항목

- ~~Preview `products` 13건의 실제 출처~~ → **B1-0에서 확정**(§3): 현재 설정된 real 모드 고도몰 Open API의 실제 응답. 새 판매몰 키 미등록과 캡처 매니페스트를 근거로 기존 시험몰 자료로 판단
- **시험몰 계정이 실제로 만료됐는지** — Open API는 응답 중. 고도몰 관리자 확인 필요(사용자)
- **고도몰 `orderStatus` 코드의 공식 의미** — `o1`=입금대기만 실측 확정. 나머지(`p/d/g/s/f` 단계)는 코드 내 추정. **결제완료 판정을 어느 쪽으로 통일할지가 여기에 달려 있다**(B-core-2 §4-1) → C단계 입력
- **A/B 경계 사건이 실제 주문에서 발생하는지** — B-core-2 fixture의 C9·C10·NaN 재고는 코드상 가능한 경로로 만든 것이며 실제 시험몰 주문에서 관측하지 않았다(Production 주문 실제 0건이라 대조 불가)
- **`claimEventContract` A/B parity** — A 투영에 claim 표현이 전혀 없어 비교 축 자체를 세우지 못했다. provider 이후 별도 축
- 실제 운영 데이터량 (B4의 DB 사이징 입력 — 상한 가정으로 대체 예정)
- 기존 localStorage에 쌓인 시험 자료의 양과 보존 가치 (B5에서 JSON 백업 후 확인)
- 새 세션에서 시작 잠금(첫 줄 인용)이 실제로 작동하는지 — **다음 세션 첫 응답으로만 검증 가능**
