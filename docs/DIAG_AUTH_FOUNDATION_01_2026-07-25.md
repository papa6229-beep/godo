# R-AUTH-FOUNDATION-01 — 서버 행위자·권한 경계 RED 진단

- 날짜: 2026-07-25 · 브랜치: `fix/auth-foundation-01-red` (기점 main `5190f68`)
- 성격: **RED 진단 전용. 제품 소스 변경 0 · 인증 구현 0.** 실제 handler 무인증 호출은 경계까지만(외부 AI 실호출·실비용·고도몰 쓰기·실 PII 주입 없음, `globalThis.fetch` stub).
- 근거: AUDIT-01.1 C1(서버 인증 부재 근본 원인). 감사 문서는 audit 브랜치에서 읽기 전용 확인(전환·병합 없음).
- 증거: CODE·AUTO(실 handler 호출)·DOC.

## 1. 인바운드 라우트 전수표 (현재 저장소 재계수 — 핸들러 10개)

행위자 식별 근거 3구분: (a)화면용 데모(sessionRole) (b)body 주장 (c)서버 검증 로그인. **(a)(b)는 인증 근거 아님.** 현재 (c)는 전무.

| 라우트(엔드포인트) | 메서드 | 공개/내부 | R/W | PII·통계·AI비용·외부전송 | 인증 | 권한 | 행위자 근거 | 무인증 결과(실측) | 필요 |
|---|---|---|---|---|---|---|---|---|---|
| ai/chat | POST | 내부(직원 AI) | 프록시 | AI비용·외부전송(요청자 키) | 없음 | 없음 | 없음(키=body) | **api.anthropic.com 경계 도달**(AUTO) | 인증+abuse |
| detail/[action] | GET/POST | 내부(변환기) | R(이미지 프록시) | 외부전송(이미지 fetch) | 없음 | 없음 | 없음 | 처리(rate-limit 120/분·SSRF 방어 有) | abuse-only(방어됨) |
| godomall/[resource]{orders,inquiries,reviews,inventory,sales} | GET | 내부 | R | PII→**마스킹** | 없음 | 없음 | 없음 | 200 마스킹 레코드 | 원본은 인증(현재 마스킹으로 완화) |
| godomall/health | GET | 공개 가능 | R | 키 존재 플래그(값 X) | 없음 | 없음 | 없음 | 200 상태 | 무해 |
| godomall/orders-admin | GET | 내부(원본 PII) | R | PII(원본) | 없음 | 없음 | 없음 | **403 fail-closed**(SEC-ORDERS-ADMIN-01) | 인증(재개 조건) |
| godomall/orders-revenue | GET | 내부 | R | 매출 집계(PII 없음) | 없음 | 없음 | 없음 | 200 집계 | 인증(회사 데이터) |
| godomall/products | GET | 내부 | R | 상품(PII 없음) | 없음 | 없음 | 없음 | 200 | 낮음 |
| godomall/read?capability= | GET | 내부 | R(**WRITE 403**) | 카테고리/브랜드/코드 | 없음 | capability 화이트리스트·WRITE 차단 | 없음 | 200 | abuse-only |
| godomall/sync | POST | 내부 | **R 오케스트레이션**(외부쓰기 X) | PII→마스킹 | 없음 | 없음 | 없음 | 200 마스킹 | 인증(회사 데이터)+abuse |
| marketing/behavior-events | POST | **공개(방문자 수집)** | W(append) | 방문자 이벤트(PII validator reject) | 없음 | Origin 화이트리스트 | **shopId=body 주장** | append | **abuse-only(R-ROUTE-ABUSE-01)** — 인증 아님 |
| marketing/behavior-summary | GET | 내부(회사 통계) | R | **회사 마케팅 집계** | 없음 | **없음** | 없음 | **200 회사 집계 통계**(AUTO) | **인증(회사 readout)** |

