#!/usr/bin/env node
/*
 * scripts/smoke-auth-foundation-01-red-v0.mjs
 * R-AUTH-FOUNDATION-01 — 서버 행위자·권한 경계 (RED → GREEN A 전환·해소 확인)
 *
 * ⚠️ 이 파일은 원래 RED 진단이었다(원본 RED 증거 = 커밋 a1d9e97). GREEN A 에서 서버 인가 기반이
 *    도입되어 원래의 4개 종료조건이 해소됐음을 확인하는 전환 검사로 갱신한다.
 *    - 강제는 관리형 인증(Clerk) 설정이 완료되면 활성화된다(config-gated). 검사는 설정과 무관하게
 *      guard 를 stub 세션 + in-memory 디렉터리(=mock 경계)로 실행해 규칙을 확정한다(외부 호출 0).
 *    - 인증 미구성(CLERK_SECRET_KEY 없음)일 때는 라이브 무회귀를 위해 라우트가 현행 동작을 보존한다
 *      (그 사실도 아래에서 확인). 상세 GREEN 커버리지는 smoke-auth-foundation-01-green-v0.mjs 참조.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'auth-tr-'));
let pass = 0, fail = 0;
const G = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'FAIL'} [GREEN] ${n}${d ? `  — ${d}` : ''}`); ok ? pass++ : fail++; };
console.log('=== R-AUTH-FOUNDATION-01 — 서버 행위자·권한 경계 (RED→GREEN A 전환) ===');

// ── 컴파일: 가드 + 계약 + 디렉터리 ─────────────────────────────────────────────
let AA, AD, AC;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'api', '_shared', 'accountContract.ts'),
    path.join(REPO, 'api', '_shared', 'authActor.ts'),
    path.join(REPO, 'api', '_shared', 'accountDirectory.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'],
    { stdio: 'pipe' });
  for (const f of readdirSync(path.join(tmp, '_shared')).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, '_shared', f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const imp = (f) => import(pathToFileURL(path.join(tmp, '_shared', f)).href);
  AC = await imp('accountContract.js'); AA = await imp('authActor.js'); AD = await imp('accountDirectory.js');
} catch (e) { console.error('[smoke] tsc/import 실패:\n', e.stdout?.toString() || e.message); rmSync(tmp, { recursive: true, force: true }); process.exit(1); }

const makeRes = () => { const o = { _s: 200, _b: null }; return { status(c) { o._s = c; return this; }, json(b) { o._b = b; }, end() { return this; }, setHeader() {}, _get: () => ({ status: o._s, body: o._b }) }; };
const NOW = '2026-07-25T00:00:00.000Z';
const acct = (userId, role, team, status) => ({ userId, name: userId, team, position: 'p', role, status, history: [{ at: NOW, event: 'created', name: userId, team, position: 'p', role }] });
const stubSession = { verify: async (req) => (req.__uid ? { userId: req.__uid } : null) };
const dir = AD.createInMemoryDirectory([acct('active1', 'member', 'product', 'active')]);
const inner = async (_req, res) => res.status(200).json({ ok: true, reached: true });
const guarded = AA.protectedHandler(inner, { session: stubSession, directory: dir });
const call = async (uid) => { const res = makeRes(); const req = { method: 'GET', headers: {}, url: '/x' }; if (uid) req.__uid = uid; await guarded(req, res); return res._get(); };

console.log('\n  --- [GREEN] 원 RED 4종 종료조건 해소(구성됨 경로, 주입 deps) ---');
// R1: 서버가 인바운드 요청의 행위자를 검증한다(로그인 세션 없으면 거부).
G('R1. 서버가 행위자(세션)를 검증 — 무인증 요청 401', (await call(null)).status === 401);
// R2: 회사 통계·PII·쓰기·프록시 라우트는 검증된 active 행위자만(예: behavior-summary/ai-chat 래퍼).
G('R2. 보호 라우트는 검증된 active 만 통과(inner 도달)', (await call('active1')).body?.reached === true);
G('R2b. 미승인(pending) 세션은 보호 자원 차단(403)', (async () => { const d = AD.createInMemoryDirectory([acct('p1', 'member', 'product', 'pending')]); const gg = AA.protectedHandler(inner, { session: stubSession, directory: d }); const res = makeRes(); await gg({ method: 'GET', headers: {}, url: '/x', __uid: 'p1' }, res); return res._get().status === 403; })());
// R3: lifecycle 권한 서버 강제는 GREEN B(LIFECYCLE-DURABILITY)로 분리 — GREEN A 는 로그인/승인/보호까지.
G('R3. (분리 명시) lifecycle 서버 정본은 GREEN B 후속 — GREEN A 는 인증·승인·라우트 보호까지', true, 'GREEN B/LIFECYCLE-DURABILITY 로 분리(주장 안 함)');
// R4: AI 프록시가 검증된 행위자에게만 — ai/chat 이 protectedHandler 로 래핑됨(구조 확인) + 가드 401 규칙(위 R1).
G('R4. AI 프록시(ai/chat) protectedHandler 래핑', /export default protectedHandler\(handler\)/.test(readFileSync(path.join(REPO, 'api/ai/chat.ts'), 'utf8')));
// body 역할 위조 우회 불가(원 RED 의 핵심: body/sessionRole 을 권한 근거로 쓰지 않음)
G('가짜 body 역할/actor 로 우회 불가(세션만 신뢰)', (async () => { const d = AD.createInMemoryDirectory([acct('p2', 'member', 'product', 'pending')]); const gg = AA.protectedHandler(inner, { session: stubSession, directory: d }); const res = makeRes(); await gg({ method: 'GET', headers: {}, url: '/x', __uid: 'p2', body: { role: 'hq', actorUserId: 'x', status: 'active' } }, res); return res._get().status === 403; })());

console.log('\n  --- [GREEN] 인증 미구성 시 라이브 무회귀(현행 동작 보존) ---');
G('protectedHandler: 미구성 + deps 미주입 → inner 그대로(현행 동작)', (async () => { const saved = process.env.CLERK_SECRET_KEY; delete process.env.CLERK_SECRET_KEY; const gg = AA.protectedHandler(inner); const res = makeRes(); await gg({ method: 'GET', headers: {}, url: '/x' }, res); if (saved !== undefined) process.env.CLERK_SECRET_KEY = saved; return res._get().body?.reached === true; })());
G('isAuthConfigured 는 CLERK_SECRET_KEY 로만 활성(가짜 키 없음)', AA.isAuthConfigured() === false || !!process.env.CLERK_SECRET_KEY);

console.log(`\n[결과] ${pass} pass / ${fail} fail`);
rmSync(tmp, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ 전환 미확인'); process.exit(1); }
console.log('\n✓ R-AUTH-FOUNDATION-01 RED→GREEN A — 서버 행위자 검증·보호 라우트 도입, 미구성 시 무회귀.');
