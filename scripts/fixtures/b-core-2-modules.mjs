/*
 * scripts/fixtures/b-core-2-modules.mjs
 * B-core-2 parity 하네스가 **제품 코드 자체**를 실행하기 위한 로더.
 *
 * 문자열 존재 검사로 배선을 증명하지 않는다(헌법 §10). 실제 생산 함수와
 * 실제 계약 함수를 tsc 로 컴파일해 import 하고, 결과값을 비교한다.
 * (기존 선례: scripts/smoke-cross-team-revenue-metric-parity-v0.mjs)
 *
 * 이 파일은 `smoke-*.mjs` 가 아니므로 회귀 러너가 검사로 실행하지 않는다(의도).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');

const compile = (entries, outDir, opts) =>
  execFileSync(
    process.execPath,
    [TSC, ...entries, '--outDir', outDir, '--module', opts.module, '--moduleResolution', opts.moduleResolution,
      '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'pipe', cwd: os.tmpdir() }
  );

// src/ 는 번들러 해상도(확장자 없는 상대 import)라 Node ESM 이 그대로 못 읽는다 → .js 보강.
const patchRelativeExtensions = (dir) => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
};

/**
 * 제품 모듈을 컴파일해 로드한다.
 * @returns {Promise<{mods: object, dispose: () => void}>}
 */
export async function loadProductModules() {
  const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-bcore2-api-'));
  const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-bcore2-src-'));
  const dispose = () => {
    rmSync(tmpApi, { recursive: true, force: true });
    rmSync(tmpSrc, { recursive: true, force: true });
  };
  try {
    // api/ 쪽: nodenext (소스가 '.js' 확장자 import 를 이미 사용)
    compile(
      [
        path.join(REPO, 'api', '_shared', 'godomallMapper.ts'),
        path.join(REPO, 'api', '_shared', 'godomallRevenue.ts'),
        path.join(REPO, 'api', '_shared', 'godomallInventoryDerive.ts'),
        path.join(REPO, 'api', '_shared', 'godomallOrderNormalize.ts')
      ],
      tmpApi,
      { module: 'nodenext', moduleResolution: 'nodenext' }
    );
    // src/ 쪽: bundler 해상도로 컴파일 후 상대 import 에 .js 보강
    compile(
      [
        path.join(REPO, 'src', 'utils', 'dataNormalizer.ts'),
        path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
        path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
        path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts')
      ],
      tmpSrc,
      { module: 'esnext', moduleResolution: 'bundler' }
    );
    for (const sub of ['', 'utils', 'services']) {
      const d = path.join(tmpSrc, sub);
      try { patchRelativeExtensions(d); } catch { /* 해당 하위 폴더 없음 */ }
    }

    const imp = (dir, rel) => import(pathToFileURL(path.join(dir, rel)).href);
    const flat = (dir, rel, nested) => imp(dir, rel).catch(() => imp(dir, nested));

    const mods = {
      mapper: await imp(tmpApi, '_shared/godomallMapper.js').catch(() => imp(tmpApi, 'godomallMapper.js')),
      revenue: await imp(tmpApi, '_shared/godomallRevenue.js').catch(() => imp(tmpApi, 'godomallRevenue.js')),
      inventoryDerive: await imp(tmpApi, '_shared/godomallInventoryDerive.js').catch(() => imp(tmpApi, 'godomallInventoryDerive.js')),
      orderNormalize: await imp(tmpApi, '_shared/godomallOrderNormalize.js').catch(() => imp(tmpApi, 'godomallOrderNormalize.js')),
      dataNormalizer: await flat(tmpSrc, 'utils/dataNormalizer.js', 'dataNormalizer.js'),
      revenueMetric: await flat(tmpSrc, 'services/revenueMetricContract.js', 'revenueMetricContract.js'),
      inventoryRisk: await flat(tmpSrc, 'services/inventoryRiskContract.js', 'inventoryRiskContract.js'),
      provenance: await flat(tmpSrc, 'services/dataSourceProvenanceContract.js', 'dataSourceProvenanceContract.js')
    };
    return { mods, dispose };
  } catch (e) {
    dispose();
    throw new Error(`제품 모듈 컴파일/로드 실패: ${e.stdout?.toString() || e.message}`);
  }
}

/** 빈 OperationsDataSnapshot — A 투영의 기준점. */
export const emptySnapshot = () => ({
  id: 'b-core-2-fixture',
  sourceType: 'api_proxy_real',
  importedAt: '2026-07-27T00:00:00.000Z',
  orders: [], inquiries: [], reviews: [], inventory: [], sales: []
});

/**
 * 공통 fixture 원본 → **A 세계 투영**.
 * 실제 경로와 동일: resolveResource(orders/inventory) → rawItems → buildOperationsSnapshot.
 */
export const projectA = (mods, rawOrders, rawGoods) => {
  const orderItems = mods.mapper.mapOrderList(rawOrders);
  const products = mods.mapper.mapGoodsToProducts(rawGoods);
  const inventoryItems = mods.inventoryDerive.deriveInventoryFromProducts(products);
  let snap = mods.dataNormalizer.buildOperationsSnapshot('orders', orderItems, emptySnapshot());
  snap = mods.dataNormalizer.buildOperationsSnapshot('inventory', inventoryItems, snap);
  return snap;
};

/**
 * 공통 fixture 원본 → **B 세계 투영**.
 * 실제 경로와 동일: resolveOrdersRevenue → mapOrdersToRevenue(+buildProductIndex).
 * 클라이언트 평탄화(RevenueOrderLite)까지 포함해 두 형태를 모두 돌려준다.
 */
export const projectB = (mods, rawOrders, rawGoods, sourceTag = 'real_godomall') => {
  const products = mods.mapper.mapGoodsToProducts(rawGoods);
  const index = mods.revenue.buildProductIndex(products);
  const orders = mods.revenue.mapOrdersToRevenue(rawOrders, index, sourceTag);
  // departmentDataService.fetchRevenue 가 하는 평탄화와 동일한 필드 선택.
  const lite = orders.map((o) => ({
    orderNo: o.orderNo,
    orderDate: o.orderDate,
    sourceType: o.sourceType,
    deliveryFee: o.deliveryFee,
    totalAmount: o.totalAmount,
    productRevenueByLines: o.productRevenueByLines,
    paid: o.state.paid,
    unpaid: o.state.unpaid,
    confirmed: o.state.confirmed,
    canceled: o.state.canceled,
    shipped: o.state.shipped,
    delivered: o.state.delivered,
    lines: o.lines.map((l) => ({
      goodsNo: l.goodsNo, goodsName: l.goodsName, quantity: l.quantity, lineRevenue: l.lineRevenue,
      categoryCode: l.categoryCode || 'uncategorized', categoryLabel: l.categoryLabel || l.categoryCode || 'uncategorized'
    }))
  }));
  return { orders, lite, summary: mods.revenue.summarizeRevenue(orders), products };
};
