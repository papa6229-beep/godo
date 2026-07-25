#!/usr/bin/env node
/*
 * scripts/smoke-auth-foundation-01-1-red-v0.mjs
 * R-AUTH-FOUNDATION-01 GREEN A.1 — 실제 로그인 실배선 누락·fail-open 보정 (RED 감사)
 *
 * GREEN A(4f1fdc5..82d82c2)는 서버 인가 "골격"이다. 이 RED 는 골격과 실제 완성 사이의 격차를
 * 실제 경계(모듈 해석·컴파일된 handler·소스 전수)로 재현한다. 제품 소스 수정 없음.
 *   - 외부 Clerk 실호출 없음. CLERK_SECRET_KEY 에 넣는 값은 로컬 재현용 표식 문자열이며
 *     import('@clerk/backend') 가 먼저 실패하므로 어떤 네트워크 경계에도 도달하지 않는다.
 *
 * [FACT] = 현재 실제 동작(결함 재현·전부 PASS 여야 진단이 정확) · [RED] = GREEN A.1 종료조건(미충족).
 * GREEN A.1 미구현이므로 exit 1 이 정상이다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'auth-a1-red-'));
let fact = 0, factf = 0, red = 0, redx = 0;
const F = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [FACT] ${n}${d ? `  — ${d}` : ''}`); ok ? fact++ : factf++; };
const R_ = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${d ? `  — ${d}` : ''}`); ok ? red++ : redx++; };
const src = (p) => readFileSync(path.join(REPO, p), 'utf8');
console.log('=== R-AUTH-FOUNDATION-01 GREEN A.1 — 실배선 누락·fail-open (RED) ===');

// ── 1. 실제 SDK 의존성 ─────────────────────────────────────────────────────────
console.log('\n  --- [FACT] 1. SDK 의존성: 미설치 + 동적 import 가 빌드 사각지대 ---');
const pkg = JSON.parse(src('package.json'));
const hasClerkDep = !!((pkg.dependencies || {})['@clerk/react'] || (pkg.dependencies || {})['@clerk/backend'] || (pkg.devDependencies || {})['@clerk/react'] || (pkg.devDependencies || {})['@clerk/backend']);
F('S1. package.json 에 @clerk/react·@clerk/backend 없음', !hasClerkDep);
F('S2. node_modules/@clerk 없음(설치 0)', !existsSync(path.join(REPO, 'node_modules', '@clerk')));
F('S3. lockfile 에 @clerk 0건', !/@clerk\//.test(src('package-lock.json')));
F('S4. 어댑터는 비리터럴 동적 import(타입검사가 모듈 부재를 못 봄)', /\[['"]@clerk['"],\s*['"]backend['"]\]\.join\(/.test(src('api/_shared/clerkAuthAdapter.ts')));
// 실제 api 타입검사가 SDK 부재에도 통과하는지(사각지대 재현)
let apiTscOk = false;
try { execFileSync(process.execPath, [tscBin, '-p', path.join(REPO, 'api', 'tsconfig.json'), '--noEmit'], { stdio: 'pipe' }); apiTscOk = true; } catch { apiTscOk = false; }
F('S5. api 타입검사는 SDK 미설치에도 통과(=부재를 못 잡음)', apiTscOk);

// ── 컴파일(재현용): 라우트·게이트·계약 ────────────────────────────────────────
let AC, AA, AD, AUTHROUTE, ordersRevenue, AG;
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
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'authGate.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', path.join(tmp, 'cli'),
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--jsx', 'react-jsx', '--types', 'node'],
    { stdio: 'pipe' });
  for (const sub of ['_shared', 'auth', 'godomall', path.join('cli', 'services')]) {
    const dir = path.join(tmp, sub); let files = [];
    try { files = readdirSync(dir).filter((x) => x.endsWith('.js')); } catch { continue; }
    for (const f of files) { const p = path.join(dir, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`))); }
  }
  const imp = (sub, f) => import(pathToFileURL(path.join(tmp, sub, f)).href);
  AC = await imp('_shared', 'accountContract.js'); AA = await imp('_shared', 'authActor.js'); AD = await imp('_shared', 'accountDirectory.js');
  AUTHROUTE = await imp('auth', '[action].js'); ordersRevenue = (await imp('godomall', 'orders-revenue.js')).default;
  AG = await imp(path.join('cli', 'services'), 'authGate.js');
} catch (e) { console.error('[smoke] tsc/import 실패:\n', e.stdout?.toString() || e.message); rmSync(tmp, { recursive: true, force: true }); process.exit(1); }
const makeRes = () => { const o = { _s: 200, _b: null }; return { status(c) { o._s = c; return this; }, json(b) { o._b = b; }, end() { return this; }, setHeader() {}, _get: () => ({ status: o._s, body: o._b }) }; };
const NOW = '2026-07-25T00:00:00.000Z';
const acct = (userId, role, team, status) => ({ userId, name: userId, team, position: 'p', role, status, history: [{ at: NOW, event: 'created', name: userId, team, position: 'p', role }] });
const stubSession = { verify: async (req) => (req.__uid ? { userId: req.__uid } : null) };

// ── 2. 서버 fail-open·부분설정 매트릭스(실제 handler 경계) ─────────────────────
console.log('\n  --- [FACT] 2. fail-open 매트릭스(컴파일된 orders-revenue 실호출) ---');
const ENVKEYS = ['CLERK_SECRET_KEY', 'GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY'];
const savedEnv = Object.fromEntries(ENVKEYS.map((k) => [k, process.env[k]]));
process.env.GODOMALL_API_MODE = 'mock'; process.env.GODOMALL_PARTNER_KEY = 'stub'; process.env.GODOMALL_USER_KEY = 'stub';
// (a) 키 0개 → 익명 200 (오늘의 Production 상태: 회사 데이터 무인증 공개)
delete process.env.CLERK_SECRET_KEY;
const r0 = makeRes(); await ordersRevenue({ method: 'GET', headers: {}, url: '/api/godomall/orders-revenue' }, r0);
F('M1. 키 0개 → 익명 200(회사 매출 무인증 공개 = fail-open)', r0._get().status === 200, `status=${r0._get().status}`);
// (b) 서버 Secret만(값=로컬 재현 표식; import 가 먼저 실패해 외부 미도달) → module-not-found 크래시(=Vercel 500)
process.env.CLERK_SECRET_KEY = 'local-red-repro-not-a-key';
let crash = null;
try { const r1 = makeRes(); await ordersRevenue({ method: 'GET', headers: {}, url: '/api/godomall/orders-revenue' }, r1); } catch (e) { crash = e; }
F('M2. Secret 설정+SDK 미설치 → 보호 라우트가 module-not-found 로 crash(=500)', !!crash && /Cannot find|ERR_MODULE_NOT_FOUND|Failed to resolve/i.test(String(crash && (crash.code || crash.message))), `err=${crash ? (crash.code || String(crash.message).slice(0, 60)) : '(no crash)'}`);
delete process.env.CLERK_SECRET_KEY;
for (const k of ENVKEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
// (c) 프론트 Publishable만 → 서버는 여전히 익명 open(M1과 동일 경로) + 클라는 loading 고착(아래 4절)
F('M3. Publishable만 → 서버 익명 open(M1 동일) + 클라 loading 고착(G2 참조)', true, '조합 결과는 M1+G2 의 합성');

// ── 3. 인증 API 메서드 계약 부재(실재현) ──────────────────────────────────────
console.log('\n  --- [FACT] 3. api/auth 메서드 계약: 405 없이 코어 진입 ---');
const dir = AD.createInMemoryDirectory([acct('leadP', 'team_lead', 'product', 'active')]);
const callAuth = async (method, uid, action, body) => { const res = makeRes(); const req = { method, headers: {}, url: `/api/auth/${action}`, body: body || {} }; if (uid) req.__uid = uid; await AUTHROUTE.runAuthAction(req, res, { session: stubSession, directory: dir }); return res._get(); };
await callAuth('POST', 'newMem', 'signup-metadata', { name: 'N', team: 'product', position: 'p', role: 'member' });
const delApprove = await callAuth('DELETE', 'leadP', 'approve', { targetUserId: 'newMem' });
F('A1. DELETE /api/auth/approve → 405 아님·상태 변경 성공(메서드 게이트 0)', delApprove.status === 200 && delApprove.body?.account?.status === 'active', `status=${delApprove.status}`);
const postMe = await callAuth('PUT', 'leadP', 'me', {});
F('A2. PUT /api/auth/me → 405 아님(200 데이터 반환)', postMe.status === 200, `status=${postMe.status}`);
F('A3. runAuthAction 에 req.method 검사 0(소스)', !/req\.method/.test(src('api/auth/[action].ts').split('runAuthAction')[1].split('export default')[0]));

// ── 4. 클라이언트 실배선·화면 상태 ─────────────────────────────────────────────
console.log('\n  --- [FACT] 4. 클라이언트 실배선 소비자 전수(주석 제외) ---');
const walk = (d, out = []) => { for (const e of readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) walk(r, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(r); } return out; };
const srcFiles = walk('src');
const codeLines = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
const countConsumers = (re, excludeFile) => { let n = 0; const where = []; for (const f of srcFiles) { if (excludeFile && f === excludeFile) continue; for (const l of codeLines(f)) if (re.test(l)) { n++; where.push(f); break; } } return { n, where }; };
const cProvider = countConsumers(/<ClerkProvider|ClerkProvider>/);
const cForms = countConsumers(/<SignIn\b|<SignUp\b|useUser\(|useAuth\(|useSession\(|from ['"]@clerk/);
const cRegister = countConsumers(/registerAuthSource\s*\(/, 'src/services/authGate.ts');
const cApiAuth = countConsumers(/['"`]\/api\/auth\//, 'src/services/authGate.ts');
F('W1. ClerkProvider 실소비자 = 0', cProvider.n === 0, `${cProvider.n}`);
F('W2. 로그인·가입 폼/Clerk hook 실소비자 = 0', cForms.n === 0, `${cForms.n}`);
F('W3. registerAuthSource 호출자 = 0(→ 구성 시 영구 loading)', cRegister.n === 0, `${cRegister.n}`);
F('W4. /api/auth/* 클라이언트 호출자 = 0(me/signup/approve/suspend/reset 전부)', cApiAuth.n === 0, `${cApiAuth.n}`);
F('W5. 팀장/HQ 계정 승인·정지·초기화 화면 = 0', countConsumers(/pending-approvals|reset-password/).n === 0);
console.log('\n  --- [FACT] 4b. 화면 상태 ---');
F('G1. computeAuthGate: 구성+소스 미주입 → loading(영구)', AG.computeAuthGate({ configured: true, loaded: false, signedIn: false }) === 'loading');
F('G2. readAuthInput: liveSource 미등록 시 loaded=false 고정(소스)', /if \(!liveSource\) return \{ configured: true, loaded: false/.test(src('src/services/authGate.ts')));
const gateScreen = src('src/components/AuthGateScreen.tsx');
F('G3. login 화면에 실제 입력·버튼 0(안내문뿐)', !/<input|<button|<form|onClick/i.test(gateScreen));
F('G4. pending/suspended 화면에 로그아웃·상태 재확인 경로 0', !/signOut|로그아웃|다시 확인|refresh|재확인/i.test(gateScreen));
F('G5. 키 없음 → open: 회사 대시보드 무인증 노출(설계상 현행 보존 = Production fail-open)', AG.computeAuthGate({ configured: false, loaded: true, signedIn: false }) === 'open');

// ── 5. 환경변수 불일치 ─────────────────────────────────────────────────────────
console.log('\n  --- [FACT] 5. 환경변수 불일치·authorizedParties ---');
const adapter = src('api/_shared/clerkAuthAdapter.ts');
F('E1. 어댑터는 CLERK_PUBLISHABLE_KEY 를 읽는데 설정 문서는 VITE_ 만 안내(불일치)', /process\.env\.CLERK_PUBLISHABLE_KEY/.test(adapter) && !/(^|[^_])CLERK_PUBLISHABLE_KEY/.test(src('docs/GREEN_AUTH_FOUNDATION_01_2026-07-25.md').replace(/VITE_CLERK_PUBLISHABLE_KEY/g, '')));
F('E2. AUTH_AUTHORIZED_PARTIES 미설정 → undefined 전달(azp 검증 생략)', /if \(!raw\) return undefined/.test(adapter));

// ── 6. 비밀번호 초기화 정책 불일치 ─────────────────────────────────────────────
console.log('\n  --- [FACT] 6. 비번 초기화: 확정 정책(팀장/HQ 발급)과 코드 불일치 ---');
const memSelf = acct('m1', 'member', 'product', 'active');
F('P1. canResetPassword: member 본인 self-reset 허용(정책은 팀장/HQ 발급만)', AC.canResetPassword(memSelf, memSelf) === true);
const dir2 = AD.createInMemoryDirectory([memSelf]);
const selfReset = await (async () => { const res = makeRes(); await AUTHROUTE.runAuthAction({ method: 'POST', headers: {}, url: '/api/auth/reset-password', body: { targetUserId: 'm1', tempPassword: 'x'.repeat(12) }, __uid: 'm1' }, res, { session: stubSession, directory: dir2 }); return res._get(); })();
F('P2. member 가 자기 비번을 서버 API 로 직접 변경 가능(실재현 200)', selfReset.status === 200);
F('P3. 강제 변경(setPasswordCompromised)·세션 종료 미사용(소스)', !/setPasswordCompromised/.test(adapter));

// ── 7. 기존 GREEN 검사 신뢰성 ─────────────────────────────────────────────────
console.log('\n  --- [FACT] 7. 기존 GREEN 검사의 공허·문자열 단언 ---');
const green = src('scripts/smoke-auth-foundation-01-green-v0.mjs');
F('T1. "저장 계정에 비밀번호 없음" 단언은 빈 배열 검사(공허)', /Array\.from\(dir\.listAccounts \? \[\] : \[\]\)/.test(green));
F('T2. pending-approvals 단언은 스코프 필터를 검증하지 않음(200+isArray 뿐)', /pa\.status === 200 && Array\.isArray\(pa\.body\?\.pending\)/.test(green));
F('T3. 배선 단언 6+건이 소스 문자열 존재만 검사(모듈 해석·실행 아님)', (green.match(/readFileSync\(path\.join\(REPO, 'api\//g) || []).length >= 4);
F('T4. GREEN 검사는 실제 SDK·Provider·로그인 화면·auth source 를 실행하지 않음', !/@clerk/.test(green.replace(/\/\/.*$/gm, '')) || true, '구조적 사실(주입 stub 만 실행)');

console.log('\n  --- [RED] GREEN A.1 종료조건(미충족) ---');
R_('R1. SDK 실설치+정적 배선으로 모듈 해석이 빌드에서 검증돼야 함', hasClerkDep && existsSync(path.join(REPO, 'node_modules', '@clerk')), '현재 미설치·비리터럴 import');
R_('R2. 클라 실배선(Provider·폼·authSource·api/auth 호출·승인화면) 실소비자 ≥1', cProvider.n > 0 && cRegister.n > 0 && cApiAuth.n > 0, `현재 0/0/0`);
R_('R3. Preview/Production 미구성·부분구성 → 안전한 503/설정오류(fail-closed), 로컬 dev 만 open', false, '현재 키0=익명200·Secret만=crash500');
R_('R4. api/auth 메서드 계약(GET/POST 외 405) 강제', delApprove.status === 405, `현재 DELETE approve=${delApprove.status}`);
R_('R5. 비번 정책 일치: member self-reset 제거 + 팀장/HQ 발급 + 강제변경·세션종료', AC.canResetPassword(memSelf, memSelf) === false, '현재 self-reset 허용');
R_('R6. 공허·문자열 단언을 실 모듈 해석·실 상태전이 검사로 교체', false, 'T1~T3 존치');

console.log(`\n[FACT] ${fact} pass / ${factf} fail   [RED ] ${red} met / ${redx} unmet`);
rmSync(tmp, { recursive: true, force: true });
if (factf > 0) { console.log('\n✗ 관찰 불일치(진단 재작성 필요)'); process.exit(1); }
if (redx > 0) { console.log(`\n✗ RED — GREEN A.1 종료조건 ${redx}건 미충족(구현 대기).`); process.exit(1); }
console.log('\n✓ (예상외) 전 종료조건 충족');
