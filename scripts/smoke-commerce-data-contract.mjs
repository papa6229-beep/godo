#!/usr/bin/env node
/*
 * scripts/smoke-commerce-data-contract.mjs
 *
 * Commerce Data Contract v0 검증: RevenueOrder 가산 분석필드 + memberKey 가명화 +
 * claimSummary 축약 + raw/PII 미노출 + legacy 유지.
 * (godomallResource는 fast-xml-parser를 transitively import → tmp emit 부적합 →
 *  pickSyntheticSource 기본정책은 미러로, 데이터 보장은 실제 생성기/mapper로 검증.
 *  default flip의 end-to-end는 배포 라이브 체크로 확인.)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-cdc-'));
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const emit = (f) =>
  execFileSync(process.execPath, [tscBin, path.join(REPO, f), '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'),
    '--outDir', tmp, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
try {
  emit('api/_shared/syntheticGodomallOrders.ts'); // → godomallRevenue/mapper/normalize/types 함께 emit
  emit('api/_shared/syntheticRevenue.ts');
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
const rev = await import(pathToFileURL(path.join(tmp, 'godomallRevenue.js')).href);
const synRaw = await import(pathToFileURL(path.join(tmp, 'syntheticGodomallOrders.js')).href);
const synLegacy = await import(pathToFileURL(path.join(tmp, 'syntheticRevenue.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const PII_KEYS = ['customerName', 'receiverName', 'phone', 'email', 'address', 'orderName', 'orderCellPhone', 'orderAddress', 'claimData', 'orderInfoData'];

console.log('=== Commerce Data Contract v0 smoke ===');

// (mirror) 기본 source 정책 — godomallResource.pickSyntheticSource 와 동일
const pickSyntheticSource = (s) => (s === 'legacy' ? 'legacy' : 'godoRaw');
ok('1. 기본(미지정) → godoRaw', pickSyntheticSource(undefined) === 'godoRaw');
ok('2. legacy 명시 → legacy 유지', pickSyntheticSource('legacy') === 'legacy');
ok('   godoRaw 명시 → godoRaw', pickSyntheticSource('godoRaw') === 'godoRaw');

// godoRaw 경로 (기본) — 분석필드 보존
const orders = synRaw.buildSyntheticRevenueOrdersFromGodomallRaw(products, { orderCount: 300, endDate: '2026-06-26' });
ok('3. godoRaw orders 생성', orders.length > 0);
const withMember = orders.filter((o) => o.memberKey);
ok('4. memberKey 생성(syn_member_*)', withMember.length > 0 && withMember.every((o) => o.memberKey.startsWith('syn_member_')));
ok('6. settleKind/paymentMethodCode 보존', orders.some((o) => o.settleKind && o.paymentMethodCode === o.settleKind));
ok('7. isFirstPurchase 보존(boolean)', orders.some((o) => typeof o.isFirstPurchase === 'boolean'));
ok('   orderChannel 보존', orders.some((o) => typeof o.orderChannel === 'string' && o.orderChannel));
ok('   dataKind=synthetic', orders.every((o) => o.dataKind === 'synthetic'));
const claimed = orders.filter((o) => o.claimSummary && o.claimSummary.hasClaim);
ok('8. claimSummary 축약 존재(취소/반품/교환)', claimed.length > 0 && claimed.every((o) => Array.isArray(o.claimSummary.claimTypes)));
ok('9. raw claimData 미노출(주문/라인에 claimData 키 없음)', orders.every((o) => !('claimData' in o) && o.lines.every((l) => !('claimData' in l))));
ok('5. real PII 키 미포함', orders.every((o) => PII_KEYS.every((k) => !(k in o))));
ok('   기존 필드 유지(orderNo/productRevenueByLines/state/lines/sourceType)', orders.every((o) => o.orderNo && typeof o.productRevenueByLines === 'number' && o.state && Array.isArray(o.lines) && o.sourceType === 'synthetic_test'));

// real 모드 memberKey 가명화 + claimSummary (raw 픽스처)
const realRaw = {
  orderNo: 'R1', memNo: '88123', memId: 'realuser88', firstSaleFl: 'y', settleKind: 'pc', orderChannelFl: 'shop',
  totalGoodsPrice: '19000', totalDeliveryCharge: '2500', settlePrice: '21500',
  paymentDt: '2026-06-01 10:00:00', cancelDt: '',
  orderGoodsData: [{ goodsNo: '1001', goodsCd: 'A-1001', goodsNm: '티셔츠', goodsCnt: '1', goodsPrice: '19000', orderStatus: 'r3',
    claimData: { handleMode: 'b', handleCompleteFl: 'y', refundPrice: '19000', handleReason: '단순변심' } }]
};
const realOrders = rev.mapOrdersToRevenue([realRaw], rev.buildProductIndex(products), 'real_godomall');
const ro = realOrders[0];
ok('real: memberKey 가명 해시(real_member_*)', ro.memberKey && ro.memberKey.startsWith('real_member_'));
ok('real: memberKey에 원문 memNo/memId 미포함', !ro.memberKey.includes('88123') && !ro.memberKey.includes('realuser88'));
ok('real: claimSummary 반품 감지', ro.claimSummary && ro.claimSummary.hasClaim && ro.claimSummary.claimTypes.includes('return'));
ok('real: claimAmount 합산', ro.claimSummary && ro.claimSummary.claimAmount === 19000);
ok('real: raw claimData/PII 미노출', !('claimData' in ro) && ro.lines.every((l) => !('claimData' in l)) && PII_KEYS.every((k) => !(k in ro)));
ok('real: dataKind=real', ro.dataKind === 'real');
ok('real: isFirstPurchase=true(firstSaleFl=y)', ro.isFirstPurchase === true);

// legacy 유지
const legacy = synLegacy.generateSyntheticRevenueOrders(products, { orderCount: 50 });
ok('10. legacy generateSyntheticRevenueOrders 유지', legacy.length > 0 && legacy.every((o) => o.orderNo && o.sourceType === 'synthetic_test'));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
