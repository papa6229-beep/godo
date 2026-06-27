#!/usr/bin/env node
/*
 * scripts/smoke-cs-inquiry-detail-panel-enrichment.mjs
 * CS Inquiry Detail Panel Enrichment v0 — buildCsDetailItem(원문/주문/고객) 검증.
 *   고객정보는 detail item에만(contacts 주어질 때), bulk facts엔 PII 없음.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csdetail2-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'csTeamDashboardFacts.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const D = await import(pathToFileURL(path.join(tmp, 'csTeamDashboardFacts.js')).href);

const names = { '1001': '에어 파워 드라이기', '1002': '모자' };
const line = (goodsNo, rev, qty = 1) => ({ goodsNo, goodsName: names[goodsNo], quantity: qty, lineRevenue: rev });
const orders = [
  { orderNo: '2605291252000011', orderDate: '2026-05-29 12:52:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 62500, productRevenueByLines: 60000, paid: true, canceled: false, memberKey: 'syn_member_100001', lines: [line('1001', 60000)] },
  { orderNo: 'O-2', orderDate: '2026-05-10 09:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 22500, productRevenueByLines: 20000, paid: true, canceled: false, memberKey: 'syn_member_100001', lines: [line('1002', 20000)] }
];
const inquiries = [
  { inquiryId: 'q1', createdAt: '2026-05-31 09:00:00', status: 'unanswered', urgency: 'low', topic: 'payment', orderNo: '2605291252000011', goodsNo: '1001', title: '결제 문의', excerpt: '결제가 두 번 된 것 같은데 확인 부탁드립니다.' },
  { inquiryId: 'q2', createdAt: '2026-05-30 09:00:00', status: 'unanswered', urgency: 'low', topic: 'product_question', orderNo: 'NO-ORD', goodsNo: '1001', title: '상품 문의', excerpt: '사용법이 궁금합니다.' }
];
const reviews = [
  { reviewId: 'r1', orderNo: 'O-2', createdAt: '2026-05-20 10:00:00', rating: 2, sentiment: 'negative', topic: 'quality', goodsNo: '1002', excerpt: '품질이 아쉽습니다.' }
];
// CS 전용 fake contact (origin 표식). bulk facts엔 안 들어가야 함.
const contacts = [
  { memberKey: 'syn_member_100001', customerId: 'cust_000001', customerName: '가상고객 000001', phone: '010-0000-0001', email: 'syn000001@example.test', address: '서울시 테스트구 샘플로 1', origin: { isFakePii: true, piiType: 'fake', syntheticProfile: 'commerce_universe_v1' } }
];

const rev = D.buildCsKpiRevision({ inquiries, reviews, orders, goodsNames: names, nowMs: Date.parse('2026-06-13T12:00:00') });
const q1Item = rev.items.unresolvedInquiries.find((i) => i.inquiryId === 'q1');
const q2Item = rev.items.unresolvedInquiries.find((i) => i.inquiryId === 'q2');
const r1Item = rev.items.unresolvedReviews.find((i) => i.reviewId === 'r1');

const d1 = D.buildCsDetailItem(q1Item, { orders, contacts, goodsNames: names });
const d2 = D.buildCsDetailItem(q2Item, { orders, contacts, goodsNames: names });
const dr = D.buildCsDetailItem(r1Item, { orders, contacts, goodsNames: names });
// AI context 경로(고객 미전달): contacts 없이 호출
const dNoContact = D.buildCsDetailItem(q1Item, { orders, goodsNames: names });

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /가상고객|010-0000|@example|샘플로/i;

console.log('=== CS Inquiry Detail Panel Enrichment smoke ===');

ok('1. detail 기본 정보(title/type/stage/route)', d1.title === '결제 문의' && !!d1.type && !!d1.processStage && (d1.processRoute === 'ai_auto' || d1.processRoute === 'internal_check'));
ok('2. bodyText(safe excerpt) 포함', /두 번/.test(d1.bodyText || ''));
ok('3. inquiry detail productName 포함', d1.productName === '에어 파워 드라이기');
ok('4. inquiry detail orderNo 포함', d1.order?.orderNo === '2605291252000011');
ok('5. order-linked detail 주문 금액/배송비 포함', d1.order?.orderAmount === 62500 && d1.order?.goodsAmount === 60000 && d1.order?.deliveryCharge === 2500 && d1.order?.paymentState === '결제완료');
ok('6. order-linked detail 주문 상품 목록 포함', Array.isArray(d1.order?.items) && d1.order.items.length === 1 && d1.order.items[0].productName === '에어 파워 드라이기' && d1.order.items[0].quantity === 1);
ok('7. customer section 생성(contacts 주어짐)', !!d1.customer && typeof d1.customer.name === 'string' && d1.customer.name.length > 0 && !!d1.customer.phone);
ok('8. synthetic customer isSynthetic=true', d1.customer?.isSynthetic === true);
ok('9. bulk facts(rev)에 customer PII 없음', !PII_RE.test(JSON.stringify(rev)));
ok('10. contacts 미전달 시 detail.customer 없음(AI context 경로)', !dNoContact.customer);
ok('11. 처리 단계 기본값 생성', !!d1.processStage && d1.processStage.length > 0);
ok('12. flags(orderLinked/draftable/needsInternalCheck/highRisk) 존재', typeof d1.flags.orderLinked === 'boolean' && typeof d1.flags.draftable === 'boolean' && typeof d1.flags.needsInternalCheck === 'boolean' && typeof d1.flags.highRisk === 'boolean');
ok('13. 주문 미연결 문의는 order 비고 + customer 없음', d2.flags.orderLinked === false && (d2.order?.items?.length || 0) === 0 && !d2.customer);
ok('14. review detail에 rating/sentiment + 주문 연결', dr.sourceType === 'review' && dr.rating === 2 && !!dr.sentiment && dr.order?.orderNo === 'O-2');
ok('15. recentOrderCount 계산(같은 memberKey 주문 수=2)', d1.customer?.recentOrderCount === 2);
ok('16. elapsedDays 계산', typeof d1.elapsedDays === 'number' && d1.elapsedDays >= 1);

// 17. KPI 합계 불변식 유지
ok('17. KPI 합계 불변식 유지', rev.intake.unresolvedInquiries + rev.intake.unresolvedReviews === rev.routing.aiProcessable + rev.routing.needsInternalCheck);
// 18. bulk facts에 fake contact origin 표식/식별자 없음
ok('18. bulk facts에 fake contact/memberKey 없음', !/isFakePii|syn_member_|cust_000001/i.test(JSON.stringify(rev)));
// 19. 기존 buildCsDashboardFacts 무회귀
const legacy = D.buildCsDashboardFacts({ inquiries, reviews, orders, goodsNames: names });
ok('19. 기존 buildCsDashboardFacts 무회귀', !!legacy.kpis && legacy.priorityInquiries.length > 0 && !PII_RE.test(JSON.stringify(legacy)));

console.log('\n--- detail(q1) 요약 ---');
console.log('order:', JSON.stringify(d1.order));
console.log('customer.isSynthetic:', d1.customer?.isSynthetic, '| name present:', !!d1.customer?.name, '| recentOrders:', d1.customer?.recentOrderCount);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
