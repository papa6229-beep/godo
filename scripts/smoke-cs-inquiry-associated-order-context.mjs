#!/usr/bin/env node
/*
 * scripts/smoke-cs-inquiry-associated-order-context.mjs
 * CS Inquiry Associated Order Context Patch v0 + CS Response Evidence Policy v0 검증.
 *  - CS context에 [연결 주문 facts] 섹션이 붙고(결제/금액/클레임/중복후보/missingData),
 *    facts 없으면 확정표현 금지 policy가 들어가며, 타 팀엔 섞이지 않고 PII가 없는지 검증.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csassoc-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'departmentChatFacts.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const CF = await import(pathToFileURL(path.join(tmp, 'departmentChatFacts.js')).href);
const R = await import(pathToFileURL(path.join(tmp, 'departmentFactsRouting.js')).href);

// ── orders(RevenueOrderLite 호환) ──
const goodsNames = { '1001': '티셔츠', '1002': '모자', '1003': '세트상품' };
const line = (goodsNo, rev, qty = 1) => ({ goodsNo, goodsName: goodsNames[goodsNo], quantity: qty, lineRevenue: rev, categoryCode: '003', brandCode: '001' });
const orders = [
  // 매칭 + 클레임(return, cancel)
  { orderNo: 'O-1001', orderDate: '2026-06-25 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 62500, productRevenueByLines: 60000, paid: true, unpaid: false, confirmed: true, canceled: true, memberKey: 'syn_member_100001', paymentMethodCode: 'pc', orderChannel: 'shop', claim: { hasClaim: true, claimTypes: ['return', 'cancel'], claimAmount: 60000 }, lines: [line('1002', 60000)] },
  // 매칭 + 정상
  { orderNo: 'O-2001', orderDate: '2026-06-24 09:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 32500, productRevenueByLines: 30000, paid: true, unpaid: false, confirmed: false, canceled: false, memberKey: 'syn_member_100002', paymentMethodCode: 'pc', orderChannel: 'shop', lines: [line('1001', 30000)] },
  // 중복결제 후보 쌍(같은 memberKey/금액/근접시간)
  { orderNo: 'O-DUP1', orderDate: '2026-06-22 14:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, unpaid: false, confirmed: false, canceled: false, memberKey: 'syn_member_100009', paymentMethodCode: 'pc', orderChannel: 'shop', lines: [line('1001', 10000)] },
  { orderNo: 'O-DUP2', orderDate: '2026-06-22 14:06:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, unpaid: false, confirmed: false, canceled: false, memberKey: 'syn_member_100009', paymentMethodCode: 'pc', orderChannel: 'shop', lines: [line('1001', 10000)] }
];

// ── inquiries(safe, orderNo 보유) ──
const mkInq = (id, date, status, urgency, topic, orderNo, goodsNo, title, excerpt) => ({ inquiryId: id, createdAt: date, status, urgency, topic, orderNo, goodsNo, title, excerpt });
const inquiries = [
  mkInq('q1', '2026-06-25 11:00:00', 'unanswered', 'high', 'refund', 'O-1001', '1002', '환불 처리 문의', '환불 진행 상태 확인'),
  mkInq('q2', '2026-06-22 15:00:00', 'unanswered', 'medium', 'payment', 'O-DUP1', '1001', '결제 문의', '결제가 두 번 된 것 같아요'),
  mkInq('q3', '2026-06-24 10:00:00', 'unanswered', 'low', 'delivery', 'O-2001', '1001', '배송 문의', '출고 예정일'),
  mkInq('q4', '2026-06-26 08:00:00', 'unanswered', 'high', 'exchange', 'NO-SUCH-ORDER', '1003', '교환 문의', '사이즈 교환'),
  mkInq('q5', '2026-06-20 08:00:00', 'needs_human', 'medium', 'stock', 'O-2001', '1001', '재입고 문의', '재입고 예정일'),
  mkInq('q6', '2026-06-19 08:00:00', 'answered', 'low', 'product_question', 'O-2001', '1001', '상품 문의', '사용법')
];
const reviews = [
  { reviewId: 'r1', createdAt: '2026-06-24 10:00:00', rating: 1, sentiment: 'negative', topic: 'effect', goodsNo: '1002', excerpt: '효과 미흡' }
];

// bundle(역할 경계 검증용) — orders+reviews+inquiries로 생성.
const bundle = R.buildDepartmentFactsBundleFromUniverse({ orders, customers: [], reviews: [{ goodsNo: '1002', rating: 1, sentiment: 'negative', topic: 'effect' }], inquiries: [{ goodsNo: '1002', topic: 'refund', status: 'unanswered', urgency: 'high' }], catalog: { categoriesByCode: {}, brandsByCode: {} }, source: { dataKind: 'synthetic', syntheticSource: 'commerce_universe_v1' } }, { generatedAt: '2026-06-27' });

const csDetail = { inquiries, reviews, orders, goodsNames };
const cs = CF.buildDepartmentChatContext('cs', bundle, csDetail);
const prod = CF.buildDepartmentChatContext('product', bundle);
const mkt = CF.buildDepartmentChatContext('marketing', bundle);
const mgr = CF.buildDepartmentChatContext('manager', bundle);
const note = cs.contextNote;
const guide = cs.answerGuidance;

const sectionOf = (title) => { const s = note.indexOf(`[${title}]`); if (s < 0) return ''; const e = note.indexOf('\n[', s + 1); return note.slice(s, e < 0 ? undefined : e); };
const conn = sectionOf('연결 주문 facts');
const PII_RE = /customerName|receiverName|refundAccount|refundBank|deliveryMemo|010-0000|@example|샘플로|가상고객|가상수령자|phone|email|address|isFakePii/i;

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Inquiry Associated Order Context smoke ===');

ok('1. CS detail context가 inquiries+orders를 함께 수용', !!cs && note.length > 0 && conn.length > 0);
ok('2. 최근 미답변 문의에 associatedOrderFacts 연결(q1 orderNo)', /O-1001/.test(conn) && /문의ID q1/.test(conn));
ok('3. matched=true 항목 존재(주문 매칭: 예)', /주문 매칭: 예/.test(conn));
ok('4. orderAmount/goodsAmount/deliveryCharge/paid 추출', /결제완료/.test(conn) && /62,500원/.test(conn) && /60,000원/.test(conn) && /배송비 2,500원/.test(conn));
ok('5. claimSummary.claimTypes 추출(return, cancel)', /클레임 .*return/.test(conn) && /cancel/.test(conn) && /claimAmount 60,000원/.test(conn));
ok('6. paymentDate 없음 표시 + missingData에 paymentDate', /결제일 현재 연결 데이터에 없음/.test(conn) && /missingData:.*paymentDate/.test(conn));
ok('7. PG/transaction/card/log 한계 missingData 표시', /transactionId/.test(conn) && /cardApprovalNo/.test(conn) && /paymentAttemptLog/.test(conn) && /pgApprovalNo/.test(conn));
ok('8. duplicatePaymentCandidates 계산(q2 → O-DUP2 후보)', /중복결제 점검/.test(conn) && /O-DUP2/.test(conn));
ok('9. associatedOrderFacts/CS context에 PII 없음', !PII_RE.test(note));
ok('10. fake contact 혼입 없음', !/가상고객|010-0000|@example|isFakePii/i.test(conn) && !/syn_member_/.test(conn));
ok('11. CS context에 "연결 주문 facts" 섹션 포함', /\[연결 주문 facts\]/.test(note));
ok('12. product/marketing/manager context에 associatedOrderFacts 없음', !/연결 주문 facts|주문 매칭:/.test(prod.contextNote) && !/연결 주문 facts|주문 매칭:/.test(mkt.contextNote) && !/연결 주문 facts|주문 매칭:/.test(mgr.contextNote));
ok('13. facts 없을 때 확정표현 금지 policy(guidance)', /확인한 결과/.test(guide) && /중복결제가 아닙니다/.test(guide) && /환불 처리되었습니다/.test(guide) && /취소 완료되었습니다/.test(guide) && /확정 표현을 절대 쓰지 마라/.test(guide));
ok('14. 중복결제 guidance에 PG 원장 확인 필요 문구', /결제 원장/.test(guide) && /(PG 승인번호|PG 승인내역)/.test(guide) && /transaction id/.test(guide));
ok('15. 기존 CS shortlist 기능 유지(미답변 목록 + 항목)', /\[최근 미답변 문의 목록\]/.test(note) && /환불 처리 문의/.test(note) && /저평점\/부정 리뷰 목록/.test(note));

// 추가: 매칭 실패(q4 NO-SUCH-ORDER) → 주문 매칭: 아니오
ok('16. 미매칭 문의는 "주문 매칭: 아니오"로 표시', /NO-SUCH-ORDER · 주문 매칭: 아니오/.test(conn));
// 추가: orders 없이 호출 시 안내 + 기존 기능 유지
const csNoOrders = CF.buildDepartmentChatContext('cs', bundle, { inquiries, reviews, goodsNames });
ok('17. orders 미전달 시 안내(대조 불가) + shortlist 유지', /주문 데이터가 연결되지 않아/.test(csNoOrders.contextNote) && /\[최근 미답변 문의 목록\]/.test(csNoOrders.contextNote));

console.log(`\n--- 연결 주문 facts 섹션 미리보기 ---\n${conn.slice(0, 700)}`);
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
