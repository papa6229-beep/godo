#!/usr/bin/env node
/*
 * scripts/smoke-rc2-d13321-approval-team-attribution-red-v0.mjs
 * RC-2 D-1.3.3.2.1 — 승인자료 부서 귀속 판정 보정 (RED 진단)
 *
 * OperationBriefingModal 은 부서별 승인자료를 requestedByAgentId.startsWith(deptId) 로 고른다.
 * lifecycle 승인자료에서 이 방식은 틀린다:
 *   · reviewOnly 확인요청·인간 수행 업무는 requestedByAgentId 가 빈 값 → 어느 팀에도 안 걸린다.
 *   · AI id 가 팀 접두사로 시작하지 않으면(inventory_monitor) 소속팀에서 누락된다.
 *
 * **제품 소스는 한 줄도 고치지 않는다(RED 전용).**
 *
 * GREEN 의도: 공통 순수 함수 approvalTeamId(item) 로 단일 판정.
 *   우선순위 = 정본 투영 팀 → canonical AI 소속팀 → 하위호환 정확 일치 팀 → undefined(미승격).
 *   부서 드릴다운은 teamIdForDepartment(deptId)(manager→hq) 와 비교한다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2d13321-'));

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

let A, S;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'taskLifecycleAppAdapter.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const sub of ['services', 'types', 'data']) {
    const dir = path.join(tmp, sub);
    let files = [];
    try { files = readdirSync(dir).filter((x) => x.endsWith('.js')); } catch { continue; }
    for (const f of files) {
      const p = path.join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
  }
  const imp = async (n) => import(pathToFileURL(path.join(tmp, 'services', n)).href);
  A = await imp('taskLifecycleAppAdapter.js');
  S = await imp('taskLifecycleStore.js');
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const src = (p) => { try { return readFileSync(path.join(REPO, ...p.split('/')), 'utf8'); } catch { return ''; } };
const briefing = src('src/components/OperationBriefingModal.tsx');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1.3.3.2.1 — 승인자료 부서 귀속 판정 보정 (RED 진단) ===');

const AT = '2026-07-24T00:00:00.000Z';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const reset = () => { store.clear(); _n = 0; };
const HQ = A.actorForRole('hq');
const LEAD_CS = A.actorForRole('cs');
const LEAD_PRODUCT = A.actorForRole('product');
const readTask = (id) => S.loadLifecycleTasks().find((x) => x.ref.taskId === id);

const MSG = {
  id: 'tmsg-77', from: { kind: 'human', teamId: 'cs', label: 'CS팀장' }, toTeam: 'hq', kind: 'confirm',
  title: '환불 규정 확인', body: '30일 무상 반품 안', attachments: [], createdAt: AT
};

// ── 다섯 종류의 승인자료(모두 ApprovalItem) ──────────────────────────────────
const itemReviewCS = () => { reset();
  const r = A.createHqReviewRequest({ message: MSG, actor: LEAD_CS }, ids);
  return A.toApprovalItem(readTask(r.task.ref.taskId)); };

const itemHumanProduct = () => { reset();
  const t = A.createDirectiveTask({ title: '재고 실사', targetTeamId: 'product', instructedBy: HQ }, ids);
  A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
  A.submitResult(t.ref.taskId, { resultSummary: '완료', actor: LEAD_PRODUCT }, { nowIso: AT });
  return A.toApprovalItem(readTask(t.ref.taskId)); };

const itemAIProduct = () => { reset();
  const t = A.createManualTask({ title: '재고 모니터', assignedAgentId: 'inventory_monitor', createdBy: LEAD_PRODUCT }, ids);
  return A.toApprovalItem(readTask(t.ref.taskId)); };

// 하위호환 legacy 자료(정본 투영 없음, requestedByAgentId 가 팀 id 문자열).
const itemLegacyCS = () => ({
  id: 'legacy-1', taskId: 'legacy-1', title: 'legacy CS 승인', requestedByAgentId: 'cs',
  riskLevel: 'medium', reason: '검토', proposedAction: '초안', status: 'waiting'
});

// 근거 없는 미상 자료.
const itemUnknown = () => ({
  id: 'unk-1', taskId: 'unk-1', title: '미상', requestedByAgentId: '',
  riskLevel: 'medium', reason: '검토', proposedAction: '초안', status: 'waiting', executorKind: 'unassigned'
});

// 현행(버그) 부서 필터 재현.
const startsWithFilter = (items, deptId) => deptId === '*' ? items : items.filter((a) => (a.requestedByAgentId ?? '').startsWith(deptId));
// 의도(GREEN) 부서 필터.
const teamFilter = (items, deptId) => {
  if (deptId === '*') return items;
  const team = A.teamIdForDepartment(deptId);
  return items.filter((a) => { const t = A.approvalTeamId(a); return t !== undefined && t === team; });
};

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. inventory_monitor 의 소속팀은 product 이지만 id 는 product 로 시작하지 않는다',
  A.teamOfAgent('inventory_monitor') === 'product' && !'inventory_monitor'.startsWith('product'),
  `teamOfAgent=${A.teamOfAgent('inventory_monitor')} · 'inventory_monitor'.startsWith('product')=${'inventory_monitor'.startsWith('product')}`);

base('B2. reviewOnly·human 승인자료의 requestedByAgentId 는 빈 값이라 startsWith 판정이 불가능하다',
  (() => { const r = itemReviewCS(); const h = itemHumanProduct();
    return r.requestedByAgentId === '' && h.requestedByAgentId === '' && r.submittingTeamId === 'cs'; })(),
  (() => { const r = itemReviewCS(); const h = itemHumanProduct();
    return `review: reqBy="${r.requestedByAgentId}" 제출팀=${r.submittingTeamId} · human: reqBy="${h.requestedByAgentId}" executorKind=${h.executorKind}`; })());

base('B3(원인). OperationBriefingModal 이 현재 requestedByAgentId.startsWith(deptId) 로 부서를 판정한다',
  /requestedByAgentId\.startsWith\(/.test(briefing),
  `startsWith 사용=${/requestedByAgentId\.startsWith\(/.test(briefing)}`);

// ── 현행 버그 재현(증거·불변): startsWith 는 세 자료를 놓친다 ─────────────────
console.log('');
console.log('  --- 현행 startsWith 필터의 누락(증거·불변) ---');
base('C0(증거·불변). 현행 필터에서 CS reviewOnly 는 CS 부서에 안 걸린다',
  startsWithFilter([itemReviewCS()], 'cs').length === 0, `startsWith('cs') 매칭=${startsWithFilter([itemReviewCS()], 'cs').length}건`);
base('C1(증거·불변). 현행 필터에서 상품팀 인간 수행 업무는 product 부서에 안 걸린다',
  startsWithFilter([itemHumanProduct()], 'product').length === 0, `startsWith('product') 매칭=${startsWithFilter([itemHumanProduct()], 'product').length}건`);
base('C2(증거·불변). 현행 필터에서 inventory_monitor 업무는 product 부서에 안 걸린다',
  startsWithFilter([itemAIProduct()], 'product').length === 0, `startsWith('product') 매칭=${startsWithFilter([itemAIProduct()], 'product').length}건`);

// ════════════════════════════════════════════════════════════════════════════
// 공통 판정 함수 approvalTeamId (T1~T6)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 공통 판정 함수 approvalTeamId / teamIdForDepartment ---');

red('T1. approvalTeamId(CS reviewOnly) = cs (정본 투영 팀)',
  typeof A.approvalTeamId === 'function' && A.approvalTeamId(itemReviewCS()) === 'cs',
  typeof A.approvalTeamId !== 'function' ? 'approvalTeamId 미구현' : `approvalTeamId=${JSON.stringify(A.approvalTeamId(itemReviewCS()))}`,
  'cs');

red('T2. approvalTeamId(상품팀 인간 수행) = product (모든 수행자 종류에서 팀 투영)',
  typeof A.approvalTeamId === 'function' && A.approvalTeamId(itemHumanProduct()) === 'product',
  typeof A.approvalTeamId !== 'function' ? 'approvalTeamId 미구현' : `approvalTeamId=${JSON.stringify(A.approvalTeamId(itemHumanProduct()))} · 투영 submittingTeamId=${JSON.stringify(itemHumanProduct().submittingTeamId)}`,
  'product');

red('T3. approvalTeamId(inventory_monitor) = product (canonical AI 소속팀)',
  typeof A.approvalTeamId === 'function' && A.approvalTeamId(itemAIProduct()) === 'product',
  typeof A.approvalTeamId !== 'function' ? 'approvalTeamId 미구현' : `approvalTeamId=${JSON.stringify(A.approvalTeamId(itemAIProduct()))}`,
  'product');

red('T4. approvalTeamId(legacy requestedByAgentId=cs) = cs (하위호환)',
  typeof A.approvalTeamId === 'function' && A.approvalTeamId(itemLegacyCS()) === 'cs',
  typeof A.approvalTeamId !== 'function' ? 'approvalTeamId 미구현' : `approvalTeamId=${JSON.stringify(A.approvalTeamId(itemLegacyCS()))}`,
  'cs');

red('T5. approvalTeamId(미상 자료) = undefined (임의 팀으로 승격하지 않음)',
  typeof A.approvalTeamId === 'function' && A.approvalTeamId(itemUnknown()) === undefined,
  typeof A.approvalTeamId !== 'function' ? 'approvalTeamId 미구현' : `approvalTeamId=${JSON.stringify(A.approvalTeamId(itemUnknown()))}`,
  'undefined');

red('T6. teamIdForDepartment 이 부서→팀 매핑(manager→hq)을 하고 미상은 undefined',
  typeof A.teamIdForDepartment === 'function'
    && A.teamIdForDepartment('cs') === 'cs' && A.teamIdForDepartment('product') === 'product'
    && A.teamIdForDepartment('manager') === 'hq' && A.teamIdForDepartment('nope') === undefined,
  typeof A.teamIdForDepartment !== 'function' ? 'teamIdForDepartment 미구현'
    : `cs=${A.teamIdForDepartment('cs')} · manager=${A.teamIdForDepartment('manager')} · nope=${A.teamIdForDepartment('nope')}`,
  'cs·product·manager→hq·미상→undefined');

// ════════════════════════════════════════════════════════════════════════════
// 부서 필터 잠금 (L1~L4) — 공통 판정으로 교체된 필터 동작
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 부서 필터 잠금 ---');

const ALL = () => [itemReviewCS(), itemHumanProduct(), itemAIProduct(), itemLegacyCS(), itemUnknown()];
const idsOf = (arr) => arr.map((x) => x.id).sort();

red('L1. CS 드릴다운은 CS reviewOnly·legacy cs 만 포함(상품·미상 제외)',
  typeof A.approvalTeamId === 'function' && typeof A.teamIdForDepartment === 'function'
    && JSON.stringify(idsOf(teamFilter(ALL(), 'cs'))) === JSON.stringify(['legacy-1'].concat([itemReviewCS().id]).sort()),
  (() => { try { return `CS 포함=${JSON.stringify(idsOf(teamFilter(ALL(), 'cs')))}`; } catch { return '판정 함수 미구현'; } })(),
  'CS=[reviewOnly cs, legacy cs]');

red('L2. product 드릴다운은 인간 수행·inventory_monitor 만 포함(CS·미상 제외)',
  (() => { try {
    const got = idsOf(teamFilter(ALL(), 'product'));
    const want = [itemHumanProduct().id, itemAIProduct().id].sort();
    return typeof A.approvalTeamId === 'function' && JSON.stringify(got) === JSON.stringify(want);
  } catch { return false; } })(),
  (() => { try { return `product 포함=${JSON.stringify(idsOf(teamFilter(ALL(), 'product')))}`; } catch { return '판정 함수 미구현'; } })(),
  'product=[human, inventory_monitor]');

red('L3. 미상 자료는 어느 부서 드릴다운에도 포함되지 않는다',
  (() => { try {
    return ['cs', 'product', 'marketing', 'design', 'manager']
      .every((d) => !teamFilter(ALL(), d).some((x) => x.id === 'unk-1'));
  } catch { return false; } })(),
  (() => { try { return `미상 포함 부서=${['cs','product','marketing','design','manager'].filter((d) => teamFilter(ALL(), d).some((x) => x.id === 'unk-1')).join(',') || '없음'}`; } catch { return '판정 함수 미구현'; } })(),
  '미상은 어느 부서에도 없음');

base('L4(불변). 전체 보기(*)는 부서 판정을 거치지 않고 다섯 자료 전부 유지한다',
  teamFilter(ALL(), '*').length === 5,
  `* 유지=${teamFilter(ALL(), '*').length}건`);

// ════════════════════════════════════════════════════════════════════════════
// 소비자 교체 (S1)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 소비자 교체 ---');

red('S1(소비자). OperationBriefingModal 이 startsWith 대신 approvalTeamId·teamIdForDepartment 로 판정한다',
  /approvalTeamId/.test(briefing) && /teamIdForDepartment/.test(briefing) && !/requestedByAgentId\.startsWith\(/.test(briefing),
  `approvalTeamId 사용=${/approvalTeamId/.test(briefing)} · teamIdForDepartment 사용=${/teamIdForDepartment/.test(briefing)} · startsWith 잔존=${/requestedByAgentId\.startsWith\(/.test(briefing)}`,
  'startsWith 제거 · 공통 판정 사용');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (D-1.3.3.2.1 부서 귀속 판정)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
if (redUnmet > 0) {
  console.log(`\n✗ RC-2 D-1.3.3.2.1 — ${redUnmet}건 미충족 (RED 정상: 결함 재현됨)`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1.3.3.2.1 GREEN 도달');
