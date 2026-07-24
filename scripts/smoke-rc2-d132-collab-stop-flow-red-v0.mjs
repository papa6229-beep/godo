#!/usr/bin/env node
/*
 * scripts/smoke-rc2-d132-collab-stop-flow-red-v0.mjs
 * RC-2 D-1.3.2 — 협업 중단 흐름 · 추적 부모 결정 차단 · 협업 생성 권한 (RED 진단)
 *
 * 배경: D-1.3.1 에서 협업을 '추적 부모 + 실행 자식' 으로 나눴는데, 중단 흐름이 부모에 걸린다.
 *   · 추적 부모에도 결정 버튼이 계산되어 요청팀장이 부모를 직접 stopped 로 만든다.
 *   · 요청팀은 부모의 owner 라서 '중단 요청' 대신 '작업 중단' 이 보인다.
 *   · requestTaskStop(부모) 은 요청을 부모에만 쌓아서 **수행팀 화면에 도착하지 않는다**.
 *   · pendingStopRequest 도 부모만 읽어 같은 문제가 난다.
 *   · createCollaborationRequest 는 HQ 호출·요청팀 사칭·동일 팀 대상을 서비스에서 거부하지 않는다.
 *
 * 확정 정책:
 *   추적 부모는 지켜보는 카드다 — 어떤 결정도 받지 않는다.
 *   요청팀이 협업을 그만두고 싶으면 **수행 자식**에 중단 요청이 쌓이고, 수행팀장이 처리한다.
 *   요청은 자식에 **한 번만** 기록하고, 부모 화면은 그 자식을 추적해 보여 준다(복제 금지).
 *
 * **제품 소스는 한 줄도 고치지 않는다(RED 전용).**
 *   [BASE] = 진단 전제(현재 코드에서도 참)
 *   [RED ] = 목표. 지금은 미충족(unmet)이 정상이다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2d132-'));

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

let A, L, S;
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
  L = await imp('taskLifecycleContract.js');
  S = await imp('taskLifecycleStore.js');
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const src = (p) => { try { return readFileSync(path.join(REPO, ...p.split('/')), 'utf8'); } catch { return ''; } };
const teamTaskPanel = src('src/components/TeamTaskPanel.tsx');
const contractSrc = src('src/services/taskLifecycleContract.ts');
const appSource = src('src/App.tsx');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1.3.2 — 협업 중단 흐름 · 추적 부모 결정 차단 (RED 진단) ===');

const AT = '2026-07-23T00:00:00.000Z';
const AT2 = '2026-07-23T02:00:00.000Z';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const reset = () => { store.clear(); _n = 0; };
const HQ = A.actorForRole('hq');
const LEAD_CS = A.actorForRole('cs');
const LEAD_DESIGN = A.actorForRole('design');
const LEAD_PRODUCT = A.actorForRole('product');
const readTask = (id) => S.loadLifecycleTasks().find((x) => x.ref.taskId === id);
const DECISIONS = ['approve', 'request_revision', 'not_adopted', 'stop', 'return'];

/** CS팀장이 디자인팀에 협업 요청. 결과: 추적 부모(cs) + 실행 자식(design) */
const collab = () => A.createCollaborationRequest(
  { title: '상세 문구 요청', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS }, ids);

/** 협업 생성 시도 결과를 거부/성공으로 정규화(throw 또는 ok:false 모두 거부로 본다). */
const tryCollab = (input) => {
  try {
    const r = A.createCollaborationRequest(input, ids);
    if (r && r.ok === false) return { rejected: true, reason: r.reason };
    return { rejected: false, value: r };
  } catch (e) {
    return { rejected: true, reason: e?.message };
  }
};

/** 화면이 '중단 요청 대기' 로 표시할 기록(구현이 어느 카드를 읽든 flow 기준으로 본다). */
const shownStopRequest = (flow) => {
  if (typeof A.pendingStopRequest !== 'function') return null;
  // 목표 구현은 추적 흐름에서 **수행 자식**의 기록을 읽는다.
  return A.pendingStopRequest(flow.tracking ?? flow.task);
};

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. 협업이 추적 부모 + 실행 자식으로 만들어진다(D-1.3.1 산출물)',
  (() => { reset();
    const pair = collab();
    return pair.parent.trackingOnly === true && pair.child.ref.parentTaskId === pair.parent.ref.taskId;
  })(), '부모 trackingOnly · 자식 parentTaskId 연결');

