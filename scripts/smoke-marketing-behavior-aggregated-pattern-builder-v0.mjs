#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-aggregated-pattern-builder-v0.mjs
 * Marketing Behavior Aggregated Pattern Builder v0 검증.
 *  - aggregateMarketingBehaviorPatterns: events → 유입/경로/클릭/이탈/요약 패턴(deterministic).
 *  - 출력에 sessionIdHash/orderIdHash·PII 없음. purchase 세션은 dropOff 제외. range filter.
 *  - dashboard live wiring·모달 연결·DB/KV·고도몰 WRITE 없음.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Behavior Aggregated Pattern Builder v0 smoke ===');

const BUILDER_REL = 'src/services/marketingBehaviorAggregatedPatterns.ts';
const BUILDER = has(BUILDER_REL) ? read(BUILDER_REL) : '';
const DOC_REL = 'docs/MARKETING_BEHAVIOR_AGGREGATED_PATTERN_BUILDER_V0.md';
const DOC = has(DOC_REL) ? read(DOC_REL) : '';

// 1~17. 소스
ok('1. builder 파일 존재', has(BUILDER_REL));
ok('2. aggregateMarketingBehaviorPatterns 함수', /export function aggregateMarketingBehaviorPatterns\b/.test(BUILDER));
ok('3. MarketingBehaviorAggregatedPattern 타입', /export type MarketingBehaviorAggregatedPattern\b/.test(BUILDER));
ok('4. MarketingBehaviorPatternRange 타입', /export type MarketingBehaviorPatternRange\b/.test(BUILDER));
ok('5. convertAggregatedPatternToInsights 함수(optional)', /export function convertAggregatedPatternToInsights\b/.test(BUILDER));
ok('6. range filter 코드', /startDate/.test(BUILDER) && /endDate/.test(BUILDER) && /\.filter\(/.test(BUILDER));
ok('7. sessionIdHash grouping 코드', /sessionIdHash/.test(BUILDER) && /new Map/.test(BUILDER));
ok('8. occurredAt sorting 코드', /occurredAt/.test(BUILDER) && /localeCompare|sort\(/.test(BUILDER));
ok('9. source aggregation 코드', /sourceCounts/.test(BUILDER) && /topSources/.test(BUILDER));
ok('10. topPaths 계산 코드', /topPaths/.test(BUILDER) && /pathCounts/.test(BUILDER));
ok('11. topClicks banners 계산', /banner_click/.test(BUILDER) && /banners/.test(BUILDER));
ok('12. topClicks categories 계산', /category_click/.test(BUILDER) && /categories/.test(BUILDER));
ok('13. topClicks products 계산', /product_view/.test(BUILDER) && /products/.test(BUILDER));
ok('14. dropOffs 계산 코드', /dropOffs/.test(BUILDER) && /dropCounts/.test(BUILDER));
ok('15. summary 계산 코드', /summary/.test(BUILDER) && /topSourceLabel/.test(BUILDER));
ok('16. empty state 반환 코드', /emptyPattern/.test(BUILDER) && /isEmpty/.test(BUILDER));
ok('17. purchase를 dropOff에서 제외(정책 명시)', /eventName === 'purchase'/.test(BUILDER) && /제외/.test(BUILDER));

// 21~28. 문서/무변경
ok('21. builder 문서 존재', has(DOC_REL));
ok('22. dashboard live wiring 없음 명시', /(대시보드 live|dashboard live)/.test(DOC) && /없/.test(DOC));
ok('23. DB/KV 연결 없음 명시', /DB\/KV/.test(DOC) && /없/.test(DOC));
ok('24. 고도몰 스킨 삽입 없음 명시', /(고도몰 스킨|스킨 삽입)/.test(DOC) && /없/.test(DOC));
ok('25. 이탈 계산 정책 명시', /이탈 계산 정책/.test(DOC) && /purchase/.test(DOC) && /제외/.test(DOC));
ok('28. builder에 고도몰 WRITE/네트워크 없음', !/godomall|writeOrder|fetch\s*\(|api\/order/i.test(BUILDER));

let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
ok('26. 모달 live wiring 변경 없음', codeChanged.every((f) => !/MarketingCustomerBehaviorModal/.test(f)));
const forbiddenArea = codeChanged.filter((f) => /[Cc]ustomerService|ProductTeam|상품관리|[Oo]perationLog|운영|godomall\//.test(f) && !/[Bb]ehavior/.test(f));
ok('27. CS/상품관리/운영 파일 무변경', forbiddenArea.length === 0);

// ── 런타임: 집계 실증 + 출력 PII 부재 ────────────────────────────────────────
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-agg-'));
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'marketingBehaviorTypes.ts'),
    path.join(REPO, 'src', 'services', 'marketingBehaviorAggregatedPatterns.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const B = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorAggregatedPatterns.js')).href);

  const ev = (sid, hh, name, extra) => ({ eventId: `e_${sid}_${hh}`, sessionIdHash: `s_${sid}`, occurredAt: `2026-06-29T${String(hh).padStart(2, '0')}:00:00.000Z`, eventName: name, ...extra });
  const events = [
    ev('A', 9, 'visit', { source: 'blog' }), ev('A', 10, 'banner_click', { bannerName: '여름 기획전 배너' }), ev('A', 11, 'category_click', { categoryName: '신상품' }), ev('A', 12, 'product_view', { productName: '스위트 00 젤' }),
    ev('B', 9, 'visit', { source: 'search' }), ev('B', 10, 'search', { searchTerm: '젤' }), ev('B', 11, 'product_view', { productName: '에그 00' }),
    ev('C', 9, 'visit', { source: 'ad' }), ev('C', 10, 'banner_click', { bannerName: '신규 회원 쿠폰 배너' }), ev('C', 11, 'category_click', { categoryName: '젤/로션' }), ev('C', 12, 'purchase', { orderIdHash: 'oh_c' }),
    ev('D', 9, 'visit', { source: 'blog' }), ev('D', 10, 'category_click', { categoryName: '신상품' }), ev('D', 11, 'exit', { pageTitle: '메인페이지' })
  ];
  const p = B.aggregateMarketingBehaviorPatterns(events, { mode: 'live' });

  const blog = p.acquisition.topSources.find((s) => s.source === 'blog');
  ok('29. 유입 source 비중(blog 2세션)', blog && blog.sessions === 2 && p.acquisition.topSources.some((s) => s.source === 'search') && p.acquisition.topSources.some((s) => s.source === 'ad'));
  ok('30. top path 계산', p.paths.topPaths.length > 0 && p.paths.topPaths[0].pathLabels.length >= 2);
  ok('31. banner TOP 계산', p.clicks.banners.length === 2 && p.clicks.banners.some((b) => b.label === '여름 기획전 배너'));
  ok('32. category TOP 계산', p.clicks.categories.find((c) => c.label === '신상품')?.clicks === 2);
  ok('33. product TOP 계산', p.clicks.products.length === 2 && p.clicks.products.some((x) => x.label === '에그 00'));
  ok('34. product_view 종료 → 상품 상세 이탈', p.dropOffs.some((d) => d.label === '상품 상세 보기 후 이탈'));
  const dropSessions = p.dropOffs.reduce((a, d) => a + d.sessions, 0);
  ok('35. purchase 세션 dropOff 제외(이탈 세션=3, 카테고리 이탈 없음)', dropSessions === 3 && !p.dropOffs.some((d) => d.label === '카테고리 보기 후 이탈'));

  // range filter
  const ranged = B.aggregateMarketingBehaviorPatterns([...events, ev('Z', 9, 'visit', { source: 'sns' })].map((e) => e.sessionIdHash === 's_Z' ? { ...e, occurredAt: '2026-07-05T09:00:00.000Z' } : e), { range: { startDate: '2026-06-29T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z' } });
  ok('36. range filter 범위 밖 제외', !ranged.acquisition.topSources.some((s) => s.source === 'sns'));

  // empty
  const empty = B.aggregateMarketingBehaviorPatterns([]);
  ok('37. empty events → isEmpty true', empty.dataStatus.isEmpty === true && empty.dataStatus.mode === 'empty' && empty.acquisition.topSources.length === 0);

  // convert helper
  const ins = B.convertAggregatedPatternToInsights(p);
  ok('38. convert → Insights shape', !!ins.summaryCards && ins.dataStatus.isDemo === false && Array.isArray(ins.acquisition.topSources) && Array.isArray(ins.topPaths) && !!ins.topClicks.banners);

  // 18~20. 출력 PII/식별자 부재(stringify 스캔)
  const blob = JSON.stringify(p) + JSON.stringify(ins);
  ok('18. output에 sessionIdHash 없음', !blob.includes('sessionIdHash') && !blob.includes('s_A'));
  ok('19. output에 orderIdHash 없음', !blob.includes('orderIdHash') && !blob.includes('oh_c'));
  ok('20. output에 PII 필드 문자열 없음', !/customerName|memberKey|rawSessionId|rawUserId|"phone"|"email"|"address"|"contact"/.test(blob));
} catch (e) {
  ok('18~20,29~38. builder 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
