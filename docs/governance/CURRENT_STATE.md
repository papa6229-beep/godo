# 현재 상태 (사실 기준선)

정본 위치: `D:\godo\docs\governance\CURRENT_STATE.md`
최종 갱신: 2026-07-27 (A2 local main 통합 완료)

**규칙**: 이 문서는 **관측된 사실만** 적는다. 계획·의도·추정은 `MASTER_PLAN.md`에 쓴다.
주장에는 확인 범위를 함께 쓴다(헌법 §10). 확인하지 않은 것은 "미확인"으로 남긴다.

---

## 1. Git·배포

| 항목 | 값 | 확인 방법 |
|---|---|---|
| local main의 A2 통합 기준 | `22f86b5be331990010ae424a1219df3911cc6905` (A2 커밋 2개 fast-forward 통합) | `git rev-parse main` |
| origin/main = Production Source 기준 | `5190f685ebfc0b7bb686817fa9d37216797171e1` (**local main보다 2커밋 뒤**, 미푸시) | `git rev-parse origin/main` |
| 인증 기능 브랜치 | `fix/auth-foundation-01-red` → `838e2c447f5f7f813845330746e377f156628bde` · **main 미병합** | `git rev-parse` / `git branch --merged main` |
| A2 작업 브랜치 | `codex/a2-governance-wiring` (`5190f685`에서 분기) | `git rev-parse --abbrev-ref HEAD` |
| 실행 환경 | **Vercel이 유일한 실행 환경** — 개발·검증·Production 모두 담당. 최종 배포 형태는 H단계 미결 | Vercel 대시보드 관측 |

## 2. 검사·빌드 (A2 브랜치 기준)

| 항목 | 값 | 확인 방법 |
|---|---|---|
| smoke 파일 수 | **120개** (main 기준. 인증 브랜치에 3개 추가분 있음) | `ls scripts/smoke-*.mjs \| wc -l` |
| manifest include | **120** / exclude **0** | `node scripts/run-regression.mjs --discover` |
| lint | **0 errors** (`scripts/flowRouteSmoke.ts:49` 수정 후) | `npx eslint .` |
| build | 통과 (`tsc -b` + `typecheck:api` + `vite build`) | `npm run build` |
| `npm test` 실제 소요 | **130초** (smoke 111.5s + build + lint), exit 0 | `npm test` 1회 실행 |

A2 local main 통합 후 재검증: smoke **120/120**·build·`typecheck:api`·lint 통과, exit 0. 원격 push·Production 배포는 하지 않았다.

## 3. 고도몰 연결

- 기존 시험몰: 사용자는 **계정 만료**로 알고 있으나, **2026-07-27 07:24~07:25 GMT 관측 시점에 Open API는 정상 응답했다**(아래). 계정 만료와 API 차단 시점이 다를 수 있음 → **사용자 확인 필요**
- 새 판매몰 계정 생성 완료, **개발자 등록·API 키 발급 대기 중**
- 키는 채팅으로 전달받지 않는다. **Preview 환경변수 등록 → 검증 → Production 등록** 순서
- 서버 기본 모드: `GODOMALL_API_MODE` 미설정 시 **`mock`** (`api/_shared/secretGuard.ts:25`). **현재 Production은 `real`**, partner/user 키 present (`/api/godomall/health` 관측 — 값 미확인)

### 상품 13건의 출처 — **확정 (B1-0, 2026-07-27)**

**출처 = 기존 시험몰의 실제 외부 Open API 응답. `sourceType: api_proxy_real`은 정확하다.**

- 확인 대상: **Production** `godo-psi.vercel.app` / Source `5190f68` / branch `main`
  (최초 13건 관측은 Preview `838e2c4`였고, 두 배포의 조사 대상 코드 경로는 동일)
- `api_proxy_real`은 `godomallResource.ts:187` 한 곳에서만 할당되며 **외부 호출 성공 후**에만 붙는다. 실패 시 mock으로 떨어지는 경로가 **없다**(실패 = `unavailable` + 0건)
- 시뮬레이션 카탈로그는 이 경로에 진입하지 않는다 — `loadSimCatalogV1`은 `resolveResource`가 아니라 Sync All 합성 경로(`:465`)에서만 사용
- **지문 일치의 방향**: `simCatalogV1.data.ts` 매니페스트가 `capturedFrom: '/api/godomall/products (Production, sourceType api_proxy_real)'`라고 스스로 기록한다. 카탈로그가 **이 응답에서 떠 온 사본**이므로 13건이 같은 것이 당연하다(주입이 아님)
- mock fixture는 **4건**이고 productId 체계가 다르다 → 후보 탈락
- 캐시 아님: `x-vercel-cache: MISS` · `age: 0` · 왕복 **1832 ms**
- 라벨이 상태를 구분함(같은 시점 관측): products/inventory **api_proxy_real 13건** · orders **api_proxy_real 0건**(실제 0) · inquiries/reviews **unavailable 0건**(미연결). 소요도 각각 600~3000 ms vs ~220 ms로 갈린다

