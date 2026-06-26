#!/usr/bin/env node
/*
 * scripts/smoke-synthetic-commerce-universe-activation.mjs
 * commerce_universe_v1 기본 승격 검증. (godomallResource는 fast-xml-parser transitively import →
 * pickSyntheticSource 정책은 미러로, universe 주문 계약/PII는 실제 generator로 검증.
 * route end-to-end는 배포 라이브 체크로 확인.)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-act-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'),
    '--outDir', tmp, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
const U = await import(pathToFileURL(path.join(tmp, 'syntheticCommerceUniverse.js')).href);

// (mirror) godomallResource.pickSyntheticSource — 기본 commerce_universe_v1
const pickSyntheticSource = (s) => (s === 'legacy' || s === 'godoRaw' ? s : 'commerce_universe_v1');

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const PII = ['customerName', 'receiverName', 'phone', 'email', 'address', 'claimData', 'orderInfoData'];

console.log('=== Synthetic Commerce Universe Activation v0 smoke ===');
ok('1. 기본(미지정) → commerce_universe_v1', pickSyntheticSource(undefined) === 'commerce_universe_v1');
ok('3. commerce_universe_v1 명시 정상', pickSyntheticSource('commerce_universe_v1') === 'commerce_universe_v1');
ok('4. godoRaw 명시 정상', pickSyntheticSource('godoRaw') === 'godoRaw');
ok('5. legacy 명시 정상', pickSyntheticSource('legacy') === 'legacy');

const u = U.buildSyntheticCommerceUniverse(products, { seed: 7, endDate: '2026-06-26' });
const orders = u.orders;
ok('2. 주문 수 Universe 범위(400~1500)', orders.length >= 400 && orders.length <= 1500);
ok('6. 대시보드 소비 revenue shape 유지', orders.every((o) => o.orderNo && o.orderDate && o.sourceType && o.state && Array.isArray(o.lines) && typeof o.totalAmount === 'number' && typeof o.productRevenueByLines === 'number'));
ok('7. RevenueOrder 기존 필드 유지', orders.every((o) => typeof o.deliveryFee === 'number' && typeof o.revenueMismatch === 'boolean' && o.sourceType === 'synthetic_test'));
ok('8. dataKind/syntheticSource=commerce_universe_v1', orders.every((o) => o.syntheticSource === 'commerce_universe_v1' && o.dataKind === 'synthetic'));
const json = JSON.stringify(orders);
ok('9. fake PII가 orders에 미포함', PII.every((k) => orders.every((o) => !(k in o) && o.lines.every((l) => !(k in l)))) && !json.includes('가상고객') && !json.includes('010-0000') && !json.includes('@example.test'));
// contact(별도 계약)엔 PII 존재해야 정상
ok('   contact 계약에는 fake PII 존재(분리 확인)', u.contacts.length > 0 && u.contacts.every((c) => c.phone && c.origin.isFakePii === true));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail (universe orders=${orders.length}) ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
