#!/usr/bin/env node
/*
 * scripts/smoke-data-source-server-01-red-v0.mjs
 * DATA-SOURCE-SERVER-01 — 서버 경계 출처 계약 (RED→GREEN)
 *
 * 목적: 실제/샌드박스 요청이 실패·미구현·키 부재일 때 **서버가** 시험 mock 레코드를
 *   만들어 반환하는 경로를 실제 함수 수준에서 재현한다. 네트워크에 의존하지 않는다
 *   (globalThis.fetch 스텁 + process.env 제어).
 *
 *   [BASE] = GREEN 계약 불변식. fail>0 이면 회귀다.
 *            (RED 커밋 d002419 시점에는 이 중 다수가 결함 동작을 기록하고 있었다 —
 *             그 커밋을 체크아웃하면 당시 값을 그대로 재현할 수 있다.)
 *   [RED ] = 계약 목표 C1~C13. GREEN 도달 후에는 전부 MET 여야 한다.
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
const fact = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? factP++ : factF++; };
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
    if (net === 'orderFailOnly' && String(url).includes('Order_Search')) throw new Error('order api down (stub)');
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
  explicitMock:{ mode: 'mock', net: 'ok' },
  // 주문 API 만 실패, 상품 API 는 성공 — 시뮬레이션 독립성 확인용
  orderFailOnly:{ mode: 'real', net: 'orderFailOnly' }
};

const run = async (scenario, fn) => { setScenario(scenario); try { return await fn(); } finally { globalThis.fetch = realFetch; } };
const rows = [];
const record = (경로, 시나리오, r) => {
  rows.push({ 경로, 시나리오, count: r.count, source: r.source, mode: r.mode, live: r.live, err: r.errorMessage ? 'Y' : '-' });
  return r;
};

console.log('=== DATA-SOURCE-SERVER-01 — 서버 경계 출처 계약 (RED→GREEN) ===');
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
// 주문만 실패 + 상품 성공 → 시뮬레이션은 유지돼야 한다(독립 시험자료).
const rvSynthOrderFail = record('resolveOrdersRevenue(synthetic=true)', '주문실패+상품성공', await run(S.orderFailOnly, () => R.resolveOrdersRevenue({ includeSynthetic: true })));
const rvMock = record('resolveOrdersRevenue(synthetic=false)', '명시적 mock 모드', await run(S.explicitMock, () => R.resolveOrdersRevenue({ includeSynthetic: false })));

// ── D. Sync All 혼합 (sync.ts 집계 로직 재현) ────────────────────────────────
const syncAll = await run(S.realOk, async () => {
  const resources = ['orders', 'inquiries', 'reviews', 'inventory', 'sales'];
  const resolved = await Promise.all(resources.map((r) => R.resolveResource(r)));
  // 라우트가 쓰는 **실제 집계 함수**를 그대로 호출한다(복사본 검증 금지).
  return { ...R.summarizeSyncAll(resources, resolved), resolved };
});
const syncAllOk = await run(S.realOk, async () => {
  const resources = ['orders', 'inventory', 'sales'];
  const resolved = await Promise.all(resources.map((r) => R.resolveResource(r)));
  return R.summarizeSyncAll(resources, resolved);
});
const syncAllMock = await run(S.explicitMock, async () => {
  const resources = ['orders', 'inquiries', 'reviews', 'inventory', 'sales'];
  const resolved = await Promise.all(resources.map((r) => R.resolveResource(r)));
  return R.summarizeSyncAll(resources, resolved);
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
fact('B1. real 성공+레코드 → 실제 레코드 반환(api_proxy_real, live)',
  rrOrdersOk.count === 1 && rrOrdersOk.source === 'api_proxy_real' && rrOrdersOk.live === true,
  `count=${rrOrdersOk.count} source=${rrOrdersOk.source}`);

fact('B2. real 성공+빈배열 → 실제 데이터 0건(live 유지, mock 주입 없음)',
  rrOrdersEmpty.count === 0 && rrOrdersEmpty.source === 'api_proxy_real' && rrOrdersEmpty.live === true,
  `count=${rrOrdersEmpty.count} source=${rrOrdersEmpty.source} live=${rrOrdersEmpty.live}`);

fact('B3. real 실패 → 0건 + unavailable + 사유 (RED 당시: mock 5건/api_mock_fallback)',
  rrOrdersFail.count === 0 && rrOrdersFail.source === 'unavailable' && rrOrdersFail.live === false && !!rrOrdersFail.errorMessage,
  `count=${rrOrdersFail.count} source=${rrOrdersFail.source} errorMessage=있음`);

fact('B4. real 실패(HTTP500)도 동일 (RED 당시: mock 5건)',
  rrOrders500.count === 0 && rrOrders500.source === 'unavailable' && !!rrOrders500.errorMessage,
  `count=${rrOrders500.count} source=${rrOrders500.source}`);

fact('B5. real 미구현(inquiries/reviews) → 0건 (RED 당시: mock 3건씩)',
  rrInquiries.count === 0 && rrReviews.count === 0 && rrInquiries.source === 'unavailable',
  `inquiries=${rrInquiries.count}건 reviews=${rrReviews.count}건`);

fact('B6. real 키 부재 → 0건 + 안전한 사유 문구 (RED 당시: mock 5건·사유 없음)',
  rrOrdersNoKey.count === 0 && rrOrdersNoKey.source === 'unavailable' &&
  rrOrdersNoKey.errorMessage === 'Godomall live mode is not configured (mode/keys missing).',
  `count=${rrOrdersNoKey.count} errorMessage="${rrOrdersNoKey.errorMessage}"`);

fact('B7. 사유 문구에 키·URL 파라미터·raw XML·PII 가 포함되지 않는다',
  [rrOrdersFail, rrOrders500, rrOrdersNoKey, rrSandboxFail, rrInquiries]
    .every((r) => !/stub-partner|stub-user|partner_key|key=|<\?xml|orderNo|godo\.co\.kr/i.test(String(r.errorMessage ?? ''))),
  '비밀값 미포함');

fact('B8. sandbox 실패 → 0건 + unavailable (RED 당시: mock 5건)',
  rrSandboxFail.count === 0 && rrSandboxFail.source === 'unavailable',
  `count=${rrSandboxFail.count} source=${rrSandboxFail.source}`);

fact('B9. 명시적 mock 모드 → fixture 반환 (계약상 허용 — 불변)',
  rrMock.count > 0 && rrMock.source === 'api_mock_fallback' && rrMock.mode === 'mock',
  `count=${rrMock.count} mode=${rrMock.mode} source=${rrMock.source}`);

fact('B10. resolveOrdersAdmin real 실패 → 0건·집계 0·unavailable (RED 당시: mock 5건)',
  adFail.count === 0 && adFail.records.length === 0 && adFail.source === 'unavailable' &&
  adFail.unpaidCount === 0 && adFail.undeliveredCount === 0 && !!adFail.errorMessage,
  `count=${adFail.count} unpaid=${adFail.unpaidCount} undelivered=${adFail.undeliveredCount} source=${adFail.source}`);

fact('B11. resolveOrdersAdmin real 성공은 그대로 (레코드/빈배열)',
  adOk.count === 1 && adOk.source === 'api_proxy_real' && adEmpty.count === 0 && adEmpty.live === true,
  `성공=${adOk.count}건 · 빈배열=${adEmpty.count}건(live=${adEmpty.live})`);

fact('B12. revenue real 실패(synthetic=false) → 0건·summary null (RED 당시: mock 5건 유입)',
  rvFail.count === 0 && rvFail.orders.length === 0 && rvFail.source === 'unavailable' &&
  rvFail.summary === null && rvFail.realOrdersStatus === 'unavailable',
  `count=${rvFail.count} summary=${rvFail.summary === null ? 'null' : '있음'} source=${rvFail.source}`);

fact('B13. revenue 어떤 경로에서도 fallback 주문이 real_godomall/dataKind:real 로 표시되지 않는다',
  [rvFail, rvNoKey, rvSynthFail].every((r) => r.orders.every((o) => o.sourceType !== 'real_godomall' && o.dataKind !== 'real')),
  'fallback 주문 0건');

fact('B14. 명시적 mock 모드 revenue fixture 는 fixture_mock/dataKind:mock 으로 구별된다',
  rvMock.orders.length > 0 && rvMock.orders.every((o) => o.sourceType === 'fixture_mock' && o.dataKind === 'mock') &&
  rvMock.source === 'api_mock_fallback' && rvMock.realOrdersStatus === 'fixture',
  `${rvMock.orders.length}건 fixture_mock/dataKind=mock`);

fact('B15. revenue real 성공은 그대로 (레코드 / 빈배열은 유효한 0값 summary)',
  rvOk.count === 1 && rvOk.source === 'api_proxy_real' &&
  rvEmpty.count === 0 && rvEmpty.live === true && rvEmpty.summary !== null,
  `성공=${rvOk.count}건 · 빈배열 summary=${rvEmpty.summary === null ? 'null' : '유효(0값)'}`);

fact('B16. includeSynthetic=true 시뮬레이션은 synthetic_test 로 구별 (불변)',
  rvSynthOk.orders.some((o) => o.sourceType === 'synthetic_test' && o.dataKind === 'synthetic'),
  `synthetic ${rvSynthOk.orders.filter((o) => o.sourceType === 'synthetic_test').length}건`);

fact('B17. 주문 실패 + 상품 성공 + synthetic=true → 시뮬레이션 유지, 실제 slice 만 unavailable',
  rvSynthOrderFail.orders.filter((o) => o.dataKind === 'synthetic').length > 0 &&
  rvSynthOrderFail.orders.every((o) => o.dataKind !== 'real') &&
  rvSynthOrderFail.realOrdersStatus === 'unavailable' && rvSynthOrderFail.syntheticStatus === 'success' &&
  !!rvSynthOrderFail.realOrdersErrorMessage,
  `시뮬 ${rvSynthOrderFail.orders.filter((o) => o.dataKind === 'synthetic').length}건 유지 · realOrdersStatus=${rvSynthOrderFail.realOrdersStatus}`);

fact('B18. 상품 조회까지 실패 → 시뮬레이션 unavailable (작은 mock 상품으로 대체하지 않음)',
  rvSynthFail.syntheticStatus === 'unavailable' && rvSynthFail.orders.length === 0 &&
  rvSynthFail.summary === null && !!rvSynthFail.syntheticErrorMessage,
  `syntheticStatus=${rvSynthFail.syntheticStatus} orders=${rvSynthFail.orders.length} summary=${rvSynthFail.summary === null ? 'null' : '있음'}`);

fact('B19. Sync All 부분 실패 → syncStatus=partial · 전역 unavailable · 성공 리소스는 sources 로 보존',
  syncAll.syncStatus === 'partial' && syncAll.sourceType === 'unavailable' &&
  syncAll.sources.orders === 'api_proxy_real' && syncAll.sources.inquiries === 'unavailable',
  `syncStatus=${syncAll.syncStatus} 전역=${syncAll.sourceType} sources=${JSON.stringify(syncAll.sources)}`);

fact('B20. Sync All importedCount 는 허용된 레코드만 합산(unavailable 리소스 0건) + 리소스별 사유 보존',
  syncAll.importedCount === syncAll.resolved.reduce((s, r) => s + (r.source === 'unavailable' ? 0 : r.count), 0) &&
  syncAll.unavailableResourceCount === 2 && !!syncAll.resourceErrors.inquiries,
  `importedCount=${syncAll.importedCount} unavailable=${syncAll.unavailableResourceCount}건 · 사유보존=${Object.keys(syncAll.resourceErrors).join(',')}`);

fact('B21. Sync All 전부 성공 → success, 명시적 mock → fixture',
  syncAllOk.syncStatus === 'success' && syncAllOk.sourceType === 'api_proxy_real' &&
  syncAllMock.syncStatus === 'fixture' && syncAllMock.sourceType === 'api_mock_fallback',
  `success=${syncAllOk.syncStatus} · fixture=${syncAllMock.syncStatus}`);

fact('B22. PII 마스킹 경계 불변 — 실제 성공 경로에서 마스킹이 계속 동작한다',
  typeof rrOrdersOk.maskedCount === 'number' && rrOrdersOk.maskedCount >= 0 &&
  typeof rrMock.maskedCount === 'number' && rrMock.maskedCount > 0,
  `real=${rrOrdersOk.maskedCount} · mock=${rrMock.maskedCount}`);

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
console.log(`[BASE] ${factP} pass / ${factF} fail   (GREEN 계약 불변식 — fail>0이면 회귀)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (계약 목표 C1~C13)`);
rmSync(tmp, { recursive: true, force: true });
if (factF > 0) { console.log('\n✗ 진단 불일치 — FACT 실패'); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN 도달 (서버 경계에서 실제 0건 / 연결 안 됨 / 명시적 시험자료 구별)');
