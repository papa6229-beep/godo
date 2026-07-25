#!/usr/bin/env node
/*
 * scripts/smoke-auth-foundation-01-1-red-v0.mjs
 * R-AUTH-FOUNDATION-01 GREEN A.1 — 실배선 누락·fail-open (RED → GREEN 전환·해소 확인)
 *
 * ⚠️ 이 파일은 GREEN A.1 보정 RED 감사였다(원본 RED 증거 = 커밋 d4de256, FACT 30 재현).
 *    GREEN A.1 구현 후 원래의 6개 종료조건(R1~R6)이 해소됐음을 확인하는 전환 검사로 갱신한다.
 *    상세 커버리지(55검사)는 smoke-auth-foundation-01-green-v0.mjs 가 담당한다.
 * 외부 Clerk 실호출 0. 실제 가입·브라우저 로그인·Preview 는 설정 후 실증 범위(통과 주장 안 함).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const require_ = createRequire(pathToFileURL(path.join(REPO, 'package.json')).href);
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'auth-a1-tr-'));
let pass = 0, fail = 0;
const G = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'FAIL'} [GREEN] ${n}${d ? `  — ${d}` : ''}`); ok ? pass++ : fail++; };
const src = (p) => readFileSync(path.join(REPO, p), 'utf8');
const codeLines = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
console.log('=== R-AUTH-FOUNDATION-01 GREEN A.1 — RED→GREEN 전환 확인 ===');

// 컴파일(전환 재현용 최소 세트)
let AC, AD, AUTHROUTE, ordersRevenue;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'api', '_shared', 'accountContract.ts'),
    path.join(REPO, 'api', '_shared', 'authActor.ts'),
    path.join(REPO, 'api', '_shared', 'accountDirectory.ts'),
    path.join(REPO, 'api', '_shared', 'clerkAuthAdapter.ts'),
    path.join(REPO, 'api', 'auth', '[action].ts'),
    path.join(REPO, 'api', 'godomall', 'orders-revenue.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'],
    { stdio: 'pipe' });
  for (const sub of ['_shared', 'auth', 'godomall']) {
    const dir = path.join(tmp, sub);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const p = path.join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
  }
  const imp = (sub, f) => import(pathToFileURL(path.join(tmp, sub, f)).href);
  AC = await imp('_shared', 'accountContract.js'); AD = await imp('_shared', 'accountDirectory.js');
  AUTHROUTE = await imp('auth', '[action].js'); ordersRevenue = (await imp('godomall', 'orders-revenue.js')).default;
} catch (e) { console.error('[smoke] tsc/import 실패:\n', e.stdout?.toString() || e.message); rmSync(tmp, { recursive: true, force: true }); process.exit(1); }
const makeRes = () => { const o = { _s: 200, _b: null }; return { status(c) { o._s = c; return this; }, json(b) { o._b = b; }, end() { return this; }, setHeader() {}, _get: () => ({ status: o._s, body: o._b }) }; };
const NOW = '2026-07-25T00:00:00.000Z';
const acct = (userId, role, team, status) => ({ userId, name: userId, team, position: 'p', role, status, history: [{ at: NOW, event: 'created', name: userId, team, position: 'p', role }] });
const stubSession = { verify: async (req) => (req.__uid ? { userId: req.__uid } : null) };
const ENVK = ['CLERK_SECRET_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY', 'AUTH_AUTHORIZED_PARTIES', 'VERCEL_ENV', 'GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY'];
const savedEnv = Object.fromEntries(ENVK.map((k) => [k, process.env[k]]));
const setEnv = (o) => { for (const k of ENVK) delete process.env[k]; Object.assign(process.env, { GODOMALL_API_MODE: 'mock', GODOMALL_PARTNER_KEY: 'stub', GODOMALL_USER_KEY: 'stub' }, o); };

// R1. SDK 실설치 + 정적 배선(모듈 해석이 빌드 검증 대상)
G('R1. @clerk 실설치(require.resolve)·정적 import·node_modules 존재', (() => {
  try { require_.resolve('@clerk/backend'); require_.resolve('@clerk/react'); } catch { return false; }
  return existsSync(path.join(REPO, 'node_modules', '@clerk')) && /from '@clerk\/backend'/.test(src('api/_shared/clerkAuthAdapter.ts'));
})());

// R2. 클라 실배선 실소비자 ≥1(주석 제외)
const cProvider = /(<ClerkProvider)/.test(codeLines('src/main.tsx').join('\n'));
const cRegister = /registerAuthSource\(/.test(codeLines('src/components/auth/ClerkAuthBridge.tsx').join('\n'));
const cApiAuth = /\/api\/auth\//.test(codeLines('src/components/auth/AccountAdminPanel.tsx').join('\n'));
G('R2. Provider·authSource·api/auth 호출·승인화면 실소비자 존재', cProvider && cRegister && cApiAuth);

// R3. 배포환경 미완전 설정 → 503(익명 open·크래시 제거)
setEnv({ VERCEL_ENV: 'production' });
const m1 = makeRes(); await ordersRevenue({ method: 'GET', headers: {}, url: '/x' }, m1);
setEnv({ VERCEL_ENV: 'preview', CLERK_SECRET_KEY: 'sk_test_local-check' });
let m2status;
try { const m2 = makeRes(); await ordersRevenue({ method: 'GET', headers: {}, url: '/x' }, m2); m2status = m2._get().status; } catch { m2status = 'crash'; }
setEnv({});
const m3 = makeRes(); await ordersRevenue({ method: 'GET', headers: {}, url: '/x' }, m3);
for (const k of ENVK) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
G('R3. 키0+Production→503 · Secret만+Preview→503(크래시 아님) · 로컬→200(명시 open)', m1._get().status === 503 && m2status === 503 && m3._get().status === 200, `prod=${m1._get().status} preview=${m2status} local=${m3._get().status}`);

// R4. 메서드 계약: DELETE approve → 405 + 레코드 불변
const dir = AD.createInMemoryDirectory([acct('leadP', 'team_lead', 'product', 'active'), acct('pend1', 'member', 'product', 'pending')]);
const dres = makeRes();
await AUTHROUTE.runAuthAction({ method: 'DELETE', headers: {}, url: '/api/auth/approve', body: { targetUserId: 'pend1' }, __uid: 'leadP' }, dres, { session: stubSession, directory: dir });
G('R4. DELETE approve → 405 + 대상 pending 불변', dres._get().status === 405 && (await dir.getAccount('pend1')).status === 'pending');

// R5. 비번 정책 일치: self-reset 거부 + 강제변경 공식 API 사용
const m = acct('m1', 'member', 'product', 'active');
G('R5. member self-reset=false + Clerk setPasswordCompromised(revokeAllSessions) 사용', AC.canResetPassword(m, m) === false && /setPasswordCompromised\([^)]*revokeAllSessions: true/.test(src('api/_shared/clerkAuthAdapter.ts')));

// R6. 공허·약한 단언 제거(빈 배열 검사·isArray 단독 단언 부재)
const green = src('scripts/smoke-auth-foundation-01-green-v0.mjs');
G('R6. GREEN 검사에서 공허 단언 제거(빈배열 트릭·isArray 단독 부재, 실 직렬화·스코프 내용 검사)', !/Array\.from\(dir\.listAccounts \? \[\] : \[\]\)/.test(green) && !/status === 200 && Array\.isArray\(pa\.body\?\.pending\)\)/.test(green) && /JSON\.stringify\(listP\) === JSON\.stringify\(\['pendP'\]\)/.test(green));

console.log(`\n[결과] ${pass} pass / ${fail} fail`);
rmSync(tmp, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ 전환 미확인'); process.exit(1); }
console.log('\n✓ GREEN A.1 — 보정 RED 6개 종료조건 해소(원본 RED 증거 = d4de256). Preview 실증은 설정 후.');
