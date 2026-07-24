# RC-2 최종 종료 문서 — 업무·실행·결과물·승인 생명주기 계약

**작성일** 2026-07-24 (정정: BUILD-TYPECHECK-01 완료 반영)
**판정** RC-2 「업무·실행·결과물·승인 생명주기 계약 완료」로 종료
**RC-2 기능 병합 커밋** `503e3d8f6da8fb2ce95040525534565edbbcc3a4` (부모 `6dca85d`+`86513fb`)
**최종 검증된 제품 코드 기준선** `82878434e253106dbabb9f38e5b01031f0c79096` (BUILD-TYPECHECK-01 후속 설정 보정 병합, 부모 `503e3d8`+`00bc1e0`)

> **기준선 구분**: RC-2 **기능 구현**의 계보는 `503e3d8`(부모 `6dca85d`+`86513fb`). **최종 검증된 제품 코드 기준선**은 후속 빌드 타입검사 보정(BUILD-TYPECHECK-01)을 포함한 `8287843`. RC-2 기능 계보를 `8287843`으로 바꿔 쓰지 않는다.
>
> **제품 코드 기준선 불변 주석**: 이후 이 종료 문서만 추가·병합하는 커밋(및 그에 따른 Production 문서-only 배포)은 Git main·Production Source 해시를 바꿀 수 있으나, 제품 `api/**`·`src/**` 코드는 검증 기준선 `8287843`과 **동일**하다. 아래 "현재 main/Production Source"류의 움직이는 단언은 쓰지 않고, 완료 당시의 검증 사실로 기록한다.
>
> **정정 이력**: 이 문서는 최초 `7392308`(임시 보존본). 본 문서는 BUILD-TYPECHECK-01 완료(BUILD-TYPECHECK-01 Production 검증 Source `8287843`, Build-log errors 0)를 반영해 §3·§4.1·§4.7·§6 를 갱신한다. 다른 절의 RC-2 하위 계약 검사 수치는 의미 변경 없이 유지한다.

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

### 3.1 RC-2 기능 계보

| 항목 | 값 |
|---|---|
| 기준 main (기능 병합 전) | `6dca85db57bef1c4317f3fa0adfc42e0b87b149c` |
| RC-2 기능 브랜치 HEAD | `86513fb5fac792d33bc06394da2f3f7c4c52d1e8` (`fix/rc-2-task-lifecycle-contract`, 보존) |
| **RC-2 기능 병합 커밋** (`--no-ff`) | `503e3d8f6da8fb2ce95040525534565edbbcc3a4` (부모 `6dca85d`+`86513fb`) |
| RC-2 최초 Production Source | `503e3d8` |
| RC-2 최초 Production 배포 ID | `PBhDtWrFy` (`PBhDtWrFyoc4v2ei3SEeLdjU1TNB`) — 롤백 참고값 |

RC-2 기능 병합은 main이 `6dca85d`였으므로 RC-2 D-1 라인 전체(D-1.2 → D-1.3.3.2.1)를 통합했습니다.

### 3.2 후속 빌드 기준선 복구 (BUILD-TYPECHECK-01) · 최종 검증된 제품 코드 기준선

| 항목 | 값 |
|---|---|
| 후속 기능 브랜치 HEAD | `00bc1e03ef3b78e5f384970da62f6be97f4ee546` (`fix/build-typecheck-api-functions-01`, 보존) |
| **후속 병합 커밋** (`--no-ff`) | `82878434e253106dbabb9f38e5b01031f0c79096` (부모 `503e3d8`+`00bc1e0`) |
| **BUILD-TYPECHECK-01 Production 검증 Source (제품 코드 기준선)** | `82878434` (`8287843`) |
| **BUILD-TYPECHECK-01 Production 검증 배포 ID** | `7baaiGGvq` (`7baaiGGvqadAWbt4QcgvsU2rFoRa`) |
| 검증 시 배포 상태 | **Ready · Current** (Environment Production), 빌드 32s, Build-log **errors 0 / warnings 1** |
| 검증 시 Production URL | **`godo-psi.vercel.app` HTTP 200** (별칭: `godo-git-main-…`, `godo-96ozfa232-…`) |
| 이전 Production (롤백 참고값) | `503e3d8` (배포 `PBhDtWrFy`) |

