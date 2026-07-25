# R-AUTH-FOUNDATION-01 GREEN A.1 — 실제 로그인 실배선 누락·fail-open 보정 RED 감사

- 날짜: 2026-07-25 · 브랜치: `fix/auth-foundation-01-red` (HEAD 기점 `82d82c2`)
- 성격: **RED 진단 전용. 제품 소스·package.json·lockfile 변경 0.** RED 검사+본 문서만 커밋.
- 증거: `smoke-auth-foundation-01-1-red-v0.mjs` — FACT 30 재현 / RED 6 미충족 / exit 1.
  (외부 Clerk 실호출 0 — M2의 `CLERK_SECRET_KEY` 값은 로컬 재현 표식이며 import 실패가 먼저 발생해 네트워크 미도달.)
- 전제: GREEN A(`4f1fdc5..82d82c2`)는 **골격**이다. 이 감사는 골격과 "실제로 로그인되는 제품" 사이의 격차를 실측한다.

## 1. 결함별 실제 값

### D1. SDK 의존성 — 미설치 + 빌드 사각지대
- `@clerk/react`·`@clerk/backend`: package.json **0** · lockfile **0** · `npm ls` empty · `node_modules/@clerk` **없음** (S1–S3).
- 어댑터는 `['@clerk','backend'].join('/')` **비리터럴 동적 import** → tsc가 모듈 해석을 하지 않아 **api 타입검사·빌드가 SDK 부재를 통과**시킴(S4·S5 실측: `tsc -p api/tsconfig.json` 성공).
- **`CLERK_SECRET_KEY`만 설정된 환경에서 보호 라우트(컴파일된 orders-revenue) 실호출 → `ERR_MODULE_NOT_FOUND` throw = Vercel 500 크래시**(M2 실재현). 즉 사장님이 문서대로 서버 키만 넣는 순간 모든 보호 라우트가 500으로 죽는다.

### D2. 클라이언트 실배선 — 실소비자 전수표 (주석·계획 문구 제외, 코드 라인만)
| 배선 항목 | 실소비자 수 | 비고 |
|---|---|---|
| `<ClerkProvider>` | **0** | main.tsx 미배선 |
| 로그인·가입 폼(`<SignIn>`/`<SignUp>`)·Clerk hook(useUser/useAuth/useSession) | **0** | AuthGateScreen 주석 1건뿐(소비자 아님) |
| Clerk 세션 읽는 hook | **0** | |
| `registerAuthSource()` 호출자 | **0** | 정의만 존재 → 구성 시 **영구 loading** |
| `notifyAuthChange()` 호출자 | **0** | |
| `/api/auth/me·signup-metadata·pending-approvals·approve·suspend·reset-password` 클라 호출자 | **0** (6개 전부) | authGate.ts 주석 1건뿐 |
| 팀장/HQ 승인·정지·초기화 화면 | **0** | ApprovalListModal은 업무 lifecycle 승인용(계정 아님) |

### D3. 실제 화면 상태
- `VITE_CLERK_PUBLISHABLE_KEY`만 존재 + auth source 미주입 → `readAuthInput()`이 `loaded:false` 고정 → `useAuthGate()` **영구 'loading'** = 앱 전체 벽돌(G1·G2).
- 키 없음 → `open` → **회사 대시보드 무인증 노출**(G5). 로컬 개발 편의로는 타당하나 Preview/Production에서는 fail-open.
- "로그인이 필요합니다" 화면(AuthGateScreen login 모드)에 **입력·버튼 0**(G3) — 안내문뿐, 로그인 불가능.
- pending/suspended 화면에 **로그아웃·상태 재확인 경로 0**(G4) — 승인된 뒤에도 새로고침 외 탈출 불가, 다른 계정 전환 불가.

### D4. 서버 fail-open·부분설정 매트릭스 (실 handler 경계 실측)
| 조합 | 서버 결과 | 클라 결과 | 판정 |
|---|---|---|---|
| 키 0개 (오늘 Production) | **익명 200** — 회사 데이터 공개 | open(현행 앱) | **fail-open** |
| Secret만 | **ERR_MODULE_NOT_FOUND 크래시=500**(M2) | open + 모든 보호 fetch 500 | 크래시 |
| Publishable만 | 익명 200(M1 동일) | **영구 loading**(벽돌) | fail-open+벽돌 |
| 두 키+SDK 미설치 | 크래시 500 | 영구 loading | 크래시+벽돌 |
| 두 키+SDK 설치, registerAuthSource 미배선 | 정상 강제 | **영구 loading**(벽돌) | 벽돌 |
| 완전 설정 | (로컬 실증 불가 — Preview에서) | (동일) | 목표 |
- 필요 설계: **로컬 dev(open)와 Preview/Production(fail-closed)을 구분** — 배포 환경에서 미구성·부분구성이면 회사 데이터 라우트는 익명 200이 아니라 **안전한 503 `AUTH_NOT_CONFIGURED`**(정적 메시지)로 닫혀야 한다. Vercel은 `VERCEL_ENV`(production/preview/development)를 제공하므로 이를 게이트 판별에 사용 가능.

