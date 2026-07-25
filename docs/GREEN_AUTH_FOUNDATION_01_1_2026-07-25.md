# R-AUTH-FOUNDATION-01 GREEN A.1 — 실제 사내 로그인·가입·승인 실배선 및 fail-closed 보정

- 날짜: 2026-07-25 · 브랜치: `fix/auth-foundation-01-red`
- 보존 커밋: 원본 RED `a1d9e97` · GREEN 골격 `4f1fdc5..82d82c2` · 보정 RED `d4de256` (amend/rebase 없음)
- A.1 커밋: `4151a67`(SDK·설정계약·fail-closed) → `cfe751e`(계약·메서드) → `a1f31b6`(클라 실배선) → `36e7348`(검사 교체) → red2 스모크 한정 보정 → 본 문서.
- 검사: green **55/55** · 보정 RED 전환 **6/6** · A 전환 8/8 · **전체 스모크 123/123** · `tsc -b`+`typecheck:api`+`vite build`+lint 통과.

## 1. 보정 RED(d4de256) 결함 → 해소 내역
| 결함 | 해소 |
|---|---|
| @clerk 미설치·비리터럴 import 빌드 사각지대 | `@clerk/react@6.12.8`·`@clerk/backend@3.13.1` 설치(lockfile 갱신), 어댑터 **정적 import** — SDK 부재/버전 불일치는 빌드 실패 |
| Secret만 설정 시 보호 라우트 crash 500 | 설정 계약(complete/partial/off)으로 partial 은 어댑터 도달 전 차단 |
| 키 0 배포 = 익명 회사 데이터 공개 | **fail-closed**: Preview/Production(`VERCEL_ENV`) 미완전 설정 → 정적 503 `AUTH_NOT_CONFIGURED`. 로컬 개발만 명시적 open |
| 클라 실배선 전무(Provider·폼·브리지·호출자 0) | main.tsx `<ClerkProvider>` + `ClerkAuthBridge`(useAuth→me→registerAuthSource) + 실화면 + 관리패널 |
| login 화면 입력 0·pending/suspended 탈출 불가 | 로그인(아이디+비번)·가입(정확히 5입력) 실폼, pending/suspended 에 **로그아웃+상태 재확인**(+프로필 보완) |
| env 이름 불일치(CLERK_PUBLISHABLE_KEY vs VITE_) | 서버도 **`VITE_CLERK_PUBLISHABLE_KEY` 공용**(중복 키 입력 제거, `CLERK_PUBLISHABLE_KEY` 도 허용) |
| authorizedParties 생략(azp 미검증) | 배포에서 parties 비면 partial→503(생략 불가). 구성은 `AUTH_AUTHORIZED_PARTIES` + **Vercel 제공 도메인 env**(요청 Host 불신) |
| 메서드 계약 없음(DELETE approve=200) | GET(me·pending-approvals)/POST(나머지) 강제 — 그 외 **세션 검증 전 405**, 레코드 불변 음성검사 |
| member self-reset 정책 위반 | 분기 **삭제**. 같은 팀장/HQ 만 발급. 공개 초기화 신청 API 없음(메신저로 요청) |
| 강제 변경 미구현 | `updateUser({password, signOutOfOtherSessions:true})` + `setPasswordCompromised({revokeAllSessions:true})` — 둘 다 공식 API, 자동검사(B8·B14·R5) 고정 |
| 공허·문자열 검사 | 55검사로 교체: 실 모듈 해석·실 상태전이·실행 관측(authorizedFetch)·목록 내용 검사·직렬화 전수 |