base('B2. 중단 요청·흐름 API 가 존재한다',
  typeof A.requestTaskStop === 'function' && typeof A.taskFlowsFor === 'function'
  && typeof A.availableDecisions === 'function' && typeof A.pendingStopRequest === 'function',
  'requestTaskStop/taskFlowsFor/availableDecisions/pendingStopRequest 존재');

// ════════════════════════════════════════════════════════════════════════════
// 추적 부모는 어떤 결정도 받지 않는다 (T1~T3)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 추적 부모 결정 차단 ---');

red('T1. 추적 부모에는 제시되는 결정이 0개다(요청팀장·HQ·수행팀장 모두)',
  (() => { reset();
    const pair = collab();
    const parent = readTask(pair.parent.ref.taskId);
    return [LEAD_CS, HQ, LEAD_DESIGN].every((actor) => A.availableDecisions(parent, actor).length === 0);
  })(),
  (() => { reset();
    const pair = collab();
    const parent = readTask(pair.parent.ref.taskId);
    return `요청팀장에게 [${A.availableDecisions(parent, LEAD_CS).map((d) => d.kind).join(',') || '없음'}] 제시됨`;
  })(), '3역할 모두 0개');

red('T2. 추적 부모에 결정을 직접 호출해도 전부 거부되고 부모·자식이 불변이다',
  (() => {
    return DECISIONS.every((kind) => {
      reset();
      const pair = collab();
      const pid = pair.parent.ref.taskId, cid = pair.child.ref.taskId;
      const beforeP = JSON.stringify(readTask(pid)), beforeC = JSON.stringify(readTask(cid));
      const byOwner = A.applyDecision(pid, { kind, actor: LEAD_CS, reason: '사유' }, { nowIso: AT, newId: ids.newId });
      const byHq = A.applyDecision(pid, { kind, actor: HQ, reason: '사유' }, { nowIso: AT, newId: ids.newId });
      return byOwner.ok === false && byHq.ok === false
        && JSON.stringify(readTask(pid)) === beforeP
        && JSON.stringify(readTask(cid)) === beforeC
        && S.loadLifecycleTasks().length === 2;   // revision 도 생기면 안 된다
    });
  })(), '요청팀장이 추적 부모를 직접 stopped 로 만들 수 있음(자식은 그대로 살아 있는 유령 상태)',
  '5개 결정 × 2역할 모두 거부 · 부모·자식 불변');

red('T3. 화면도 추적 흐름에서는 결정 버튼을 계산하지 않는다',
  (() => {
    // availableDecisions 가 flow.actionable 과 무관하게 계산되면 추적 카드에 버튼이 뜬다.
    const gated = /const decisions = canAct \? availableDecisions\(t, actor\) : \[\]/.test(teamTaskPanel)
      || /canAct && availableDecisions\(t, actor\)/.test(teamTaskPanel);
    return gated;
  })(), 'TeamTaskPanel 이 canAct 와 무관하게 availableDecisions(t, actor) 를 계산함',
  'actionable 흐름에서만 계산');

// ════════════════════════════════════════════════════════════════════════════
// 협업 중단 요청은 수행 자식에 도착한다 (T4~T10)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 협업 중단 요청이 수행팀에 도착 ---');

red('T4. 요청팀이 추적 흐름에서 중단 요청하면 수행 자식에 요청자·사유·시각이 쌓인다',
  (() => { reset();
    const pair = collab();
    const flow = A.taskFlowsFor(LEAD_CS)[0];
    // 화면은 흐름 하나만 들고 있다. 그 흐름에서 중단 요청을 누른다.
    const r = A.requestTaskStop(flow.task.ref.taskId, { reason: '캠페인 취소로 문구 불필요', actor: LEAD_CS }, { nowIso: AT2 });
    const child = readTask(pair.child.ref.taskId);
    const reqs = child.stopRequests ?? [];
    return r.ok === true && reqs.length === 1
      && reqs[0].reason === '캠페인 취소로 문구 불필요'
      && reqs[0].requestedAt === AT2 && reqs[0].requestedBy.teamId === 'cs';
  })(), '요청이 추적 부모에만 쌓여 수행 자식(=수행팀 화면)에는 도착하지 않음',
  '수행 자식에 1건 기록');

