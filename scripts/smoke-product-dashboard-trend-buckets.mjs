#!/usr/bin/env node
/*
 * scripts/smoke-product-dashboard-trend-buckets.mjs
 * 매출추이 버킷 생성/라벨 정책 검증 (src/services/productDashboardTrendBuckets.ts).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-tb-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'productDashboardTrendBuckets.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  process.exit(1);
}
const T = await import(pathToFileURL(path.join(tmp, 'productDashboardTrendBuckets.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const order = (date, rev) => ({ orderDate: date, deliveryFee: 2500, totalAmount: rev + 2500, lines: [{ lineRevenue: rev, categoryCode: '003' }] });

console.log('=== Product dashboard trend buckets smoke ===');

// 1. monthly 12개월 range → 12 buckets
const o12 = [];
for (let m = 7; m <= 12; m++) o12.push(order(`2025-${String(m).padStart(2, '0')}-15`, 1000));
for (let m = 1; m <= 6; m++) o12.push(order(`2026-${String(m).padStart(2, '0')}-15`, 1000));
const b1 = T.buildTrendBuckets(o12, { start: '2025-07-01', end: '2026-06-30', granularity: 'month' });
ok('1. monthly 12개월 → 12 buckets', b1.length === 12 && b1[0].key === '2025-07' && b1[11].key === '2026-06');

// 2. monthly 2025-07~2025-12 → 6 buckets
const b2 = T.buildTrendBuckets(o12, { start: '2025-07-01', end: '2025-12-31', granularity: 'month' });
ok('2. monthly 2025-07~12 → 6 buckets(07~12)', b2.length === 6 && b2[0].key === '2025-07' && b2[5].key === '2025-12' && b2.map((x) => x.label).join(',') === '7월,8월,9월,10월,11월,12월');

// 3. weekly 2025-07-02~2025-07-31 → 기간 내 주간 buckets(7일 윈도우 5개)
const ow = ['2025-07-03', '2025-07-10', '2025-07-20', '2025-07-31'].map((d) => order(d, 500));
const b3 = T.buildTrendBuckets(ow, { start: '2025-07-02', end: '2025-07-31', granularity: 'week' });
ok('3. weekly → 7일 윈도우 5 buckets', b3.length === 5 && b3[0].key === '2025-07-02' && b3[0].label === '7/2~7/8' && b3[4].label === '7/30~7/31');

// 4. daily 2025-07-02~2025-07-31 → 30 buckets
const b4 = T.buildTrendBuckets([order('2025-07-15', 700)], { start: '2025-07-02', end: '2025-07-31', granularity: 'day' });
ok('4. daily 07-02~07-31 → 30 buckets', b4.length === 30 && b4[0].key === '2025-07-02' && b4[29].key === '2025-07-31');

// 5. bucket date가 start/end 밖으로 안 나감 + 기간 밖 주문 제외
const mixed = [order('2025-06-15', 999), order('2025-07-15', 100), order('2025-08-15', 200)]; // 06은 범위 밖
const b5 = T.buildTrendBuckets(mixed, { start: '2025-07-01', end: '2025-08-31', granularity: 'month' });
const inRange = b5.every((x) => x.key >= '2025-07' && x.key <= '2025-08');
const totalRev = b5.reduce((s, x) => s + x.revenue, 0);
ok('5. 기간 밖 데이터 제외 + 버킷 범위 내', b5.length === 2 && inRange && totalRev === 300);

// 6. line/bar 같은 bucket count (단일 배열 → 막대=line=length). 주문수 합 = 범위내 주문수
const sumOrders = b5.reduce((s, x) => s + x.orders, 0);
ok('6. 막대/꺾은선 동일 bucket + 주문수 합=범위내(2)', b5.length === b5.length && sumOrders === 2);

// 7. period filter가 적용됨(범위 밖 06월 데이터 999가 어떤 버킷에도 안 들어감) → donut도 동일 ordersFiltered 사용
ok('7. period filter 적용(범위 밖 999 미반영)', !b5.some((x) => x.revenue === 999) && totalRev === 300);

// 라벨 정책
ok('labelStepFor month 12→1, 24→2', T.labelStepFor('month', 12) === 1 && T.labelStepFor('month', 24) === 2);
ok('labelStepFor week 5→1, day 30→2', T.labelStepFor('week', 5) === 1 && T.labelStepFor('day', 30) === 2);

// 빈 응답/역순 가드
ok('빈 범위 → []', T.buildTrendBuckets([], { start: '', end: '', granularity: 'month' }).length === 0 && T.buildTrendBuckets([], { start: '2025-08-01', end: '2025-07-01', granularity: 'month' }).length === 0);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
