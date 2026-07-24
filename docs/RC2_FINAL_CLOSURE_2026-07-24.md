# RC-2 최종 종료 문서 — 업무·실행·결과물·승인 생명주기 계약

**작성일** 2026-07-24
**판정** RC-2 「업무·실행·결과물·승인 생명주기 계약 완료」로 종료
**병합 커밋** `503e3d8f6da8fb2ce95040525534565edbbcc3a4` (main = origin/main = Production Source)

> 이 문서는 **사실 / 자동검사 증거 / 육안검증**을 구분해 기록합니다.
> 자동검사 = 스크립트가 결정론적으로 검증한 것, 육안검증 = 브라우저에서 사람이 직접 화면을 확인한 것.

---

## 1. 쉬운 말 요약 (포트폴리오용)

RC-2는 "누가 일을 시키고, 누가 실제로 하고, 결과를 누가 확인하는가"를 **한 줄기로 이어지는 규칙**으로 정리한 작업입니다. 회사 조직처럼 동작하도록 만들었습니다.

- **총괄(HQ)은 팀에게 지시**합니다. 다른 팀의 AI에게 직접 명령하지 않습니다.
- **실제 수행자 선택·업무 시작·중단은 담당 팀장이 결정**합니다. 총괄은 요청만 할 수 있습니다.
- **팀 간 협업**은 요청한 팀의 "추적 카드"와 수행하는 팀의 "실행 업무"로 연결됩니다. 같은 일이 두 번 실행되지 않습니다.
- **팀 → 총괄 확인 요청**은 실행할 업무가 아니라, 이미 만든 안을 **결정만 하는 카드**입니다.
- **총괄의 결정은 세 가지**뿐입니다: 확인 완료 · 수정 요청 · 이번 결과 사용 안 함.
- **수정 요청**은 원래 결과와 사유를 **지우지 않고 보존**하며, 원 팀에게 **새 일반 업무**로 돌려보냅니다.
- 수행자를 **사람 / AI / 미배정 / 미상 AI**로 구별해 표시합니다.
- **미상(소속 확인 불가) AI**는 실행할 수 없도록 격리되며, 총괄 권한으로 승격되지 않습니다.
- **업무를 소유한 팀**과 **수행자의 소속**은 별개로 다룹니다.
- **중단은 삭제가 아닙니다.** 왜 멈췄는지 기록이 남습니다.

한 줄 요약: **지시 → 팀 도착 → 팀장의 수행자 선택 → 결과 제출 → 팀장 확인 → 총괄 확인**의 흐름을, 어떤 결정에서도 기록을 지우지 않으면서 하나의 업무 식별자로 추적합니다.

---

## 2. 구현 범위

- **단일 lifecycle 추적**: 하나의 업무 ID·correlationId, 협업의 parent/child, 수정본의 revision(`revisionOfTaskId`)을 한 흐름으로 역추적.
- **상태 전이와 승인 단계**: `open → in_progress → awaiting_approval → completed`(및 `not_adopted/stopped/returned/superseded`), 다단계 승인 경로(담당 팀장 → 총괄 등)와 현재 단계 판정.
- **역할별 열람**: 총괄은 전 팀 열람, 팀장은 자기 팀(및 요청팀) 업무만.
- **수행자 이력·제출자·결정 사유**: 수행자 변경은 덮어쓰지 않고 append(`executorHistory`), 제출자(`submittedBy`)·결정 사유(decisions) 보존.
- **영속화**: `localStorage` 단일 소유 저장 서비스(`godo.rc2.taskLifecycle.v1`, 엔벨로프 스키마 v1), 새로고침 후 복원.
- **상시업무 자동실행 게이트**: 담당 팀장 사전 승인이 없으면 상시 지시가 자동 실행되지 않음(`canRunStandingDirective`).
- **화면 실배선**: App(오늘의 운영), 팀 업무 화면(TeamTaskPanel), 승인 화면(ApprovalList/Detail, TaskBoard, MetricDrilldown)이 계약 함수와 실제로 연결됨. 표시는 공통 함수로 통일(`executorDisplayLabel`, `revisionReasonOf`, `approvalActorDisplay`, `approvalTeamId`/`teamIdForDepartment`).
- **검증 범위**: Preview 육안검증 + Production 대표 실검증(아래 4장).

D-1.3.3.2 / D-1.3.3.2.1 에서 실제로 변경한 소스는 표시·투영·읽기 전용 헬퍼에 한정됩니다(상태 계약·권한·계산식 무변경).

---

## 3. 계보 · 배포 증거 (사실)

