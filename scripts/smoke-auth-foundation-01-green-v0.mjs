#!/usr/bin/env node
/*
 * scripts/smoke-auth-foundation-01-green-v0.mjs
 * R-AUTH-FOUNDATION-01 GREEN A.1 — 사내 로그인·가입 승인·보호 라우트 (실의미 검사 v1)
 *
 * A.1 검사 교체 원칙(보정 RED d4de256 의 T1~T4 해소):
 *   - 실제 모듈 해석: 설치된 @clerk/backend 를 정적 import 하는 컴파일된 어댑터를 실제로 import.
 *   - 실제 상태전이: 컴파일된 handler/서비스 실행 + 저장소 직렬화 전수 검사(빈 배열 단언 금지).
 *   - 실제 요청 경계: authorizedFetch 실행으로 Authorization: Bearer 전달을 관측.
 *   - 실소비자: 주석 제외 코드 라인의 import/호출만 소비자로 센다.
 *   - fail-closed 매트릭스: 키 없음/서버만/프론트만/완전설정 × 로컬/배포를 실 handler 로 재현.
 * 외부 Clerk 네트워크 호출 0 — 완전설정 매트릭스의 키 값은 형식만 갖춘 로컬 검사용이며
 * 세션 토큰이 없는 요청은 네트워크 없이 signed-out 판정된다(도달 시에도 401 경계 확인용).
 * 실제 Clerk 가입·브라우저 로그인·실세션·Preview 는 이 검사의 범위가 아니다(설정 후 실증).
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
const tmp = mkdtempSync(path.join(cacheRoot, 'auth-g1-'));
let pass = 0, fail = 0;
const G = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'FAIL'} [G] ${n}${d ? `  — ${d}` : ''}`); ok ? pass++ : fail++; };
const src = (p) => readFileSync(path.join(REPO, p), 'utf8');
const codeLines = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
console.log('=== R-AUTH-FOUNDATION-01 GREEN A.1 — 실배선·fail-closed (실의미 검사) ===');

// ── 1. 실제 SDK 모듈 해석(설치 + 정적 import) ─────────────────────────────────
console.log('\n  --- [G] 1. SDK 실설치·실제 모듈 해석 ---');
G('S1. @clerk/react·@clerk/backend 설치(require.resolve 실해석)', (() => {
  try { require_.resolve('@clerk/react'); require_.resolve('@clerk/backend'); return true; } catch { return false; }
})());
G('S2. lockfile 에 @clerk 존재', /@clerk\//.test(src('package-lock.json')));
G('S3. 어댑터가 정적 import(비리터럴 지정자 트릭 제거)', /import \{ createClerkClient \} from '@clerk\/backend'/.test(src('api/_shared/clerkAuthAdapter.ts')) && !/\[['"]@clerk['"]/.test(src('api/_shared/clerkAuthAdapter.ts')));

// ── 컴파일: 서버 모듈 + 클라 순수 모듈 ────────────────────────────────────────
let AC, AA, AD, AUTHROUTE, ordersRevenue, ordersAdmin, marketing, health, AG, AF, ADAPTER;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'api', '_shared', 'accountContract.ts'),
    path.join(REPO, 'api', '_shared', 'authActor.ts'),
    path.join(REPO, 'api', '_shared', 'accountDirectory.ts'),
    path.join(REPO, 'api', '_shared', 'clerkAuthAdapter.ts'),
    path.join(REPO, 'api', 'auth', '[action].ts'),
    path.join(REPO, 'api', 'godomall', 'orders-revenue.ts'),
    path.join(REPO, 'api', 'godomall', 'orders-admin.ts'),
    path.join(REPO, 'api', 'godomall', 'health.ts'),
    path.join(REPO, 'api', 'marketing', '[action].ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'],
    { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'authGate.ts'), path.join(REPO, 'src', 'services', 'authorizedFetch.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', path.join(tmp, 'cli'),
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--jsx', 'react-jsx', '--types', 'node'],
    { stdio: 'pipe' });
  for (const sub of ['_shared', 'auth', 'godomall', 'marketing', path.join('cli', 'services')]) {
    const dir = path.join(tmp, sub); let files = [];
    try { files = readdirSync(dir).filter((x) => x.endsWith('.js')); } catch { continue; }
    for (const f of files) { const p = path.join(dir, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`))); }
  }
  const imp = (sub, f) => import(pathToFileURL(path.join(tmp, sub, f)).href);
  AC = await imp('_shared', 'accountContract.js'); AA = await imp('_shared', 'authActor.js'); AD = await imp('_shared', 'accountDirectory.js');
  ADAPTER = await imp('_shared', 'clerkAuthAdapter.js'); // ★ 실제 @clerk/backend import 실행(해석 실패 시 여기서 죽음)
  AUTHROUTE = await imp('auth', '[action].js');
  ordersRevenue = (await imp('godomall', 'orders-revenue.js')).default;
  ordersAdmin = (await imp('godomall', 'orders-admin.js')).default;
  health = (await imp('godomall', 'health.js')).default;
  marketing = (await imp('marketing', '[action].js')).default;
  AG = await imp(path.join('cli', 'services'), 'authGate.js');
  AF = await imp(path.join('cli', 'services'), 'authorizedFetch.js');
} catch (e) {
  console.error('[smoke] tsc/import 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true }); process.exit(1);
}
G('S4. 컴파일된 어댑터 실제 import 성공(=@clerk/backend 실해석·실행)', !!ADAPTER.createClerkAuthDeps && !!ADAPTER.createClerkDirectory);

const makeRes = () => { const o = { _s: 200, _b: null }; return { status(c) { o._s = c; return this; }, json(b) { o._b = b; }, end() { return this; }, setHeader() {}, _get: () => ({ status: o._s, body: o._b }) }; };
const NOW = '2026-07-25T00:00:00.000Z';
const acct = (userId, role, team, status) => ({ userId, name: `${userId}-이름`, team, position: '직책', role, status, history: [{ at: NOW, event: 'created', name: `${userId}-이름`, team, position: '직책', role }] });
const stubSession = { verify: async (req) => (req.__uid ? { userId: req.__uid } : null) };
const ENVK = ['CLERK_SECRET_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY', 'AUTH_AUTHORIZED_PARTIES', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL', 'GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY'];
const savedEnv = Object.fromEntries(ENVK.map((k) => [k, process.env[k]]));
const setEnv = (o) => { for (const k of ENVK) delete process.env[k]; Object.assign(process.env, { GODOMALL_API_MODE: 'mock', GODOMALL_PARTNER_KEY: 'stub', GODOMALL_USER_KEY: 'stub' }, o); };
const restoreEnv = () => { for (const k of ENVK) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } };
const callRoute = async (handler, req) => { const res = makeRes(); await handler(req, res); return res._get(); };

// ── 2. fail-closed 매트릭스(실 handler·실 설정 계약) ─────────────────────────
console.log('\n  --- [G] 2. 설정 매트릭스: 키 없음/서버만/프론트만/완전 × 로컬/배포 ---');
const OR_REQ = () => ({ method: 'GET', headers: {}, url: '/api/godomall/orders-revenue' });
setEnv({});
G('M1. 키 0 + 로컬 → 200(명시적 open, 개발 편의)', (await callRoute(ordersRevenue, OR_REQ())).status === 200);
setEnv({ VERCEL_ENV: 'production' });
G('M2. 키 0 + Production → 503(익명 open 금지)', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
setEnv({ VERCEL_ENV: 'preview', CLERK_SECRET_KEY: 'sk_test_local-matrix-check' });
G('M3. Secret만 + Preview → 503(크래시 500 아님)', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
setEnv({ VERCEL_ENV: 'production', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_local-matrix-check' });
G('M4. Publishable만 + Production → 503', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
setEnv({ VERCEL_ENV: 'production', CLERK_SECRET_KEY: 'sk_test_x', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_x' });
G('M5. 두 키 + 배포 + authorizedParties 0 → 503(azp 생략 금지)', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
// 완전 설정: parties 는 env 도메인 기반으로 구성되는지(요청 Host 불신)
const pk = 'pk_test_' + Buffer.from('example.clerk.accounts.dev$').toString('base64');
setEnv({ VERCEL_ENV: 'production', CLERK_SECRET_KEY: 'sk_test_local-matrix-check', VITE_CLERK_PUBLISHABLE_KEY: pk, AUTH_AUTHORIZED_PARTIES: 'https://godo-psi.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'godo-psi.vercel.app' });
const cfgFull = AA.resolveServerAuthConfig(process.env);
G('M6. 완전 설정 판정 = complete, parties=env 도메인(요청 Host 아님)', cfgFull.state === 'complete' && cfgFull.authorizedParties.includes('https://godo-psi.vercel.app'));
let m7;
try { m7 = await callRoute(ordersRevenue, OR_REQ()); } catch (e) { m7 = { status: 'crash', err: String(e && (e.code || e.message)).slice(0, 80) }; }
G('M7. 완전 설정 + 무세션 → 401(실 어댑터 경로, 크래시 아님)', m7.status === 401, `status=${m7.status}${m7.err ? ' err=' + m7.err : ''}`);
setEnv({});

// ── 3. 서버 가드·계약(실 상태전이) ────────────────────────────────────────────
console.log('\n  --- [G] 3. 가드·승인 스코프·역할 위조 불가(실 실행) ---');
const inner = async (_req, res) => res.status(200).json({ ok: true, ran: true });
const mkGuard = (seed) => { const d = AD.createInMemoryDirectory(seed); return { d, g: AA.protectedHandler(inner, { session: stubSession, directory: d }) }; };
{
  const { g } = mkGuard([acct('a1', 'member', 'product', 'active'), acct('p1', 'member', 'product', 'pending'), acct('s1', 'member', 'product', 'suspended')]);
  const call = async (uid, body) => { const res = makeRes(); const req = { method: 'GET', headers: {}, url: '/x', body }; if (uid) req.__uid = uid; await g(req, res); return res._get(); };
  G('A1. 무인증 → 401', (await call(null)).status === 401);
  G('A2. pending → 403 / suspended → 403 / 계정없음 → 403', (await call('p1')).status === 403 && (await call('s1')).status === 403 && (await call('ghost')).status === 403);
  G('A3. active → 통과(inner 실행)', (await call('a1')).body?.ran === true);
  G('A4. body 역할·actor 위조 무력(pending 이 hq 주장해도 403)', (await call('p1', { role: 'hq', actorUserId: 'a1', status: 'active' })).status === 403);
}
// 승인 스코프: 같은 팀장 목록 = 자기 팀 member 신청만(내용까지 검사 — isArray 단언 금지)
const hq = acct('hq1', 'hq', 'hq', 'active');
const leadP = acct('leadP', 'team_lead', 'product', 'active');
const leadC = acct('leadC', 'team_lead', 'cs', 'active');
const pendP = acct('pendP', 'member', 'product', 'pending');
const pendC = acct('pendC', 'member', 'cs', 'pending');
const pendLegacyLead = acct('pendLead', 'team_lead', 'product', 'pending'); // legacy 팀장 신청 fixture
{
  const dir = AD.createInMemoryDirectory([hq, leadP, leadC, pendP, pendC, pendLegacyLead]);
  const listP = (await AD.listApprovableFor(dir, leadP)).map((a) => a.userId).sort();
  const listHq = (await AD.listApprovableFor(dir, hq)).map((a) => a.userId).sort();
  G('A5. 같은 팀장 목록 = 자기 팀 member 신청만 [pendP] (타팀·team_lead 미포함)', JSON.stringify(listP) === JSON.stringify(['pendP']), `leadP=[${listP}]`);
  G('A6. HQ 목록 = 전체 규칙(모든 승인 가능 신청 포함)', listHq.includes('pendP') && listHq.includes('pendC') && listHq.includes('pendLead'), `hq=[${listHq}]`);
  // 승인 시 역할 결정
  G('A7. 팀장이 team_lead 로 승인 → FORBIDDEN', (await AD.approveApplication(dir, 'leadP', 'pendP', NOW, 'team_lead')).errorCode === 'FORBIDDEN');
  const asLead = await AD.approveApplication(dir, 'hq1', 'pendP', NOW, 'team_lead');
  G('A8. HQ 가 team_lead 로 승인 → active·role=team_lead(실 상태전이)', asLead.ok && asLead.account.status === 'active' && asLead.account.role === 'team_lead');
  G('A9. 타 팀장 승인 → FORBIDDEN', (await AD.approveApplication(dir, 'leadP', 'pendC', NOW, 'member')).errorCode === 'FORBIDDEN');
}

// ── 4. 인증 API: 메서드 강제·역할 위조·비번 정책(실 라우트 코어) ───────────────
console.log('\n  --- [G] 4. api/auth 메서드 405·레코드 불변·역할 위조 불가·비번 정책 ---');
{
  const dir = AD.createInMemoryDirectory([hq, leadP, leadC, acct('memP2', 'member', 'product', 'active'), acct('memC2', 'member', 'cs', 'active')]);
  const call = async (method, uid, action, body) => { const res = makeRes(); const req = { method, headers: {}, url: `/api/auth/${action}`, body: body || {} }; if (uid) req.__uid = uid; await AUTHROUTE.runAuthAction(req, res, { session: stubSession, directory: dir }); return res._get(); };
  // 가입(역할 위조 불가)
  const su = await call('POST', 'newU', 'signup-metadata', { name: '신입', team: 'product', position: '사원', role: 'hq', approveAsRole: 'team_lead' });
  G('B1. 공개 가입 body 의 role/hq 위조 무시 → 항상 member·pending', su.status === 200 && su.body?.account?.role === 'member' && su.body?.account?.status === 'pending');
  // 메서드 위반 → 405 + 레코드 불변(실검사)
  const before = JSON.stringify(await dir.getAccount('newU'));
  const del = await call('DELETE', 'leadP', 'approve', { targetUserId: 'newU' });
  const get2 = await call('GET', 'leadP', 'suspend', { targetUserId: 'memP2' });
  const put3 = await call('PUT', 'leadP', 'reset-password', { targetUserId: 'memP2', tempPassword: 'Xx'.repeat(8) });
  const after = JSON.stringify(await dir.getAccount('newU'));
  G('B2. DELETE approve / GET suspend / PUT reset → 전부 405', del.status === 405 && get2.status === 405 && put3.status === 405);
  G('B3. 405 후 레코드 불변(대상 계정 그대로 pending, 비번 미설정)', before === after && (await dir.getAccount('memP2')).status === 'active' && dir._passwords.size === 0);
  G('B4. POST me / POST pending-approvals → 405(GET 전용)', (await call('POST', 'leadP', 'me', {})).status === 405 && (await call('POST', 'leadP', 'pending-approvals', {})).status === 405);
  // 승인 정상 경로(서버 규칙)
  G('B5. 같은 팀장 member 승인 → 200 active', (await call('POST', 'leadP', 'approve', { targetUserId: 'newU', approveAsRole: 'member' })).status === 200 && (await dir.getAccount('newU')).status === 'active');
  // 비번 정책
  const TEMP = 'Temp-Pw-3x!aQ9';
  G('B6. member self-reset → 403(정책: 팀장/HQ 발급만)', (await call('POST', 'memP2', 'reset-password', { targetUserId: 'memP2', tempPassword: TEMP })).status === 403);
  G('B7. 타 팀장 초기화 → 403', (await call('POST', 'leadC', 'reset-password', { targetUserId: 'memP2', tempPassword: TEMP })).status === 403);
  const rp = await call('POST', 'leadP', 'reset-password', { targetUserId: 'memP2', tempPassword: TEMP });
  G('B8. 같은 팀장 초기화 → 200 + 다음 로그인 변경 강제 계약(_forcedChange)', rp.status === 200 && dir._passwords.get('memP2') === TEMP && dir._forcedChange.has('memP2'));
  G('B9. HQ 초기화 → 200(전체 범위)', (await call('POST', 'hq1', 'reset-password', { targetUserId: 'memC2', tempPassword: TEMP })).status === 200);
  // 정지(삭제 아님)
  const sp = await call('POST', 'leadP', 'suspend', { targetUserId: 'memP2' });
  const target = await dir.getAccount('memP2');
  G('B10. 정지 → suspended·계정 존재·이력 증가·잠금 호출', sp.status === 200 && target.status === 'suspended' && target.history.length >= 2 && dir._locked.has('memP2'));
  // 비번 미노출: 전 계정 직렬화 + 전 응답 직렬화(빈 배열 단언 금지 — 실데이터 검사)
  const allAccounts = JSON.stringify(await dir.listAccounts());
  const allResponses = JSON.stringify([su, del, get2, put3, rp, sp].map((r) => r.body));
  G('B11. 전 계정 직렬화에 임시비번 0(계정 수>0 확인 포함)', (await dir.listAccounts()).length >= 5 && !allAccounts.includes(TEMP));
  G('B12. 전 응답 직렬화에 임시비번 0', !allResponses.includes(TEMP));
  // pending-approvals 응답에 managed 스코프 포함(내용 검사)
  const pa = await call('GET', 'leadC', 'pending-approvals', {});
  const managedIds = (pa.body?.managed ?? []).map((a) => a.userId);
  G('B13. 팀장 managed = 자기 팀 member 만(타 팀 미포함)', pa.status === 200 && managedIds.includes('memC2') && !managedIds.includes('memP2'), `leadC managed=[${managedIds}]`);
  // Clerk 어댑터의 실제 초기화 구현이 공식 2단계(교체+강제변경)를 모두 호출하는지(소스 계약)
  G('B14. Clerk setPassword = updateUser(signOutOfOtherSessions)+setPasswordCompromised(revokeAllSessions)', /updateUser\([^)]*signOutOfOtherSessions: true/.test(src('api/_shared/clerkAuthAdapter.ts')) && /setPasswordCompromised\([^)]*revokeAllSessions: true/.test(src('api/_shared/clerkAuthAdapter.ts')));
}

// ── 5. 클라이언트 실배선(실소비자·실행 검사) ──────────────────────────────────
console.log('\n  --- [G] 5. 클라 실배선: Provider·브리지·authorizedFetch·화면 ---');
const mainSrc = codeLines('src/main.tsx').join('\n');
G('C1. main.tsx: ClerkProvider 실 import+JSX 마운트', /import \{ ClerkProvider \} from '@clerk\/react'/.test(mainSrc) && /<ClerkProvider publishableKey=/.test(mainSrc));
const bridgeSrc = codeLines('src/components/auth/ClerkAuthBridge.tsx').join('\n');
G('C2. 브리지: useAuth 실사용 + registerAuthSource 실호출 + /api/auth/me 실호출', /useAuth\(\)/.test(bridgeSrc) && /registerAuthSource\(/.test(bridgeSrc) && /authorizedFetch\('\/api\/auth\/me'\)/.test(bridgeSrc));
// /api/auth/* 클라 호출자 전수(주석 제외)
const apiAuthCallers = ['src/components/auth/ClerkAuthBridge.tsx', 'src/components/auth/AccountAdminPanel.tsx', 'src/components/AuthGateScreen.tsx']
  .filter((f) => /\/api\/auth\//.test(codeLines(f).join('\n')));
G('C3. /api/auth/* 실 클라 호출자 ≥3 파일(브리지·관리패널·게이트화면)', apiAuthCallers.length >= 3, `${apiAuthCallers.length}개`);
// authorizedFetch 실행 검사: 토큰 게터 등록 시 Authorization 전달·미등록 시 무헤더
{
  const realFetch = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => { seen = { url: String(url), auth: new Headers(init && init.headers).get('Authorization') }; return { ok: true, status: 200, json: async () => ({}) }; };
  AF.registerSessionTokenGetter(async () => 'test-session-jwt');
  await AF.authorizedFetch('/api/godomall/orders-revenue');
  const withToken = seen;
  AF.registerSessionTokenGetter(null);
  await AF.authorizedFetch('/api/godomall/orders-revenue');
  const withoutToken = seen;
  globalThis.fetch = realFetch;
  G('C4. 인증 fetch 실행: 게터 등록 → Authorization: Bearer 전달(실행 관측)', withToken.auth === 'Bearer test-session-jwt');
  G('C5. 게터 미등록 → 헤더 없이 기존 동작(미구성 무회귀)', withoutToken.auth === null);
}
// 보호 API 소비자 재배선 전수
const rewired = [
  ['src/services/secureProxyClient.ts', 6], ['src/services/departmentDataService.ts', 4],
  ['src/services/aiProviderAdapter.ts', 1], ['src/hooks/useMarketingBehaviorSummary.ts', 1]
].map(([f, n]) => [(codeLines(f).join('\n').match(/authorizedFetch\(/g) || []).length, n, f]);
G('C6. 보호 API 소비자 12지점 authorizedFetch 재배선(파일별 정확 수)', rewired.every(([got, want]) => got >= want), rewired.map(([g2, w, f]) => `${path.basename(f)}:${g2}/${w}`).join(' '));
G('C7. health(공개)는 재배선 제외(무인증 상태점검 유지)', /await fetch\('\/api\/godomall\/health'\)/.test(src('src/services/secureProxyClient.ts')));
// 화면: 로그인 실입력·실제출, 가입 5필드, 이메일 없음
const screen = codeLines('src/components/AuthGateScreen.tsx').join('\n');
G('C8. 로그인 화면: 입력 2 + form 제출 + signIn.password + finalize 실호출', /id="login-username"/.test(screen) && /id="login-password"/.test(screen) && /signIn\.password\(\{ identifier/.test(screen) && /signIn\.finalize\(\)/.test(screen));
const signupInputs = (screen.match(/id="su-(name|team|position|username|password)"/g) || []).length;
G('C9. 가입 화면: 정확히 5입력(이름·팀·직책·아이디·비번) + signUp.password 실호출', signupInputs === 5 && /signUp\.password\(\{ username/.test(screen));
G('C10. 이메일·전화 입력 없음(가입/로그인 화면)', !/type="email"|emailAddress|전화번호|phoneNumber/.test(screen));
G('C11. pending/suspended: 로그아웃(signOut)·상태 재확인(refreshAuthStatus) 실배선', (screen.match(/signOut\(\)/g) || []).length >= 2 && (screen.match(/refreshAuthStatus\(\)/g) || []).length >= 3);
G('C12. 관리패널: 승인(역할 선택은 HQ만)·정지·임시비번 발급 배선', /approveAsRole: 'member'/.test(src('src/components/auth/AccountAdminPanel.tsx')) && /approveAsRole: 'team_lead'/.test(src('src/components/auth/AccountAdminPanel.tsx')) && /isHq &&/.test(src('src/components/auth/AccountAdminPanel.tsx')));
G('C13. 클라 소스에 비번 localStorage/콘솔 기록 0', !['src/components/AuthGateScreen.tsx', 'src/components/auth/AccountAdminPanel.tsx', 'src/components/auth/ClerkAuthBridge.tsx', 'src/services/authorizedFetch.ts'].some((f) => /localStorage\.[a-z]+\([^)]*[Pp]assword|console\.[a-z]+\([^)]*[Pp]assword/.test(src(f))));

// ── 6. 게이트: 미로그인 시 회사 데이터 로드 0 ─────────────────────────────────
console.log('\n  --- [G] 6. 게이트 판정(순수 실행) + 미로그인 fetch 차단 ---');
const gate = (i) => AG.computeAuthGate(i);
G('D1. 미구성→open / 로딩→loading / 미로그인→login / 대기→pending / 정지→suspended / active→app',
  gate({ configured: false, loaded: true, signedIn: false }) === 'open' && gate({ configured: true, loaded: false, signedIn: false }) === 'loading' &&
  gate({ configured: true, loaded: true, signedIn: false }) === 'login' && gate({ configured: true, loaded: true, signedIn: true, status: 'pending' }) === 'pending' &&
  gate({ configured: true, loaded: true, signedIn: true, status: 'suspended' }) === 'suspended' && gate({ configured: true, loaded: true, signedIn: true, status: 'active' }) === 'app');
G('D2. 미로그인/대기/정지 → 회사 데이터 로드 금지, app/open → 허용', !AG.shouldLoadCompanyData('login') && !AG.shouldLoadCompanyData('pending') && !AG.shouldLoadCompanyData('suspended') && AG.shouldLoadCompanyData('app') && AG.shouldLoadCompanyData('open'));
const appSrc = codeLines('src/App.tsx').join('\n');
G('D3. App: 게이트 조기 반환이 대시보드 트리 마운트(=fetch 시작) 이전', /authGateMode !== 'open' && authGateMode !== 'app'/.test(appSrc) && appSrc.indexOf("authGateMode !== 'open'") < appSrc.indexOf('<OpeningScreen'));

// ── 7. 공개/폐쇄 경로 무회귀(실 handler) ──────────────────────────────────────
console.log('\n  --- [G] 7. 공개·폐쇄 경로 무회귀(실 handler 호출) ---');
setEnv({ VERCEL_ENV: 'production' }); // 배포 fail-closed 상태에서도 공개 경로는 열려 있어야 한다
const he = await callRoute(health, { method: 'GET', headers: {}, url: '/api/godomall/health' });
const be = await callRoute(marketing, { method: 'OPTIONS', headers: { origin: 'https://x' }, url: '/api/marketing/behavior-events' });
const bs = await callRoute(marketing, { method: 'GET', headers: {}, url: '/api/marketing/behavior-summary' });
const oa = await callRoute(ordersAdmin, { method: 'GET', headers: {} });
G('E1. health 공개 유지(배포 fail-closed 중에도 200)', he.status === 200);
G('E2. behavior-events 공개 유지(방문자 수집 — 401/403/503 아님)', be.status !== 401 && be.status !== 403 && be.status !== 503);
G('E3. behavior-summary 는 배포 미설정 시 503(회사 통계 닫힘)', bs.status === 503);
G('E4. orders-admin 403 ADMIN_ACCESS_DISABLED 유지(인증 도입에도 재개 안 함)', oa.status === 403 && oa.body?.errorCode === 'ADMIN_ACCESS_DISABLED');
G('E5. detail 은 이번 보정 미보호(rate-limit·SSRF 유지)', !/protectedHandler/.test(src('api/detail/[action].ts')) && /consumeRateLimit|rate/i.test(src('api/detail/[action].ts')));
setEnv({}); restoreEnv();

console.log(`\n[결과] ${pass} pass / ${fail} fail`);
rmSync(tmp, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ GREEN A.1 미충족'); process.exit(1); }
console.log('\n✓ R-AUTH-FOUNDATION-01 GREEN A.1 — 실배선·fail-closed·정책 일치(로컬 검증 범위).');
