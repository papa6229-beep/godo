# B-use-5 통합 Preview 인수검사 — 배포·사전검사 기록

작성: **2026-07-28** (사전검사 실행 시각 05:27~05:29 UTC / 14:27~14:29 KST)
브랜치: `codex/b-use-5-preview-acceptance`
HEAD: `b87ce910b79be5057fbfc957b37bb1f640b5eb8b`

> **이 문서는 인수검사 통과 기록이 아니다.** 아래 §5 브라우저 항목(A~G)은 **전부 `미검증`** 이며,
> 사용자 로그인 준비가 끝난 뒤 실제 화면에서 확인한다. 사전준비만으로 B-use-5 완료를 선언하지 않는다.

---

## 1. Preview 배포

| 항목 | 값 | 확인 방법 |
|---|---|---|
| Deployment URL | `https://godo-qz2kksfqd-taejuns-projects-e5fc4e75.vercel.app` | `vercel ls` |
| Deployment ID | `dpl_Capuzbx55XzApTFX8PxKPw28hZg6` | `vercel inspect` |
| 브랜치 별칭 | `https://godo-git-codex-b-use-5-preview-f2d73c-taejuns-projects-e5fc4e75.vercel.app` | `vercel inspect` |
| **Environment** | **`preview`** (`target: preview`) | `vercel inspect --json` |
| **상태** | **`Ready`** (`readyState: READY`) | `vercel inspect --json` |
| **Source commit** | **`b87ce91`** — 현재 HEAD 와 일치 | 빌드 로그: `Cloning github.com/papa6229-beep/godo (Branch: codex/b-use-5-preview-acceptance, Commit: b87ce91)` |
| 생성 경로 | **Git 연동**(브랜치 push → 자동 Preview). CLI 수동 배포 아님 | 브랜치 별칭 · 빌드 로그의 Cloning 행 |
| 생성 시각 | 2026-07-28 14:11:37 KST | `vercel inspect` |

**빌드된 서버리스 함수**(부분)

```
λ api/ai/chat            (225.91KB) [iad1]
λ api/auth/[action]      (227.67KB) [iad1]   ← 인증 계정 API, 정상 빌드 확인
λ api/detail/[action]    (24.48KB)  [iad1]
λ api/godomall/[resource](486.81KB) [iad1]
λ api/godomall/health    (8.86KB)   [iad1]
… 6 output items hidden
```

**오래된 Preview·다른 브랜치 별칭은 이번 결과로 쓰지 않는다.** (직전 Preview `godo-rm3qz4n72-…` 는 `fix/auth-foundation-01-red` 소스이며 이 문서의 근거가 아니다.)

## 2. 제품 코드 동일성

기준 코드 커밋 `e599ce2` 와 **트리 해시까지 동일**하다.

| 대상 | `e599ce2` | `b87ce91` |
|---|---|---|
| `src/` | `75b191c13fd7c275b2db91e71539bcc8c402dc7d` | 동일 |
| `api/` | `67fcf6e5ac76f0e65a32b0b3b74979ffd0848556` | 동일 |
| `scripts/` | `8cd96b1053a412deed5a544d0a023e5c4f78b35f` | 동일 |
| `package.json` | `5a962d07df1f659724c3d52f5b86c6952a80b105` | 동일 |
| `package-lock.json` | `f6e9dda22237cdeac6b70234a17bdf5897e89a4f` | 동일 |

`e599ce2..b87ce91` 변경은 `docs/governance/` **3파일뿐**이다. 따라서 Preview 생성 전에 `npm test` 를 반복하지 않았고, Codex 가 `e599ce2` 에서 낸 결과(집중검사 206/206 · 전체 smoke 124/124 · build · `npm test` exit 0)를 로컬 기준선으로 사용한다.

## 3. 인증 환경변수 (이름과 Preview 적용 여부만)

**값은 조회하지 않았고 기록하지 않는다.**