| 항목 | 값 |
|---|---|
| 기준 main (병합 전) | `6dca85db57bef1c4317f3fa0adfc42e0b87b149c` |
| 기능 브랜치 HEAD | `86513fb5fac792d33bc06394da2f3f7c4c52d1e8` (`fix/rc-2-task-lifecycle-contract`, 보존) |
| 병합 커밋 (`--no-ff`) | `503e3d8f6da8fb2ce95040525534565edbbcc3a4` |
| 병합 부모 1 (기존 main) | `6dca85db57bef1c4317f3fa0adfc42e0b87b149c` |
| 병합 부모 2 (기능) | `86513fb5fac792d33bc06394da2f3f7c4c52d1e8` |
| origin/main | `503e3d8` (일반 push, force/amend/rebase 없음) |
| Production Source | `503e3d8` |
| Vercel Production 배포 ID | `PBhDtWrFy` (`PBhDtWrFyoc4v2ei3SEeLdjU1TNB`) |
| 배포 상태 | **Ready · Current** (Environment Production), 빌드 45s |
| Production URL | **`godo-psi.vercel.app` HTTP 200** (별칭: `godo-git-main-…`, `godo-cldlzcf6o-…`) |
| 이전 Production (롤백 참고값) | `6dca85d` ("DATA-SOURCE-SERVER-01") |

병합은 main이 `6dca85d`였으므로 RC-2 D-1 라인 전체(D-1.2 → D-1.3.3.2.1)를 통합했습니다.

---

## 4. 검증 증거

### 4.1 전체 자동검사 (main `503e3d8`, clean tree)

| 검사 | 결과 |
|---|---|
| 전체 smoke (`smoke-*.mjs`) | **105 / 105 pass · 0 fail** (병합 직후·Production 검증 후 2회 동일) |
| flowRoute (`flowRouteSmoke.ts`) | pass |
| `tsc -b` | exit 0 |
| `npm run build` (`tsc -b && vite build`) | exit 0 (234 modules, chunk-size는 기존 advisory 경고) |
| 신규 lint (통합 파일 42개 eslint) | exit 0 (신규 오류 0) |
| `git diff --check` (6dca85d..HEAD) | clean |
| 제어문자/NUL 가드 (`smoke-no-nul-bytes` + 병합 파일 스캔) | clean |
| `git status` | clean |

lint 전체(`eslint .`) 1건은 `scripts/flowRouteSmoke.ts:49 catch (e: any)` — 병합 범위에서 미변경, 구 main `6dca85d`에 이미 존재하는 **선행** 항목(이번 통합이 만든 것 아님).

### 4.2 RC-2 하위 검사별 정확한 수치 (BASE / RED met, 0 unmet)

| 검사 | BASE | RED met | 범위 |
|---|---|---|---|
| task-lifecycle | 5 | **40** | 생명주기 계약 R1~R7 + 운영 정책 P1~P20 |
| app-integration | 2 | **39** | App 실배선 통합 A1~A36 |
| d12-authority-policy | 2 | **51** | 권한 정책 P1~P49 + A26R/A27R |
| d13-consumer-wiring | 2 | **30** | 소비자 실배선·전이 안전장치 W1~W30 |
| d131-stop-request-collab-testrun | 2 | **31** | 중단 요청·협업·시험 운영 S1~S31 |
| d132-collab-stop-flow | 2 | **16** | 협업 중단 흐름 T1~T16 |
| d1331-review-only-card | 2 | **15** | HQ 확인요청 결정 전용 V1~V15 |
| d133-stop-authority-hq-review | 2 | **30** | 중단 요청 권한·팀→HQ 확인요청 U1~U30 |
| d1332-preview-display | 9 | **11** | D-1.3.3.2 표시(A·B·C) + 보완 |
| d13321-approval-team-attribution | 6 | **10** | D-1.3.3.2.1 부서 귀속 판정 |
| **합계** | **34** | **273** | 0 unmet |

### 4.3 Preview 육안검증 (deployment `FkKxJPh83`, Source `86513fb`)

익명 `[시험]` 스냅샷 주입으로 실제 화면에서 확인:
- **확인 요청 표시**: ApprovalListModal·ApprovalDetailModal이 "CS팀 · CS팀장"(제출팀·제출자) 표시, '담당 에이전트/수행자 미정/소속 확인 필요/내부 ID' 없음. 결정 정확히 3개, 배정·제출·중단·중단요청 없음.
- **수정 요청**: 원본 사유 정확 표시 + 새로고침 유지 + 원본 보존·사유 미복제(저장자료 확인), 원본 유실 시 "수정 사유 확인 필요".
- **인간·AI 수행자**: 인간=상품관리팀장, AI=기존 표시명, 미배정=수행자 미정, 미상 AI=소속 확인 필요 (4경우 차등).

### 4.4 Production 대표 실검증 (`godo-psi.vercel.app`, Source `503e3d8`)

