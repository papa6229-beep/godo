#!/usr/bin/env node
/*
 * scripts/smoke-synthetic-commerce-universe.mjs
 * Synthetic Commerce Universe v1 검증 (결정성·연결성·계약 분리·PII 격리·facts).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-scu-'));
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const emit = (f) =>
  execFileSync(process.execPath, [tscBin, path.join(REPO, f), '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'),
    '--outDir', tmp, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
try {
  emit('api/_shared/syntheticCommerceFacts.ts'); // → universe + catalogBinding + revenue + mapper + ... 함께 emit
  emit('api/_shared/syntheticRevenue.ts');
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
const U = await import(pathToFileURL(path.join(tmp, 'syntheticCommerceUniverse.js')).href);
const F = await import(pathToFileURL(path.join(tmp, 'syntheticCommerceFacts.js')).href);
const L = await import(pathToFileURL(path.join(tmp, 'syntheticRevenue.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const catalog = { categoriesByCode: { '003': { cateCd: '003', cateNm: '오나홀' }, '004': { cateCd: '004', cateNm: '개인가전' } }, brandsByCode: { '001': { brandCd: '001', brandNm: '스마트홈' }, '002': { brandCd: '002', brandNm: '리빙홈' } } };

console.log('=== Synthetic Commerce Universe v1 smoke ===');
const u1 = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
const u1b = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
const u2 = U.buildSyntheticCommerceUniverse(products, { seed: 99, endDate: '2026-06-26' });

ok('1. 같은 seed → 같은 결과', JSON.stringify(u1.meta) === JSON.stringify(u1b.meta) && u1.orders[0]?.orderNo === u1b.orders[0]?.orderNo && u1.orders.length === u1b.orders.length);
ok('2. 다른 seed → 다른 결과', JSON.stringify(u1.meta) !== JSON.stringify(u2.meta) || u1.orders[0]?.orderNo !== u2.orders[0]?.orderNo);
ok('3. 12개월 주문 생성', u1.meta.months === 12 && u1.orders.length > 0);
ok('4. 주문 수 합리적 범위(400~1500)', u1.orders.length >= 400 && u1.orders.length <= 1500);
ok('5. 고객 프로필 생성(320)', u1.customers.length === 320);

const memberKeys = new Set(u1.customers.map((c) => c.memberKey));
ok('6. memberKey가 주문↔고객 연결', u1.orders.some((o) => o.memberKey && memberKeys.has(o.memberKey)));
ok('7. 재구매 고객 존재(orderCount>=2)', u1.customers.some((c) => c.orderCount >= 2));

const facts = F.buildSyntheticCommerceFacts(u1, products, catalog);
ok('8. 평균 객단가 계산', facts.averageOrderValue > 0);
ok('9. 결제수단 분포', facts.paymentMethodDistribution.length > 0 && facts.paymentMethodDistribution.every((d) => d.pct >= 0));
ok('10. 주문채널 분포', facts.orderChannelDistribution.length > 0);
ok('11. 취소/환불/반품/교환 claim 이벤트', u1.orders.some((o) => o.claimSummary && o.claimSummary.hasClaim));
ok('12. claimSummary가 주문에 연결', u1.orders.filter((o) => o.claimSummary).every((o) => Array.isArray(o.claimSummary.claimTypes)));
ok('13. raw claimData 전체 노출 없음', u1.orders.every((o) => !('claimData' in o) && o.lines.every((l) => !('claimData' in l))));

const orderNos = new Set(u1.orders.map((o) => o.orderNo));
ok('14. 리뷰가 synthetic 주문과 연결', u1.reviews.length > 0 && u1.reviews.every((r) => orderNos.has(r.orderNo)));
ok('15. 문의가 상품/주문/customer와 연결', u1.inquiries.length > 0 && u1.inquiries.every((q) => q.orderNo && q.goodsNo && q.memberKey));
ok('16. fake PII contact 생성(고객수와 동일)', u1.contacts.length === u1.customers.length);
ok('17. fake PII 표식(isFakePii/sourceType/syntheticProfile)', u1.contacts.every((c) => c.origin.isFakePii === true && c.origin.sourceType === 'synthetic' && c.origin.syntheticProfile === 'commerce_universe_v1'));

// 18. analytics(orders+facts)에 PII 없음 — fake PII 문자열이 등장하지 않아야
const analyticsJson = JSON.stringify(u1.orders) + JSON.stringify(facts);
ok('18. analytics facts에 PII 미포함', !analyticsJson.includes('가상고객') && !analyticsJson.includes('010-0000') && !analyticsJson.includes('@example.test') && !analyticsJson.includes('샘플로'));

ok('19. 카테고리별 매출 breakdown', facts.categoryRevenue.length > 0 && facts.categoryRevenue.some((c) => c.label === '오나홀' || c.label === '개인가전'));
ok('20. 브랜드별 매출 breakdown', facts.brandRevenue.length > 0 && facts.brandRevenue.some((b) => b.label === '스마트홈' || b.label === '리빙홈'));
ok('21. 리뷰 평점 facts', facts.averageReviewRating > 0 && facts.categoryReviewRating.length > 0);
ok('22. CS 이슈 TOP topic', facts.csTopTopics.length > 0);
ok('23. sourceType=synthetic 표시', u1.meta.sourceType === 'synthetic' && u1.customers.every((c) => c.sourceType === 'synthetic') && u1.reviews.every((r) => r.sourceType === 'synthetic'));
ok('   orders syntheticSource=commerce_universe_v1', u1.orders.every((o) => o.syntheticSource === 'commerce_universe_v1' && o.dataKind === 'synthetic'));

// 24. 기존 syntheticRevenue 무영향
const legacy = L.generateSyntheticRevenueOrders(products, { orderCount: 50 });
ok('24. 기존 syntheticRevenue 무영향', legacy.length > 0 && legacy.every((o) => o.sourceType === 'synthetic_test'));
// 25. universe orders가 RevenueOrder 계약 유지(productTeamChatFacts 호환)
ok('25. universe orders가 RevenueOrder 계약 유지', u1.orders.every((o) => o.orderNo && Array.isArray(o.lines) && o.state && typeof o.productRevenueByLines === 'number'));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail (orders=${u1.orders.length}, customers=${u1.customers.length}, reviews=${u1.reviews.length}, inquiries=${u1.inquiries.length}) ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
