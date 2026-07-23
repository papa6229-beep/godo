#!/usr/bin/env node
/*
 * scripts/smoke-data-source-server-01-green-f-screen-state-v0.mjs
 * DATA-SOURCE-SERVER-01 (GREEN F) — 서버 계산 결과 → **화면 데이터 상태** 판정 (RED→GREEN)
 *
 * 배경(교차검토 지적):
 *   서버는 실제 주문 실패 + 상품 성공 시 2년치 시뮬레이션과 summary 를 정상 생성한다
 *   (realOrdersStatus='unavailable', syntheticStatus='success').
 *   그러나 클라이언트 fetchRevenue 가 slice 상태를 RevenueResult 에 보존하지 않고
 *   최상위 sourceType='unavailable' 만 source 로 넘겨서,
 *   ProductTeamDashboard / CalendarPanel / CsTeamDashboard 가 **멀쩡한 시험 데이터를 숨겼다**.
 *   → "서버 계산 유지"는 됐지만 "사용자가 시험 데이터를 계속 이용 가능"은 미충족이었다.
 *
 * 이 검사는 두 층을 분리해 본다:
 *   [서버]  resolveOrdersRevenue 가 slice 상태와 시뮬레이션을 실제로 만들어 내는가
 *   [화면]  그 상태가 공통 판정 함수에서 '시험 데이터(사용 가능)'로 판정되는가
 *           + 소비자 3곳이 그 공통 함수를 쓰는가(복붙 조건 잔존 0)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'dssf-'));

const STATE_SRC = path.join(REPO, 'src', 'services', 'revenueScreenState.ts');
let R = null, ST = null;
try {
  // 서버 모듈
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'godomallResource.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api'), '--outDir', path.join(tmp, 'srv'),
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
  const sdir = path.join(tmp, 'srv', '_shared');
  for (const f of readdirSync(sdir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(sdir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  R = await import(pathToFileURL(path.join(sdir, 'godomallResource.js')).href);

  // 클라이언트 판정 모듈(GREEN F 대상 — RED 단계에는 없다)
  if (existsSync(STATE_SRC)) {
    execFileSync(process.execPath, [tscBin, STATE_SRC,
      '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', path.join(tmp, 'cli'),
      '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
    const cdir = path.join(tmp, 'cli', 'services');
    for (const f of readdirSync(cdir).filter((x) => x.endsWith('.js'))) {
      const p = path.join(cdir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
    ST = await import(pathToFileURL(path.join(cdir, 'revenueScreenState.js')).href);
  }
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const svcSource = readFileSync(path.join(REPO, 'src', 'services', 'departmentDataService.ts'), 'utf8');
const CONSUMERS = ['ProductTeamDashboard.tsx', 'CalendarPanel.tsx', 'CsTeamDashboard.tsx'];
const consumerSources = Object.fromEntries(
  CONSUMERS.map((f) => [f, readFileSync(path.join(REPO, 'src', 'components', f), 'utf8')])
);

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== DATA-SOURCE-SERVER-01 (GREEN F) — 화면 데이터 상태 판정 (RED→GREEN) ===');

// ── 서버 시나리오: 주문만 실패 + 상품 성공 ───────────────────────────────────
const goods = Array.from({ length: 13 }, (_, i) =>
  `<goods_data><goodsNo>${1000 + i}</goodsNo><goodsCd>A${i}</goodsCd><goodsNm>P${i}</goodsNm><goodsPrice>${10000 + i * 1000}</goodsPrice><totalStock>${5 + i}</totalStock><stockFl>y</stockFl><soldOutFl>n</soldOutFl><cateCd>C${i % 3}</cateCd></goods_data>`).join('');
const xmlGoods = `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return>${goods}</return></data>`;
const xmlOrdersEmpty = `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return></return></data>`;

const ENV = ['GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const runScenario = async (net, opts) => {
  process.env.GODOMALL_API_MODE = 'real';
  process.env.GODOMALL_PARTNER_KEY = 'k'; process.env.GODOMALL_USER_KEY = 'k';
  globalThis.fetch = async (url) => {
    const isGoods = String(url).includes('Goods_Search');
    if (net === 'orderFail' && !isGoods) throw new Error('order api down (stub)');
    if (net === 'allFail') throw new Error('network down (stub)');
    return { ok: true, status: 200, text: async () => (isGoods ? xmlGoods : xmlOrdersEmpty) };
  };
  try { return await R.resolveOrdersRevenue(opts); } finally { globalThis.fetch = realFetch; }
};

const srvOrderFail = await runScenario('orderFail', { includeSynthetic: true });
const srvAllFail   = await runScenario('allFail',   { includeSynthetic: true });
const srvOk        = await runScenario('ok',        { includeSynthetic: true });
const srvOkNoSynth = await runScenario('ok',        { includeSynthetic: false });
for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
globalThis.fetch = realFetch;

// ── [BASE] 서버 계산 결과 (GREEN A~E 에서 이미 확정 — 여기서는 전제) ─────────
base('B1. 서버: 주문 실패 + 상품 성공 → realOrdersStatus=unavailable · syntheticStatus=success',
  srvOrderFail.realOrdersStatus === 'unavailable' && srvOrderFail.syntheticStatus === 'success',
  `real=${srvOrderFail.realOrdersStatus} · synthetic=${srvOrderFail.syntheticStatus}`);

base('B2. 서버: 그 상태에서 2년치 시뮬레이션과 summary 가 정상 생성된다',
  srvOrderFail.orders.length > 0 && srvOrderFail.summary !== null && (srvOrderFail.summary?.syntheticOrderCount ?? 0) > 0,
  `orders=${srvOrderFail.orders.length}건 · syntheticOrderCount=${srvOrderFail.summary?.syntheticOrderCount}`);

base('B3. 서버 최상위 sourceType 은 실제 주문 slice 기준이라 unavailable (정직하게 유지)',
  srvOrderFail.source === 'unavailable' && !!srvOrderFail.realOrdersErrorMessage,
  `source=${srvOrderFail.source} · realOrdersErrorMessage=있음`);

base('B4. 서버: 상품까지 실패 → 시뮬레이션 불가 · summary null',
  srvAllFail.syntheticStatus === 'unavailable' && srvAllFail.summary === null && srvAllFail.orders.length === 0,
  `synthetic=${srvAllFail.syntheticStatus} · summary=${srvAllFail.summary === null ? 'null' : '있음'}`);

base('B5. 서버: 실제 성공 빈배열 + 시뮬 없음 → 실제 0건 · 유효한 요약',
  srvOkNoSynth.realOrdersStatus === 'success' && srvOkNoSynth.count === 0 && srvOkNoSynth.summary !== null,
  `real=${srvOkNoSynth.realOrdersStatus} count=${srvOkNoSynth.count}`);

// ── [RED] 화면 판정 계약 ─────────────────────────────────────────────────────
console.log('');
const state = (i) => (ST ? ST.resolveRevenueScreenState(i) : null);
const fromServer = (r) => ({
  loaded: true,
  realOrdersStatus: r.realOrdersStatus,
  syntheticStatus: r.syntheticStatus,
  syntheticOrderCount: r.summary?.syntheticOrderCount ?? 0,
  hasSummary: r.summary !== null,
  realOrdersErrorMessage: r.realOrdersErrorMessage,
  syntheticErrorMessage: r.syntheticErrorMessage
});

const sOrderFail = state(fromServer(srvOrderFail));
red('F1. 실제 주문 실패 + 시뮬레이션 성공 → **시험 데이터로 사용 가능**',
  !!sOrderFail && sOrderFail.usable === true && sOrderFail.userLabel === '시험 데이터',
  ST ? `usable=${sOrderFail.usable} label=${sOrderFail.userLabel}` : '판정 함수 없음');

red('F2. 그 경우 "실제 주문 연결 안 됨" 안내가 별도로 제공된다',
  !!sOrderFail && !!sOrderFail.realOrdersNotice,
  ST ? `notice=${sOrderFail.realOrdersNotice ?? '없음'}` : '판정 함수 없음');

const sAllFail = state(fromServer(srvAllFail));
red('F3. 실제 주문 실패 + 시뮬레이션도 불가 → 연결 안 됨(사용 불가)',
  !!sAllFail && sAllFail.usable === false && sAllFail.userLabel === '연결 안 됨',
  ST ? `usable=${sAllFail.usable} label=${sAllFail.userLabel}` : '판정 함수 없음');

const sOk = state(fromServer(srvOk));
red('F4. 실제 주문 성공 + 시뮬레이션 있음 → 시험 데이터',
  !!sOk && sOk.usable === true && sOk.userLabel === '시험 데이터',
  ST ? `usable=${sOk.usable} label=${sOk.userLabel}` : '판정 함수 없음');

const sOkNoSynth = state(fromServer(srvOkNoSynth));
red('F5. 실제 성공 빈배열 + 시뮬레이션 없음 → 실제 데이터 0건(사용 가능)',
  !!sOkNoSynth && sOkNoSynth.usable === true && sOkNoSynth.userLabel === '실제 데이터',
  ST ? `usable=${sOkNoSynth.usable} label=${sOkNoSynth.userLabel}` : '판정 함수 없음');

const sFixture = state({ loaded: true, realOrdersStatus: 'fixture', syntheticStatus: 'not_requested', hasSummary: true });
red('F6. 명시적 mock fixture → 시험 데이터',
  !!sFixture && sFixture.usable === true && sFixture.userLabel === '시험 데이터',
  ST ? `usable=${sFixture.usable} label=${sFixture.userLabel}` : '판정 함수 없음');

const sNone = state(null);
red('F7. 응답 없음/판별 불가 → 연결 안 됨(fail-closed)',
  !!sNone && sNone.usable === false && sNone.userLabel === '연결 안 됨',
  ST ? `usable=${sNone.usable}` : '판정 함수 없음');

// ── 클라이언트 보존 + 소비자 전수 ────────────────────────────────────────────
red('F8. RevenueResult/fetchRevenue 가 slice 상태 4종을 유실 없이 보존한다',
  /realOrdersStatus/.test(svcSource) && /syntheticStatus/.test(svcSource) &&
  /realOrdersErrorMessage/.test(svcSource) && /syntheticErrorMessage/.test(svcSource) &&
  /realOrdersStatus:\s*(data|str|\()/.test(svcSource),
  'departmentDataService 에 slice 상태 보존 없음', 'realOrdersStatus/syntheticStatus/각 사유 보존 확인');

for (const f of CONSUMERS) {
  const src = consumerSources[f];
  red(`F9-${f}. 공통 판정 함수(resolveRevenueScreenState)를 사용한다`,
    /resolveRevenueScreenState/.test(src), '미사용', '공통 판정 함수 사용 확인');
  red(`F10-${f}. source === 'unavailable' 복붙 판정이 남아 있지 않다`,
    !/source\s*===\s*'unavailable'/.test(src),
    "source === 'unavailable' 잔존", '복붙 판정 잔존 0건');
}

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (서버 계산 결과 — fail>0이면 회귀)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (화면 판정 계약)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0 || redUnmet > 0) { console.log(`\n✗ 미충족 — BASE fail ${baseF} · RED unmet ${redUnmet}`); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN F 도달 (실제 주문 연결 실패에도 시험 데이터는 계속 사용 가능)');
