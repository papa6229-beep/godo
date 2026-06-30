#!/usr/bin/env node
/*
 * scripts/smoke-marketing-customer-behavior-kpi-modal-v0.mjs
 * Marketing Customer Behavior KPI & Modal UX v0 검증.
 *  - 상단 KPI 4번째 = 클릭형 "고객 행동 분석" 카드(role/button/tabIndex/onKeyDown/hover/focus)
 *  - 클릭 시 고객 행동 분석 modal(GA4/GTM 미연결 · 8 추적 이벤트 · 퍼널 · 인기클릭 placeholder · 체크리스트)
 *  - 기존 "첫구매 vs 재구매 객단가"는 상단 KPI에서 제거, 하단 "신규/재구매 고객 비교"로 이동(삭제 아님)
 *  - fake 방문/클릭/이탈/전환/ROAS/CPA/CTR 수치 없음. PII 없음. WRITE/고도몰 API 변경 없음. CS/상품/운영 무변경.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Customer Behavior KPI & Modal UX v0 smoke ===');

const DASH = read('src/components/MarketingAnalysisDashboard.tsx');
const DASH_CSS = read('src/components/MarketingAnalysisDashboard.css');
const MODAL = read('src/components/MarketingCustomerBehaviorModal.tsx');
const EVENTS = read('src/services/marketingCustomerBehaviorEvents.ts');
// 모달은 이벤트 정의 파일을 import해 렌더 → 이벤트/노출 검사는 결합 소스 기준.
const BEHAVIOR = MODAL + '\n' + EVENTS;

// 상단 KPI compact 그리드 블록만 추출(그리드 시작 → 다음 "메인 비교 그래프" 주석 직전).
const gridStart = DASH.indexOf('marketing-kpi-compact-grid');
const gridEnd = DASH.indexOf('메인 비교 그래프', gridStart);
const gridBlock = gridStart >= 0 && gridEnd > gridStart ? DASH.slice(gridStart, gridEnd) : '';

// 1. "고객 행동 분석" 텍스트 존재
ok('1. 대시보드에 "고객 행동 분석" 존재', DASH.includes('고객 행동 분석'));

// 2. 상단 KPI 그리드에서 "첫구매 vs 재구매 객단가"/compare 카드 제거
ok('2. 상단 KPI 그리드에 첫구매 vs 재구매 객단가/compare 카드 없음(이동됨)',
  gridBlock.length > 0 && !gridBlock.includes('mkt-kpi-compare') && !gridBlock.includes('첫구매 vs 재구매'));

// 3. 하단 "신규/재구매 고객 비교" 카드 존재
ok('3. 하단 "신규/재구매 고객 비교" 카드 존재',
  DASH.includes('신규/재구매 고객 비교') && DASH.includes('mkt-first-repeat-card')
  && DASH.includes('첫구매 객단가') && DASH.includes('재구매 매출 비중'));

// 4. 고객 행동 분석 KPI = 클릭 가능 구조(role/button/tabIndex/onKeyDown)
ok('4. 고객 행동 분석 KPI 클릭 구조(role=button/tabIndex/onKeyDown/onClick)',
  gridBlock.includes('mkt-kpi-behavior') && /role="button"/.test(gridBlock)
  && /tabIndex=\{0\}/.test(gridBlock) && /onKeyDown=/.test(gridBlock) && /onClick=/.test(gridBlock)
  && /aria-label=/.test(gridBlock) && /(Enter|' ')/.test(gridBlock));

// 5. hover/focus 관련 class 존재(CSS)
ok('5. behavior 카드 hover/focus 스타일 존재',
  /\.mkt-kpi-behavior\s*\{/.test(DASH_CSS) && /\.mkt-kpi-behavior:hover/.test(DASH_CSS)
  && /focus-visible/.test(DASH_CSS) && /cursor:\s*pointer/.test(DASH_CSS));

// 6. modal title "고객 행동 분석"
ok('6. modal title "고객 행동 분석" 존재', /id="mcb-title"[^>]*>고객 행동 분석</.test(MODAL) || MODAL.includes('>고객 행동 분석<'));

// 7. modal "Not connected" 또는 "미연결" 상태
ok('7. Not connected/미연결 상태 표시', (DASH.includes('Not connected')) && MODAL.includes('미연결'));

// 8. modal GA4 / GTM 상태
ok('8. modal에 GA4, GTM 상태', MODAL.includes('GA4') && MODAL.includes('GTM'));

// 9~13. 8개 추적 이벤트 핵심 노출(모달 + 이벤트 정의 파일)
ok('9. behavior에 page_view', BEHAVIOR.includes('page_view'));
ok('10. behavior에 banner_click', BEHAVIOR.includes('banner_click'));
ok('11. behavior에 view_item', BEHAVIOR.includes('view_item'));
ok('12. behavior에 add_to_cart', BEHAVIOR.includes('add_to_cart'));
ok('13. behavior에 begin_checkout 또는 purchase', BEHAVIOR.includes('begin_checkout') || BEHAVIOR.includes('purchase'));

// 14. fake visitor/click/conversion/ROAS/CPA/CTR 수치 없음(modal 행동 영역)
ok('14. fake 행동 수치/ROAS/CPA/CTR 없음',
  !/\bROAS\b|\bCPA\b|\bCTR\b/.test(BEHAVIOR)
  && !/방문자\s*[\d,]+/.test(BEHAVIOR)
  && !/클릭\s*[\d,]+\s*회/.test(BEHAVIOR)
  && !/전환율\s*[\d,]+/.test(BEHAVIOR)
  && !/이탈률\s*[\d,]+/.test(BEHAVIOR));

// 15. PII 위험 문자열 없음(신규 마케팅 UI = modal + 이벤트 정의)
ok('15. behavior에 PII 필드 문자열 없음',
  !/customerName|ordererName|receiverName|receiverPhone|receiverAddress|memberKey|orderNo\b|\bphone\b|\bemail\b|\baddress\b|\bcontact\b/.test(BEHAVIOR));

// 16~17. WRITE/고도몰 API 변경 없음 + CS/상품/운영 무변경 (git working tree 기준)
let changed = [];
try {
  changed = execSync('git status --porcelain', { cwd: REPO }).toString()
    .split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean);
} catch { /* git 없으면 스킵하지 않고 빈 배열 */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));

// 16. 고도몰 API route(api/) 변경 없음 + 신규 코드에 fetch/WRITE/localStorage 없음
ok('16. 고도몰 WRITE/API 변경 없음',
  codeChanged.every((f) => !f.startsWith('api/'))
  && !/fetch\(|localStorage|api\/order|writeOrder|method:\s*'(POST|PUT|DELETE)'/i.test(MODAL));

// 17. src 변경은 마케팅 관련 파일로 한정(CS/상품관리/운영일지 무변경)
const nonMarketing = codeChanged.filter((f) => !/Marketing|marketing|charts\//.test(f));
ok('17. src 변경 마케팅 한정(CS/Product/Operation 무변경)', nonMarketing.length === 0);
if (nonMarketing.length > 0) console.log('     변경된 비마케팅 파일:', nonMarketing.join(', '));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
