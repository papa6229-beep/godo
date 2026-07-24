#!/usr/bin/env node
/*
 * scripts/smoke-build-typecheck-api-green-v0.mjs
 * BUILD-TYPECHECK-01 GREEN 검사 — API 함수 타입검사 기준선 복구
 *
 * RED-1(0777114)/RED-2(54c0c55)에서 확정한 원인:
 *   · api/** 가 진입점에서 최근접 tsconfig 로 **루트 솔루션 tsconfig** 를 선택
 *   · project references 미추적 → tsconfig.node.json 의 types:["node"] 미전달 (class A)
 *   · 빌더 fixConfig 가 module 미지정 시 strict:false → strictNullChecks off → 판별 유니온 좁히기 붕괴 (class B)
 *   · noEmitOnError 미설정 → 진단 있어도 배포 계속
 *
 * 이 검사는 api/tsconfig.json 이 다음을 만족하는지 잠근다. 파일이 없으면 그 이유로 실패한다.
 *   1) 모든 api 하위 .ts 의 최근접 tsconfig 가 api/tsconfig.json
 *   2) types 에 "node"
 *   3) strictNullChecks:true 명시
 *   4) module 명시(빌더 strict:false 기본 분기 회피)
 *   5) noEmitOnError:true
 *   6) 그 설정으로 전체 api 하위 .ts 타입검사 0 오류
 *
 * 로컬 설정·검사 GREEN 일 뿐, 실제 Vercel Preview GREEN(Build Log errors 0)은 별도 확인.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const API_TSCONFIG = path.join(REPO, 'api', 'tsconfig.json');

const walkTs = (dir) => {
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walkTs(p));
    else if (/\.(ts|tsx|mts|cts)$/.test(e)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
};
/** 진입점 dir 에서 REPO 까지 위로 걸으며 최근접 tsconfig.json 경로. */
const nearestTsconfig = (fileDir) => {
  let dir = fileDir;
  for (;;) {
    const cand = path.join(dir, 'tsconfig.json');
    if (existsSync(cand)) return cand.replace(/\\/g, '/');
    if (path.resolve(dir) === path.resolve(REPO)) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};
const readJsonc = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'));

let base = 0, basef = 0, met = 0, unmet = 0;
const B = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [BASE] ${n}${d ? `  — ${d}` : ''}`); ok ? base++ : basef++; };
const G = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [GRN ] ${n}${d ? `  — ${d}` : ''}`); ok ? met++ : unmet++; };
console.log('=== BUILD-TYPECHECK-01 GREEN — API 함수 타입검사 기준선 복구 ===');

const apiFiles = walkTs(path.join(REPO, 'api'));
B('B1. api/**/*.ts 존재', apiFiles.length > 0, `${apiFiles.length}개`);

// G1: api/tsconfig.json 존재 (없으면 이 이유로 RED)
const exists = existsSync(API_TSCONFIG);
G('G1. api/tsconfig.json 이 존재한다', exists, exists ? 'present' : '부재 — api/tsconfig.json 이 없어 api/** 가 루트 솔루션 tsconfig 를 선택한다(RED 원인)');

// G2: 모든 api 파일의 최근접 tsconfig 가 api/tsconfig.json
const wrong = apiFiles.map((f) => nearestTsconfig(path.dirname(f))).filter((c) => c !== API_TSCONFIG.replace(/\\/g, '/'));
G('G2. 모든 api/**/*.ts 의 최근접 tsconfig 가 api/tsconfig.json', wrong.length === 0,
  wrong.length === 0 ? `${apiFiles.length}개 전부` : `${wrong.length}개가 다른 설정 선택(현재 최근접=${wrong[0] ?? 'none'})`);

// G3~G6: 설정값
let opt = {};
if (exists) { try { opt = readJsonc(API_TSCONFIG).compilerOptions || {}; } catch (e) { opt = { __err: String(e) }; } }
const typesHasNode = Array.isArray(opt.types) && opt.types.includes('node');
G('G3. compilerOptions.types 에 "node"', typesHasNode, JSON.stringify(opt.types));
G('G4. compilerOptions.strictNullChecks === true (명시)', opt.strictNullChecks === true, `strictNullChecks=${opt.strictNullChecks} · strict=${opt.strict}`);
G('G5. compilerOptions.module 명시(빌더 strict:false 기본 분기 회피)', typeof opt.module === 'string' && opt.module.length > 0, `module=${opt.module} · moduleResolution=${opt.moduleResolution}`);
G('G6. compilerOptions.noEmitOnError === true (배포 안전장치)', opt.noEmitOnError === true, `noEmitOnError=${opt.noEmitOnError}`);
// 방향 옵션(참고): target/lib/skipLibCheck/esModuleInterop
G('G7. 방향 옵션: target ES2023 · lib ES2023 · moduleResolution NodeNext · skipLibCheck · esModuleInterop',
  /es2023/i.test(String(opt.target)) && (Array.isArray(opt.lib) && opt.lib.some((l) => /es2023/i.test(l))) && /nodenext/i.test(String(opt.moduleResolution)) && opt.skipLibCheck === true && opt.esModuleInterop === true,
  `target=${opt.target} lib=${JSON.stringify(opt.lib)} skipLibCheck=${opt.skipLibCheck} esModuleInterop=${opt.esModuleInterop}`);

// G8: 그 설정으로 전체 api 타입검사 0 오류
let apiErrs = 'N/A(설정 부재)';
if (exists) {
  try { execFileSync(process.execPath, [TSC, '-p', API_TSCONFIG, '--pretty', 'false'], { cwd: REPO, stdio: 'pipe' }); apiErrs = 0; }
  catch (e) { apiErrs = (e.stdout?.toString() || '').split('\n').filter((l) => /error TS\d/.test(l)).length; }
}
G('G8. tsc -p api/tsconfig.json 전체 api/** 0 오류', apiErrs === 0, `오류 ${apiErrs}건`);

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${base} pass / ${basef} fail`);
console.log(`[GRN ] ${met} met / ${unmet} unmet`);
if (basef > 0) { console.log('\n✗ 전제 불일치'); process.exit(1); }
if (unmet > 0) { console.log(`\n✗ ${unmet}건 미충족 (RED: api/tsconfig.json 기준선 미복구)`); process.exit(1); }
console.log('\n✓ GREEN — api/tsconfig.json 기준선 복구(로컬 설정·검사). 실제 Vercel Preview 확인은 별도.');
