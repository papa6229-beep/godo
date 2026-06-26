#!/usr/bin/env node
/*
 * scripts/smoke-godomall-read-gateway.mjs
 *
 * api/godomall/read.ts(READ 게이트웨이)의 분기 정책을 실제 Registry 데이터로 검증한다.
 * read.ts의 의사결정을 미러한 decide()로 capability별 기대 HTTP status를 단언한다.
 * (IMPLEMENTED 집합은 read.ts의 READ_HANDLERS 키와 일치해야 한다 — code_search만)
 *
 * 실행: node scripts/smoke-godomall-read-gateway.mjs   (실패 시 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-gw-'));
try {
  execFileSync(
    process.execPath,
    [
      path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
      path.join(REPO, 'api', '_shared', 'godomallApiRegistry.ts'),
      '--ignoreConfig', '--outDir', tmp,
      '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'
    ],
    { stdio: 'pipe' }
  );
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
const reg = await import(pathToFileURL(path.join(tmp, 'godomallApiRegistry.js')).href);

// read.ts READ_HANDLERS 키와 일치(현재 code_search만 구현).
const IMPLEMENTED = new Set(['code_search']);

// read.ts 분기 정책 미러
const decide = (capability) => {
  if (!capability) return 'MISSING_CAPABILITY/400';
  const cap = reg.getGodomallApiCapability(capability);
  if (!cap) return 'UNKNOWN_CAPABILITY/400';
  if (cap.accessMode !== 'read' || cap.writeLocked) return 'FORBIDDEN/403';
  if (!IMPLEMENTED.has(capability)) return 'NOT_IMPLEMENTED/501';
  return 'SERVE/200';
};

let pass = 0;
let fail = 0;
const ok = (name, actual, expected) => {
  const good = actual === expected;
  console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name}  (got ${actual}, want ${expected})`);
  good ? pass++ : fail++;
};

console.log('=== Godomall READ gateway smoke ===');
// 1. capability 누락/미존재
ok('빈 capability → 400', decide(''), 'MISSING_CAPABILITY/400');
ok('미존재 capability → 400', decide('nonexistent_cap'), 'UNKNOWN_CAPABILITY/400');
// 2. 구현된 READ → serve
ok('code_search(구현 READ) → serve', decide('code_search'), 'SERVE/200');
// 3. 미구현 READ → 501
ok('category_search(미구현 READ) → 501', decide('category_search'), 'NOT_IMPLEMENTED/501');
ok('board_list(미구현 READ) → 501', decide('board_list'), 'NOT_IMPLEMENTED/501');
ok('goods_search(게이트웨이 미연결 READ) → 501', decide('goods_search'), 'NOT_IMPLEMENTED/501');
// 4. WRITE/writeLocked → 403
ok('goods_stock(WRITE) → 403', decide('goods_stock'), 'FORBIDDEN/403');
ok('order_status(WRITE) → 403', decide('order_status'), 'FORBIDDEN/403');
ok('board_reply(WRITE) → 403', decide('board_reply'), 'FORBIDDEN/403');

// 5. 모든 WRITE capability는 게이트웨이에서 403
const writes = reg.GODOMALL_API_CAPABILITIES.filter((c) => c.accessMode === 'write');
ok(`모든 WRITE(${writes.length}) → 403`, writes.every((c) => decide(c.id) === 'FORBIDDEN/403'), true);

// 6. 구현 핸들러는 전부 read & !writeLocked
ok(
  'IMPLEMENTED 핸들러는 read & !writeLocked',
  [...IMPLEMENTED].every((id) => {
    const c = reg.getGodomallApiCapability(id);
    return c && c.accessMode === 'read' && !c.writeLocked;
  }),
  true
);

// 7. Registry currentRoutes가 게이트웨이를 가리킴
const cap = reg.getGodomallApiCapability('code_search');
ok(
  'code_search currentRoutes → read.ts?capability=code_search',
  !!cap && (cap.currentRoutes || []).some((r) => r.includes('read.ts') && r.includes('code_search')),
  true
);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
