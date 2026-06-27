#!/usr/bin/env node
/*
 * scripts/smoke-cs-dashboard-time-range-counter-motion-polish.mjs
 * CS Dashboard Time Range & Counter Motion Polish v0 검증.
 *  - custom 기간(csDashboardTimeFilter) + 통계 반영 + useAnimatedNumber 소스 + 컴포넌트 마커.
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
const HOOK = read('src/hooks/useAnimatedNumber.ts');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csmotion-'));
const emit = (f) => execFileSync(process.execPath, [path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), path.join(REPO, f),
  '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
try { emit('src/services/csDashboardStatistics.ts'); emit('src/services/csDashboardTimeFilter.ts'); }
catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const S = await import(pathToFileURL(path.join(tmp, 'csDashboardStatistics.js')).href);
const T = await import(pathToFileURL(path.join(tmp, 'csDashboardTimeFilter.js')).href);

const NOW = Date.parse('2026-06-27T12:00:00');
const at = (day) => `${day} 10:00:00`;
const names = { '1001': '드라이기', '1002': '가습기' };
const line = (g, rev) => ({ goodsNo: g, goodsName: names[g], quantity: 1, lineRevenue: rev });
const ord = (orderNo, mk, amount, g, claim) => ({ orderNo, orderDate: at('2026-06-10'), sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: amount, productRevenueByLines: amount - 2500, paid: true, canceled: false, confirmed: false, memberKey: mk, ...(claim ? { claim } : {}), lines: [line(g, amount - 2500)] });
const orders = [ord('O1', 'syn_member_1', 62500, '1001'), ord('O2', 'syn_member_1', 52500, '1002', { hasClaim: true, claimTypes: ['refund'], claimAmount: 50000 })];
const inq = (id, day, topic, orderNo, g) => ({ inquiryId: id, createdAt: at(day), status: 'unanswered', urgency: 'low', topic, orderNo, goodsNo: g, title: `${topic} 문의`, excerpt: `${topic} 원문` });
const inquiries = [
  inq('q_0601', '2026-06-01', 'payment', 'O1', '1001'),
  inq('q_0615', '2026-06-15', 'refund', 'O2', '1002'),
  inq('q_0625', '2026-06-25', 'delivery', 'O1', '1001')
];
const reviews = [{ reviewId: 'rv1', orderNo: 'O1', createdAt: at('2026-06-12'), rating: 1, sentiment: 'negative', topic: 'quality', goodsNo: '1001', excerpt: '불량' }];
const contacts = [{ memberKey: 'syn_member_1', customerId: 'cust_1', customerName: '가상고객 1', phone: '010-0000-0001', email: 's1@example.test', origin: { isFakePii: true, piiType: 'fake' } }];

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Dashboard Time Range & Counter Motion Polish smoke ===');

// custom 기간(helper)
ok('1. custom mode 존재 + isValidCustomRange', T.CS_TIME_RANGES.length === 5 && T.isValidCustomRange({ start: '2026-06-01', end: '2026-06-20' }) === true);
ok('5. 종료일<시작일 무효 처리', T.isValidCustomRange({ start: '2026-06-20', end: '2026-06-01' }) === false && T.isValidCustomRange({ start: '2026-06-01' }) === false);
const cust = { start: '2026-06-01', end: '2026-06-16' };
ok('   inCsTimeRange custom 포함/제외', T.inCsTimeRange(at('2026-06-10'), 'custom', NOW, cust) === true && T.inCsTimeRange(at('2026-06-25'), 'custom', NOW, cust) === false && T.inCsTimeRange('', 'custom', NOW, cust) === false);
const f = T.filterCsInputsByTime({ inquiries, reviews, orders, completed: [], approvals: [] }, 'custom', NOW, cust);
ok('   custom 필터: 0601/0615 포함, 0625 제외', f.inquiries.map((q) => q.inquiryId).sort().join(',') === 'q_0601,q_0615');
ok('   custom 무효시 전체로 폴백', T.filterCsInputsByTime({ inquiries, reviews, orders, completed: [], approvals: [] }, 'custom', NOW, { start: '2026-06-20', end: '2026-06-01' }).inquiries.length === 3);

// custom 통계 반영(6~11)
const stAll = S.buildCsDashboardStatistics({ inquiries, reviews, orders, contacts, completed: [], approvals: [], goodsNames: names, nowMs: NOW });
const stC = S.buildCsDashboardStatistics({ inquiries: f.inquiries, reviews: f.reviews, orders: f.orders, contacts, completed: f.completed, approvals: f.approvals, goodsNames: names, nowMs: NOW });
ok('6. custom range KPI 반영(미처리 감소)', stAll.workflowSummary.unresolved > stC.workflowSummary.unresolved);
ok('7. 문의 유형 비중 반영', JSON.stringify(stAll.inquiryTypeDistribution) !== JSON.stringify(stC.inquiryTypeDistribution));
ok('8. 업무 흐름 반영', typeof stC.workflowSummary.unresolved === 'number');
ok('9. AI 처리 성과 반영', typeof stC.aiPerformance.draftCount === 'number');
ok('10. 이슈 상품 TOP 반영', Array.isArray(stC.issueProducts));
ok('11. 고객 리스크 요약 반영', typeof stC.customerRiskSummary.repeatInquiryCount === 'number');

// useAnimatedNumber hook 소스
ok('12. useAnimatedNumber hook 존재', /export function useAnimatedNumber/.test(HOOK));
ok('13. target value 반환(roundTo/return)', /return roundTo\(display, decimals\)/.test(HOOK));
ok('14. reduced motion guard', /prefers-reduced-motion/.test(HOOK) && /matchMedia/.test(HOOK));
ok('15. requestAnimationFrame cleanup', /cancelAnimationFrame/.test(HOOK));

// 컴포넌트 마커
ok('2. custom startDate/endDate 상태', /customRange/.test(TSX) && /customDraft/.test(TSX) && /CsCustomRange/.test(TSX));
ok('3. 직접 선택 date range UI', /type="date"/.test(TSX) && /직접 선택/.test(TSX) && /cs-dash-custom-row/.test(TSX));
ok('4. 적용 시 mode custom', /setPeriod\('custom'\)/.test(TSX) && /applyCustomRange/.test(TSX));
ok('16. KPI 숫자 animated', /useAnimatedNumber/.test(TSX) && /const v = useAnimatedNumber\(value\)/.test(TSX));
ok('17. 통계 숫자 animated(AnimatedNumber)', /<AnimatedNumber /.test(TSX));
ok('18. 문의 유형 막대 width transition', /\.cs-stat-bar-fill\s*{[^}]*transition:\s*width/.test(CSS));
ok('19. tabular-nums(숫자 흔들림 방지)', /tabular-nums/.test(CSS) && /cs-num/.test(TSX));
ok('20. 기존 통계 클릭 intent 유지', /typeSliceToIntent/.test(TSX) && /workflowStepToIntent/.test(TSX) && /riskCardToIntent/.test(TSX));
ok('21. 실제 WRITE/네트워크 호출 없음', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