익명 `[시험]` 스냅샷을 브라우저 localStorage 범위에서만 사용, 검증 후 원상복원(원래 부재 상태로).

1. **HQ→상품팀 지시**: 팀만 지정한 지시가 상품팀 '할 일'로 도착, 수행자 미배정(AI 미지정).
2. **수행자 표시**: 미배정→수행자 미정 / 인간→상품관리팀장 / AI→재고/판매상태 감시 AI (PDT-M) / 미상 AI→소속 확인 필요.
3. **수정 요청**: revision에 원본 사유 정확 표시, 새로고침 후 유지, 수정본 수행자=미정(자동 재배정 없음), 원본 유실→"수정 사유 확인 필요".
4. **CS→HQ 확인요청**: 목록/상세 모두 "CS팀 · CS팀장", 결정 3개(확인 완료·수정 요청·이번 결과 사용 안 함), 배정·제출·중단·중단요청 없음.
5. **중단 흐름**: D-1.3.3.2/.2.1이 변경하지 않은 계약 — 재실행 스모크 d131/d132/d133 pass로 검증(HQ는 중단 요청만·실제 중단은 담당 팀장·기록 삭제 없음). **라이브 UI 전 과정 실행은 미수행 → 자동검사 증거**.
6. **역할별 열람**: HQ 내 확인 대기 1건(reviewOnly만 결정 가능)·상품팀장 4건만·CS팀장 3건만·미상 AI는 상품팀 소속 유지(HQ 미승격).

### 4.5 실제자료 / 시험자료 / 연결 안 됨 구별 (Production API, 각 HTTP·sourceType·건수)

| 리소스 | HTTP | sourceType | 건수 | 판정 |
|---|---|---|---|---|
| products | 200 | api_proxy_real (real) | 13 | 실제(시험몰 연결 살아있음) |
| inventory | 200 | api_proxy_real (real) | 13 | 실제 |
| orders | 200 | api_proxy_real (real) | 0 | **실제 0건** |
| sales | 200 | api_proxy_real (real) | 0 | **실제 0건** |
| orders-revenue | 200 | api_proxy_real, realOrdersStatus=success, syntheticStatus=not_requested | count 0 | 실제 0건 |
| inquiries | 200 | **unavailable** ("not connected") | 0 | **연결 안 됨** |
| reviews | 200 | **unavailable** ("not connected") | 0 | **연결 안 됨** |

- **실제 0건(api_proxy_real, 빈 배열)과 연결 안 됨(unavailable) 구별됨.** mock 문의·리뷰·주문 자동 대체 없음. 외부 고도몰 WRITE 없음.

### 4.6 매출·주문·재고·문의 계산 무회귀

- 시험 매출 88,116,982원 · 운영 주문수 1,182건 · 재고위험 4개: **계산 모듈 무변경** + `metric-definition-parity`·`cross-team-revenue-metric-parity`·`C-2`·`C-3`·`C-4`·`synthetic-commerce-universe` 스모크 pass로 **불변 검증**(자동검사). 병합 범위에서 매출/주문/재고/문의/analytics 계산 소스 0파일 변경.
- (참고: 라이브 대시보드 수치 스팟리드는 미수행 — 계산 소스 무변경이라 파리티 스모크가 결정적 증거.)

### 4.7 Build-log 16 실제 분류 결과 (Production `PBhDtWrFy`, 읽기 전용)

Vercel 배지 **16 errors / 1 warning**. 로그는 가상화(108줄)라 DOM 렌더분에서 **6개 distinct 오류 라인**을 확인(배지 16은 연속 상세 라인 + 두 번의 tsc 패스 중복 집계). **모든 오류는 `api/` 서버리스 함수, `src/`(RC-2가 수정한 클라이언트) 오류 0개.**

| 파일 | 오류 |
|---|---|
| `api/_shared/detailImageFetch.ts:288` | TS2339 `'status' does not exist on type 'TargetCheck'` |
| `api/_shared/detailImageFetch.ts:330/341/345` | TS2591/TS2552 `Cannot find name 'Buffer'` |
| `api/godomall/[resource].ts:1` | TS2591 `Cannot find name 'http'` |
| `api/_shared/marketingBehaviorCollectionValidator.ts:179` | TS2339 union 타입 `'reason'` 속성 |

