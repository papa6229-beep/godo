# BUILD-TYPECHECK-01 — Vercel Production Build-log 오류 RED 진단

**작성일** 2026-07-24
**브랜치** `fix/build-typecheck-api-functions-01` (main `503e3d8` 에서 분기)
**상태** RED (원인 진단·재현만, 제품·API·설정·package.json 변경 0)
**재현 스크립트** `scripts/smoke-build-typecheck-api-red-v0.mjs` (1 BASE pass / 5 RED met)

> 이 문서는 **확정(로컬 재현됨) / 미확정(로컬 재현 안 됨)** 을 엄격히 구분한다.
> "런타임 HTTP 200" 은 타입 오류가 없다는 증거로 쓰지 않는다. "이전부터 존재" 와 "수정 불필요" 는 다른 뜻으로 둔다.

---

## 0. 배경 사실

- Production `PBhDtWrFy`(Source `503e3d8`) Build Log 배지: **16 errors / 1 warning**, 그러나 배포는 **Ready**(빌드 실패 아님).
- 로컬 `npm run build`(`tsc -b && vite build`) = **exit 0**, warning 1건(vite chunk-size)만 출력.
- 모든 오류는 `api/` 서버리스 함수. `src/`(RC-2 가 수정한 클라이언트) 오류 0.
- `6dca85d..503e3d8` 에서 `api/` 파일 변경 **0** → api 오류는 RC-2/병합이 만든 것이 아니라 **이전부터 동일**. (단, "이전부터 존재" 를 "수정 불필요" 로 해석하지 않는다.)
- 로컬 도구: TypeScript **6.0.3**(Vercel 로그 "Using TypeScript 6.0.3 (local user-provided)" 와 동일), Node v24.13.0, `@types/node` 24.13.2 설치됨(`package.json` `^24.12.3`).

---

## 1. tsconfig 구조 (사실)

