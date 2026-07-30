# GODO AI OS A-to-Z 마스터 계획

정본 위치: `D:\godo\docs\governance\MASTER_PLAN.md`
승인일: 2026-07-27 (사용자 A1 승인) · 갱신: 단계 종료 시마다

---

## 0. 계획 사용법

퍼센트를 쓰지 않는다. 네 상태만 사용한다: **완료 / 부분완료 / 의도적 연기 / 미착수**

각 단계에는 시작 조건·종료조건·증거·다음 한 작업이 있어야 한다.
단계 도중 발견한 새 항목은 종료조건을 직접 막을 때만 포함하고, 나머지는 §14 후속 대장으로 간다.

**큰 단계는 A~H 8개, A를 A1·A2로 나눈 실제 실행 구간은 9개다.**

### 안정화의 뜻 (헌법 §9)

안정화는 결함을 미리 다 없애는 것이 아니라, **기본이 작동하고 이후 패치·수정·기능 추가·기술 교체에도 전체가 연쇄로 무너지지 않게** 만드는 것이다. **완벽을 이유로 실제 사용을 미루지 않는다.**

### 작업 구조

| 구간 | 무엇 |
|---|---|
| **A2** | 공통 기억·결정·검사 기준 |
| **B-core** | 회귀 게이트 · 공통 데이터 입구 · 저장 경계 · actor/executor 분리 · TeamId 정본 |
| **B-use** | 공통 화면과 대표 경로의 데이터 연결 · 서버 기록 · 실제 진입·승인 흐름 |
| **C** | 새 고도몰 READ·출처 검증 |
| **D / E** | 실제 대표 업무에 필요한 조사와 AI 실행 기반을 **필요한 시점에** 연결 |
| **F** | 팀별 대표 AI 업무를 하나씩 완주 |
| **Patch** | 실제 사용 중 발견된 결함을 완료 단계를 다시 여는 대신 계속 수정 (상시) |
| **Local migration** | 나머지 소비자를 **실제 사용 시점 전에** 순차 이관 (상시) |

### 용어 분리

- **B-use의 완주 = `핵심 업무 흐름 시나리오 완주`** (지시→수행→결과→승인→기록이 화면에서 끊기지 않음)
- **F의 완주 = `팀별 대표 AI 업무 완주`** (한 팀의 실제 업무 1건이 AI 실행까지 완결)

두 개는 다른 것이다. B-use가 끝났다고 F가 끝난 것이 아니다.

---

## 1. 사업 기준선 (사용자 확정, 2026-07-27)

| 항목 | 값 |
|---|---|
| **내부 오픈 목표** | **2026년 11월 말** — 새 고도몰과 GODO AI OS 동시 오픈 |
| **최종 마지노선** | 2026년 12월 |
| **테스트 완료 시한** | 11월 말 오픈 이전 (개발·통합·실데이터 시험·사용자 검증 포함) |

과거 문서 근거: `docs/MASTER_REPORT_2026-06-30.md`, `docs/GODO_AI_OS_SYSTEM_ARCHITECTURE_REPORT_2026-07-02.md`, `docs/MASTER_REPORT_2026-07-03_FINAL.md:19,210`

### 11월 말 오픈 최소 구성 (사용자 확정)

오픈 시점에 **반드시 동작**해야 하는 것:

1. 새 고도몰 READ 및 데이터 출처 검증
2. 공통 통계·재고·운영 화면
3. 로그인 행위자와 실제 수행자 분리
4. 서버 공용 업무기록과 이력
5. 지시→수행→결과→승인→기록 흐름
6. 실제·시험·미연결 상태 구분
7. 대표 업무 1개 실제 완주
8. 정식 검사 게이트와 Preview·Production 인수검사

### 오픈 이후 순차 적용 **8항목** (검증 생략 없이)

① 고도몰 WRITE ② 상품등록 자동화 ③ CS 실제 답글 발송 ④ 배송·물류 ⑤ 재무 ⑥ 외부 광고 전체 통합 ⑦ 모든 팀 AI 동시 완성 ⑧ 고급 무인 자동화

### 오픈 최소 구성 ↔ 단계 매핑

**B 완료와 오픈 최소 구성 완료를 같은 뜻으로 쓰지 않는다.** B는 기반 단계이고, 오픈 최소 구성은 출시 범위다. B에서 미룬 항목은 완료로 덮지 않고 후속 단계로 **명시적으로 재분류**한다.

| 오픈 최소 구성 | 충족 단계 |
|---|---|
| 1. 새 고도몰 READ 및 데이터 출처 검증 | **C** (+ B-core 공통 데이터 입구) |
| 2. 공통 통계·재고·운영 화면 | **B-use** |
| 3. 로그인 행위자와 실제 수행자 분리 | **B-core** |
| 4. 서버 공용 업무기록과 이력 | **B-use** (저장 경계는 B-core) |
| 5. 지시→수행→결과→승인→기록 흐름 | **B-use** |
| 6. 실제·시험·미연결 상태 구분 | **B-core** 공통 데이터 입구 |
| 7. 대표 업무 1개 실제 완주 | **F** |
| 8. 정식 검사 게이트와 Preview·Production 인수검사 | **A2**(게이트 완료) + **B-use**(인수검사) |

---

## 2. 현재 단계와 다음 한 작업

