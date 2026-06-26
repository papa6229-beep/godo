#!/usr/bin/env node
/*
 * scripts/smoke-godomall-code-search.mjs
 *
 * api/_shared/godomallCodes.ts(실제 모듈) + godomallApiRegistry.ts를 로컬 tsc로 emit 후 import하여 검증.
 * 실행: node scripts/smoke-godomall-code-search.mjs   (실패 시 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-codes-'));
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const emit = (file) =>
  execFileSync(
    process.execPath,
    [tscBin, path.join(REPO, file), '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'),
     '--outDir', tmp, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'pipe' }
  );
try {
  // godomallCodes는 godomallOrderNormalize를 import → 함께 emit
  emit('api/_shared/godomallCodes.ts');
  emit('api/_shared/godomallApiRegistry.ts');
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}

const codes = await import(pathToFileURL(path.join(tmp, 'godomallCodes.js')).href);
const registry = await import(pathToFileURL(path.join(tmp, 'godomallApiRegistry.js')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? pass++ : fail++;
};

console.log('=== Godomall Code_Search smoke ===');

// 1. allowlist accept/reject
ok('allowlist: claimBank 허용', codes.isAllowedCodeType('claimBank') === true);
ok('allowlist: orderStatus 거부', codes.isAllowedCodeType('orderStatus') === false);
ok('allowlist: 빈값 거부', codes.isAllowedCodeType('') === false);
ok('allowlist 13종', codes.CODE_SEARCH_ALLOWLIST.length === 13);

// 2. normalize 단건/배열/빈
ok('단건 object → 1', codes.normalizeCommonCodes({ itemCd: 'A', itemNm: '가' }, 'claimBank').length === 1);
ok('배열(빈/래퍼 섞임) → 의미만', codes.normalizeCommonCodes([{ itemCd: 'A', itemNm: '가' }, {}, '', null], 'claimBank').length === 1);
ok('빈 응답 undefined → 0', codes.normalizeCommonCodes(undefined, 'claimBank').length === 0);
ok('빈 객체 {} → 0', codes.normalizeCommonCodes({}, 'claimBank').length === 0);
ok('빈 문자열 → 0', codes.normalizeCommonCodes('', 'claimBank').length === 0);

// 3. code_type별 필드 매핑 (PDF §7.2)
const cb = codes.normalizeCommonCodes([{ itemCd: '04002001', itemNm: 'KB국민은행' }], 'claimBank')[0];
ok('claimBank: itemCd→code, itemNm→labelKo', cb.code === '04002001' && cb.labelKo === 'KB국민은행');
const dc = codes.normalizeCommonCodes([{ invoiceCompanySno: '12', invoiceCompanyName: '우체국택배' }], 'deliveryCompany')[0];
ok('deliveryCompany: invoiceCompanySno→code, invoiceCompanyName→labelKo', dc.code === '12' && dc.labelKo === '우체국택배');
const mg = codes.normalizeCommonCodes([{ sno: '1', groupNm: '일반회원' }], 'memberGroup')[0];
ok('memberGroup: sno→code, groupNm→labelKo', mg.code === '1' && mg.labelKo === '일반회원');

// 4. raw XML/key 미출력 (정규화 결과에 xml/key/apiKey 필드 없음)
const sample = codes.normalizeCommonCodes([{ itemCd: 'A', itemNm: '가', partner_key: 'SECRET' }], 'claimBank')[0];
ok('정규화 결과에 key/xml 노출 없음', !('partner_key' in sample) && !('xml' in sample) && !('key' in sample));

// 5. mock fallback 표시
const mock = codes.getMockCommonCodes('claimBank');
ok('mock fallback 존재 & 표시', Array.isArray(mock));

// 6. Registry 연결
const cap = registry.getGodomallApiCapability('code_search');
ok('registry code_search status=partial', !!cap && cap.implementationStatus === 'partial');
ok('registry code_search → codes.ts 연결', !!cap && (cap.currentRoutes || []).some((r) => r.includes('codes.ts')));
ok('registry code_search → godomallCodes.ts 연결', !!cap && (cap.currentSharedFiles || []).some((f) => f.includes('godomallCodes')));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
