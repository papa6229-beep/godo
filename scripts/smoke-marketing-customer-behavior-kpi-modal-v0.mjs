#!/usr/bin/env node
/*
 * scripts/smoke-marketing-customer-behavior-kpi-modal-v0.mjs
 * Marketing Customer Behavior KPI & Modal UX — v0.1 (운영자 친화 개편) 검증.
 *  - 상단 KPI "고객 행동 분석" 클릭형 카드 유지(role/button/tabIndex/onKeyDown/hover/focus)
 *  - modal 메인 = 쉬운 말 4섹션: 외부 유입 / 내부 이동 경로 / 많이 클릭한 영역 / 이탈 지점
 *  - 데이터 정책 전환(작업지시 승인): "데모 예시" 수치 허용 — 단 "데모 예시" 배지 필수 표기
 *  - 기술 용어(GA4/GTM/page_view/view_item 등)는 메인 미노출 → 하단 접힘 "데이터 연결 상태"에서만
 *  - PII 없음. WRITE/고도몰 API 변경 없음. CS/상품/운영 무변경.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Customer Behavior KPI & Modal UX v0.1 smoke ===');

const DASH = read('src/components/MarketingAnalysisDashboard.tsx');
const DASH_CSS = read('src/components/MarketingAnalysisDashboard.css');
const MODAL = read('src/components/MarketingCustomerBehaviorModal.tsx');
const EVENTS = read('src/services/marketingCustomerBehaviorEvents.ts');
const BEHAVIOR = MODAL + '\n' + EVENTS;
// Data Contract v0 이후: 데모 수치는 모달이 아니라 서비스(insights/demoData)에 있다.
const DEMOSRC = read('src/services/marketingBehaviorDemoData.ts');

// modal 메인 영역 = 하단 접힘(<details mcb-tech>) 이전. 기술 용어 메인 미노출 확인용.
const techIdx = MODAL.indexOf('<details');
const MAIN = techIdx >= 0 ? MODAL.slice(0, techIdx) : MODAL;
const TECH = techIdx >= 0 ? MODAL.slice(techIdx) : '';

// 상단 KPI compact 그리드 블록(KPI 카드 유지 검증).
const gridStart = DASH.indexOf('marketing-kpi-compact-grid');
const gridEnd = DASH.indexOf('메인 비교 그래프', gridStart);
const gridBlock = gridStart >= 0 && gridEnd > gridStart ? DASH.slice(gridStart, gridEnd) : '';

// ── 대시보드 KPI 카드 유지(회귀 없음) ──
ok('1. 대시보드에 "고객 행동 분석" 존재', DASH.includes('고객 행동 분석'));
ok('2. 상단 KPI 그리드에 compare/첫구매vs재구매 없음(이동 유지)',
  gridBlock.length > 0 && !gridBlock.includes('mkt-kpi-compare') && !gridBlock.includes('첫구매 vs 재구매'));
ok('3. 하단 "신규/재구매 고객 비교" 카드 유지', DASH.includes('신규/재구매 고객 비교') && DASH.includes('mkt-first-repeat-card'));
ok('4. 고객 행동 분석 KPI 클릭 구조 유지(role=button/tabIndex/onKeyDown/onClick/aria)',
  gridBlock.includes('mkt-kpi-behavior') && /role="button"/.test(gridBlock) && /tabIndex=\{0\}/.test(gridBlock)
  && /onKeyDown=/.test(gridBlock) && /onClick=/.test(gridBlock) && /aria-label=/.test(gridBlock));
ok('5. behavior 카드 hover/focus 스타일 유지', /\.mkt-kpi-behavior:hover/.test(DASH_CSS) && /focus-visible/.test(DASH_CSS) && /cursor:\s*pointer/.test(DASH_CSS));
ok('6. KPI 카드 Not connected 상태 유지', DASH.includes('Not connected'));

// ── modal v0.1: 데모 배지 + 쉬운 말 4섹션 ──
ok('7. modal title "고객 행동 분석"', /id="mcb-title"[^>]*>고객 행동 분석</.test(MODAL));
ok('8. "데모 예시" 배지 컴포넌트 + 표기(데이터 정책)', /mcb-demo-badge/.test(MODAL) && /데모 예시/.test(MODAL));
ok('9. 데모 면책 문구(실데이터 아님 명시)', /실제 손님 데이터가 아니|데모 예시.*가상값|가상값.*데모/.test(MODAL));

// 수치는 모달이 아니라 insights/demoData에서 옴 → 섹션 타이틀+렌더 바인딩은 MAIN, 데모 채널/지점 리터럴은 DEMOSRC에서 확인.
ok('10. [외부 유입] 섹션 + topSources 렌더 + 데모 채널(서비스)', /외부 유입 경로/.test(MAIN) && /topSources/.test(MAIN) && ['블로그', '검색', '광고', 'SNS', '직접 방문'].every((c) => DEMOSRC.includes(c)));
ok('11. [내부 이동 경로] 섹션 + 순위/경로/비중 표', /많이 이동한 경로/.test(MAIN) && /mcb-path-table/.test(MAIN) && MAIN.includes('순위') && MAIN.includes('이동 경로') && MAIN.includes('비중'));
ok('12. [많이 클릭한 영역] 섹션 + 배너/카테고리/상품 TOP', /많이 클릭한 영역/.test(MAIN) && ['배너 TOP', '카테고리 TOP', '상품 TOP'].every((g) => MAIN.includes(g)));
ok('13. [이탈이 많은 지점] 섹션 + dropOffs 렌더', /이탈이 많은 지점/.test(MAIN) && /dropOffs/.test(MAIN) && DEMOSRC.includes('메인페이지'));

// ── 기술 용어 숨김(메인 미노출 → 접힘 영역/이벤트 정의에만) ──
const TECH_TERMS = ['GA4', 'GTM', 'page_view', 'landing_view', 'banner_click', 'view_item', 'add_to_cart', 'category_view'];
ok('14. 기술 용어 메인 화면 미노출', TECH_TERMS.every((t) => !MAIN.includes(t)));
ok('15. 하단 접힘 "데이터 연결 상태" 영역 존재(<details>)', /<details[^>]*mcb-tech/.test(MODAL) && /데이터 연결 상태 보기/.test(TECH));
ok('16. 기술 추적 정의는 이벤트 파일/연결상태에 유지(연속성)', ['page_view', 'view_item', 'add_to_cart', 'begin_checkout'].every((t) => BEHAVIOR.includes(t)));
ok('17. 연결 상태 쉬운 라벨(방문/클릭/상품 조회/검색/장바구니/구매 추적)', /easyLabel/.test(EVENTS) && /추적/.test(TECH));

// ── 안전/불변식 ──
ok('18. 오해 소지 문구 없음(실시간/실제 방문자 수 단정 없음)', !/실시간 데이터|실제 방문자 수|실제 클릭 수/.test(MODAL));
ok('19. behavior에 PII 필드 문자열 없음',
  !/customerName|ordererName|receiverName|receiverPhone|receiverAddress|memberKey|orderNo\b|\bphone\b|\bemail\b|\baddress\b|\bcontact\b/.test(BEHAVIOR));
ok('20. modal에 fetch/localStorage/WRITE 없음', !/fetch\(|localStorage|api\/order|writeOrder|method:\s*'(POST|PUT|DELETE)'/i.test(MODAL));

// ── git: WRITE/API 무변경 + 마케팅 한정 ──
let changed = [];
try {
  changed = execSync('git status --porcelain', { cwd: REPO }).toString()
    .split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean);
} catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
ok('21. 고도몰 API(api/) 변경 없음', codeChanged.every((f) => !f.startsWith('api/')));
const nonMarketing = codeChanged.filter((f) => !/Marketing|marketing|charts\//.test(f));
ok('22. src 변경 마케팅 한정(CS/Product/Operation 무변경)', nonMarketing.length === 0);
if (nonMarketing.length > 0) console.log('     변경된 비마케팅 파일:', nonMarketing.join(', '));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