- `tsconfig.json` = **솔루션 파일**: `files: []`, `references: [tsconfig.app.json, tsconfig.node.json]`, **compilerOptions 없음**.
- `tsconfig.app.json`: `include: ["src"]`, `lib: ["ES2023","DOM"]`, `types: ["vite/client"]` (node 미포함). → 클라이언트.
- `tsconfig.node.json`: `include: ["vite.config.ts","api/**/*"]`, `lib: ["ES2023"]`, `types: ["node"]`, `skipLibCheck: true`, `strict` 미설정. → **api/** 를 node 타입으로 검사.

즉 로컬에서 api/** 는 `tsconfig.node.json`(node 타입 + 전체 프로젝트 43파일)으로 검사되어 통과한다.

---

## 2. 재현 명령과 실제 출력

로컬 tsc(저장소 설치본)만 사용, 패키지 설치·업그레이드·설정 변경 없음. 임시 진단 tsconfig 는 `node_modules/.cache` 에만 기록.

| # | 명령 | 결과 |
|---|---|---|
| R1 | `tsc -p tsconfig.node.json` (=`tsc -b` 대상) | **exit 0, 0 오류** (전체 api + node 타입 → Node 전역 해석) |
| — | `tsc -b --force --pretty false` | **exit 0** (증분 캐시 문제 아님 — 강제 재검사도 통과) |
| R2 | `tsc -p tsconfig.app.json` (src/) | **0 오류** (결함은 src/ 아님) |
| R3 | 격리 컴파일: `lib:["ES2023","DOM"]`, **`types:[]`**(node 제외), `files:[detailImageFetch, marketingBehaviorCollectionValidator, [resource]]` | **Node-전역 오류 재현**: `TS2591 ×16`, `TS2552 ×2`, `TS7006 ×1` |
| R4 | 같은 격리 컴파일의 web 전역(URL/fetch/AbortController/setTimeout) | **오류 0** (DOM lib 이 제공 → Vercel 로그와 동일한 선택적 집합) |
| R5 | 로컬 어떤 조합(node타입·격리·`--strict`·`strictNullChecks:false`)에서도 `TS2339` | **재현 0** |
| — | `npm run build` | **exit 0**, warning 1건(`Some chunks are larger than 500 kB`) |

R3 재현 원문(격리·no-node) 발췌 — Vercel 로그의 330/341/345 Buffer·`[resource]` http 와 **행·열까지 일치**:
```
api/_shared/detailImageFetch.ts(18,24): TS2591 Cannot find name 'node:dns/promises'
api/_shared/detailImageFetch.ts(139,29): TS2591 Cannot find name 'Buffer'
api/_shared/detailImageFetch.ts(182,15): TS2591 Cannot find name 'Buffer'
api/_shared/detailImageFetch.ts(256,25): TS2591 Cannot find name 'process'
api/_shared/detailImageFetch.ts(330,21): TS2591 Cannot find name 'Buffer'
api/_shared/detailImageFetch.ts(341,21): TS2552 Cannot find name 'Buffer'. Did you mean 'buffer'?
api/_shared/detailImageFetch.ts(345,22): TS2552 Cannot find name 'Buffer'. Did you mean 'buffer'?
api/_shared/godomallOpenApiClient.ts(31..34): TS2591 Cannot find name 'process' (×4)
api/_shared/proxyResponse.ts(1,37): TS2591 Cannot find name 'http'
api/_shared/secretGuard.ts(25,34..37): TS2591 Cannot find name 'process' (×5)
api/godomall/[resource].ts(1,38): TS2591 Cannot find name 'http'
```
격리·no-node 컴파일이 낸 **`TS2591` 이 정확히 16건** — Vercel 배지 "16 errors" 와 수가 일치한다(강한 대응, 단 Vercel 전체 108줄 로그를 완전 추출하지 못해 동일성 100% 단정은 보류).

---

## 3. Vercel Build Log 전수 확인 시도 (한계 명시)

- Production 배포 페이지 Build Log(108줄)는 **가상화 리스트**라 렌더된 뷰포트만 DOM 에 존재하고, 스크롤 수집 시 브라우저 도구의 콘텐츠 필터(서명 URL 등)에 막혀 **전체 원문 텍스트를 안전하게 추출하지 못했다**.
- 직접 확인된 고유 오류(이전 세션 DOM 렌더분): `detailImageFetch.ts:288 TS2339 status`, `:330/341/345 TS2591/2552 Buffer`, `[resource].ts:1 TS2591 http`, `marketingBehaviorCollectionValidator.ts:179 TS2339 reason`.
- **warning 1건**: Vercel 원문 텍스트 미추출. **로컬 `npm run build` 는 warning 이 정확히 1건(vite chunk-size)** 이고 Vercel 배지도 warning 1 → **vite chunk-size 경고로 강하게 추정**하되, Vercel 원문 대조는 못 함(단정하지 않음).
- 비밀값·환경변수·PII 는 출력하지 않았다.

---

## 4. 전체 오류·warning 표 (원인 판정)

판정 카테고리: [A]함수별 Vercel 격리 컴파일 차이 · [B]Node 타입 로딩 차이 · [C]tsconfig 선택 차이 · [D]로컬 검사 범위 누락 · [E]TS 버전 차이 · [F]증분 캐시 · [G]실제 타입 안전성 결함.

| 오류 | 위치 | 로컬 재현 | 확정 원인 |
|---|---|---|---|
| Buffer ×3(로그) / 실측 다수 | `detailImageFetch.ts` 139/182/330/341/345 | **재현됨**(no-node 격리) | **B+A+D**: Vercel api 컴파일에 `@types/node` 미로드. 로컬 `tsc -b`(=tsconfig.node.json, node타입) 는 이를 로드해 통과 → 로컬 검사 범위가 Vercel 격리 컴파일과 다름. **E(버전)/F(캐시) 아님**(6.0.3 동일·`--force` 통과) |
| process ×다수 | `detailImageFetch/godomallOpenApiClient/secretGuard` | **재현됨** | 동일 (B+A+D) |
| `node:dns/promises` | `detailImageFetch.ts:18` | **재현됨** | 동일 (B+A+D) |
| http ×2 | `proxyResponse.ts:1`, `godomall/[resource].ts:1` | **재현됨** | 동일 (B+A+D) — `import type { IncomingMessage } from 'http'` 가 node 타입 없이는 미해석 |
| **TargetCheck.status 좁히기 (TS2339)** | `detailImageFetch.ts:288` | **미재현** | **미확정**. 명시적 판별 유니온(`{ok:true}|{ok:false;status}`)이라 정상 config 에선 좁혀짐. 로컬 node타입·격리·strict 어떤 조합에서도 재현 안 됨 → **Vercel @vercel/node 컴파일에서만 발생([A] 유력)**. 확정하려면 `vercel build`/@vercel/node 필요 |
| **validateEvent.reason 좁히기 (TS2339)** | `marketingBehaviorCollectionValidator.ts:179` | **미재현** | 동일(미확정, [A] 유력) |
| TS7006 (param `r` implicit any) | `detailImageFetch.ts:206` | no-node 격리에서만 출현 | **재현 부산물**: 내 격리 config 아티팩트일 수 있음. Vercel 보고 집합에 포함되는지 미확인 |
| warning ×1 | vite 단계 추정 | 로컬 build 에서 1건 | vite chunk-size 경고로 추정(원문 미대조) |

**요지**: Node-전역 오류(Buffer/process/http/node:)는 **확정** — Vercel api 컴파일이 node 타입을 로드하지 않는 **환경/범위 차이**([B]+[A]+[D]). `TS2339` 좁히기 2건은 **미확정** — 로컬 미재현, Vercel 전용으로 남음.

---

## 5. RED 잠금 (제품 소스 변경 없이 재현 검사로 고정)

- 기존 `npm run build` 가 api 타입 오류를 **놓친다** → 잠금(R1: `tsc -p tsconfig.node.json` exit 0).
- 강제 재검사(`tsc -b --force`)에서도 재현 안 됨 → **증분 캐시 문제 아님**.
- node 타입 제외 격리 컴파일에서 **정확히 재현**(R3), web 전역은 통과(R4) → Vercel 로그의 선택적 집합과 일치.
- `src/` RC-2 오류 **0**(R2).
- `api/` 고유 오류 전수 재현(R3 원문).
- `6dca85d..503e3d8` api 변경 **0**.
- warning 원문: 미확보(§3) — vite chunk-size 추정.
- `TS2339` 좁히기: 로컬 미재현(R5) — 미확정 gap.

---

## 6. 최소 GREEN 예상 파일 (지금 실행하지 않음)

원인 확정 전 타입 단언·명시적 Buffer import·`node:http` 변경·tsconfig 수정·package script 변경을 **시도하지 않는다**. GREEN 후보(설정 위주, 검증 필요):

- `api/tsconfig.json`(신규) 또는 루트 `tsconfig.json` 조정 — Vercel @vercel/node 가 api 함수를 **node 타입 포함**으로 검사하도록. (@vercel/node 가 실제로 어떤 tsconfig 를 선택하는지 확인 후 결정.)
- `vercel.json`/프로젝트 설정 — 함수 빌드의 타입검사 환경을 tsconfig.node.json 과 일치시킴.
- (검증용) `package.json` 에 api 전용 타입검사 스크립트 추가 — 아래 §7.
- `TS2339` 2건은 원인 확정 후: 실제 타입 안전성 결함이면 제품 코드(좁히기 보강), 환경 차이면 위 설정으로 해소되는지 확인.

정확한 GREEN 파일 집합은 **@vercel/node 의 실제 컴파일 설정 확인**(`vercel build` 재현) 이후 확정.

---

## 7. 로컬 build 가 API 오류를 놓치지 않게 하는 방법 (제안)

현재 `tsc -b` 는 `tsconfig.node.json`(node 타입) 으로 api 를 검사해 Vercel 과 환경이 달라 놓친다. 후보:

- **CI/로컬에 `vercel build`(deploy 아님) 단계 추가** — Vercel 과 동일한 @vercel/node 타입검사를 재현(가장 정확). 단 Vercel CLI 설치 필요.
- 또는 **api 전용 타입검사 스크립트** — Vercel 이 쓰는 환경(node 타입 로딩 여부)을 재현하는 tsc 호출을 build/CI 에 추가.
- 근본적으로 **@vercel/node 가 tsconfig.node.json 을 적용하도록 설정을 맞추면** 로컬 `tsc -b` 와 Vercel 결과가 수렴 → 놓침 자체가 사라짐(§6 GREEN 과 동일 경로).

---

## 8. 현재 Production 유지 가능 여부와 근거

- **유지 가능(롤백 불요)**. 근거(런타임 200 을 근거로 쓰지 않음):
  - Production `503e3d8` 빌드는 **Ready**(빌드 실패 아님) — Vercel 이 이 16 오류를 **빌드 차단으로 처리하지 않았다**(빌드 결과 사실).
  - `api/` 는 `6dca85d..503e3d8` 에서 **변경 0** → 이전 Production `6dca85d`(정상 운영) 과 api 타입검사 상태가 **동일**. 따라서 이 축에서 `503e3d8` 은 이전 대비 **무회귀**.
- 다만 **타입검사 gap 자체는 열려 있다**(api 함수의 타입 안전성이 Vercel 환경에서 검증되지 않음). 이는 잠재 위험(진짜 타입 결함이 무플래그로 배포될 수 있음)이며 GREEN 에서 닫는다. "선행·무회귀" 를 "수정 불필요" 로 해석하지 않는다.

---

## 9. 임시 RC-2 종료 문서(`docs/RC2_FINAL_CLOSURE_2026-07-24.md @ 7392308`)에서 정정할 문장

해당 문서는 **임시 보존본**이며 아래 §4.7 문장은 확정 근거가 없어 **인용·재사용 금지**. GREEN 후 후속 커밋으로 정정:

1. "`tsconfig types 해석 quirk`" 라는 원인 단정 → **정정**: 원인은 Vercel api 컴파일이 node 타입을 로드하지 않는 **환경/범위 차이([B]+[A]+[D])**. "quirk" 단정은 근거 부족.
2. "런타임 200이므로 비치명" 이라는 종결 → **삭제**. 200 을 타입오류 부재/비치명 근거로 쓰지 않는다. 비차단은 "빌드가 Ready 로 성공" 이라는 빌드 결과로만 서술.
3. "`DATA-QUALITY-DOMAIN-01` 로 이관" → **정정**: 이 건은 **BUILD-TYPECHECK-01** 로 별도 관리. `DATA-QUALITY-DOMAIN-01`(리소스별 품질보고서 식별)과 다른 항목.
4. "경고 1건 (미확인)" → **정정**: warning 은 vite chunk-size 로 **추정**(로컬 build 1 warning 일치), Vercel 원문 텍스트 미추출임을 명시.
5. "선행·비치명·RC-2 범위 밖" 서술이 "수정 불필요" 로 읽히지 않도록 → **정정**: 선행/무회귀는 롤백 불요의 근거일 뿐, 타입검사 gap 은 GREEN 에서 닫아야 함.

---

## 부록 — 미수행

push, Preview, main 병합, Production 재배포/롤백, RC-2 종료 문서 추가 수정, RC-3, 제품·API·설정·package.json 변경 — 모두 하지 않았다. 이 브랜치에 진단 문서 + 재현 스크립트 2개만 커밋한다.
