#!/usr/bin/env node
/*
 * scripts/smoke-godomall-catalog-binding.mjs
 *
 * api/_shared/godomallCatalogBinding.ts(실제 모듈)를 로컬 tsc로 emit 후 import하여 검증.
 * (binding은 godomallCatalog/godomallRevenue/godomallMapper 타입만 import → 함께 emit)
 * 프론트 productTeamChatFacts 확장은 tsc/build로 검증(하위호환 optional param).
 *
 * 실행: node scripts/smoke-godomall-catalog-binding.mjs   (실패 시 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-bind-'));
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
try {
  execFileSync(
    process.execPath,
    [
      tscBin, path.join(REPO, 'api', '_shared', 'godomallCatalogBinding.ts'),
      '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'),
      '--outDir', tmp, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'
    ],
    { stdio: 'pipe' }
  );
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
const b = await import(pathToFileURL(path.join(tmp, 'godomallCatalogBinding.js')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? pass++ : fail++;
};

console.log('=== Godomall Catalog Binding smoke ===');

// 실 카탈로그(테스트몰 실측 기반)
const categories = [
  { cateCd: '001', cateNm: '신상품' },
  { cateCd: '003', cateNm: '오나홀' }
];
const brands = [{ brandCd: '001', brandNm: '스마트홈' }];
const lookup = b.buildCatalogLookup(categories, brands);

// 1. lookup 생성
ok('category lookup 생성', Object.keys(lookup.categoriesByCode).length === 2);
ok('brand lookup 생성', Object.keys(lookup.brandsByCode).length === 1);

// 2. category resolution: resolved / unknown(fallback) / missing
const r1 = b.resolveCategoryLabel('003', lookup);
ok('category code→label resolved (003→오나홀)', r1.resolved === true && r1.label === '오나홀' && r1.source === 'category_search');
const r2 = b.resolveCategoryLabel('999', lookup);
ok('unknown category → fallback(코드 유지, resolved=false)', r2.resolved === false && r2.label === '999' && r2.source === 'fallback');
const r3 = b.resolveCategoryLabel('uncategorized', lookup);
ok('missing category(uncategorized) → missing', r3.resolved === false && r3.source === 'missing');

// 3. brand resolution
const rb1 = b.resolveBrandLabel('001', lookup);
ok('brand code→label resolved (001→스마트홈)', rb1.resolved === true && rb1.label === '스마트홈' && rb1.source === 'brand_search');
ok('unknown brand → fallback', b.resolveBrandLabel('777', lookup).source === 'fallback');
ok('missing brand(빈값) → missing', b.resolveBrandLabel('', lookup).source === 'missing');

// 4. pickPrimaryCategoryCode (categoryCode 우선, 없으면 allCategoryCode 마지막 depth)
ok('primary: categoryCode 우선', b.pickPrimaryCategoryCode('003', '001^|^003') === '003');
ok('primary: allCategoryCode 마지막 depth', b.pickPrimaryCategoryCode('', '001^|^003') === '003');
ok('primary: 둘 다 없음 → undefined', b.pickPrimaryCategoryCode('uncategorized', '') === undefined);

// 5. product 라벨 부착
const product = { productId: '1001', categoryCode: '003', allCategoryCode: '003', brandCode: '001' };
const labels = b.attachProductCatalogLabels(product, lookup);
ok('product category 라벨', labels.category.label === '오나홀' && labels.category.resolved);
ok('product brand 라벨', labels.brand.label === '스마트홈' && labels.brand.resolved);

// 6. revenue breakdown (카테고리 from line, 브랜드 from productId 역참조)
const orders = [
  { orderNo: 'A1', lines: [{ goodsNo: '1001', categoryCode: '003', lineRevenue: 100000, quantity: 2 }] },
  { orderNo: 'A2', lines: [{ goodsNo: '1001', categoryCode: '003', lineRevenue: 50000, quantity: 1 }, { goodsNo: '9999', categoryCode: '999', lineRevenue: 30000, quantity: 1 }] }
];
const brandByPid = b.buildBrandByProductId([product]); // 1001→001
const bd = b.deriveRevenueCatalogBreakdown(orders, lookup, brandByPid);
const cat003 = bd.byCategory.find((x) => x.code === '003');
ok('breakdown byCategory 003 매출 합산', cat003 && cat003.revenue === 150000 && cat003.orderCount === 2 && cat003.label === '오나홀');
ok('breakdown 미해석 카테고리(999) unresolved', bd.unresolved.categoryCodes.includes('999'));
const brand001 = bd.byBrand.find((x) => x.code === '001');
ok('breakdown byBrand 001 (productId 역참조)', brand001 && brand001.revenue === 150000 && brand001.label === '스마트홈');

// 7. taxonomy facts
const facts = b.deriveCatalogTaxonomyFacts([product, { productId: '9999', categoryCode: '999', allCategoryCode: '999', brandCode: '' }], lookup);
ok('taxonomy categoryCount/brandCount', facts.categoryCount === 2 && facts.brandCount === 1);
ok('taxonomy 카테고리 해석률(1/2=0.5)', Math.abs(facts.productCategoryResolutionRate - 0.5) < 1e-9);
ok('taxonomy unresolved 999 포함', facts.unresolvedCategoryCodes.includes('999'));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
