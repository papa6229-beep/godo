#!/usr/bin/env node
/*
 * scripts/smoke-cs-popup-ux-layout-polish.mjs
 * CS Popup UX Layout Polish v0 검증.
 *  - 처리완료 item 강화(질문/이전답변/담당직원/주문/고객) = helper 단위 검증
 *  - 레이아웃/배지/라이트모드 = 소스(TSX/CSS) 구조 마커 검증
 *  - 고객관리 무변경 / WRITE 없음 / PII 게이트 유지
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

// ── helper 컴파일/로드 ──
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-cspolish-'));
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

const names = { '1001': '드라이기', '1002': '모자' };
const line = (goodsNo, rev) => ({ goodsNo, goodsName: names[goodsNo], quantity: 1, lineRevenue: rev });
const orders = [
  { orderNo: 'OA1', orderDate: '2026-05-29 12:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 62500, productRevenueByLines: 60000, paid: true, canceled: false, memberKey: 'syn_member_1', lines: [line('1001', 60000)] }
];
const inquiries = [
  { inquiryId: 'q1', createdAt: '2026-05-20 09:00:00', status: 'answered', urgency: 'low', topic: 'payment', orderNo: 'OA1', goodsNo: '1001', title: '결제 문의', excerpt: '결제가 두 번 된 것 같아요.' },
  { inquiryId: 'q2', createdAt: '2026-06-26 09:00:00', status: 'unanswered', urgency: 'low', topic: 'delivery', orderNo: 'OA1', goodsNo: '1001', title: '배송 문의', excerpt: '언제 도착하나요?' }
];
const reviews = [{ reviewId: 'r1', orderNo: 'OA1', createdAt: '2026-06-20 10:00:00', rating: 5, sentiment: 'positive', topic: 'quality', goodsNo: '1001', excerpt: '좋아요' }];
const contacts = [{ memberKey: 'syn_member_1', customerId: 'cust_1', customerName: '가상고객 1', phone: '010-0000-0001', email: 's1@example.test', origin: { isFakePii: true, piiType: 'fake' } }];

const W = D.buildCsAdminWorkflow({ inquiries, reviews, orders, contacts, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') });
const Wbulk = D.buildCsAdminWorkflow({ inquiries, reviews, orders, goodsNames: names, nowMs: Date.parse('2026-06-27T12:00:00') });
const resolved = W.resolved.items[0];

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /가상고객|010-0000|@example/i;

console.log('=== CS Popup UX Layout Polish smoke ===');

// 레이아웃(CSS)
ok('1. 우측 상세 폭 확대(좌<우 grid 비율)', /\.cs-pop-body\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(380px,\s*1\.25fr\)/.test(CSS));
ok('2. 좌측 카드 컴팩트화(padding 축소)', /\.cs-pop-item\s*{[^}]*padding:\s*[67]px [89]px/.test(CSS));
ok('3. 우측 상세 섹션(cs-pop-sec) 유지', /\.cs-pop-sec\b/.test(CSS) && /cs-pop-sec-title/.test(TSX));

// 처리완료 상세 강화(helper + TSX)
ok('4. 처리완료 item에 질문 원문(questionText)', !!resolved && resolved.questionText === '결제가 두 번 된 것 같아요.');
ok('5. 처리완료 item에 이전 답변(prevAnswer)', !!resolved && /미연동|확인 필요/.test(resolved.prevAnswer || ''));
ok('6. 처리완료 item에 담당직원 필드(handledBy) — 데이터 없으면 미설정', !!resolved && !('handledBy' in resolved && resolved.handledBy));
ok('7. 처리완료 상세 TSX에 질문/이전답변/담당직원 섹션', /질문 내용/.test(TSX) && /이전 답변/.test(TSX) && /담당직원/.test(TSX));
ok('8. 담당직원 placeholder "미기록"', /handledBy \|\| '미기록'/.test(TSX));
ok('9. 처리완료 item에 주문/고객 블록(contacts 경로)', !!resolved.order && resolved.order.matched === true && !!resolved.customer && resolved.customer.isSynthetic === true);

// AI 자동처리함
ok('10. AI함 상세 AI 초안 미리보기 존재', /AI 초안 미리보기/.test(TSX) && /AI 초안 보기/.test(TSX));
ok('11. AI함 등록 버튼이 승인요청(승인큐) 의미 유지 + disabled', /선택 승인요청/.test(TSX) && /전체 승인요청/.test(TSX) && /승인큐/.test(TSX) && /disabled title="승인큐 미연결"/.test(TSX));

// 라이트모드 가독성
ok('12. 라이트 모드 가독성 미디어쿼리 + 진한 amber', /@media \(prefers-color-scheme: light\)/.test(CSS) && /#92600A|#8A5A00|#B8860B/.test(CSS));
ok('13. 유형별 색상/배지 유지', /csTypeColorClass/.test(TSX) && /type-pay|type-claim|type-delivery|type-review/.test(CSS));

// 고객관리 무변경(컴포넌트/팝업 존재 유지)
ok('14. 고객관리 팝업 구조 유지(CsCustomerPopup)', /CsCustomerPopup/.test(TSX) && /고객관리/.test(TSX));

// 정책 유지
ok('15. approval/auto-processing 정책 유지(AI함 리뷰+배송)', W.aiAuto.byType.review >= 1 && W.aiAuto.byType.delivery >= 1 && !W.aiAuto.items.some((i) => i.kind === 'inquiry' && i.topic === 'payment'));
ok('16. 실제 WRITE 호출 없음(승인 버튼 disabled, 네트워크 호출 없음)', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX) && /disabled/.test(TSX));
ok('17. CS UI 고객정보 표시 유지(contacts 경로 PII 채움)', !!resolved.customer?.name && !!resolved.customer?.phone);
ok('18. AI/분석 경로(contacts 없음) PII 차단', (() => { const r0 = Wbulk.resolved.items[0]; return !r0.customer && !PII_RE.test(JSON.stringify(Wbulk.resolved)) && !PII_RE.test(JSON.stringify(Wbulk.customers)); })());

// 무회귀: 기존 detail helper
ok('19. buildCsDetailItem 무회귀(order.matched 포함)', (() => { const d = D.buildCsDetailItem(W.unresolved.items[0], { orders, contacts, goodsNames: names }); return !!d.order && typeof d.flags.orderLinked === 'boolean'; })());

console.log('\n--- resolved[0] ---');
console.log('question:', resolved.questionText, '| handledBy:', resolved.handledBy ?? '(미설정→미기록)', '| order.matched:', resolved.order?.matched, '| customer.name 존재:', !!resolved.customer?.name);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