> 이후 문서-only 병합·배포로 Git/Production Source 해시가 바뀌어도, 제품 `api/**`·`src/**` 코드는 이 검증 기준선 `8287843`과 동일하다.

---

## 4. 검증 증거

### 4.1 전체 자동검사 (제품 코드 검증 기준선 main `8287843`, clean tree)

| 검사 | 결과 |
|---|---|
| 전체 smoke (`smoke-*.mjs`) | **108 / 108 pass · 0 fail** (BUILD-TYPECHECK RED-1·RED-2·GREEN 3종 추가; RC-2 기능 병합 시점엔 105/105) |
| flowRoute (`flowRouteSmoke.ts`) | pass |
| `tsc -b` / `tsc -b --force` | exit 0 / **0오류** |
| `npm run typecheck:api` (`tsc -p api/tsconfig.json`) | **0오류** |
| 현재 build 명령: `tsc -b && npm run typecheck:api && vite build` | 성공(chunk-size는 기존 advisory 경고) |
| 신규 lint (`eslint src api`) | exit 0 (신규 오류 0) |
| `git diff --check` | clean |
| 제어문자/NUL 가드 (`smoke-no-nul-bytes` + 병합 파일 스캔) | clean |
| `git status` | clean |

lint 전체(`eslint .`) 1건은 `scripts/flowRouteSmoke.ts:49 catch (e: any)` — 병합 범위에서 미변경, 구 main `6dca85d`/`503e3d8`에 이미 존재하는 **선행** 항목(이번 통합이 만든 것 아님).

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
- **BUILD-TYPECHECK-01 Production 검증(`8287843`)에서 재확인**: `godo-psi.vercel.app` 200, products 13·inventory 13·orders 0·sales 0(api_proxy_real 실제)·inquiries/reviews unavailable — 위 값과 동일(api 소스 무변경이라 런타임 동일). 신규 앱 요청 4xx/5xx 0·신규 콘솔 오류 0.

### 4.6 매출·주문·재고·문의 계산 무회귀

- 시험 매출 88,116,982원 · 운영 주문수 1,182건 · 재고위험 4개: **계산 모듈 무변경** + `metric-definition-parity`·`cross-team-revenue-metric-parity`·`C-2`·`C-3`·`C-4`·`synthetic-commerce-universe` 스모크 pass로 **불변 검증**(자동검사). 병합 범위에서 매출/주문/재고/문의/analytics 계산 소스 0파일 변경.
- (참고: 라이브 대시보드 수치 스팟리드는 미수행 — 계산 소스 무변경이라 파리티 스모크가 결정적 증거.)

### 4.7 BUILD-TYPECHECK-01 — Vercel API 함수 타입검사 기준선 복구 (완료)

RC-2 최초 Production `503e3d8`(배포 `PBhDtWrFy`)의 Build-log 배지는 **errors 16 / warnings 1** 이었다. 후속 작업 BUILD-TYPECHECK-01 로 원인을 확정하고 설정 보정으로 해결했다.

**원인** (실제 빌더 `@vercel/node` 5.6.22 소스 + 로컬 tsc 유효옵션 재현으로 확정. 실 클라우드 빌드는 `project_settings_required`(인증·설정 pull)로 미실행):
- Vercel 함수 빌더가 진입점(`api/**`)에서 **최근접 tsconfig 로 루트 솔루션 `tsconfig.json` 을 선택**한다.
- 그 빌더는 **project references 를 따라가지 않아** `tsconfig.node.json` 의 설정을 가져오지 않는다.
- 루트 솔루션의 빈 compilerOptions → **Node 타입(@types/node) 미전달** → `Buffer`/`http`/`process`/`node:` 미해석 = **TS2591 / TS2552**.
- 빌더 기본값 `fixConfig` 가 module 미지정 시 **`strict:false`** 설정 → strictNullChecks off → 판별 유니온 좁히기(`if(!check.ok)`, `if(r.ok)`) 붕괴 = **TS2339** (`TargetCheck.status/error`, `validateEvent.reason`).
- 빌더가 `noEmitOnError` 를 설정하지 않아, 타입 진단이 있어도 throw 하지 않고 **배포가 Ready** 였다.