| 이름 | Preview 적용 |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ |
| `CLERK_SECRET_KEY` | ✅ |
| `AUTH_BOOTSTRAP_HQ_USER_ID` | ✅ |
| `AUTH_AUTHORIZED_PARTIES` | ✅ |

조건부 항목 판정:
- `CLERK_JWT_KEY` — 코드상 선택값(`...(process.env.CLERK_JWT_KEY ? { jwtKey } : {})`). **필수 아님**, 미설정 유지.
- `AUTH_ENFORCE` — `VERCEL_ENV=preview` 가 이미 `resolveProtectedEnv` 의 보호환경 판정 근거(`vercel_deployment`). **중복 요구하지 않음**, 미설정 유지.
- Preview 도메인 허용 — 코드의 `buildAuthorizedParties` 가 `VERCEL_URL`(그 배포 자신의 도메인)을 자동 포함하므로 Preview 도메인은 **코드에서 자동 허용**된다.

**환경변수를 추가·수정·삭제하지 않았다.**

## 4. `vercel curl` 사전검사 (비대화형)

**Deployment Protection 은 켜진 상태 그대로 유지했다.** 보호를 끄거나 별도 공개 주소를 만들지 않았고, `vercel curl` 로 인증된 CLI 세션을 통해 접근했다.

> 참고(이전 판단 정정): 일반 `curl` 로는 Vercel SSO 302 만 돌아온다. 그것을 근거로 "Preview 검사 불가"라고 판단했던 이전 결론은 **틀렸다** — `vercel curl` 은 애플리케이션까지 도달한다.
> Git Bash 에서는 경로 자동변환 때문에 `MSYS_NO_PATHCONV=1` 이 필요하고, curl 옵션은 `--` 뒤에 넘겨야 한다.

| # | 경로 | 결과 | 판정 |
|---|---|---|---|
| 1 | `/api/godomall/health` | `ok:true` · `source: secure_proxy` · `mode: real` · `status: ready` · `productionLocked: true` · `"Live READ mode (real). Write actions remain disabled."` · `resources: orders,inquiries,reviews,inventory,sales,products` | **애플리케이션 응답 도달**(SSO 302 아님). READ 전용·WRITE 비활성 확인 |
| 2 | `/api/auth/me` (인증 없이) | `ok:false` · `errorCode: AUTH_REQUIRED` · "로그인이 필요합니다." | **정상 결과**. 실패로 처리하지 않는다 |
| 3 | 루트 `/` | HTML 반환(`</html>` + Vercel live feedback 스크립트) | **배포가 HTML 을 반환**한다. **브라우저 인수검사 통과로 표현하지 않는다** |

**추가 사전검사(같은 방식, 인증 없이)**

| 경로 | 결과 | 의미 |
|---|---|---|
| `/api/godomall/products` | `AUTH_REQUIRED` | 보호됨 |
| `/api/godomall/orders-revenue` | `AUTH_REQUIRED` | 보호됨 |
| `/api/marketing/behavior-summary` | `AUTH_REQUIRED` | 보호됨 |
| `/api/godomall/orders-admin` | `ADMIN_ACCESS_DISABLED` | 기존 403 정책 유지 |
| `POST /api/auth/suspend` | `FEATURE_NOT_AVAILABLE` — "계정 정지는 앱에서 제공하지 않습니다…" | 미채택 기능, **세션 검증 이전 차단** |
| `POST /api/auth/reset-password` | `FEATURE_NOT_AVAILABLE` — "임시 비밀번호 발급은 앱에서 제공하지 않습니다…" | 미채택 기능, 세션 검증 이전 차단 |
| `OPTIONS /api/marketing/behavior-events` | **HTTP 204** | 공개 유지(방문자 수집) |

응답 본문에 비밀값·개인정보가 없음을 확인했다(키 존재 여부 boolean 만 노출).

## 5. 브라우저 인수검사 — **전부 `미검증`**

