#!/usr/bin/env node
/*
 * scripts/smoke-cs-dashboard-kpi-popup-ux-revision.mjs
 * CS Dashboard KPI/Popup UX Revision v0 — 접수 현황/처리 분류 helper 검증.
 *  공식: unresolvedInquiries + unresolvedReviews === aiProcessable + needsInternalCheck
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-cskpi-'));
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

const names = { '1001': '티셔츠', '1002': '모자', '1003': '세트상품' };
const line = (goodsNo, rev) => ({ goodsNo, goodsName: names[goodsNo], quantity: 1, lineRevenue: rev });
const orders = [
  { orderNo: 'O-PAY1', orderDate: '2026-06-25 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 32500, productRevenueByLines: 30000, paid: true, canceled: false, memberKey: 'syn_member_100001', lines: [line('1001', 30000)] },
  { orderNo: 'O-DUP1', orderDate: '2026-06-22 14:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, canceled: false, memberKey: 'syn_member_100009', lines: [line('1002', 10000)] },
  { orderNo: 'O-DUP2', orderDate: '2026-06-22 14:05:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, canceled: false, memberKey: 'syn_member_100009', lines: [line('1002', 10000)] },
  { orderNo: 'O-DLV', orderDate: '2026-06-24 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 22500, productRevenueByLines: 20000, paid: true, canceled: false, memberKey: 'syn_member_100002', lines: [line('1001', 20000)] }
];
const inq = (id, date, status, urgency, topic, orderNo, goodsNo) => ({ inquiryId: id, createdAt: date, status, urgency, topic, orderNo, goodsNo, title: `${topic} 문의` });
const inquiries = [
  inq('q1', '2026-06-26 09:00:00', 'unanswered', 'high', 'payment', 'O-DUP1', '1002'),     // 내부확인(중복)
  inq('q2', '2026-06-25 09:00:00', 'unanswered', 'low', 'payment', 'O-PAY1', '1001'),       // AI(단순결제확인)
  inq('q3', '2026-06-25 08:00:00', 'unanswered', 'low', 'payment', 'NO-ORD', '1001'),       // 내부확인(매칭실패)
  inq('q4', '2026-06-24 09:00:00', 'unanswered', 'high', 'refund', 'O-PAY1', '1003'),        // 내부확인(환불)
  inq('q5', '2026-06-24 08:00:00', 'unanswered', 'medium', 'delivery', 'O-DLV', '1001'),     // AI(배송)
  inq('q6', '2026-06-23 09:00:00', 'unanswered', 'low', 'product_question', 'O-PAY1', '1001'), // AI(상품정보)
  inq('q7', '2026-06-22 09:00:00', 'unanswered', 'low', 'coupon', 'O-PAY1', '1001'),          // AI(일반)
  inq('q8', '2026-06-21 09:00:00', 'answered', 'low', 'delivery', 'O-DLV', '1001')            // 답변완료 → 제외
];
const reviews = [
  { reviewId: 'r1', createdAt: '2026-06-24 10:00:00', rating: 5, sentiment: 'positive', topic: 'quality', goodsNo: '1001', excerpt: '만족' },     // AI(리뷰)
  { reviewId: 'r2', createdAt: '2026-06-23 10:00:00', rating: 3, sentiment: 'neutral', topic: 'delivery', goodsNo: '1002', excerpt: '보통' },      // AI(리뷰)
  { reviewId: 'r3', createdAt: '2026-06-22 10:00:00', rating: 1, sentiment: 'negative', topic: 'quality', goodsNo: '1002', excerpt: '불량' }       // 내부확인(상품 결함)
];

const F = D.buildCsKpiRevision({ inquiries, reviews, orders, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') });

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /가상고객|가상수령자|010-0000|@example|샘플로|customerName|receiverName/i;

console.log('=== CS Dashboard KPI/Popup UX Revision smoke ===');

ok('1. unresolvedInquiries 계산(answered q8 제외 = 7)', F.intake.unresolvedInquiries === 7);
ok('2. unresolvedReviews 계산(= 3)', F.intake.unresolvedReviews === 3);
ok('3. aiProcessable 계산', typeof F.routing.aiProcessable === 'number' && F.routing.aiProcessable > 0);
ok('4. needsInternalCheck 계산', typeof F.routing.needsInternalCheck === 'number' && F.routing.needsInternalCheck > 0);
ok('5. 공식: 미처리(문의+리뷰) = AI자동 + 내부확인', F.intake.unresolvedInquiries + F.intake.unresolvedReviews === F.routing.aiProcessable + F.routing.needsInternalCheck);
ok('6. 내부확인 항목은 AI 자동처리에서 제외(겹침 없음)', F.items.aiProcessable.every((i) => i.needsInternalCheck === false) && F.items.needsInternalCheck.every((i) => i.aiProcessable === false));
ok('7. 미처리 문의 breakdown 생성', Object.keys(F.breakdowns.inquiryByType).length > 0 && (F.breakdowns.inquiryByType.payment || 0) >= 3);
ok('8. 미처리 리뷰 breakdown 생성(좋음/보통/저평점)', F.breakdowns.reviewByType['좋음'] === 1 && F.breakdowns.reviewByType['보통'] === 1 && F.breakdowns.reviewByType['저평점'] === 1);
ok('9. AI 자동처리 breakdown 생성', Object.keys(F.breakdowns.aiProcessableByType).length > 0 && (F.breakdowns.aiProcessableByType['리뷰'] || 0) >= 2);
ok('10. 내부확인 breakdown 생성(결제/환불·취소/상품)', (F.breakdowns.needsInternalCheckByType['결제'] || 0) >= 1 && (F.breakdowns.needsInternalCheckByType['환불·취소'] || 0) >= 1 && (F.breakdowns.needsInternalCheckByType['상품'] || 0) >= 1);
ok('11. KPI 카드용 detail list 생성', F.items.unresolvedInquiries.length === 7 && F.items.unresolvedReviews.length === 3 && F.items.aiProcessable.length === F.routing.aiProcessable && F.items.needsInternalCheck.length === F.routing.needsInternalCheck);
ok('12. inquiry 항목에 경과일/처리단계', F.items.unresolvedInquiries.every((i) => typeof i.ageDays === 'number' && !!i.stage) && F.items.unresolvedInquiries.some((i) => i.ageDays >= 1));
ok('13. review 항목에 rating/sentiment', F.items.unresolvedReviews.every((r) => typeof r.rating === 'number' && typeof r.sentiment === 'string'));
ok('14. AI 자동처리 후보에 리뷰/배송/일반/상품정보 포함', (() => { const b = F.breakdowns.aiProcessableByType; return b['리뷰'] && b['배송'] && (b['일반'] || b['상품정보'] || b['단순결제확인']); })());
ok('15. 내부확인에 중복결제/환불상태불명/상품결함 사유 포함', F.items.needsInternalCheck.some((i) => /중복결제/.test(i.internalReason || '')) && F.items.needsInternalCheck.some((i) => /환불|취소/.test(i.internalReason || '')) && F.items.needsInternalCheck.some((i) => /결함|불만/.test(i.internalReason || '')) && F.items.needsInternalCheck.some((i) => /매칭 실패/.test(i.internalReason || '')));

const json = JSON.stringify(F);
ok('16. PII 없음', !PII_RE.test(json));
ok('17. fake contact 없음', !/isFakePii|piiType|deliveryMemo|refundBank/i.test(json));
ok('18. memberKey 없음', !/syn_member_|memberKey/i.test(json));

// 19. 기존 buildCsDashboardFacts 무회귀(여전히 동작)
const legacy = D.buildCsDashboardFacts({ inquiries, reviews, orders, goodsNames: names });
ok('19. 기존 buildCsDashboardFacts 무회귀', !!legacy.kpis && legacy.priorityInquiries.length > 0);

console.log('\n--- 결과 요약 ---');
console.log('intake:', JSON.stringify(F.intake), '| routing:', JSON.stringify(F.routing));
console.log('aiByType:', JSON.stringify(F.breakdowns.aiProcessableByType));
console.log('internalByType:', JSON.stringify(F.breakdowns.needsInternalCheckByType));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