> **현재 단계: 전체 5단계 — C(새 고도몰 실제 계약 검증)**
> **상태: 시작 조건 대기.** 새 판매몰 **개발자 등록·API 키 발급 대기** 때문이다. 키가 확보된 사실이 확인되면 사용자가 언급하지 않아도 **즉시 C 착수를 제안한다**(§6).
> **키 대기 중에도 B 를 다시 열지 않는다.** 승인된 `Local migration`(§5-4) 경로의 독립 작업은 계속할 수 있다.
> **Local migration 4건째 완료 · Codex 독립검증 통과 (2026-07-30, 브랜치 `codex/local-migration-legacy-task-ui-cleanup`, 기준 HEAD `6fce721`)**: **도달 불가능한 legacy 업무 UI 제거**(§14 후속 대장 `TaskBoard`·`TaskListModal` 정리 + `TaskResultModal` 데모 문구 + `onSelectTask` 끊어진 배선 — **셋이 한 뿌리**였다).
> `TaskBoard` 는 제품 import 0건, `TaskListModal`·두 CSS 는 그 미마운트 파일에서만 쓰였고, `TaskResultModal` 은 유일한 setter 배선(`App → MainLayout → OfficeView`)에서 **`OfficeView` 가 prop 을 선언만 하고 쓰지 않아** 사용자 행동으로 열릴 수 없었다. 5파일(2,337줄) 삭제 + 죽은 state·prop 배선 제거. **활성 경로 `TeamTaskPanel → TaskDetailModal` 과 lifecycle 계약·화면 동작은 무변경.** 신규 smoke 파일 0 · **manifest 125 불변** · 기존 검사 7개를 활성 경로 기준으로 교정(약화 없음).
> **Codex 최종 전체 게이트 (기준 HEAD `6fce721`, 직접 실행)**: `npm test` **exit 0** · smoke **125/125 · 147.3초** · `tsc -b` · API 타입검사 · Vite build · 전체 lint · `git diff --check` 통과 · 작업 트리 clean · main 이후 신규 커밋 **1개** · merge commit **0개**.
> **자동검사 근거다. Preview·Production 을 확인한 것이 아니다.** 마운트된 화면 동작을 바꾸지 않은 dead-code 제거이므로 **Preview·Vercel·브라우저 검사는 이번 작업에 추가하지 않는다**(Codex 판정).
> **Local migration 5 완료 · Codex 독립검증 통과 (2026-07-30, 브랜치 `codex/local-migration-synthetic-facts-cleanup`, 기준 HEAD `9e196ba`)**: **사용되지 않는 `api/_shared/syntheticCommerceFacts.ts` 제거.**
> 착수 시 제품 호출 여부를 **다시 확인했다** — `api/`·`src/` 전수 검색 **0건** · 동적 import·문자열 런타임 호출 **0건** · 직접 소비자는 `scripts/smoke-synthetic-commerce-universe.mjs` 하나뿐이고 나머지는 과거 설명 문서의 언급이었다. **synthetic 데이터 생성 기능을 없앤 것이 아니다** — `syntheticCommerceUniverse.ts`·`syntheticRevenue.ts` 와 제품의 universe 생성 경로는 **그대로 보존**했다.
> smoke 는 삭제하지 않고 **같은 manifest 항목으로 유지**했다. facts 출력만 보던 단언은 빈 값에 통과시키지 않고 **universe 원본 사실**로 교체했다(금액 원본 · 결제수단·채널 필드 · 라인 카테고리/브랜드 연결 · 리뷰 평점 형태 · 문의 topic/status). **26 → 29/29 · manifest include 125 / exclude 0 불변.**
> **Codex 전체 게이트 (기준 HEAD `9e196ba`, 직접 실행)**: `smoke-synthetic-commerce-universe` **29/29** · `npm test` **exit 0** · 전체 smoke **125/125 · 123.7초** · manifest include **125**/exclude **0** · `tsc -b` · API 타입검사 · Vite build · 전체 lint · `git diff --check` 통과 · 작업 트리 clean.
> **자동검사 근거다. Preview·Production 을 확인한 것이 아니다.** 화면·API 동작을 바꾼 작업이 아니므로 Preview·Vercel·브라우저 검사는 불필요했다(Codex 판정).
> **Local migration 6 완료 · Codex 독립검증 통과 (2026-07-30, 브랜치 `codex/local-migration-godomall-dead-mapper-cleanup`, 기준 HEAD `359cdf2`)**: **미사용 고도몰 상품 매퍼 제거** — `api/_shared/godomallMapper.ts` 의 `ProductIntermediate`·`InventoryIntermediate`·`mapGoodsList`·`mapGoodsToInventory` 4종. 착수 전 `api`·`src`·`scripts` 전수 검색으로 **닫힌 死코드 묶음**임을 확인했다(`mapGoodsToInventory` 호출자 0 → `mapGoodsList` → 두 타입). 근거 없는 `safetyStock` 기본값 `'5'` 도 함께 사라졌다. **활성 경로 `mapGoodsToProducts`·`deriveInventoryFromProducts` 는 보존**했고 상품 READ·주문 매퍼·재고위험 계약·화면·manifest 는 무변경. 기존 검사 확장(43 → **48/48**) · 신규 smoke 0 · **manifest 125/0 불변**.
> **Codex 전체 게이트 (기준 HEAD `359cdf2`, 직접 실행)**: 집중검사 **48/48** · `npm test` **exit 0** · 전체 smoke **125/125 · 141.3초** · manifest include **125**/exclude **0** · `tsc -b` · API 타입검사 · Vite build · 전체 lint · `git diff --check` 통과 · 작업 트리 clean. **자동검사 근거이며 Preview·Production 확인이 아니다**(화면 동작 변경이 없어 브라우저 검사는 불필요했다 — Codex 판정).
> **Local migration 7 완료 · Codex 독립검증 통과 (2026-07-30, 브랜치 `codex/local-migration-mounted-dead-props-cleanup`, 기준 HEAD `8481e4b`)**: **마운트 화면의 미사용 prop 묶음 정리** — `CalendarPanel.activeOperationsData` · `TeamOperationsBoard` 의 `lastRunJobs`·`onApprove`·`onReject`. 착수 전 직접 확인 결과 **넷 다 선언만 있고 구조분해·본문 사용 0건**이었고(`onReject` 는 전달조차 없었다), 전용 타입 import 2건(`OperationsDataSnapshot`·`AgentJob`)도 함께 사라졌다. **달력의 `fetchRevenue` 경로 · 승인 목록 진입(`approvalItems`·`onOpenApprovals`) · `OfficeView` 의 다른 활성 승인 전달 2곳 · `MainLayout` 의 다른 `activeOperationsData` 사용은 보존**했다. 기존 검사 확장(48 → **54/0**) · 신규 smoke 0 · **manifest 125/0 불변**.
> **Codex 전체 게이트 (기준 HEAD `8481e4b`, 직접 실행)**: 집중검사 3종(app-integration BASE 2/0·RED 54/0 · b-use-5 71/71 · screen-state BASE 5/5·RED 30/30) · `npm test` **exit 0** · 전체 smoke **125/125 · 128.0초** · manifest include **125**/exclude **0** · `tsc -b` · API 타입검사 · Vite build · 전체 lint 통과 · 작업 트리 clean. **자동검사 근거이며 Preview·Production 확인이 아니다**(화면 동작 변경이 없어 브라우저 확인은 하지 않는다 — Codex 판정).
> 실행 기록(삭제하지 않는다): Codex 의 최초 `npm test` 호출은 **실행 제한을 1초로 잘못 설정**해 시작 직후 종료됐다. 코드·검사 실패가 아니라 실행 설정 오류이며, 충분한 제한으로 다시 실행한 위 결과만 완료 근거로 쓴다.
> **다음 한 작업: D-0 — 팀 기능 준비도 조사와 첫 대표 업무 선정(문서 전용).**
> **고도몰 키가 확보된 사실이 새로 확인되면 다른 후속 대장 항목보다 C 단계를 우선한다.**
> **DB 공급자 선택이나 서버 어댑터 구현을 다음 작업으로 만들지 않는다.**
> **현재 단계 C 는 새 고도몰 API 키 발급 대기 상태 그대로다. B-use 나 C 를 다시 열지 않는다.**
>
> ---
>
> **전체 4단계 B-use — 종료 (2026-07-30, 기준 HEAD `f8a1e9a`)**
>
> **최종 전체 게이트 (Codex 직접 실행, 기준 HEAD `f8a1e9a403a4aaad29154ad6e2ee4af6b8aa82df`)**
> 환불 위험 상품 집중검사 **29/29** · `npm test` **exit 0** · smoke **125/125 통과 · 136.2초** · manifest include **125**/exclude **0** · build(`tsc -b` + API 타입검사 + Vite build) 통과 · 전체 lint 통과 · `git diff --check` 통과 · 작업 트리 clean.
> → **`analyticsQueryEngine` `refundRiskProducts` 클레임 계약화 Local migration 도 Codex 독립검증 완료다.**
>
> **종료조건 충족 근거 (구현 · 자동검사 · Preview 인수검사 세 축)**
>
> | 종료조건 | 충족 근거 |
> |---|---|
> | 핵심 업무 흐름 시나리오 완주 | **HQ 지시 → 팀장 수락·수행 → 결과 제출 → 팀장 확인 → HQ 최종 확인** 이 화면에서 끊기지 않는다. 원본 메시지·업무·승인·활동 원장이 `inputRefs`·`taskId`·`correlationId` 로 연결된다 |
> | 인증·권한 | 가입 신청 → `member`+`pending` → 같은 팀장/HQ 승인 → 보호 API·대시보드 이용. 권한 정본 `effectiveIdentity` 한 곳. 시험 역할 전환기가 인증 모드에서 권한·열람 범위를 넓히지 못하고, 계정 전환 시 이전 계정 상세·승인·보고서가 노출되지 않는다 |
> | 실제 Preview 로그인 흐름 | 2026-07-28 Codex 가 **별도 자동화 브라우저**로 Preview 를 직접 조작해 위 흐름 전체와 결함 7건 마감을 재확인. 최종 앱 흐름 브라우저 콘솔 오류 0 |
> | 실제·시험·미연결·실제 0건 구분 | `dataSourceProvenanceContract` + `screenStateFromRevenue`/`resolveRealOrdersDisplay` 로 리소스별 판정. 관제 채팅 헤더가 `불러오는 중 / 실제 주문 N건 / 시험 데이터(+실제 주문 연결 안 됨) / 연결 안 됨` 을 구분하고, 연결 실패가 다른 데이터로 조용히 대체되지 않는다 |
> | 정식 검사 게이트 | **125/125**, manifest include 125 / exclude 0, 사유 없는 제외 0건 |
>
> ### B-use 종료가 **뜻하지 않는 것** (완료로 덮지 않는다)
>
> - **DB 미결정 · 최종 실행 서버 미확정.** `B_USE_2_DB_OPTIONS_RESEARCH.md` 는 결정자료이지 채택안이 아니다
> - **서버 공용 업무기록 어댑터 미구현.** 현재 업무·메시지·승인 기록은 **브라우저 localStorage 중심**이다
> - **시험자료 보존·선택 이관 여부 미결정.** 지금 삭제하거나 변환하지 않는다
> - **새 고도몰 API 키 발급 대기**
> - **Production 미배포 · 원격 `main` 미푸시 · 환경변수 무변경**
> - **실제 고도몰 READ 계약 검증은 전체 5단계 C 의 일이다** — B-use 로 대신하지 않는다
> - **회사 서버 이식과 실작동 시험은 11월 시험 전에 수행한다**
>
> **따라서 "B-use 완료 = 전체 프로젝트 완료" 도, "오픈 준비 완료" 도 아니다.** 오픈 최소 구성 8항목 중 이번에 충족된 것은 §1 매핑표의 B-use 몫뿐이며, 나머지는 C·F·H 로 남는다.
>
> ---
>
> **B-use 경과 기록 (아래는 각 시점의 기록 — 삭제하지 않는다. 위 종료 판정이 현재 값이다.)**
>
> **B-core(전체 3단계)는 완료.** 주문 원본 사실(`orderFacts`) · 재고위험 단일화 · 저장 경계(repository/facade) · actor/executor 분리 · TeamId 정본이 섰다.
> **결제완료 공식 정본은 전체 5단계(C — 새 고도몰 READ·상태코드 확인)로 명시적 이관한다.** 그전까지 두 규칙의 결과와 `conflicted` 를 함께 보존하며 한쪽을 정본으로 삼지 않는다.
> **B-use-3 은 Codex 독립검증을 통과했다** (기준 HEAD `c22586b` · smoke 123/123 + build + typecheck:api + lint, exit 0 · manifest include 123/exclude 0). 실제 화면 클릭 확인은 다음 Preview 인수검사에서 다른 화면과 함께 한다.
> **B-use-4 는 로컬 구현·자동검증 기준으로 완료했다** (브랜치 `codex/b-use-4-auth-integration` · 기준 HEAD `e599ce2` · **Codex 독립검증 통과**: 집중검사 206/206 · 전체 smoke 124/124(109.4초) · build · lint · `npm test` exit 0 · manifest include 124/exclude 0).
> **실제 Clerk 가입·로그인·HQ 부트스트랩·계정 전환 렌더·승인 후 화면 진입은 완료 주장에 포함하지 않으며, B-use-3 화면 확인과 함께 통합 Preview 인수검사에서 실증한다.**
> **B-use-2 DB 후보 조사도 끝났다**(브랜치 `codex/b-use-2-db-options-research`, 문서 전용). 산출물 `docs/governance/evidence/B_USE_2_DB_OPTIONS_RESEARCH.md` 는 **채택안이 아니라 결정자료**다 — DB 는 여전히 미결정이다.
> **통합 Preview 인수검사는 이미 사용자가 실제 화면으로 1회 수행했다.** 핵심 흐름
> (HQ 지시 → 상품팀장 직접 처리 → 결과 제출 → 팀장 확인 → HQ 최종 확인)은 **끊기지 않고 이어졌고**,
> 같은 검사에서 **화면 결함 7건**이 관측됐다(즉시 갱신 안 됨 · 원본 메시지가 계속 남음 · 승인 진입점이
> 플로팅 버튼뿐 · 승인 화면 복잡 · 다크모드 짙은 초록 본문 · 계정 관리 버튼 위치 · 지시 전송 결과 미표시).
> **결함 마감 브랜치는 `codex/b-use-5-preview-acceptance` 다**(이전 기록의 `codex/b-use-3-remaining-route-closure` 는 브랜치명 오기였다 — 교정).
> **Codex 1차 독립검증에서 교정사항이 나왔다**: 전체 승인 대기열과 현재 사용자 대기열이 분리되지 않아 왼쪽 숫자와 열린 목록이 다시 어긋날 수 있었고, 사유 없는 미채택 경로가 남아 있었으며, 낡은 검사 2건이 전체 게이트를 깨뜨렸다. 이를 마감했다.
> **Codex 2차 독립검증은 기준 `bcf91a4` 에서 통과했다**: manifest include 125/exclude 0 · smoke **125/125 통과(125.7초)** · build(`tsc -b` + `typecheck:api` + Vite build) 통과 · lint 오류 0.
> 확인된 내용: 승인 대기열 배선이 `myPendingApprovals` 하나로 왼쪽 숫자·오른쪽 승인 항목·열리는 목록에 동일하게 전달되고, 사유 없는 `not_adopted` 는 승인 상세 외 우회 경로가 없다.
> **실제 Preview 화면 재확인도 통과했다** (2026-07-28, Codex 가 앱 내부 브라우저가 아닌 **별도 자동화 브라우저**로 Preview `godo-git-codex-b-use-5-preview-f2d73c-…` 를 직접 조작).
> HQ 지시 → 새로고침 없이 성공 안내·입력 초기화·왼쪽 `전달 1`·오른쪽 지시 항목 즉시 표시 → 상품팀장 수락·결과 제출 → 같은 화면에서 결과와 `확인 필요` 즉시 표시 → 팀장 확인 → HQ 왼쪽 `승인 대기 1`·오른쪽 승인 항목 1건이 **같은 제목**으로 표시되고 **두 진입점이 같은 목록**을 엶 → 다크모드 승인 상세에서 기본 화면에 제출 결과·확인 이유·담당팀·수행자·상태가 보이고 기술 상세·다른 처리는 접힘 → `승인하지 않음` 이 즉시 처리되지 않고 **필수 한 줄 사유** 입력이 뜨며 빈 사유면 버튼 비활성 → HQ `확인 완료` 직후 같은 화면에서 왼쪽 `승인 대기 0`·오른쪽 `0건`·항목 제거 → 계정 관리 버튼이 상단 신원·로그아웃 옆.
> 최종 앱 흐름의 **브라우저 콘솔 오류 0**. Preview 기존 경고 2건(Tailwind CDN · Clerk 개발 키)은 **이번 결함으로 확대하지 않는다.**
> **판정: 사용자가 관측했던 화면 결함 7건의 실제 Preview 재확인 통과 → B-use-5 Preview 인수검사 완료.**
> **자동검사 통과와 실제 브라우저 통과는 다른 증거다.** 앞은 배선·계약을, 뒤는 화면 동작을 증명한다. 이번에는 둘 다 있다.
> **이것은 B-use 전체 완료도 Production 완료도 아니다.** main 미통합 · Production 미배포 · 환경변수 무변경 · 고도몰 새 키 발급 대기.
> └ **2026-07-30 갱신**: B-use 는 위 종료 판정으로 닫혔고 **local main 통합은 사용자 승인 아래 수행**했다. **원격 push · Production 배포 · 환경변수 변경 · 고도몰 새 키는 그대로 미수행·대기다.**
> **Codex 의 B-use-2 DB 후보 비교자료 독립검토(2차)에서 사실 교정사항이 발견돼 마감했다** (2026-07-28).
> 교정 5종: ① 공식 자료가 있는데 `미확인` 으로 둔 5건(Supabase 리전 변경·at-rest 암호화·Vercel Marketplace 통합 존재 / Neon 암호화·IPv4·IPv6) ② 확정처럼 쓴 조건부 값 1건(Neon 직접 연결 상한 — 컴퓨트 구성 종속, 정본은 Console/`SHOW max_connections`) ③ 과장된 동일성 표현("셋 다 표준 PostgreSQL 이라 연결까지 같다" → 풀링 transaction mode 의 세션 기능 제약이 공급자마다 다름) ④ 판단 시점 오류(개인정보 저장 위치는 **첫 실제 개인정보 저장 전** 진입 조건) ⑤ `미확인` 두 종류 분리(우리가 덜 조사한 것 / 공급자가 공개하지 않은 것).
> **3차 소규모 정합 교정(2026-07-28)**: `Neon 실시간 반영 수단` 을 통째로 `미확인` 으로 둔 것이 공식 원문과 맞지 않아 **조건부 사실로 옮겼다.** 직접 연결의 `LISTEN`/`NOTIFY` 는 **조건부 가능**(N3) · 풀링 연결은 **불가**(N3) · 세션 종료 시 listener 가 사라져(N13) **재연결·재구독 또는 폴링 대안 필요**. **별도 관리형 Realtime 제품의 존재는 여전히 미확인이며 있다고 쓰지 않는다.** `419.66` 계산식과 그 조건부 판정은 다시 바꾸지 않았다.
> 집계: 공식 출처 21 → 28 → **28** · 확정 사실 20 → 27 → **27** · 조건부 3 → 4 → **5** · 미확인 21 → 17 → **16**(개별 6 + 회사 서버 확인표 10).
> **결론은 바뀌지 않았다**: DB **미결정** · 회사·고도몰 서버 조건을 받기 전 공급자 미확정 · **특정 DB 서버 어댑터 미구현** · PostgreSQL 공통분모로 이전 가능성 보존 · 첨부는 DB 내부 base64 가 아니라 object storage 참조 우선 · 최종 선택은 11월 실서버 시험 준비 전.
> **DB 결정을 `DECISIONS.md` 에 추가하지 않았다.**
> **Local migration 1건 완료(2026-07-28)**: 오늘의 운영 주문 통계 출처 상태 연결(§14 후속 대장 `OfficeView fetchRevenue 실패 무시` 항목). `불러오는 중 / 실제 주문 0건 / 시험 데이터 / 연결 안 됨` 이 기존 정본 계약으로 구분되고, 연결 실패가 `activeOperationsData` 로 조용히 대체되지 않는다. **제품 코드 2개 + 기존 검사 1개 확장.** 전체 `npm test` 는 이 묶음 경계 또는 통합 직전에 한 번 실행한다 — **이번 건으로 무회귀 전체를 주장하지 않는다.**
> **Local migration 2건 완료(2026-07-30)**: ① 오늘의 운영 관제 채팅 헤더의 `실제 주문 0건` 표시 교정 — `usable` 분기가 건수 분기보다 앞서 실제 성공 0건이 `실제 데이터` 로 표시됐다. 문구 선택을 순수 함수 `orderStatsHeaderLabel` 로 분리해 실행 검사를 붙였다(Codex 독립검증 통과). ② **CS 고객 누적 구매금액 계산 정본 단일화**(§14 후속 대장 `계산 우회` 항목). `csCustomerManagementFacts` 와 `csTeamDashboardFacts` **두 활성 경로**가 `paid === true` 만 봐서 결제 후 취소된 주문까지 구매금액·고액 고객 판정에 넣고 있었다 — 둘 다 기존 공통 함수 `computeValidOrderPaymentAmount` 로 바꿨다. **제품 코드 2개 + 기존 검사 2개 확장 · 신규 검사 파일 0 · manifest 125 불변.**
> **후속 대장 기록의 범위 오류도 함께 교정했다**: `계산 우회 3건` 중 `dataNormalizer.ts`·`agentExecutor.ts` 는 **B-core-2a 에서 이미 해소**돼 있었고, 대신 기록에 없던 활성 중복 소비자 `csTeamDashboardFacts.ts` 가 있었다(헌법 §10 — 새 사실이 아니라 이전 기록의 범위 오류).
> **위 Local migration 2건은 Codex 독립검증·전체 게이트 1회로 완료했다** (기준 HEAD `814f07c`, 2026-07-30 · Codex 직접 실행): `npm test` **exit 0** · smoke **125/125 · 113.8초** · `tsc -b` · API 타입검사 · Vite build · 전체 lint 통과 · manifest include **125**/exclude **0** · 작업 트리 clean. **자동검사 기준이며 Preview·Production 을 확인한 것이 아니다.**
> **Local migration 3건째 로컬 구현 완료(2026-07-30, Codex 집중검증 대기)**: **환불 위험 상품의 클레임 판정 정본 연결**(§14 후속 대장 `analyticsQueryEngine:574 클레임 필터 계약화`). 같은 파일이 `classifyClaimEvent` 를 이미 쓰고 있는데 이 한 경로만 원시 `claimTypes` 문자열을 직접 비교해 호환 표기를 놓쳤다 — 공통 분류의 `eventKind` 만 근거로 쓰도록 바꿨다(포함 `return`·`refund_only` / 제외 `cancel`·`exchange`·`unknown`). **제품 코드 1개 + 기존 검사 1개 확장 · 신규 검사 파일 0 · manifest 125 불변.** RED `{}`(빈 결과) → GREEN `{"A":1,"B":1}`.
> **→ 이 3건째도 기준 HEAD `f8a1e9a` 에서 Codex 최종 게이트로 독립검증 완료했다**(위 종료 판정 참조. 당시 "전체 게이트 미실행" 기록은 그 시점 사실이다).
> **DB 가 정해지기 전에는 서버 어댑터를 구현하지 않는다. B-use-2 는 기술 입력·결정자료 준비까지만 끝났고 서버 기록 완료가 아니다.**
> **시험자료(현재 localStorage 에 쌓인 업무·메시지·승인 기록)를 서버 이관 시 보존할지 버릴지도 미결정이다.** 지금 삭제하거나 변환하지 않는다.
> ~~B-use 전체 인수검사로는 아직 넘어가지 않는다.~~ ← **2026-07-28 시점 기록.** 2026-07-30 기준 HEAD `f8a1e9a` 에서 종료 판정을 냈다(위 참조).

