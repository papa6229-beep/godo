#!/usr/bin/env node
/*
 * scripts/smoke-cs-chat-inquiry-detail-context.mjs
 * CS 채팅 context에 safe inquiry/review detail shortlist가 들어가고 PII가 없는지 검증.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csdetail-'));
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

// ── bundle 재료(최소) ──
const orders = [];
const yms = [];
for (let m = 7; m <= 12; m++) yms.push(`2025-${String(m).padStart(2, '0')}`);
for (let m = 1; m <= 6; m++) yms.push(`2026-${String(m).padStart(2, '0')}`);
let idx = 0;
for (const ym of yms) for (let k = 0; k < 6; k++) {
  idx += 1;
  const goodsNo = ['1000', '1001', '1002'][idx % 3];
  const rev = 10000 + (idx % 5) * 1000;
  const claim = idx % 7 === 0 ? { hasClaim: true, claimTypes: ['refund'], claimAmount: rev } : undefined;
  orders.push({ orderNo: `${ym}-${k}`, orderDate: `${ym}-15 10:00:00`, totalAmount: rev + 2500, productRevenueByLines: rev, deliveryFee: 2500, paid: true, canceled: false, memberKey: `syn_member_${(idx % 10) + 1}`, paymentMethodCode: 'pc', orderChannel: 'shop', claim, lines: [{ goodsNo, goodsName: { '1000': '세트상품', '1001': '티셔츠', '1002': '모자' }[goodsNo], quantity: 1, lineRevenue: rev, categoryCode: '003', brandCode: '001' }] });
}
const reviewsForBundle = Array.from({ length: 12 }, (_, i) => ({ goodsNo: ['1000', '1001', '1002'][i % 3], rating: (i % 5) + 1, sentiment: ['positive', 'neutral', 'negative'][i % 3], topic: 'quality' }));
const inquiriesForBundle = Array.from({ length: 10 }, (_, i) => ({ goodsNo: ['1000', '1001', '1002'][i % 3], topic: 'delivery', status: 'unanswered', urgency: 'high' }));
const bundle = R.buildDepartmentFactsBundleFromUniverse({ orders, customers: [], reviews: reviewsForBundle, inquiries: inquiriesForBundle, catalog: { categoriesByCode: {}, brandsByCode: {} }, source: { dataKind: 'synthetic', syntheticSource: 'commerce_universe_v1' } }, { generatedAt: '2026-06-26' });

// ── csDetail (safe, PII 없음) ──
const goodsNames = { '1000': '세트상품', '1001': '티셔츠', '1002': '모자' };
const mkInq = (id, date, status, urgency, topic, goodsNo, title, excerpt) => ({ inquiryId: id, createdAt: date, status, urgency, topic, goodsNo, title, excerpt });
const inquiries = [
  mkInq('q1', '2026-06-20 09:00:00', 'unanswered', 'medium', 'delivery', '1001', '배송 일정 문의', '출고 예정일 확인 요청'),
  mkInq('q2', '2026-06-25 14:20:00', 'unanswered', 'high', 'refund', '1002', '환불 처리 문의', '결제 취소 후 환불 진행 상태 확인'),
  mkInq('q3', '2026-06-22 10:00:00', 'unanswered', 'low', 'payment', '1000', '결제 문의', '중복결제 확인 요청'),
  mkInq('q4', '2026-06-18 08:00:00', 'unanswered', 'high', 'exchange', '1001', '교환 문의', '사이즈 교환'),
  mkInq('q5', '2026-06-17 08:00:00', 'needs_human', 'medium', 'stock', '1002', '재입고 문의', '재입고 예정일'),
  mkInq('q6', '2026-06-16 08:00:00', 'unanswered', 'low', 'coupon', '1000', '쿠폰 문의', '쿠폰 적용 안됨'),
  mkInq('q7', '2026-06-15 08:00:00', 'unanswered', 'medium', 'delivery', '1001', '배송 문의', '배송지 변경'),
  mkInq('q8', '2026-06-26 08:00:00', 'answered', 'low', 'product_question', '1000', '상품 문의', '사용법')
];
const reviews = [
  { reviewId: 'r1', createdAt: '2026-06-24 10:00:00', rating: 1, sentiment: 'negative', topic: 'effect', goodsNo: '1002', excerpt: '효과가 미흡합니다' },
  { reviewId: 'r2', createdAt: '2026-06-20 10:00:00', rating: 5, sentiment: 'positive', topic: 'quality', goodsNo: '1001', excerpt: '만족합니다' },
  { reviewId: 'r3', createdAt: '2026-06-23 10:00:00', rating: 2, sentiment: 'neutral', topic: 'delivery', goodsNo: '1000', excerpt: '배송이 지연됐어요' }
];
const csDetail = { inquiries, reviews, goodsNames };

const cs = CF.buildDepartmentChatContext('cs', bundle, csDetail);
const prod = CF.buildDepartmentChatContext('product', bundle);
const mkt = CF.buildDepartmentChatContext('marketing', bundle);
const mgr = CF.buildDepartmentChatContext('manager', bundle);
const note = cs.contextNote;
const PII_RE = /customerName|recipientName|receiverName|refundAccount|refundBank|deliveryMemo|010-|@example|샘플로|가상고객|phone|email|address/i;
const section = (title) => { const s = note.indexOf(`[${title}]`); if (s < 0) return ''; const e = note.indexOf('\n[', s + 1); return note.slice(s, e < 0 ? undefined : e); };

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Chat Inquiry Detail Context smoke ===');
const unSec = section('최근 미답변 문의 목록');
ok('1. CS context에 최근 미답변 문의 목록 포함', unSec.length > 0 && /환불 처리 문의/.test(unSec));
ok('2. 미답변 문의 createdAt 내림차순', unSec.indexOf('2026-06-25') < unSec.indexOf('2026-06-22') && unSec.indexOf('2026-06-22') < unSec.indexOf('2026-06-20'));
ok('3. 미답변 목록 최대 5건', (unSec.match(/^\d+\. /gm) || []).length <= 5 && (unSec.match(/^\d+\. /gm) || []).length === 5);
ok('4. 미답변 항목에 status/topic/title/excerpt/productName 포함', /미답변/.test(unSec) && /refund|환불/.test(unSec) && /환불 처리 문의/.test(unSec) && /환불 진행 상태 확인/.test(unSec) && /모자/.test(unSec));
ok('5. 미답변 항목에 연락처/계좌 PII 없음', !PII_RE.test(unSec));
ok('6. CS context에 긴급 문의 목록 포함', section('긴급 문의 목록').length > 0 && /환불 처리 문의/.test(section('긴급 문의 목록')));
ok('7. CS context에 저평점/부정 리뷰 목록 포함', /저평점\/부정 리뷰 목록/.test(note) && /모자/.test(section('저평점/부정 리뷰 목록')) && /1점/.test(section('저평점/부정 리뷰 목록')));
ok('8. "조회 불가" fallback 안 함', !/조회할 수 없|고도몰 CS 관리자에서 직접 확인/.test(note) && /조회할 수 없.*1차 답변으로 쓰지 마라|"조회할 수 없다".*쓰지 마라/.test(cs.answerGuidance));
ok('9. 답변 근거에 개별 safe inquiry 항목 존재', (unSec.match(/^\d+\. /gm) || []).length >= 1 && /제목 .* · 요약 /.test(unSec));
ok('10. CS context 전체에 고객 연락처/주소/계좌 없음', !/010-|@example|refundAccount|deliveryMemo|customerName|address/i.test(note));
ok('11. 긴급 문의 항목이 urgency high 기반', /높음/.test(section('긴급 문의 목록')) && !/q3|결제 문의/.test(section('긴급 문의 목록')));
ok('12. 저평점 리뷰가 rating<=2/negative 기반', !/만족합니다/.test(section('저평점/부정 리뷰 목록')) && /효과가 미흡|배송이 지연/.test(section('저평점/부정 리뷰 목록')));
ok('13. product/marketing/manager context에 inquiry detail PII 없음', !PII_RE.test(prod.contextNote) && !PII_RE.test(mkt.contextNote) && !PII_RE.test(mgr.contextNote) && !/최근 미답변 문의 목록/.test(prod.contextNote));
ok('   빈 inquiry → 조회불가 아닌 "찾지 못함" 안내', (() => { const c = CF.buildDepartmentChatContext('cs', bundle, { inquiries: [], reviews: [] }); return /조건에 맞는 문의를 찾지 못/.test(c.answerGuidance) || /현재 safe 미답변 문의 없음/.test(c.contextNote); })());
ok('   CS 이슈 상품 섹션 포함', /CS 이슈 상품/.test(note));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
