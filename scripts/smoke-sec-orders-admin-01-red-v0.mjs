#!/usr/bin/env node
/*
 * scripts/smoke-sec-orders-admin-01-red-v0.mjs
 * SEC-ORDERS-ADMIN-01 — 무인증 주문 PII 경로 (RED → GREEN 전환·해소 확인)
 *
 * ⚠️ 이 파일은 SEC-ORDERS-ADMIN-01 RED 진단이었다(원본 RED 증거 = 커밋 6d54b68). GREEN 에서
 *    실제 HTTP 경계(/api/godomall/orders-admin handler)가 fail-closed 됐음을 **fake req/res 로 실호출**
 *    검증한다. RED 는 resolver 의 원본 PII 를 직접 관찰했으나, 정책상 resolver/mapper 는 미변경이므로
 *    검사를 "라우트 경계 fail-closed" GREEN 계약으로 전환한다.
 *
 * 제품 변경 = api/godomall/orders-admin.ts 1개(핸들러 fail-closed). resolveOrdersAdmin/mapOrdersToAdmin/
 * fetchAdminOrders/orders 마스킹/매출·동기화 경로 미변경.
 * [FACT] = 관찰 · [GREEN] = 종료조건(이제 충족).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'sec-oa-g-'));
let fact = 0, factf = 0, green = 0, greenx = 0;
const F = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [FACT ] ${n}${d ? `  — ${d}` : ''}`); ok ? fact++ : factf++; };
const G = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'FAIL'} [GREEN] ${n}${d ? `  — ${d}` : ''}`); ok ? green++ : greenx++; };
console.log('=== SEC-ORDERS-ADMIN-01 — 주문 PII 라우트 fail-closed (GREEN) ===');

// ── 컴파일: handler + godomallResource(무회귀 대조) ────────────────────────────
let handler, R;
try {
  execFileSync(process.execPath,
    [tscBin, path.join(REPO, 'api', 'godomall', 'orders-admin.ts'), path.join(REPO, 'api', '_shared', 'godomallResource.ts'),
     '--ignoreConfig', '--rootDir', path.join(REPO, 'api'), '--outDir', tmp,
     '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'],
    { stdio: 'pipe' });
  for (const sub of ['godomall', '_shared']) {
    const dir = path.join(tmp, sub);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const p = path.join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
  }
  handler = (await import(pathToFileURL(path.join(tmp, 'godomall', 'orders-admin.js')).href)).default;
  R = await import(pathToFileURL(path.join(tmp, '_shared', 'godomallResource.js')).href);
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true }); process.exit(1);
}

// ── fake req/res 로 실제 handler 호출 ──────────────────────────────────────────
const makeRes = () => { const o = { _s: 200, _b: null }; return { status(c) { o._s = c; return this; }, json(b) { o._b = b; }, _get: () => ({ status: o._s, body: o._b }) }; };
const call = async (method) => { const res = makeRes(); await handler({ method }, res); return res._get(); };
const getR = await call('GET');
const postR = await call('POST');

// PII 구조 스캔(특정 값 아님) — 응답 전체 문자열화
const bodyStr = (b) => JSON.stringify(b || {});
const PII_KEYS = ['records', 'count', 'customerName', 'receiverName', 'ordererName', 'phone', 'customerPhone', 'orderCellPhone', 'address', 'orderAddress', 'receiverAddress', 'customerEmail'];
const phoneRe = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;
const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const bodyHasPiiKey = (b) => b && typeof b === 'object' && PII_KEYS.some((k) => k in b);
const bodyHasPiiValue = (b) => phoneRe.test(bodyStr(b)) || emailRe.test(bodyStr(b));

const handlerSrc = readFileSync(path.join(REPO, 'api', 'godomall', 'orders-admin.ts'), 'utf8');

console.log('');
console.log('  --- [GREEN] HTTP 경계 fail-closed (실 handler 호출) ---');
G('G1. GET → HTTP 403', getR.status === 403, `status=${getR.status}`);
G('G2. errorCode = ADMIN_ACCESS_DISABLED', getR.body && getR.body.errorCode === 'ADMIN_ACCESS_DISABLED', `code=${getR.body?.errorCode}`);
G('G3. 응답에 records/count 없음', !('records' in (getR.body || {})) && !('count' in (getR.body || {})), `keys=${Object.keys(getR.body || {}).join(',')}`);
G('G4. 응답에 PII 필드·PII 값 0(이름·전화·주소·이메일)', !bodyHasPiiKey(getR.body) && !bodyHasPiiValue(getR.body), `piiKey=${bodyHasPiiKey(getR.body)} piiVal=${bodyHasPiiValue(getR.body)}`);
G('G5. 정적·안전 메시지만(하부 err.message·동적 문자열 삽입 없음)', typeof getR.body?.errorMessage === 'string' && getR.body.errorMessage.length > 0 && !/\$\{|Error|stack|at /.test(getR.body.errorMessage), `msg="${getR.body?.errorMessage}"`);
G('G6. handler 가 resolveOrdersAdmin 을 import·호출하지 않음', !/resolveOrdersAdmin/.test(handlerSrc), 'resolveOrdersAdmin 참조 0');
G('G7. POST(비GET) → HTTP 405 METHOD_NOT_ALLOWED', postR.status === 405 && postR.body?.errorCode === 'METHOD_NOT_ALLOWED', `status=${postR.status} code=${postR.body?.errorCode}`);

console.log('');
console.log('  --- [FACT] 무회귀: 데이터 계층·orders 마스킹 미변경 ---');
const ENV = ['GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
process.env.GODOMALL_API_MODE = 'mock'; process.env.GODOMALL_PARTNER_KEY = 'stub'; process.env.GODOMALL_USER_KEY = 'stub';
const ordersRes = await R.resolveResource('orders');
const adminResolver = await R.resolveOrdersAdmin();
for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
const oRecs = ordersRes.records || [];
const unmaskedPhone = (recs) => recs.filter((r) => Object.values(r).some((v) => typeof v === 'string' && phoneRe.test(v) && !/\*{2,}/.test(v))).length;
F('F1. resolveResource("orders") 마스킹 무회귀 — 원문 전화 0건', unmaskedPhone(oRecs) === 0, `orders 원문전화=${unmaskedPhone(oRecs)}/${oRecs.length}`);
F('F2. 데이터 계층 미변경 — resolveOrdersAdmin resolver 는 그대로 존재(경계만 폐쇄)', (adminResolver.records || []).length > 0, `resolver records=${(adminResolver.records || []).length} (라우트가 아닌 resolver 는 정책상 미변경)`);

console.log('');
console.log(`[FACT ] ${fact} pass / ${factf} fail   [GREEN] ${green} met / ${greenx} fail`);
rmSync(tmp, { recursive: true, force: true });
if (factf > 0 || greenx > 0) { console.log('\n✗ SEC-ORDERS-ADMIN-01 GREEN 미충족'); process.exit(1); }
console.log('\n✓ SEC-ORDERS-ADMIN-01 GREEN — 무인증 주문 PII 라우트 fail-closed(403 정적)·데이터 계층 무회귀.');