---

## 3. 단계 A1 — 공동 헌법·지도·배선안 승인 (코드 변경 0) — **완료**

승인일 2026-07-27. 사용자 승인 6건은 `DECISIONS.md` D-001 참조.

시스템 지도는 B-core·B-use가 건드리는 **다섯 경계로 한정**한다. 그 밖은 "미조사"로 표기하고 필요할 때만 확장한다.

1. 데이터 공급자 소비자
2. 계산 계약 소비자
3. 업무기록 저장소 소비자
4. 팀 식별자 소비자
5. 화면 진입·승인 경로

보존 기능 지도도 위 다섯 경계와 직접 연결된 기능으로 한정한다.

## 4. 단계 A2 — 정본 배선·릴리스 게이트 구축 (승인 후 첫 코드 작업) — **완료**

브랜치: `codex/a2-governance-wiring` (`5190f685`에서 분기). 인증 브랜치 `fix/auth-foundation-01-red`는 변경·병합·rebase·삭제하지 않는다.

### 산출물 9종

1. `docs/governance/CONSTITUTION.md`
2. `docs/governance/MASTER_PLAN.md`
3. `docs/governance/DECISIONS.md`
4. `docs/governance/CURRENT_STATE.md`
5. `AGENTS.md`
6. `CLAUDE.md`
7. 정식 회귀검사 manifest와 runner
8. `npm test` 단일 전체 게이트
9. `scripts/flowRouteSmoke.ts:49` lint 오류의 규칙 회피 없는 수정

