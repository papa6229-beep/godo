#!/usr/bin/env node
/*
 * scripts/run-regression.mjs
 * 정식 회귀검사 러너 — `npm test` 의 smoke 구간.
 *
 * 규칙(헌법·마스터 계획 A2):
 *   - 실행 대상은 scripts/regression-manifest.json 의 include 목록이다(파일명 하드코딩).
 *   - **현재 통과하는 검사를 사유 없이 제외하지 않는다.** 제외하려면 exclude 에
 *     { file, reason } 을 명시해야 하고, 이 러너가 그 목록을 출력한다.
 *   - manifest 에 없는 새 smoke 파일이 발견되면 경고하고 **비정상 종료**한다
 *     (검사를 추가하고 manifest 에 등록하지 않는 것을 막는다).
 *   - 하나라도 실패하면 비정상 종료한다.
 *
 * 사용:
 *   node scripts/run-regression.mjs              정식 실행
 *   node scripts/run-regression.mjs --discover   현재 통과하는 검사로 manifest 초안 생성
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO = process.cwd();
const SCRIPTS_DIR = path.join(REPO, 'scripts');
const MANIFEST_PATH = path.join(SCRIPTS_DIR, 'regression-manifest.json');
const DISCOVER = process.argv.includes('--discover');
const PER_TEST_TIMEOUT_MS = 300000;

const discoverFiles = () =>
  readdirSync(SCRIPTS_DIR).filter((f) => /^smoke-.*\.mjs$/.test(f)).sort();

const runOne = (file) => {
  const started = Date.now();
  try {
    execFileSync(process.execPath, [path.join(SCRIPTS_DIR, file)], {
      cwd: REPO, stdio: 'pipe', timeout: PER_TEST_TIMEOUT_MS
    });
    return { file, ok: true, ms: Date.now() - started };
  } catch (e) {
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '') || e.message || '';
    const why = out.split('\n').filter((l) => /FAIL|실패|Error|error/.test(l)).slice(0, 3).join(' | ');
    return { file, ok: false, ms: Date.now() - started, why: why || '(출력 없음)' };
  }
};

const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

// ── discover: 현재 통과하는 검사로 manifest 초안 작성 ─────────────────────────
if (DISCOVER) {
  const files = discoverFiles();
  console.log(`[discover] ${files.length}개 검사 실행 중…`);
  const results = files.map((f) => { const r = runOne(f); console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${f} (${fmt(r.ms)})`); return r; });
  const pass = results.filter((r) => r.ok).map((r) => r.file);
  const fail = results.filter((r) => !r.ok);
  const manifest = {
    note: '정식 회귀검사 목록. include 의 검사는 npm test 에서 반드시 통과해야 한다. 현재 통과하는 검사를 사유 없이 exclude 로 옮기지 않는다.',
    generatedAt: new Date().toISOString().slice(0, 10),
    include: pass,
    exclude: fail.map((r) => ({ file: r.file, reason: 'discover 시점 실패 — 사유 확인 후 include 로 옮기거나 사유를 구체화할 것' }))
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n[discover] include ${pass.length} / exclude ${fail.length} → ${path.relative(REPO, MANIFEST_PATH)} 기록`);
  for (const r of fail) console.log(`  EXCLUDE ${r.file}  ${r.why}`);
  process.exit(0);
}

// ── 정식 실행 ────────────────────────────────────────────────────────────────
if (!existsSync(MANIFEST_PATH)) {
  console.error(`[regression] manifest 없음: ${path.relative(REPO, MANIFEST_PATH)}`);
  console.error(`             먼저 'node scripts/run-regression.mjs --discover' 로 생성하십시오.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const include = Array.isArray(manifest.include) ? manifest.include : [];
const exclude = Array.isArray(manifest.exclude) ? manifest.exclude : [];
const excludeFiles = new Set(exclude.map((x) => x.file));

// manifest 에 등록되지 않은 새 검사 탐지(검사 추가 후 등록 누락 방지)
const onDisk = discoverFiles();
const unregistered = onDisk.filter((f) => !include.includes(f) && !excludeFiles.has(f));
const missing = include.filter((f) => !onDisk.includes(f));

console.log(`[regression] manifest include ${include.length} · exclude ${exclude.length}`);
if (exclude.length) {
  console.log('[regression] 제외된 검사(사유 필수):');
  for (const x of exclude) console.log(`  - ${x.file}  ← ${x.reason || '(사유 없음)'}`);
}

const started = Date.now();
const results = include.map((f) => {
  const r = runOne(f);
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${f} (${fmt(r.ms)})${r.ok ? '' : `\n        ${r.why}`}`);
  return r;
});
const failed = results.filter((r) => !r.ok);
const total = Date.now() - started;

console.log(`\n[regression] ${results.length - failed.length}/${results.length} 통과 · 소요 ${fmt(total)}`);

let bad = false;
if (missing.length) { console.error(`[regression] manifest 에 있으나 파일이 없음: ${missing.join(', ')}`); bad = true; }
if (unregistered.length) {
  console.error(`[regression] manifest 에 등록되지 않은 검사 ${unregistered.length}개: ${unregistered.join(', ')}`);
  console.error(`             검사를 추가했으면 manifest 의 include 에 등록하십시오.`);
  bad = true;
}
if (failed.length) { console.error(`[regression] 실패 ${failed.length}건`); bad = true; }

process.exit(bad ? 1 : 0);
