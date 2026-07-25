#!/usr/bin/env node
/*
 * scripts/smoke-auth-foundation-01-red-v0.mjs
 * R-AUTH-FOUNDATION-01 — 서버 행위자·권한 경계 부재 (RED 진단)
 *
 * 제품 소스 수정 없음·인증 구현 없음. 실제 handler 를 무인증 fake req/res 로 호출해 경계까지만 재현한다.
 *   - 외부 AI 실호출·실비용 없음(globalThis.fetch stub) · 고도몰 쓰기 없음 · 실 PII 주입 없음.
 * 근본 원인(감사 C1): 서버측 사용자 인증·세션·권한 경계 부재. 행위자 신뢰가 body-주장/데모역할/없음뿐.
 *
 * [FACT] = 현재 실제 동작(관찰) · [RED] = GREEN 종료조건(현재 미충족). GREEN 미구현이라 exit 1.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'auth-red-'));
let fact = 0, factf = 0, red = 0, redx = 0;
const F = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [FACT] ${n}${d ? `  — ${d}` : ''}`); ok ? fact++ : factf++; };
const R_ = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${d ? `  — ${d}` : ''}`); ok ? red++ : redx++; };
console.log('=== R-AUTH-FOUNDATION-01 — 서버 행위자·권한 경계 부재 (RED 진단) ===');

// ── 1. 인바운드 라우트 전수 census(현재 저장소에서 재계수) ────────────────────
const routeFiles = [];
const walkApi = (d) => { for (const e of readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) { if (!/_shared/.test(r)) walkApi(r); } else if (/\.ts$/.test(e.name)) routeFiles.push(r); } };
walkApi('api');
const AUTH_RE = /req\.headers\[?['"]?authorization|getSession|verifyToken|\bjwt\b|requireAuth|x-api-key['"]\s*\]|verifyAuth|checkAuth|assertAuth|session\.user/i;
const withInboundAuth = routeFiles.filter((f) => AUTH_RE.test(readFileSync(path.join(REPO, f), 'utf8')));

console.log('');
console.log('  --- [FACT] 라우트 전수·인바운드 인증 census ---');
F('C-census. api 인바운드 라우트 핸들러 수(재계수)', routeFiles.length >= 8, `핸들러 파일=${routeFiles.length} (${routeFiles.map((f) => f.replace('api/', '')).join(', ')})`);
F('C-noauth. 인바운드 사용자 인증(Authorization/cookie/JWT/세션) 검사 라우트 수 = 0', withInboundAuth.length === 0, `인증검사 라우트=${withInboundAuth.length}`);

// ── 2. 실 handler 무인증 호출(경계까지, 외부호출 stub) ─────────────────────────
let mktHandler, aiHandler;
try {
  execFileSync(process.execPath,
    [tscBin, path.join(REPO, 'api', 'marketing', '[action].ts'), path.join(REPO, 'api', 'ai', 'chat.ts'),
     '--ignoreConfig', '--rootDir', path.join(REPO, 'api'), '--outDir', tmp,
     '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'],
    { stdio: 'pipe' });
  for (const sub of ['marketing', 'ai', '_shared']) {
    const dir = path.join(tmp, sub); let files = [];
    try { files = readdirSync(dir).filter((x) => x.endsWith('.js')); } catch { continue; }
    for (const f of files) { const p = path.join(dir, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`))); }
  }
  mktHandler = (await import(pathToFileURL(path.join(tmp, 'marketing', '[action].js')).href)).default;
  aiHandler = (await import(pathToFileURL(path.join(tmp, 'ai', 'chat.js')).href)).default;
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true }); process.exit(1);
}
const makeRes = () => { const o = { _s: 200, _b: null }; return { status(c) { o._s = c; return this; }, json(b) { o._b = b; }, setHeader() {}, _get: () => ({ status: o._s, body: o._b }) }; };

// (a) behavior-summary GET 무인증 → 회사 집계 통계 반환(인증 게이트 없음). in-memory 버퍼(무 env).
const sumRes = makeRes();
try { await mktHandler({ url: '/api/marketing/behavior-summary', method: 'GET', headers: {} }, sumRes); } catch (e) { /* record below */ }
const sum = sumRes._get();