red('T5. 같은 요청이 부모·자식에 복제되지 않는다(수행 자식에만 한 번)',
  (() => { reset();
    collab();
    const flow = A.taskFlowsFor(LEAD_CS)[0];
    A.requestTaskStop(flow.task.ref.taskId, { reason: '중복 확인', actor: LEAD_CS }, { nowIso: AT2 });
    const all = S.loadLifecycleTasks();
    const total = all.reduce((n, t) => n + (t.stopRequests ?? []).length, 0);
    const parent = all.find((t) => t.trackingOnly);
    return total === 1 && (parent.stopRequests ?? []).length === 0;
  })(), '부모에 기록되어 자식에는 0건(또는 양쪽 복제)', '전체 1건 · 부모 0건');

red('T6. 요청 직후 부모·자식의 상태·수행자·결과물·결정 이력이 그대로다',
  (() => { reset();
    const pair = collab();
    const cid = pair.child.ref.taskId, pid = pair.parent.ref.taskId;
    A.assignExecutor(cid, { kind: 'human', actor: LEAD_DESIGN }, { nowIso: AT });
    A.submitResult(cid, { resultSummary: '문구 초안', artifactRefs: ['art-1'], actor: LEAD_DESIGN }, { nowIso: AT });
    const beforeC = JSON.parse(JSON.stringify(readTask(cid)));
    const beforeP = JSON.parse(JSON.stringify(readTask(pid)));
    const flow = A.taskFlowsFor(LEAD_CS)[0];
    A.requestTaskStop(flow.task.ref.taskId, { reason: '방향 변경', actor: LEAD_CS }, { nowIso: AT2 });
    const afterC = readTask(cid), afterP = readTask(pid);
    return afterC.status === beforeC.status && afterP.status === beforeP.status
      && afterC.executorId === beforeC.executorId
      && afterC.resultSummary === beforeC.resultSummary
      && JSON.stringify(afterC.artifactRefs) === JSON.stringify(beforeC.artifactRefs)
      && afterC.decisions.length === beforeC.decisions.length
      && afterP.decisions.length === beforeP.decisions.length;
  })(), '요청만으로 상태·이력이 바뀜(또는 자식에 도달하지 않아 검증 불가)',
  '부모·자식 모두 불변');

red('T7. 수행팀 화면에 같은 요청과 사유가 보인다',
  (() => { reset();
    collab();
    const reqFlow = A.taskFlowsFor(LEAD_CS)[0];
    A.requestTaskStop(reqFlow.task.ref.taskId, { reason: '캠페인 취소', actor: LEAD_CS }, { nowIso: AT2 });
    const doerFlow = A.taskFlowsFor(LEAD_DESIGN)[0];
    const shown = shownStopRequest(doerFlow);
    return !!shown && shown.reason === '캠페인 취소' && shown.requestedBy.teamId === 'cs';
  })(), '수행팀 흐름에서 중단 요청이 보이지 않음', '수행팀 화면에 사유까지 표시');

red('T8. 요청팀·HQ 추적 화면에도 같은(수행 자식의) 요청이 보인다',
  (() => { reset();
    collab();
    const reqFlow = A.taskFlowsFor(LEAD_CS)[0];
    A.requestTaskStop(reqFlow.task.ref.taskId, { reason: '캠페인 취소', actor: LEAD_CS }, { nowIso: AT2 });
    const cs = shownStopRequest(A.taskFlowsFor(LEAD_CS)[0]);
    const hq = shownStopRequest(A.taskFlowsFor(HQ)[0]);
    return !!cs && !!hq && cs.reason === '캠페인 취소' && hq.reason === '캠페인 취소';
  })(), '추적 화면이 부모만 읽어 자식의 요청을 못 봄', '요청팀·HQ 모두 동일 요청 표시');

red('T9. 수행팀장이 사유와 함께 중단해야 자식과 추적 부모가 stopped 가 된다',
  (() => { reset();
    const pair = collab();
    const cid = pair.child.ref.taskId, pid = pair.parent.ref.taskId;
    const reqFlow = A.taskFlowsFor(LEAD_CS)[0];
    A.requestTaskStop(reqFlow.task.ref.taskId, { reason: '캠페인 취소', actor: LEAD_CS }, { nowIso: AT2 });
    const midChild = readTask(cid).status, midParent = readTask(pid).status;
    // 요청팀장이 자식을 직접 중단하려 하면 거부된다(수행팀 일이다).
    const byRequester = A.applyDecision(cid, { kind: 'stop', actor: LEAD_CS, reason: '내가 중단' }, { nowIso: AT2 });
    const r = A.applyDecision(cid, { kind: 'stop', actor: LEAD_DESIGN, reason: '요청 확인 후 중단' }, { nowIso: AT2 });
    const child = readTask(cid), parent = readTask(pid);
    return midChild === 'open' && midParent === 'open'
      && byRequester.ok === false
      && r.ok === true && child.status === 'stopped' && parent.status === 'stopped';
  })(), '요청만으로 상태가 바뀌거나 수행팀장 중단이 부모에 반영되지 않음',
  '요청 후 불변 → 수행팀장 중단 시 자식·부모 stopped');

