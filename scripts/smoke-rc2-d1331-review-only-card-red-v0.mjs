#!/usr/bin/env node
/*
 * scripts/smoke-rc2-d1331-review-only-card-red-v0.mjs
 * RC-2 D-1.3.3.1 — HQ 확인요청 카드는 '결정만' 받는다 (RED 진단)
 *
 * 배경: D-1.3.3 의 U19 는 세 행동이 **포함**됐는지만 봤다(every/includes).
 *   그래서 실제 결과가 [approve, request_revision, not_adopted, **stop**] 이어도 통과했다.
 *   canDecide(stop) 이 awaiting_approval 에서 '현재 확인 단계 담당자' 를 허용하는데,
 *   HQ 확인요청 카드는 그 담당자가 HQ 라서 중단이 열린다.
 *
 * 확정 정책: HQ 확인요청은 **이미 제출된 제안을 결정하는 카드**다.
 *   중단할 수행 작업도, 수행자도 없다.
 *   확인 완료 · 수정 요청 · 이번에는 사용 안 함 — 이 셋만 가능하다.
 *
 * **제품 소스는 한 줄도 고치지 않는다(RED 전용).**
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2d1331-'));

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
const apprDetail = src('src/components/ApprovalDetailModal.tsx');
const taskResult = src('src/components/TaskResultModal.tsx');
const appSource = src('src/App.tsx');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1.3.3.1 — HQ 확인요청은 결정만 받는다 (RED 진단) ===');

const AT = '2026-07-23T00:00:00.000Z';
const AT2 = '2026-07-23T04:00:00.000Z';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const reset = () => { store.clear(); _n = 0; };
const HQ = A.actorForRole('hq');
const LEAD_CS = A.actorForRole('cs');
const LEAD_DESIGN = A.actorForRole('design');
const LEAD_PRODUCT = A.actorForRole('product');
const readTask = (id) => S.loadLifecycleTasks().find((x) => x.ref.taskId === id);
const sorted = (a) => [...a].sort();

const MSG = {
  id: 'tmsg-901',
  from: { kind: 'human', teamId: 'cs', label: 'CS팀장' },
  toTeam: 'hq',
  kind: 'confirm',
  title: '환불 규정 개정안 확인 요청',
  body: '30일 이내 무상 반품으로 바꾸는 안입니다.',
  attachments: [],
  createdAt: AT
};

/** HQ 확인요청 카드 1건을 만들고 그 정본을 돌려준다. */
const hqCard = () => {
  reset();
  const r = A.createHqReviewRequest({ message: MSG, actor: LEAD_CS }, ids);
  return r.ok ? readTask(r.task.ref.taskId) : null;
};

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. HQ 확인요청 생성기가 존재하고 카드가 만들어진다(D-1.3.3 산출물)',
  (() => { const t = hqCard(); return !!t && t.status === 'awaiting_approval' && t.ownerTeamId === 'cs'; })(),
  '카드 1건 · 결정 대기 · 책임팀 CS');

base('B2. 일반 실행 업무의 중단 기능은 현재도 동작한다(무회귀 기준선)',
  (() => { reset();
    const t = A.createDirectiveTask({ title: '재고 점검', targetTeamId: 'product', instructedBy: HQ }, ids);
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    return A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '중단' }, { nowIso: AT2 }).ok === true;
  })(), '일반 업무 중단 가능');

// ════════════════════════════════════════════════════════════════════════════
// 결정 집합이 정확히 셋 (V1~V5)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 결정 집합 정확 일치 ---');

const EXPECTED = sorted(['approve', 'request_revision', 'not_adopted']);

red('V1. HQ 에게 제시되는 결정이 정확히 3개(확인 완료·수정 요청·미채택)다',
  (() => { const t = hqCard(); if (!t) return false;
    const got = sorted(A.availableDecisions(t, HQ).map((d) => d.kind));
    return got.length === 3 && JSON.stringify(got) === JSON.stringify(EXPECTED);
  })(),
  (() => { const t = hqCard(); if (!t) return '카드 생성 실패';
    const got = A.availableDecisions(t, HQ).map((d) => d.kind);
    return `실제 ${got.length}개 = [${got.join(', ')}] — 네 번째 행동이 열려 있음`;
  })(), '정확히 3개 · 집합 일치');

