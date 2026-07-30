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
  // D-010 적용 후 현재 정책. 마케팅은 승인된 standing 이 없어 'auto' 로 두면 수동 실행이
  //   즉시 완료되지 않으므로 'approval' 이 맞다(Codex A안 · standingDirectiveContract.ts:63-71).
  ok('2. 기본 승인모드: 상품=approval / 마케팅=approval / cs=draft',
    seed.find((t) => t.teamId === 'product')?.approvalMode === 'approval'
    && seed.find((t) => t.teamId === 'marketing')?.approvalMode === 'approval'
    && seed.find((t) => t.teamId === 'cs')?.approvalMode === 'draft');
  ok('2b. 기본 보고 대상: 세 업무 모두 팀 내부(reportTo === teamId)',
    ['task-product-daily', 'task-cs-daily', 'task-marketing-daily'].every((id) => {
      const t = seed.find((x) => x.id === id);
      return !!t && t.reportTo === t.teamId;
    }));

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

  // ══════════════════════════════════════════════════════════════════════
  // D-0 후속 교정 — 저장된 기본 업무 **보고 정책 1회 이관**
  //   기본 스펙만 바꾸면 새 브라우저에만 적용되고, 이미 앱을 쓴 브라우저에는
  //   옛 정책(reportTo:'hq' 등)이 그대로 남는다. 그 저장자료를 한 번만 교정한다.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n  --- 저장된 기본 업무 정책 1회 이관 ---');
  const KEY = 'godo_agent_tasks_v0';
  const MARKER = 'godo_agent_tasks_policy_v1';
  const readStored = () => JSON.parse(store.get(KEY) || '[]');
  // 옛 정책(D-010 이전) 저장 상태 — 세 기본 업무가 전부 HQ 로 보고하던 때.
  const legacyStored = () => ([
    { id: 'task-product-daily', teamId: 'product', agentId: 'product-lead', agentLabel: '상품 관리 AI', title: '재고·매출 일일 점검', focus: 'inventory', reportTo: 'hq', reportKind: 'info', schedule: { kind: 'daily', at: '09:00' }, approvalMode: 'approval' },
    { id: 'task-marketing-daily', teamId: 'marketing', agentId: 'marketing-lead', agentLabel: '마케팅 기획 AI', title: '매출 요약 리포트', focus: 'sales', reportTo: 'hq', reportKind: 'info', schedule: { kind: 'daily', at: '09:30' }, approvalMode: 'auto' },
    { id: 'task-cs-daily', teamId: 'cs', agentId: 'cs-lead', agentLabel: 'CS 상담 AI', title: '문의·리뷰 데스크 점검', focus: 'cs', reportTo: 'hq', reportKind: 'info', schedule: { kind: 'daily', at: '09:00' }, approvalMode: 'draft' }
  ]);
  const policyOf = (list, id) => { const t = list.find((x) => x.id === id); return t ? `${t.reportTo}/${t.approvalMode}` : '없음'; };

  // M1. 저장값이 없으면 현재 기본 설정 반환
  store.clear();
  const noStore = S.loadAgentTasks();
  ok('M1. 저장값 없으면 현재 기본 설정 반환(이관 없음)',
    policyOf(noStore, 'task-marketing-daily') === 'marketing/approval' && !store.has(KEY));

  // M2. 옛 기본 업무 3종 + 사용자 추가 업무 + 정책 외 필드 보존
  store.clear();
  const userTask = { id: 'user-custom-1', teamId: 'product', agentId: 'u1', agentLabel: '사용자 AI', title: '사용자 업무', focus: 'inventory', reportTo: 'hq', reportKind: 'info', schedule: { kind: 'manual' }, approvalMode: 'auto' };
  store.set(KEY, JSON.stringify([...legacyStored(), userTask]));
  const migrated = S.loadAgentTasks();
  ok('M2. 옛 기본 업무 3종의 정책 필드만 이관',
    policyOf(migrated, 'task-product-daily') === 'product/approval'
    && policyOf(migrated, 'task-cs-daily') === 'cs/draft'
    && policyOf(migrated, 'task-marketing-daily') === 'marketing/approval');
  ok('M3. 사용자 추가 업무는 그대로 보존(정책도 안 바뀜)', (() => {
    const u = migrated.find((t) => t.id === userTask.id);
    return !!u && u.reportTo === 'hq' && u.approvalMode === 'auto' && u.title === '사용자 업무';
  })());
  ok('M4. 기본 업무의 정책 외 필드 보존(제목·담당 AI·시간·focus)', (() => {
    const m = migrated.find((t) => t.id === 'task-marketing-daily');
    return !!m && m.title === '매출 요약 리포트' && m.agentLabel === '마케팅 기획 AI'
      && m.focus === 'sales' && m.schedule.at === '09:30' && m.reportKind === 'info';
  })());
  ok('M6. 목록 저장 뒤 marker 기록', store.has(MARKER) && readStored().length === 4);

  // M7. 두 번째 로드에서 중복 변경 없음(idempotent)
  const snapshotAfterFirst = store.get(KEY);
  const second = S.loadAgentTasks();
  ok('M7. 두 번째 로드에서 중복 변경 없음',
    store.get(KEY) === snapshotAfterFirst && second.length === 4
    && policyOf(second, 'task-marketing-daily') === 'marketing/approval');

  // M8. marker 이후 사용자가 바꾼 값은 다음 로드에서도 보존(강제 교정 없음)
  S.saveUpsertTask({ ...migrated.find((t) => t.id === 'task-marketing-daily'), reportTo: 'hq', approvalMode: 'auto' });
  const afterUserEdit = S.loadAgentTasks();
  ok('M8. marker 이후 사용자 변경값은 다음 로드에서도 보존',
    policyOf(afterUserEdit, 'task-marketing-daily') === 'hq/auto');

  // M5. 사용자가 지운 기본 업무를 다시 만들지 않는다
  store.clear();
  store.set(KEY, JSON.stringify(legacyStored().filter((t) => t.id !== 'task-cs-daily')));
  const afterDeleted = S.loadAgentTasks();
  ok('M5. 삭제된 기본 업무를 재생성하지 않는다',
    afterDeleted.length === 2 && !afterDeleted.some((t) => t.id === 'task-cs-daily')
    && policyOf(afterDeleted, 'task-product-daily') === 'product/approval');

  // M9. reset 후 현재 기본 설정과 marker 일치
  store.clear();
  const afterReset = S.resetAgentTasks();
  ok('M9. reset 후 현재 기본 설정 + marker 일치',
    store.has(MARKER)
    && policyOf(afterReset, 'task-marketing-daily') === 'marketing/approval'
    && policyOf(readStored(), 'task-cs-daily') === 'cs/draft');

  // M10. 손상된 저장값 fail-safe 유지
  store.clear();
  store.set(KEY, '{ 깨진 JSON');
  const broken = S.loadAgentTasks();
  store.set(KEY, JSON.stringify({ notAnArray: true }));
  const notArray = S.loadAgentTasks();
  ok('M10. 손상된 저장값은 기존 fail-safe 로 기본 스펙 반환',
    policyOf(broken, 'task-marketing-daily') === 'marketing/approval'
    && policyOf(notArray, 'task-marketing-daily') === 'marketing/approval');

  // ══════════════════════════════════════════════════════════════════════
  // 후속 — **새 브라우저의 첫 설정 수정 보존**
  //   저장목록 없이 현재 기본값을 내줬는데 marker 를 남기지 않으면,
  //   사용자의 **첫 수정**이 저장된 뒤 다음 로드가 그것을 '옛 자료'로 오인해
  //   1회 이관을 실행하고 수정을 되돌린다. 기본값을 내주는 순간 이미
  //   policy_v1 상태이므로 그때 marker 를 남긴다.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n  --- 새 브라우저의 첫 수정 보존 ---');

  // N1. 새 브라우저 최초 로드 뒤 marker 준비
  store.clear();
  const freshLoad = S.loadAgentTasks();
  ok('N1. 새 브라우저 최초 로드 뒤 정책 marker 가 준비된다',
    store.has(MARKER) && policyOf(freshLoad, 'task-marketing-daily') === 'marketing/approval');

  // N2. 첫 수정이 다음 로드에서도 보존된다 (RED 대상)
  const mktDefault = freshLoad.find((t) => t.id === 'task-marketing-daily');
  S.saveUpsertTask({ ...mktDefault, reportTo: 'hq', approvalMode: 'auto' });
  const afterFirstEdit = S.loadAgentTasks();
  ok(`N2. 새 브라우저의 첫 수정이 다음 로드에서도 보존된다 (관측 ${policyOf(afterFirstEdit, 'task-marketing-daily')})`,
    policyOf(afterFirstEdit, 'task-marketing-daily') === 'hq/auto');

  // N3. 손상된 저장값 뒤의 첫 수정도 같은 이유로 보존된다(같은 빈틈, 같은 경로).
  for (const brokenRaw of ['{ 깨진 JSON', JSON.stringify({ notAnArray: true })]) {
    store.clear();
    store.set(KEY, brokenRaw);
    const recovered = S.loadAgentTasks();
    const m = recovered.find((t) => t.id === 'task-marketing-daily');
    S.saveUpsertTask({ ...m, reportTo: 'hq', approvalMode: 'auto' });
    const reloaded = S.loadAgentTasks();
    ok(`N3-${brokenRaw.startsWith('{ 깨진') ? '깨진JSON' : '비배열'}. 손상 저장값 복구 뒤 첫 수정도 보존된다 (관측 ${policyOf(reloaded, 'task-marketing-daily')})`,
      policyOf(reloaded, 'task-marketing-daily') === 'hq/auto');
  }

  // N4. 목록 저장이 실패하면 marker 를 남기지 않고 다음 로드에서 재시도한다.
  store.clear();
  store.set(KEY, JSON.stringify(legacyStored()));
  const realSetItem = globalThis.window.localStorage.setItem;
  let blockedWrites = 0;
  globalThis.window.localStorage.setItem = (k, v) => {
    if (k === KEY) { blockedWrites += 1; throw new Error('quota exceeded (시험)'); }
    return realSetItem(k, v);
  };
  let failLoad = null;
  try { failLoad = S.loadAgentTasks(); } finally { globalThis.window.localStorage.setItem = realSetItem; }
  ok(`N4. 목록 저장 실패 시 marker 를 남기지 않는다 (차단된 쓰기 ${blockedWrites}회 · marker=${store.has(MARKER)})`,
    blockedWrites >= 1 && !store.has(MARKER)
    && policyOf(failLoad, 'task-marketing-daily') === 'marketing/approval'
    && policyOf(readStored(), 'task-marketing-daily') === 'hq/auto');
  // 저장이 다시 되면 같은 이관을 재시도해 마무리한다.
  const retried = S.loadAgentTasks();
  ok('N5. 저장이 복구되면 다음 로드에서 이관을 재시도해 마무리한다',
    store.has(MARKER) && policyOf(readStored(), 'task-marketing-daily') === 'marketing/approval'
    && policyOf(retried, 'task-marketing-daily') === 'marketing/approval');
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