### D5. 환경변수 불일치
- 어댑터는 `process.env.CLERK_PUBLISHABLE_KEY`를 읽는데, 설정 문서(GREEN 문서 6절)는 **`VITE_CLERK_PUBLISHABLE_KEY`만** 안내(E1) → 문서대로 하면 서버 어댑터에 publishableKey `undefined` 전달.
- `AUTH_AUTHORIZED_PARTIES` 미설정 → `authorizedParties: undefined` → Clerk **azp(authorized party) 검증 생략**(E2) = CSRF 유사 공격면 확대. Production에선 필수값으로 요구해야 함(`https://godo-psi.vercel.app` + Preview 도메인).
- 프론트/서버 원자적 설정 실패 대비: 부분설정 시 fail-closed(위 D4)가 바로 그 안전장치 — 절반만 켜져도 "익명 공개"나 "무한 크래시"가 아니라 명시적 설정 오류가 떠야 한다.

### D6. 인증 API 메서드 계약 부재 (실재현)
- `runAuthAction`에 **req.method 검사 0**(A3). 실측: **DELETE /api/auth/approve → 405 아님, 200 + 상태 변경 성공**(A1), PUT /api/auth/me → 200(A2).
- CSRF 경계: 상태 변경(approve/suspend/reset)이 세션 쿠키만으로 실행됨. 방어층 = ①메서드 강제(POST만) ②`authorizedParties` 필수화(azp 검증) ③Origin 헤더 대조. GREEN A.1에서 ①+②를 최소 확정, ③은 R-ROUTE-ABUSE-01과 함께.

### D7. 비밀번호 초기화 정책 불일치
- 확정 정책: 사용자가 회사 메신저 등으로 팀장에게 요청 → **같은 팀장 또는 HQ가 임시 비번 발급**. 제품 내 self-service 없음.
- 현재 `canResetPassword`의 `actor.userId === target.userId` 분기가 **member 본인 self-reset 허용**(P1) — 실재현: member가 자기 비번을 서버 API로 직접 변경 200(P2). 정책 위반 + 사실상 죽은 경로(비번을 잊은 사용자는 로그인 불가 → 이 API를 못 부름. 로그인된 상태의 자기 변경은 Clerk UserButton 영역이지 우리 API가 아님).
- 팀장/HQ용 초기화 UI **0**(W5).
- Clerk 공식 확인: **`users.updateUser(userId,{password, signOutOfOtherSessions:true})`**(기존 세션 종료) + **`users.setPasswordCompromised(userId,{revokeAllSessions:true})`**(다음 로그인 시 강제 재설정) — 임시 비번 발급→강제 변경 흐름을 공식 API로 완성 가능(P3: 현재 미사용).

### D8. 검사 신뢰성
- 기존 GREEN 검사는 **실제 SDK·Provider·로그인 화면·실제 auth source를 하나도 실행하지 않음**(주입 stub만).
- **공허 단언 실증**: `'저장 계정(account)에 비밀번호 필드 없음'` = `Array.from(dir.listAccounts ? [] : [])` → 항상 빈 배열 `"[]"` 검사 → **항상 통과**(T1). `pending-approvals` 단언은 `status===200 && isArray`뿐 — 타 팀 신청이 섞여도 통과(T2).
- **문자열 존재 단언 목록**(모듈 해석·실행 아님, T3): 보호 6종 래핑 regex · behavior-summary 분기 regex · health/detail 미보호 regex · App 배선 regex · (전환 스모크의) ai/chat 래핑 regex.
- 교체 방향: ①라우트 default export를 **컴파일·import해 미구성/구성 두 모드로 실호출**(문자열 아님) ②approve 스코프는 **타 팀 신청을 섞은 fixture로 목록 내용까지** 단언 ③배선은 "main.tsx가 ClerkProvider를 실제 import·마운트"를 **모듈 그래프(정적 import 해석)**로 검증 ④비번 단언은 저장소 전 계정 직렬화 실검사.

## 2. 기존 검사가 놓친 이유 (공통 원인)
1. **비리터럴 동적 import**가 "미설치 환경에서도 빌드 가능"이라는 목표를 위해 도입됐고, 그 대가로 타입검사·빌드·스모크 모두 모듈 해석을 검증하지 않게 됨.
2. GREEN 스모크가 **주입 deps 경로만** 실행 — 실제 기본 경로(loadDefaultAuthDeps→Clerk import)는 한 번도 실행되지 않음.
3. 배선 검증을 **소스 문자열**로 대체 — "래핑됐다"는 확인되지만 "설정 시 실제로 동작한다/미배선 시 안전하다"는 미확인.
4. config-gated 무회귀(미구성=현행)를 **모든 환경**에 적용 — 로컬 dev와 Production을 구분하는 축이 없었음.

