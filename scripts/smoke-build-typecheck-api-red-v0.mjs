#!/usr/bin/env node
/*
 * scripts/smoke-build-typecheck-api-red-v0.mjs
 * BUILD-TYPECHECK-01 — Vercel Production Build-log 16 오류 RED 진단·재현
 *
 * 배경: Production `PBhDtWrFy`(Source 503e3d8) Build Log 가 api/ 서버리스 함수에서
 *   16 errors / 1 warning 을 보고했는데, 로컬 `npm run build`(tsc -b && vite build)는
 *   exit 0 으로 통과한다. 왜 로컬이 놓치는지, 무엇이 Vercel 에서만 재현되는지를 잠근다.
 *
 * **제품·API·설정·package.json 을 한 줄도 고치지 않는다(RED 전용).**
 *   진단은 저장소의 로컬 tsc 만 사용하며(패키지 설치·업그레이드 없음), 임시 tsconfig 는
 *   node_modules/.cache 아래에만 쓴다.
 *
 * 핵심 가설(잠금 대상):
 *   A) 로컬 `tsc -b`(=tsconfig.node.json)는 api/** 를 **node 타입 포함·전체 프로젝트**로
 *      한 번에 검사 → Node 전역(Buffer/process/node:)이 해석되어 통과한다.
 *   B) Vercel 의 api 함수 컴파일은 **Node 타입 없이(DOM/web 전역만)** 검사 → Node 전역이
 *      해석되지 않아 실패한다(Buffer/http/process/node:).
 *   C) 따라서 로컬 build 는 구조적으로 이 오류를 볼 수 없다.
 *   D) TS2339 좁히기 오류(status/reason)는 로컬 어떤 조합으로도 재현되지 않는다(Vercel 전용).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd().replace(/\\/g, '/');
const tsc = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'btc01-'));

/** tsc 실행 → { code, out } (오류 라인 배열 포함). config 파일 또는 -p 경로. */
const runTsc = (args) => {
  try {
    const out = execFileSync(process.execPath, [tsc, ...args, '--pretty', 'false'], { cwd: REPO, stdio: 'pipe' }).toString();
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout?.toString() || '') + (e.stderr?.toString() || '') };
  }
};
const errLines = (out) => out.split('\n').filter((l) => /error TS\d/.test(l));
const codeOf = (l) => (l.match(/error (TS\d+)/) || [])[1];

// 임시 진단 config 작성기(저장소 파일은 건드리지 않는다).
const writeCfg = (name, opts, filesOrInclude) => {
  const p = path.join(tmp, name);
  writeFileSync(p, JSON.stringify({ compilerOptions: opts, ...filesOrInclude }, null, 2));
  return p;
};
const baseOpts = {
  target: 'es2023', module: 'esnext', skipLibCheck: true, moduleResolution: 'bundler',
  allowImportingTsExtensions: true, moduleDetection: 'force', noEmit: true, incremental: false
};
const ERR_FILES = [
  `${REPO}/api/_shared/detailImageFetch.ts`,
  `${REPO}/api/_shared/marketingBehaviorCollectionValidator.ts`,
  `${REPO}/api/godomall/[resource].ts`
];

let met = 0, unmet = 0, base = 0, basef = 0;
const R = (n, ok, detail) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${detail ? `  — ${detail}` : ''}`); ok ? met++ : unmet++; };
const B = (n, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [BASE] ${n}${detail ? `  — ${detail}` : ''}`); ok ? base++ : basef++; };

console.log('=== BUILD-TYPECHECK-01 — api 타입검사 환경 차이 RED 진단 ===');

// ── BASE: 로컬 도구 사실 ───────────────────────────────────────────────────
const ver = runTsc(['--version']).out.trim();
B('B1. 로컬 TypeScript 는 6.x (Vercel 로그 "Using TypeScript 6.0.3" 와 동일 계열)', /Version 6\./.test(ver), ver);

// ── RED: 로컬 build 가 api 오류를 놓친다(전체 프로젝트 + node 타입) ─────────
const nodeProj = runTsc(['-p', 'tsconfig.node.json']);
R('R1. 로컬 `tsc -p tsconfig.node.json`(=tsc -b 대상, node 타입·전체 api 프로젝트)는 0 오류로 통과',
  nodeProj.code === 0 && errLines(nodeProj.out).length === 0,
  `exit=${nodeProj.code} · 오류 ${errLines(nodeProj.out).length}건 (→ 로컬 build 는 api 오류를 못 본다)`);