## 2. 무인증 호출 실제 값 (AUTO — 실 handler, 경계까지)
- **behavior-summary GET 무인증 → HTTP 200**, body keys=ok/hasLiveData/generatedAt/storage/dataStatus/insights → 회사 마케팅 집계를 인증 없이 반환.
- **ai/chat POST 무인증 → 외부 경계 `api.anthropic.com/v1/messages` 도달**, Authorization 헤더에 **요청자 body 키** 실림(서버 회사키 미주입). fetch stub — 실호출·실비용 0.
- **인바운드 인증 검사 라우트 = 0 / 10** (Authorization/cookie/JWT/세션 판독 전무).
- **lifecycle 권한 판정 서버 라우트 = 0** — 지시·배정·제출·승인·중단 권한(canDecide/applyDecision)이 **브라우저 localStorage에서만** 강제됨.

## 3. 현재 행위자 신뢰 경로
```
클라이언트(브라우저)
  ├ sessionRole (localStorage 데모 역할) ──▶ 화면 표시·클라 분기 전용 [인증 아님]
  ├ 요청 body의 actor/team/agent id ────────▶ 서버가 그대로 신뢰(검증 없음) [인증 아님]
  └ (서버 검증 로그인 세션) ────────────────▶ 존재하지 않음  ← 결함
서버(api/**): 인바운드 자격증명 판독 0 → 모든 요청이 "익명·무권한"으로 처리
lifecycle 권한: 서버 미도달(localStorage 전용) → 누구든 브라우저에서 자유 조작 가능(서버가 행위자 미검증)
```

## 4. 공통 근본 원인 vs 독립 결함
- **공통 근본 원인(구조적)**: 서버가 검증하는 **행위자 정체성·권한 경계 부재**. 다음의 공유 선행:
  - orders-admin 원본 PII **재개**(현재 fail-closed) · behavior-summary 회사 통계 · orders-revenue/sync 회사 데이터 · lifecycle 서버 강제 · ai/chat 인증 허용.
- **독립 결함(인증과 별개, R-ROUTE-ABUSE-01)**: ai/chat·behavior-events의 rate-limit·payload cap·dedup·shop 귀속 검증. behavior-events는 **공개 수집**이라 인증 대상 아님.
- **이미 방어됨**: detail(SSRF+rate-limit), [resource]/sync(마스킹), read(WRITE 403).

## 5. 기존 공개 기능을 잘못 막을 위험
- **behavior-events(방문자 공개 수집)** — 인증 걸면 안 됨(쇼핑몰 방문자용). abuse 방지만.
- **health** — 공개 상태 점검, 무해.
- **detail image-proxy** — 변환기 이미지 프록시(앱 기능). 인증보다 rate-limit/SSRF(현행 유지).
- **[resource]/products/orders-revenue** — 현재 앱이 무인증으로 소비 중. 인증 도입 시 **앱도 동일 세션으로 호출**하도록 함께 배선하지 않으면 대시보드가 깨진다(무회귀 위험). GREEN은 앱 로그인 흐름과 동시 도입 필요.
- orders-admin은 이미 fail-closed라 재개 전까지 영향 없음.

## 6. 생산자→서버 경계→소비자 (요지)
- **HQ/팀장/일반 역할**: sessionRole(localStorage) → 화면 분기. **서버 경계 없음** → 서버는 역할 모름.
- **lifecycle 행위자(지시/배정/제출/승인/중단)**: taskLifecycleAppAdapter(canDecide, 클라) → taskLifecycleStore(localStorage). **서버 경계·소비자 없음**.
- **회사 통계 조회**: behavior-summary / orders-revenue(서버 집계) → 대시보드. **무인증 서버 경계**.
- **PII 조회**: [resource](마스킹) / orders-admin(원본, 현재 403). 서버 경계=무인증.
- **AI 비용 프록시**: ai/chat → 외부 provider. 무인증 서버 경계.
- **향후 고도몰 쓰기**: 현재 없음(read.ts WRITE 403, sync 읽기). 도입 시 **반드시 인증+권한 선행**.

