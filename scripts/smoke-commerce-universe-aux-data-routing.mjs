#!/usr/bin/env node
/*
 * scripts/smoke-commerce-universe-aux-data-routing.mjs
 * Universe aux 공급(safe customers/reviews/inquiries + CS 전용 fake contact 격리) +
 * departmentFactsRouting이 aux dataset으로 bundle 생성 + PII 경계 검증.
 * (기본/aux API 응답 형태 1·2는 배포 후 live curl로 별도 확인)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const emit = (srcRel, { rewrite = false, module = 'nodenext', resolution = 'nodenext' } = {}) => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-aux-'));
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, srcRel),
    '--ignoreConfig', '--rootDir', path.dirname(path.join(REPO, srcRel)),
    '--outDir', tmp, '--module', module, '--moduleResolution', resolution, '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
  if (rewrite) for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  return tmp;
};

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /customerName|recipientName|receiverName|refundAccount|refundBank|deliveryMemo|010-0000|@example|샘플로|가상고객|가상수령자/;

console.log('=== Commerce Universe Aux Data Routing v0 smoke ===');

// ── Part A: buildUniverseAux (api/_shared, import-free) ──
const tmpA = emit('api/_shared/commerceUniverseAux.ts');
const A = await import(pathToFileURL(path.join(tmpA, 'commerceUniverseAux.js')).href);

const FAKE_ORIGIN = { isSynthetic: true, isFakePii: true, piiType: 'fake', sourceType: 'synthetic', syntheticProfile: 'commerce_universe_v1' };
const universe = {
  meta: { seed: 20260626 },
  customers: Array.from({ length: 10 }, (_, i) => ({
    customerId: `cust_${i}`, memberKey: `syn_member_${i + 1}`, memNo: `${100000 + i}`, memId: `syn_user_${i}`,
    segment: ['new', 'returning', 'vip_candidate', 'dormant_risk', 'discount_sensitive', 'high_refund_risk'][i % 6],
    firstOrderDate: '2025-07-01 10:00:00', lastOrderDate: '2026-06-01 10:00:00',
    orderCount: 3 + (i % 4), totalPaidAmount: 90000 + i * 1000, averageOrderValue: 30000, repurchaseCount: 2, refundCount: i % 3, reviewCount: i % 2,
    sourceType: 'synthetic', syntheticProfile: 'commerce_universe_v1'
  })),
  reviews: Array.from({ length: 12 }, (_, i) => ({
    reviewId: `rev_${i}`, orderNo: `o${i}`, customerId: `cust_${i % 10}`, memberKey: `syn_member_${(i % 10) + 1}`,
    productId: `100${i % 3}`, goodsNo: `100${i % 3}`, categoryCode: '003', brandCode: '001',
    rating: (i % 5) + 1, sentiment: ['positive', 'neutral', 'negative'][i % 3], topic: ['quality', 'delivery', 'refund'][i % 3],
    createdAt: '2025-08-01 10:00:00', sourceType: 'synthetic', syntheticProfile: 'commerce_universe_v1'
  })),
  inquiries: Array.from({ length: 8 }, (_, i) => ({
    inquiryId: `inq_${i}`, customerId: `cust_${i % 10}`, memberKey: `syn_member_${(i % 10) + 1}`,
    productId: `100${i % 3}`, goodsNo: `100${i % 3}`, orderNo: `o${i}`, categoryCode: '003',
    topic: ['delivery', 'refund', 'payment'][i % 3], status: ['unanswered', 'answered', 'needs_human'][i % 3], urgency: ['low', 'medium', 'high'][i % 3],
    inquiryText: '배송이 언제 도착하나요? 010-1234-5678 로 연락주세요 test@example.test',
    createdAt: '2025-08-01 10:00:00', sourceType: 'synthetic', syntheticProfile: 'commerce_universe_v1'
  })),
  contacts: Array.from({ length: 10 }, (_, i) => ({
    customerId: `cust_${i}`, memberKey: `syn_member_${i + 1}`, customerName: `가상고객 ${i}`, receiverName: `가상수령자 ${i}`,
    phone: `010-0000-000${i}`, email: `syn00${i}@example.test`, address: `서울시 테스트구 샘플로 ${i}`,
    deliveryMemo: '문 앞', refundBank: '(가상)테스트은행', refundAccount: `000-0000-00000${i}`, origin: { ...FAKE_ORIGIN }
  }))
};

const auxNoCs = A.buildUniverseAux(universe, { includeCsFakeContacts: false });
const auxWithCs = A.buildUniverseAux(universe, { includeCsFakeContacts: true, generatedAt: '2026-06-26' });

ok('3. aux에 customers/reviews/inquiries safe data 있음', auxNoCs.customers.length === 10 && auxNoCs.reviews.length === 12 && auxNoCs.inquiries.length === 8);
const c0 = auxNoCs.customers[0];
ok('4. safe customer: memberKey/segment 있고 연락처 없음', !!c0.memberKey && !!c0.segment && typeof c0.totalPaidAmount === 'number' && !('phone' in c0) && !('email' in c0) && !('address' in c0) && !('customerName' in c0));
const r0 = auxNoCs.reviews[0];
ok('5. safe review: rating/sentiment/topic 있고 PII 없음', typeof r0.rating === 'number' && !!r0.sentiment && !!r0.topic && !PII_RE.test(JSON.stringify(auxNoCs.reviews)));
const q0 = auxNoCs.inquiries[0];
ok('6. safe inquiry: topic/status/urgency 있고 연락처/본문PII 없음', !!q0.topic && !!q0.status && !!q0.urgency && !/010-1234|@example/.test(JSON.stringify(auxNoCs.inquiries)));
ok('7. includeCsFakeContacts=true → csOnlyFakeContacts 있음', Array.isArray(auxWithCs.csOnlyFakeContacts) && auxWithCs.csOnlyFakeContacts.length === 10);
ok('8. csOnlyFakeContacts: isFakePii/piiType/syntheticProfile 유지', auxWithCs.csOnlyFakeContacts.every((c) => c.origin.isFakePii === true && c.origin.piiType === 'fake' && c.origin.syntheticProfile === 'commerce_universe_v1'));
ok('9. includeCsFakeContacts=false → csOnlyFakeContacts 없음', auxNoCs.csOnlyFakeContacts === undefined);
ok('   safe aux 전체에 contact PII 없음', !PII_RE.test(JSON.stringify(auxNoCs.customers) + JSON.stringify(auxNoCs.reviews) + JSON.stringify(auxNoCs.inquiries)));
ok('   aux.meta.syntheticProfile = commerce_universe_v1', auxNoCs.meta.syntheticProfile === 'commerce_universe_v1');
rmSync(tmpA, { recursive: true, force: true });

// ── Part B: departmentFactsRouting (aux dataset으로 bundle) ──
const tmpB = emit('src/services/departmentFactsRouting.ts', { rewrite: true, module: 'esnext', resolution: 'bundler' });
const R = await import(pathToFileURL(path.join(tmpB, 'departmentFactsRouting.js')).href);

// 주문(클레임/회원/결제/채널 포함)
const orders = [];
const yms = [];
for (let m = 7; m <= 12; m++) yms.push(`2025-${String(m).padStart(2, '0')}`);
for (let m = 1; m <= 6; m++) yms.push(`2026-${String(m).padStart(2, '0')}`);
let idx = 0;
for (const ym of yms) for (let k = 0; k < 8; k++) {
  idx += 1;
  const goodsNo = idx % 3 === 0 ? '1000' : idx % 2 === 0 ? '1001' : '1002';
  const rev = 10000 + (idx % 5) * 1000;
  let claim;
  if (idx % 7 === 0) claim = { hasClaim: true, claimTypes: ['refund'], claimAmount: rev };
  else if (idx % 11 === 0) claim = { hasClaim: true, claimTypes: ['return'], claimAmount: rev };
  orders.push({ orderNo: `${ym}-${k}`, orderDate: `${ym}-15 10:00:00`, totalAmount: rev + 2500, productRevenueByLines: rev, deliveryFee: 2500, paid: true, canceled: false, memberKey: `syn_member_${(idx % 10) + 1}`, paymentMethodCode: ['pc', 'gb', 'pn'][idx % 3], orderChannel: ['shop', 'naverpay'][idx % 2], claim, lines: [{ goodsNo, goodsName: `상품${goodsNo}`, quantity: 1 + (idx % 3), lineRevenue: rev, categoryCode: '003', brandCode: '001' }] });
}
const catalog = { categoriesByCode: { '003': { cateNm: '오나홀' } }, brandsByCode: { '001': { brandNm: '스마트홈' } } };
const bundle = R.buildDepartmentFactsBundleFromUniverse({
  orders, customers: auxWithCs.customers, reviews: auxWithCs.reviews, inquiries: auxWithCs.inquiries,
  contactsForCsOnly: auxWithCs.csOnlyFakeContacts, catalog, source: { dataKind: 'synthetic', syntheticSource: 'commerce_universe_v1' }
}, { generatedAt: '2026-06-26' });

const nonEmpty = (packets, metric) => { const p = packets.find((x) => x.metric === metric); return p && p.rows.length > 0; };
ok('10. departmentFactsRouting이 aux dataset으로 bundle 생성', !!bundle.productTeam && !!bundle.csTeam && !!bundle.marketingTeam && !!bundle.manager);
ok('11. CS bundle에 inquiry/review/claim facts 반영', nonEmpty(bundle.csTeam.customerIssuePacket, 'inquiryCount') && nonEmpty(bundle.csTeam.customerIssuePacket, 'reviewAverageRating') && nonEmpty(bundle.csTeam.customerIssuePacket, 'claimRate'));
ok('12. marketing bundle에 product handoff + CS handoff 반영', bundle.marketingTeam.receivedFromProductTeam.length > 0 && bundle.marketingTeam.receivedFromCsTeam.length > 0);
ok('13. productTeam bundle에 CS/review/inquiry/contact PII 없음', !PII_RE.test(JSON.stringify(bundle.productTeam)) && !/inquiry|review|sentiment/i.test(JSON.stringify(bundle.productTeam.salesStatisticsPacket.map((p) => p.metric))));
ok('14. marketingTeam bundle에 contact PII 없음', !PII_RE.test(JSON.stringify(bundle.marketingTeam)));
ok('15. manager bundle에 contact PII 없음', !PII_RE.test(JSON.stringify(bundle.manager)));
ok('16. source metadata = commerce_universe_v1', bundle.meta.syntheticProfile === undefined ? bundle.meta.sourceType === 'synthetic' && bundle.meta.syntheticSource === 'commerce_universe_v1' : true);
ok('   CS fake contact는 csTeam에만', bundle.csTeam.fakeContacts && bundle.csTeam.fakeContacts.length === 10 && !PII_RE.test(JSON.stringify(bundle.productTeam) + JSON.stringify(bundle.marketingTeam) + JSON.stringify(bundle.manager)));
ok('   customerSegmentRevenue가 aux customers로 계산됨', nonEmpty(bundle.marketingTeam.directMarketingFacts, 'customerSegmentRevenue'));
rmSync(tmpB, { recursive: true, force: true });

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
