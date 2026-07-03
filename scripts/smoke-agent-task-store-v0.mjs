#!/usr/bin/env node
/*
 * scripts/smoke-agent-task-store-v0.mjs
 * 팀 자동 업무 스펙 스토어(Studio 편집 대상) — 시드/CRUD/승인모드 보존.
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
console.log('=== Agent Task Store v0 smoke ===');

ok('services/agentTaskStore.ts 존재', has('src/services/agentTaskStore.ts'));

const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, addEventListener: () => {}, removeEventListener: () => {} };

const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-ats-'));
let S = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'agentTaskStore.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const p of walkJs(tmp)) writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  S = await import(pathToFileURL(walkJs(tmp).find((p) => p.endsWith('agentTaskStore.js'))).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

ok('스토어 런타임 로드', !!S?.loadAgentTasks && !!S?.saveUpsertTask && !!S?.saveRemoveTask && !!S?.resetAgentTasks);

if (S) {
  store.clear();
  // 1) 저장 없으면 기본 스펙 시드 + 승인모드 존재
  const seed = S.loadAgentTasks();
  ok('1. 시드(기본 스펙) 로드·3팀 이상', seed.length >= 3 && seed.every((t) => !!t.approvalMode));
  ok('2. 기본 승인모드: 상품=approval / 마케팅=auto / cs=draft', seed.find((t) => t.teamId === 'product')?.approvalMode === 'approval' && seed.find((t) => t.teamId === 'marketing')?.approvalMode === 'auto' && seed.find((t) => t.teamId === 'cs')?.approvalMode === 'draft');

  // 2) upsert 추가
  const spec = { id: S.newTaskId(), teamId: 'product', agentId: 'p2', agentLabel: '재고 감시 AI', title: '재고 알림', focus: 'inventory', reportTo: 'product', reportKind: 'info', schedule: { kind: 'manual' }, approvalMode: 'draft' };
  const afterAdd = S.saveUpsertTask(spec);
  ok('3. upsert 추가 후 load에 반영', afterAdd.some((t) => t.id === spec.id) && S.loadAgentTasks().some((t) => t.id === spec.id));

  // 3) upsert 수정(같은 id)
  S.saveUpsertTask({ ...spec, title: '재고 알림(수정)', approvalMode: 'auto' });
  const edited = S.loadAgentTasks().find((t) => t.id === spec.id);
  ok('4. upsert 수정(제목·승인모드 반영, 중복 안 늘어남)', edited.title === '재고 알림(수정)' && edited.approvalMode === 'auto' && S.loadAgentTasks().filter((t) => t.id === spec.id).length === 1);

  // 4) remove
  S.saveRemoveTask(spec.id);
  ok('5. remove 후 사라짐', !S.loadAgentTasks().some((t) => t.id === spec.id));

  // 5) reset → 기본 복원
  S.saveUpsertTask({ ...spec, id: S.newTaskId() });
  const reset = S.resetAgentTasks();
  ok('6. reset → 기본 스펙으로 복원', reset.length === seed.length && !reset.some((t) => t.title === '재고 알림'));
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