### 종료조건

- 새 세션의 첫 보고가 현재 단계·다음 한 작업을 인용
- manifest의 현재 통과 검사를 제외하려면 파일명·사유가 필요
- `npm test` 성공
- 문서 변경 이력과 사용자 승인 기록이 `DECISIONS.md`에 남음

main 병합·Production 배포는 **별도 승인 전까지 금지**.

완료 기록: 2026-07-27 local main에 `50b0831`·`22f86b5`를 fast-forward 통합했다. 통합 후 `npm test`에서 smoke 120/120·build·typecheck:api·lint가 통과했다. 원격 push와 Production 배포는 하지 않았다.

## 5. 단계 B — 기반 안정화

예상 범위: 약 **17~30 작업일**. 정확한 일정은 각 묶음 착수 전 다시 계산한다.
**DB 결정을 기다리는 동안 DB와 무관한 작업은 계속 진행한다.**

---

## 5-1. B-core — 경계 고정 (DB 결정 없이 완주 가능)

여기서 고정하는 것은 **변경이 퍼지는 경로**다. 이 다섯이 서면 이후 패치·기능 추가가 옆을 무너뜨리지 않는다.

### B-core-1. 회귀 게이트 — **완료 (A2)**

`npm test` = smoke(manifest **123**) + build(`tsc -b` + `typecheck:api` + `vite build`) + lint. exit 0.

### B-core-2. 공통 데이터 입구

- **B1-0 현재 데이터 출처 확정(선행)** — **완료 (2026-07-27)**
  판정: 13건은 **현재 Production에 설정된 real 모드 고도몰 Open API의 실제 응답**이며 `sourceType: api_proxy_real`은 애플리케이션 실행 경로와 일치한다. 새 판매몰 키가 아직 발급·등록되지 않았고 시뮬레이션 카탈로그가 이 응답을 “시험몰 만료 직전”에 캡처했다고 기록하므로 **기존 시험몰 자료로 판단**한다. 다만 관리자 계정의 실제 만료 상태는 미확인이다.
  부수 발견: **시험몰 Open API가 아직 응답한다** — 계정 만료 여부는 사용자 확인 대기.
  증거: `docs/governance/evidence/B1-0_PRODUCT_SOURCE_AUDIT.md`
- **A `activeOperationsData`와 B `fetchRevenue` 차이 실측 · 동일 fixture parity 기준선** — **완료 (2026-07-27)**
  판정: **parity 미성립.** 동일 raw fixture(주문 10·상품 6)를 두 세계로 투영해 기존 계약으로 계산한 결과 **20축 중 10축 일치 / 10축 불일치**.
  일치는 전부 출처 판정(실제/실제 0건/시험/합성/연결 안 됨)과 B 내부 일관성 — **출처 구분은 이미 서 있고 수치 의미가 서지 않았다.**
  불일치 = 구조(A에 `paid`·`canceled`·`lines`·`deliveryFee` 필드 없음) + 계산(결제완료 판정 2식, 기본 안전재고 상수 3 vs 5) + 입력(계약이 `soldOut`·`stockEnabled` 모름).
  사용자 영향: **재고위험 건수**가 A 화면과 B 화면에서 실제로 다르다(fixture 기준 3 vs 4). 매출·주문 계약 소비자는 전부 B라 지금 매출 숫자는 충돌하지 않는다.
  RED 보존: `scripts/audit-b-core-2-ab-parity.mjs`(exit 1, **정식 manifest 밖** — main 게이트 미파손)
  기준선 검사: `scripts/smoke-b-core-2-ab-data-world-parity-v0.mjs`(38 pass, manifest 등록)
  증거: `docs/governance/evidence/B-CORE-2_AB_PARITY_AUDIT.md`
- **B-core-2a 실제 사용자 경로의 재고위험 판정 단일화** — **완료 (2026-07-27)**
  판정 정본을 `inventoryRiskContract` 하나로 모았다. 같은 상품의 재고위험 여부가 A 화면과 B 화면에서 갈리지 않는다.
  방법: api 계층(`godomallInventoryDerive`)이 **판정을 하지 않게** 만들어 공유할 것 자체를 없앴다
  (자체 기본 안전재고 3 과 `computeInventoryStatus` 제거 — 전자는 계약의 전역 기본값 5 가 적용될 여지를 없앴고, 후자는 소비자 0건 dead output 이었다).
  `dataNormalizer` 의 2갈래 분기(임계 `<=` vs `<`)와 `agentExecutor` 의 직접 비교를 계약 호출로 교체했다(계약 우회 3건 중 1건 해소).
  `StandardInventoryItem.status` 에 `'unknown'` 을 추가해 해석 불가 재고를 정상으로 숨기지 않는다.
  행동 변경(의도된 교정): 파생 재고 안전재고 3→5 · CSV 경계 `<`→`<=` · 비수치 재고 `ok`→`unknown` · `unknown` 은 자동 발주 대상 제외.
  검사: `scripts/smoke-b-core-2a-inventory-risk-single-source-v0.mjs` RED 26 fail → **GREEN 43/43** · audit `[재고]` RED 4축 → **0축**(`[주문]` 7축은 의도적으로 유지)
  증거: `docs/governance/evidence/B-CORE-2_AB_PARITY_AUDIT.md §11`
- **B-core-2b 주문 canonical snapshot provider — 다음 한 작업.** 최소 범위(증거문서 §8):
  ① 공통 주문 형태 확정(새 형태 발명 금지 — `RevenueOrderLite`가 이미 조건을 만족하므로 이것을 입구 출력으로 삼는 안을 1순위 검토)
  ② 결제완료 판정을 한 곳으로 모은다(**정본 선택은 C단계 상태코드 확정 이후로 미룰 수 있다** — 그때까지 차이는 기준선 검사가 붙잡는다)
  ③ 기본 안전재고 상수를 하나로(`godomallInventoryDerive` → `inventoryRiskContract` 참조)
  ④ 재고 계약의 **입력** 보강(`soldOut`·`stockEnabled`) — 계약 판정 규칙은 바꾸지 않는다
  ⑤ 실제 데이터 경로에도 재고위험 입력 생성(현재 `stockImpact`는 합성 전용)
  종료조건: `node scripts/audit-b-core-2-ab-parity.mjs` 의 **`[주문]` 그룹 RED 0축**
  (`[재고]`·`[출처]` 는 이미 RED 없음. 전체 exit 0 은 `[주문]` 해소 시점에 달성된다)
  범위 밖(하지 않는다): A 소비자 14파일 일괄 이관(→ Local migration) · `OperationsDataSnapshot` 타입 삭제 · 문의·리뷰 라이브 연결
- **공통 데이터 입구와 오픈 대표 업무가 쓰는 소비 경로는 오픈 전에 canonical snapshot으로 통일한다**
- `departmentDataSourceOfTruth`는 조합 역할 유지, 입력만 canonical로 변경, **자체 fetch/cache 금지**
- 실제 0건·시험자료·연결 안 됨·사용 불가 구분이 이 입구에서 보존될 것

종료: 공통 입구가 하나이고, 오픈 범위 화면·보고서·AI가 그 입구를 통해 같은 사실을 본다.

### B-core-3. 저장 경계 (DB 결정 불필요) — **구현 완료, 검증 대기 (2026-07-27)**

화면의 저장소 직접 결합 **15지점 → 0건**. `src/services/repositories/` 6개 facade 신설, 화면 10개 이관.
저장키 6개·저장 형식·함수 동작 불변. DB·서버 어댑터는 만들지 않았다. `taskLifecycleStore` 는 이미 adapter 뒤라 대상 아님.


- 공통 metadata + persistence port
- **localStorage 어댑터로 실동작**할 것 — 이 단계에서 DB를 고르지 않는다
- **UI가 범용 persistence port에 직접 결합되지 않게 한다.** lifecycle·ledger·message·CS·agent task는 **도메인 의미를 보존한 repository/facade 뒤**에 둔다
- 현재 결합 실측(확인 범위: `src/components/` import 검색): **10개 컴포넌트 / 15개 지점**
  (`activityLedger` 5 · `teamMessageCenter` 5 · `agentTaskStore` 2 · `csLocalStatePersistence` 1 · `departmentChatMemory` 1 · `hqChatMemory` 1 · `taskLifecycleStore` 0 — 이미 adapter 뒤)
- 선례: `api/_shared/marketingBehaviorPersistentStore.ts`(포트) ← `marketingBehaviorPostgresStore.ts`(어댑터) ← `api/marketing/[action].ts:4`(소비자는 포트만 import)

종료: 화면이 스토어가 아니라 repository/facade만 import하고, 저장소 교체가 화면 코드를 건드리지 않는다.

### B-core-4. actor / executor 분리 — **구현 완료, 검증 대기 (2026-07-27)**

