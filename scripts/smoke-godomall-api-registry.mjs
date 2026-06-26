#!/usr/bin/env node
/*
 * scripts/smoke-godomall-api-registry.mjs
 *
 * api/_shared/godomallApiRegistry.ts(실제 모듈)를 로컬 tsc로 emit 후 import하여 검증한다.
 * (registry는 외부 import가 없어 단독 emit 가능 → .ts→.js 미러 없이 실 데이터 검증)
 *
 * 실행: node scripts/smoke-godomall-api-registry.mjs   (실패 시 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-reg-'));
try {
  execFileSync(
    process.execPath,
    [
      path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
      path.join(REPO, 'api', '_shared', 'godomallApiRegistry.ts'),
      '--ignoreConfig',
      '--outDir', tmp,
      '--module', 'nodenext',
      '--moduleResolution', 'nodenext',
      '--target', 'ES2022',
      '--skipLibCheck'
    ],
    { stdio: 'pipe' }
  );
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}

const mod = await import(pathToFileURL(path.join(tmp, 'godomallApiRegistry.js')).href);
const caps = mod.GODOMALL_API_CAPABILITIES;

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? pass++ : fail++;
};

console.log(`=== Godomall API Registry smoke (${caps.length} capabilities) ===`);

// 1. id 중복 없음
const ids = caps.map((c) => c.id);
ok('id 중복 없음', new Set(ids).size === ids.length);

// 2. 필수 필드 존재
ok(
  '모든 capability에 domain/nameKo/accessMode/implementationStatus 존재',
  caps.every((c) => c.domain && c.nameKo && c.accessMode && c.implementationStatus)
);

// 3. WRITE API는 requiresApproval && writeLocked
const writes = caps.filter((c) => c.accessMode === 'write');
ok(
  `모든 WRITE API(${writes.length})는 requiresApproval=true`,
  writes.every((c) => c.requiresApproval === true)
);
ok(
  `모든 WRITE API(${writes.length})는 writeLocked=true`,
  writes.every((c) => c.writeLocked === true)
);
ok(
  '모든 WRITE API status=write_locked',
  writes.every((c) => c.implementationStatus === 'write_locked')
);

// 4. done/partial API에는 currentRoutes 또는 currentSharedFiles
const impl = caps.filter((c) => c.implementationStatus === 'done' || c.implementationStatus === 'partial');
ok(
  `done/partial API(${impl.length})에 currentRoutes 또는 currentSharedFiles 기록`,
  impl.every((c) => (c.currentRoutes && c.currentRoutes.length) || (c.currentSharedFiles && c.currentSharedFiles.length))
);

// 5. 상품조회 → Products READ 파일 연결
const goods = mod.getGodomallApiCapability('goods_search');
ok(
  'goods_search → godomallMapper.ts 연결',
  !!goods && (goods.currentSharedFiles || []).some((f) => f.includes('godomallMapper'))
);

// 6. 주문조회 → Order_Search/orders-revenue 연결
const order = mod.getGodomallApiCapability('order_search');
ok(
  'order_search → orders-revenue.ts 연결',
  !!order && (order.currentRoutes || []).some((r) => r.includes('orders-revenue'))
);

// 7. PII high API는 notes에 '프론트 직접 호출 금지' 포함
const high = caps.filter((c) => c.piiRisk === 'high');
ok(
  `PII high API(${high.length})는 notes에 '프론트 직접 호출 금지' 포함`,
  high.every((c) => (c.notes || '').includes('프론트 직접 호출 금지'))
);

// 8. rateLimitSensitive 필드 누락 없음
ok(
  'rateLimitSensitive 필드 누락 없음(boolean)',
  caps.every((c) => typeof c.rateLimitSensitive === 'boolean')
);

// 9. 헬퍼 동작
ok('listReadReadyGodomallApis 비어있지 않음', mod.listReadReadyGodomallApis().length > 0);
ok('listWriteLockedGodomallApis 비어있지 않음', mod.listWriteLockedGodomallApis().length > 0);
ok('listGodomallApisByDomain("board") > 0', mod.listGodomallApisByDomain('board').length > 0);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail (caps=${caps.length}) ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
