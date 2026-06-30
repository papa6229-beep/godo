#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-postgres-activation-guide-v0.mjs
 * Marketing Behavior Postgres Activation Guide v0 검증(문서 전용 — 코드 변경 없음).
 *  - 활성화 가이드/체크리스트 존재·핵심 섹션·금지사항 유지·raw leak 원칙 재확인.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Behavior Postgres Activation Guide v0 smoke ===');

const GUIDE_REL = 'docs/MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md';
const CHECK_REL = 'docs/MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_CHECKLIST_V0.md';
const GUIDE = has(GUIDE_REL) ? read(GUIDE_REL) : '';
const CHECK = has(CHECK_REL) ? read(CHECK_REL) : '';
const ADAPTER_DOC = has('docs/MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md') ? read('docs/MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md') : '';
const SUMMARY_DOC = has('docs/MARKETING_BEHAVIOR_SUMMARY_LIVE_WIRING_V0.md') ? read('docs/MARKETING_BEHAVIOR_SUMMARY_LIVE_WIRING_V0.md') : '';
const ENV = has('.env.example') ? read('.env.example') : '';
const POST_ROUTE = read('api/marketing/[action].ts');

// 1~2. 존재
ok('1. activation guide 존재', has(GUIDE_REL));
ok('2. activation checklist 존재', has(CHECK_REL));

// 3~12. guide env/schema/redeploy/summary 확인
ok('3. GODO_BEHAVIOR_STORAGE_BACKEND=postgres 설명', /GODO_BEHAVIOR_STORAGE_BACKEND=postgres/.test(GUIDE));
ok('4. DATABASE_URL/POSTGRES_URL 설명', /DATABASE_URL/.test(GUIDE) && /POSTGRES_URL/.test(GUIDE));
ok('5. GODO_BEHAVIOR_ALLOWED_ORIGINS 설명', /GODO_BEHAVIOR_ALLOWED_ORIGINS/.test(GUIDE));
ok('6. wildcard origin 금지 설명', /wildcard|와일드카드/i.test(GUIDE) && /금지/.test(GUIDE));
ok('7. schema SQL 실행 절차', /(SQL을 DB 콘솔|schema)/.test(GUIDE) && /실행/.test(GUIDE));
ok('8. schema 문서 참조', /MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0/.test(GUIDE));
ok('9. 재배포 필요 설명', /재배포|redeploy/i.test(GUIDE));
ok('10. GET behavior-summary 확인 설명', /\/api\/marketing\/behavior-summary/.test(GUIDE));
ok('11. storage.backend postgres 확인 기준', /storage\.backend/.test(GUIDE) && /postgres/.test(GUIDE));
ok('12. persistentReady true 확인 기준', /persistentReady/.test(GUIDE) && /true/.test(GUIDE));

// 13~22. safe POST / 확인 / 실패 대응
ok('13. safe POST test event 예시(curl)', /curl/.test(GUIDE) && /\/api\/marketing\/behavior-events/.test(GUIDE));
ok('14. safe POST 예시에 forbidden PII key 없음', !/"(?:email|phone|name|address|orderNo|memberKey|customerName|rawSessionId|rawUserId|contact)"\s*:/.test(GUIDE));
ok('15. safe POST 예시에 raw searchTerm key 없음', !/"searchTerm"\s*:/.test(GUIDE));
ok('16. eventId 유니크 변경 안내', /eventId/.test(GUIDE) && /유니크/.test(GUIDE));
ok('17. Origin allowlist 403 가능성', /403/.test(GUIDE) && /(Origin|allowlist)/.test(GUIDE));
ok('18. table 미생성/권한/SSL 실패 대응', /table 미생성/.test(GUIDE) && /(권한|SSL)/.test(GUIDE));
ok('19. hasLiveData true 확인', /hasLiveData/.test(GUIDE) && /true/.test(GUIDE));
ok('20. raw event 미노출 설명', /raw event/.test(GUIDE) && /없/.test(GUIDE));
ok('21. sessionIdHash/orderIdHash/eventId response 미노출', /sessionIdHash/.test(GUIDE) && /orderIdHash/.test(GUIDE) && /eventId/.test(GUIDE) && /없/.test(GUIDE));
ok('22. cleanup SQL 선택 수동 작업', /cleanup/i.test(GUIDE) && /(수동|DB 콘솔)/.test(GUIDE) && /DELETE/.test(GUIDE));

// 23~27. checklist 섹션
ok('23. checklist DB 준비 섹션', /DB 준비/.test(CHECK));
ok('24. checklist Vercel env 섹션', /Vercel env/.test(CHECK));
ok('25. checklist Schema 섹션', /Schema/.test(CHECK));
ok('26. checklist API 확인 섹션', /API 확인/.test(CHECK));
ok('27. checklist UI 확인 섹션', /UI 확인/.test(CHECK));

// 28~30. 기존 문서/env 참조
ok('28. adapter 문서가 activation guide 참조', /ACTIVATION_GUIDE_V0/.test(ADAPTER_DOC));
ok('29. summary 문서가 activation guide 참조', /ACTIVATION_GUIDE_V0/.test(SUMMARY_DOC));
ok('30. .env.example에 storage backend/env 키', /GODO_BEHAVIOR_STORAGE_BACKEND/.test(ENV) && /(DATABASE_URL|POSTGRES_URL)/.test(ENV));

// 31. 실제 secret 값 없음(문서/env)
ok('31. 실제 secret(connection string) 없음', !/postgres(ql)?:\/\/[A-Za-z0-9_.\-]+:[^@\s]+@/.test(GUIDE + CHECK + ENV));

// 32. GET behavior-events route 미생성(POST 전용 유지)
ok('32. GET /behavior-events 미생성(POST 전용 유지)', /method !== 'POST'/.test(POST_ROUTE) && !/method === 'GET'/.test(POST_ROUTE));

// 33~40. 코드 무변경(docs 전용) — git 기준 src/api 변경 없음
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
ok('33. raw event dump API 미생성(api 변경 없음)', codeChanged.length === 0);
ok('34. tracker 자동 전송 기본값 미변경(코드 무변경)', codeChanged.length === 0);
ok('35. 고도몰 스킨 삽입 코드 없음(코드 무변경)', codeChanged.length === 0);
ok('36. GA4/GTM 연결 없음(코드 무변경)', codeChanged.length === 0);
ok('37. 광고 API 연결 없음(코드 무변경)', codeChanged.length === 0);
ok('38. 고도몰 WRITE 없음(코드 무변경)', codeChanged.length === 0);
ok('39. CS/상품관리/운영일지 파일 변경 없음', codeChanged.length === 0);
ok('40. api route 코드 미변경(docs 전용)', codeChanged.length === 0);
if (codeChanged.length > 0) console.log('     변경된 코드 파일:', codeChanged.join(', '));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
