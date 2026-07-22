#!/usr/bin/env node
/*
 * scripts/smoke-analytics-query-engine.mjs
 * Analytics Query Engine v0 검증 (metric 계산·기간필터·supportLevel·PII격리·deterministic).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-aqe-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'analyticsQueryEngine.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
// 상대 import에 .js 확장자 보강(analyticsQueryEngine → ./revenueMetricContract 등 ESM 해석용).
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const E = await import(pathToFileURL(path.join(tmp, 'analyticsQueryEngine.js')).href);
const run = E.runAnalyticsQuery;

// ── 결정적 데이터셋 (12개월, 회원 재구매, 클레임, 리뷰, 문의) ──
const yms = [];
for (let m = 7; m <= 12; m++) yms.push(`2025-${String(m).padStart(2, '0')}`);
for (let m = 1; m <= 6; m++) yms.push(`2026-${String(m).padStart(2, '0')}`);
const PM = ['pc', 'gb', 'pn'];
const CH = ['shop', 'naverpay'];
const orders = [];
let idx = 0;
for (const ym of yms) {
  for (let k = 0; k < 10; k++) {
    idx += 1;
    const member = `syn_member_${(idx % 20) + 1}`;
    const goodsNo = idx % 2 === 0 ? '1001' : '1002';
    const cate = idx % 2 === 0 ? '003' : '004';
    const brand = idx % 2 === 0 ? '001' : '002';
    const rev = 10000 + (idx % 5) * 1000;
    let claim;
    if (idx % 7 === 0) claim = { hasClaim: true, claimTypes: ['refund'], claimAmount: rev };
    else if (idx % 11 === 0) claim = { hasClaim: true, claimTypes: ['cancel'] };
    else if (idx % 13 === 0) claim = { hasClaim: true, claimTypes: ['return'], claimAmount: rev };
    else if (idx % 17 === 0) claim = { hasClaim: true, claimTypes: ['exchange'] };
    orders.push({
      orderNo: `${ym}-${k}`, orderDate: `${ym}-15 10:00:00`, totalAmount: rev + 2500, productRevenueByLines: rev,
      deliveryFee: 2500, paid: true, canceled: !!(claim && claim.claimTypes[0] === 'cancel'),
      memberKey: member, paymentMethodCode: PM[idx % 3], orderChannel: CH[idx % 2], claim,
      lines: [{ goodsNo, goodsName: goodsNo === '1001' ? '티셔츠' : '모자', quantity: 1 + (idx % 3), lineRevenue: rev, categoryCode: cate, brandCode: brand }]
    });
  }
}
const customers = Array.from({ length: 20 }, (_, i) => ({ memberKey: `syn_member_${i + 1}`, segment: ['new', 'returning', 'vip_candidate', 'dormant_risk', 'discount_sensitive', 'high_refund_risk'][i % 6], orderCount: 6, totalPaidAmount: 60000 }));
const reviews = Array.from({ length: 30 }, (_, i) => ({ memberKey: `syn_member_${(i % 20) + 1}`, goodsNo: i % 2 ? '1001' : '1002', categoryCode: i % 2 ? '003' : '004', brandCode: i % 2 ? '001' : '002', rating: (i % 5) + 1, sentiment: ['positive', 'neutral', 'negative'][i % 3], topic: ['quality', 'delivery', 'price'][i % 3] }));
const inquiries = Array.from({ length: 25 }, (_, i) => ({ memberKey: `syn_member_${(i % 20) + 1}`, goodsNo: i % 2 ? '1001' : '1002', categoryCode: i % 2 ? '003' : '004', topic: ['delivery', 'refund', 'product_question'][i % 3], status: ['unanswered', 'answered', 'needs_human'][i % 3], urgency: ['low', 'medium', 'high'][i % 3] }));
const catalog = { categoriesByCode: { '003': { cateNm: '오나홀' }, '004': { cateNm: '개인가전' } }, brandsByCode: { '001': { brandNm: '스마트홈' }, '002': { brandNm: '리빙홈' } } };
const ds = { orders, customers, reviews, inquiries, catalog, source: { dataKind: 'synthetic', syntheticSource: 'commerce_universe_v1' } };
const q = (metric, extra = {}) => run(ds, { metric, ...extra });

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== Analytics Query Engine v0 smoke ===');
ok('1. monthly revenue', (() => { const r = q('revenue'); return r.ok && r.rows.length === 12 && r.summary.total > 0; })());
ok('2. monthly averageOrderValue', (() => { const r = q('averageOrderValue'); return r.ok && r.rows.length === 12 && r.rows[0].value > 0; })());
ok('3. monthly orderCount = 유효주문(paid·미취소)만 (C-2)', (() => { const r = q('orderCount'); const expectedValid = orders.filter((o) => o.paid && !o.canceled).length; const sum = r.rows.reduce((s, x) => s + x.value, 0); return r.ok && r.rows.length === 12 && sum === expectedValid && r.rows.every((x) => x.value <= 10 && x.value > 0); })());
ok('4. product unitCount ranking', (() => { const r = q('productUnitCount'); return r.ok && r.groupBy === 'product' && r.rows.length === 2 && r.rows[0].value >= r.rows[1].value; })());
ok('5. categoryRevenue (label)', (() => { const r = q('categoryRevenue'); return r.ok && r.rows.some((x) => x.label === '오나홀' || x.label === '개인가전'); })());
ok('6. brandRevenue (label)', (() => { const r = q('brandRevenue'); return r.ok && r.rows.some((x) => x.label === '스마트홈' || x.label === '리빙홈'); })());
ok('7. paymentMethodRevenue', (() => { const r = q('paymentMethodRevenue'); return r.ok && r.rows.length === 3; })());
ok('8. orderChannelRevenue', (() => { const r = q('orderChannelRevenue'); return r.ok && r.rows.length === 2; })());
ok('9. customerSegmentRevenue', (() => { const r = q('customerSegmentRevenue'); return r.ok && r.rows.length >= 5 && r.supportLevel === 'synthetic_only'; })());
ok('10. repurchaseRate 0..1', (() => { const r = q('repurchaseRate'); return r.ok && r.rows[0].value > 0 && r.rows[0].value <= 1; })());
ok('11. purchaseFrequency', (() => { const r = q('purchaseFrequency'); return r.ok && r.rows[0].value > 1; })());
ok('12. claim/refund/cancel rate', (() => { const a = q('claimRate'); const b = q('refundRate'); const c = q('cancelRate'); return a.ok && b.ok && c.ok && a.rows[0].value > 0 && b.rows[0].value >= 0; })());
ok('13. reviewAverageRating', (() => { const r = q('reviewAverageRating'); return r.ok && r.rows[0].value >= 1 && r.rows[0].value <= 5; })());
ok('14. reviewSentimentShare', (() => { const r = q('reviewSentimentShare'); return r.ok && r.rows.length === 3 && r.rows.reduce((s, x) => s + x.value, 0) === 30; })());
ok('15. inquiryCount', (() => { const r = q('inquiryCount'); return r.ok && r.rows[0].value === 25; })());
ok('16. inquiryTopicBreakdown', (() => { const r = q('inquiryTopicBreakdown'); return r.ok && r.rows.length === 3; })());
ok('17. refundRiskProducts', (() => { const r = q('refundRiskProducts'); return r.ok && r.rows.length >= 1; })());
ok('18. repurchaseCandidateProducts', (() => { const r = q('repurchaseCandidateProducts'); return r.ok && r.rows.length === 2 && r.rows[0].customerCount > 0; })());
ok('19. period filter excludes out-of-range', (() => { const r = q('revenue', { startDate: '2025-07-01', endDate: '2025-09-30' }); return r.ok && r.rows.length === 3 && r.rows.every((x) => x.key >= '2025-07' && x.key <= '2025-09'); })());
ok('20. no_data only when 0건', (() => { const r = q('revenue', { startDate: '2030-01-01', endDate: '2030-12-31' }); return r.ok === false && r.rows.length === 0; })());
ok('21. requires_external_data (adRoas)', (() => { const r = q('adRoas'); return r.ok === false && r.supportLevel === 'requires_external_data' && (r.requiredData || []).includes('adSpend'); })());
ok('22. chartHint 반환', (() => { const r = q('categoryRevenue'); return !!r.chartHint && !!r.chartHint.type; })());
ok('23. fake PII 미포함', (() => { const all = ['revenue', 'paymentMethodRevenue', 'customerSegmentRevenue', 'repurchaseCandidateProducts', 'reviewAverageRating', 'inquiryCount'].map((m) => JSON.stringify(q(m))).join(' '); return !/가상고객|010-0000|@example\.test|샘플로/.test(all); })());
ok('24. deterministic', JSON.stringify(q('revenue')) === JSON.stringify(q('revenue')));
ok('25. registry broad + getAnalyticsMetric', E.listAnalyticsMetrics().length >= 50 && !!E.getAnalyticsMetric('revenue') && E.getAnalyticsMetric('adRoas').supportLevel === 'requires_external_data');

console.log(`\n=== 결과: ${pass} pass / ${fail} fail (orders=${orders.length}, metrics=${E.listAnalyticsMetrics().length}) ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
