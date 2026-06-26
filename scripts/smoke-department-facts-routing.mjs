#!/usr/bin/env node
/*
 * scripts/smoke-department-facts-routing.mjs
 * 팀별 역할 라우팅 검증(상품/CS=통계공급, 마케팅=분석/제안, 총괄=승인) + PII 경계.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-dfr-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'departmentFactsRouting.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
// 상대 import 확장자 보정 (Node ESM은 확장자 필요)
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const R = await import(pathToFileURL(path.join(tmp, 'departmentFactsRouting.js')).href);
const E = await import(pathToFileURL(path.join(tmp, 'analyticsQueryEngine.js')).href);

// ── 데이터셋 (engine smoke와 동형) ──
const yms = [];
for (let m = 7; m <= 12; m++) yms.push(`2025-${String(m).padStart(2, '0')}`);
for (let m = 1; m <= 6; m++) yms.push(`2026-${String(m).padStart(2, '0')}`);
const orders = [];
let idx = 0;
for (const ym of yms) for (let k = 0; k < 10; k++) {
  idx += 1;
  const goodsNo = idx % 2 === 0 ? '1001' : '1002';
  const rev = 10000 + (idx % 5) * 1000;
  let claim;
  if (idx % 7 === 0) claim = { hasClaim: true, claimTypes: ['refund'], claimAmount: rev };
  else if (idx % 13 === 0) claim = { hasClaim: true, claimTypes: ['return'], claimAmount: rev };
  orders.push({ orderNo: `${ym}-${k}`, orderDate: `${ym}-15 10:00:00`, totalAmount: rev + 2500, productRevenueByLines: rev, deliveryFee: 2500, paid: true, canceled: false, memberKey: `syn_member_${(idx % 20) + 1}`, paymentMethodCode: ['pc', 'gb', 'pn'][idx % 3], orderChannel: ['shop', 'naverpay'][idx % 2], claim, lines: [{ goodsNo, goodsName: goodsNo === '1001' ? '티셔츠' : '모자', quantity: 1 + (idx % 3), lineRevenue: rev, categoryCode: idx % 2 ? '003' : '004', brandCode: idx % 2 ? '001' : '002' }] });
}
const customers = Array.from({ length: 20 }, (_, i) => ({ memberKey: `syn_member_${i + 1}`, segment: ['new', 'returning', 'vip_candidate', 'dormant_risk', 'discount_sensitive', 'high_refund_risk'][i % 6], orderCount: 6, totalPaidAmount: 60000 }));
const reviews = Array.from({ length: 30 }, (_, i) => ({ memberKey: `syn_member_${(i % 20) + 1}`, goodsNo: i % 2 ? '1001' : '1002', categoryCode: i % 2 ? '003' : '004', rating: (i % 5) + 1, sentiment: ['positive', 'neutral', 'negative'][i % 3], topic: ['quality', 'delivery', 'price'][i % 3] }));
const inquiries = Array.from({ length: 25 }, (_, i) => ({ memberKey: `syn_member_${(i % 20) + 1}`, goodsNo: i % 2 ? '1001' : '1002', topic: ['delivery', 'refund', 'product_question'][i % 3], status: ['unanswered', 'answered', 'needs_human'][i % 3], urgency: ['low', 'medium', 'high'][i % 3] }));
const catalog = { categoriesByCode: { '003': { cateNm: '오나홀' }, '004': { cateNm: '개인가전' } }, brandsByCode: { '001': { brandNm: '스마트홈' }, '002': { brandNm: '리빙홈' } } };
const ds = { orders, customers, reviews, inquiries, catalog, source: { dataKind: 'synthetic', syntheticSource: 'commerce_universe_v1' } };
const fakeContacts = [{ customerId: 'cust_001', memberKey: 'syn_member_1', customerName: '가상고객 001', phone: '010-0000-0001', address: '서울시 테스트구 샘플로 1', origin: { isSynthetic: true, isFakePii: true, piiType: 'fake' } }];

const bundle = R.buildDepartmentFactsBundle(ds, { fakeContacts, generatedAt: '2026-06-26' });
const domOf = (m) => E.getAnalyticsMetric(m)?.domain;

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== Department Facts Routing v0 smoke ===');
const prodMetrics = bundle.productTeam.salesStatisticsPacket.map((p) => p.metric);
const prodDomains = prodMetrics.map(domOf);
ok('1. productTeam = sales/product/category/brand 통계만', prodDomains.every((d) => ['sales', 'product', 'category', 'brand'].includes(d)));
ok('2. productTeam에 review/inquiry/campaign/customerSegment 없음', !prodDomains.some((d) => ['review', 'cs', 'campaign', 'cohort', 'customer'].includes(d)));
const csMetrics = bundle.csTeam.customerIssuePacket.map((p) => p.metric);
const csDomains = csMetrics.map(domOf);
ok('3. csTeam = inquiry/review/claim/order issue 통계 포함', csMetrics.includes('inquiryCount') && csMetrics.includes('reviewAverageRating') && csMetrics.includes('claimRate') && csMetrics.includes('csIssueTopProducts'));
ok('4. csTeam에 campaign/마케팅 제안 없음', !csDomains.includes('campaign') && !('recommendationCandidates' in bundle.csTeam));
ok('5. marketingTeam이 productTeam.handoff를 받음', JSON.stringify(bundle.marketingTeam.receivedFromProductTeam) === JSON.stringify(bundle.productTeam.handoffToMarketing));
ok('6. marketingTeam이 csTeam.handoff를 받음', JSON.stringify(bundle.marketingTeam.receivedFromCsTeam) === JSON.stringify(bundle.csTeam.handoffToMarketing));
ok('7. recommendationCandidates는 마케팅팀만', bundle.marketingTeam.recommendationCandidates.length > 0 && !('recommendationCandidates' in bundle.productTeam) && !('recommendationCandidates' in bundle.csTeam));
ok('8. manager가 마케팅 제안을 approvalQueueCandidates로 받음', bundle.manager.approvalQueueCandidates.length === bundle.marketingTeam.recommendationCandidates.length && bundle.manager.approvalQueueCandidates.every((a) => a.type === 'marketing_recommendation' && a.requiresApproval === true));
const provJson = JSON.stringify(bundle.productTeam) + JSON.stringify(bundle.csTeam.customerIssuePacket);
ok('9. 상품팀/CS팀은 분석/제안 문장 없음', !/suggestedAction|rationale|recommendationCandidates/.test(provJson));
const nonCsJson = JSON.stringify(bundle.productTeam) + JSON.stringify(bundle.marketingTeam) + JSON.stringify(bundle.manager);
ok('10. fake PII는 CS팀에만', !/가상고객|010-0000|샘플로/.test(nonCsJson) && bundle.csTeam.fakeContacts && bundle.csTeam.fakeContacts[0].origin.isFakePii === true);

// 부가: requires_external_data 안내 + 결정적
ok('   마케팅 제안에 외부데이터 안내 포함', bundle.marketingTeam.recommendationCandidates.some((r) => (r.requiredData || []).length > 0));
ok('   deterministic', JSON.stringify(R.buildDepartmentFactsBundle(ds, { generatedAt: '2026-06-26' })) === JSON.stringify(R.buildDepartmentFactsBundle(ds, { generatedAt: '2026-06-26' })));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
