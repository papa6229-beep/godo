#!/usr/bin/env node
/*
 * scripts/smoke-godomall-catalog.mjs
 *
 * api/_shared/godomallCatalog.ts(실제 모듈) + godomallApiRegistry.ts를 로컬 tsc로 emit 후 import 검증.
 * 실행: node scripts/smoke-godomall-catalog.mjs   (실패 시 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-cat-'));
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const emit = (file) =>
  execFileSync(
    process.execPath,
    [tscBin, path.join(REPO, file), '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'),
     '--outDir', tmp, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'pipe' }
  );
try {
  emit('api/_shared/godomallCatalog.ts'); // godomallOrderNormalize import → 함께 emit
  emit('api/_shared/godomallApiRegistry.ts');
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
const cat = await import(pathToFileURL(path.join(tmp, 'godomallCatalog.js')).href);
const reg = await import(pathToFileURL(path.join(tmp, 'godomallApiRegistry.js')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? pass++ : fail++;
};

console.log('=== Godomall Catalog (category/brand) smoke ===');

// 카테고리 normalize (실 필드 cateCd/cateNm/cateDisplayFl/cateDisplayMobileFl)
const c1 = cat.normalizeCategories([{ cateCd: '001', cateNm: '신상품', cateDisplayFl: 'y', cateDisplayMobileFl: 'n' }]);
ok('category 단건 → 1', c1.length === 1);
ok('category 필드 매핑(cateCd/cateNm/display)', c1[0].cateCd === '001' && c1[0].cateNm === '신상품' && c1[0].displayPc === true && c1[0].displayMobile === false);
ok('category 배열+빈/래퍼 → 의미만', cat.normalizeCategories([{ cateCd: '001' }, {}, '', null]).length === 1);
ok('category 빈응답(undefined/{}/"") → 0', cat.normalizeCategories(undefined).length === 0 && cat.normalizeCategories({}).length === 0 && cat.normalizeCategories('').length === 0);

// 브랜드 normalize (실 필드 brandCd/brandNm)
const b1 = cat.normalizeBrands([{ brandCd: '001', brandNm: '스마트홈' }]);
ok('brand 단건 → 1', b1.length === 1);
ok('brand 필드 매핑(brandCd/brandNm)', b1[0].brandCd === '001' && b1[0].brandNm === '스마트홈');
ok('brand 배열+빈 → 의미만', cat.normalizeBrands([{ brandCd: '001' }, {}, null]).length === 1);
ok('brand 빈응답 → 0', cat.normalizeBrands(undefined).length === 0 && cat.normalizeBrands({}).length === 0);
// 견고성: 필드명이 흔들려도(cateCd/cateNm로 와도) 브랜드 추출
ok('brand fallback(cateCd/cateNm로 와도 추출)', cat.normalizeBrands([{ cateCd: '009', cateNm: 'X' }])[0]?.brandCd === '009');

// raw/key 미노출
const leak = cat.normalizeCategories([{ cateCd: '001', cateNm: '가', partner_key: 'SECRET' }])[0];
ok('정규화 결과에 key 미노출', !('partner_key' in leak));

// Registry 연결
const cc = reg.getGodomallApiCapability('category_search');
const bc = reg.getGodomallApiCapability('brand_search');
ok('registry category_search status=partial', !!cc && cc.implementationStatus === 'partial');
ok('registry brand_search status=partial', !!bc && bc.implementationStatus === 'partial');
ok('registry category_search → read.ts gateway', !!cc && (cc.currentRoutes || []).some((r) => r.includes('read.ts') && r.includes('category_search')));
ok('registry brand_search → read.ts gateway', !!bc && (bc.currentRoutes || []).some((r) => r.includes('read.ts') && r.includes('brand_search')));
ok('registry → godomallCatalog.ts 연결', !!cc && (cc.currentSharedFiles || []).some((f) => f.includes('godomallCatalog')));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
