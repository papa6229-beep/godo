#!/usr/bin/env node
/*
 * scripts/smoke-data-source-provenance-v0.mjs
 * 데이터 출처(provenance) 신분증 계약 — RED→GREEN.
 *
 * 문제(재현): 시스템이 자료의 신분을 잘못 붙인다.
 *   - mode:real 이면 실제라고 부름 (그러나 sourceType=api_mock_fallback이면 실제 아님)
 *   - 실제 API 0건과 "연결 안 됨"을 구분 못 함 → 0건을 가상으로 대체
 *   - 실제 상품 + 가상 운영자료 결합 결과를 전체 REAL로 표시
 *   - 문의3·리뷰3 mock fixture를 실제 문의로 집계
 *
 * 계약(사장 확정):
 *   내부 출처 4상태: actual / simulation / fixture / unavailable
 *   사용자 표시 3종:  '실제 데이터' / '시험 데이터' / '연결 안 됨'   (내부 기술문구 노출 금지)
 *
 *   A. mode:real 이어도 sourceType=api_mock_fallback 이면 실제(actual) 아님.
 *   B. sourceType=api_proxy_real 이고 records=[] 이면 실제 데이터 0건(actual, count 0). 시험자료 대체 금지.
 *   C. API 오류·미구현(errorMessage 有 / live=false 실패)은 0건과 구분해 unavailable(연결 안 됨).
 *   D. 실제 상품 마스터 + 가상 주문/매출/재고 결합 분석은 전체적으로 시험 데이터(simulation).
 *   E. 모든 입력이 실제 API일 때만 실제 데이터 분석(actual)으로 표시.
 *   F. fixture는 일반 사용자 통계에 자동 유입되지 않는다(별도 상태).
 *   G. 화면 전체 상태 ≠ 각 리소스 상태. 일부만 실제라고 전체 REAL 금지.
 *   H. 실제/시험 전환이 매출·주문·재고 계산값 자체를 바꾸지 않는다(라벨만 바뀜).
 *   I. 사용자 화면에 api_proxy_real/api_mock_fallback/REAL+SYNTHETIC 등 내부 문구 노출 금지.
 *   J. 판별 기준은 mode/버튼이름이 아니라 반환된 sourceType + 리소스 구성.
 *
 * 이 스모크는 아직 없는 공통 계약 src/services/dataSourceProvenanceContract.ts 를 요구한다.
 * GREEN에서 그 계약이 A~J를 만족하면 전부 MET.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'dsp-'));
const CONTRACT = path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts');
const hasContract = existsSync(CONTRACT);

let P = null;
if (hasContract) {
  try {
    execFileSync(process.execPath, [tscBin, CONTRACT,
      '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
      '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
    for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
      const p = path.join(tmp, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
    P = await import(pathToFileURL(path.join(tmp, 'dataSourceProvenanceContract.js')).href);
  } catch (e) {
    console.error('[smoke] 계약 컴파일 실패:\n', e.stdout?.toString() || e.message);
    P = null;
  }
}

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}`); c ? baseP++ : baseF++; };
const red = (n, c, cur) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? '' : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== 데이터 출처 신분증 계약 (RED→GREEN) ===');

// ── 리소스 응답 fixture(실제 resolveResource 반환 형태 재현) ──
const R = (source, mode, live, count, extra = {}) => ({
  source, mode, live, count, records: Array.from({ length: count }, (_, i) => ({ i })), ...extra
});
// 실제 관측값 기반:
const realProducts = R('api_proxy_real', 'real', true, 13);          // 실제 상품 13
const realOrders0 = R('api_proxy_real', 'real', true, 0);            // 실제 주문 0(빈 배열, 성공)
const realOrders1 = R('api_proxy_real', 'real', true, 1);            // 실제 수기주문 1
const realSales0 = R('api_proxy_real', 'real', true, 0);            // 실제 유효판매 0
const mockInquiries3 = R('api_mock_fallback', 'real', false, 3, { errorMessage: 'Live fetch for [inquiries] is not configured yet (requires Board_List.php mapping).' });
const failResource = R('api_mock_fallback', 'real', false, 0, { errorMessage: 'PROXY_FETCH_ERROR: upstream 500' });

// ── [BASE] 현재 상태로 재현되는 사실(함정 조건) — 계약 없이도 참 ──
// mode:real 이지만 sourceType=api_mock_fallback 인 리소스가 실재한다(문의/리뷰). = 오판의 씨앗.
base('B1. 함정 재현: mode:real + sourceType=api_mock_fallback 조합 실재(문의 mock)',
  mockInquiries3.mode === 'real' && mockInquiries3.source === 'api_mock_fallback');
// 실제 API 0건(성공 빈배열)과 오류(errorMessage)가 원시 필드로는 구분 가능하나, 통합 판정기가 없다.
base('B2. 실제0건(api_proxy_real,count0,errorMessage없음) vs 오류(errorMessage有)는 원시 구분 가능',
  realOrders0.source === 'api_proxy_real' && realOrders0.count === 0 && !realOrders0.errorMessage &&
  !!failResource.errorMessage);
// 현재 공통 출처 판정 계약이 없다(모듈 부재) → A~J를 강제하는 단일 지점 없음.
base('B3. 현재 공통 출처 판정 계약 부재(dataSourceProvenanceContract 없음)', !hasContract || !P);

// ── [RED] 공통 계약 존재 + 판정 API 형태 ──
red('R1. dataSourceProvenanceContract 존재(classifyResource/classifyScreen/userLabel)',
  !!P && typeof P.classifyResource === 'function' && typeof P.classifyScreen === 'function' && typeof P.userLabelOf === 'function',
  P ? 'export 일부 없음' : '모듈 없음');

if (P && typeof P.classifyResource === 'function') {
  const kind = (r) => P.classifyResource(r).kind;
  const label = (r) => P.userLabelOf(P.classifyResource(r).kind);

  // A. mode:real + api_mock_fallback → 실제 아님(fixture 또는 unavailable, actual 금지)
  red('A. mode:real이어도 sourceType=api_mock_fallback이면 actual 아님',
    kind(mockInquiries3) !== 'actual', kind(mockInquiries3));
  // B. api_proxy_real + records=[] → actual, count 0 (시험 대체 금지)
  red('B. api_proxy_real + 빈배열 → actual(실제 데이터 0건)',
    kind(realOrders0) === 'actual' && P.classifyResource(realOrders0).count === 0, `${kind(realOrders0)}/${P.classifyResource(realOrders0).count}`);
  // C. API 오류/미구현 → unavailable(연결 안 됨), 0건과 구분
  red('C. 오류/미구현(errorMessage) → unavailable(연결 안 됨), 실제0건과 구분',
    kind(failResource) === 'unavailable' && kind(realOrders0) === 'actual' && kind(failResource) !== kind(realOrders0),
    `fail=${kind(failResource)} vs real0=${kind(realOrders0)}`);
  // (F) mock fixture는 fixture로 분류(일반 통계 자동유입 금지 신분)
  red('F. mock fixture(문의3, api_mock_fallback)는 fixture로 분류',
    kind(mockInquiries3) === 'fixture', kind(mockInquiries3));
  // I. userLabel은 3종만, 내부 기술문구 미포함
  const labels = ['actual', 'simulation', 'fixture', 'unavailable'].map((k) => P.userLabelOf(k));
  const allowed = new Set(['실제 데이터', '시험 데이터', '연결 안 됨']);
  const techLeak = labels.some((l) => /api_proxy_real|api_mock_fallback|REAL|SYNTHETIC|sourceType|mode:/i.test(l));
  red('I. 사용자 라벨은 실제/시험/연결안됨 3종만·내부 기술문구 미노출',
    labels.every((l) => allowed.has(l)) && !techLeak, JSON.stringify(labels));
}

if (P && typeof P.classifyScreen === 'function') {
  const screenKind = (arr) => P.classifyScreen(arr).kind;
  // D+E+G. 화면 전체 판정: 실제상품 + 가상운영 결합 → simulation(전체 시험). 모두 실제여야 actual.
  const realProductPlusSimOps = [realProducts, R('synthetic', 'mock', false, 500)]; // synthetic 운영자료
  red('D/E. 실제상품 + 가상운영 결합 화면 → simulation(전체 시험 데이터)',
    screenKind(realProductPlusSimOps) === 'simulation', screenKind(realProductPlusSimOps));
  red('E. 모든 리소스 actual일 때만 화면 actual(실제 데이터)',
    screenKind([realProducts, realOrders1, realSales0]) === 'actual', screenKind([realProducts, realOrders1, realSales0]));
  // G. 일부만 실제(상품 actual + 문의 fixture) → 전체 actual 금지
  red('G. 일부만 실제(상품 actual + 문의 fixture)면 전체 actual 금지',
    screenKind([realProducts, mockInquiries3]) !== 'actual', screenKind([realProducts, mockInquiries3]));
  // C(화면). 하나라도 unavailable 있으면 화면은 연결 문제 신호(actual 아님)
  red('C-화면. 리소스 하나라도 unavailable이면 화면 actual 아님',
    screenKind([realProducts, failResource]) !== 'actual', screenKind([realProducts, failResource]));
}

// ── [RED] H: 라벨/판정이 계산값을 바꾸지 않는다(판정은 순수·부작용 없음) ──
if (P && typeof P.classifyResource === 'function') {
  const before = JSON.parse(JSON.stringify(realOrders1));
  P.classifyResource(realOrders1);
  red('H. 판정은 순수 — 입력 리소스(records/count) 불변(계산값 미변경)',
    JSON.stringify(realOrders1) === JSON.stringify(before), '변경됨');
} else {
  red('H. 판정 순수성(계산값 미변경)', false, '모듈 없음');
}

console.log(`\n--- 요약 ---`);
console.log(`[BASE] ${baseP} pass / ${baseF} fail`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 계약 목표값 정합 실패 — 치명'); process.exit(2); }
if (redUnmet > 0) { console.log('\n● RED 상태 — GREEN에서 dataSourceProvenanceContract로 A~J 전부 MET.'); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN 도달'); process.exit(0);