red('V2. HQ 의 작업 중단은 거부되고 레코드 전체가 불변이다',
  (() => { const t = hqCard(); if (!t) return false;
    const before = JSON.stringify(t);
    const r = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: HQ, reason: '그만' }, { nowIso: AT2 });
    return r.ok === false && JSON.stringify(readTask(t.ref.taskId)) === before;
  })(),
  (() => { const t = hqCard(); if (!t) return '카드 생성 실패';
    const r = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: HQ, reason: '그만' }, { nowIso: AT2 });
    return `stop 이 ok=${r.ok} 로 통과 → 상태 ${readTask(t.ref.taskId).status}`;
  })(), 'stop 거부 · 레코드 불변');

red('V3. HQ 의 수행 불가 반송도 거부되고 불변이다',
  (() => { const t = hqCard(); if (!t) return false;
    const before = JSON.stringify(t);
    const r = A.applyDecision(t.ref.taskId, { kind: 'return', actor: HQ, reason: '돌려보냄' }, { nowIso: AT2 });
    return r.ok === false && JSON.stringify(readTask(t.ref.taskId)) === before;
  })(), 'return 이 통과하거나 레코드가 바뀜', 'return 거부 · 레코드 불변');

red('V4. HQ 의 중단 요청도 거부되고 stopRequests 가 생기지 않는다',
  (() => { const t = hqCard(); if (!t) return false;
    const r = A.requestTaskStop(t.ref.taskId, { reason: '중단해 주세요', actor: HQ }, { nowIso: AT2 });
    const after = readTask(t.ref.taskId);
    return r.ok === false && (after.stopRequests ?? []).length === 0;
  })(),
  (() => { const t = hqCard(); if (!t) return '카드 생성 실패';
    const r = A.requestTaskStop(t.ref.taskId, { reason: 'x', actor: HQ }, { nowIso: AT2 });
    return `requestTaskStop 이 ok=${r.ok} · stopRequests ${(readTask(t.ref.taskId).stopRequests ?? []).length}건`;
  })(), '중단 요청 거부 · 기록 0건');

red('V5. 보낸 팀·무관한 팀의 결정은 계속 0개다',
  (() => { const t = hqCard(); if (!t) return false;
    return A.availableDecisions(t, LEAD_CS).length === 0
      && A.availableDecisions(t, LEAD_DESIGN).length === 0
      && A.availableDecisions(t, LEAD_PRODUCT).length === 0;
  })(), '보낸 팀·타 팀에 결정이 제시됨', '3역할 모두 0개');

// ════════════════════════════════════════════════════════════════════════════
// 사유 규칙 (V6~V8)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 사유 규칙 ---');

red('V6. 확인 완료는 사유 없이 허용된다',
  (() => { const t = hqCard(); if (!t) return false;
    const r = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: HQ }, { nowIso: AT2 });
    return r.ok === true && readTask(t.ref.taskId).status === 'completed';
  })(), '사유 없는 확인 완료가 거부됨', '사유 없이 완료');

red('V7. 수정 요청은 사유가 없거나 공백이면 서비스에서 거부된다',
  (() => {
    for (const reason of [undefined, '', '   ']) {
      const t = hqCard(); if (!t) return false;
      const before = JSON.stringify(t);
      const r = A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: HQ, reason },
        { nowIso: AT2, newId: ids.newId });
      if (r.ok !== false) return false;
      if (JSON.stringify(readTask(t.ref.taskId)) !== before) return false;
      if (S.loadLifecycleTasks().length !== 1) return false;   // revision 도 생기면 안 된다
    }
    return true;
  })(), '사유 없이도 수정 요청이 통과해 새 업무가 생김', '3종 입력 모두 거부 · revision 0');

red('V8. 이번에는 사용 안 함도 사유가 없거나 공백이면 거부된다',
  (() => {
    for (const reason of [undefined, '', '   ']) {
      const t = hqCard(); if (!t) return false;
      const before = JSON.stringify(t);
      const r = A.applyDecision(t.ref.taskId, { kind: 'not_adopted', actor: HQ, reason }, { nowIso: AT2 });
      if (r.ok !== false) return false;
      if (JSON.stringify(readTask(t.ref.taskId)) !== before) return false;
    }
    return true;
  })(), '사유 없이도 미채택이 통과함', '3종 입력 모두 거부 · 불변');

