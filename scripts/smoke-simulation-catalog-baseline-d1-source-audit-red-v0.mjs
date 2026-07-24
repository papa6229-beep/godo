#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d1-source-audit-red-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1 — "연결 안 됨 ≠ 실제 0건" 의미 감사 (RED 진단)
 *
 * 제품 소스 수정 없음. 실제 resolveOrdersRevenue() + 공통 출처 판정 함수 호출.
 *
 * 감사 대상 결함 가설:
 *   실제 주문 연결 실패(realOrdersStatus='unavailable')일 때 summary.realOrderCount 는 0 이다
 *   (=집계된 실제 주문이 없다). 그러나 이는 "실제 0건"이 아니라 "미확인(연결 안 됨)"이다.
 *   일부 소비자가 realOrdersStatus 를 보지 않고 realOrderCount 를 "실 0건"으로 렌더 →
 *   시나리오3(연결 실패)과 시나리오4(실제 성공 0건)를 구별하지 못하고 금지 표현을 만든다.
 *
 * [FACT] = 현재 실제 반환값(불변 관찰). [RED] = 재현된 결함(GREEN 에서 해소 대상).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
let fact = 0, factf = 0, red = 0, redx = 0;
const F = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [FACT] ${n}${d ? `  — ${d}` : ''}`); ok ? fact++ : factf++; };
const R = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${d ? `  — ${d}` : ''}`); ok ? red++ : redx++; };
console.log('=== SIMULATION-CATALOG-BASELINE-01 D-1 — 연결 안 됨 ≠ 실제 0건 감사 (RED) ===');

// ── 컴파일 ───────────────────────────────────────────────────────────────────
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const outApi = mkdtempSync(path.join(cacheRoot, 'd1-api-'));
const outApiUnix = outApi.replace(/\\/g, '/');
const cfg = path.join(outApi, 'tsconfig.json');
writeFileSync(cfg, JSON.stringify({
  compilerOptions: { target: 'ES2023', lib: ['ES2023'], module: 'NodeNext', moduleResolution: 'NodeNext',
    types: ['node'], strict: false, strictNullChecks: true, skipLibCheck: true, esModuleInterop: true,
    outDir: outApiUnix, rootDir: `${REPO}/api`, noEmit: false, noEmitOnError: false },
  include: [`${REPO}/api/_shared/**/*.ts`]
}));
writeFileSync(path.join(outApi, 'package.json'), JSON.stringify({ type: 'module' }));
try { execFileSync(process.execPath, [TSC, '-p', cfg, '--pretty', 'false'], { cwd: REPO, stdio: 'pipe' }); } catch { /* noEmitOnError:false */ }
const apiJs = (rel) => path.join(outApi, '_shared', rel);

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd1-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}

const RES = await import(pathToFileURL(apiJs('godomallResource.js')).href);
const L = await import(pathToFileURL(apiJs(path.join('simCatalog', 'simCatalogV1.js'))).href);
const DATA = await import(pathToFileURL(apiJs(path.join('simCatalog', 'simCatalogV1.data.js'))).href);
const SS = await import(pathToFileURL(path.join(outSrc, 'revenueScreenState.js')).href);
const PV = await import(pathToFileURL(path.join(outSrc, 'dataSourceProvenanceContract.js')).href);
const DS = await import(pathToFileURL(path.join(outSrc, 'departmentDataSourceOfTruth.js')).href);

