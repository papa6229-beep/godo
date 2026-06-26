#!/usr/bin/env node
/*
 * scripts/smoke-department-chat-wiring.mjs
 * 부서 채팅 wiring 검증: DepartmentFactsBundle 슬라이스 → 팀별 chat context(역할 경계 + PII 격리).
 * (실제 LLM 호출 대신, reply를 결정하는 contextNote/answerGuidance를 검증)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-dcw-'));
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

// ── 데이터셋 ──
const yms = [];
for (let m = 7; m <= 12; m++) yms.push(`2025-${String(m).padStart(2, '0')}`);
for (let m = 1; m <= 6; m++) yms.push(`2026-${String(m).padStart(2, '0')}`);
const orders = [];
let idx = 0;
for (const ym of yms) for (let k = 0; k < 8; k++) {
  idx += 1;
  const goodsNo = idx % 3 === 0 ? '1000' : idx % 2 === 0 ? '1001' : '1002';
  const rev = 10000 + (idx % 5) * 1000;
  let claim;
  if (idx % 7 === 0) claim = { hasClaim: true, claimTypes: ['refund'], claimAmount: rev };
  else if (idx % 11 === 0) claim = { hasClaim: true, claimTypes: ['return'], claimAmount: rev };
  orders.push({ orderNo: `${ym}-${k}`, orderDate: `${ym}-15 10:00:00`, totalAmount: rev + 2500, productRevenueByLines: rev, deliveryFee: 2500, paid: true, canceled: false, memberKey: `syn_member_${(idx % 10) + 1}`, paymentMethodCode: ['pc', 'gb', 'pn'][idx % 3], orderChannel: ['shop', 'naverpay'][idx % 2], claim, lines: [{ goodsNo, goodsName: `상품${goodsNo}`, quantity: 1 + (idx % 3), lineRevenue: rev, categoryCode: '003', brandCode: '001' }] });
}
const customers = Array.from({ length: 10 }, (_, i) => ({ memberKey: `syn_member_${i + 1}`, segment: ['new', 'returning', 'vip_candidate', 'dormant_risk', 'discount_sensitive', 'high_refund_risk'][i % 6], firstOrderDate: '2025-07-01', lastOrderDate: '2026-06-01', orderCount: 4, totalRevenue: 80000, totalPaidAmount: 80000, averageOrderValue: 20000, claimCount: i % 3, reviewCount: i % 2, inquiryCount: i % 2 }));
const reviews = Array.from({ length: 20 }, (_, i) => ({ reviewId: `rev_${i}`, orderNo: `o${i}`, goodsNo: ['1000', '1001', '1002'][i % 3], productId: ['1000', '1001', '1002'][i % 3], categoryCode: '003', brandCode: '001', rating: (i % 5) + 1, sentiment: ['positive', 'neutral', 'negative'][i % 3], topic: ['quality', 'delivery', 'refund'][i % 3], createdAt: '2025-08-01', excerpt: '만족 · 품질 관련 후기' }));
const inquiries = Array.from({ length: 15 }, (_, i) => ({ inquiryId: `inq_${i}`, orderNo: `o${i}`, goodsNo: ['1000', '1001', '1002'][i % 3], productId: ['1000', '1001', '1002'][i % 3], categoryCode: '003', topic: ['delivery', 'refund', 'payment'][i % 3], status: ['unanswered', 'answered', 'needs_human'][i % 3], urgency: ['low', 'medium', 'high'][i % 3], createdAt: '2025-08-01', title: '문의', excerpt: '배송 문의' }));
const contactsForCsOnly = Array.from({ length: 10 }, (_, i) => ({ customerId: `cust_${i}`, memberKey: `syn_member_${i + 1}`, customerName: `가상고객 ${i}`, phone: `010-0000-000${i}`, address: `서울시 테스트구 샘플로 ${i}`, origin: { isSynthetic: true, isFakePii: true, piiType: 'fake', sourceType: 'synthetic', syntheticProfile: 'commerce_universe_v1' } }));
const catalog = { categoriesByCode: { '003': { cateCd: '003', cateNm: '오나홀' } }, brandsByCode: { '001': { brandCd: '001', brandNm: '스마트홈' } } };

const bundle = R.buildDepartmentFactsBundleFromUniverse({ orders, customers, reviews, inquiries, contactsForCsOnly, catalog, source: { dataKind: 'synthetic', syntheticSource: 'commerce_universe_v1' } }, { generatedAt: '2026-06-26' });

const prod = CF.buildDepartmentChatContext('product', bundle);
const cs = CF.buildDepartmentChatContext('cs', bundle);
const mkt = CF.buildDepartmentChatContext('marketing', bundle);
const mgr = CF.buildDepartmentChatContext('manager', bundle);
const all = (c) => `${c.contextNote}\n${c.answerGuidance}`;
const PII_RE = /customerName|recipientName|receiverName|refundAccount|refundBank|deliveryMemo|010-0000|@example|샘플로|가상고객|가상수령자/;

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== Department Chat Wiring v0 smoke ===');
ok('1. DepartmentFactsBundleFromUniverse 생성', !!bundle.productTeam && !!bundle.csTeam && !!bundle.marketingTeam && !!bundle.manager);
ok('2. product chat이 productTeam facts만 사용', !!prod && /상품팀 매출\/상품 통계/.test(prod.contextNote) && !/문의|리뷰 감정|inquiry/i.test(prod.contextNote));
ok('3. product chat이 마케팅 제안 안 함', /마케팅 전략.*제안하지 마라|마케팅.*제안하지 마라/.test(prod.answerGuidance) && !/제안 후보/.test(prod.contextNote));
ok('4. cs chat이 csTeam facts 사용', !!cs && /CS팀 문의\/리뷰\/클레임/.test(cs.contextNote));
ok('5. cs chat이 마케팅 제안 안 함', /마케팅.*제안하지 마라/.test(cs.answerGuidance) && !/제안 후보/.test(cs.contextNote));
ok('6. cs fake contact가 synthetic/fake metadata 유지', bundle.csTeam.fakeContacts.length === 10 && bundle.csTeam.fakeContacts.every((c) => c.origin.isFakePii === true && c.origin.piiType === 'fake' && c.origin.syntheticProfile === 'commerce_universe_v1'));
ok('7. marketing chat이 product handoff + CS handoff 사용', /상품팀 전달 자료/.test(mkt.contextNote) && /CS팀 전달 자료/.test(mkt.contextNote));
ok('8. recommendationCandidates는 marketing만 설명', /제안 후보/.test(mkt.contextNote) && !/제안 후보/.test(prod.contextNote) && !/제안 후보/.test(cs.contextNote));
ok('9. marketing chat이 requires_external_data 안내', /필요 데이터.*adSpend|adSpend/.test(mkt.contextNote) || /ROAS.*adSpend/.test(mkt.answerGuidance));
ok('10. manager chat이 executiveSummary 사용', /총괄 요약 지표/.test(mgr.contextNote));
ok('11. manager chat이 approvalQueueCandidates 표시', /승인 대기 후보/.test(mgr.contextNote) && bundle.manager.approvalQueueCandidates.length > 0);
ok('12. manager chat이 실제 실행했다고 말하지 않음', /실제 실행.*말하지 마라/.test(mgr.answerGuidance));
ok('13. product/marketing/manager context에 PII 없음', !PII_RE.test(all(prod)) && !PII_RE.test(all(mkt)) && !PII_RE.test(all(mgr)));
ok('14. source metadata commerce_universe_v1 유지', /commerce_universe_v1/.test(prod.contextNote) && /commerce_universe_v1/.test(mkt.contextNote) && bundle.meta.syntheticSource === 'commerce_universe_v1');
ok('   toChatTeam(hq)=manager', CF.toChatTeam('hq') === 'manager' && CF.toChatTeam('product') === 'product');
ok('   bundle 없으면 context null(fallback)', CF.buildDepartmentChatContext('cs', null) === null);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
