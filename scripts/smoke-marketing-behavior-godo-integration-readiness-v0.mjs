#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-godo-integration-readiness-v0.mjs
 * Marketing Behavior Godo Integration Readiness v0 검증(문서 전용 — 코드 변경 없음).
 *  - readiness/installation/shop-switch 문서 존재·핵심 섹션·금지/PII/origin 원칙·코드 무변경.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Behavior Godo Integration Readiness v0 smoke ===');

const R_REL = 'docs/MARKETING_BEHAVIOR_GODO_INTEGRATION_READINESS_V0.md';
const C_REL = 'docs/MARKETING_BEHAVIOR_GODO_INSTALLATION_CHECKLIST_V0.md';
const S_REL = 'docs/MARKETING_BEHAVIOR_SHOP_SWITCH_RUNBOOK_V0.md';
const R = has(R_REL) ? read(R_REL) : '';
const C = has(C_REL) ? read(C_REL) : '';
const S = has(S_REL) ? read(S_REL) : '';
const ACT = has('docs/MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md') ? read('docs/MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md') : '';
const POST_ROUTE = read('api/marketing/[action].ts');
const NEW_DOCS = R + '\n' + C + '\n' + S;

// 1~3. 존재
ok('1. readiness 문서 존재', has(R_REL));
ok('2. installation checklist 존재', has(C_REL));
ok('3. shop switch runbook 존재', has(S_REL));

// 4~20. readiness 내용
ok('4. 테스트몰 설명', /테스트몰/.test(R));
ok('5. 새 고도몰 전환 가능성', /새 고도몰|새 쇼핑몰/.test(R));
ok('6. 12월 오픈 전 사전 준비', /12월/.test(R) && /(오픈|준비)/.test(R));
ok('7. 실제 고객/광고/주문 없음', /실제 고객/.test(R) && /광고/.test(R) && /주문/.test(R) && /없/.test(R));
ok('8. 현재 배관 사슬 설명', /behavior-events/.test(R) && /behavior-summary/.test(R) && /tracker/.test(R));
ok('9. Ready-to-Install 상태', /Ready-to-Install/.test(R));
ok('10. Live Collection Not Started', /Live Collection Not Started/.test(R));
ok('11. 시나리오 A(테스트몰 운영몰 전환)', /시나리오 A/.test(R));
ok('12. 시나리오 B(새 쇼핑몰 전환)', /시나리오 B/.test(R));
ok('13. 바뀌는 것/안 바뀌는 것 표', /바뀔 수 있는 것/.test(R) && /안 바뀌는 것/.test(R));
ok('14. 실제 연결 순서', /실제 연결 순서/.test(R));
ok('15. 고도몰 스킨 삽입 개념', /스킨 삽입/.test(R) && /공통/.test(R));
ok('16. data-godo-track 예시', /data-godo-track/.test(R));
ok('17. banner/category/product/cart/checkout/purchase 속성 예시',
  ['banner', 'category', 'product', 'cart', 'checkout'].every((t) => R.includes(`data-godo-track="${t}"`)) && /purchase/.test(R));
ok('18. 페이지별 eventName 기준 표', /eventName/.test(R) && /landing/.test(R) && /add_to_cart/.test(R) && /checkout_start/.test(R));
ok('19. rollback/비활성화 방법', /(Rollback|비활성화)/.test(R) && /dev_buffer fallback/.test(R));
ok('20. 12월 오픈 전 체크포인트', /체크포인트|권장 준비 흐름/.test(R) && /12월/.test(R));

// 21~27. checklist 섹션
ok('21. 운영몰 결정 섹션', /운영몰 결정/.test(C));
ok('22. Godomall API 섹션', /Godomall API/.test(C));
ok('23. Postgres 섹션', /Postgres/.test(C));
ok('24. Origin 섹션', /Origin/.test(C));
ok('25. Skin/tracker 섹션', /Skin\s*\/\s*tracker|tracker/.test(C) && /스킨/.test(C));
ok('26. DOM tracking 섹션', /DOM tracking/.test(C));
ok('27. 검수 섹션', /검수/.test(C));

// 28~32. runbook
ok('28. runbook 시나리오 A', /시나리오 A/.test(S));
ok('29. runbook 시나리오 B', /시나리오 B/.test(S));
ok('30. GODOMALL_* env 교체 설명', /GODOMALL_\*/.test(S) && /교체/.test(S));
ok('31. allowed origin 교체 설명', /GODO_BEHAVIOR_ALLOWED_ORIGINS/.test(S));
ok('32. shopId 설명', /shopId/.test(S));

// 33. 기존 문서가 readiness 참조
ok('33. 기존 문서가 readiness 참조', /MARKETING_BEHAVIOR_GODO_INTEGRATION_READINESS_V0/.test(ACT));

// 34~37. 실제 접속/실행 지시 아님
ok('34. 실제 Vercel 접속 명령 없음', !/vercel\s+(login|deploy|env\s+(add|pull|rm))/i.test(NEW_DOCS));
ok('35. 실제 env 값(connection string) 없음', !/(DATABASE_URL|POSTGRES_URL)\s*=\s*postgres(ql)?:\/\/\S/.test(NEW_DOCS));
ok('36. 실제 DB 접속 명령 아님', !/psql\s+(-h|postgres(ql)?:\/\/)/i.test(NEW_DOCS));
ok('37. SQL 실행은 사용자 추후 직접 절차', /schema SQL/.test(R + C) && /(직접|실행)/.test(R + C));

// 38~46. 코드 무변경(git)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
ok('38. api route 코드 변경 없음', codeChanged.length === 0);
ok('39. tracker 자동 전송 기본값 변경 없음', codeChanged.length === 0);
ok('40. 고도몰 스킨 실제 삽입 코드 없음', codeChanged.length === 0);
ok('41. GET /behavior-events 미생성(POST 전용)', /method !== 'POST'/.test(POST_ROUTE) && !/method === 'GET'/.test(POST_ROUTE) && codeChanged.length === 0);
ok('42. raw event dump API 미생성', codeChanged.length === 0);
ok('43. GA4/GTM 연결 없음', codeChanged.length === 0);
ok('44. 광고 API 연결 없음', codeChanged.length === 0);
ok('45. 고도몰 WRITE 없음', codeChanged.length === 0);
ok('46. CS/상품관리/운영일지 변경 없음', codeChanged.length === 0);
if (codeChanged.length > 0) console.log('     변경된 코드 파일:', codeChanged.join(', '));

// 47~48. 원칙
ok('47. PII 금지 원칙 문서에 있음', /PII/.test(NEW_DOCS) && /금지/.test(NEW_DOCS));
ok('48. wildcard origin 금지 원칙 문서에 있음', /wildcard/i.test(NEW_DOCS) && /금지/.test(NEW_DOCS));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