## 2. 이번에 추가로 확정된 설계
- **역할 미신뢰 가입**: 공개 가입 body 의 role 은 읽지 않는다 — 항상 member·pending. 역할 상향은 승인 시점 결정(`canApproveAs`): member=같은 팀 active 팀장/HQ, **team_lead=HQ만**, hq=불가(부트스트랩 별도). legacy team_lead/hq 신청은 팀장 목록·승인에서 제외.
- **세션 전달**: 쿠키 자동 전달을 추측하지 않고 Clerk 공식 `getToken()` → `Authorization: Bearer` 를 `authorizedFetch` 로 명시 전달. 보호 API 소비자 **12지점 전수 재배선**(sync·orders·inquiries·reviews·inventory·sales·products·read×2·orders-revenue·ai/chat·behavior-summary). health·orders-admin·detail·behavior-events 는 공개/폐쇄 유지.
- **화면 최소 범위**: 로그인 / 가입 5필드(이름·팀·직책·희망 아이디·비밀번호 — 이메일·전화 없음) / 승인 대기 / 정지 / 계정 관리 패널 1개(승인 목록+팀원·팀장 승인 버튼·정지·임시 비번). 거대 포털·프로필·다중 회사 없음. 계정 삭제 기능 없음(정지+이력 보존).
- **매트릭스(실 handler 재현)**: 키0+로컬=200(명시 open) · 키0+Production=503 · Secret만+Preview=503 · Publishable만=503 · 두 키+parties0=503 · 완전설정+무세션=**401**(실 어댑터 경로, 네트워크 0).

## 3. 정직한 미실증 항목(통과 주장 안 함 — 설정 후 Preview 실증)
실제 Clerk 가입 · 실제 브라우저 로그인 · 실세션 보호 API 왕복 · HQ 부트스트랩 · 승인 후 대시보드 진입 · 임시 비밀번호 강제 변경 실동작(로그인 폼의 세션 태스크 처리 포함) · Preview/Production 동작.

## 4. 사장님이 하실 Clerk 설정 (5분)
1. **clerk.com 가입** → "Create application" (이름 예: godo).
2. 로그인 방식에서 **Username 켜기, Email 끄기(필수 해제), Password 켜기**. (가입 허용은 기본값 그대로)
3. **API Keys 화면에서 키 2개 복사**: Publishable key(pk_…), Secret key(sk_…).
4. **Vercel → godo 프로젝트 → Settings → Environment Variables** 에 4개 추가(Production+Preview 모두):
   - `VITE_CLERK_PUBLISHABLE_KEY` = pk_… (프론트·서버 공용)
   - `CLERK_SECRET_KEY` = sk_…
   - `AUTH_AUTHORIZED_PARTIES` = `https://godo-psi.vercel.app`
   - (5에서) `AUTH_BOOTSTRAP_HQ_USER_ID`
5. **최초 총괄(HQ) 지정**: 배포 후 사장님이 먼저 가입 → Clerk 대시보드 Users 에서 본인 계정의 **User ID(user_…)** 복사 → `AUTH_BOOTSTRAP_HQ_USER_ID` 에 넣고 재배포 → 로그아웃 후 다시 가입 정보 제출(또는 "상태 다시 확인") 시 그 계정만 1회 HQ 가 됩니다.
> 키를 넣기 전까지 Production 보호 라우트는 503 으로 닫혀 있습니다(익명 공개 아님). 로컬 개발은 지금처럼 그대로 동작합니다.

설정이 끝나면 저희가 Preview 에서 가입→승인→로그인→대시보드 전 과정을 실증합니다.

## 5. 배포 순서(합의 필요 1건)
① A.1 로컬 GREEN(완료) → ② main 병합·Production 배포 → **이 순간 Production 보호 라우트 503**(대시보드 데이터 잠김) → ③ 위 4절 설정 → ④ Preview 실증 → ⑤ 익명 시험 lifecycle 자료 백업·초기화(별도 작업).
⚠️ ②와 ③ 사이 공백 동안 대시보드가 닫혀 있어도 되는지(권장: 예 — 짧게 진행), 아니면 설정 완료 후 병합할지 사장님 결정이 필요합니다.

## 6. 상태
push·Preview·main 병합·Production·GREEN B·R-ROUTE-ABUSE-01·다음 감사·RC-3 미수행 — 로컬 GREEN 보고 후 대기.
