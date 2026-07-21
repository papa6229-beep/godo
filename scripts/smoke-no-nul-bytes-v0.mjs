/**
 * 텍스트 소스에 실제 U+0000 바이트가 없는지 검사 (위생 가드).
 *
 * 배경: 템플릿 문자열 구분자로 실제 NUL 바이트가 기록되면 grep/ripgrep이 해당 파일을
 *   **바이너리로 취급해 검색에서 통째로 건너뛴다.** 실제로 RC-1 감사 중
 *   marketingTemporalCrosstab.ts가 검색에 잡히지 않았고, A-1 작업 중에도 재발했다.
 *
 * 규칙: 런타임 구분자가 필요하면 소스에는 `\u0000` **이스케이프 형태**로 기록한다.
 *       (런타임 동작은 동일하고 파일은 텍스트로 유지된다)
 *
 * 실행: node scripts/smoke-no-nul-bytes-v0.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.yml', '.yaml']);
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', '.vercel', 'test', 'sessions', 'shot']);

// 정상적으로 NUL을 포함하는 생성 산출물(UTF-16 리포트 등)은 소스가 아니므로 제외한다.
// ※ 이 파일들은 저장소 정리 대상이기도 하다(루트 스크래치 산출물).
const EXCLUDE_FILES = new Set(['eslint_report.txt', 'eslint_report_utf8.txt']);

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (SOURCE_EXT.has(path.extname(entry).toLowerCase()) && !EXCLUDE_FILES.has(entry)) out.push(p);
  }
  return out;
};

const files = walk(process.cwd());
const offenders = [];
for (const f of files) {
  const buf = readFileSync(f);
  let count = 0;
  for (const byte of buf) if (byte === 0) count += 1;
  if (count > 0) offenders.push({ file: path.relative(process.cwd(), f), count });
}

console.log(`검사 파일 ${files.length}개 (확장자 ${[...SOURCE_EXT].join(' ')})`);
if (offenders.length === 0) {
  console.log('  PASS  실제 U+0000 바이트 0개');
  console.log('\n=== 결과: 1 pass / 0 fail ===');
  process.exit(0);
}
for (const o of offenders) console.log(`  FAIL  ${o.file} — NUL ${o.count}개`);
console.log(`\n=== 결과: 0 pass / ${offenders.length} fail ===`);
console.log('소스에는 실제 NUL 대신 \\u0000 이스케이프를 사용하세요.');
process.exit(1);