## 3. 유지 가능한 계약·코드 vs 폐기·교체
**유지(견고함 확인됨):**
- `accountContract` 역할·상태·팀·이력·승인 규칙 전부(승인 매트릭스는 A.1 재검증에서도 정확) — 단 `canResetPassword`의 **self-reset 분기 1줄만 제거**.
- `authActor`의 포트 설계·`resolveActor`·401/403 판정 — 단 `protectedHandler`에 **배포환경 fail-closed 분기 추가** 필요.
- `accountDirectory` 서비스·in-memory 어댑터.
- `api/auth/[action].ts` 코어 로직 — **메서드 게이트 추가** 필요.
- `authGate` 순수 판정(computeAuthGate)·App 최상위 게이트 구조.
- GREEN 스모크의 도메인 규칙 검사(승인 매트릭스 13종 등)는 유효.

**폐기·교체:**
- `clerkAuthAdapter`의 비리터럴 import 트릭 → SDK 실설치 후 **정적 import**로 교체(빌드가 모듈 해석 검증).
- `canResetPassword` self-reset 분기 → 삭제.
- GREEN 스모크의 공허 단언(T1)·약한 단언(T2)·문자열 단언(T3) → 1-D8 교체 방향대로 재작성.
- GREEN 문서 6절 env 안내 → `CLERK_PUBLISHABLE_KEY`(서버용) 추가·`AUTH_AUTHORIZED_PARTIES` 필수화로 정정.

## 4. GREEN A.1 예상 파일
- **제품**: `package.json`+lockfile(`@clerk/react`·`@clerk/backend` 설치) · `src/main.tsx`(ClerkProvider 마운트) · `src/components/AuthGateScreen.tsx`(SignIn/SignUp 마운트+로그아웃) · `src/services/authGate.ts`(Clerk hook→registerAuthSource 배선 + `/api/auth/me` 호출) · 신규 소형 `src/components/AccountAdminPanel.tsx`(승인 목록+승인/정지/초기화 버튼 — HQ/팀장만, 최소 화면) · `api/_shared/authActor.ts`(배포환경 fail-closed) · `api/_shared/clerkAuthAdapter.ts`(정적 import·env 정정·setPasswordCompromised) · `api/auth/[action].ts`(메서드 게이트·self-reset 제거) · `api/_shared/accountContract.ts`(canResetPassword 1줄).
- **검사**: 기존 GREEN 스모크 재작성 + A.1 RED 스모크 전환.
- 화면 범위는 확정대로 최소만: 로그인 / 가입 5필드 / 승인 대기 / 승인 목록+버튼 / 정지·임시 비번. 그 외(프로필·이메일 인증·다중 회사·관리 포털) 없음.

## 5. 로컬 완료 가능 vs Preview 실증 범위
**Clerk 계정·키 없이 로컬 완료 가능:**
- SDK 설치+정적 import(모듈 해석은 빌드로 검증됨 — 키 불필요) · ClerkProvider/폼 마운트 코드 · registerAuthSource 배선 · fail-closed 분기 · 메서드 게이트 · 정책 수정 · 검사 재작성 · 승인/정지/초기화 UI(주입 stub로 상태전이 검증).
**사용자 설정 후 Preview에서만 실증 가능:**
- 실제 username/password 로그인·가입 왕복 · Clerk 대시보드 설정(이메일 해제) 유효성 · `authenticateRequest` 실세션 검증 · publicMetadata 영속 · HQ 부트스트랩 1회 · authorizedParties 도메인 매칭 · 임시비번→강제변경 실동작.

## 6. fail-open 제거하면서 현재 Production 안 깨는 배포 순서
1. **A.1 로컬 GREEN**(위 전부, fail-closed는 `VERCEL_ENV` 기반: production/preview에서 미구성 → 503, development/로컬 → 현행 open).
2. main 병합·Production 배포 — 이 시점 Production은 키가 없으므로 보호 라우트가 **503으로 닫힘**. ⚠️ 대시보드가 데이터를 못 받게 되므로 **배포 직전·직후 연속으로 3) 설정을 진행**하거나, 1단계에서 "키 0개+production"을 한시적으로 open 유지하고 로그로만 경고하는 **2단 스위치**(기본 closed 권장, 사용자 결정 필요) 중 택1.
3. 사용자 Clerk 설정(계정·username/password·이메일 해제·키 4종: `CLERK_SECRET_KEY`·`CLERK_PUBLISHABLE_KEY`·`VITE_CLERK_PUBLISHABLE_KEY`·`AUTH_AUTHORIZED_PARTIES`) + 재배포.
4. Preview에서 로그인·가입·승인 왕복 실증 → 사장님 가입 → `AUTH_BOOTSTRAP_HQ_USER_ID` 설정 → HQ 승인 동선 확인.
5. 익명 시험 lifecycle 자료 백업 후 초기화(별도 작업).

## 7. 상태
제품·package.json·lockfile 변경 0. RED 검사+본 문서만 신규 커밋. RED 커밋 `a1d9e97`·GREEN 골격 `4f1fdc5..82d82c2` 무접촉.
push·Preview·main 병합·Production·GREEN 구현·GREEN B·R-ROUTE-ABUSE-01·다음 감사·RC-3 미수행 — RED 보고 후 대기.
