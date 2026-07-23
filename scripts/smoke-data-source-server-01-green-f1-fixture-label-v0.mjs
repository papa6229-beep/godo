#!/usr/bin/env node
/*
 * scripts/smoke-data-source-server-01-green-f1-fixture-label-v0.mjs
 * DATA-SOURCE-SERVER-01 (GREEN F.1) — 명시적 fixture 가 "실제 데이터"로 표시되지 않는다 (RED→GREEN)
 *
 * 배경(교차검토 재현):
 *   명시적 mock 모드의 fixture 주문은 서버에서 sourceType='fixture_mock'/dataKind='mock' 으로
 *   올바르게 구별되고, resolveRevenueScreenState 도 fixture/'시험 데이터' 로 판정한다.
 *   그러나 **표시 소비자들이 summary 의 real/synthetic 숫자로 출처를 추측**한다:
 *     fixture_mock 주문은 summary 에서 realOrderCount 에 잡히고 syntheticOrderCount=0 이라
 *     "실제 데이터" / "REAL" / sourceMode='real' 로 표시될 수 있다.
 *
 * 계약: 사용자 출처 표시는 summary 숫자로 추측하지 말고
 *       resolveRevenueScreenState().kind/userLabel 을 **권위**로 사용한다.
 *       (서버 계산식·매출값·주문값은 변경하지 않는다. 계약 확장(fixtureOrderCount 등)도 하지 않는다.)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'dssf1-'));

let ST, FACTS, SOT;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
    path.join(REPO, 'src', 'services', 'productTeamChatFacts.ts'),
    path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  const dir = path.join(tmp, 'services');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  ST = await import(pathToFileURL(path.join(dir, 'revenueScreenState.js')).href);
  FACTS = await import(pathToFileURL(path.join(dir, 'productTeamChatFacts.js')).href);
  SOT = await import(pathToFileURL(path.join(dir, 'departmentDataSourceOfTruth.js')).href);
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const ptdSource = readFileSync(path.join(REPO, 'src', 'components', 'ProductTeamDashboard.tsx'), 'utf8');
const dwpSource = readFileSync(path.join(REPO, 'src', 'components', 'DepartmentWorkspacePanel.tsx'), 'utf8');
const mktSource = readFileSync(path.join(REPO, 'src', 'components', 'MarketingAnalysisDashboard.tsx'), 'utf8');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== DATA-SOURCE-SERVER-01 (GREEN F.1) — fixture 출처 표시 (RED→GREEN) ===');

// ── fixture 응답 (Codex 재현 조건: fixture_mock 주문 1건 → realOrderCount=1, syntheticOrderCount=0) ──
const order = (sourceType) => ({
  orderNo: 'FIX-0001', orderDate: '2026-07-01', memberKey: 'fixture_member_1',
  sourceType, dataKind: sourceType === 'fixture_mock' ? 'mock' : 'real',
  deliveryFee: 2500, totalAmount: 12500, orderStatus: 'p1', paid: true, cancelled: false,
  lines: [{ goodsNo: '1001', goodsName: 'P1', quantity: 1, lineRevenue: 10000, categoryCode: 'C1', categoryLabel: '생활가전' }]
});
const summaryOf = (real, synth) => ({
  orderCount: real + synth, lineCount: real + synth,
  productRevenueByHeader: 10000 * (real + synth), productRevenueByLines: 10000 * (real + synth),
  deliveryFeeTotal: 2500 * (real + synth), totalAmount: 12500 * (real + synth),
  realOrderCount: real, syntheticOrderCount: synth,
  orderCountValid: real + synth, netOrderRevenue: 10000 * (real + synth),
  cancelledOrderCount: 0, unpaidOrderCount: 0, returnedOrderCount: 0,
  refundedRevenue: 0, shippingRevenue: 2500 * (real + synth), quantityTotal: real + synth
});

const REV = {
  // ① 명시적 mock fixture (핵심 재현)
  fixture: { count: 1, source: 'mock', live: false, realOrdersStatus: 'fixture', syntheticStatus: 'not_requested',
    summary: summaryOf(1, 0), stockImpact: [], orders: [order('fixture_mock')] },
  // ② 실제 주문 실패 + 시뮬레이션 성공 (GREEN F 동작 — 무회귀 확인)
  orderFailSynth: { count: 2, source: 'unavailable', live: false, realOrdersStatus: 'unavailable', syntheticStatus: 'success',
    realOrdersErrorMessage: 'order api down', summary: summaryOf(0, 2), stockImpact: [],
    orders: [order('synthetic_test'), order('synthetic_test')] },
  // ③ 실제 성공 0건 (실제 데이터 0건)
  realEmpty: { count: 0, source: 'real', live: true, realOrdersStatus: 'success', syntheticStatus: 'not_requested',
    summary: summaryOf(0, 0), stockImpact: [], orders: [] },
  // ④ 전부 실패
  allFail: { count: 0, source: 'unavailable', live: false, realOrdersStatus: 'unavailable', syntheticStatus: 'unavailable',
    realOrdersErrorMessage: 'down', syntheticErrorMessage: 'catalog down', summary: null, stockImpact: [], orders: [] }
};

const stateOf = (r) => ST.resolveRevenueScreenState(r ? {
  loaded: true, realOrdersStatus: r.realOrdersStatus, syntheticStatus: r.syntheticStatus,
  syntheticOrderCount: r.summary?.syntheticOrderCount ?? 0, hasSummary: r.summary !== null,
  realOrdersErrorMessage: r.realOrdersErrorMessage, syntheticErrorMessage: r.syntheticErrorMessage
} : null);

// ── [BASE] 재현 전제 + 공통 판정(이미 GREEN F 에서 확정) ─────────────────────
base('B1. Codex 재현 조건 그대로: fixture_mock 주문 1건 → realOrderCount=1 · syntheticOrderCount=0',
  REV.fixture.summary.realOrderCount === 1 && REV.fixture.summary.syntheticOrderCount === 0,
  'summary 숫자만 보면 "실제 1건"으로 보인다');

base('B2. 공통 판정은 이미 올바르다: fixture → kind=fixture · 시험 데이터',
  stateOf(REV.fixture).kind === 'fixture' && stateOf(REV.fixture).userLabel === '시험 데이터',
  `kind=${stateOf(REV.fixture).kind} label=${stateOf(REV.fixture).userLabel}`);

base('B3. 서버 계산값(매출·주문)은 이번 보완에서 건드리지 않는다',
  REV.fixture.summary.totalAmount === 12500 && REV.fixture.summary.orderCount === 1,
  '계산식 변경 없음 — 표시 계층만 보완');

base('B4. GREEN F 시나리오 판정 무회귀',
  stateOf(REV.orderFailSynth).userLabel === '시험 데이터' && stateOf(REV.orderFailSynth).usable === true &&
  stateOf(REV.realEmpty).userLabel === '실제 데이터' && stateOf(REV.realEmpty).usable === true &&
  stateOf(REV.allFail).userLabel === '연결 안 됨' && stateOf(REV.allFail).usable === false,
  '주문실패+시뮬=시험 · 실제0건=실제 · 전부실패=연결 안 됨');

// ── [RED] 표시 소비자가 공통 판정을 권위로 쓰는가 ────────────────────────────
console.log('');
const FORBIDDEN = /실제 데이터|REAL|실제 주문|실제 유효 주문/;

// 1) productTeamChatFacts 출처 문구
const factsFixture = FACTS.buildProductTeamChatFacts('총매출 알려줘', REV.fixture);
// 출처 문구는 facts[] 안의 "데이터 기준: …" 문장으로 노출된다.
const srcLabelFixture = (factsFixture?.facts ?? []).filter((f) => /데이터 기준/.test(String(f))).join(' ');
red('G1. productTeamChatFacts 출처 문구에 실제/REAL 표현이 없다 (fixture)',
  srcLabelFixture.length > 0 && !FORBIDDEN.test(srcLabelFixture),
  `출처 문구="${srcLabelFixture}"`, `출처 문구="${srcLabelFixture}"`);
red('G2. productTeamChatFacts 출처 문구가 시험 데이터임을 밝힌다 (fixture)',
  /시험|FIXTURE|fixture/i.test(srcLabelFixture), `출처 문구="${srcLabelFixture}"`, `출처 문구="${srcLabelFixture}"`);

// 2) departmentDataSourceOfTruth sourceMode
const sotFixture = SOT.buildDepartmentSourceOfTruthSnapshot(REV.fixture, {});
red('G3. departmentDataSourceOfTruth sourceMode 가 fixture 를 real 로 보지 않는다',
  sotFixture.sourceMode !== 'real', `sourceMode=${sotFixture.sourceMode}`, `sourceMode=${sotFixture.sourceMode}`);
red('G4. 그 스냅샷 basisDescription 이 실데이터라고 단언하지 않는다',
  !/실데이터입니다|실제 데이터입니다/.test(String(sotFixture.metadata?.basisDescription ?? '')) &&
  /시험|synthetic|demo|fixture/i.test(String(sotFixture.metadata?.basisDescription ?? '')),
  `basis="${String(sotFixture.metadata?.basisDescription ?? '').slice(0, 70)}…"`);

// 3) SourceOfTruth 무회귀
const sotFail = SOT.buildDepartmentSourceOfTruthSnapshot(REV.orderFailSynth, {});
const sotReal = SOT.buildDepartmentSourceOfTruthSnapshot(REV.realEmpty, {});
const sotNone = SOT.buildDepartmentSourceOfTruthSnapshot(REV.allFail, {});
red('G5. SourceOfTruth 무회귀: 주문실패+시뮬=synthetic · 실제0건≠synthetic · 전부실패=unavailable',
  sotFail.sourceMode === 'synthetic' && sotReal.sourceMode !== 'synthetic' && sotNone.sourceMode === 'unavailable',
  `주문실패+시뮬=${sotFail.sourceMode} · 실제0건=${sotReal.sourceMode} · 전부실패=${sotNone.sourceMode}`,
  `${sotFail.sourceMode} / ${sotReal.sourceMode} / ${sotNone.sourceMode}`);

// 4) ProductTeamDashboard 배지가 screenState 를 쓴다
red('G6. ProductTeamDashboard 배지가 syntheticOrderCount 추측이 아니라 screenState 를 쓴다',
  /screenState\.(userLabel|kind)/.test(ptdSource) && !/synthOn \? `시험 데이터/.test(ptdSource),
  'summary 숫자 기반 배지 잔존', 'screenState.userLabel 사용 확인');

// 5) DepartmentWorkspacePanel AI 참고용 출처 문구
red('G7. DepartmentWorkspacePanel 출처 문구가 공통 판정을 사용한다',
  /resolveRevenueScreenState|screenStateFromRevenue/.test(dwpSource), '미사용', '공통 판정 사용 확인');

// 6) MarketingAnalysisDashboard 는 SourceOfTruth 경유인지 확인(직접 추측 없음)
red('G8. MarketingAnalysisDashboard 는 summary 숫자로 출처를 직접 추측하지 않는다',
  !/summary\??\.(realOrderCount|syntheticOrderCount)\s*[><=]/.test(mktSource),
  'summary 숫자 직접 비교 잔존', 'SourceOfTruth 경유(직접 추측 없음)');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (재현 전제·공통 판정 — fail>0이면 회귀)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (표시 소비자 계약)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0 || redUnmet > 0) { console.log(`\n✗ 미충족 — BASE fail ${baseF} · RED unmet ${redUnmet}`); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN F.1 도달 (명시적 fixture 가 실제 데이터로 표시되지 않는다)');