분류·판정:
- **성격**: `@types/node`는 package.json에 존재(`^24.12.3`)하나 Vercel의 api 함수 격리 type-check가 node 전역(`Buffer`/`http`)을 해석하지 못하는 **tsconfig `types` 해석 quirk** + union 타입 속성 접근 — API 함수의 타입주석/설정 이슈이지 런타임 로직 오류가 아님.
- **선행 확정**: 병합 범위 `6dca85d..HEAD`에서 **api/ 파일 0개 변경**, 세 파일 모두 이전 Production `6dca85d`에 동일 존재 → 이전 Production·Preview에도 같은 16이 있었고 모두 정상 작동. **RC-2/이번 병합이 만든 것 아님.**
- **비치명**: 배포 Ready, 빌드 캐시 생성·업로드 완료, `/api/godomall/*` 라이브 전부 HTTP 200. 로컬 `tsc -b`·`vite build`(클라이언트)는 clean(exit 0).
- **경고 1건**: 가상화 뷰포트 밖이라 개별 라인 미포착(전 108줄 라인별 스크롤은 미수행).
- **조치**: RC-2 범위(src/ lifecycle) 밖이며 수정은 api/ 제품 코드·tsconfig 변경이 필요 → 이번 종료에서는 코드 수정·재배포 없이 **후속 대장(DATA-QUALITY-DOMAIN-01 / api 타입 정리)로 이관**. RC-2 lifecycle 종료를 막지 않음(src/ 빌드 오류 0, 배포 Ready, API 200).

---

## 5. 과장하지 않을 범위 (한계 명시)

- **실제 AI 실행 엔진이 모든 업무를 자동 수행하는 완성 단계는 아님** — AI 업무는 실행 연결 전까지 '진행 중'에서 정직하게 대기하며 가짜 결과를 만들지 않음.
- **실제 로그인·서버 권한 격리는 아직 없음** — 역할 전환기는 데모용이며 권한 실증의 정본이나, 백엔드 인증/격리는 후속.
- **lifecycle 저장소는 현재 브라우저 `localStorage`** 이며 회사 공용 서버 저장소가 아님(기기·브라우저 로컬).
- **실제 시각 스케줄러 발화는 아직 없음** — 상시업무는 게이트만 있고 자동 시각 발화는 미구현.
- **고도몰 WRITE는 연결하지 않음** — 모든 확인은 내부 기록만 남으며 외부 등록/발송 없음.
- **육안 미검증 2건(자동검사 증거만)**:
  - `TaskResultModal` reviewOnly 중단 버튼 부재 — UI 진입 불가, 자동검사(`d1332` B6: onCancel 렌더 게이트 + App reviewOnly onCancel 차단).
  - `OperationBriefingModal` 부서 드릴다운 — UI 진입 불가(네이티브 run 필요), 순수 함수·자동검사(`d13321` 10/10).
- **채워진 실제 주문 필드는 새 판매몰 시험 주문 이후 검증** — 현재 orders/sales 실제 0건이라 주문 상세 필드는 데이터 확보 후 검증.
- **실제 문의 상태 어휘는 Board_List 연동 이후 확정** — inquiries가 연결 안 됨(unavailable)이라 상태 어휘는 연동 후 고정.

---

## 6. 후속 대장

- **DATA-SOURCE-SERVER-02** — 데이터 출처/프록시 후속.
- **C4-SERVER-01** — 문의 상태 계약(Board_List 연동) 후속.
- **DATA-QUALITY-DOMAIN-01** — 데이터 품질(포함: api/ 서버리스 함수 TS 타입 정리 — Build-log 16 선행 항목).
- **실제 로그인·서버 저장·권한 격리** — 백엔드 인증/공용 저장소/역할 격리.
- **실제 스케줄러** — 상시업무 실제 시각 발화.
- **새 판매몰 시험 주문·문의·리뷰 검증** — 실데이터 확보 후 주문/문의/리뷰 실검증.
- **RC-3는 별도 착수** (아래 7장 선행조건 충족 후).

---

## 7. RC-3 선행조건

RC-3 = 「**변환기 출력 계약 · 실제 산출물 출구**」. **자동 착수하지 않는다.** 다음 자료·정책이 확보되어야 착수 가능하다고 명시한다.

- **현재 상세페이지 변환기의 실제 출력 형태와 대표 결과물** — 지금 변환기가 내놓는 HTML/구조의 실제 예시.
- **고도몰 대량 상품등록 엑셀 템플릿 또는 실제 샘플** — 등록에 쓸 실제 열 구성/양식.
- **상세페이지 이미지/HTML 등 고도몰 등록 묶음의 필수 구성 확인** — 등록 한 건이 필요로 하는 구성요소.
- **시작 정책 확정** — 자동 업로드가 아니라 우선 "**검토 가능한 등록 묶음 다운로드**"까지로 시작할지 사용자 정책 결정.

---

## 부록 — 이 종료의 미수행 항목 (사실)

이 문서 작업에서 하지 않은 것: PR 생성, main 병합, Production 재배포, 기능 브랜치 삭제, RC-3 착수, 제품 코드 수정. `docs/rc-2-final-closure` 브랜치에 이 문서 1개만 추가한다.