`assignExecutor` 가 `kind:'human'` 일 때 행위자를 무조건 수행자로 덮어쓰던 것을 교정(명시 지정 우선, 비었을 때만 기본 제안값).
`ExecutorHistoryEntry.assignedByActorDefault` 로 어느 쪽이었는지 이력 보존.
`ActorRef.identitySource`(`session_login`/`demo_role`/`unlinked`)로 **실제 로그인 미연결 지점을 숨기지 않는다**.
하드코딩 라벨(`'운영자'`)을 실제 계정으로 연결하는 것은 인증 브랜치 통합(B-use-4) 이후다.


- 로그인 actor와 기존 수행자 분리 유지
- 사람 하드코딩 라벨(`'운영자'`·`'최고관리자'`)을 실제 actor로 연결
- 수행자 변경 이력(`executorHistory`) 보존
- **로그인한 사람을 수행자로 자동 덮어쓰지 않는다.** 값이 비어 있을 때만 기본 제안값

종료: 누가 시켰는지(actor)와 누가 했는지(executor)가 분리되어 기록된다.

### B-core-5. TeamId 정본 — **계약 고정 완료, 값 이관 미착수 (2026-07-27)**

`src/services/teamIdContract.ts` 신설. 3곳에 복사돼 있던 유니온을 정본으로 모았다(기존 import 경로·값 불변).
`marketing_internal`/`marketing_external` 의 저장 의미를 `TEAM_ID_META` 로 고정하고, 비교 기준으로 `teamScopeOf`/`isSameTeamScope` 를 정의했다.
`'marketing'`(구분 이전 저장분)은 어느 팀 업무였는지 알 수 없으므로 **자동 승격하지 않는다**.
**소비자 저장 값은 하나도 바꾸지 않았다** — 승인 라우팅이 `actor.teamId === task.ownerTeamId` 로 판정하므로 값만 바꾸면 기존 업무의 승인이 막힌다(§14 후속 대장).


- **TeamId 정본 한 곳** 확정
- **`marketing_internal`·`marketing_external`의 저장 의미를 서버 기록 전에 고정**
- 리터럴 `marketing` **95곳 / 41파일** 소비자 지도 작성
- **41파일 전체 이관은 여기서 하지 않는다** → Local migration

종료: 팀 식별자의 정본과 저장 의미가 하나로 고정되고, 마케팅 두 팀 구분이 기록 스키마에 확정된다.

---

## 5-2. B-use — 실제 사용 가능하게 만들기

### B-use-1. 대표 경로 데이터 연결 — **완료 · Codex 검증 통과 (2026-07-27)**

공통 화면(통계·재고·운영)과 오픈 대표 경로가 B-core의 입구를 실제로 소비한다.

선택한 경로: **오늘의 운영(OfficeView) → 총괄 콘솔(ChatConsole) 운영 요약** = `controlChatService`.
마운트된 A 세계 운영 요약 경로가 이곳뿐이고(`AiBriefing` 은 렌더 호출자 0건), 같은 수치를 두 곳에서 각자 계산하고 있었다.
→ `buildHqOperationsSummary` 하나로 모으고 `orderFacts`(취소·배송비·라인매출·결제 근거) · 출처 계약 · 재고 계약 판정을 소비한다.
남은 화면 이관은 이번 범위 밖(Local migration·후속 B-use).

### B-use-2. 서버 기록 (DB 결정 후)

- 사용자 DB 결정 → 서버 어댑터를 B-core-3 포트에 연결
- lifecycle · activity ledger · team messages · CS completion · agent tasks/results
- 멱등·상관 ID · **실패 표면화** · **500건 절단 제거** · 다중 사용자·다중탭 안전
  (다중사용자 근거: 디자인팀 4명 동시작업 — `docs/MASTER_REPORT_2026-07-03_FINAL.md:210`)

**DB 결정 입력(B-use-2 착수 전 준비)**: 실제 운영량이 없으므로 `직원 수 × 일 업무 건수 × 보존 기간`의 **보수적 상한 가정** · 동시사용·백업·복구 조건 · DB 후보 2~3개 공식 가격·운영 난이도 · **상한 가정이 틀렸을 때 옮기는 비용** · 쉬운 비교표와 추천안 → 사용자 명시적 결정

**시험자료 처리(미결정)**: ① JSON 백업 파일 생성 ② 사용자에게 실물 전달 ③ 보존할 자료 명시 확인 ④ **선택 import 또는 새 운영 시작을 그때 결정** ⑤ **확인 전 localStorage 삭제 금지**

#### DB 결정 입력 — 저장소 기술 사실 정리 **완료 (2026-07-28)** · Codex 가격 조사 대기

브랜치 `codex/b-use-2-server-records-decision-input` (`c22586b` 에서 분기). **제품 코드·검사 코드·manifest 0변경.**
산출물: `docs/governance/evidence/B_USE_2_SERVER_RECORDS_WORKLOAD.md`

다섯 영역(lifecycle · activity ledger · team messages · CS completion · agent tasks/결과)의 정본 타입·저장키·schemaVersion·상한·구독·멱등 키·append-only 이력·PII·이관 난이도를 `파일:행` 근거로 정리하고, 레코드 크기를 **실측**했다.

**DB 선택보다 먼저 정해야 할 것으로 드러난 3건**

1. **첨부 보관 방식** — 텍스트 레코드는 412 B~1,218 B 인데 팀 메시지 첨부 1건은 약 1.2 MB(실측). 첨부를 DB 안에 base64 로 둘지 파일 저장소 참조로 뺄지가 **용량 요구를 한 자릿수 단위로 바꾼다.** 이것이 DB 후보 비교보다 선행이다.
2. **동기 API → 서버 전환 방식** — 다섯 영역 저장 API 가 전부 동기라, 그대로 async 로 바꾸면 화면 호출부(9~10파일)가 함께 바뀐다. 화면을 지키려면 facade 안에 `읽기 캐시 + 비동기 쓰기 + 구독` 계층이 필요하다. **DB 선택과 독립인 결정.**
3. **전체 배열 재작성 → 행 단위 저장** — 현재 모든 쓰기가 컬렉션 통째 재작성이라 다중 사용자에서 lost update 가 난다.

**아직 사용자 결정이 없어 `가정`으로만 계산한 값**: 전사 직원 수 · 1인당 일 기록 건수 · 보존 기간 · 첨부 사용량. (확인된 동시사용 근거는 **디자인팀 4명**뿐이며 전사로 확대 해석하지 않는다.)

**B-use-2 를 완료로 표시하지 않는다** — DB 미결정, 서버 어댑터 미구현.

#### DB 후보 비교자료 — **작성 완료 (2026-07-28)** · Codex 독립검토 대기

브랜치 `codex/b-use-2-db-options-research` (`e599ce2` 에서 분기). **제품 코드·검사 코드 0변경(문서 전용).**
산출물: `docs/governance/evidence/B_USE_2_DB_OPTIONS_RESEARCH.md`

**채택안이 아니라 결정자료다.** DB 를 고르지 않았고 `DECISIONS.md` 에 새 결정을 추가하지 않았다 — **DB 미결정 유지.**
후보 3종(직접 운영 PostgreSQL · Supabase · Neon)을 **각 제품 공식 가격표·공식 문서 16개 URL**(2026-07-28 확인)로만 비교했다. Prisma 는 DB 제품이 아니라 ORM 이므로 후보에서 제외했다.

권고 결론(문서 §8): **최종 회사·고도몰 서버 사양을 받기 전에는 공급자를 확정하지 않는다.** 애플리케이션은 표준 PostgreSQL 공통분모로 설계해 세 후보 사이 이전 가능성을 보존하고, **최종 선택 시점은 11월 실서버 시험 준비 전**이며 그때 서버 제공 조건과 관리 책임을 함께 비교한다.

**사실 교정 (2026-07-28, Codex 독립검토)**: 초판의 오류 2종을 교정했다 — ① **무료 등급 부족 단정 철회**: 가정 텍스트 180 MB 는 무료 DB 한도 500 MB 보다 **작다**. 실제 사용량이 없으므로 **적합 여부는 판정 보류(`미확인`)** 이며, "무료로 운영하자"는 새 결론은 만들지 않았다. ② **공식 자료가 있는데 `미확인`으로 둔 6건 확정**(Supabase 저장 지역·연결 수·파일 한도·Realtime · Neon `pg_dump` 절차·월 최소금액 폐지). 공식 출처 16 → **21개**.
**Supabase 는 서울 리전이 있고 공식 문서가 "선택한 지역 안에 모든 데이터가 남는다"고 명시**한다(지역 선택은 고객 책임 · 기술적 저장 지역 사실이며 법적 의무 충족을 뜻하지 않는다).
**DB 는 여전히 미결정이고, 표준 PostgreSQL 공통분모 권고는 유지한다.**

DB 선택보다 **먼저** 정할 수 있는 것으로 드러난 것: ① 첨부를 DB 안 base64 로 둘지 object storage 참조로 뺄지 ② 동기 API → 서버 전환 방식(입력 문서 §7) ③ 전체 배열 재작성 → 행 단위 저장.

### B-use-2. 업무 카드 → 결과 상세 진입 — **완료 · Codex 검증 통과 (2026-07-27)**

실제 마운트 경로: 부서 업무 관장 탭(`MainLayout:402`) → `DepartmentWorkspacePanel:742 <TeamTaskPanel>` → 카드 `상세` 버튼 → `TaskDetailModal`.
표시값은 저장된 `LifecycleTask` 정본에서만 읽는다(지시자·담당팀·요청팀·실제 수행자·상태·결과·첨부·결정 이력·수행자 변경 이력).
끝난 업무는 세 구간에서 사라지므로 `지난 업무` 접힘 목록으로 승인·수정 요청·중단 이력 진입점을 남겼다.
`TaskResultModal`(`App.tsx:1107`)은 재사용하지 않았다 — 화면용 파생 타입(`OperationTask`)만 받고 재고·매출·배송 상세가 하드코딩 데모 문구라 정본을 표시할 수 없다(§14 후속).

