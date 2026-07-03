#!/usr/bin/env node
/*
 * scripts/smoke-activity-ledger-v0.mjs
 * 업무 활동 원장 — 전 팀 활동 기록/집계. 오늘의 운영(관제)·HQ 채팅이 여기서 읽는다.
 *  1) logActivity persist(사람/AI 에이전트 actor)
 *  2) activityForTeam 팀별·최신순
 *  3) teamSummary 집계(task_run 진행/완료, 전달, 승인, 대기)
 *  4) allTeamsSummary
 *  5) activitySince(오늘 필터)
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
console.log('=== Activity Ledger v0 smoke ===');

ok('types/activityLedger.ts 존재', has('src/types/activityLedger.ts'));
ok('services/activityLedger.ts 존재', has('src/services/activityLedger.ts'));

const store = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  addEventListener: () => {}, removeEventListener: () => {}
};

const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-led-'));
let L = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'activityLedger.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const p of walkJs(tmp)) writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  L = await import(pathToFileURL(walkJs(tmp).find((p) => p.endsWith('activityLedger.js'))).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

ok('원장 런타임 로드', !!L?.logActivity && !!L?.teamSummary && !!L?.activityForTeam && !!L?.allTeamsSummary);

if (L) {
  const agent = (teamId, agentId, label) => ({ kind: 'agent', teamId, label, agentId });
  const human = (teamId) => ({ kind: 'human', teamId, label: '운영자' });
  const D = '2026-07-03';
  const t = (hh) => `${D}T${hh}:00:00.000Z`;

  store.clear();
  // 상품팀: 자동업무 2건(완료), 전달 1건 / CS팀: 승인 1건(완료), 대기 1건
  L.logActivity({ teamId: 'product', type: 'task_run', status: 'done', title: '재고 점검', actor: agent('product', 'p1', '상품 관리 AI'), relatedTeam: 'hq' }, t('09'));
  L.logActivity({ teamId: 'product', type: 'task_run', status: 'done', title: '매출 점검', actor: agent('product', 'p1', '상품 관리 AI') }, t('10'));
  L.logActivity({ teamId: 'product', type: 'message_sent', status: 'info', title: 'CS에 확인요청', actor: human('product'), relatedTeam: 'cs' }, t('11'));
  L.logActivity({ teamId: 'cs', type: 'approval', status: 'done', title: '요청 처리', actor: human('cs') }, t('12'));
  L.logActivity({ teamId: 'cs', type: 'task_run', status: 'pending', title: '리뷰 점검', actor: agent('cs', 'c1', 'CS 상담 AI') }, t('13'));

  ok('1. persist 후 load로 5건 조회', L.loadActivity().length === 5);
  ok('2. activityForTeam(product)=3건·최신순', (() => { const r = L.activityForTeam(L.loadActivity(), 'product'); return r.length === 3 && r[0].at >= r[1].at; })());

  const sp = L.teamSummary(L.loadActivity(), 'product');
  ok('3. product 집계: 자동업무 2·완료 2·전달 1', sp.taskRunTotal === 2 && sp.taskRunDone === 2 && sp.messagesSent === 1);
  ok('4. product 승인 0·대기 0', sp.approvals === 0 && sp.pending === 0);

  const sc = L.teamSummary(L.loadActivity(), 'cs');
  ok('5. cs 집계: 승인 1·대기 1(리뷰 pending)', sc.approvals === 1 && sc.pending === 1 && sc.taskRunTotal === 1 && sc.taskRunDone === 0);

  const all = L.allTeamsSummary(L.loadActivity(), ['hq', 'product', 'cs', 'marketing']);
  ok('6. allTeamsSummary: 4팀·marketing 0건', Object.keys(all).length === 4 && all.marketing.total === 0 && all.product.total === 3);

  ok('7. activitySince(11시 이후)=3건', L.activitySince(L.loadActivity(), t('11')).length === 3);
  ok('8. AI 에이전트 actor 보존', L.activityForTeam(L.loadActivity(), 'product').some((e) => e.actor.kind === 'agent' && e.actor.agentId === 'p1'));
  ok('9. lastAt=최신 이벤트 시각', L.teamSummary(L.loadActivity(), 'product').lastAt === t('11'));
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