## 7. GREEN 구현안 비교 (확정 아님 — 사용자 결정 대상)
| 방식 | 보안 | 편의 | 선행조건 | 현 구조 적합성 |
|---|---|---|---|---|
| 최소 서버 세션(쿠키+단일 비밀번호, 단일 회사) | 중~상 | 상 | 세션 시크릿 env | Vercel Functions에 쿠키 검증 미들웨어로 도입 용이 |
| Sign in with Vercel / OAuth(GitHub 등) | 상 | 상 | OAuth 앱 등록 | Vercel-native, 조직 계정 활용 |
| 조직 IdP(Clerk/Auth0 등 Marketplace) | 상 | 상 | 외부 업체·비용 | 다중 회사·역할 확장에 유리(현 단계 과할 수 있음) |
- **역할 판정 위치**: 서버가 정본(HQ/팀장/일반). lifecycle 권한도 서버 이관 vs 클라 유지+서버 이중검증(2단계 가능).
- **단일 회사 vs 다중 회사**: 현재 단일. tenantId 스키마만 예약하고 단일로 시작 권장.
- **localStorage lifecycle 자료 귀속/이관**: 현재 익명 브라우저 저장 → 서버 사용자에 귀속. 이관(마이그레이션) vs 초기화 결정 필요.
- **단계적 도입 순서(예상)**: ①서버 세션·행위자 미들웨어 → ②보호 라우트 게이트(behavior-summary·orders-revenue·sync·orders-admin 재개) + 앱 로그인·동일세션 호출 배선 → ③lifecycle 권한 서버 이중검증 → ④(옵션) 다중 회사. 예상 변경 파일: `api/_shared/`에 인증 미들웨어 1개 + 보호 라우트 각 1줄 게이트 + `src`에 로그인 화면·세션 클라이언트 + 앱 fetch 헤더/쿠키.

## 8. 사용자에게 확인할 정책 질문 (예·추천 포함)
1. **인증 방식** — 예: "직원 5명이 아이디/비번으로 로그인" vs "GitHub 계정으로 로그인". 추천: 단일 회사 단계라 **최소 서버 세션** 또는 **Sign in with Vercel**(외부 비용 0).
2. **lifecycle 권한 서버 이관 범위** — 예: 승인/중단을 서버가 최종 검증할지, 당분간 클라 유지+서버 로그인만 먼저. 추천: 1차는 로그인만, 2차에 lifecycle 서버 검증.
3. **기존 브라우저 lifecycle 자료** — 예: 지금 쌓인 업무 카드를 로그인 사용자에 귀속 vs 초기화. 추천: 시험 단계라 **초기화**가 단순.
4. **behavior-events 공개 유지** — 방문자 수집은 인증 없이 유지 확인(추천: 유지, abuse만 R-ROUTE-ABUSE-01).
5. **다중 회사 계획** — 지금 단일 회사면 tenantId 예약만. 추천: 단일로 시작.
6. **ai/chat 키** — 요청자 키 유지 vs 서버 보관(R-KEY-POLICY-01 연계). 추천: 인증 후 서버 보관 검토.

## 9. GREEN 예상 범위·종료조건·무회귀
- **예상 범위**: 서버 인증 미들웨어 도입 + 보호 라우트(behavior-summary·orders-revenue·sync·orders-admin 재개·ai/chat) 행위자 게이트 + 앱 로그인·동일세션 배선. behavior-events·health·detail 제외.
- **종료조건**: 무인증 요청이 보호 라우트에서 401/403 · 서버가 행위자·역할을 검증 · 앱은 로그인 세션으로 정상 동작(대시보드 무회귀) · lifecycle 권한 서버 검증(2차) · 가짜 인증/body-역할/데모역할을 근거로 쓰지 않음.
- **무회귀**: behavior-events 공개 수집 유지 · [resource] 마스킹 · 기준값 6종 · provenance · SEC-ORDERS-ADMIN fail-closed · 전체 smoke.
- **Preview/Prod**: 로그인 흐름은 Preview·Production 실검증 필요. **실 API 대기 아님**(인증 구조는 자체 완결).

## 10. 상태
제품 소스 0·검사 하드코딩/가짜 인증 0. RED 검사(`smoke-auth-foundation-01-red-v0.mjs`) + 본 문서만 신규.
push·Preview·병합·Production·AUTH GREEN·R-ROUTE-ABUSE-01·RC-3 미수행.
