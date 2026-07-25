#!/usr/bin/env node
/*
 * scripts/smoke-sec-orders-admin-01-red-v0.mjs
 * SEC-ORDERS-ADMIN-01 — 무인증 주문 PII 경로 (RED 진단)
 *
 * 제품 소스 수정 없음. 실제 서버 함수(resolveOrdersAdmin / resolveResource)를 tsc 컴파일→호출.
 * 확정 정책: 서버 인증·권한 기반이 없으므로 원본 주문자 PII 를 반환하는 관리자 API 를 열어두지 않는다.
 *
 * 재현 대상 결함:
 *   /api/godomall/orders-admin → resolveOrdersAdmin → mapOrdersToAdmin 이 마스킹 없이 원본
 *   이름·전화·주소를 records 로 반환한다(대조: /api/godomall/orders = resolveResource 는 마스킹).
 *   현재 무인증 GET 이며 런타임 소비자는 0.
 *
 * PII 검사는 특정 이름 하나가 아니라 **PII 필드 구조·마스킹 의미**로 판정한다.
 * [FACT] = 현재 실제 동작(관찰) · [RED] = GREEN 종료조건(현재 미충족). GREEN 미구현이라 exit 1.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'sec-oa-'));
let fact = 0, factf = 0, red = 0, redx = 0;
const F = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [FACT] ${n}${d ? `  — ${d}` : ''}`); ok ? fact++ : factf++; };
const R_ = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${d ? `  — ${d}` : ''}`); ok ? red++ : redx++; };
console.log('=== SEC-ORDERS-ADMIN-01 — 무인증 주문 PII 경로 (RED 진단) ===');

let R;
try {
  execFileSync(process.execPath,
    [tscBin, path.join(REPO, 'api', '_shared', 'godomallResource.ts'), '--ignoreConfig',
     '--rootDir', path.join(REPO, 'api'), '--outDir', tmp,
     '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'],
    { stdio: 'pipe' });
  const dir = path.join(tmp, '_shared');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  R = await import(pathToFileURL(path.join(tmp, '_shared', 'godomallResource.js')).href);
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true }); process.exit(1);
}

// ── env: 명시적 mock 모드(실 API·실 PII 없이 fixture 로 구조 재현) ──────────────
const ENV = ['GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
process.env.GODOMALL_API_MODE = 'mock';
process.env.GODOMALL_PARTNER_KEY = 'stub'; process.env.GODOMALL_USER_KEY = 'stub';
const adminRes = await R.resolveOrdersAdmin();
const ordersRes = await R.resolveResource('orders');
for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }

// ── PII 구조 판정(특정 값 아님) ────────────────────────────────────────────────
const NAME_KEYS = ['customerName', 'receiverName', 'ordererName'];
const PHONE_KEYS = ['phone', 'customerPhone', 'orderPhone', 'orderCellPhone', 'receiverPhone'];
const ADDR_KEYS = ['address', 'orderAddress', 'receiverAddress'];
const rawPhoneRe = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;      // 완전한 전화(가운데 자릿수 존재)
const maskedPhoneRe = /01[016789][-.\s]?\*{2,}[-.\s]?\d{4}/;    // 010-****-5678
const hasUnmaskedName = (rec) => NAME_KEYS.some((k) => typeof rec[k] === 'string' && rec[k].trim().length >= 2 && !rec[k].includes('*'));
const hasUnmaskedPhone = (rec) => PHONE_KEYS.some((k) => typeof rec[k] === 'string' && rawPhoneRe.test(rec[k]) && !maskedPhoneRe.test(rec[k]));
const hasDetailedAddr = (rec) => ADDR_KEYS.some((k) => typeof rec[k] === 'string' && rec[k].trim().split(/\s+/).length >= 3 && !rec[k].includes('*')); // 시 구 + 상세
const hasMaskMarker = (rec) => Object.keys(rec).some((k) => /Masked$/.test(k)) || Object.values(rec).some((v) => typeof v === 'string' && /\*{2,}/.test(v));
const scan = (recs, pred) => recs.filter(pred).length;

const aRecs = adminRes.records || [];
const oRecs = ordersRes.records || [];

console.log('');
console.log('  --- [FACT] 현재 orders-admin PII 노출(관찰) ---');
F('F1. resolveOrdersAdmin(mock) → 레코드 반환 · sourceType=' + adminRes.source, aRecs.length > 0, `records=${aRecs.length} count=${adminRes.count}`);
F('F2. 원본 이름 노출(마스킹 없음) — customerName/receiverName 원문', scan(aRecs, hasUnmaskedName) > 0, `원문 이름 레코드=${scan(aRecs, hasUnmaskedName)}/${aRecs.length}`);
F('F3. 원본 전화 노출(010-****-**** 아님, 가운데 자릿수 그대로)', scan(aRecs, hasUnmaskedPhone) > 0, `원문 전화 레코드=${scan(aRecs, hasUnmaskedPhone)}`);
F('F4. 원본 주소 노출(시·구 이하 상세까지)', scan(aRecs, hasDetailedAddr) > 0, `상세 주소 레코드=${scan(aRecs, hasDetailedAddr)}`);
F('F5. 마스킹 마커 부재(*Masked 필드·**** 없음)', scan(aRecs, hasMaskMarker) === 0, `마스킹 흔적 레코드=${scan(aRecs, hasMaskMarker)}`);

console.log('');
console.log('  --- [FACT] 대조: /api/godomall/orders(resolveResource)는 마스킹 ---');
F('F6. 동일 성격 자료를 orders 경로는 마스킹/제거 — 원문 전화 0건', scan(oRecs, hasUnmaskedPhone) === 0, `orders 원문전화=${scan(oRecs, hasUnmaskedPhone)}/${oRecs.length}`);
F('F7. orders 경로 원문 이름 0건(마스킹/삭제)', scan(oRecs, hasUnmaskedName) === 0, `orders 원문이름=${scan(oRecs, hasUnmaskedName)}`);

console.log('');
console.log('  --- [FACT] 경로·인증·소비자·오류(소스 관찰) ---');
const handlerSrc = readFileSync(path.join(REPO, 'api', 'godomall', 'orders-admin.ts'), 'utf8');
const noAuthGate = !/authorization|bearer|getSession|verifyToken|requireAuth|x-api-key|cookie/i.test(handlerSrc);
F('F8. orders-admin 핸들러에 인증 게이트 없음(무인증 GET)', noAuthGate && /req\.method !== 'GET'/.test(handlerSrc), 'GET only · auth 게이트 0');
F('F9. resolveOrdersAdmin() 은 인증 인자를 받지 않음(구조적 무인증)', R.resolveOrdersAdmin.length === 0, `arity=${R.resolveOrdersAdmin.length}`);
F('F10. 오류 응답이 하부 err.message 를 그대로 노출', /\$\{errMsg\}/.test(handlerSrc), 'catch: `...: ${errMsg}`');
// 런타임 소비자 census: fetchAdminOrders 호출부(정의 제외)
const walk = (d, acc = []) => { for (const e of readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) walk(r, acc); else if (/\.tsx?$/.test(e.name)) acc.push(r); } return acc; };
const srcFiles = walk('src');
let callers = [];
for (const f of srcFiles) { const s = readFileSync(path.join(REPO, f), 'utf8'); if (/fetchAdminOrders\s*\(/.test(s) && !/export const fetchAdminOrders/.test(s.split('\n').find((l) => /fetchAdminOrders\s*\(/.test(l)) || '')) callers.push(f); }
// 정의 파일 자체 제외하고 호출부만
callers = callers.filter((f) => !/departmentDataService\.ts$/.test(f) || /fetchAdminOrders\(/.test(readFileSync(path.join(REPO, f), 'utf8').replace(/export const fetchAdminOrders[^\n]*/g, '')));
const realCallers = srcFiles.filter((f) => { const s = readFileSync(path.join(REPO, f), 'utf8').replace(/export const fetchAdminOrders[\s\S]*?=>/, ''); return /\bfetchAdminOrders\s*\(/.test(s); });
F('F11. fetchAdminOrders 런타임 소비자 0(정의만 존재, 화면/계산/동기화 미배선)', realCallers.length === 0, `호출부=${realCallers.length}건`);

console.log('');
console.log('  --- [RED] GREEN 종료조건 (현재 미충족) ---');
R_('R1. 무인증 요청으로 원본 PII 를 한 필드도 받을 수 없어야 한다', scan(aRecs, (r) => hasUnmaskedName(r) || hasUnmaskedPhone(r) || hasDetailedAddr(r)) === 0, `현재 원본 PII 레코드=${scan(aRecs, (r) => hasUnmaskedName(r) || hasUnmaskedPhone(r) || hasDetailedAddr(r))}`);
R_('R2. orders-admin 은 안전 오류/비활성으로 fail-closed (records 미반환)', aRecs.length === 0, `현재 records=${aRecs.length}`);
R_('R3. mock fixture PII 도 공개하지 않는다', scan(aRecs, hasUnmaskedPhone) === 0, `현재 mock 원문전화=${scan(aRecs, hasUnmaskedPhone)}`);

console.log('');
console.log(`[FACT] ${fact} pass / ${factf} fail   [RED ] ${red} met / ${redx} unmet`);
rmSync(tmp, { recursive: true, force: true });
if (factf > 0) { console.log('\n✗ 관찰 불일치(진단 재작성 필요)'); process.exit(1); }
if (redx > 0) { console.log(`\n✗ RED — 무인증 PII 경로 ${redx}건 미충족(GREEN 대기).`); process.exit(1); }
console.log('\n✓ (예상외) 전 종료조건 충족');