red('T10. 중단 요청 기록과 수행팀장의 중단 결정이 모두 보존된다',
  (() => { reset();
    const pair = collab();
    const cid = pair.child.ref.taskId, pid = pair.parent.ref.taskId;
    const reqFlow = A.taskFlowsFor(LEAD_CS)[0];
    A.requestTaskStop(reqFlow.task.ref.taskId, { reason: '캠페인 취소', actor: LEAD_CS }, { nowIso: AT2 });
    A.applyDecision(cid, { kind: 'stop', actor: LEAD_DESIGN, reason: '요청 확인 후 중단' }, { nowIso: AT2 });
    const child = readTask(cid), parent = readTask(pid);
    return (child.stopRequests ?? []).length === 1
      && (child.stopRequests ?? [])[0].reason === '캠페인 취소'
      && child.decisions.some((d) => d.kind === 'stop' && d.actorTeamId === 'design' && d.reason === '요청 확인 후 중단')
      && JSON.stringify(parent).includes('요청 확인 후 중단');   // 추적 부모에도 결말·사유가 보인다
  })(), '요청 또는 결정 기록이 소실됨', '요청·결정 모두 보존 · 부모에 결말 전달');

// ════════════════════════════════════════════════════════════════════════════
// 종료 상태 표시 · 요청 권한 · 단일 업무 무회귀 (T11~T13)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 종료 표시 · 요청 권한 · 단일 업무 ---');

red('T11. 종료된 업무는 중단 요청 대기로 표시하지 않되 원기록은 지우지 않는다',
  (() => {
    const TERMINALS = ['stopped', 'completed', 'not_adopted', 'returned', 'superseded', 'failed'];
    return TERMINALS.every((st) => {
      reset();
      const t = A.createDirectiveTask({ title: 'HQ 지시', targetTeamId: 'product', instructedBy: HQ }, ids);
      A.requestTaskStop(t.ref.taskId, { reason: '중단 요청 원문', actor: HQ }, { nowIso: AT });
      S.saveLifecycleTasks(S.loadLifecycleTasks().map((x) =>
        (x.ref.taskId === t.ref.taskId ? { ...x, status: st } : x)));
      const after = readTask(t.ref.taskId);
      return A.pendingStopRequest(after) === null
        && (after.stopRequests ?? []).length === 1
        && after.stopRequests[0].reason === '중단 요청 원문';
    });
  })(), '일부 종료 상태에서 여전히 대기로 표시되거나 기록이 사라짐',
  '6개 종료 상태 모두 대기 표시 종료 · 원기록 보존');

red('T12. 협업 중단 요청은 HQ·원 요청팀만 가능하고 무관한 팀은 거부된다',
  (() => { reset();
    collab();
    const flow = A.taskFlowsFor(LEAD_CS)[0];
    const target = flow.task.ref.taskId;
    const byOutsider = A.requestTaskStop(target, { reason: '남의 일', actor: LEAD_PRODUCT }, { nowIso: AT2 });
    const byHq = A.requestTaskStop(target, { reason: '총괄 판단', actor: HQ }, { nowIso: AT2 });
    const byRequester = A.requestTaskStop(target, { reason: '요청팀 판단', actor: LEAD_CS }, { nowIso: AT2 });
    const child = S.loadLifecycleTasks().find((x) => !x.trackingOnly);
    return byOutsider.ok === false && byHq.ok === true && byRequester.ok === true
      && (child.stopRequests ?? []).length === 2;
  })(), '요청 권한 판정이 자식 기준으로 서지 않음', '무관한 팀 거부 · HQ·요청팀 허용');

red('T13. 기존 HQ→담당팀 단일 업무의 중단 요청 흐름은 그대로 통과한다(무회귀)',
  (() => { reset();
    const t = A.createDirectiveTask({ title: '재고 점검', targetTeamId: 'product', instructedBy: HQ }, ids);
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    const req = A.requestTaskStop(t.ref.taskId, { reason: '우선순위 변경', actor: HQ }, { nowIso: AT });
    const mid = readTask(t.ref.taskId);
    const shown = A.pendingStopRequest(mid);
    const stop = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '요청 확인 후 중단' }, { nowIso: AT2 });
    const after = readTask(t.ref.taskId);
    return req.ok === true && mid.status === 'in_progress' && !!shown && shown.reason === '우선순위 변경'
      && stop.ok === true && after.status === 'stopped'
      && (after.stopRequests ?? []).length === 1 && A.pendingStopRequest(after) === null;
  })(), '단일 업무 중단 흐름이 깨짐', '요청→표시→팀장 중단→대기 종료');

