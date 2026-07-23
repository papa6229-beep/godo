#!/usr/bin/env node
/*
 * scripts/smoke-data-source-server-01-red-v0.mjs
 * DATA-SOURCE-SERVER-01 — 서버 자동 mock 대체 경로 전수 재현 (RED 진단)
 *
 * 목적: 실제/샌드박스 요청이 실패·미구현·키 부재일 때 **서버가** 시험 mock 레코드를
 *   만들어 반환하는 경로를 실제 함수 수준에서 재현한다. 네트워크에 의존하지 않는다
 *   (globalThis.fetch 스텁 + process.env 제어).
 *
 * 이 단계는 RED **진단 전용**이다. 제품 소스는 한 줄도 고치지 않는다.
 *   [FACT] = 현재 동작을 값으로 고정(진단 사실). 지금 통과해야 정상이며, GREEN 이후 바뀔 수 있다.
 *   [RED ] = 목표 계약. 지금은 미충족(unmet)이 정상이다.
 *
 * 계약 목표 초안(문서 §4와 동일):
 *   - real/sandbox 성공 빈배열 = 실제 데이터 0건
 *   - real/sandbox 실패·미구현·키 부재 = 연결 안 됨, records 0
 *   - real 요청 실패 시 mock 자동 주입 금지
 *   - mock/fixture 는 사용자가 명시적으로 test/mock 을 선택한 경우에만
 *   - 2년치 운영 시뮬레이션(includeSynthetic)은 자동 fallback 과 구별되는 명시적 simulation
 *   - PII 마스킹 경계 불변
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
// emit 산출물은 **repo 안**(node_modules/.cache)에 둔다 — fast-xml-parser 등 런타임 의존을
// Node 가 상위 node_modules 로 해석할 수 있어야 하기 때문이다. node_modules 는 gitignore 대상이라
// 작업 트리를 더럽히지 않으며, 실행 종료 시 삭제한다.
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'dss01-'));

let R;
try {
  execFileSync(
    process.execPath,
    [tscBin, path.join(REPO, 'api', '_shared', 'godomallResource.ts'), '--ignoreConfig',
     '--rootDir', path.join(REPO, 'api'), '--outDir', tmp,
     '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck',
     '--types', 'node'],
    { stdio: 'pipe' }
  );
  const dir = path.join(tmp, '_shared');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  R = await import(pathToFileURL(path.join(tmp, '_shared', 'godomallResource.js')).href);
} catch (e) {
  console.error('[smoke] 서버 모듈 tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

let factP = 0, factF = 0, redMet = 0, redUnmet = 0;
const fact = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [FACT] ${n}${cur ? `  — ${cur}` : ''}`); c ? factP++ : factF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };

// ── XML 스텁 (익명 — 실주문번호·PII 없음) ────────────────────────────────────
const xmlOrders1 = `<?xml version="1.0" encoding="utf-8"?><data><header><code>000</code><msg>success</msg></header><return>
<order_data><orderNo>ANON-ORDER-0001</orderNo><orderDate>2026-07-01 10:00:00</orderDate><orderStatus>p1</orderStatus>
<settlePrice>12500</settlePrice><totalGoodsPrice>10000</totalGoodsPrice><totalDeliveryCharge>2500</totalDeliveryCharge>
<orderGoodsData><goodsNo>1001</goodsNo><goodsNm>(익명 상품명)</goodsNm><goodsCnt>1</goodsCnt><goodsPrice>10000</goodsPrice></orderGoodsData>
</order_data></return></data>`;
const xmlEmpty = `<?xml version="1.0" encoding="utf-8"?><data><header><code>000</code><msg>success</msg></header><return></return></data>`;
const xmlGoods1 = `<?xml version="1.0" encoding="utf-8"?><data><header><code>000</code><msg>success</msg></header><return>
<goods_data><goodsNo>1001</goodsNo><goodsCd>A1</goodsCd><goodsNm>(익명 상품명)</goodsNm><goodsPrice>10000</goodsPrice>
<totalStock>7</totalStock><stockFl>y</stockFl><soldOutFl>n</soldOutFl></goods_data></return></data>`;

// ── 환경/네트워크 시나리오 스텁 ───────────────────────────────────────────────
const ENV_KEYS = ['GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;

const setScenario = ({ mode, keys = true, net }) => {
  process.env.GODOMALL_API_MODE = mode;
  if (keys) { process.env.GODOMALL_PARTNER_KEY = 'stub-partner'; process.env.GODOMALL_USER_KEY = 'stub-user'; }
  else { delete process.env.GODOMALL_PARTNER_KEY; delete process.env.GODOMALL_USER_KEY; }
  globalThis.fetch = async (url) => {
    if (net === 'throw') throw new Error('network down (stub)');
    if (net === 'http500') return { ok: false, status: 500, text: async () => 'err' };
    const isGoods = String(url).includes('Goods_Search');
    const body = net === 'empty' ? xmlEmpty : (isGoods ? xmlGoods1 : xmlOrders1);
    return { ok: true, status: 200, text: async () => body };
  };
};
const restore = () => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  globalThis.fetch = realFetch;
};

const S = {
  realOk:      { mode: 'real', net: 'ok' },
  realEmpty:   { mode: 'real', net: 'empty' },
  realFail:    { mode: 'real', net: 'throw' },
  realHttp500: { mode: 'real', net: 'http500' },
  realNoKeys:  { mode: 'real', keys: false, net: 'ok' },
  sandboxFail: { mode: 'sandbox', net: 'throw' },
  explicitMock:{ mode: 'mock', net: 'ok' }
};

const run = async (scenario, fn) => { setScenario(scenario); try { return await fn(); } finally { globalThis.fetch = realFetch; } };
const rows = [];
const record = (경로, 시나리오, r) => {
  rows.push({ 경로, 시나리오, count: r.count, source: r.source, mode: r.mode, live: r.live, err: r.errorMessage ? 'Y' : '-' });
  return r;
};

console.log('=== DATA-SOURCE-SERVER-01 — 서버 자동 mock 대체 전수 재현 (RED 진단) ===');
console.log('');

// ── A. resolveResource ───────────────────────────────────────────────────────
const rrOrdersOk    = record('resolveResource(orders)', 'real 성공+레코드', await run(S.realOk,      () => R.resolveResource('orders')));
const rrOrdersEmpty = record('resolveResource(orders)', 'real 성공+빈배열', await run(S.realEmpty,   () => R.resolveResource('orders')));
const rrOrdersFail  = record('resolveResource(orders)', 'real 실패(네트워크)', await run(S.realFail,  () => R.resolveResource('orders')));
const rrOrders500   = record('resolveResource(orders)', 'real 실패(HTTP500)', await run(S.realHttp500,() => R.resolveResource('orders')));
const rrOrdersNoKey = record('resolveResource(orders)', 'real 키 부재',      await run(S.realNoKeys,  () => R.resolveResource('orders')));
const rrInquiries   = record('resolveResource(inquiries)', 'real 미구현',    await run(S.realOk,      () => R.resolveResource('inquiries')));
const rrReviews     = record('resolveResource(reviews)', 'real 미구현',      await run(S.realOk,      () => R.resolveResource('reviews')));
const rrSandboxFail = record('resolveResource(orders)', 'sandbox 실패',      await run(S.sandboxFail, () => R.resolveResource('orders')));
const rrMock        = record('resolveResource(orders)', '명시적 mock 모드',  await run(S.explicitMock,() => R.resolveResource('orders')));
const rrInvNoKey    = record('resolveResource(inventory)', 'real 키 부재',   await run(S.realNoKeys,  () => R.resolveResource('inventory')));
const rrProdFail    = record('resolveResource(products)', 'real 실패',       await run(S.realFail,    () => R.resolveResource('products')));

// ── B. resolveOrdersAdmin ────────────────────────────────────────────────────
const adOk    = record('resolveOrdersAdmin', 'real 성공+레코드', await run(S.realOk,     () => R.resolveOrdersAdmin()));
const adEmpty = record('resolveOrdersAdmin', 'real 성공+빈배열', await run(S.realEmpty,  () => R.resolveOrdersAdmin()));
const adFail  = record('resolveOrdersAdmin', 'real 실패',        await run(S.realFail,   () => R.resolveOrdersAdmin()));
const adNoKey = record('resolveOrdersAdmin', 'real 키 부재',     await run(S.realNoKeys, () => R.resolveOrdersAdmin()));

// ── C. resolveOrdersRevenue ──────────────────────────────────────────────────
const rvOk        = record('resolveOrdersRevenue(synthetic=false)', 'real 성공+레코드', await run(S.realOk,    () => R.resolveOrdersRevenue({ includeSynthetic: false })));
const rvEmpty     = record('resolveOrdersRevenue(synthetic=false)', 'real 성공+빈배열', await run(S.realEmpty, () => R.resolveOrdersRevenue({ includeSynthetic: false })));
const rvFail      = record('resolveOrdersRevenue(synthetic=false)', 'real 실패',        await run(S.realFail,  () => R.resolveOrdersRevenue({ includeSynthetic: false })));
const rvNoKey     = record('resolveOrdersRevenue(synthetic=false)', 'real 키 부재',     await run(S.realNoKeys,() => R.resolveOrdersRevenue({ includeSynthetic: false })));
const rvSynthOk   = record('resolveOrdersRevenue(synthetic=true)',  'real 성공+레코드', await run(S.realOk,    () => R.resolveOrdersRevenue({ includeSynthetic: true })));
const rvSynthFail = record('resolveOrdersRevenue(synthetic=true)',  'real 실패',        await run(S.realFail,  () => R.resolveOrdersRevenue({ includeSynthetic: true })));

// ── D. Sync All 혼합 (sync.ts 집계 로직 재현) ────────────────────────────────
const syncAll = await run(S.realOk, async () => {
  const resources = ['orders', 'inquiries', 'reviews', 'inventory', 'sales'];
  const resolved = await Promise.all(resources.map((r) => R.resolveResource(r)));
  const sources = {}; let anyLive = false, importedCount = 0;
  resources.forEach((r, i) => { sources[r] = resolved[i].source; if (resolved[i].live) anyLive = true; importedCount += resolved[i].count; });
  const primaryMode = resolved[0]?.mode || 'mock';
  const sourceType = anyLive ? (primaryMode === 'real' ? 'api_proxy_real' : 'api_proxy_sandbox') : 'api_mock_fallback';
  return { sources, sourceType, importedCount, resolved };
});
restore();

// ── 경로별 반환 형태 표 ──────────────────────────────────────────────────────
console.log('--- 경로 × 시나리오 반환 형태 (실측) ---');
console.log('  ' + '경로'.padEnd(38) + '시나리오'.padEnd(20) + 'count  source                 mode     live  err');
for (const r of rows) {
  console.log('  ' + String(r.경로).padEnd(38) + String(r.시나리오).padEnd(20) +
    String(r.count).padEnd(7) + String(r.source).padEnd(23) + String(r.mode).padEnd(9) + String(r.live).padEnd(6) + r.err);
}
console.log('');

// ── [FACT] 현재 동작 고정 ────────────────────────────────────────────────────
fact('F1. real 성공+레코드 → 실제 레코드 반환(api_proxy_real, live)',
  rrOrdersOk.count === 1 && rrOrdersOk.source === 'api_proxy_real' && rrOrdersOk.live === true,
  `count=${rrOrdersOk.count} source=${rrOrdersOk.source}`);

fact('F2. real 성공+빈배열 → 0건 유지(실제 데이터 0건, mock 주입 없음)',
  rrOrdersEmpty.count === 0 && rrOrdersEmpty.source === 'api_proxy_real' && rrOrdersEmpty.live === true,
  `count=${rrOrdersEmpty.count} source=${rrOrdersEmpty.source} live=${rrOrdersEmpty.live}`);

fact('F3. real 실패 → **mock 주문이 반환된다**(자동 대체)',
  rrOrdersFail.count > 0 && rrOrdersFail.source === 'api_mock_fallback' && rrOrdersFail.live === false && !!rrOrdersFail.errorMessage,
  `count=${rrOrdersFail.count} source=${rrOrdersFail.source} errorMessage=있음`);

fact('F4. real 미구현(inquiries/reviews) → mock 3건 반환',
  rrInquiries.count === 3 && rrReviews.count === 3 && rrInquiries.source === 'api_mock_fallback',
  `inquiries=${rrInquiries.count}건 reviews=${rrReviews.count}건`);

fact('F5. real 키 부재 → mock 반환 + errorMessage 조차 없음(사유 미상)',
  rrOrdersNoKey.count > 0 && rrOrdersNoKey.source === 'api_mock_fallback' && rrOrdersNoKey.errorMessage === undefined,
  `count=${rrOrdersNoKey.count} errorMessage=${rrOrdersNoKey.errorMessage === undefined ? '없음' : '있음'}`);

fact('F6. sandbox 실패 → mock 반환',
  rrSandboxFail.count > 0 && rrSandboxFail.source === 'api_mock_fallback',
  `count=${rrSandboxFail.count} source=${rrSandboxFail.source}`);

fact('F7. 명시적 mock 모드 → fixture 반환 (이 경우는 계약상 허용)',
  rrMock.count > 0 && rrMock.source === 'api_mock_fallback' && rrMock.mode === 'mock',
  `count=${rrMock.count} mode=${rrMock.mode}`);

fact('F8. resolveOrdersAdmin real 실패 → mock 주문 반환',
  adFail.count > 0 && adFail.source === 'api_mock_fallback' && adFail.live === false,
  `count=${adFail.count} source=${adFail.source}`);

fact('F9. resolveOrdersRevenue real 실패 → includeSynthetic=false 인데도 mock 주문 유입',
  rvFail.count > 0 && rvFail.live === false,
  `count=${rvFail.count} live=${rvFail.live}`);

fact('F10. 그 mock 주문이 **dataKind=real / sourceType=real_godomall** 로 표시된다',
  rvFail.orders.length > 0 && rvFail.orders.every((o) => o.sourceType === 'real_godomall' && o.dataKind === 'real'),
  `첫 주문 sourceType=${rvFail.orders[0]?.sourceType} dataKind=${rvFail.orders[0]?.dataKind}`);

fact('F11. includeSynthetic=true 시뮬레이션은 synthetic_test 로 구별 표시된다',
  rvSynthOk.orders.some((o) => o.sourceType === 'synthetic_test' && o.dataKind === 'synthetic'),
  `synthetic 주문 ${rvSynthOk.orders.filter((o) => o.sourceType === 'synthetic_test').length}건 포함`);

// real 실패 시 시뮬레이션은 실 Products 조인에 의존하므로 함께 붕괴한다(products=[] → 0건).
// 결과적으로 남는 것은 **mock 주문뿐이며 그것이 real 로 표시된다** — 대시보드가 가장 오해하기 쉬운 상태.
fact('F12. real 실패 + synthetic=true → 시뮬레이션은 0건으로 붕괴하고 mock(real 표시)만 남는다',
  rvSynthFail.orders.filter((o) => o.dataKind === 'synthetic').length === 0 &&
  rvSynthFail.orders.length > 0 && rvSynthFail.orders.every((o) => o.dataKind === 'real'),
  `synthetic ${rvSynthFail.orders.filter((o) => o.dataKind === 'synthetic').length}건 · real표시 ${rvSynthFail.orders.filter((o) => o.dataKind === 'real').length}건`);

fact('F13. Sync All 혼합: 일부 실제/일부 mock 인데 전역 sourceType 은 api_proxy_real 하나로 표기',
  syncAll.sourceType === 'api_proxy_real' &&
  syncAll.sources.orders === 'api_proxy_real' && syncAll.sources.inquiries === 'api_mock_fallback',
  `전역=${syncAll.sourceType} · sources=${JSON.stringify(syncAll.sources)}`);

fact('F14. Sync All importedCount 에 mock 건수가 합산된다',
  syncAll.importedCount > (syncAll.resolved[0].count + syncAll.resolved[3].count + syncAll.resolved[4].count),
  `importedCount=${syncAll.importedCount} (문의3+리뷰3 mock 포함)`);

fact('F15. PII 마스킹 경계는 mock 경로에서도 동일하게 통과한다(경계 불변 확인)',
  typeof rrOrdersFail.maskedCount === 'number' && rrOrdersFail.maskedCount >= 0,
  `maskedCount=${rrOrdersFail.maskedCount}`);

// ── [RED] 계약 목표 (지금은 미충족이 정상) ───────────────────────────────────
console.log('');
red('C1. real 실패 → records 0건 (mock 자동 주입 금지)',
  rrOrdersFail.count === 0, `count=${rrOrdersFail.count}`);
red('C2. real 실패 → 연결 안 됨으로 식별 가능한 source (api_mock_fallback 아님)',
  rrOrdersFail.source !== 'api_mock_fallback', `source=${rrOrdersFail.source}`);
red('C3. real 미구현(inquiries/reviews) → records 0건',
  rrInquiries.count === 0 && rrReviews.count === 0, `inquiries=${rrInquiries.count} reviews=${rrReviews.count}`);
red('C4. real 키 부재 → records 0건 + 사유(errorMessage) 제공',
  rrOrdersNoKey.count === 0 && !!rrOrdersNoKey.errorMessage,
  `count=${rrOrdersNoKey.count} errorMessage=${rrOrdersNoKey.errorMessage === undefined ? '없음' : '있음'}`);
red('C5. sandbox 실패 → records 0건',
  rrSandboxFail.count === 0, `count=${rrSandboxFail.count}`);
red('C6. real 성공 빈배열 = 실제 데이터 0건 (이미 충족되어야 함)',
  rrOrdersEmpty.count === 0 && rrOrdersEmpty.live === true, `count=${rrOrdersEmpty.count} live=${rrOrdersEmpty.live}`,
  '실제 데이터 0건 유지');
red('C7. 명시적 mock 모드에서만 fixture 허용 (이미 충족되어야 함)',
  rrMock.count > 0 && rrMock.mode === 'mock', `mode=${rrMock.mode}`, '명시적 test/mock 선택 시 fixture 허용');
red('C8. resolveOrdersAdmin real 실패 → 주문 0건',
  adFail.count === 0, `count=${adFail.count}`);
red('C9. resolveOrdersRevenue real 실패 → 주문 0건 (includeSynthetic=false)',
  rvFail.count === 0, `count=${rvFail.count}`);
red('C10. mock 주문이 real_godomall/dataKind=real 로 표시되지 않는다',
  rvFail.orders.every((o) => o.sourceType !== 'real_godomall'),
  `${rvFail.orders.filter((o) => o.sourceType === 'real_godomall').length}건이 real_godomall 로 표시됨`);
red('C11. 2년치 시뮬레이션은 자동 fallback 과 구별된다 (이미 충족되어야 함)',
  rvSynthOk.orders.filter((o) => o.dataKind === 'synthetic').length > 0,
  'synthetic 미구별', 'synthetic_test 로 명시 구별됨');
red('C12. Sync All 혼합 시 전역 표기가 실제/미연결 혼재를 감춘다 → 혼재 표현 필요',
  syncAll.sourceType !== 'api_proxy_real',
  `전역=${syncAll.sourceType} 인데 inquiries/reviews 는 미연결`);
red('C13. products/inventory 도 동일 원칙 (real 실패 시 0건)',
  rrProdFail.count === 0 && rrInvNoKey.count === 0,
  `products(실패)=${rrProdFail.count} inventory(키부재)=${rrInvNoKey.count}`);

console.log('');
console.log('--- 요약 ---');
console.log(`[FACT] ${factP} pass / ${factF} fail   (현재 동작 고정 — fail>0이면 진단 재작성 필요)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (계약 목표 — GREEN 미착수이므로 unmet>0이 정상)`);
rmSync(tmp, { recursive: true, force: true });
if (factF > 0) { console.log('\n✗ 진단 불일치 — FACT 실패'); process.exit(1); }
console.log(`\n✓ RED 진단 완료 — 자동 mock 대체 경로 ${redUnmet}건 미충족(예상된 상태)`);