사용자 로그인 준비 전이므로 아래 항목은 **하나도 실행하지 않았다.** "코드가 있으므로 통과"로 적지 않는다.

| 구간 | 항목 | 상태 |
|---|---|---|
| A | 인증 게이트(미로그인 대시보드 차단 · 로그인 화면 · 보호 API 익명 차단 · 잘못된 metadata 가 HQ 로 보정되지 않음) | **미검증** |
| B | 가입·계정 승인(5입력 · `member`+`pending` · 같은 팀장 스코프 · 팀원 승인 · `team_lead` 승격은 HQ만 · 승인 후 진입) | **미검증** |
| C | 역할별 화면(HQ 전체 탭 · 팀장/팀원 자기 부서만 · HQ→팀원 전환 시 HQ 탭 미노출 · 역할 전환기로 권한 확대 불가 · 계정 미확인 시 시험 역할 대체 없음) | **미검증** |
| D | 계정 전환 자료 격리(업무 상세 · 보고서 · 승인 상세 · 자료 삭제 아닌 노출 차단) | **미검증** |
| E | B-use-3 핵심 흐름(HQ 지시 → 메시지 1·업무 1·원장 1 · 수행자 지정 → 결과 제출 → 팀장 확인 → HQ 최종 확인 → 이력·지난 업무 재진입) | **미검증** |
| F | 나머지 진입 경로(팀 내부 · 협업 요청 · HQ 확인 요청 · 수정 요청 · 중단/반송 권한 구분) | **미검증** |
| G | 데이터 상태 표현(실제 / 시험 / 연결 안 됨 / 실제 0건) | **미검증** |

**A-3(보호 API 익명 차단)** 은 §4 에서 `vercel curl` 로 **API 응답 확인** 수준까지 관측했다. 다만 브라우저 화면 경로는 아직 확인하지 않았으므로 A 구간 전체를 통과로 표시하지 않는다.

새 고도몰 키는 발급 대기이므로 **C단계 새 판매몰 검증은 이번 인수검사 범위 밖**이다.

## 6. 하지 않은 것

- Production 배포·`main` 병합·`main` push **없음** (`main` `364f417` · `origin/main` `5190f685` 무변경)
- 환경변수 추가·수정·삭제 **없음** · 환경변수 **값 조회 없음**(`vercel env pull` 미실행)
- Deployment Protection 변경 **없음**
- force push **없음**(일반 push 1회)
- 같은 Source 재배포 **없음**
- Clerk 계정 임의 생성 **없음** · 비밀번호·토큰 요청·기록 **없음**
- 고도몰 WRITE·키 등록 **없음** · DB 선택·구현 **없음**
- Preview 생성 전 `npm test` 반복 **없음**

## 7. 재현 명령

```bash
# 배포 확인
vercel ls
vercel inspect https://godo-qz2kksfqd-taejuns-projects-e5fc4e75.vercel.app
vercel inspect https://godo-qz2kksfqd-taejuns-projects-e5fc4e75.vercel.app --logs | grep -i cloning

# 보호된 Preview 사전검사 (Git Bash 는 MSYS_NO_PATHCONV=1 필요, curl 옵션은 -- 뒤에)
export MSYS_NO_PATHCONV=1
vercel curl /api/godomall/health  --deployment dpl_Capuzbx55XzApTFX8PxKPw28hZg6
vercel curl /api/auth/me          --deployment dpl_Capuzbx55XzApTFX8PxKPw28hZg6
vercel curl /api/auth/suspend     --deployment dpl_Capuzbx55XzApTFX8PxKPw28hZg6 -- -X POST
vercel curl /api/marketing/behavior-events --deployment dpl_Capuzbx55XzApTFX8PxKPw28hZg6 -- -X OPTIONS -s -o /dev/null -w "HTTP %{http_code}\n"
```

## 8. 1차 실제 화면 관측 (2026-07-28, Codex 실행) — **차단 결함 1건 발견**