### B-use-3. 실제 진입·승인 흐름 — **첫 실제 흐름 구현 완료, 검증 대기 (2026-07-27)**

단절: `OfficeView.sendDirective`(`:81-84`)가 `postTeamMessage`+`logActivity` 만 실행하고 `createDirectiveTask` 를 부르지 않았다.
`HqDirectiveComposer` 가 `ChatConsole` 의 기본 빠른 업무 추가 바(`onAddTask`→`createDirectiveTask`)를 `quickBarSlot` 으로 대체하므로, 화면에서 지시를 보내도 메시지만 생기고 업무 카드가 없었다.

연결: `App.handleSendDirective` 신설 — 권한 판정 후 **원본 메시지 1건 + lifecycle 업무 1건 + 활동 원장 1건**을 만든다.
업무는 `inputRefs: [messageRef(messageId)]` 로 원본을 참조만 하고 본문·첨부를 복제하지 않는다.
행위자는 App 의 `sessionActor()`, 수행자는 `unassigned`, 승인 경로는 기존 `routeFor` → `hq_directive`.
`OfficeView` 의 하드코딩 `HQ_ACTOR` 제거.

검증: `scripts/smoke-b-use-3-hq-directive-flow-v0.mjs` RED 6 fail → **GREEN 32/32**.
지시→수행자 선택→결과 제출→담당 팀장 확인→HQ 최종 확인→완료→지난 업무 상세 열람까지 한 시나리오로 확인.

### B-use-3(잔여 3경로 마감) — **구현 완료, 검증 대기 (2026-07-27)**

팀 내부(`team_internal`) · 팀 간 협업(`collaboration`) · 팀→HQ 확인(`escalation`) 세 경로를 실제 마운트 화면 기준으로 닫았다.
- 팀 내부: `handleAddTask` 가 활동 원장에 `taskId`·`correlationId` 를 남긴다. 원본 메시지가 없으므로 가짜 `inputRefs` 를 만들지 않는다.
- 협업: 이미 저장된 지원요청 메시지 id 를 화면이 그대로 넘겨 **수행 자식**에 `messageRef` 를 싣는다. 원장 1건에 자식 식별자를 함께 남긴다.
- HQ 확인: 기존 멱등·review-only 의미를 그대로 두고 원장 1건에 카드 식별자를 연결한다.
검증: `smoke-b-use-3-hq-directive-flow-v0.mjs` **71/71**(네 경로 통합) · 인접 lifecycle 5건.

**B-use-3 완료로 표시하지 않는다** — 화면 눈검증과 전체 게이트가 남았고, B-use-2 서버 기록·B-use-4 인증 판단이 미착수다.

### B-use-3(팀 내부 업무 진입점 교정) — **구현 완료, 검증 대기 (2026-07-28)**

Codex 독립검증에서 발견: 팀 내부 업무는 **계약만 통과**했고 팀장 화면에 진입점이 없었다.
비HQ 사용자는 `department` 탭으로 강제 이동하고(`MainLayout.tsx:209`) 그 탭에서 `ChatConsole` 이 렌더되지 않으므로(`:355`), "총괄 콘솔 빠른 업무 추가가 팀 내부 실제 경로"라는 이전 기록은 **범위 오류**였다(헌법 §10 — 새 사실이 아니라 이전 주장의 범위 오류로 기록).

교정: 기존 `부서 업무 관장 → 업무 탭 → TeamTaskPanel` 안에 **팀 내부 업무 추가 입력 한 줄**만 연결했다.
권한 판정은 새 계약 함수 `createTeamInternalTask` 한 곳(사람 팀장이 자기 팀에만 · HQ·타 팀·AI actor 차단)이고,
승인 경로는 기존 `createDirectiveTask` → `routeFor` 가 `team_internal` 로 판정한다(새 규칙 없음).
결과는 업무 1건(수행자 `unassigned`, 가짜 `inputRefs` 없음) + 활동 원장 1건(`taskId`·`correlationId`).
**새 화면·새 모달·새 승인 규칙 없음. 협업·HQ 확인 경로는 재설계하지 않았다.**

검증: 같은 집중검사 **RED 18 fail → GREEN 103/103**(다섯 구간) · 인접 lifecycle 5건 · `tsc -b` · `typecheck:api` · 변경 파일 lint · 음성 변형 2회.
**미수행**: 전체 `npm test` · 화면 눈검증 · Vercel/Preview/Production → Codex 최종 검증.

### B-use-3(원문). 실제 진입·승인 흐름

업무 카드→결과 상세 진입 · 협업 부모 tracking/수행팀 자식 · 원본 메시지 역참조 · 승인 경로 4종 · 팀 내부·HQ 지시·HQ 확인·CS 검토 의미 · 활동 원장 사후 열람

종료: **핵심 업무 흐름 시나리오 완주** — 화면에서 실제로 지시→수행→결과→승인·수정·중단→기록이 끊기지 않는다.

### B-use-4. 인증 브랜치 판단·통합

판단 조건: ① actor/team 계약 확정(B-core-4·5) ② 기존 `executorId`·`assignee`·`handledBy` 보존 검사 ③ Production Clerk 환경변수·실제 HQ 계정·배포 순서 준비 ④ 이력 보존 방식의 Git 통합안 확정

인증 브랜치를 main에 병합하면 **Production 대시보드가 잠길 수 있으므로** 실제 HQ와 Production 환경설정 준비 뒤에만 가능하다.
**조건이 충족돼도 병합 실행은 사용자 승인 후에 한다.** merge/squash 선택과 Production 환경변수 설정·배포 순서도 함께 승인받는다.

#### B-use-4 선별 통합 — **로컬 구현·자동검증 완료 · Codex 독립검증 통과 (기준 HEAD `e599ce2`, 2026-07-28)**

브랜치 `codex/b-use-4-auth-integration` (`61296fb` 에서 분기).
**인증 브랜치 `fix/auth-foundation-01-red`(`838e2c4`) 는 증거로 그대로 보존한다** — merge·rebase·일괄 cherry-pick 없이 최종 상태 파일을 참고해 현재 B-core·B-use 코드 위에 선별 이식했다.

채택 기능은 **정확히 네 가지**다: ① 이름·팀·직책·아이디·비밀번호 가입 신청 ② 가입자는 `member`+`pending` ③ 같은 팀장 또는 HQ 승인(팀장 승격은 HQ만) ④ 승인된 사용자가 로그인해 보호 API·대시보드 이용.
**비밀번호 초기화·계정 정지는 앱에 넣지 않는다**(호출 시 세션 검증 이전 503, 상태 변경 0). 기존 최종 채택 결정을 뒤집지 않았다.

함께 교정한 두 경계:

1. **회사 서버에서도 fail-closed** — 인증 브랜치는 배포환경을 `VERCEL_ENV` 하나로 판정했다. 최종 실행 장소가 미확정이고 유력 방향이 회사 서버·고도몰 전용 서버이므로 그대로 두면 Vercel 밖에서 환경변수가 빠졌을 때 로컬 개발로 오인해 익명으로 열린다. 보호환경 판정을 `Vercel production/preview` + `NODE_ENV=production` + `AUTH_ENFORCE` + **환경 불명(기본값)** 으로 넓히고, 명시적 개발 신호에서만 미구성 open 을 허용한다. 허용 출처는 `AUTH_AUTHORIZED_PARTIES` 단독으로 완결된다(Vercel 도메인은 추가 입력).
2. **로그인 신원 → 업무 행위자** (**구조 패치** — `CURRENT_STATE` 에 이유·영향·하위호환 기록). 인증된 운영 모드에서는 서버 계정 뷰만 신원 근거이며 열람 범위와 권한이 같은 출처를 쓴다. 역할 전환기로 범위·권한이 넓어지지 않는다.

검증(**Codex 직접 실행, 기준 HEAD `e599ce2`**): `smoke-b-use-4-auth-integration-v0.mjs` **206/206** · 전체 smoke **124/124(109.4초)** · manifest include **124**/exclude **0** · build(`tsc -b`+`typecheck:api`+`vite build`) · `tsc -b` exit 0 · 변경 파일 lint 오류·경고 0 · `git diff --check` exit 0 · **`npm test` exit 0(전체 약 131초)** · 원격 push·배포·환경변수 변경 없음.
(중간 기록은 삭제하지 않는다: 1차 114/114 → 보완1 162/162 → 보완2 188/188 → 보완3 206/206.)

**보완(2026-07-28) — 로그인 권한 정본 단일화**: Codex 1차 검증이 찾은 실사용 결함 2건을 마감했다.
① 화면 곳곳이 각자 `loadRole()` 을 읽어 로그인 계정과 시험 역할이 갈라지던 것을 `effectiveIdentity` 한 곳으로 모으고, 업무 목록을 `identity.actor` **파생값**으로 바꿔 로그인 전후 상태가 즉시 같은 계정 기준이 되게 했다. 시험 역할 전환기는 인증 모드에서 **읽기 전용**이다. 저장 직전 권한 확인(`canCreateDirective`)도 넣었다.
② Clerk `publicMetadata` 의 role·status·역할·팀 조합을 fail-closed 로 검증하고, **`team` 누락을 `hq` 로 보정하던 것을 제거**했다.

**보완 2(2026-07-28) — 계정 전환 잔여 권한 경로 마감**: ① 인증 모드의 시험 역할 fallback 제거(계정 없으면 lifecycle 기능 자체를 넘기지 않는다) ② 탭 접근을 `resolveActiveTab` 으로 **렌더 전 동기 제한**(effect 는 정리용) + 운영 시작 handler 를 첫 상태 변경 전에 선차단 ③ 계정 전환 시 이전 계정의 상세·보고서를 순수 함수 검증으로 노출 차단(자료 삭제 없음). 자세한 내용은 `CURRENT_STATE.md` 참조.
**미실증**: 실제 Clerk 가입·브라우저 로그인·HQ 부트스트랩·승인 후 화면 진입 · Preview/Production. → **Preview 인수검사에서 실증한다.**
main 병합·push·배포·환경변수 변경은 하지 않았다.

