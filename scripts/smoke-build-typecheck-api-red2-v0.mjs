#!/usr/bin/env node
/*
 * scripts/smoke-build-typecheck-api-red2-v0.mjs
 * BUILD-TYPECHECK-01 RED-2 — Vercel 실제 빌더(@vercel/node) 재현·원인 확정
 *
 * RED-1(0777114)의 인공 `types:[]` 컴파일은 "Node 타입이 없으면 같은 종류의 오류가 난다"만
 * 증명했다. RED-2 는 **실제 빌더 @vercel/node 5.6.22(로컬 Vercel CLI 50.37.3 번들)의 소스에서
 * 도출한 정확한 유효 컴파일 옵션**으로 두 오류 계열(A·B)을 로컬 재현하고, 원인을 확정한다.
 *
 * **제품·API·설정·package.json 변경 없음.** 로컬 tsc(6.0.3)만 사용, 임시 tsconfig 는
 * node_modules/.cache 에만 쓴다.
 *
 * @vercel/node 소스 근거(dist/index.js):
 *   - detectConfig(): ts.findConfigFile(entrypoint) → 진입점에서 위로 걸어 **가장 가까운 tsconfig**.
 *     api/** 는 api/tsconfig.json 이 없으므로 **루트 tsconfig.json** 을 고른다.
 *   - readConfig(): ts.readConfigFile(root).config — 루트의 **자체 compilerOptions 만** 읽는다.
 *     루트는 솔루션 파일(files:[], references:[...], compilerOptions 없음)이라 tsconfig.node.json 의
 *     types:["node"] 가 **적용되지 않는다**(project references 를 따라가지 않음).
 *   - fixConfig(): module 미지정 → module/moduleResolution="NodeNext", **strict=false**,
 *     target=ES2021, esModuleInterop=true. (types/lib/skipLibCheck 없음)
 *   - reportTSError(diag, config.options.noEmitOnError): noEmitOnError 미설정 → throw 안 함,
 *     console.error 로 출력만 → **배포는 Ready**.
 *
 * 유효 옵션(위 도출) = { target:ES2021, module/moduleResolution:NodeNext, esModuleInterop:true,
 *                       strict:false, (types 없음, lib 없음, skipLibCheck 없음) }
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'btc01r2-'));

const ERR_FILES = [
  `${REPO}/api/_shared/detailImageFetch.ts`,
  `${REPO}/api/_shared/marketingBehaviorCollectionValidator.ts`,
  `${REPO}/api/godomall/[resource].ts`
];
const runCfg = (opts, sel = { files: ERR_FILES }) => {
  const p = path.join(tmp, `c-${Math.abs(JSON.stringify(opts).length + (sel.include ? 9 : 0))}-${Object.keys(opts).length}.json`);
  writeFileSync(p, JSON.stringify({ compilerOptions: opts, ...sel }));
  try { execFileSync(process.execPath, [TSC, '-p', p, '--pretty', 'false'], { cwd: REPO, stdio: 'pipe' }); return []; }
  catch (e) { return (e.stdout?.toString() || '').split('\n').filter((l) => /error TS\d/.test(l)); }
};
const codeCount = (lines) => lines.reduce((m, l) => { const c = (l.match(/error (TS\d+)/) || [])[1]; m[c] = (m[c] || 0) + 1; return m; }, {});

// @vercel/node 유효 옵션(소스 도출)
const VNODE = { target: 'ES2021', module: 'nodenext', moduleResolution: 'nodenext', esModuleInterop: true, strict: false, noEmit: true };
// 저장소 실제 node 프로젝트 옵션(=`tsc -b` 대상)
const NODEJSON = { target: 'es2023', lib: ['ES2023'], module: 'esnext', types: ['node'], skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, verbatimModuleSyntax: true, moduleDetection: 'force', noEmit: true };

let met = 0, unmet = 0, base = 0, basef = 0;
const R = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${d ? `  — ${d}` : ''}`); ok ? met++ : unmet++; };
const B = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [BASE] ${n}${d ? `  — ${d}` : ''}`); ok ? base++ : basef++; };
console.log('=== BUILD-TYPECHECK-01 RED-2 — @vercel/node 유효 옵션 재현·원인 확정 ===');

// BASE: 로컬 정상 경로는 통과
const nodeReal = runCfg(NODEJSON, { include: [`${REPO}/api/**/*`] });
B('B1. 저장소 tsconfig.node.json 옵션(=`tsc -b` 대상)으로 전체 api 검사 → 0 오류(로컬 정상)', nodeReal.length === 0, `${nodeReal.length}건`);

// RED A: @vercel/node 유효 옵션에서 Node-전역 오류 재현(class A)
const vn = runCfg(VNODE);
const cc = codeCount(vn);
R('A1. @vercel/node 유효 옵션 재현: Node-전역 오류(TS2591/2552, Buffer/process/http/node:) 발생',
  (cc.TS2591 || 0) >= 16 && vn.some((l) => /detailImageFetch\.ts\(330,/.test(l)) && vn.some((l) => /\[resource\]\.ts\(1,.*'http'/.test(l)),
  `TS2591=${cc.TS2591 || 0} · TS2552=${cc.TS2552 || 0} (Vercel 로그 Buffer 330/341/345·http 행·열 일치)`);

// RED B: 같은 옵션에서 TS2339 좁히기(class B) 재현 — Vercel 로그와 동일 위치
R('A2. 같은 옵션에서 TS2339 좁히기 재현: TargetCheck.status(288) · validateEvent.reason(179)',
  (cc.TS2339 || 0) >= 3 && vn.some((l) => /detailImageFetch\.ts\(288,65\).*'status'/.test(l)) && vn.some((l) => /marketingBehaviorCollectionValidator\.ts\(179,/.test(l) && /'reason'/.test(l)),
  `TS2339=${cc.TS2339 || 0} (Vercel 로그와 위치 일치)`);

// 원인 확정 C: class A = node 타입 부재 → types:["node"] 추가로 TS2591/2552 소멸
const vnTypes = runCfg({ ...VNODE, types: ['node'] });
const ccT = codeCount(vnTypes);
R('B1. class A 원인 확정 = node 타입 부재: 유효 옵션 + types:["node"] → TS2591/2552 = 0 (class A 소멸)',
  (ccT.TS2591 || 0) === 0 && (ccT.TS2552 || 0) === 0,
  `잔여 TS2591=${ccT.TS2591 || 0} TS2552=${ccT.TS2552 || 0} · TS2339=${ccT.TS2339 || 0}(잔존)`);

// 원인 확정 D: class B = strict:false(strictNullChecks off). node 타입 추가해도 잔존, strictNullChecks 로만 소멸
const vnTypesSNC = runCfg({ ...VNODE, types: ['node'], strictNullChecks: true });
const nodeStrictFalse = runCfg({ ...NODEJSON, strict: false });
R('B2. class B 원인 확정 = strict:false(strictNullChecks off): node 타입만으론 TS2339 잔존, strictNullChecks:true 로만 0',
  (codeCount(vnTypes).TS2339 || 0) >= 3 && (codeCount(vnTypesSNC).TS2339 || 0) === 0,
  `+node타입: TS2339=${codeCount(vnTypes).TS2339 || 0} · +strictNullChecks: TS2339=${codeCount(vnTypesSNC).TS2339 || 0}`);
R('B3. 대조: 저장소 node 옵션(strict UNSET)=0, 여기에 strict:false 만 넣으면 TS2339 재현 → strict:false 가 유일 flipper',
  (codeCount(runCfg(NODEJSON, { files: ERR_FILES })).TS2339 || 0) === 0 && (codeCount(nodeStrictFalse).TS2339 || 0) >= 3,
  `node(strict unset) TS2339=0 · node+strict:false TS2339=${codeCount(nodeStrictFalse).TS2339 || 0}`);

// GREEN 가설 확인: 유효 옵션 + node 타입 + strictNullChecks → 전체 api 0
const green = runCfg({ ...VNODE, types: ['node'], strictNullChecks: true }, { include: [`${REPO}/api/**/*`] });
R('G1. GREEN 가설: @vercel/node 유효 옵션 + node타입 + strictNullChecks → 전체 api 0 오류',
  green.length === 0, `${green.length}건 (설정 보정만으로 A·B 모두 해소)`);

console.log('');
console.log('  --- 재현된 고유 오류(유효 옵션, 코드별) ---');
console.log('   ' + JSON.stringify(cc));
console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${base} pass / ${basef} fail`);
console.log(`[RED ] ${met} met / ${unmet} unmet`);
rmSync(tmp, { recursive: true, force: true });
if (basef > 0) { console.log('\n✗ 전제 불일치'); process.exit(1); }
if (unmet > 0) { console.log(`\n✗ ${unmet}건 미충족`); process.exit(1); }
console.log('\n✓ RED-2 확정 — class A=node 타입 부재(B1), class B=strict:false(B2/B3), 설정 보정으로 전부 해소(G1).');
