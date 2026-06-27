#!/usr/bin/env node
/*
 * scripts/smoke-cs-customer-management-profile-hub.mjs
 * CS Customer Management Profile Hub v0 검증.
 *  - buildCsCustomerProfileHub(순수): 요약/기본/주문/문의·리뷰/클레임/관리 + completed 병합 + PII 게이트
 *  - 컴포넌트 소스: 좌우 구조/탭/검색/클릭 상세/블랙리스트 내부/WRITE 없음
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const TSX = read('src/components/CsTeamDashboard.tsx');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-cshub-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'csCustomerManagementFacts.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const H = await import(pathToFileURL(path.join(tmp, 'csCustomerManagementFacts.js')).href);

const names = { '1001': '드라이기', '1002': '모자', '1003': '세트' };
const line = (g, rev) => ({ goodsNo: g, goodsName: names[g], quantity: 1, lineRevenue: rev });
const ord = (orderNo, mk, amount, g, claim, canceled) => ({ orderNo, orderDate: '2026-05-20 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: amount, productRevenueByLines: amount - 2500, paid: true, canceled: !!canceled, confirmed: false, memberKey: mk, ...(claim ? { claim } : {}), lines: [line(g, amount - 2500)] });
const orders = [
  ord('OA1', 'syn_member_1', 62500, '1001'),
  ord('OA2', 'syn_member_1', 52500, '1002', { hasClaim: true, claimTypes: ['refund'], claimAmount: 50000 }),
  ord('OA3', 'syn_member_1', 12500, '1002', { hasClaim: true, claimTypes: ['cancel'] }, true),
  ord('OB1', 'syn_member_2', 9000, '1003')
];
const inq = (id, date, status, topic, orderNo, g) => ({ inquiryId: id, createdAt: date, status, urgency: 'low', topic, orderNo, goodsNo: g, title: `${topic} 문의`, excerpt: `${topic} 관련 원문` });
const inquiries = [
  inq('q1', '2026-06-26 09:00:00', 'unanswered', 'payment', 'OA1', '1001'),
  inq('q2', '2026-06-25 09:00:00', 'answered', 'refund', 'OA2', '1002'),
  inq('q3', '2026-06-20 09:00:00', 'unanswered', 'delivery', 'OA3', '1002')
];
const reviews = [{ reviewId: 'rv1', orderNo: 'OA1', createdAt: '2026-06-22 10:00:00', rating: 2, sentiment: 'negative', topic: 'quality', goodsNo: '1001', excerpt: '품질 아쉬움' }];
const contacts = [{ memberKey: 'syn_member_1', customerId: 'cust_1', customerName: '가상고객 1', phone: '010-0000-0001', email: 's1@example.test', address: '서울시 테스트구', origin: { isFakePii: true, piiType: 'fake' } }];
const completed = [{ id: 'cw_inquiry_q1', originalId: 'q1', sourceType: 'inquiry', title: '결제 문의', answerText: '결제 1건 확인됩니다.', assignee: 'CS팀장', completedAt: '2026-06-27 12:00:00', completionMethod: 'manual_reply', completionStatus: 'completed_local', stage: '처리 완료', writeStatus: 'not_connected' }];

const hub = H.buildCsCustomerProfileHub({ inquiries, reviews, orders, contacts, completed, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') });
const hubNoPii = H.buildCsCustomerProfileHub({ inquiries, reviews, orders, completed, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') });
const m1 = hub.items.find((x) => x.memberKey === 'syn_member_1');

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /가상고객|010-0000|@example|테스트구/i;

console.log('=== CS Customer Management Profile Hub smoke ===');

// 컴포넌트 소스 구조
ok('1. 좌 리스트/우 프로필 구조(cs-pop-body-cust)', /cs-pop-body cs-pop-body-cust/.test(TSX) && /CsCustomerProfilePopup/.test(TSX));
ok('2. 상단 필터 탭', /반복문의|블랙리스트 후보/.test(TSX) && /cs-pop-tabs/.test(TSX));
ok('3. 고객 검색 입력', /cs-pop-search/.test(TSX) && /고객명, ID, 연락처, 주문번호로 검색/.test(TSX));
ok('5. 프로필 탭(요약/기본정보/주문내역/문의리뷰/클레임/메모관리)', /'summary'/.test(TSX) && /기본정보/.test(TSX) && /주문내역/.test(TSX) && /문의\/리뷰/.test(TSX) && /클레임/.test(TSX) && /메모\/관리상태/.test(TSX));
ok('9+11+12+14. 주문/문의/리뷰/클레임 클릭 상세(setDetail)', /setDetail\(\{ kind: 'order'/.test(TSX) && /kind: 'inquiry'/.test(TSX) && /kind: 'review'/.test(TSX) && /kind: 'claim'/.test(TSX));
ok('15+16. 주의/블랙리스트 toggle', /주의 고객으로 표시/.test(TSX) && /블랙리스트 후보로 표시/.test(TSX));
ok('17. 블랙리스트는 고객관리 내부 필터/태그(별도 KPI 아님)', /블랙리스트 후보/.test(TSX) && !/label="블랙리스트"[^]*KpiCard/.test(TSX));
ok('25. 실제 WRITE/네트워크 호출 없음', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX));
ok('26. writeTarget 구조 준비', /writeTargets/.test(TSX));

// helper 동작
ok('4. 좌측 카드용 데이터(이름/ID/연락처/주문/문의/클레임/위험도)', !!m1 && !!m1.basic.name && !!m1.basic.memberId && typeof m1.summary.orderCount === 'number' && typeof m1.summary.inquiryCount === 'number' && typeof m1.summary.claimCount === 'number' && ['low', 'medium', 'high'].includes(m1.summary.riskLevel));
ok('6. 요약 핵심 지표', m1.summary.orderCount === 3 && m1.summary.totalOrderAmount > 0 && typeof m1.summary.recentYearOrderAmount === 'number' && m1.summary.claimCount >= 2);
ok('7. 기본정보(미연동 필드는 undefined)', m1.basic.memberType === '회원' && m1.basic.nickname === undefined && m1.basic.memberGrade === undefined);
ok('8+9. 주문내역 + 주문 상세(items)', m1.orders.length === 3 && m1.orders.every((o) => Array.isArray(o.items)) && m1.orders.some((o) => o.hasClaim));
ok('10+11. 문의 + completed 병합(answerText/assignee/completedAt/writeStatus)', (() => { const q = m1.inquiries.find((x) => x.inquiryId === 'q1'); return q && q.answerText === '결제 1건 확인됩니다.' && q.assignee === 'CS팀장' && q.completedAt === '2026-06-27 12:00:00' && q.writeStatus === 'not_connected'; })());
ok('12. 리뷰 이력(별점/감성/원문)', m1.reviews.length === 1 && m1.reviews[0].rating === 2 && !!m1.reviews[0].bodyText);
ok('13+14. 클레임 이력(환불/취소)', m1.claims.length >= 2 && m1.claims.some((c) => /환불/.test(c.type)) && m1.claims.some((c) => /취소/.test(c.type)));
ok('18+19. completedWorkItems 반영 + 표시 필드', m1.inquiries.some((q) => q.answerText && q.assignee && q.completedAt));
ok('20. CS UI(contacts)에서 고객정보 표시', !!m1.basic.name && !!m1.basic.phone && !!m1.basic.email && m1.isSynthetic === true);
ok('21+22+23. AI/분석 경로(contacts 없음) PII 없음', (() => { const x = hubNoPii.items.find((i) => i.memberKey === 'syn_member_1'); return x && !x.basic.name && !x.basic.phone && !PII_RE.test(JSON.stringify(hubNoPii)); })());
ok('24. fake/synthetic 배지(isSynthetic)', m1.isSynthetic === true);
ok('   blacklist는 byTag(내부)로 집계', typeof hub.byTag.blacklist === 'number' && typeof hub.byTag.watch === 'number');
ok('   검색(searchCustomerProfiles) 동작', H.searchCustomerProfiles(hub.items, 'OA1').length >= 1 && H.searchCustomerProfiles(hub.items, '없는검색어zzz').length === 0);

console.log('\n--- m1 summary ---');
console.log(JSON.stringify({ orders: m1.summary.orderCount, claims: m1.summary.claimCount, risk: m1.summary.riskLevel, tags: m1.tags, completedMerged: !!m1.inquiries.find((q) => q.answerText) }));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