// ════════════════════════════════════════════════════════════════════════════
// 수정본은 일반 실행 업무 (V9~V10)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 수정 요청으로 생긴 업무 ---');

const revisionOfHqCard = () => {
  const t = hqCard();
  if (!t) return null;
  A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: HQ, reason: '기간을 14일로 줄여 주세요' },
    { nowIso: AT2, newId: ids.newId });
  return S.loadLifecycleTasks().find((x) => x.ref.revisionOfTaskId === t.ref.taskId) ?? null;
};

red('V9. 새 수정 업무는 일반 실행 업무이며 확인 전용 속성을 승계하지 않는다',
  (() => { const rev = revisionOfHqCard(); if (!rev) return false;
    return rev.reviewOnly !== true && rev.trackingOnly !== true
      && rev.status === 'open' && rev.executorKind === 'unassigned' && rev.ownerTeamId === 'cs';
  })(),
  (() => { const rev = revisionOfHqCard();
    return rev ? `reviewOnly=${rev.reviewOnly} · status=${rev.status}` : '수정본 없음(사유 규칙 미적용 등)';
  })(), '확인 전용 속성 미승계 · CS팀의 일반 open 업무');

red('V10. 새 수정 업무에서는 수행자 선택·직접 처리·결과 제출이 정상 동작한다',
  (() => { const rev = revisionOfHqCard(); if (!rev) return false;
    const rid = rev.ref.taskId;
    const assign = A.assignExecutor(rid, { kind: 'human', actor: LEAD_CS }, { nowIso: AT2 });
    const submit = A.submitResult(rid, { resultSummary: '14일로 수정했습니다', actor: LEAD_CS }, { nowIso: AT2 });
    const after = readTask(rid);
    return assign.ok === true && submit.ok === true && after.status === 'awaiting_approval';
  })(), '수정 업무에서 실행 경로가 막힘', '배정·제출 정상');

// ════════════════════════════════════════════════════════════════════════════
// 실행 경로 차단 (V11)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- HQ 확인 카드의 실행 경로 ---');

red('V11. HQ 확인 카드에는 배정·인수·제출·중단·중단 요청이 모두 없다',
  (() => { const t = hqCard(); if (!t) return false;
    const before = JSON.stringify(t);
    const rs = [
      A.assignExecutor(t.ref.taskId, { kind: 'human', actor: HQ }, { nowIso: AT2 }),
      A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_CS }, { nowIso: AT2 }),
      A.takeOverByLead(t.ref.taskId, { actor: LEAD_CS }, { nowIso: AT2 }),
      A.submitResult(t.ref.taskId, { resultSummary: 'x', actor: LEAD_CS }, { nowIso: AT2 }),
      A.applyDecision(t.ref.taskId, { kind: 'stop', actor: HQ, reason: 'x' }, { nowIso: AT2 }),
      A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_CS, reason: 'x' }, { nowIso: AT2 }),
      A.requestTaskStop(t.ref.taskId, { reason: 'x', actor: HQ }, { nowIso: AT2 }),
      A.requestTaskStop(t.ref.taskId, { reason: 'x', actor: LEAD_CS }, { nowIso: AT2 })
    ];
    return rs.every((r) => r.ok === false) && JSON.stringify(readTask(t.ref.taskId)) === before;
  })(), '일부 실행 경로가 열려 있음', '8종 모두 거부 · 레코드 불변');

// ════════════════════════════════════════════════════════════════════════════
// 화면 표시 (V12~V13)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 화면 표시 ---');

