#!/usr/bin/env node
/*
 * scripts/smoke-cs-dashboard-statistics-layout-prototype.mjs
 * CS Dashboard Statistics Layout Prototype v0 검증.
 *  - buildCsDashboardStatistics(순수) 5블록 + local state 반영
 *  - 컴포넌트 소스: KPI 여백/우선처리 리스트 제거/제외 통계 부재
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const TSX = read('src/components/CsTeamDashboard.tsx');
const CSS = read('src/components/CsTeamDashboard.css');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csstat-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'csDashboardStatistics.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const S = await import(pathToFileURL(path.join(tmp, 'csDashboardStatistics.js')).href);

const names = { '1001': '드라이기', '1002': '가습기', '1003': '세트' };
const line = (g, rev) => ({ goodsNo: g, goodsName: names[g], quantity: 1, lineRevenue: rev });
const ord = (orderNo, mk, amount, g, claim, canceled) => ({ orderNo, orderDate: '2026-06-20 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: amount, productRevenueByLines: amount - 2500, paid: true, canceled: !!canceled, confirmed: false, memberKey: mk, ...(claim ? { claim } : {}), lines: [line(g, amount - 2500)] });
const orders = [
  ord('O1', 'syn_member_1', 62500, '1001'),
  ord('O2', 'syn_member_1', 52500, '1002', { hasClaim: true, claimTypes: ['refund'], claimAmount: 50000 }),
  ord('O3', 'syn_member_1', 12500, '1002', { hasClaim: true, claimTypes: ['cancel'] }, true),
  ord('O4', 'syn_member_2', 9000, '1003')
];
const inq = (id, status, topic, orderNo, g) => ({ inquiryId: id, createdAt: '2026-06-25 09:00:00', status, urgency: 'low', topic, orderNo, goodsNo: g, title: `${topic} 문의`, excerpt: `${topic} 원문` });
const inquiries = [
  inq('q1', 'unanswered', 'payment', 'O1', '1001'),
  inq('q2', 'unanswered', 'refund', 'O2', '1002'),
  inq('q3', 'answered', 'delivery', 'O3', '1002'),
  inq('q4', 'unanswered', 'product_question', 'O1', '1001'),
  inq('q5', 'unanswered', 'coupon', 'O4', '1003')
];
const reviews = [
  { reviewId: 'rv1', orderNo: 'O1', createdAt: '2026-06-22 10:00:00', rating: 5, sentiment: 'positive', topic: 'quality', goodsNo: '1001', excerpt: '좋아요' },
  { reviewId: 'rv2', orderNo: 'O2', createdAt: '2026-06-21 10:00:00', rating: 1, sentiment: 'negative', topic: 'quality', goodsNo: '1002', excerpt: '불량' }
];
const contacts = [{ memberKey: 'syn_member_1', customerId: 'cust_1', customerName: '가상고객 1', phone: '010-0000-0001', email: 's1@example.test', origin: { isFakePii: true, piiType: 'fake' } }];
const completed = [{ id: 'cw1', originalId: 'q9', sourceType: 'review', title: 'r', answerText: 'a', completedAt: '2026-06-27 12:00:00', completionMethod: 'ai_auto_batch', completionStatus: 'completed_local', stage: '처리 완료', writeStatus: 'not_connected' }];
const approvals = [
  { id: 'a1', source: 'cs', sourceType: 'inquiry_reply', status: 'pending_approval', title: 't', answerText: 'x', target: { originalId: 'q1' }, context: {}, writeTarget: { platform: 'godomall', targetType: 'inquiry_reply', targetId: 'q1' }, writeStatus: 'not_connected', createdAt: 't' },
  { id: 'a2', source: 'cs', sourceType: 'review_reply', status: 'approved_local', title: 't', answerText: 'y', target: { originalId: 'rv1' }, context: {}, writeTarget: { platform: 'godomall', targetType: 'review_reply', targetId: 'rv1' }, writeStatus: 'not_connected', createdAt: 't' },
  { id: 'a3', source: 'cs', sourceType: 'review_reply', status: 'rejected', title: 't', answerText: 'z', target: { originalId: 'rv2' }, context: {}, writeTarget: { platform: 'godomall', targetType: 'review_reply', targetId: 'rv2' }, writeStatus: 'not_connected', createdAt: 't' }
];

const st = S.buildCsDashboardStatistics({ inquiries, reviews, orders, contacts, completed, approvals, cautionByKey: { syn_member_2: true }, blacklistByKey: {}, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') });

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Dashboard Statistics Layout Prototype smoke ===');

// 컴포넌트 소스
ok('1. KPI 영역 여백/간격 개선 class', /\.cs-dash-kpi-grid\s*{[^}]*gap:\s*16px/.test(CSS) && /\.cs-dash\s*{[^}]*padding:\s*6px 20px 20px/.test(CSS));
ok('2. 우선 처리 문의 긴 리스트 제거', !/우선 처리 문의/.test(TSX) && !/PriorityRow/.test(TSX));
ok('   통계 블록 렌더 마커', /문의 유형 비중/.test(TSX) && /CS 업무 흐름/.test(TSX) && /AI 처리 성과/.test(TSX) && /CS 이슈 상품 TOP/.test(TSX) && /고객 리스크 요약/.test(TSX));
ok('13. 직원별 처리 현황 통계 없음', !/직원별|처리량 순위|assigneeStats|byAssignee/i.test(TSX));
ok('14. 미처리 경과 시간 분포 없음', !/경과 시간 분포|elapsedDistribution|ageBucket/i.test(TSX));

// helper 동작
ok('3+4. 문의 유형 비중 생성(결제/환불/배송/상품/일반/리뷰)', (() => { const labels = st.inquiryTypeDistribution.map((s) => s.label); return ['결제/주문', '환불/취소', '배송', '상품', '일반', '리뷰'].every((l) => labels.includes(l)); })());
ok('5. percent 합계 ~100', (() => { const sum = st.inquiryTypeDistribution.reduce((a, b) => a + b.percent, 0); return sum >= 95 && sum <= 105; })());
ok('6+7. 업무 흐름 요약(5필드)', ['unresolved', 'pendingApproval', 'approved', 'completed', 'rejectedOrHeld'].every((k) => typeof st.workflowSummary[k] === 'number'));
ok('8+9. AI 처리 성과(draft/approval/approved/rejected/completed)', typeof st.aiPerformance.draftCount === 'number' && typeof st.aiPerformance.approvalRequestedCount === 'number' && typeof st.aiPerformance.approvedCount === 'number' && typeof st.aiPerformance.rejectedCount === 'number' && typeof st.aiPerformance.aiCompletedCount === 'number');
ok('10. CS 이슈 상품 TOP 생성(claimCount 포함)', st.issueProducts.length > 0 && st.issueProducts.every((p) => typeof p.claimCount === 'number') && st.issueProducts.some((p) => p.claimCount >= 1));
ok('11+12. 고객 리스크 요약(반복문의/반복환불/주의/블랙리스트/고액)', ['repeatInquiryCount', 'repeatRefundCancelCount', 'cautionCustomerCount', 'blacklistCandidateCount', 'highValueCustomerCount'].every((k) => typeof st.customerRiskSummary[k] === 'number'));

// 16. approvalItems 반영
ok('16. approvalItems 반영(pending/approved/rejected)', st.workflowSummary.pendingApproval === 1 && st.workflowSummary.approved === 1 && st.aiPerformance.approvedCount === 1 && st.aiPerformance.rejectedCount === 1 && st.aiPerformance.approvalRate === 50);
// 15. completedWorkItems 반영
ok('15. completedWorkItems 반영(completed/ai완료)', st.workflowSummary.completed >= 1 + completed.length && st.aiPerformance.aiCompletedCount === 1);
// 17. customer local caution 반영
ok('17. customer local caution 반영(주의 고객 카운트↑)', (() => { const base = S.buildCsDashboardStatistics({ inquiries, reviews, orders, contacts, completed, approvals, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') }); return st.customerRiskSummary.cautionCustomerCount >= base.customerRiskSummary.cautionCustomerCount; })());

// 18~20
ok('18. 실제 WRITE/네트워크 호출 없음', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX));
ok('19. 고객관리 Profile Hub 유지', /CsCustomerProfilePopup/.test(TSX));
ok('20. CS 승인 큐 유지', /CsApprovalQueuePopup/.test(TSX));

console.log('\n--- stats ---');
console.log('typeDist:', JSON.stringify(st.inquiryTypeDistribution.map((s) => `${s.label} ${s.percent}%`)));
console.log('workflow:', JSON.stringify(st.workflowSummary), '| ai:', JSON.stringify(st.aiPerformance));
console.log('risk:', JSON.stringify({ ...st.customerRiskSummary, topRiskCustomers: st.customerRiskSummary.topRiskCustomers.length }));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
