#!/usr/bin/env node
/*
 * scripts/smoke-product-team-catalog-facts.mjs
 *
 * src/services/productTeamChatFacts.ts(실제 모듈)를 로컬 tsc로 emit 후 import하여
 * catalog 유/무에 따른 facts 동작을 검증한다. (RevenueResult는 type-only import → 런타임 무의존)
 *
 * 실행: node scripts/smoke-product-team-catalog-facts.mjs   (실패 시 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-ptf-'));
try {
  execFileSync(
    process.execPath,
    [
      path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
      path.join(REPO, 'src', 'services', 'productTeamChatFacts.ts'),
      '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
      '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
    ],
    { stdio: 'pipe' }
  );
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
// 상대 import에 .js 부여(productTeamChatFacts가 parser/executor 등 런타임 모듈을 import).
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (mm, rel) => (rel.endsWith('.js') ? mm : `from '${rel}.js'`)));
}
const m = await import(pathToFileURL(path.join(tmp, 'productTeamChatFacts.js')).href);
const build = m.buildProductTeamChatFacts;

const revenue = {
  orders: [
    {
      orderDate: '2026-06-01 10:00:00',
      productRevenueByLines: 150000,
      lines: [
        { goodsNo: '1001', goodsName: 'A', categoryCode: '003', categoryLabel: '003', lineRevenue: 120000, quantity: 2 },
        { goodsNo: '9999', goodsName: 'B', categoryCode: '999', categoryLabel: '999', lineRevenue: 30000, quantity: 1 }
      ]
    }
  ],
  summary: {
    productRevenueByLines: 150000, orderCount: 1, realOrderCount: 0, syntheticOrderCount: 1,
    deliveryFeeTotal: 0, totalAmount: 150000, paidOrderCount: 1, unpaidOrderCount: 0,
    confirmedOrderCount: 0, canceledOrderCount: 0, syntheticTrackedProductCount: 0, syntheticTotalNetSoldQuantity: 0
  },
  stockImpact: []
};
const catalog = {
  categoriesByCode: { '003': { cateCd: '003', cateNm: '오나홀' } },
  brandsByCode: { '001': { brandCd: '001', brandNm: '스마트홈' } }
};

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? pass++ : fail++;
};
const joined = (f) => (f ? f.facts.join(' | ') : '');

console.log('=== Product Team catalog facts wiring smoke ===');

// 1. catalog 없이 호출 가능
const noCat = build('카테고리별 매출 알려줘', revenue);
ok('catalog 없이 호출 가능', !!noCat && noCat.intent === 'category_share');
ok('catalog 없으면 코드(003) 라벨 유지', joined(noCat).includes('003') && !joined(noCat).includes('오나홀'));

// 2. catalog 포함 호출 가능 + 3. category label resolved
const withCat = build('카테고리별 매출 알려줘', revenue, catalog);
ok('catalog 포함 호출 가능', !!withCat && withCat.intent === 'category_share');
ok('category label resolved (003→오나홀)', joined(withCat).includes('오나홀'));
// 4. unknown category fallback (999 유지)
ok('unknown category(999) fallback 유지', joined(withCat).includes('999'));

// 5/6. 브랜드/분류 질문 → catalog_taxonomy intent + brandCount
const taxo = build('브랜드별 성과 알려줘', revenue, catalog);
ok('catalog_taxonomy intent', !!taxo && taxo.intent === 'catalog_taxonomy');
ok('brand label/count 반영 (브랜드 1종)', joined(taxo).includes('브랜드 1종'));
ok('미해석 카테고리 unknown 표시', joined(taxo).includes('unknown category 999'));
// catalog 없으면 브랜드 질문은 catalog_taxonomy로 안 감(기존 일반 분기)
const taxoNoCat = build('브랜드별 성과 알려줘', revenue);
ok('catalog 없으면 catalog_taxonomy 미발동', !!taxoNoCat && taxoNoCat.intent !== 'catalog_taxonomy');

// 7. 기존 facts 영향 없음 (월별/순위/재고)
ok('월별 추이 intent 불변', build('월별 추이 알려줘', revenue, catalog)?.intent === 'monthly_trend');
// 상품 순위는 Department Analytics Query Layer v0로 이관 → 공통 executor 경로(analytics_product_rank).
ok('상품 순위 → 공통 분석 계층(analytics_product_rank)', build('상품 순위 top', revenue, catalog)?.intent === 'analytics_product_rank');
ok('재고 위험 intent 불변', build('재고 위험 상품', revenue, catalog)?.intent === 'stock_risk');
ok('총매출 intent 불변', build('전체 매출 알려줘', revenue, catalog)?.intent === 'total_revenue');
ok('데이터 한계 질문 불변(재구매)', build('재구매율 알려줘', revenue, catalog)?.intent === 'data_limit');

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
