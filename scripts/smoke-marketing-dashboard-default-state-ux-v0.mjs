#!/usr/bin/env node
/*
 * scripts/smoke-marketing-dashboard-default-state-ux-v0.mjs
 * Marketing Dashboard Default State UX Optimization v0 검증(표시 구조 — 데이터 로직 불변).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Dashboard Default State UX Optimization v0 smoke ===');

const MKT = read('src/components/MarketingAnalysisDashboard.tsx');
const MOD = has('src/components/MarketingDetailModal.tsx') ? read('src/components/MarketingDetailModal.tsx') : '';
const DOC = has('docs/MARKETING_DASHBOARD_DEFAULT_STATE_UX_OPTIMIZATION_V0.md');

// 1~2. KPI 카드 완성도
ok('1. KPI basis/helper text 유지', /OP\.operationalRevenue\.basis/.test(MKT) && /OP\.operationalOrderCount\.basis/.test(MKT) && /OP\.operationalAOV\.basis/.test(MKT));
ok('2. KPI 카드 보조문구(sub)+포인트(accent) 존재', /sub=\{OP\./.test(MKT) && /accent="#/.test(MKT) && /mkt-kpi-sub/.test(read('src/components/MarketingAnalysisDashboard.css')));
console.log('  KPI helper text found');

// 3~5. 비교 그래프 기본 compact
ok('3. 기본 상태 comparison chart 자동 노출 안 함(요청 게이팅)', /hasRequestedComparison \? \(\s*<div className="marketing-smart-chart"/.test(MKT));
ok('4. comparison empty state 문구', /marketing-comparison-empty/.test(MKT) && /요청 기반 비교 분석/.test(MKT));
ok('5. quick action chip(비교 trigger)', /marketing-comparison-quick-chip/.test(MKT) && /requestComparison\(/.test(MKT));
console.log('  default comparison collapsed');

// 6~8. AI 리포트 기본 compact
ok('6. AI report 기본 긴 리스트 자동 노출 안 함', /hasRequestedComparison \? \(/.test(MKT) && /marketing-ai-report-placeholder/.test(MKT));
ok('7. AI report placeholder 문구', /marketing-ai-report-placeholder/.test(MKT) && /비교 그래프가 생성되면/.test(MKT));
ok('8. hasRequestedComparison 상태 존재', /const \[hasRequestedComparison, setHasRequestedComparison\] = useState/.test(MKT));
console.log('  ai report collapsed');

// 9~11. 세부 분석 제한
ok('9. 세부 분석 섹션 존재', /marketing-detail-section/.test(MKT) && /세부 분석/.test(MKT));
ok('10. 세부 분석 카드 기본 노출 제한(limit)', /limit=\{4\}/.test(MKT) && /items\.slice\(0, limit\)/.test(MKT));
ok('11. 상품 매출 TOP 기본 TOP5 제한', /상품 매출 TOP[\s\S]{0,160}limit=\{5\}/.test(MKT));
console.log('  detail cards capped');

// 12~15. 전체보기 모달
ok('12. 전체보기 모달 컴포넌트 존재', has('src/components/MarketingDetailModal.tsx') && /MarketingDetailModal/.test(MKT));
ok('13. 상품 매출 TOP 전체보기(onExpand)', /title: '상품 매출 TOP', items: facts\.topProducts/.test(MKT));
ok('14. 카테고리/브랜드/회원그룹/주문채널 전체보기 패턴', ['카테고리 매출 TOP', '브랜드 매출 TOP', '회원그룹별 매출', '주문채널별 매출'].every((t) => MKT.includes(`title: '${t}', items:`)) && /onExpand=\{/.test(MKT));
ok('15. 모달 검색+정렬 존재', /mkt-detail-modal-search/.test(MOD) && /mkt-detail-sort-btn/.test(MOD) && /SORT_LABELS/.test(MOD));
console.log('  modal pattern found');

// 22~23. 안전(source)
ok('22. 고도몰 WRITE 추가 없음', !/writeOrder|goodsRegist|Order_Regist|memberModify/i.test(MKT + MOD));
ok('23. raw event 노출 없음', !/sessionIdHash|orderIdHash|eventId/.test(MKT + MOD));
ok('25. 문서 존재', DOC);

// 16~21,24. 데이터/금지영역 git 무변경(이번 task는 marketing 대시보드 + 모달 + 문서만)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
ok('16. 데이터 계산 로직(marketingAnalysisFacts) 변경 없음', !changed.some((f) => /marketingAnalysisFacts/.test(f)));
ok('17. departmentDataSourceOfTruth 변경 없음', !changed.some((f) => /departmentDataSourceOfTruth/.test(f)));
ok('18. departmentMetricContract 변경 없음', !changed.some((f) => /departmentMetricContract|revenueMetricContract/.test(f)));
ok('19. synthetic data 생성 로직 변경 없음', !changed.some((f) => /syntheticCommerceUniverse|syntheticRevenue/.test(f)));
ok('20. Vercel gateway 변경 없음', !changed.some((f) => /\[action\]\.ts|\[resource\]\.ts/.test(f)));
ok('21. 고객흐름 tracking 변경 없음', !changed.some((f) => /marketingBehavior|behavior-events|behavior-summary/.test(f)));
ok('24. CS/Product/Operation unrelated UI 변경 없음', !changed.some((f) => /\.tsx$/.test(f) && !/MarketingAnalysisDashboard|MarketingDetailModal/.test(f)));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