> 위 §1~§7 은 Source `b87ce91` Preview 에 대한 **과거 관측 기록으로 그대로 보존한다.** 아래는 그 배포에서 실제 브라우저로 확인한 결과다.

**정상 확인된 항목** (실제 화면)

| 항목 | 결과 |
|---|---|
| 로그인 전 대시보드 미노출 | 확인 |
| `admin` 계정 로그인 | 성공 |
| 로그인 후 비밀번호 입력란 소멸 | 확인 |
| 계정 표시 | `[시험] HQ 관리자 · hq` |
| HQ 전용 메뉴 노출 | 확인 |
| 전체 부서 관제 화면 | 확인 |
| `계정 관리` 진입 | 성공 |
| `가입 승인 (총괄)` 화면 진입 | 성공 |
| 승인 대기 0건 표시 | 정상 |

**차단 결함 — active 계정 로그아웃 진입점 부재**

- `AuthGateScreen.tsx` 의 `PendingScreen`(`:163`·`:222`)과 `SuspendedScreen`(`:230`·`:238`)에만 `signOut` 이 있었다.
- active 상태는 `App.tsx` 가 대시보드를 바로 렌더하는데 **그 경로에 로그아웃 버튼·메뉴가 없었다.**
- 저장소 전수 검색에서도 `signOut` 은 위 두 화면에만 존재했다.
- 결과: **HQ→팀장→팀원 계정 전환·가입 신청·이전 계정 자료 격리 검사(B·C·D 구간)를 실제 화면에서 진행할 수 없었다.**

## 9. 결함 수정 (2026-07-28)

**종료조건**: 인증된 active 사용자가 화면에서 안전하게 로그아웃할 수 있고, 로그아웃 직후 대시보드가 사라지며 로그인·가입 화면으로 돌아간다.

| 파일 | 변경 |
|---|---|
| `src/components/auth/SignOutButton.tsx` (신규) | Clerk `useClerk().signOut()` 만 쓰는 작은 버튼. Clerk 훅을 **이 컴포넌트 안에 가둔다** |
| `src/components/MainLayout.tsx` | 신원 배지 바로 옆에 `{identity.mode === 'authenticated' && <SignOutButton />}` |
| `src/components/MainLayout.css` | `.auth-signout-btn` (배지 옆 작은 pill 버튼) |
| `scripts/smoke-b-use-4-auth-integration-v0.mjs` | 계약 4건 추가(C-10a~C-10d) |

**설계 근거**
- 미구성 로컬(시험 역할) 모드에는 `main.tsx` 가 `ClerkProvider` 를 씌우지 않으므로 Clerk 훅을 호출하면 안 된다. 그래서 **훅을 조건부로 마운트되는 버튼 안에만** 두고 `MainLayout` 은 Clerk 를 import 하지 않는다.
- 쿠키 직접 삭제·localStorage 전체 삭제·페이지 강제 초기화를 쓰지 않는다. **Clerk `signOut()` 하나만** 호출한다.
- 로그아웃 후 해제 경로는 기존 그대로다: `signOut()` → `ClerkAuthBridge` 의 `isSignedIn` effect → `registerSessionTokenGetter(null)` + `setServerAccount(null)` + `notifyAuthChange()` → `useServerAccount`/`useAuthGate` 재계산 → `computeEffectiveIdentity` 가 `actor: null` → `App` 의 게이트가 `login` 으로 `AuthGateScreen` 반환. **업무 자료는 삭제하지 않고 노출만 끊긴다.**
- `계정 관리`(승인)와 섞지 않는다 — 버튼은 로그아웃만 한다.

**검사 결과**: 집중검사 `smoke-b-use-4-auth-integration-v0.mjs` **206 → 210/210**(C-10a~C-10d 신규) · `tsc -b` exit 0 · 변경 파일 lint 오류·경고 0 · 인접 회귀 3건 PASS(B-use-3 103/103 포함) · `vite build` 성공.
전체 `npm test` 는 A~G 화면검사가 끝난 뒤 한 번 실행한다(이번엔 반복하지 않는다).

