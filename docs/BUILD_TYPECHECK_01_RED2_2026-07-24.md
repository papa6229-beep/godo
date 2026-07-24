# BUILD-TYPECHECK-01 RED-2 — Vercel 실제 빌더 재현·원인 확정

**작성일** 2026-07-24
**브랜치** `fix/build-typecheck-api-functions-01` (main `503e3d8`), RED-1 커밋 `0777114` 보존
**상태** RED-2 (원인 **확정**, 제품·API·설정·package.json·package-lock 변경 0)
**재현 스크립트** `scripts/smoke-build-typecheck-api-red2-v0.mjs` (1 BASE / 6 RED met)

> RED-1 정정: RED-1 의 `types:[]` 인공 컴파일은 "Node 타입이 없으면 같은 종류 오류가 난다"만 증명했다(원인 확정 아님). RED-2 는 **실제 빌더 @vercel/node 의 소스에서 도출한 정확한 유효 옵션**으로 재현해 원인을 확정한다. "런타임 200" 을 근거로 쓰지 않는다. "선행" 과 "수정 불필요" 를 구분한다.

---

## 1. 실제 빌더 경로 (task A)

- 로컬 Vercel CLI **50.37.3**, 번들 **`@vercel/node` 5.6.22** (`vercel build --debug` 첫 줄 "Vercel CLI 50.37.3" 로 확인). 로컬 TypeScript **6.0.3**(Vercel 로그 "Using TypeScript 6.0.3 (local user-provided)" 와 동일).
- **Production 클라우드 빌드의 정확한 CLI 버전은 Build Log 에서 추출하지 못했다**(가상화 로그 + 브라우저 도구 콘텐츠 필터). 아래 재현은 로컬 50.37.3/@vercel/node 5.6.22 기준이며, 재현 오류가 Vercel 로그와 **행·열까지 일치**해 동일 빌더 동작으로 강하게 판단(단, 클라우드 버전 동일성은 미확정 잔여).

### `@vercel/node` 5.6.22 소스 근거 (`node_modules/vercel/node_modules/@vercel/node/dist/index.js`)

| 동작 | 코드 근거 |
|---|---|
| 진입점에서 **가장 가까운 tsconfig** 선택 | `walkParentDirs({ start: entryDir, filename: "tsconfig.json" })` (L71160) · `detectConfig(): ts.findConfigFile(options.project=entrypoint)` (L70207) |
| 그 tsconfig 의 **자체 compilerOptions 만** 읽음(references 미추적) | `readConfig(): config = ts.readConfigFile(configFileName).config` (L70223) |
| 옵션 병합 | `config.compilerOptions = Object.assign({}, config.compilerOptions, options.compilerOptions, TS_NODE_COMPILER_OPTIONS)` (L70237) |
| module 미지정 시 기본값에 **strict=false** | `fixConfig(): if (compilerOptions.module === undefined) { module="NodeNext"; moduleResolution="NodeNext"; strict=false }` (L70309) |
| 진단은 출력하되 **noEmitOnError 아니면 throw 안 함** → 배포 Ready | `reportTSError(diagnostics, config.options.noEmitOnError)` · `shouldExit ? throw NowBuildError : console.error(message)` (L70073) |

**핵심**: `api/**` 진입점에서 위로 걸으면 `api/tsconfig.json` 이 없어 **루트 `tsconfig.json`** 을 고른다. 루트는 솔루션 파일(`files:[]`, `references:[...]`, **compilerOptions 없음**)이라 `tsconfig.node.json` 의 `types:["node"]`·`strict` 계열이 **함수 빌더에 전달되지 않는다**(references 미추적). → 사용자 가설 A.3 **확정**.

도출된 **유효 compilerOptions**: `{ target:ES2021, module/moduleResolution:NodeNext, esModuleInterop:true, strict:false }` (types 없음, lib 없음, skipLibCheck 없음).

---

## 2. Vercel 실제 빌드 재현 시도 (task B) — 중단·보고

- 실행: **`vercel build --prod --debug`** (로컬 빌드, deploy/promote 아님).
- **종료코드 1**, 출력: `status: error, reason: project_settings_required` — `vercel pull`(Production 프로젝트 설정·환경변수 다운로드, 인증 필요)을 요구.
- 지시에 따라 **임의 pull 하지 않고 이 지점에서 중단**. 인증·Production env 다운로드는 수행하지 않음.
- 안전 조건 충족: `package.json`/`package-lock.json` **해시 실행 전후 동일**(`806b44e5…` / `d3cf4a2d…`), `.vercel/output` 미생성, 비밀값·토큰·서명 URL 미출력, 작업 트리 clean.
- 클라우드 실빌드는 재현하지 못했으므로, 대신 **@vercel/node 소스에서 도출한 정확한 유효 옵션을 로컬 tsc(6.0.3)로 재현**(§3). (task C 의 "실빌드 재현 시 …" 조건은 이 로컬 정확-옵션 재현으로 대체.)

---

## 3. 재현 결과 (정확한 유효 옵션, 로컬)