// ════════════════════════════════════════════════════════════════════════════
// 협업 생성 권한·신원·타깃 (T14)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 협업 생성 fail-closed ---');

red('T14. 협업 생성은 인간 팀장이 자기 팀 명의로 다른 팀에 요청할 때만 성립한다',
  (() => { reset();
    // (a) HQ 직접 생성 → 거부
    const byHq = tryCollab({ title: 'x', requestingTeamId: 'hq', targetTeamId: 'design', instructedBy: HQ });
    // (b) 요청팀 사칭(instructedBy 와 requestingTeamId 불일치) → 거부
    const spoof = tryCollab({ title: 'x', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_PRODUCT });
    // (c) 동일 팀 대상 → 거부
    const sameTeam = tryCollab({ title: 'x', requestingTeamId: 'cs', targetTeamId: 'cs', instructedBy: LEAD_CS });
    // (d) AI 명의 생성 → 거부
    const byAgent = tryCollab({ title: 'x', requestingTeamId: 'cs', targetTeamId: 'design',
      instructedBy: { kind: 'agent', teamId: 'cs', label: '문의 AI', agentId: 'inquiry_analyst' } });
    const savedAfterRejects = S.loadLifecycleTasks().length;
    // (e) 정상 → 성립
    const okCase = tryCollab({ title: 'x', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS });
    return byHq.rejected && spoof.rejected && sameTeam.rejected && byAgent.rejected
      && savedAfterRejects === 0 && !okCase.rejected;
  })(), 'HQ 직접 생성·요청팀 사칭·동일 팀·AI 명의가 모두 그대로 통과(저장까지 됨)',
  '4종 거부 · 저장 0건 · 정상만 성립');

// ════════════════════════════════════════════════════════════════════════════
// UI 우회 · 주석 정합 (T15~T16)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- UI 우회 · 문서 정합 ---');

red('T15. 화면이 상태를 직접 조작하는 우회 경로가 없다',
  (() => {
    // 화면은 계약 함수만 부른다. 저장소를 직접 쓰거나 status 를 직접 만들지 않는다.
    const directStore = /saveLifecycleTasks?\(|localStorage\.setItem\(\s*['"]godo_lifecycle/.test(teamTaskPanel);
    const directStatus = /status:\s*'stopped'|status:\s*'completed'/.test(teamTaskPanel);
    // 추적 흐름의 중단 요청 대상이 부모가 아니라 수행 자식이어야 한다.
    const requestsChild = /onRequestStop\(\(flow\.tracking \?\? t\)\.ref\.taskId|onRequestStop\(targetTaskId/.test(teamTaskPanel);
    const readsChild = /pendingStopRequest\(flow\.tracking \?\? t\)|pendingStopRequest\(trackedOrSelf/.test(teamTaskPanel);
    return !directStore && !directStatus && requestsChild && readsChild;
  })(), '중단 요청·표시 대상이 추적 부모(t)로 고정되어 수행 자식에 닿지 않음',
  '직접 조작 없음 · 요청/표시 모두 수행 자식 기준');

red('T16. 계약의 중단 권한 주석이 현재 정책과 일치한다',
  (() => {
    // D-1.3 시절의 '요청자도 중단 가능' 설명이 남아 있으면 코드와 문서가 어긋난다.
    const stale = /중단: 아직 팀 손에 있는 동안\(open\/in_progress\)은 요청자 또는 책임 팀장/.test(contractSrc)
      || /요청한 쪽이나 담당 팀장만 중단할 수 있습니다/.test(contractSrc);
    const current = /중단 요청/.test(contractSrc) && /담당 팀장만/.test(contractSrc);
    return !stale && current;
  })(), 'canDecide 주석이 아직 "요청자 또는 책임 팀장" 으로 남아 실제 구현과 불일치',
  '주석이 현재 정책과 일치');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (협업 중단 흐름 T1~T16)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
if (redUnmet > 0) {
  console.log(`\n✗ RC-2 D-1.3.2 — ${redUnmet}건 미충족`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1.3.2 GREEN 도달 (협업 중단이 수행팀에 도착하고 추적 부모는 결정을 받지 않는다)');