const appProj = runTsc(['-p', 'tsconfig.app.json']);
R('R2. 로컬 `tsc -p tsconfig.app.json`(src/, RC-2 범위)도 0 오류 — 결함은 src/ 아님',
  appProj.code === 0 && errLines(appProj.out).length === 0,
  `src/ 오류 ${errLines(appProj.out).length}건`);

// ── RED: Node 타입을 뺀 격리 컴파일에서만 Vercel 의 Node-전역 오류가 재현된다 ─
const noNodeCfg = writeCfg('no-node.json', { ...baseOpts, lib: ['ES2023', 'DOM'], types: [] }, { files: ERR_FILES });
const noNode = runTsc(['-p', noNodeCfg]);
const nn = errLines(noNode.out);
const hasBuffer = nn.some((l) => /detailImageFetch\.ts\(330,/.test(l) && /'Buffer'/.test(l))
  && nn.some((l) => /detailImageFetch\.ts\(341,/.test(l)) && nn.some((l) => /detailImageFetch\.ts\(345,/.test(l));
const hasHttp = nn.some((l) => /\[resource\]\.ts\(1,/.test(l) && /'http'/.test(l));
const hasProcess = nn.some((l) => /'process'/.test(l));
const hasNodeColon = nn.some((l) => /node:/.test(l));
R('R3. Node 타입 제외 + DOM lib 격리 컴파일에서 Vercel 의 Node-전역 오류가 그대로 재현(Buffer 330/341/345 · http · process · node:)',
  hasBuffer && hasHttp && hasProcess && hasNodeColon,
  `Buffer 330/341/345=${hasBuffer} · http=${hasHttp} · process=${hasProcess} · node:=${hasNodeColon} · 총 ${nn.length}건`);

const webGlobalErr = nn.some((l) => /'URL'|'fetch'|'AbortController'|'setTimeout'|'clearTimeout'/.test(l));
R('R4. 같은 격리 컴파일에서 web 전역(URL/fetch/AbortController)은 오류 없음 — Vercel 로그와 동일한 선택적 집합(Node만 실패, web은 통과)',
  !webGlobalErr,
  webGlobalErr ? 'web 전역 오류 발생(Vercel 과 불일치)' : 'web 전역 오류 0 → DOM lib 이 web 전역 제공(Vercel 일치)');

// ── RED: TS2339 좁히기(status/reason)는 로컬 어떤 조합으로도 재현 안 됨 ──────
const strictNoNode = runTsc(['-p', writeCfg('strict-nonode.json', { ...baseOpts, lib: ['ES2023', 'DOM'], types: [], strict: true }, { files: ERR_FILES })]);
const ts2339_local = [nodeProj, noNode, strictNoNode].flatMap((r) => errLines(r.out)).filter((l) => /TS2339/.test(l)).length;
R('R5. TS2339 좁히기 오류(TargetCheck.status / validateEvent.reason)는 로컬(node타입·격리·strict) 어떤 조합에서도 재현되지 않음 → Vercel @vercel/node 전용',
  ts2339_local === 0,
  `로컬 TS2339 ${ts2339_local}건 (Vercel 로그엔 존재 · 로컬 재현 0 → vercel build/@vercel/node 필요, Vercel CLI 미설치로 미확정)`);

// ── 요약 ────────────────────────────────────────────────────────────────────
console.log('');
console.log('  --- 재현된 Node-전역 오류 원문(격리·no-node) ---');
nn.slice(0, 40).forEach((l) => console.log('   ' + l.replace(REPO + '/', '').replace(/\. Do you need.*$/, '')));
console.log('');
console.log('  --- 코드별 집계(no-node 격리) ---');
const byCode = {};
for (const l of nn) { const c = codeOf(l); byCode[c] = (byCode[c] || 0) + 1; }
console.log('   ' + JSON.stringify(byCode));

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${base} pass / ${basef} fail`);
console.log(`[RED ] ${met} met / ${unmet} unmet`);
rmSync(tmp, { recursive: true, force: true });
if (basef > 0) { console.log('\n✗ 전제 불일치'); process.exit(1); }
if (unmet > 0) { console.log(`\n✗ ${unmet}건 미충족`); process.exit(1); }
console.log('\n✓ RED 잠금 성립 — 로컬 build 는 통과(R1), 결함은 src/ 아님(R2), Node타입 제외 격리에서만 재현(R3),');
console.log('  web 전역은 통과(R4), TS2339 좁히기는 로컬 미재현(R5, Vercel 전용).');
