#!/usr/bin/env node
/*
 * scripts/smoke-cs-dashboard-admin-workflow-restructure.mjs
 * CS Dashboard Admin Workflow Restructure v0 — 4 KPI(미처리/처리완료/AI자동처리함/고객관리) helper 검증.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csadmin-'));
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

const names = { '1001': '드라이기', '1002': '모자', '1003': '세트' };
const line = (goodsNo, rev) => ({ goodsNo, goodsName: names[goodsNo], quantity: 1, lineRevenue: rev });
const ord = (orderNo, mk, amount, goodsNo, claim) => ({ orderNo, orderDate: '2026-05-20 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: amount, productRevenueByLines: amount - 2500, paid: true, canceled: !!(claim && claim.claimTypes.includes('cancel')), memberKey: mk, ...(claim ? { claim } : {}), lines: [line(goodsNo, amount - 2500)] });
const orders = [
  ord('OA1', 'syn_member_1', 62500, '1001'),
  ord('OA2', 'syn_member_1', 52500, '1002', { hasClaim: true, claimTypes: ['refund'], claimAmount: 50000 }),
  ord('OA3', 'syn_member_1', 12500, '1002', { hasClaim: true, claimTypes: ['cancel'], claimAmount: 10000 }),
  ord('OB1', 'syn_member_2', 32500, '1001'),
  ord('OC1', 'syn_member_3', 9000, '1003')
];
const inq = (id, date, status, topic, orderNo, goodsNo) => ({ inquiryId: id, createdAt: date, status, urgency: 'low', topic, orderNo, goodsNo, title: `${topic} 문의`, excerpt: `${topic} 관련 문의` });
const inquiries = [
  inq('q1', '2026-06-26 09:00:00', 'unanswered', 'payment', 'OA1', '1001'),       // 미처리, 내부확인(단일 결제→AI? matched→AI)
  inq('q2', '2026-06-25 09:00:00', 'unanswered', 'delivery', 'OA1', '1001'),       // 미처리, AI(배송) → AI함
  inq('q3', '2026-06-24 09:00:00', 'unanswered', 'refund', 'OA2', '1002'),         // 미처리, 내부확인
  inq('q4', '2026-06-20 09:00:00', 'answered', 'payment', 'OA3', '1002'),          // 처리완료 (member1 반복)
  inq('q5', '2026-06-18 09:00:00', 'answered', 'product_question', 'OB1', '1001'), // 처리완료
  inq('q6', '2026-06-10 09:00:00', 'answered', 'delivery', 'OA1', '1001')          // 처리완료 (member1)
];
const reviews = [
  { reviewId: 'rv1', orderNo: 'OA1', createdAt: '2026-06-22 10:00:00', rating: 5, sentiment: 'positive', topic: 'quality', goodsNo: '1001', excerpt: '좋아요' },
  { reviewId: 'rv2', orderNo: 'OB1', createdAt: '2026-06-21 10:00:00', rating: 1, sentiment: 'negative', topic: 'quality', goodsNo: '1001', excerpt: '불량' }
];
const contacts = [
  { memberKey: 'syn_member_1', customerId: 'cust_1', customerName: '가상고객 1', phone: '010-0000-0001', email: 's1@example.test', origin: { isFakePii: true, piiType: 'fake' } },
  { memberKey: 'syn_member_2', customerId: 'cust_2', customerName: '가상고객 2', phone: '010-0000-0002', email: 's2@example.test', origin: { isFakePii: true, piiType: 'fake' } }
];

const W = D.buildCsAdminWorkflow({ inquiries, reviews, orders, contacts, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') });
const Wbulk = D.buildCsAdminWorkflow({ inquiries, reviews, orders, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') }); // contacts 없음(분석/AI 경로)

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /가상고객|010-0000|@example/i;

console.log('=== CS Dashboard Admin Workflow Restructure smoke ===');

ok('1. KPI 4종(미처리/처리완료/AI자동처리함/고객관리) 생성', !!W.unresolved && !!W.resolved && !!W.aiAuto && !!W.customers);
ok('2. AI 자동처리함에 리뷰+배송만(byType)', W.aiAuto.byType.review === 2 && W.aiAuto.byType.delivery === 1 && W.aiAuto.count === 3);
ok('3. AI 자동처리함에 상품문의 없음', !W.aiAuto.items.some((i) => i.kind === 'inquiry' && i.topic === 'product'));
ok('4. AI 자동처리함에 결제확인 없음', !W.aiAuto.items.some((i) => i.kind === 'inquiry' && i.topic === 'payment'));
ok('5. AI 자동처리함에 일반/환불 없음', !W.aiAuto.items.some((i) => i.kind === 'inquiry' && ['refund', 'cancel', 'return', 'exchange', 'general', 'coupon', 'account'].includes(i.topic)));
ok('6. 내부확인은 독립 KPI 아님 + 미처리 byStage에 internalCheck 존재', typeof W.unresolved.byStage.internalCheck === 'number' && W.unresolved.byStage.internalCheck >= 1 && !('internalCheck' in W));
ok('7. 미처리 리뷰 독립 KPI 아님(AI함 리뷰로 이동)', W.aiAuto.byType.review === 2 && !('reviews' in W));
ok('8. 처리완료 문의 목록 생성(answered 3건)', W.resolved.count === 3 && W.resolved.items.length === 3);
ok('9. 처리완료에 처리일/처리결과/이전답변 placeholder', W.resolved.items.every((r) => !!r.processedAt && !!r.result && !!r.prevAnswer));
ok('10. 고객관리 목록 생성', W.customers.count >= 1 && W.customers.items.length >= 1);
ok('11. 고객관리 item에 주문/문의/리뷰/클레임 카운트', W.customers.items.every((c) => typeof c.orderCount === 'number' && typeof c.inquiryCount === 'number' && typeof c.reviewCount === 'number' && typeof c.claimCount === 'number'));
ok('12. 고객관리 item에 태그/riskLevel', W.customers.items.every((c) => Array.isArray(c.tags) && ['low', 'medium', 'high'].includes(c.riskLevel)) && W.customers.items.some((c) => c.riskLevel === 'high'));
const m1 = W.customers.items.find((c) => c.memberKey === 'syn_member_1');
ok('   member1: 반복 환불·취소 + 고액 → 주의/블랙리스트 후보', m1 && m1.tags.includes('반복 환불·취소') && m1.tags.includes('주의 고객') && m1.refundCancelCount >= 2);
ok('13. synthetic 고객 isSynthetic=true(contacts 경로)', m1 && m1.isSynthetic === true && typeof m1.name === 'string');
ok('14. 타입 색상 class token 생성', D.csTypeColorClass('payment') === 'type-pay' && D.csTypeColorClass('refund') === 'type-claim' && D.csTypeColorClass('delivery') === 'type-delivery' && D.csTypeColorClass('product') === 'type-product' && D.csTypeColorClass('coupon') === 'type-general');
// 15. 등록은 helper에 없음(WRITE 없음) — 구조적으로 helper는 순수, 등록 동작 없음
ok('15. helper에 WRITE/등록 부작용 없음(순수)', JSON.stringify(D.buildCsAdminWorkflow({ inquiries, reviews, orders, contacts, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') })) === JSON.stringify(W));
ok('16. CS UI 경로(contacts)에서 고객정보 표시 가능', W.customers.items.some((c) => !!c.name && !!c.phone) && W.resolved.items.some((r) => !!r.customerLabel));
ok('17. AI/분석 경로(contacts 없음)엔 고객 PII 없음', !PII_RE.test(JSON.stringify(Wbulk.customers)) && !PII_RE.test(JSON.stringify(Wbulk.resolved)) && Wbulk.customers.items.every((c) => !c.name && !c.phone));
ok('18. bulk KPI counts엔 PII 없음', !PII_RE.test(JSON.stringify({ u: W.unresolved.count, r: W.resolved.count, a: W.aiAuto.count, c: W.customers.count, bt: W.customers.byTag, bs: W.unresolved.byStage })));
ok('19. 기존 detail/리비전 helper 무회귀', (() => { const rev = D.buildCsKpiRevision({ inquiries, reviews, orders, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') }); const dash = D.buildCsDashboardFacts({ inquiries, reviews, orders, goodsNames: names }); return rev.intake.unresolvedInquiries + rev.intake.unresolvedReviews === rev.routing.aiProcessable + rev.routing.needsInternalCheck && dash.priorityInquiries.length > 0; })());

console.log('\n--- KPI ---');
console.log('미처리:', W.unresolved.count, JSON.stringify(W.unresolved.byStage));
console.log('처리완료:', W.resolved.count, `오늘 ${W.resolved.today} · 7일 ${W.resolved.last7d} · 반복 ${W.resolved.repeat}`);
console.log('AI자동처리함:', W.aiAuto.count, JSON.stringify(W.aiAuto.byType));
console.log('고객관리:', W.customers.count, JSON.stringify(W.customers.byTag));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
