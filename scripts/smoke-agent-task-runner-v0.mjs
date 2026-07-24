#!/usr/bin/env node
/*
 * scripts/smoke-agent-task-runner-v0.mjs
 * 팀 에이전트 자동 업무 실행기 — canonical snapshot 계산 → 팀 메시지 센터에 AI-에이전트 명의 보고.
 *  1) scheduleLabel 표시
 *  2) formatTaskReport: 팀 focus별(inventory/sales/cs/overview) canonical 지표 포맷
 *  3) runAgentTask: from.kind='agent'로 reportTo 팀에 발신(persist)
 *  4) 데이터 없음(revenue=null) → 정직한 보고, 그래도 발신됨
 *  5) 새 숫자 로직 아님(같은 snapshot 필드만 인용)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const walkJs = (dir) => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walkJs(p) : (p.endsWith('.js') ? [p] : []); });
console.log('=== Agent Task Runner v0 smoke ===');

ok('types/agentTask.ts 존재', has('src/types/agentTask.ts'));
ok('data/defaultAgentTasks.ts 존재', has('src/data/defaultAgentTasks.ts'));
ok('services/agentTaskRunner.ts 존재', has('src/services/agentTaskRunner.ts'));

// localStorage 목(postTeamMessage용)
const store = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  addEventListener: () => {}, removeEventListener: () => {}
};

const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-atr-'));
let R = null, A = null, TC = null;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'agentTaskRunner.ts'),
    path.join(REPO, 'src', 'types', 'agentTask.ts'),
    path.join(REPO, 'src', 'services', 'teamMessageCenter.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const p of walkJs(tmp)) {
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const find = (name) => walkJs(tmp).find((p) => p.endsWith(name));
  R = await import(pathToFileURL(find('agentTaskRunner.js')).href);
  A = await import(pathToFileURL(find('agentTask.js')).href);
  TC = await import(pathToFileURL(find('teamMessageCenter.js')).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

// RC-2 D-1.3.1: raw 실행 함수는 비공개다. 공개 진입점만으로 검증한다.
ok('런타임 로드', !!R?.runManualAgentTask && !!R?.runScheduledAgentTask && !!R?.formatTaskReport && !!A?.scheduleLabel && !!TC?.inboxFor);
ok('런타임 raw 실행 함수 비공개', !R?.runAgentTask && !R?.stageApprovalTask && !R?.postAgentReport);

if (R && A && TC) {
  const NOW = '2026-07-03T00:00:00.000Z';

  // 1) scheduleLabel
  ok('1. scheduleLabel daily', A.scheduleLabel({ kind: 'daily', at: '09:00' }) === '매일 09:00');
  ok('2. scheduleLabel weekly', A.scheduleLabel({ kind: 'weekly', weekday: 1, at: '09:00' }) === '매주 월 09:00');
  ok('3. scheduleLabel manual', A.scheduleLabel({ kind: 'manual' }) === '수동 실행');

  // 2) formatTaskReport — 가짜 canonical snapshot(같은 필드만 인용)
  const snap = {
    periodLabel: '전체 기간',
    operationalRevenue: 88116982, operationalOrderCount: 1182, operationalAOV: 74549,
    productUniverse: { riskyStockCount: 1, productCount: 13, totalQuantitySold: 3204 },
    csUniverse: { totalInquiries: 40, unresolvedInquiries: 7, resolvedInquiries: 33, totalReviews: 55, autoCandidates: 9 }
  };
  const specInv = { id: 't', teamId: 'product', agentId: 'a', agentLabel: '상품 관리 AI', title: '재고·매출 일일 점검', focus: 'inventory', reportTo: 'hq', reportKind: 'info', schedule: { kind: 'daily' } };
  const rInv = R.formatTaskReport(specInv, snap);
  ok('4. inventory 보고: 재고위험/판매수량/운영매출 인용', /재고위험 1건/.test(rInv.body) && /판매수량 3,204개/.test(rInv.body) && /88,116,982원/.test(rInv.body));
  const rSales = R.formatTaskReport({ ...specInv, focus: 'sales' }, snap);
  ok('5. sales 보고: 운영매출·객단가', /운영매출 88,116,982원/.test(rSales.body) && /객단가 74,549원/.test(rSales.body));
  const rCs = R.formatTaskReport({ ...specInv, focus: 'cs' }, snap);
  ok('6. cs 보고: 총문의/미처리/리뷰', /총 문의 40건/.test(rCs.body) && /미처리 7건/.test(rCs.body) && /리뷰 55건/.test(rCs.body));
  ok('7. snapshot 없으면 정직한 안내', /데이터가 아직 준비되지 않아/.test(R.formatTaskReport(specInv, null).body));

  // 3) 자동 보고 — 데이터 없음(revenue=null)이어도 AI-에이전트 명의로 reportTo에 발신.
  //    RC-2 D-1.3.1: 자동 발신은 **팀장이 승인해 둔 상시 지시**가 있을 때만 가능하다.
  store.clear();
  const APPROVED_STANDING = {
    ownerTeamId: 'product', ownerLeadUserId: 'u-product', scope: '재고·매출 일일 점검',
    schedule: { kind: 'daily', at: '09:00' }, active: true, approvedByLeadAt: NOW,
    riskLevel: 'normal', source: 'real', history: []
  };
  const specAuto = { ...specInv, approvalMode: 'auto', standing: APPROVED_STANDING };
  const ran = R.runScheduledAgentTask(specAuto, { revenue: null, nowIso: NOW });
  ok('8. 스케줄 진입점이 상시 지시 승인분을 실행', ran.ran === true && typeof ran.body === 'string');
  const out = { posted: TC.inboxFor(TC.loadTeamMessages(), 'hq')[0] };
  ok('8b. 미승인 상시 지시는 실행되지 않음',
    R.runScheduledAgentTask({ ...specInv, approvalMode: 'auto' }, { revenue: null, nowIso: NOW }).ran === false);
  ok('8c. 수동 진입점은 담당 팀장만',
    R.runManualAgentTask(specAuto, { kind: 'human', teamId: 'cs' }, { revenue: null, nowIso: NOW }).ran === false
    && R.runManualAgentTask(specAuto, { kind: 'human', teamId: 'product' }, { revenue: null, nowIso: NOW }).ran === true);
  const hqInbox = TC.inboxFor(TC.loadTeamMessages(), 'hq');
  ok('9. reportTo(hq) 요청함에 보고 도착', hqInbox.some((m) => m.id === out.posted.id));
  const msg = hqInbox.find((m) => m.id === out.posted.id);
  ok('10. 발신자 actor=AI 에이전트(agentId 포함)', msg.from.kind === 'agent' && msg.from.agentId === 'a' && msg.from.teamId === 'product');
  ok('11. 보고 제목=작업명', msg.title === '재고·매출 일일 점검');

  // 4) 승인 경로: stageApprovalTask → 원장 pending(발신 없음), approveAgentTask → 발신 + approval(done)
  const ledger = () => JSON.parse(store.get('godo_activity_ledger_v0') || '[]');
  store.clear();
  const specAppr = { ...specInv, id: 't2', approvalMode: 'approval' };
  const staged = R.runManualAgentTask(specAppr, { kind: 'human', teamId: 'product' }, { revenue: null, nowIso: NOW });
  ok('12. stage: 본문 생성', staged.staged === true && typeof staged.body === 'string');
  ok('13. stage: 원장 task_run(pending)만·메시지 발신 없음', ledger().filter((e) => e.type === 'task_run' && e.status === 'pending').length === 1 && TC.inboxFor(TC.loadTeamMessages(), 'hq').length === 0);
  const appr = R.approveAgentTask(specAppr, { revenue: null, nowIso: NOW }, '사람이 승인한 본문');
  ok('14. approve: 발신됨(승인 본문)', !!appr?.posted && TC.inboxFor(TC.loadTeamMessages(), 'hq').some((m) => m.id === appr.posted.id && m.body === '사람이 승인한 본문'));
  ok('15b. approve: 원장에 approval(done) 기록', ledger().some((e) => e.type === 'approval' && e.status === 'done'));

  // 5) 기본 스펙 파일 로드(선언형)
  // (defaultAgentTasks는 컴파일 그래프 밖 — 존재/형태만 위에서 확인)
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