// ── fetch 스텁 (5개 조합) ────────────────────────────────────────────────────
const ENV = ['GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY', 'GODOMALL_REAL_BASE_URL'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const goods13 = `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return>${
  Array.from({ length: 13 }, (_, i) => `<goods_data><goodsNo>${9000 + i}</goodsNo><goodsCd>Q${i}</goodsCd><goodsNm>실상품${i}</goodsNm><goodsPrice>${10000 + i * 500}</goodsPrice><totalStock>5</totalStock><stockFl>y</stockFl></goods_data>`).join('')}</return></data>`;
const empty = `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return></return></data>`;
const run = async (net, opts) => {
  process.env.GODOMALL_API_MODE = 'real'; process.env.GODOMALL_PARTNER_KEY = 'k'; process.env.GODOMALL_USER_KEY = 'k';
  process.env.GODOMALL_REAL_BASE_URL = 'http://127.0.0.1:9';
  globalThis.fetch = async (url) => {
    const isGoods = String(url).includes('Goods_Search');
    if (net === 'fail') throw new Error('network down (stub)');
    return { ok: true, status: 200, text: async () => (isGoods ? goods13 : empty) }; // 주문 빈 성공 + 상품 성공
  };
  try { return await RES.resolveOrdersRevenue(opts); } finally { globalThis.fetch = realFetch; }
};

// 조합 1: 실제 성공 빈배열 + synthetic=false
const c1 = await run('ok', { includeSynthetic: false });
// 조합 2: 실제 연결 실패 + synthetic=false
const c2 = await run('fail', { includeSynthetic: false });
// 조합 3: 실제 연결 실패 + synthetic=true
const c3 = await run('fail', { includeSynthetic: true });
// 조합 4: 실제 성공 0건 + synthetic=true
const c4 = await run('ok', { includeSynthetic: true });
for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
globalThis.fetch = realFetch;
// 조합 5: 실제 연결 실패 + 카탈로그 검증 실패 (계약/mechanism — 정본 손상은 런타임 주입 불가라 계약으로 재현)
const c5contract = { realOrdersStatus: 'unavailable', syntheticStatus: 'unavailable', summary: null, orders: [], source: 'unavailable' };
const catalogCorruptRejected = L.validateSimCatalog([], L.getSimCatalogManifest()).ok === false;

// ── 필드 표 + 판정 ───────────────────────────────────────────────────────────
const screenOf = (r) => SS.screenStateFromRevenue({ realOrdersStatus: r.realOrdersStatus, syntheticStatus: r.syntheticStatus, realOrdersErrorMessage: r.realOrdersErrorMessage, summary: r.summary });
const row = (name, r, screen) => {
  const s = r.summary;
  console.log(`   [${name}] source=${r.source} realOrdersStatus=${r.realOrdersStatus} syntheticStatus=${r.syntheticStatus}` +
    ` realOrderCount=${s ? s.realOrderCount : 'n/a'} syntheticOrderCount=${s ? s.syntheticOrderCount : 'n/a'}` +
    ` | screen.kind=${screen.kind} label=${screen.userLabel} usable=${screen.usable} notice=${screen.realOrdersNotice ? 'Y' : '-'}`);
};
const s1 = screenOf(c1), s2 = screenOf(c2), s3 = screenOf(c3), s4 = screenOf(c4);
const s5 = SS.screenStateFromRevenue({ loaded: true, ...c5contract, hasSummary: false });
console.log('  --- 5개 조합 실제 반환값 ---');
row('1 실성공빈+synF', c1, s1); row('2 실패+synF', c2, s2); row('3 실패+synT', c3, s3); row('4 실성공0+synT', c4, s4);
console.log(`   [5 실패+카탈로그손상] source=unavailable realOrdersStatus=unavailable syntheticStatus=unavailable | screen.kind=${s5.kind} label=${s5.userLabel} usable=${s5.usable} · validate([])거부=${catalogCorruptRejected}`);
console.log('');

// [FACT] 조합별 계약상 올바른 최상위 신분 판정
F('조합1: 실제 성공 빈배열 + synF → 실제 데이터 0건(usable)', s1.kind === 'actual' && s1.userLabel === '실제 데이터' && s1.usable === true, `${s1.userLabel}`);
F('조합2: 연결 실패 + synF → 연결 안 됨(실제 0건 아님)', s2.kind === 'unavailable' && s2.userLabel === '연결 안 됨' && s2.usable === false, `${s2.userLabel}`);
F('조합3: 연결 실패 + synT → 주 신분 시험 데이터 + 실제 주문 연결 안 됨 별도 안내', s3.userLabel === '시험 데이터' && s3.usable === true && !!s3.realOrdersNotice && c3.realOrdersStatus === 'unavailable' && c3.summary.syntheticOrderCount === 1315, `label=${s3.userLabel} notice=${!!s3.realOrdersNotice} syn=${c3.summary.syntheticOrderCount}`);
F('조합4: 실제 성공 0건 + synT → 주 신분 시험 데이터, 실제 slice=success(연결됨)', s4.userLabel === '시험 데이터' && c4.realOrdersStatus === 'success' && c4.summary.syntheticOrderCount === 1315, `label=${s4.userLabel} realStatus=${c4.realOrdersStatus}`);
F('조합5: 연결 실패 + 카탈로그 손상 → 전체 연결 안 됨, mock/실상품 대체 없음(validate 거부)', s5.userLabel === '연결 안 됨' && s5.usable === false && catalogCorruptRejected, `${s5.userLabel} · 거부=${catalogCorruptRejected}`);

// ── [RED] 결함 1: 실제 slice 상태가 realOrderCount 로 구별 불가 ────────────────
R('D1. 연결 실패(3)와 실제 성공 0건(4)이 summary.realOrderCount·screen.kind 로 구별 불가 (둘 다 0·simulation) → 판정은 realOrdersStatus 로만 가능',
  c3.summary.realOrderCount === 0 && c4.summary.realOrderCount === 0 && s3.kind === 'simulation' && s4.kind === 'simulation' &&
  c3.realOrdersStatus === 'unavailable' && c4.realOrdersStatus === 'success',
  `realOrderCount 3=${c3.summary.realOrderCount} 4=${c4.summary.realOrderCount} · kind 3=${s3.kind} 4=${s4.kind} · realOrdersStatus 3=${c3.realOrdersStatus} 4=${c4.realOrdersStatus}`);

// ── [RED] 결함 2~4: 3개 소비처가 realOrdersStatus 가드 없이 "실 0건"을 렌더 ──────
const ptd = readFileSync(path.join(REPO, 'src/components/ProductTeamDashboard.tsx'), 'utf8');
const dwp = readFileSync(path.join(REPO, 'src/components/DepartmentWorkspacePanel.tsx'), 'utf8');
const ptcf = readFileSync(path.join(REPO, 'src/services/productTeamChatFacts.ts'), 'utf8');
// 배지 삼항: simulation 분기가 realOrderCount 를 "실제 유효 주문 N건"으로, realOrdersStatus 미참조
const ptdBadge = /simulation'[\s\S]{0,120}실제 유효 주문 \$\{\(summary\?\.realOrderCount/.test(ptd);
const ptdNoGuard = !/realOrdersStatus[\s\S]{0,200}실제 유효 주문/.test(ptd); // 배지 근처 realOrdersStatus 가드 없음
R('D2. ProductTeamDashboard 배지 — 연결 실패(3)에서 "실제 유효 주문 0건 + 시험 주문 1,315건" 렌더 (realOrdersStatus 미가드)',
  ptdBadge && ptdNoGuard && c3.summary.realOrderCount === 0,
  `배지패턴=${ptdBadge} · realOrdersStatus가드없음=${ptdNoGuard} · 렌더될값="실제 유효 주문 0건 + 시험 주문 1,315건"`);

const dwpDefect = /kind === 'fixture'[\s\S]{0,120}: `실 \$\{s\.realOrderCount\}건 \+ /.test(dwp);
R('D3. DepartmentWorkspacePanel(AI 컨텍스트) — fixture 만 구별, 연결 실패(3)에서 "실 0건 + 가상 1,315건" 생성 (realOrdersStatus 미가드)',
  dwpDefect && c3.summary.realOrderCount === 0,
  `패턴=${dwpDefect} · 렌더될값="실 0건 + ... 가상 1,315건"`);

const ptcfDefect = /kind === 'fixture'[\s\S]{0,80}return `총 주문 \$\{s\.orderCount\}건\(실 \$\{s\.realOrderCount\} \+ 가상/.test(ptcf);
R('D4. productTeamChatFacts(채팅 facts) — fixture 만 구별, 연결 실패(3)에서 "총 주문 1,315건(실 0 + 가상 1,315)" 생성 (realOrdersStatus 미가드)',
  ptcfDefect && c3.summary.realOrderCount === 0,
  `패턴=${ptcfDefect} · 렌더될값="총 주문 1,315건(실 0 + 가상 1,315)"`);

// ── [RED] 결함 5: 부서 snapshot 이 realOrdersStatus 미보존 → 3/4 스냅샷 동일 ──────
const snap3 = DS.buildDepartmentSourceOfTruthSnapshot(c3);
const snap4 = DS.buildDepartmentSourceOfTruthSnapshot(c4);
R('D5. departmentDataSourceOfTruth 스냅샷이 realOrdersStatus 미보존 → 연결실패(3)·실제0건(4) 동일(sourceMode/realOrderCount) → 하류가 구별 불가',
  snap3.sourceMode === snap4.sourceMode && snap3.metadata.realOrderCount === snap4.metadata.realOrderCount &&
  !('realOrdersStatus' in snap3) && !('realOrdersStatus' in (snap3.metadata || {})),
  `sourceMode 3=${snap3.sourceMode} 4=${snap4.sourceMode} · realOrderCount 3=${snap3.metadata.realOrderCount} 4=${snap4.metadata.realOrderCount} · snapshot에 realOrdersStatus 없음`);

// ── [FACT] source 단일 의미 확인(이중의미 아님) ──────────────────────────────
F('source 단일 의미: 최상위 source=실제 주문 slice 상태(3=unavailable, 4=unavailable? 아님 확인)',
  c3.source === 'unavailable' && c1.source !== 'unavailable' && c4.source !== 'unavailable',
  `1=${c1.source} 2=${c2.source} 3=${c3.source} 4=${c4.source}`);

console.log('');
console.log('--- 민감정보 검사: 정상 13 통과 + 부정 fixture 실패 ---');
// 재사용 검사 함수(제품 소스 아님 — 검사 로직만)
const WHITELIST = new Set(DATA.SIM_CATALOG_V1_MANIFEST.fields);
const MACHINE_ID = new Set(['productId', 'productCode', 'registeredAt', 'modifiedAt']);
const FORBIDDEN_KEY = /(^stock$|receiver|buyer|memberId|orderNo|address|addr|zipcode|cookie|password|passwd|secret|token|api[_-]?key|partner_?key|userKey|auth|email|phone|mobile)/i;
const EMAIL = /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/;
const KR_PHONE = /(?<!\d)01[016789][-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/;
const SECRET_MARKER = /(api[_-]?key|secret|token|cookie|password|passwd|bearer\s|sk-[A-Za-z0-9]{12,})/i;
const HIGH_ENTROPY = /\b[A-Fa-f0-9]{32,}\b|\b[A-Za-z0-9+/]{40,}={0,2}\b/;
const scan = (records) => {
  const v = [];
  for (const rec of records) {
    for (const [k, val] of Object.entries(rec)) {
      if (!WHITELIST.has(k)) { v.push(`미지필드:${k}`); if (FORBIDDEN_KEY.test(k)) v.push(`금지필드명:${k}`); }
      if (typeof val === 'string') {
        if (EMAIL.test(val)) v.push(`email:${k}`);
        if (SECRET_MARKER.test(val)) v.push(`secret:${k}`);
        if (HIGH_ENTROPY.test(val)) v.push(`entropy:${k}`);
        if (!MACHINE_ID.has(k) && KR_PHONE.test(val)) v.push(`phone:${k}`);
      }
    }
    if ('stock' in rec) v.push('stock');
  }
  return [...new Set(v)];
};
const REAL = DATA.SIM_CATALOG_V1_RECORDS;
const base = REAL[0];
F('민감 양성: 정상 표본 13개 전체 문자열 값 위반 0 (productId·상품코드·datetime 오탐 없음)', scan(REAL).length === 0, `위반=${scan(REAL).length}`);
const neg = [
  ['상품명 이메일', { ...base, productName: '문의 seller@example.com' }, /email:productName/],
  ['제조사 휴대폰', { ...base, makerName: '010-1234-5678' }, /phone:makerName/],
  ['옵션명 휴대폰', { ...base, optionName: '01098765432' }, /phone:optionName/],
  ['secret/token 값', { ...base, brandCode: 'sk-abcdef1234567890abcd' }, /secret:brandCode|entropy:brandCode/],
  ['미허용 필드(customerEmail)', { ...base, customerEmail: 'x@y.com' }, /미지필드:customerEmail/],
  ['실재고 필드', { ...base, stock: 7 }, /stock/]
];
let negOk = true, negD = [];
for (const [nm, rec, re] of neg) { const v = scan([rec]); const hit = v.some((x) => re.test(x)); if (!hit) { negOk = false; negD.push(`${nm}:MISS(${v.join(',')})`); } }
F('민감 음성: email·휴대폰(제조사/옵션)·secret/token·미허용필드·실재고 fixture 전부 검출', negOk, negOk ? '6종 전부 실패 검출' : negD.join(' · '));
const pos = scan([{ ...base, productId: '1000000012', productCode: 'A-01', registeredAt: '2026-06-23 15:55:27', modifiedAt: '2026-06-23 15:55:27' }]);
F('민감 오탐 없음: 정상 productId·상품코드·datetime 은 통과', pos.length === 0, `위반=${pos.length}`);

console.log('');
console.log(`[FACT] ${fact} pass / ${factf} fail   [RED ] ${red} met / ${redx} unmet`);
rmSync(outApi, { recursive: true, force: true });
rmSync(outSrc, { recursive: true, force: true });
if (factf > 0) { console.log('\n✗ 관찰 불일치'); process.exit(1); }
if (redx > 0) { console.log(`\n✗ ${redx}건 결함 미재현`); process.exit(1); }
console.log('\n✓ RED 감사 성립 — 연결 안 됨(3)이 소비처 3곳에서 "실 0건"으로 렌더되어 실제 0건(4)과 혼동됨.');
console.log('  판정 지점=realOrdersStatus. source 는 단일 의미(실제 주문 slice). 민감검사 양성/음성 확인.');