red('V12. 업무 화면이 확인 카드에 수행자 미정 대신 제출팀·제출자를 보여 준다',
  (() => {
    // 확인 카드에서는 '수행자: 미정' 이 아니라 실제 의미(제출팀·제출자)를 보여 준다.
    const gatedExecutor = /!isReviewOnly && \(\s*\n?\s*<span>수행자:|isReviewOnly \? \(/.test(teamTaskPanel);
    const showsSubmitter = /제출팀:/.test(teamTaskPanel) && /제출:/.test(teamTaskPanel);
    const knowsReviewOnly = /reviewOnly/.test(teamTaskPanel);
    return knowsReviewOnly && gatedExecutor && showsSubmitter;
  })(), "확인 카드에도 '수행자: 미정' 이 그대로 표시됨(실행 업무처럼 보임)",
  '수행자 미정 숨김 · 제출팀·제출자 표시');

red('V13. 승인 상세·결과 모달이 확인 카드에 작업 중단을 노출하지 않는다',
  (() => {
    // 화면은 정본에서 판정한 값을 받아 onCancel 을 비운다(문자열 추측 금지).
    const appGates = /reviewOnly/.test(appSource)
      && /onCancel=\{[^}]*reviewOnly[^}]*\}|onCancel=\{cancelHandlerFor\(/.test(appSource);
    // 일반 업무의 중단 버튼은 그대로 남아 있어야 한다(전역 삭제 금지).
    const keepsGeneralCancel = /onCancel && \(/.test(apprDetail) && /onCancel/.test(taskResult);
    return appGates && keepsGeneralCancel;
  })(), 'App 이 모든 항목에 같은 onCancel 을 넘겨 확인 카드에도 작업 중단이 뜸',
  '확인 카드만 onCancel 비움 · 일반 업무는 유지');

// ════════════════════════════════════════════════════════════════════════════
// 무회귀 (V14~V15)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 무회귀 ---');

red('V14. 일반 실행 업무와 HQ→팀 업무의 중단 기능이 그대로다',
  (() => {
    // (a) 팀 자체 업무: 담당 팀장이 중단
    reset();
    const own = A.createManualTask({ title: '팀 자체', assignedAgentId: '', createdBy: LEAD_PRODUCT }, ids);
    A.assignExecutor(own.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    const a = A.applyDecision(own.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '중단' }, { nowIso: AT2 });
    // (b) HQ→팀 지시: HQ 요청 → 담당 팀장 중단
    reset();
    const t = A.createDirectiveTask({ title: 'HQ 지시', targetTeamId: 'product', instructedBy: HQ }, ids);
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    const req = A.requestTaskStop(t.ref.taskId, { reason: '우선순위 변경', actor: HQ }, { nowIso: AT });
    const shown = A.pendingStopRequest(readTask(t.ref.taskId));
    const b = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '확인 후 중단' }, { nowIso: AT2 });
    return a.ok === true && req.ok === true && !!shown && b.ok === true
      && readTask(t.ref.taskId).status === 'stopped';
  })(), '일반 업무 중단 기능이 함께 막힘', '팀 자체·HQ 지시 모두 정상');

red('V15. 팀→팀 협업의 중단 요청·수행팀장 중단 흐름이 그대로다',
  (() => { reset();
    const pair = A.createCollaborationRequest(
      { title: '문구 요청', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS }, ids);
    const flow = A.taskFlowsFor(LEAD_CS)[0];
    const req = A.requestTaskStop(flow.task.ref.taskId, { reason: '캠페인 취소', actor: LEAD_CS }, { nowIso: AT2 });
    const child = readTask(pair.child.ref.taskId);
    const shown = A.pendingStopRequest(child);
    const stop = A.applyDecision(child.ref.taskId, { kind: 'stop', actor: LEAD_DESIGN, reason: '요청 확인 후 중단' }, { nowIso: AT2 });
    return req.ok === true && (child.stopRequests ?? []).length === 1 && !!shown
      && stop.ok === true && readTask(pair.child.ref.taskId).status === 'stopped'
      && readTask(pair.parent.ref.taskId).status === 'stopped';
  })(), '협업 중단 흐름 회귀', '요청→수행팀 도착→수행팀장 중단→부모 반영');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (HQ 확인요청 결정 전용 V1~V15)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
if (redUnmet > 0) {
  console.log(`\n✗ RC-2 D-1.3.3.1 — ${redUnmet}건 미충족`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1.3.3.1 GREEN 도달 (확인요청은 결정 3개만, 실행 경로 없음)');
