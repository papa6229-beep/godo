# R-AUTH-FOUNDATION-01 GREEN A — 최소 사내 로그인·가입 승인·보호 라우트

- 날짜: 2026-07-25 · 브랜치: `fix/auth-foundation-01-red` (기점 main `5190f68`)
- 원본 RED: 커밋 `a1d9e97`(보존 — amend/rebase 안 함). 진단: `docs/DIAG_AUTH_FOUNDATION_01_2026-07-25.md`.
- 범위: **GREEN A = 로그인·가입 승인·계정 상태·서버 라우트 보호까지.** lifecycle 업무원장 서버 정본 이관은
  `GREEN B / LIFECYCLE-DURABILITY` 후속으로 분리(“서버가 보증하는 최종 책임 원장 완성”을 주장하지 않음).

## 1. 아키텍처 결정
관리형 인증(**Clerk**)이 **아이디·비밀번호·세션 보안**을 맡고, 우리 제품은 **팀·직책·역할·승인상태·권한**만 관리한다.
- 서버는 세션을 검증해 얻은 `userId` 로만 행위자를 식별한다. **body 의 role/team/actor·헤더·화면용 `sessionRole` 을 권한 근거로 쓰지 않는다.**
- 계정 상태(role/status/team/직책/이력)는 Clerk `publicMetadata.account` 에 보관(별도 DB 불필요). 판정 규칙은 서버 `accountContract` 하나가 정본.
- 비밀번호는 제품 계층(코드·account·localStorage·로그·응답)의 어디에도 담기지 않는다. Clerk 이 직접 저장·검증한다.

### config-gated 활성화(라이브 무회귀)
- 서버 강제는 `CLERK_SECRET_KEY` 가 있을 때만, 클라이언트 게이트는 `VITE_CLERK_PUBLISHABLE_KEY` 가 있을 때만 활성화된다.
- **미구성(현재)** 이면 보호 라우트는 현행 동작을 보존하고 앱 게이트는 `open` 이라 대시보드가 그대로 뜬다 → **라이브 앱 무회귀**.
- 이 때문에 무인증→401 같은 강제는 “Clerk 설정 후” 실증된다. 검사는 설정과 무관하게 guard 를 stub 세션 + in-memory
  디렉터리(=mock 경계)로 실행해 규칙을 확정한다(가짜 키를 만들지 않음).

## 2. 서버 권한 경계(배선 결과)
| 라우트 | GREEN A 처리 |
|---|---|
| orders-revenue · sync · products · read · [resource] · ai/chat | **보호**: `export default protectedHandler(handler)` — 인증된 active 만 |
| marketing/behavior-summary | **보호**(분기만): 회사 집계 readout |
| marketing/behavior-events | **공개 유지**(방문자 수집 — 인증 대상 아님, abuse 는 R-ROUTE-ABUSE-01) |
| godomall/health | **공개 유지**(상태 점검) |
| godomall/orders-admin | **403 유지**(ADMIN_ACCESS_DISABLED) — 인증이 생겼다고 재개하지 않음 |
| detail/[action] | **GREEN A 미보호**: 소비자=변환기 이미지 프록시(`<img src>`/fetch), 동일 세션 무회귀를 라이브 검증할 수 없고 rate-limit+SSRF 방어 존재 → 후속 분리(지시대로) |

가드 판정: 무인증 → **401** · pending/계정없음 → **403** · suspended → **403** · active → 통과.

## 3. 승인 규칙(서버 집행 — `accountContract`/`accountDirectory`)
- 공개 가입 입력 = **이름·소속 팀·직책·희망 아이디·비밀번호** 5개뿐. (아이디/비번은 Clerk, 이름/팀/직책/역할은 우리 메타.)
- member 신청 → **같은 팀 active team_lead 또는 HQ** 만 승인. 타 팀 team_lead 승인 불가.
- team_lead 신청 → **HQ 만** 승인.
- **hq 는 공개 가입에서 신청 불가.** 최초 HQ 는 하드코딩 아님 — `AUTH_BOOTSTRAP_HQ_USER_ID`(서버 env)로 검증된 사용자 1회 지정.
- pending·suspended 는 보호 API 접근 불가. 승인자도 active 여야 승인 가능.
- 정지(퇴사·이동)는 **삭제가 아니라 suspended** — 과거 기록·당시 이름/팀/직책 스냅샷을 이력(append-only)으로 보존.
- 비번 초기화: 자기 팀장 또는 HQ가 **임시 비번을 입력**→Clerk 에 설정. 값은 저장/반환/로그하지 않음.

API: `GET /api/auth/me` · `POST /api/auth/{signup-metadata|approve|suspend|reset-password}` · `GET /api/auth/pending-approvals`. 미구성 시 501.