### B-use-5. 인수검사 — **완료 (2026-07-30, 기준 HEAD `f8a1e9a`)**

`npm test` · manifest 등록 검사 전부 통과 · **Preview 수동 인수검사 체크리스트 전 항목 통과** · Production Source 잠금과 실검증 · 실제·시험·연결 안 됨 구분 · 마스터 계획 갱신

충족: `npm test` exit 0 · smoke **125/125(136.2초)** · manifest include 125/exclude 0 · Preview 인수검사 전 항목 통과(2026-07-28 실제 브라우저) · 실제/시험/연결 안 됨/실제 0건 구분 · 마스터 계획 갱신(§2 종료 판정).
**미충족으로 남기는 것**: **Production Source 잠금과 실검증** — Production 에 배포하지 않았으므로 수행하지 않았다. 이 항목은 **C 이후 실제 배포 시점**으로 넘긴다. B-use 종료가 Production 인수검사를 대신하지 않는다.

---

## 5-3. Patch — 상시 경로

**완료된 기능에서 실제 사용 중 발견된 결함**은 단계를 다시 열지 않고 여기서 고친다. 규칙은 헌법 §9.

- 아직 만들지 않은 기능은 Patch가 아니라 해당 단계 작업
- **핵심 경계(B-core 다섯)를 바꾸는 수정은 `구조 패치`로 표시하고 사용자에게 영향을 보고**
- 모든 Patch는 관련 검사와 `npm test` 통과
- 수정 이유·영향·검증 결과를 기록

## 5-4. Local migration — 상시 경로

나머지 소비자를 **각자가 실제 사용되는 시점 전에** 순차 이관한다. 한꺼번에 하지 않는다.

| 항목 | 이관 시점 |
|---|---|
| 리터럴 `marketing` 95곳/41파일 소비자 | 해당 화면·기능이 실제 사용 경로에 들어오기 전 |
| A세계(`activeOperationsData`) 나머지 소비자 | 해당 기능이 오픈 범위나 실제 사용 경로에 들어오기 전. **사용자가 숫자 불일치를 발견할 때까지 기다리지 않는다** |
| ~~계산 우회 3건 (`dataNormalizer.ts` · `agentExecutor.ts` · `csCustomerManagementFacts.ts`)~~ | **완료 (2026-07-30)** — 기록이 현재 코드와 달랐다. `dataNormalizer.ts`·`agentExecutor.ts` 는 **B-core-2a 에서 이미** `inventoryRiskContract` 로 이관돼 있었고, 남은 것은 `csCustomerManagementFacts.ts` 하나였다. 또 기록에 없던 **활성 중복 소비자 `csTeamDashboardFacts.ts`** 가 같은 구매금액 계산을 한 벌 더 갖고 있어(범위 차이) 두 경로를 함께 `revenueMetricContract` 의 `computeValidOrderPaymentAmount` 로 마감했다. 결제 후 취소된 주문이 구매금액·고액 고객 판정에서 제외된다. 자세한 내용·RED→GREEN 값은 `CURRENT_STATE.md` |
| 미마운트 컴포넌트 정리 (`TaskBoard` 등) | B-use-3 진입 복구 완료 후 |

---

## 5-5. B 완료의 뜻

**B 완료와 오픈 최소 구성 완료는 다른 것이다.** B에서 미룬 항목은 완료로 덮지 않고 **후속 단계로 명시적으로 재분류**한다(§1 매핑표·§14 후속 대장).

B 완료 뒤 새로 발견된 것은 B를 다시 여는 것이 아니라 **Patch 또는 Local migration**으로 간다.

## 6. 단계 C — 새 고도몰 실제 계약 검증

시작: 새 고도몰 개발자 등록·API 키·공식 자료 확보.

**Codex는 B 진행 중 매 단계 보고에 고도몰 키 상태를 한 줄로 확인한다. 키가 확보된 사실이 확인되면, 사용자가 언급하지 않아도 먼저 C 착수를 제안한다.**

키는 채팅으로 전달받지 않는다. **Preview 환경변수에 먼저 등록해 검증한 뒤 Production에 등록한다.**

작업: 상품·주문·고객·문의·리뷰·클레임 필드 실측 · 관리자 상태 전이와 API 상태 비교 · 고도몰 자체 매출통계 기준 · 원본 사실층 보존 · 회사 운영층 차이표 · 상품등록 Excel 양식 · 발송 전 시험 범위 · `revenueMetricContract`·`claimEventContract`·`inventoryRiskContract`가 새 몰 데이터에서도 같은 의미인지 검증 · 불일치 시 원본 mapping 문제인지 회사 계약 변경 문제인지 분리

종료: 새 몰 READ 결과가 canonical snapshot과 공통 계약에 안전하게 들어오며 실제 0건·연결 안 됨이 구분됨.

## 7. 단계 D — 팀별 작업 카탈로그와 외부 기술 조사

작업 분해는 **한 번의 실행으로 끝나는 동사 단위**로 한다. 각 작업에 기록: 쓰기 위험 · 정확도 · 빈도 · 입력 소유 · 기록 필요 · 사람 개입 · 예상 건수

조사 순서: ① 내부 자산 재사용 ② 결정론 코드 가능 여부 ③ 공식 API·MCP·상용 도구 ④ 기록·승인 가능 여부 ⑤ 비용 계측 ⑥ 장애 대안 ⑦ 실제 작은 실증

표에 포함: 개발용/런타임 · 런타임 위치 · 인증 소유자 · 중단 시 팀 업무 영향 · 공식 자료·확인 날짜·버전 · 추천과 대안

팀 범위: 상품 · CS · 디자인 · 마케팅 내부 · 마케팅 외부 · HQ

**사용자 제시 초기 목표(인터뷰 입력, 확정 종료조건 아님)**: 상세페이지 일 평균 약 15개 · 이벤트 페이지 월 평균 약 5회 · 마케팅 내부 분석 주 1회 또는 요청 시 · CS 새 리뷰 확인 일 1회 후보

상품팀·CS팀의 **간단한 이미지 작업**은 표준 기획서 기반 planmaker 이식과 별개 작업으로 카탈로그에서 분해한다.

재무·물류는 담당자 인터뷰 전 구현하지 않는다.

## 8. 단계 E — AI 실행 공통 기반

작업 카탈로그와 조사 결과를 입력으로 만든다.
수동·예약·이벤트 실행 · 모델·provider routing · 로컬/클라우드 선택 · 호출·토큰·이미지 비용 기록 · 일·주·월 예산 · 상한 자동 정지와 알림 · 재시도·중복 방지 · 전수 실행 기록 · 예외 대기열

종료: 대표 업무 1개가 실제 데이터로 계획→실행→비용기록→결과→승인→원장까지 완주. **빈 공통 인프라만으로 완료하지 않음.**

## 9. 단계 F — 팀별 대표 업무 구현·확대

모든 팀을 동시에 만들지 않는다. 선정 기준: 실제 데이터 준비 · 팀장 절차 확인 · 사용자 가치 · 위험 · 외부 의존 준비

대표 업무 1개를 완주한 뒤 같은 팀의 다음 업무로 확대한다.

간단한 보기·필터·보고 형식은 팀장 무코드 커스텀 후보. **공통 계산·기록·권한은 팀장이 변경할 수 없다.**

## 10. 단계 G — 승인된 WRITE

기본: AI 초안 → 사람 승인 → 실제 WRITE → 결과 재조회 → 원장 기록 → 실패·롤백

후보 순서: ① CS 답글 승인형 ② 낮은 위험 유형의 제한적 무인형 검토 ③ 상품등록 묶음 ④ 가격·판매상태 ⑤ 취소·반품·환불

제한적 무인형은 누가 언제 어떤 유형을 켜고 껐는지 기록한다.
상품등록은 실제 Excel·HTML·이미지 정책 이후다. **반품 후 환불은 사람 검수 없이 자동화하지 않는다.**

## 11. 단계 H — 연기 영역

배송·송장·물류팀 전달 · 외부 광고 전체 통합 · 재무 · 고급 무인 자동화 · planmaker·이미지 생성의 GODO 이식 · 상세페이지 최종 저장 · **회사 서버·EXE 등 최종 배포 형태**

각 항목은 담당자·외부 계약·실제 자료가 준비될 때 별도 설계한다.

**최종 구동 형태는 아직 확정하지 않았다.**

| 항목 | 현재 상태 (2026-07-28) |
|---|---|
| 최종 실행 장소 | **미확정.** 현재 **유력 방향**은 회사가 관리하는 서버 또는 고도몰 전용 서버다. 확정 아님 |
| 개인 데스크톱 | **운영 서버로 사용하지 않는다** |
| 지금 개발·검사 | 사용자 컴퓨터와 기존 개발환경에서 수행 |
| 최종 서버 선택·시험 이식 | **11월 실작동 시험 전에** 한다 |
| 11월 | 한 달간 **실제 서버에서 실작동 시험과 수정** |
| 12월 | **정식 오픈 목표** |
| DB | **미결정.** Supabase·Neon·Prisma 중 **어떤 것도 채택하지 않았다** |
| 특정 DB·클라우드 어댑터 | **지금 구현하지 않는다** |
| Vercel | 현재 개발·검증에 쓰는 실행 환경이며 **최종 배포처로 확정된 것이 아니다** |

**최종 저장환경을 기다리는 동안 DB와 무관한 B-use 작업은 계속한다.**

## 12. 단계 내 발견 처리

1. 현재 종료조건을 직접 막는 것만 현재 단계에 포함
2. 나머지는 §14 후속 대장 기록
3. 단계 경계에서만 재분류
4. 사용자 정책은 임의 기술 결정으로 승격 금지

## 13. 사용자 결정 시점

