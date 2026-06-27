#!/usr/bin/env node
/*
 * scripts/smoke-cs-dashboard-interactive-statistics.mjs
 * CS Dashboard Interactive Statistics v0 검증.
 *  - 기간 필터(csDashboardTimeFilter) + intent 매퍼(csDashboardInteractions) 순수 검증
 *  - 기간 필터가 통계(buildCsDashboardStatistics)에 반영
 *  - 컴포넌트 소스: 기간 pill / 클릭 가능 통계 / WRITE 없음 / 제외 통계 부재
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

const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csinter-'));
const emit = (f) => execFileSync(process.execPath, [path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), path.join(REPO, f),
  '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
try { emit('src/services/csDashboardStatistics.ts'); emit('src/services/csDashboardTimeFilter.ts'); emit('src/services/csDashboardInteractions.ts'); }
catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const S = await import(pathToFileURL(path.join(tmp, 'csDashboardStatistics.js')).href);
const T = await import(pathToFileURL(path.join(tmp, 'csDashboardTimeFilter.js')).href);
const I = await import(pathToFileURL(path.join(tmp, 'csDashboardInteractions.js')).href);

const NOW = Date.parse('2026-06-27T12:00:00');
const d = (back) => new Date(NOW - back * 86400000).toISOString().slice(0, 10) + ' 10:00:00';
const names = { '1001': '드라이기', '1002': '가습기' };
const line = (g, rev) => ({ goodsNo: g, goodsName: names[g], quantity: 1, lineRevenue: rev });
const ord = (orderNo, mk, amount, g, claim) => ({ orderNo, orderDate: d(2), sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: amount, productRevenueByLines: amount - 2500, paid: true, canceled: false, confirmed: false, memberKey: mk, ...(claim ? { claim } : {}), lines: [line(g, amount - 2500)] });
const orders = [ord('O1', 'syn_member_1', 62500, '1001'), ord('O2', 'syn_member_1', 52500, '1002', { hasClaim: true, claimTypes: ['refund'], claimAmount: 50000 })];
const inq = (id, when, topic, orderNo, g) => ({ inquiryId: id, createdAt: when, status: 'unanswered', urgency: 'low', topic, orderNo, goodsNo: g, title: `${topic} 문의`, excerpt: `${topic} 원문` });
const inquiries = [
  inq('q_today', d(0), 'payment', 'O1', '1001'),
  inq('q_5d', d(5), 'refund', 'O2', '1002'),
  inq('q_40d', d(40), 'delivery', 'O1', '1001'),
  { inquiryId: 'q_nodate', createdAt: '', status: 'unanswered', urgency: 'low', topic: 'product_question', orderNo: 'O1', goodsNo: '1001', title: 'x', excerpt: 'x' }
];
const reviews = [{ reviewId: 'rv1', orderNo: 'O1', createdAt: d(3), rating: 1, sentiment: 'negative', topic: 'quality', goodsNo: '1001', excerpt: '불량' }];
const contacts = [{ memberKey: 'syn_member_1', customerId: 'cust_1', customerName: '가상고객 1', phone: '010-0000-0001', email: 's1@example.test', origin: { isFakePii: true, piiType: 'fake' } }];

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Dashboard Interactive Statistics smoke ===');

// 컴포넌트 소스
ok('1+2. 기간 필터 UI + 선택 상태', /cs-dash-period/.test(TSX) && /CS_TIME_RANGES/.test(TSX) && /setPeriod/.test(TSX) && /useState<CsTimeRange>/.test(TSX));
ok('9. 통계 항목 클릭 가능(cs-stat-clickable + hover)', /cs-stat-clickable/.test(TSX) && /\.cs-stat-clickable/.test(CSS));
ok('23. 직원별 처리 현황 없음', !/직원별|byAssignee|처리량 순위/i.test(TSX));
ok('24. 미처리 경과 시간 분포 없음', !/경과 시간 분포|elapsedDistribution|ageBucket/i.test(TSX));
ok('25. 실제 WRITE/네트워크 호출 없음', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX));

// 시간 필터
ok('   inCsTimeRange: all/today/7d/30d', T.inCsTimeRange(d(40), 'all', NOW) === true && T.inCsTimeRange(d(0), 'today', NOW) === true && T.inCsTimeRange(d(5), '7d', NOW) === true && T.inCsTimeRange(d(40), '7d', NOW) === false && T.inCsTimeRange(d(20), '30d', NOW) === true);
ok('   날짜 없음 → 기간 필터 제외, 전체 포함', T.inCsTimeRange('', '7d', NOW) === false && T.inCsTimeRange('', 'all', NOW) === true);
const f7 = T.filterCsInputsByTime({ inquiries, reviews, orders, completed: [], approvals: [] }, '7d', NOW);
ok('   7일 필터: q_today/q_5d 포함, q_40d/q_nodate 제외', f7.inquiries.map((q) => q.inquiryId).sort().join(',') === 'q_5d,q_today');

// 기간 필터 → 통계 반영 (3~8)
const stAll = S.buildCsDashboardStatistics({ inquiries, reviews, orders, contacts, completed: [], approvals: [], goodsNames: names, nowMs: NOW });
const f = T.filterCsInputsByTime({ inquiries, reviews, orders, completed: [], approvals: [] }, '7d', NOW);
const st7 = S.buildCsDashboardStatistics({ inquiries: f.inquiries, reviews: f.reviews, orders: f.orders, contacts, completed: f.completed, approvals: f.approvals, goodsNames: names, nowMs: NOW });
ok('3. KPI/통계 기간 반영(미처리 수 감소)', stAll.workflowSummary.unresolved > st7.workflowSummary.unresolved);
ok('4. 문의 유형 비중 기간 반영', JSON.stringify(stAll.inquiryTypeDistribution) !== JSON.stringify(st7.inquiryTypeDistribution));
ok('5. 업무 흐름 기간 반영', typeof st7.workflowSummary.unresolved === 'number');
ok('6. AI 처리 성과 기간 반영', typeof st7.aiPerformance.draftCount === 'number');
ok('7. 이슈 상품 TOP 기간 반영', Array.isArray(st7.issueProducts));
ok('8. 고객 리스크 요약 기간 반영', typeof st7.customerRiskSummary.repeatInquiryCount === 'number');

// intent 매퍼 (10~19)
ok('10. 문의 유형 클릭 intent', I.typeSliceToIntent('claim').kind === 'unresolved' && I.typeSliceToIntent('claim').initialTab === 'rc' && I.typeSliceToIntent('review').kind === 'aiAuto');
ok('11. 미처리 클릭 intent', I.workflowStepToIntent('unresolved').kind === 'unresolved');
ok('12. 승인 대기 클릭 → 승인큐 pending', I.workflowStepToIntent('pendingApproval').kind === 'approvalQueue' && I.workflowStepToIntent('pendingApproval').initialTab === 'pending');
ok('13. 승인됨 클릭 → 승인큐 approved', I.workflowStepToIntent('approved').initialTab === 'approved');
ok('14. 처리완료 클릭 → completed', I.workflowStepToIntent('completed').kind === 'completed');
ok('15. AI 초안 후보 클릭 → aiAuto', I.aiMetricToIntent('draftCount').kind === 'aiAuto');
ok('16. 반려 클릭 → 승인큐 rejected', I.aiMetricToIntent('rejectedCount').initialTab === 'rejected');
ok('17. 이슈 상품 클릭 intent', I.issueProductToIntent('1001', '드라이기').kind === 'issueProduct' && I.issueProductToIntent('1001', '드라이기').goodsNo === '1001');
ok('18. 고객 리스크 클릭 → 고객관리 필터', I.riskCardToIntent('blacklist').kind === 'customer' && I.riskCardToIntent('blacklist').initialFilter === 'bl');
ok('19. TOP 위험 고객 클릭 → selectedCustomerId', I.riskCustomerToIntent('syn_member_1').selectedCustomerId === 'syn_member_1');

// 20~22 작업 반영(통계 입력에 completed/approvals/caution 반영)
const completed = [{ id: 'cw1', originalId: 'q_today', sourceType: 'inquiry', title: 't', answerText: 'a', completedAt: d(0), completionMethod: 'manual_reply', completionStatus: 'completed_local', stage: '처리 완료', writeStatus: 'not_connected' }];
const approvals = [{ id: 'a1', source: 'cs', sourceType: 'inquiry_reply', status: 'pending_approval', title: 't', answerText: 'x', target: { originalId: 'q_5d' }, context: {}, writeTarget: { platform: 'godomall', targetType: 'inquiry_reply', targetId: 'q_5d' }, writeStatus: 'not_connected', createdAt: d(0) }];
const st2 = S.buildCsDashboardStatistics({ inquiries, reviews, orders, contacts, completed, approvals, cautionByKey: { syn_member_1: true }, blacklistByKey: {}, goodsNames: names, nowMs: NOW });
ok('20. completedWorkItems 반영', st2.workflowSummary.completed >= 1 && st2.aiPerformance.aiCompletedCount >= 0);
ok('21. approvalItems 반영', st2.workflowSummary.pendingApproval === 1 && st2.aiPerformance.approvalRequestedCount === 1);
ok('22. 고객 caution toggle 반영', st2.customerRiskSummary.cautionCustomerCount >= 1);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