## 4. 클라이언트 게이트
`useAuthGate()` → `open`(미구성=현행 앱) / `loading` / `login` / `pending` / `suspended` / `app`.
- active(또는 미구성 open)가 아니면 App 이 대시보드 트리를 마운트하기 전에 `AuthGateScreen` 으로 조기 반환 → **자식 대시보드의 회사 데이터 fetch 가 시작되지 않음.**
- `@clerk/react` 는 정적 import 하지 않는다(미설치 환경 빌드 가능). 실제 로그인/가입 폼(Clerk `<SignIn>`/`<SignUp>`)은 설정 단계에서 `login` 모드 자리에 마운트.

## 5. 검사(RED→GREEN 필수 항목 대응)
`smoke-auth-foundation-01-green-v0.mjs`(52 pass) + `smoke-auth-foundation-01-red-v0.mjs`(RED→GREEN 전환, 8 pass).
- 무인증 보호 라우트 → 401 · 가짜 body 역할/team/actor 우회 불가 · pending→403 · suspended→403 · active member 허용
- member 승인=같은 팀장/HQ만 · 타 팀장 거부 · team_lead=HQ만 · 공개 가입 hq 거부
- behavior-events/health 공개 유지 · orders-admin 403 유지
- 비밀번호 localStorage·제품 account·로그·응답 노출 0
- 미로그인 앱은 회사 데이터 fetch 시작 안 함(shouldLoadCompanyData) · active/open 은 정상
- 무회귀: **전체 스모크 122/122 통과**(기준값 6종·provenance·SEC-ORDERS-ADMIN fail-closed 포함), tsc -b · typecheck:api · vite build · lint 통과.

**설정 없이 실증할 수 없는 항목(정직한 분리)**: 실제 브라우저 로그인·가입 흐름, 라이브 세션으로 대시보드 정상 사용, Clerk 계정 metadata 영속 — 모두 6절 설정 완료 후 Preview/Production 에서 실증. 통과로 표현하지 않음.

## 6. 사장님이 하실 설정(쉬운 말)
GREEN A 코드는 “Clerk 만 연결하면 켜지도록” 준비돼 있습니다. 아래는 **사람이 해야 하는 외부 설정**입니다(가짜 값·임시 토큰은 만들지 않았습니다).

1. **Clerk 계정 만들기** — clerk.com 에서 가입하고 애플리케이션(회사용) 하나를 만듭니다. (무료 플랜으로 시작 가능)
2. **로그인 방식 설정(대시보드)** — “Username + Password” 를 켜고 **이메일은 필수 해제**합니다(이메일 없이 아이디/비번만). 공개 가입(Sign-up)은 허용해 둡니다.
3. **키 2개 받기** — Clerk 대시보드의 **Publishable Key** 와 **Secret Key**.
4. **키를 Vercel 환경변수에 넣기**(설치는 개발자 작업):
   - `VITE_CLERK_PUBLISHABLE_KEY` = Publishable Key (프론트)
   - `CLERK_SECRET_KEY` = Secret Key (서버)
   - (선택) `CLERK_JWT_KEY`, `AUTH_AUTHORIZED_PARTIES`(사이트 도메인)
5. **최초 총괄 관리자(HQ) 지정** — 사장님이 먼저 가입한 뒤, 그 계정의 사용자 ID 를 `AUTH_BOOTSTRAP_HQ_USER_ID` 환경변수에 넣으면 **그 계정만 1회 HQ**가 됩니다(하드코딩 아이디 없음).
6. **패키지 설치(개발자)** — `@clerk/react`, `@clerk/backend` 설치 후 `main.tsx` 에 `<ClerkProvider>` 마운트 + 로그인/가입 폼 연결 + `registerAuthSource` 배선(코드 자리 준비됨).

> ⚠️ **순서 주의(무회귀)**: 프론트(`VITE_...`)와 서버(`CLERK_SECRET_KEY`)를 **함께** 켜세요. 서버만 켜고 프론트 로그인을 안 붙이면 로그인 창이 없어 앱이 막힙니다. 키가 하나도 없으면 지금처럼 현행 앱 그대로 동작합니다.

## 7. Production 적용 직전(별도 작업, 이번 코드 아님)
- 기존 익명 시험 업무자료(localStorage lifecycle)는 실제 계정에 귀속시키지 않습니다. **백업 후 초기화**하며 억지 마이그레이션을 만들지 않았습니다.
- lifecycle 지시·제출·승인·중단의 **서버 정본 이관**은 `GREEN B / LIFECYCLE-DURABILITY` 로 분리했습니다(GREEN A 는 인증된 사용자 표시까지만).

## 8. 상태
- 원본 RED `a1d9e97` 보존. GREEN A 5커밋(`4f1fdc5`→`cd0c17e`). 제품 변경 15파일(신규 6 + 배선 9).
- main=origin/main=Production `5190f68` 불변.
- push·Preview·main 병합·Production·GREEN B·R-ROUTE-ABUSE-01·다음 감사 작업·RC-3 **미수행** — 보고 후 대기.