| 결정 | 시점 | 반드시 설명할 위험 | 되돌리는 방법 |
|---|---|---|---|
| 헌법·A~H 구조 | 구현 재개 전 | 잘못된 순서는 다시 표류를 만듦 | 구현 전 문서 수정 |
| **11월 말 오픈 최소 구성** | **A1 승인 시 — 확정됨(§1)** | 마감 압박 시 검증 생략 유혹 | 오픈 후 순차 적용 |
| A2 결과 main 병합 | A2 완료 보고 후 | 배포 대상 변경 | 병합 보류 |
| DB | B4 후보 비교표를 본 뒤 | 무료 등급의 용량·연결 수 제한, 초과 시 중단·과금, 이전에도 작업일 필요 | 백업·export와 다른 DB adapter |
| 시험자료 보존 | B5 JSON 백업 실물을 본 뒤 | 선택 import하지 않으면 새 화면에서 과거 시험 기록이 보이지 않을 수 있음 | 원본 localStorage 유지·JSON 재검토 |
| 실제 HQ·Production 인증 | B7 병합 전 | Preview 키만 있는 상태에서 병합하면 Production 대시보드가 잠김 | 병합 보류 또는 승인된 롤백 |
| 팀별 세부 빈도·자동화 | D 팀장 인터뷰 | 과도한 실행은 비용·오작동 증가 | 수동 실행 기본·예산 상한 |
| 물류·재무 | 담당자 인터뷰 후 | 실제 절차를 추측하면 운영 충돌 | 구현하지 않고 연기 |
| 상품등록 저장 방식 | 고도몰 양식·WRITE 정책 확인 후 | 잘못 등록하면 상품정보·노출 오류 | 승인형 묶음·재조회·롤백 |

## 14. 후속 대장 (단계 경계에서만 재분류)

| 항목 | 출처 | 상태 |
|---|---|---|
| ~~`syntheticCommerceFacts` 계약 우회 3건 (제품 import 0)~~ | REBUILD 논쟁 D2 | **완료 · Codex 독립검증 통과 (2026-07-30, 기준 HEAD `9e196ba`)** — 계약 우회를 **고치는 대신 파일을 제거**했다. 제품 소비자 0건(`api`·`src` 전수 0 · 동적 import 0)이라 우회 자체가 제품 경로에 존재하지 않았다. `syntheticCommerceUniverse`·`syntheticRevenue` 는 활성 경로로 보존. smoke 는 같은 manifest 항목 유지(26 → **29/29**). 전체 게이트 `npm test` exit 0 · smoke **125/125 · 123.7초** · manifest 125/0 |
| ~~`TaskBoard`·`TaskListModal` 미마운트 컴포넌트 정리~~ | 감사 2026-07-27 | **완료 · Codex 독립검증 통과 (2026-07-30, 기준 HEAD `6fce721`)** — 아래 `TaskResultModal`·`onSelectTask` 항목과 **같은 뿌리**였다. 5파일(2,337줄) 삭제 + App→MainLayout→OfficeView 죽은 배선 제거. 활성 경로 `TeamTaskPanel → TaskDetailModal` 은 보존. 신규 smoke 0 · manifest 125 불변. 전체 게이트 `npm test` exit 0 · smoke 125/125. 자세한 내용은 `CURRENT_STATE.md` |
| ~~`TaskResultModal` 하드코딩 데모 문구(재고 2개·매출 894,000원·송장 박*호 등)가 task 와 무관하게 표시됨. 현재 도달 경로 없음~~ | B-use-2 | **완료 · Codex 독립검증 통과 (2026-07-30, 기준 `6fce721`)** — 파일 자체를 삭제해 해소. 도달 경로가 없다는 관측이 맞았고, 끊어진 setter 배선(`OfficeView` 가 `onSelectTask` 를 선언만 하고 쓰지 않음)이 원인이었다 |
| ~~`OfficeView`→`MainLayout`→`App` 의 `onSelectTask` 배선이 `TaskBoard` 미렌더로 끊겨 있음~~ | B-use-2 | **완료 · Codex 독립검증 통과 (2026-07-30, 기준 `6fce721`)** — 배선 3단 전부 제거. 위 두 항목과 같은 뿌리였다 |
| ~~`TeamOperationsBoard.tsx` 의 `onReject?: (id: string) => void;` 죽은 prop 선언 (구조분해·호출·전달 **0건**, Codex 확인)~~ | legacy UI 정리 2026-07-30 | **완료 (2026-07-30, Local migration 7)** — 발견 당시 기록은 "런타임 영향 없음 · 해당 파일을 다음에 수정할 때 함께 제거"였고, **예정대로 그 다음 수정(Local migration 7)에서 `lastRunJobs`·`onApprove` 와 함께 제거**됐다. 위 Local migration 7 행과 같은 항목이므로 **미착수로 중복 계상하지 않는다.** 발견 사실은 이력으로 남긴다 |
| ~~`analyticsQueryEngine:574` 클레임 필터 계약화~~ | REBUILD 논쟁 D2 | **완료 · Codex 독립검증 통과 (2026-07-30, 기준 HEAD `f8a1e9a`)** — 환불 위험 상품이 원시 `claimTypes` 비교 대신 `claimEventContract.classifyClaimEvent` 의 `eventKind`(`return`·`refund_only` 포함 / `cancel`·`exchange`·`unknown` 제외)만 쓴다. 기존 검사 확장, 신규 파일 0, manifest 125 불변. 최종 게이트 `npm test` exit 0 · smoke 125/125. 자세한 내용은 `CURRENT_STATE.md` |
| 채팅 원문·마케팅 분석 힌트·API Bridge 로그 서버 이관 | REBUILD 논쟁 D3 | 미착수 |
| A 세계(`activeOperationsData`) 재설계 | REBUILD 논쟁 D1 | 미착수 |
| GitHub Actions CI | REBUILD 논쟁 D5 | 미착수 |
| 자동 E2E 프레임워크(Playwright 등) | 합의 §9 | 미착수 |
| 보안 제품화·AI 키 정책 | 원장 §4 | 미착수 |
| `marketing` → `marketing_internal`/`marketing_external` **저장 값 이관** (계약은 `teamIdContract` 에 고정됨) | B-core 묶음 2026-07-27 | 미착수 · Local migration |
| 승인 라우팅 비교를 `isSameTeamScope` 로 교체 (마케팅 두 팀이 저장되기 시작하는 시점에 필요) | B-core 묶음 2026-07-27 | 미착수 |
| ~~`godomallMapper.mapGoodsToInventory`/`mapGoodsList` dead code (호출자 0건, `safetyStock` 기본값 `'5'` 생성)~~ | B-core-2a | **완료 · Codex 독립검증 통과 (2026-07-30, 기준 HEAD `359cdf2` · `npm test` exit 0 · smoke 125/125 · 141.3초)** — `ProductIntermediate`·`InventoryIntermediate`·`mapGoodsList`·`mapGoodsToInventory` 4종 제거(닫힌 死코드 묶음, 제품 호출자 0건). 근거 없는 `safetyStock` 기본값 `'5'` 도 함께 사라졌다. 활성 `mapGoodsToProducts`·`deriveInventoryFromProducts` 는 보존. 기존 검사 확장(43 → **48/48**), 신규 smoke 0 · manifest 125 불변. 자세한 내용은 `CURRENT_STATE.md` |
| `stockImpact` 가 합성 전용 — 실제 데이터 경로에 재고위험 입력 없음 | B-core-2a | 미착수 |
| ~~`OfficeView.tsx` 가 `fetchRevenue` 실패를 `.catch(()=>{})` 로 무시 — 실패와 '실제 0건'이 화면에서 구분 안 됨~~ | B-core-2 | **완료 (2026-07-28, Local migration)** — 실제 원인은 `.catch` 가 아니었다. `fetchRevenue` 는 네트워크·HTTP 실패를 **throw 하지 않고** `source:'unavailable'` 을 **반환**하므로 빈 `.catch` 는 일반 실패 경로도 아니었다. 진짜 원인은 ① `OfficeView` 가 `rev.orders.length` 가 있을 때만 얇은 복사본을 저장해 **실제 0건·연결 실패·미로딩을 전부 `null` 로 합친 것**, ② `ChatConsole` 이 `orders.length` 로만 분기해 **안내 없이 `activeOperationsData` 관제 채팅으로 조용히 내려간 것**. `RevenueResult` 전체 보존 + 공통 계약(`screenStateFromRevenue`·`resolveRealOrdersDisplay`·`realOrdersPhrase`) 재사용 + 통계 질문 분류(`understandCommerceQuery`) 로 마감. 검사 `smoke-data-source-server-01-green-f-screen-state-v0.mjs` 에 G1~G10 추가(24/24) |
| ~~`CalendarPanel.tsx` 가 `activeOperationsData` prop 을 받고 본문에서 쓰지 않음~~ | B-core-2 | **완료 · Codex 독립검증 통과 (2026-07-30, 기준 HEAD `8481e4b` · `npm test` exit 0 · smoke 125/125 · 128.0초)** — Local migration 7 에서 `TeamOperationsBoard` 의 `lastRunJobs`·`onApprove`·`onReject` 와 **함께** 정리했다(넷 다 선언만 있고 구조분해·본문 사용 0건). 달력의 `fetchRevenue` 경로와 승인 목록 진입·확인 완료·반려 흐름은 보존. 기존 검사 확장(48 → **54/0**), 신규 smoke 0 · manifest 125 불변. 자세한 내용은 `CURRENT_STATE.md` |

## 15. 일정 원칙

- 단계 A1: **완료**(2026-07-27 사용자 승인)
- 단계 A2: 착수 전 예상 2.5~4 작업일. 실제 소요는 완료 보고에 기록
- 단계 B: 조건부 17~30 작업일, B3 마케팅 분리 범위를 반영해 착수 전 재산정
- 단계 C: 키·실데이터 확보 후 재산정
- 단계 D 이후: 팀별 작업 카탈로그 전에는 총기간을 약속하지 않음

각 묶음은 착수 전에 범위와 예상 일수를 제시한다. **일정 때문에 검증을 생략하지 않는다**(헌법 §13).
