#!/usr/bin/env node
/*
 * scripts/smoke-c2-revenue-naming-user-surface-v0.mjs
 * RC-1 C-2 명칭 계약의 사용자·AI 노출 경로 폐쇄 회귀검증(실제 출력값 기준).
 *
 * 계약: 환불 미반영 유효주문 결제금액을 '총매출'·'순매출'로 표기하지 않는다.
 *   사용자/AI 노출 지점은 '운영매출'(또는 유효주문 결제금액)로 통일.
 * 검증 지점(실측 반환값):
 *   1) 마케팅 채팅 컨텍스트에 '운영매출' 표시, '총매출'·'순매출' 미표시
 *   2) departmentMetricContract operationalRevenue.basis에 '순매출' 없음
 *   3) marketingAnalysisFacts evidence(ev_total_revenue) label === '운영매출(결제완료·미취소)'
 *   4) REVENUE_METRIC_LABELS.netOrderRevenue.label === '운영매출' (미사용이라도 오용 방지)
 *      + computeNetOrderRevenue는 deprecated 별칭으로 보존(computeOperationalRevenue와 동일 함수)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'c2-name-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'c2-name-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'marketingTeamChatFacts.ts'),
    path.join(REPO, 'src', 'services', 'departmentMetricContract.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const C = await import(pathToFileURL(path.join(tmpSrc, 'marketingTeamChatFacts.js')).href);
const F = await import(pathToFileURL(path.join(tmpSrc, 'marketingAnalysisFacts.js')).href);
const R = await import(pathToFileURL(path.join(tmpSrc, 'revenueMetricContract.js')).href);
const D = await import(pathToFileURL(path.join(tmpSrc, 'departmentMetricContract.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== C-2 매출 명칭 사용자·AI 노출 폐쇄 smoke ===');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
const input = { orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') };

// 1) 마케팅 채팅 컨텍스트(실제 반환 텍스트)
const ctx = C.buildMarketingChatContext('최근 매출 어때?', input);
const note = String(ctx.contextNote ?? '');
ok('1. 채팅 컨텍스트에 "운영매출" 표시', /운영매출/.test(note));
ok('2. 채팅 컨텍스트에 "총매출"·"순매출" 미표시', !/총매출/.test(note) && !/순매출/.test(note));

// 3) departmentMetricContract operationalRevenue.basis / description
const opRev = D.OPERATIONAL_METRIC_LABELS?.operationalRevenue ?? {};
const basis = String(opRev.basis ?? '');
const opDesc = String(opRev.description ?? '');
ok('3. operationalRevenue.basis·description에 "순매출" 없음', basis.length > 0 && !/순매출/.test(basis) && !/순매출/.test(opDesc));

// 4) marketingAnalysisFacts evidence
const facts = F.buildMarketingAnalysisFacts(input);
const evTotal = (facts.evidence ?? []).find((e) => e.id === 'ev_total_revenue');
ok('4. evidence ev_total_revenue.label === "운영매출(결제완료·미취소)"', !!evTotal && evTotal.label === '운영매출(결제완료·미취소)');
ok('   evidence 라벨에 "총매출"·"순매출" 없음', !!evTotal && !/총매출|순매출/.test(evTotal.label));

// 5) REVENUE_METRIC_LABELS.netOrderRevenue.label + deprecated 별칭 보존
ok('5. REVENUE_METRIC_LABELS.netOrderRevenue.label === "운영매출"', R.REVENUE_METRIC_LABELS?.netOrderRevenue?.label === '운영매출');
ok('6. computeNetOrderRevenue deprecated 별칭 보존(= computeOperationalRevenue)', typeof R.computeNetOrderRevenue === 'function' && R.computeNetOrderRevenue === R.computeOperationalRevenue);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