// (b) ai/chat POST 무인증 → 외부 provider 경계 도달(요청자 키 전달)·서버 회사키 미주입. fetch stub(실호출 0).
const realFetch = globalThis.fetch;
let captured = null;
globalThis.fetch = async (url, init) => {
  const h = (init && init.headers) || {};
  captured = { url: String(url), authHeader: h.Authorization || h.authorization || h['x-api-key'] || '' };
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'stub' } }], content: [{ type: 'text', text: 'stub' }] }), text: async () => '{}' };
};
const CALLER_KEY = 'CALLER-SUPPLIED-KEY-xyz';
const aiRes = makeRes();
try { await aiHandler({ method: 'POST', headers: {}, body: { providerId: 'claude_api', apiKey: CALLER_KEY, modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] } }, aiRes); } catch (e) { /* record below */ }
globalThis.fetch = realFetch;

console.log('');
console.log('  --- [FACT] 무인증 handler 호출 실제 결과(경계까지) ---');
F('A1. behavior-summary GET 무인증 → 회사 집계 통계 반환(인증 게이트 없음)', sum.status === 200 && sum.body && typeof sum.body === 'object', `status=${sum.status} keys=${sum.body ? Object.keys(sum.body).slice(0, 6).join(',') : 'null'}`);
F('A2. ai/chat POST 무인증 → 외부 provider 경계 도달(handler가 요청 처리·차단 안 함)', captured !== null, `outbound=${captured ? captured.url.replace('https://', '') : '(도달 못함)'}`);
F('A3. 전달된 키 = 요청자 body 키(서버 회사키 미주입)', captured && captured.authHeader.includes(CALLER_KEY), `authHeader=${captured ? (captured.authHeader ? '요청자키 포함' : '없음') : 'N/A'}`);

// ── 3~4. 행위자 신뢰 경로·lifecycle 서버 부재(structural, CODE) ────────────────
const lifecycleServer = routeFiles.filter((f) => /taskLifecycle|applyDecision|canDecide|requestTaskStop|actorForRole/.test(readFileSync(path.join(REPO, f), 'utf8')));
F('A4. lifecycle 권한 판정 서버 라우트 = 0(브라우저 localStorage 전용)', lifecycleServer.length === 0, `lifecycle 서버 라우트=${lifecycleServer.length}`);
F('A5. sessionRole 은 화면용 데모 역할(서버 검증 아님)', /1단계|데모|localStorage/.test(readFileSync(path.join(REPO, 'src', 'services', 'sessionRole.ts'), 'utf8')), 'sessionRole.ts: localStorage 데모');

console.log('');
console.log('  --- [RED] GREEN 종료조건 (현재 미충족) ---');
R_('R1. 서버가 인바운드 요청의 행위자를 검증(로그인 세션)해야 한다', withInboundAuth.length > 0, `현재 인증검사 라우트=${withInboundAuth.length} (기대 >0)`);
R_('R2. 회사 통계·PII·쓰기성 라우트는 검증된 행위자만 접근(예: behavior-summary)', sum.status === 401 || sum.status === 403, `현재 behavior-summary 무인증 status=${sum.status} (기대 401/403)`);
R_('R3. lifecycle 지시·승인·중단 권한이 서버에서 강제돼야 한다(행위자 서버 검증)', lifecycleServer.length > 0, `현재 lifecycle 서버 강제=${lifecycleServer.length > 0} (기대 서버 검증)`);
R_('R4. AI 프록시가 검증된 행위자에게만 허용돼야 한다(무인증 경계 도달 차단)', captured === null, `현재 무인증 외부 경계 도달=${captured !== null} (기대 차단)`);

console.log('');
console.log(`[FACT] ${fact} pass / ${factf} fail   [RED ] ${red} met / ${redx} unmet`);
rmSync(tmp, { recursive: true, force: true });
if (factf > 0) { console.log('\n✗ 관찰 불일치(진단 재작성 필요)'); process.exit(1); }
if (redx > 0) { console.log(`\n✗ RED — 서버 행위자·권한 경계 ${redx}건 미충족(AUTH-FOUNDATION GREEN 대기).`); process.exit(1); }
console.log('\n✓ (예상외) 전 종료조건 충족');