증거·재현 명령: `docs/governance/evidence/B1-0_PRODUCT_SOURCE_AUDIT.md`

**미확인**: Vercel 함수 런타임 로그 원문 · 시험몰 계정의 실제 만료 상태 · 최초 Preview 관측 시점의 응답 원본(미보존)

## 4. 데이터·저장

- 업무 기록은 **브라우저 localStorage 중심**
- `taskLifecycleStore.ts:16` `MAX_TASKS = 500` · `:52` `slice(-500)` · `:54` 저장 실패를 조용히 무시
- `activityLedger.ts:10` `MAX_EVENTS = 500` · `:37` `slice(-500)`
- → **501번째부터 오래된 이력이 경고 없이 사라짐** (헌법 §5 위반 상태, B5에서 해소)
- 데이터 세계가 둘: `activeOperationsData`(적재 스냅샷, 소비자 12파일 + `src/engine` 2파일) / `fetchRevenue`(라이브 읽기, 호출자 3곳, **공유 캐시 없음·인자 상이**)

## 5. 실행 방식

- **사실상 수동 실행 기반**. `runScheduledAgentTask`(`src/services/agentTaskRunner.ts:169`)는 정의만 있고 **제품 코드 내 호출자 0건**
- 살아 있는 진입점: `runManualAgentTask` ← `src/components/AgentTaskPanel.tsx:38`
- AI 실행은 `kind:'agent'`로, 사람의 승인·반려·중단은 `kind:'human'`으로 활동 원장에 분리 기록됨(`agentTaskRunner.ts:53,63,70,74,117,126`). 다만 사람 라벨이 `'운영자'` 하드코딩 → B3에서 실제 계정 연결

## 6. 화면·기능 — "있는데 실무에서 안 되는" 것

헌법 §6("화면에서 실제로 진입할 수 없는 기능은 완료로 인정하지 않는다") 적용 대상.

| 기능 | 코드 | 실무 | 해소 단계 |
|---|---|---|---|
| 업무 카드 → 결과 상세 | 모달·핸들러 존재 | **진입 경로 없음** (`OfficeView.tsx:34-35` props 미사용, `<TaskBoard` 렌더 0건) | B-use-3 |
| CS 답변 발송 | 초안·검수 대기실 동작 | `writeStatus:'not_connected'` — **고객에게 나가지 않음** | G |
| 예약 실행 | 함수 존재 | **호출자 0건** | E |
| 마케팅 1팀/2팀 분리 | 없음 (`marketing` 단일) | 리터럴 `'marketing'` **95곳/41파일** | 저장 의미 = B-core-5 / 소비자 이관 = Local migration |

## 7. 팀별 기능 — 존재 상태

**존재하며 동작**: 상품(매출·주문·재고 통계, 재고위험, 카탈로그, 팀 채팅) · CS(문의·리뷰 분류, AI 초안, 검수 대기실, 고객 프로필·통계) · 디자인(상세페이지 생성기, 고도몰 변환기 6,790줄, 팀 화면) · 마케팅(분석 대시보드, 질문형 분석, 행동수집 기반) · HQ(오늘의 운영, 팀 지시, 승인 대기, 활동 원장) · 공통(업무 생명주기, 팀 메시지, AI 설정실·두뇌 설정, 데이터 가져오기, 고도몰 연동 화면 — 총 10개 메뉴)

**존재하지만 실무 미완주**: 문의·리뷰 실제 API 미연결 · 고객 답글·상품등록 WRITE 잠김 · 자동발주 · 상담 챗봇 · 광고 운영

## 8. 계산 계약

정본으로 살아 있음: `revenueMetricContract`(`isValidOrder` 5파일 import) · `inventoryRiskContract`(`classifyStockRisk` 4파일) · `claimEventContract`(4파일) · `inquiryStatusContract` · `dataSourceProvenanceContract`

**제품 경로 우회 3건 남음**(Local migration, B-core 완료 직후): `src/utils/dataNormalizer.ts` · `src/engine/nativeAgentRuntime/agentExecutor.ts:70` · `src/services/csCustomerManagementFacts.ts:144-146`

## 9. 미확인 항목

- ~~Preview `products` 13건의 실제 출처~~ → **B1-0에서 확정**(§3): 기존 시험몰 실제 응답
- **시험몰 계정이 실제로 만료됐는지** — Open API는 응답 중. 고도몰 관리자 확인 필요(사용자)
- 실제 운영 데이터량 (B4의 DB 사이징 입력 — 상한 가정으로 대체 예정)
- 기존 localStorage에 쌓인 시험 자료의 양과 보존 가치 (B5에서 JSON 백업 후 확인)
- 새 세션에서 시작 잠금(첫 줄 인용)이 실제로 작동하는지 — **다음 세션 첫 응답으로만 검증 가능**
