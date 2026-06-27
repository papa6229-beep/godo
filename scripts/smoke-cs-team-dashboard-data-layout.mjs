#!/usr/bin/env node
/*
 * scripts/smoke-cs-team-dashboard-data-layout.mjs
 * CS Team Dashboard UX/Data Layout v0 — dashboard facts helper 순수 함수 검증.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csdash-'));
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

// ── 데이터 ──
const names = { '1001': '티셔츠', '1002': '모자', '1003': '세트상품' };
const line = (goodsNo, rev) => ({ goodsNo, goodsName: names[goodsNo], quantity: 1, lineRevenue: rev });
const orders = [
  { orderNo: 'O-PAY1', orderDate: '2026-06-25 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 32500, productRevenueByLines: 30000, paid: true, canceled: false, memberKey: 'syn_member_100001', lines: [line('1001', 30000)] },
  { orderNo: 'O-DUP1', orderDate: '2026-06-22 14:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, canceled: false, memberKey: 'syn_member_100009', lines: [line('1002', 10000)] },
  { orderNo: 'O-DUP2', orderDate: '2026-06-22 14:05:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, canceled: false, memberKey: 'syn_member_100009', lines: [line('1002', 10000)] },
  { orderNo: 'O-REF', orderDate: '2026-06-19 09:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 42500, productRevenueByLines: 40000, paid: true, canceled: false, memberKey: 'syn_member_100003', claim: { hasClaim: true, claimTypes: ['refund'], claimAmount: 40000 }, lines: [line('1003', 40000)] }
];
const inq = (id, date, status, urgency, topic, orderNo, goodsNo) => ({ inquiryId: id, createdAt: date, status, urgency, topic, orderNo, goodsNo, title: `${topic} 문의` });
const inquiries = [
  inq('q1', '2026-06-26 09:00:00', 'unanswered', 'high', 'payment', 'O-DUP1', '1002'),   // 긴급+미답변, 중복후보 → needsHumanCheck
  inq('q2', '2026-06-25 09:00:00', 'unanswered', 'low', 'payment', 'O-PAY1', '1001'),     // 미답변 종결형
  inq('q3', '2026-06-24 09:00:00', 'unanswered', 'high', 'refund', 'O-REF', '1003'),       // 긴급+미답변, refund 미확정 → needsHumanCheck
  inq('q4', '2026-06-23 09:00:00', 'answered', 'high', 'delivery', 'O-PAY1', '1001'),       // 긴급(답변완료)
  inq('q5', '2026-06-20 09:00:00', 'needs_human', 'medium', 'stock', 'NO-ORDER', '1002'),   // 미매칭(주문 미연결)
  inq('q6', '2026-06-18 09:00:00', 'unanswered', 'low', 'product_question', 'O-PAY1', '1001') // product → draftable
];
const reviews = [
  { reviewId: 'r1', createdAt: '2026-06-24 10:00:00', rating: 1, sentiment: 'negative', topic: 'effect', goodsNo: '1002', excerpt: '효과 미흡' },
  { reviewId: 'r2', createdAt: '2026-06-23 10:00:00', rating: 2, sentiment: 'neutral', topic: 'delivery', goodsNo: '1002', excerpt: '배송 지연' },
  { reviewId: 'r3', createdAt: '2026-06-22 10:00:00', rating: 5, sentiment: 'positive', topic: 'quality', goodsNo: '1001', excerpt: '만족' }
];

const facts = D.buildCsDashboardFacts({ inquiries, reviews, orders, goodsNames: names });

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /가상고객|가상수령자|010-0000|@example|샘플로|customerName|receiverName|refundAccount/i;

console.log('=== CS Team Dashboard Data Layout smoke ===');

ok('1. dashboard facts 생성', !!facts && !!facts.kpis && Array.isArray(facts.priorityInquiries));
ok('2. unansweredCount 계산(미답변+needs_human = 5)', facts.kpis.unansweredCount === 5);
ok('3. urgentCount 계산', facts.kpis.urgentCount === 3);
ok('4. lowRatingReviewCount 계산', facts.kpis.lowRatingReviewCount === 2);
ok('5. needsHumanCheckCount 계산(>=2: 중복후보 q1 + refund 미확정 q3)', facts.kpis.needsHumanCheckCount >= 2);
ok('6. orderLinkedCount 계산(미매칭 q5 제외 = 5)', facts.kpis.orderLinkedCount === 5);
ok('7. draftableCount 계산(>=orderLinked, product 포함)', facts.kpis.draftableCount >= facts.kpis.orderLinkedCount && facts.kpis.draftableCount >= 5);
ok('8. priorityInquiries 생성', facts.priorityInquiries.length > 0 && facts.priorityInquiries[0].rank === 1);
ok('9. 긴급+미답변 우선 정렬(1위가 긴급+미답변)', (() => { const f = facts.priorityInquiries[0]; return /high|긴급/i.test(f.urgency) && /unanswered|미답변|needs_human/i.test(f.status); })());
ok('10. 각 priority에 orderLinked 여부', facts.priorityInquiries.every((q) => typeof q.orderLinked === 'boolean') && facts.priorityInquiries.some((q) => q.orderLinked === false));
ok('11. 각 priority에 draftable 여부', facts.priorityInquiries.every((q) => typeof q.draftable === 'boolean'));
ok('12. high risk/중복후보가 needsHumanCheck로 표시', facts.priorityInquiries.some((q) => q.needsHumanCheck === true));
ok('13. lowRatingReviews가 rating<=2/negative 기준', facts.lowRatingReviews.length === 2 && facts.lowRatingReviews.every((r) => r.rating <= 2 || /negative|부정/.test(r.sentiment)) && !facts.lowRatingReviews.some((r) => /만족/.test(r.excerpt)));
ok('14. issueProducts 생성(상품별 집계)', facts.issueProducts.length > 0 && facts.issueProducts.every((p) => typeof p.totalIssues === 'number') && facts.issueProducts[0].productName);

const json = JSON.stringify(facts);
ok('15. facts에 PII 없음', !PII_RE.test(json));
ok('16. fake contact 미포함', !/isFakePii|piiType|deliveryMemo|refundBank/i.test(json));
ok('17. memberKey 노출 없음', !/syn_member_|memberKey/i.test(json));

// 18. priority 정렬 규칙: 긴급+미답변 < 미답변 < 긴급 < 기타 (점수 단조)
const rankByStatus = facts.priorityInquiries.map((q) => {
  const un = /unanswered|미답변|needs_human/i.test(q.status), ur = /high|긴급/i.test(q.urgency);
  return un && ur ? 0 : un ? 1 : ur ? 2 : 3;
});
ok('18. priority 점수 단조 비감소', rankByStatus.every((v, i) => i === 0 || v >= rankByStatus[i - 1]));

// 19. 보조 helper 단독 동작
const lowRev = D.summarizeLowRatingReviews(reviews, names);
const issue = D.summarizeCsIssueProducts(inquiries, reviews, names);
const pri = D.rankCsPriorityInquiries(inquiries, orders, names, 3);
ok('19. 보조 helper(summarize/rank) 동작', lowRev.length === 2 && issue.length > 0 && pri.length === 3 && pri[0].rank === 1);

ok('20. chatHints 제공(마케팅 제안 아님)', Array.isArray(facts.chatHints) && facts.chatHints.length > 0 && !/광고|캠페인|프로모션|마케팅/.test(JSON.stringify(facts.chatHints)));

console.log('\n--- KPI ---');
console.log(JSON.stringify(facts.kpis));
console.log('우선처리 1위:', JSON.stringify(facts.priorityInquiries[0]));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