명령: 위 유효 옵션으로 `tsc -p <임시 config>`, 대상 3개 오류 파일 + 그 import 그래프. (임시 config 는 `node_modules/.cache` 에만.)

| 코드 | 수 | 대표 위치(Vercel 로그와 일치) |
|---|---|---|
| TS2591 | 16 | `detailImageFetch.ts` node:dns/promises(18)·Buffer(139/182/330)·process(256) · `godomallOpenApiClient.ts` process(31–34) · `proxyResponse.ts` http(1) · `secretGuard.ts` process(25/34–37) · `godomall/[resource].ts` http(1) |
| TS2552 | 2 | `detailImageFetch.ts` Buffer(341/345) "Did you mean 'buffer'?" |
| TS2339 | 3 | `detailImageFetch.ts(288,44)` 'error' · `(288,65)` 'status' on `TargetCheck` · `marketingBehaviorCollectionValidator.ts(179,43)` 'reason' on 유니온 |

- Vercel 로그의 직접 확인분(288 status·330/341/345 Buffer·[resource]:1 http·179 reason)과 **행·열 일치**.
- **숫자 단정 주의(RED-1 #2 정정)**: Vercel 배지 "16 errors" 와 여기 TS2591 16 은 **동일 집합이라고 단정하지 않는다**. @vercel/node 는 함수별로 컴파일하므로 진입점마다 그래프·중복이 달라 배지 카운트와 3-파일-그래프 카운트는 다를 수 있다. 여기서 확정하는 것은 **오류 위치 집합과 원인**이지 카운트 동일성이 아니다.

---

## 4. baseline·실험별 결과표 (한 변수씩)

| 설정 | TS2591/2552(class A) | TS2339(class B) |
|---|---|---|
| 저장소 `tsconfig.node.json` 옵션(=`tsc -b`, 전체 api) | 0 | 0 |
| 저장소 node 옵션, 3-파일 격리 | 0 | 0 |
| **@vercel/node 유효 옵션**(strict:false, types 없음) | **재현** | **재현(3)** |
| 유효 옵션 + `types:["node"]` | **0** | 3 (잔존) |
| 유효 옵션 + `types:["node"]` + `strictNullChecks:true` | 0 | **0** |
| 저장소 node 옵션(strict **UNSET**) | 0 | **0** |
| 저장소 node 옵션 + `strict:false` | 0 | **3** |
| moduleResolution(bundler/node16/nodenext)·lib·target·skipLibCheck·verbatimModuleSyntax·moduleDetection 토글 | (A는 node타입만이 좌우) | 변화 없음(B는 strictNullChecks만이 좌우) |

---

## 5. 오류별 확정 원인 (task C·D)

- **class A — Buffer/process/http/node: (TS2591/2552)** = **Node 타입 로딩 차이 + tsconfig 선택 차이 + 함수별 격리 컴파일 + 로컬 검사 범위 누락**. 확정 근거: 유효 옵션에 `types:["node"]` 만 넣으면 A가 **전부 소멸**(§4). 원인은 @vercel/node 가 루트 솔루션 tsconfig 를 골라 `tsconfig.node.json` 의 `types:["node"]` 를 적용하지 못함(§1 소스).
- **class B — TargetCheck.status/error, validateEvent.reason (TS2339)** = **`strict:false`(strictNullChecks off)**. 확정 근거: node 타입을 넣어도 잔존, **`strictNullChecks:true` 로만 소멸**; 저장소 node 옵션(strict unset)=0 인데 **`strict:false` 만 추가하면 재현**(§4, strict:false 가 유일 flipper). @vercel/node `fixConfig` 가 module 미지정 시 `strict=false` 를 강제(§1 소스). 즉 판별 유니온 좁히기(`if(!check.ok)`, `if(r.ok)`)가 strictNullChecks 없이는 좁혀지지 않는다.
- **배포 Ready 조건** = `noEmitOnError` 미설정 → @vercel/node 가 진단을 `console.error` 로 출력만 하고 throw 하지 않음(§1 소스). 로그엔 오류가 뜨지만 빌드는 성공.
- **TS 버전 차이 아님**(6.0.3 동일), **증분 캐시 아님**(`tsc -b --force` 통과).

---

## 6. GREEN 최소 변경 파일 (지금 실행하지 않음)

원인 확정에 따른 최소 변경(설정 위주, GREEN 에서 검증):

- **`api/tsconfig.json`(신규)** — @vercel/node 의 `walkParentDirs` 가 진입점(`api/…`)에서 위로 걸을 때 **루트보다 먼저** 이 파일을 고르게 한다. 내용에 **`types:["node"]`**(class A 해소) + **`strictNullChecks:true`**(또는 `strict:true`, class B 해소) + 명시적 `module`(그래야 `fixConfig` 의 `strict=false` 강제 분기를 타지 않음) 을 자기완결적으로 둔다.
  - 근거: §4 에서 `types:["node"] + strictNullChecks:true` 로 전체 api 0 오류 확인(G1). 각 옵션의 필요 이유 — `types:["node"]`=Node 전역 해석(A), `strictNullChecks`=판별 유니온 좁히기(B), 명시적 `module`=@vercel/node fixConfig 가 strict 를 다시 false 로 덮지 않게.
- 대안: 루트 `tsconfig.json` 에 compilerOptions 노출 — 단 루트는 솔루션 파일이라 `tsc -b` 동작에 영향 → **부작용 위험**. `api/tsconfig.json` 신규가 더 국소적.
- **주의(미검증 잔여)**: @vercel/node 의 `readConfig` 옵션 병합·`fixConfig` 상호작용에서 새 `api/tsconfig.json` 이 실제로 적용되는지는 **실빌드(`vercel build`)로 최종 확인 필요**(인증 필요로 이번엔 미실행). GREEN 착수 시 실빌드로 검증.
- TS2339 를 코드로도 견고화할지(예: `if (check.ok === false)` 명시 좁히기)는 GREEN 정책 결정 사항 — 설정 보정만으로 해소되므로 필수는 아님.

---

## 7. 로컬 검사가 Vercel과 같은 문제를 잡게 하는 회귀검사 (task D)

- **가장 정확**: CI/로컬에 `vercel build`(deploy 아님) 단계 추가 — @vercel/node 로 api 함수를 실제 타입검사(인증/설정 pull 필요).
- **경량 대체**: 이 RED-2 재현 스크립트처럼 **@vercel/node 유효 옵션(root-tsconfig-선택 + strict:false)** 을 흉내낸 tsc 검사를 build/CI 에 추가 → 로컬에서 A·B 를 잡는다.
- **근본**: `api/tsconfig.json` 신규(§6)로 로컬 `tsc -b`(tsconfig.node.json)와 Vercel 함수 빌더가 **같은 유효 설정**을 보게 하면 결과가 수렴 → 놓침 자체 소멸.

---

## 8. 현재 Production 유지 가능 여부

- **유지 가능(롤백 불요)**. 근거(런타임 200 미사용): ① `503e3d8` 빌드는 **Ready**(@vercel/node 가 `noEmitOnError` 미설정으로 진단을 non-fatal 처리, §1 소스). ② `6dca85d..503e3d8` api 변경 0 → 이전 Production 과 동일 상태·무회귀.
- 단 **타입검사 gap 은 열려 있다**(api 함수가 Vercel 환경에서 node 타입·strictNullChecks 없이 검사되어, 진짜 타입 결함이 무플래그로 지나갈 수 있음). GREEN 에서 닫는다. "선행·무회귀 = 수정 불필요" 아님.

---

## 9. 임시 RC-2 종료 문서(`docs/RC2_FINAL_CLOSURE_2026-07-24.md @ 7392308`) 정정 문장

임시 보존본. §4.7 정정(확정 원인 반영):

1. "`tsconfig types 해석 quirk`" 단정 → **정정**: @vercel/node 가 진입점에서 **루트 솔루션 tsconfig 를 선택**해 `tsconfig.node.json` 의 `types:["node"]`·`strict` 를 적용하지 못함(references 미추적) + `fixConfig` 가 `strict:false` 강제. quirk 가 아니라 **빌더의 확정적 설정 선택**.
2. "런타임 200이므로 비치명" → **삭제**. 비차단은 "`noEmitOnError` 미설정으로 @vercel/node 가 진단을 출력만" 이라는 **빌더 동작**으로 서술.
3. "`DATA-QUALITY-DOMAIN-01` 이관" → **정정**: **BUILD-TYPECHECK-01** 로 별도 관리(리소스별 품질보고서와 별개).
4. "경고 1건 미확인" → **정정**: warning 은 vite chunk-size 로 추정(로컬 build warning 1건과 일치), Vercel 원문 미추출 명시.
5. "선행·비치명·범위 밖" 이 "수정 불필요" 로 읽히지 않게 → **정정**: gap 은 GREEN(설정 보정)으로 닫는다.

## 10. RED-1(0777114) 대비 갱신
- RED-1 은 class A 를 인공 `types:[]` 로 "확정" 표현, class B 를 "미재현·미확정" 으로 남김. RED-2 는 **실제 빌더 소스 + 정확 옵션 재현**으로 A·B **모두 확정**하고, class B 원인을 **strict:false** 로 특정. RED-1 커밋은 amend 하지 않고 보존, 본 문서가 최신 판정.

---

## 부록 — warning 확보 실패 사유·미수행

- warning 원문: Production Build Log 108줄이 가상화 리스트 + 브라우저 도구 콘텐츠 필터로 안전 추출 불가. 로컬 `npm run build` 는 warning 정확히 1건(`Some chunks are larger than 500 kB`)이라 그것으로 추정(단정 아님).
- 미수행: push, Preview, main 병합, Production 재배포/롤백, 기존 커밋(0777114) amend, RC-2 종료 문서 수정, RC-3, 제품·API·설정·package.json·package-lock 변경.