**해결**:
- **`api/tsconfig.json` 신설**(자기완결, `tsconfig.node.json` extends 안 함): `types:["node"]` · `strict:false + strictNullChecks:true` · `module/moduleResolution: NodeNext` · `target/lib ES2023` · `skipLibCheck` · `esModuleInterop` · `noEmit`(로컬) · **`noEmitOnError:true`**(배포 안전장치). 빌더가 진입점 최근접으로 이 파일을 선택 → Node 타입·strictNullChecks 가 전달되어 A·B 모두 해소.
- **`package.json` build 에 API 전용 타입검사 연결**: `typecheck:api`(`tsc -p api/tsconfig.json`) 추가, `build` = `tsc -b && npm run typecheck:api && vite build`. (package-lock 불변, vercel 의존성 미추가.)

**검증** (Vercel 대시보드 배지 = 빌더 자체 카운트):
- 이전 Production `503e3d8`: **errors 16 / warnings 1**
- Preview `00bc1e0`: **errors 0 / warnings 1**
- **BUILD-TYPECHECK-01 Production 검증 `8287843`: errors 0 / warnings 1** (Ready·Current)
- `noEmitOnError:true` 이므로 타입 오류가 있으면 빌드 실패인데 Ready = **실제 api 타입 오류 0** 의 증거.

**범위**:
- 제품 `api/**/*.ts` 변경 **0**, `src/**` 변경 **0**.
- RC-2 업무 계약·계산식 변경 **0**.

**한계**:
- warning 1건은 로컬 `npm run build` 의 vite chunk-size 경고("Some chunks are larger than 500 kB")와 일치하는 것으로 **추정**한다.
- Vercel Build-log 원문 줄은 가상화 리스트 + 브라우저 도구 콘텐츠 필터 때문에 **미확보**.
- 따라서 warning 의 정체를 **확정했다고 쓰지 않는다**(§6 `BUILD-CHUNK-SIZE-01` 로 별도 관리).

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

- **BUILD-TYPECHECK-01** — **완료**(§4.7). BUILD-TYPECHECK-01 Production 검증 `8287843` Build-log errors 0.
- **BUILD-CHUNK-SIZE-01** — Build-log warning 1건(vite chunk-size **advisory 추정**, Vercel 원문 미확보). 현재 기능·배포 차단요소 아님. **이번에 최적화 착수하지 않음**.
- **DATA-SOURCE-SERVER-02** — 데이터 출처/프록시 후속.
- **C4-SERVER-01** — 문의 상태 계약(Board_List 연동) 후속.
- **DATA-QUALITY-DOMAIN-01** — **리소스별 품질보고서 식별 문제**만 다룬다(api TS 타입 정리는 BUILD-TYPECHECK-01 로 이미 해결되어 여기서 제외).
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

## 부록 — 미수행 항목 (사실)

- 최초 종료(`7392308`)에서 하지 않은 것: PR 생성, docs 브랜치의 main 병합, Production 재배포, 기능 브랜치 삭제, RC-3 착수, 제품 코드 수정.
- 본 정정에서 하지 않은 것: docs 브랜치의 **main 병합**, origin/main 추가 push, Production 재배포, 기능 브랜치 삭제, `BUILD-CHUNK-SIZE-01` 착수, RC-3 착수, 제품 코드 수정.
- 본 정정의 변경 파일은 `docs/RC2_FINAL_CLOSURE_2026-07-24.md` **1개뿐**(제품 코드 검증 기준선 `8287843` 을 docs 브랜치에 `--no-ff` 결합 후, 별도 정정 커밋으로 이 문서만 수정).
