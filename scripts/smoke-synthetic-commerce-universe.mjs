#!/usr/bin/env node
/*
 * scripts/smoke-synthetic-commerce-universe.mjs
 * Synthetic Commerce Universe v1 검증 (결정성·연결성·계약 분리·PII 격리·facts).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
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
  // Local migration 5(2026-07-30): 제품 소비자 0건이던 syntheticCommerceFacts.ts 를 제거했다.
  //   활성 생성 모듈 두 개를 직접 emit 한다(각자의 의존을 함께 끌어온다).
  emit('api/_shared/syntheticCommerceUniverse.ts');
  emit('api/_shared/syntheticRevenue.ts');
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
const U = await import(pathToFileURL(path.join(tmp, 'syntheticCommerceUniverse.js')).href);
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

// ── 8~10 · 19~22 는 삭제한 facts helper 의 **계산 결과**를 보던 단언이었다.
//    helper 가 없어졌다고 빈 값에 통과시키지 않고, 그 계산이 **성립할 수 있는 원본 사실**
//    (universe 가 실제로 만들어 내는 필드와 연결)을 살아 있는 계약으로 검사한다.
const paidOrders = u1.orders.filter((o) => o.state?.paid);
const aov = paidOrders.length
  ? Math.round(paidOrders.reduce((s, o) => s + (o.totalAmount || 0), 0) / paidOrders.length) : 0;
ok('8. 객단가를 산출할 금액 원본이 보존된다(결제완료 주문 + totalAmount>0)',
  paidOrders.length > 0 && paidOrders.every((o) => typeof o.totalAmount === 'number') && aov > 0);

const payKeys = new Set(u1.orders.map((o) => o.paymentMethodCode || o.settleKind).filter(Boolean));
ok('9. 결제수단 원본 필드가 모든 주문에 있고 종류가 하나로 몰리지 않는다',
  u1.orders.every((o) => !!(o.paymentMethodCode || o.settleKind)) && payKeys.size >= 2);

const chKeys = new Set(u1.orders.map((o) => o.orderChannel).filter(Boolean));
ok('10. 주문채널 원본 필드가 모든 주문에 있다',
  u1.orders.every((o) => !!o.orderChannel) && chKeys.size >= 1);
ok('11. 취소/환불/반품/교환 claim 이벤트', u1.orders.some((o) => o.claimSummary && o.claimSummary.hasClaim));
ok('12. claimSummary가 주문에 연결', u1.orders.filter((o) => o.claimSummary).every((o) => Array.isArray(o.claimSummary.claimTypes)));
ok('13. raw claimData 전체 노출 없음', u1.orders.every((o) => !('claimData' in o) && o.lines.every((l) => !('claimData' in l))));

const orderNos = new Set(u1.orders.map((o) => o.orderNo));
ok('14. 리뷰가 synthetic 주문과 연결', u1.reviews.length > 0 && u1.reviews.every((r) => orderNos.has(r.orderNo)));
ok('15. 문의가 상품/주문/customer와 연결', u1.inquiries.length > 0 && u1.inquiries.every((q) => q.orderNo && q.goodsNo && q.memberKey));
ok('16. fake PII contact 생성(고객수와 동일)', u1.contacts.length === u1.customers.length);
ok('17. fake PII 표식(isFakePii/sourceType/syntheticProfile)', u1.contacts.every((c) => c.origin.isFakePii === true && c.origin.sourceType === 'synthetic' && c.origin.syntheticProfile === 'commerce_universe_v1'));

// 18. 분석용 universe 자료(주문·리뷰·문의·고객)에 PII 없음 — fake PII 문자열이 등장하지 않아야.
//     (이전에는 facts 출력까지 함께 훑었다. facts 가 사라졌으므로 **실제 분석 대상 자료**로 넓힌다.)
const analyticsJson = JSON.stringify(u1.orders) + JSON.stringify(u1.reviews)
  + JSON.stringify(u1.inquiries) + JSON.stringify(u1.customers);
ok('18. 분석용 universe 자료에 PII 미포함', !analyticsJson.includes('가상고객') && !analyticsJson.includes('010-0000') && !analyticsJson.includes('@example.test') && !analyticsJson.includes('샘플로'));

// 19~20. 카테고리/브랜드 매출을 **계산할 수 있는 연결**이 라인에 살아 있는지.
const CATS = new Set(Object.keys(catalog.categoriesByCode));      // 003 · 004
const BRANDS = new Set(Object.keys(catalog.brandsByCode));        // 001 · 002
const allLines = u1.orders.flatMap((o) => o.lines);
const lineCats = new Set(allLines.map((l) => l.categoryCode).filter(Boolean));
ok('19. 상품 라인이 입력 카탈로그의 카테고리로 연결된다',
  allLines.length > 0 && allLines.every((l) => !l.categoryCode || CATS.has(l.categoryCode))
  && lineCats.size === CATS.size);
// 라인에는 brandCode 가 없다(상품 기준으로 해석) — 이 사실을 고정해 브랜드 해석 경로가 조용히 끊기지 않게 한다.
const brandByGoodsNo = new Map(products.map((p) => [p.productId, p.brandCode]));
const lineBrands = new Set(allLines.map((l) => brandByGoodsNo.get(l.goodsNo)).filter(Boolean));
ok('20. 상품 라인이 goodsNo → 상품의 브랜드로 연결된다(라인 자체에는 brandCode 없음)',
  allLines.every((l) => !('brandCode' in l)) && allLines.every((l) => brandByGoodsNo.has(l.goodsNo))
  && lineBrands.size === BRANDS.size);

// 21. 리뷰 평점의 유효 형태 + 카테고리/브랜드 연결(평점 집계가 성립하는 조건).
ok('21. 리뷰 평점이 1~5 정수이고 카테고리·브랜드로 연결된다',
  u1.reviews.length > 0
  && u1.reviews.every((r) => Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)
  && u1.reviews.every((r) => (!r.categoryCode || CATS.has(r.categoryCode)) && (!r.brandCode || BRANDS.has(r.brandCode)))
  && u1.reviews.some((r) => !!r.categoryCode) && u1.reviews.some((r) => !!r.brandCode));

// 22. 문의 topic/status 의 유효 형태 — CS 이슈 집계가 성립하는 조건.
const INQ_TOPICS = new Set(['delivery', 'payment', 'refund', 'exchange', 'product_question', 'stock', 'coupon', 'account']);
const INQ_STATUS = new Set(['unanswered', 'answered', 'needs_human']);
const seenStatus = new Set(u1.inquiries.map((q) => q.status));
ok('22. 문의 topic·status 가 허용 집합 안에 있고 세 상태가 모두 나타난다',
  u1.inquiries.length > 0
  && u1.inquiries.every((q) => INQ_TOPICS.has(q.topic) && INQ_STATUS.has(q.status))
  && new Set(u1.inquiries.map((q) => q.topic)).size >= 2
  && INQ_STATUS.size === seenStatus.size);
ok('23. sourceType=synthetic 표시', u1.meta.sourceType === 'synthetic' && u1.customers.every((c) => c.sourceType === 'synthetic') && u1.reviews.every((r) => r.sourceType === 'synthetic'));
ok('   orders syntheticSource=commerce_universe_v1', u1.orders.every((o) => o.syntheticSource === 'commerce_universe_v1' && o.dataKind === 'synthetic'));

// 24. 기존 syntheticRevenue 무영향
const legacy = L.generateSyntheticRevenueOrders(products, { orderCount: 50 });
ok('24. 기존 syntheticRevenue 무영향', legacy.length > 0 && legacy.every((o) => o.sourceType === 'synthetic_test'));
// 25. universe orders가 RevenueOrder 계약 유지(productTeamChatFacts 호환)
ok('25. universe orders가 RevenueOrder 계약 유지', u1.orders.every((o) => o.orderNo && Array.isArray(o.lines) && o.state && typeof o.productRevenueByLines === 'number'));

// ── Local migration 5 — 제품 소비자 0건이던 facts helper 제거 확인 ────────────
//   universe·revenue 는 활성 경로라 그대로 두고, 사용되지 않던 helper만 없어져야 한다.
ok('26. 제품 소비자 0건이던 facts helper 파일이 없다',
  !existsSync(path.join(REPO, 'api', '_shared', 'syntheticCommerceFacts.ts')));
ok('27. 제품 코드(api·src)에 syntheticCommerceFacts 참조 0건', (() => {
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(path.join(REPO, d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${d}/${e.name}`);
      else if (/\.(ts|tsx)$/.test(e.name)
        && /syntheticCommerceFacts/.test(readFileSync(path.join(REPO, d, e.name), 'utf8'))) hits.push(`${d}/${e.name}`);
    }
  };
  walk('api'); walk('src');
  if (hits.length) console.log(`      → 잔존 참조: ${hits.join(', ')}`);
  return hits.length === 0;
})());
ok('28. 활성 생성 모듈은 그대로 있다(universe·revenue)',
  existsSync(path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'))
  && existsSync(path.join(REPO, 'api', '_shared', 'syntheticRevenue.ts')));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail (orders=${u1.orders.length}, customers=${u1.customers.length}, reviews=${u1.reviews.length}, inquiries=${u1.inquiries.length}) ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
