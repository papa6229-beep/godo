#!/usr/bin/env node
/*
 * scripts/smoke-product-team-chat-grounding.mjs
 * 상품팀 채팅 facts가 Universe 12개월 데이터를 기준으로 기간 범위를 정확히 해석하는지 검증.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-gr-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'productTeamChatFacts.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
// 상대 import에 .js 부여(productTeamChatFacts가 parser/executor 등 런타임 모듈을 import).
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (mm, rel) => (rel.endsWith('.js') ? mm : `from '${rel}.js'`)));
}
const F = await import(pathToFileURL(path.join(tmp, 'productTeamChatFacts.js')).href);
const build = F.buildProductTeamChatFacts;

// 12개월(2025-07 ~ 2026-06) Universe-like revenue
const yms = [];
for (let m = 7; m <= 12; m++) yms.push(`2025-${String(m).padStart(2, '0')}`);
for (let m = 1; m <= 6; m++) yms.push(`2026-${String(m).padStart(2, '0')}`);
const orders = yms.flatMap((ym, i) =>
  Array.from({ length: 5 }, (_, k) => ({
    orderNo: `${ym}-${k}`, orderDate: `${ym}-15 10:00:00`, sourceType: 'synthetic_test',
    deliveryFee: 2500, totalAmount: 10000, productRevenueByLines: 1000 * (i + 1),
    paid: true, unpaid: false, confirmed: true, canceled: false,
    lines: [{ goodsNo: '1001', goodsName: '티셔츠', quantity: 2, lineRevenue: 1000 * (i + 1), categoryCode: '003', categoryLabel: '003' }]
  }))
);
const revenue = {
  count: orders.length, source: 'real', live: true, orders, stockImpact: [], syntheticSource: 'commerce_universe_v1',
  summary: { orderCount: orders.length, productRevenueByLines: orders.reduce((s, o) => s + o.productRevenueByLines, 0), realOrderCount: 0, syntheticOrderCount: orders.length, deliveryFeeTotal: 0, totalAmount: 0, paidOrderCount: orders.length, unpaidOrderCount: 0, confirmedOrderCount: orders.length, canceledOrderCount: 0, syntheticTrackedProductCount: 0, syntheticTotalNetSoldQuantity: 0 }
};
const catalog = { categoriesByCode: { '003': { cateCd: '003', cateNm: '오나홀' } }, brandsByCode: {} };

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const J = (f) => (f ? f.facts.join(' | ') : '');

console.log('=== Product team chat grounding smoke ===');

// 1. revenue 기준 facts 생성
ok('1. revenue 기준 facts 생성', !!build('카테고리별 매출 알려줘', revenue));

// 2. available range = 2025-07 ~ 2026-06
const monthly = F['aggregateMonthly'] ? null : null; // 내부 함수 비공개 → parse로 우회
const range = F.parseRequestedMonthRange('최근 12개월 매출', [{ ym: '2025-07' }, { ym: '2026-06' }]);
ok('2. available range 계산(최근 12개월→2025-07~2026-06)', range && range.startYm === '2025-07' && range.endYm === '2026-06');

// 3. 2025-07 ~ 2026-03 월별 매출 → monthly_range, 데이터 있음, 9개월 모두
const f3 = build('2025년 7월부터 2026년 3월까지의 월별 매출을 비교해줘', revenue);
ok('3. 범위 매출 → monthly_range', f3 && f3.intent === 'monthly_range');
ok('   2025년 7월~2026년 3월 포함, "없음" 아님', J(f3).includes('2025년 7월') && J(f3).includes('2026년 3월') && J(f3).includes('2025년 12월') && !J(f3).includes('데이터가 없') && !J(f3).includes('겹치지 않'));

// 4. 2025-08 ~ 2026-03 월별 주문 수 → 데이터 있음
const f4 = build('2025년 8월부터 2026년 3월까지의 월별 주문 수를 비교해줘', revenue);
ok('4. 범위 주문수 → monthly_range, 8월~3월 포함', f4 && f4.intent === 'monthly_range' && J(f4).includes('2025년 8월') && J(f4).includes('2026년 3월') && !J(f4).includes('데이터가 없'));

// 5. 최근 3개월 → 2026-04,05,06
const f5 = build('최근 3개월 매출 추이 알려줘', revenue);
ok('5. 최근 3개월 → 최신 3개월(2026년 4~6월)', f5 && f5.intent === 'monthly_range' && J(f5).includes('2026년 4월') && J(f5).includes('2026년 6월') && !J(f5).includes('2026년 3월'));

// 6. 카테고리별 매출 label 유지
const f6 = build('카테고리별 매출 알려줘', revenue, catalog);
ok('6. 카테고리 facts label(오나홀) 유지', f6 && f6.intent === 'category_share' && J(f6).includes('오나홀'));

// 7. 보유 밖 기간만 "겹치지 않음"
const f7 = build('2020년 1월부터 2020년 6월까지 월별 매출', revenue);
ok('7. 보유 밖 범위 → 겹치지 않음 안내', f7 && f7.intent === 'monthly_range' && J(f7).includes('겹치지 않'));

// 8. 기존 intent 무영향 (단일월/추이/총매출/재고/데이터한계)
ok('8a. 단일월(7월) intent 유지', build('7월 매출 알려줘', revenue)?.intent === 'monthly_revenue');
ok('8b. 총매출 intent 유지', build('전체 매출 알려줘', revenue)?.intent === 'total_revenue');
ok('8c. 재고 위험 intent 유지', build('재고 위험 상품', revenue)?.intent === 'stock_risk');
ok('8d. 데이터 한계(재구매) 유지', build('재구매율 알려줘', revenue)?.intent === 'data_limit');

// 9. fake PII가 facts에 미포함
const allFacts = [f3, f4, f5, f6, f7].map(J).join(' ');
ok('9. fake PII가 facts에 미포함', !allFacts.includes('가상고객') && !allFacts.includes('010-0000') && !allFacts.includes('@example.test') && !allFacts.includes('샘플로'));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