## 10. 수정 후 Preview — **이것이 재검증 대상이다**

| 항목 | 값 |
|---|---|
| Deployment URL | `https://godo-f283voqsq-taejuns-projects-e5fc4e75.vercel.app` |
| Deployment ID | `dpl_9BgcZz766FgmWVvAvhDaw8AQbmGz` |
| 브랜치 별칭 | `https://godo-git-codex-b-use-5-preview-f2d73c-taejuns-projects-e5fc4e75.vercel.app` (최신 배포로 이동) |
| **Environment** | **`preview`** |
| **상태** | **`Ready`** |
| **Source commit** | **`2d856b0`** — 수정 커밋과 일치. 빌드 로그: `Cloning github.com/papa6229-beep/godo (Branch: codex/b-use-5-preview-acceptance, Commit: 2d856b0)` |
| 빌드 | 성공 · `api/auth/[action]` 함수 포함 |
| 생성 시각 | 2026-07-28 14:51:48 KST |

> 앞선 §1 의 `b87ce91` 배포(`dpl_Capuzbx…`)는 **1차 관측 기록으로 보존**한다. 덮어쓰지 않았다.

**수정 후 실제 화면 결과는 아직 `Codex 재검증 대기` 다.** A~G 구간은 여전히 §5 표대로 **미검증**이며, 이번 수정으로 통과 처리된 항목은 하나도 없다.

**Codex 가 이 배포에서 확인할 정확한 지점**

1. HQ 로그인 후 **상단 신원 배지(`[시험] HQ 관리자 · hq`) 바로 오른쪽에 `로그아웃` 버튼**이 보이는가
2. 클릭 → 대시보드가 사라지고 **로그인 화면**으로 돌아가는가(중간에 빈 화면·오류 없이)
3. 로그아웃 직후 이전 HQ 의 **대시보드·업무 상세·승인 상세·보고서가 렌더되지 않는가**
4. 다시 로그인하면 이전 업무 자료가 **그대로 남아 있는가**(삭제가 아니라 노출 차단이었는지)
5. 그 뒤 B 구간 재개: 앱의 **가입 신청 화면**에서 직원 후보 2명 생성 → 둘 다 `member`+`pending` → HQ 가 각각 `team_lead`·`member` 로 승인
6. C·D 구간: HQ→팀장→팀원 전환하며 화면·권한 차이와 자료 격리 확인 (각 계정에서도 로그아웃 버튼이 동일하게 보이는지 포함)

## 11. 다음 단계 (계정 준비 순서)

Clerk 대시보드에서 직원 계정을 미리 만들지 **않는다** — 그러면 앱의 실제 가입과 `/api/auth/signup-metadata` 경로를 건너뛴다.

1. 사용자가 Chrome 에서 **새 Preview 주소**를 연다. Vercel 로그인이 요구되면 **사용자가 직접** 로그인한다.
2. 기존 HQ 계정으로 **사용자가 직접 비밀번호를 입력해** 로그인한다(모르면 사용자가 Clerk 에서 직접 재설정). **비밀번호를 AI 에게 전달하지 않는다.**
3. 같은 팀 직원 후보 2명을 **Preview 의 실제 `가입 신청` 화면**에서 만든다 → 둘 다 최초 `member`+`pending` 인지 확인.
4. HQ 가 앱 화면에서 한 명을 `team_lead`, 한 명을 `member` 로 승인한다.
5. 그 뒤 A~G 를 실제 화면에서 확인한다.

`AUTH_BOOTSTRAP_HQ_USER_ID` 가 설정돼 있다는 사실만으로 **HQ 계정이 실제 존재한다고 단정하지 않는다** — 2번에서 실제 로그인으로 확인한다.
