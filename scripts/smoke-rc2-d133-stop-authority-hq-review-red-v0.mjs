#!/usr/bin/env node
/*
 * scripts/smoke-rc2-d133-stop-authority-hq-review-red-v0.mjs
 * RC-2 D-1.3.3 — 수행팀 중단 요청 권한 폐쇄 · 팀→HQ 확인요청 결정 흐름 (RED 진단)
 *
 * 확정 정책:
 *   ① 정식 '중단 요청' 은 HQ 또는 **원 요청팀**만 보낸다.
 *      수행팀장은 요청하지 않는다 — 자기 팀 일이므로 직접 작업 중단으로 처리한다.
 *   ② HQ 는 실무 수행팀이 아니다.
 *      팀→HQ 일반전달·지원요청 = 메시지만.
 *      팀→HQ 확인요청 = 팀이 이미 만든 제안을 **HQ 가 결정**하는 요청(부모·자식 협업 아님).
 *      기존 승인 대기 구조를 재사용해 확인 완료 / 수정 요청 / 이번에는 사용 안 함 중 하나만.
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
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2d133-'));

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
const deptPanel = src('src/components/DepartmentWorkspacePanel.tsx');
const teamTaskPanel = src('src/components/TeamTaskPanel.tsx');
const contractSrc = src('src/services/taskLifecycleContract.ts');
const adapterSrc = src('src/services/taskLifecycleAppAdapter.ts');
const chatConsole = src('src/components/ChatConsole.tsx');
const controlChat = src('src/services/controlChatService.ts');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1.3.3 — 중단 요청 권한 · 팀→HQ 확인요청 (RED 진단) ===');

const AT = '2026-07-23T00:00:00.000Z';
const AT2 = '2026-07-23T03:00:00.000Z';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const reset = () => { store.clear(); _n = 0; };
const HQ = A.actorForRole('hq');
const LEAD_CS = A.actorForRole('cs');
const LEAD_DESIGN = A.actorForRole('design');
const LEAD_PRODUCT = A.actorForRole('product');
const readTask = (id) => S.loadLifecycleTasks().find((x) => x.ref.taskId === id);
const hasFn = (n) => typeof A[n] === 'function';
const noFn = (n) => `${n}() 없음`;

const collab = () => A.createCollaborationRequest(
  { title: '상세 문구 요청', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS }, ids);

/** 팀→HQ 확인요청의 원본 메시지(첨부에 큰 dataUrl 포함). */
const MSG = {
  id: 'tmsg-001',
  from: { kind: 'human', teamId: 'cs', label: 'CS팀장' },
  toTeam: 'hq',
  kind: 'confirm',
  title: '환불 규정 개정안 확인 요청',
  body: '30일 이내 무상 반품으로 바꾸는 안입니다. 검토 부탁드립니다.',
  attachments: [{ name: '개정안.png', size: 120000, mime: 'image/png', dataUrl: 'data:image/png;base64,AAAABBBBCCCC' }],
  createdAt: AT
};

const tryHqReview = (input, over = {}) => {
  if (!hasFn('createHqReviewRequest')) return { rejected: true, missing: true };
  try {
    const r = A.createHqReviewRequest(input, { newId: ids.newId, nowIso: AT, ...over });
    if (r && r.ok === false) return { rejected: true, reason: r.reason };
    return { rejected: false, value: r?.task ?? r };
  } catch (e) {
    return { rejected: true, reason: e?.message };
  }
};

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. 중단 요청·협업·결정 API 가 존재한다(D-1.3.2 산출물)',
  ['requestTaskStop', 'createCollaborationRequest', 'applyDecision', 'taskFlowsFor'].every(hasFn),
  '4개 함수 존재');

base('B2. HQ 결정 경로(escalation)가 계약에 이미 있다',
  !!L.APPROVAL_ROUTES?.escalation && L.APPROVAL_ROUTES.escalation.stages[0].approverKind === 'hq',
  'escalation 1단계 = 총괄 결정');

// ════════════════════════════════════════════════════════════════════════════
// 중단 요청 권한 (U1~U7)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 중단 요청은 HQ·원 요청팀만 ---');

red('U1. 수행팀장이 정식 중단 요청을 보내면 거부된다',
  (() => { reset();
    const pair = collab();
    const cid = pair.child.ref.taskId;
    const r = A.requestTaskStop(cid, { reason: '내가 바쁨', actor: LEAD_DESIGN }, { nowIso: AT2 });
    return r.ok === false;
  })(),
  (() => { reset();
    const pair = collab();
    const r = A.requestTaskStop(pair.child.ref.taskId, { reason: '내가 바쁨', actor: LEAD_DESIGN }, { nowIso: AT2 });
    return `수행팀장 요청이 ok=${r.ok} 로 통과함`;
  })(), '수행팀장 요청 거부');

red('U2. 거부 시 상태·수행자·결과물·결정 이력·stopRequests 가 모두 불변이다',
  (() => { reset();
    const pair = collab();
    const cid = pair.child.ref.taskId;
    A.assignExecutor(cid, { kind: 'human', actor: LEAD_DESIGN }, { nowIso: AT });
    A.submitResult(cid, { resultSummary: '초안', artifactRefs: ['art-1'], actor: LEAD_DESIGN }, { nowIso: AT });
    const before = JSON.stringify(readTask(cid));
    A.requestTaskStop(cid, { reason: '내가 바쁨', actor: LEAD_DESIGN }, { nowIso: AT2 });
    return JSON.stringify(readTask(cid)) === before;
  })(), '거부되지 않아 stopRequests 가 늘어남', '레코드 완전 불변');

red('U3. HQ 의 중단 요청은 허용된다',
  (() => { reset();
    const pair = collab();
    const r = A.requestTaskStop(pair.child.ref.taskId, { reason: '총괄 판단', actor: HQ }, { nowIso: AT2 });
    return r.ok === true && (readTask(pair.child.ref.taskId).stopRequests ?? []).length === 1;
  })(), 'HQ 요청 실패', 'HQ 요청 1건 기록');

red('U4. 원 요청팀의 중단 요청은 허용된다',
  (() => { reset();
    const pair = collab();
    const flow = A.taskFlowsFor(LEAD_CS)[0];
    const r = A.requestTaskStop(flow.task.ref.taskId, { reason: '요청팀 판단', actor: LEAD_CS }, { nowIso: AT2 });
    return r.ok === true && (readTask(pair.child.ref.taskId).stopRequests ?? []).length === 1;
  })(), '요청팀 요청 실패', '요청팀 요청 1건 기록');

red('U5. 무관한 팀의 중단 요청은 거부된다',
  (() => { reset();
    const pair = collab();
    const r = A.requestTaskStop(pair.child.ref.taskId, { reason: '남의 일', actor: LEAD_PRODUCT }, { nowIso: AT2 });
    return r.ok === false && (readTask(pair.child.ref.taskId).stopRequests ?? []).length === 0;
  })(), '무관한 팀 요청이 통과함', '무관한 팀 거부');

red('U6. 수행팀장은 applyDecision(stop) 으로만 실제 중단할 수 있다',
  (() => { reset();
    const pair = collab();
    const cid = pair.child.ref.taskId;
    const noReason = A.applyDecision(cid, { kind: 'stop', actor: LEAD_DESIGN }, { nowIso: AT2 });
    const ok = A.applyDecision(cid, { kind: 'stop', actor: LEAD_DESIGN, reason: '우선순위 뒤로 밀림' }, { nowIso: AT2 });
    const child = readTask(cid), parent = readTask(pair.parent.ref.taskId);
    return noReason.ok === false && ok.ok === true
      && child.status === 'stopped' && parent.status === 'stopped'
      && JSON.stringify(child).includes('우선순위 뒤로 밀림');
  })(), '수행팀장 직접 중단 경로가 깨짐', '사유 필수 · 자식·부모 stopped');

red('U7. 기존 HQ→팀 단일 업무와 팀→팀 협업 흐름이 모두 유지된다',
  (() => {
    // (a) HQ→팀 단일 업무: HQ 요청 → 담당 팀장 중단
    reset();
    const t = A.createDirectiveTask({ title: '재고 점검', targetTeamId: 'product', instructedBy: HQ }, ids);
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    const req = A.requestTaskStop(t.ref.taskId, { reason: '우선순위 변경', actor: HQ }, { nowIso: AT });
    const shown = A.pendingStopRequest(readTask(t.ref.taskId));
    const stop = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '확인 후 중단' }, { nowIso: AT2 });
    const single = req.ok && !!shown && stop.ok && readTask(t.ref.taskId).status === 'stopped';
    // (b) 팀→팀 협업: 추적 1 + 실행 1, 요청은 자식에
    reset();
    const pair = collab();
    const flows = A.taskFlowsFor(LEAD_CS);
    A.requestTaskStop(flows[0].task.ref.taskId, { reason: '취소', actor: LEAD_CS }, { nowIso: AT2 });
    const childReqs = (readTask(pair.child.ref.taskId).stopRequests ?? []).length;
    const parentReqs = (readTask(pair.parent.ref.taskId).stopRequests ?? []).length;
    return single && flows.length === 1 && childReqs === 1 && parentReqs === 0;
  })(), '기존 흐름 회귀', '단일 업무·팀간 협업 모두 정상');

// ════════════════════════════════════════════════════════════════════════════
// 팀→HQ 메시지 라우팅 (U8~U10, U24~U25)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 팀→HQ 메시지 라우팅 ---');

/** 메시지 종류·수신처만 보고 무엇을 만들지 정하는 순수 판정(문구 해석 금지). */
const routeOf = (from, toTeam, kind) => {
  if (typeof A.routeTeamMessage !== 'function') return null;
  return A.routeTeamMessage({ from: { kind: 'human', teamId: from, label: 'x' }, toTeam, kind });
};

red('U8. 팀→HQ 일반전달은 메시지만 만든다(업무 0건)',
  (() => { const r = routeOf('cs', 'hq', 'info');
    return !!r && r.createsCollaboration === false && r.createsHqReview === false;
  })(), noFn('routeTeamMessage'), '협업 X · HQ 결정 카드 X');

red('U9. 팀→HQ 지원요청도 메시지만 만든다(협업 부모·자식 생성 금지)',
  (() => { const r = routeOf('cs', 'hq', 'support');
    return !!r && r.createsCollaboration === false && r.createsHqReview === false;
  })(),
  (() => {
    // 현재 소비자는 support 이고 수신처가 자기 팀이 아니면 무조건 협업을 만든다 → HQ 가 수행팀이 된다.
    const rule = /input\.kind === 'support' && input\.from\.teamId !== 'hq' && input\.toTeam !== input\.from\.teamId/.test(deptPanel);
    return rule ? "소비자가 toTeam==='hq' 를 구분하지 않아 HQ 를 수행팀으로 만드는 협업이 생성됨" : noFn('routeTeamMessage');
  })(), '협업 X · HQ 결정 카드 X');

red('U10. 팀→HQ 확인요청은 메시지 1건 + HQ 결정 카드 1건만 만든다',
  (() => { const r = routeOf('cs', 'hq', 'confirm');
    return !!r && r.createsCollaboration === false && r.createsHqReview === true;
  })(), noFn('routeTeamMessage'), '협업 X · HQ 결정 카드 O');

red('U24. 다른 운영팀에 보내는 지원요청은 기존 협업 한 흐름을 그대로 만든다',
  (() => { const r = routeOf('cs', 'design', 'support');
    return !!r && r.createsCollaboration === true && r.createsHqReview === false;
  })(), noFn('routeTeamMessage'), '협업 O · HQ 결정 카드 X');

red('U25. 다른 운영팀에 보내는 확인요청·일반전달은 메시지만 유지한다',
  (() => {
    const c = routeOf('cs', 'design', 'confirm');
    const i = routeOf('cs', 'design', 'info');
    return !!c && !!i
      && c.createsCollaboration === false && c.createsHqReview === false
      && i.createsCollaboration === false && i.createsHqReview === false;
  })(), noFn('routeTeamMessage'), '둘 다 메시지만');

// ════════════════════════════════════════════════════════════════════════════
// HQ 결정 카드의 성질 (U11~U18, U23)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- HQ 결정 카드 ---');

const mkHqCard = () => { reset(); return tryHqReview({ message: MSG, actor: LEAD_CS }); };

red('U11. HQ 결정 카드는 부모·자식이 없는 단일 업무다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const all = S.loadLifecycleTasks();
    return all.length === 1 && !all[0].ref.parentTaskId && !all[0].trackingOnly;
  })(), noFn('createHqReviewRequest'), '단일 업무 1건 · 부모/자식 없음');

red('U12. 처음부터 확인 대기이고 실제 제출 내용이 있다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    return t.status === 'awaiting_approval' && L.hasSubmittedResult(t);
  })(), noFn('createHqReviewRequest'), 'awaiting_approval · 제출 내용 존재');

red('U13. 책임팀은 보낸 팀으로 유지되고 지금 결정자는 HQ 다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    const stage = t.approvalRoute.stages[t.approvalRoute.currentStageIndex];
    return t.ownerTeamId === 'cs' && stage.approverKind === 'hq'
      && A.pendingForActor(HQ).some((x) => x.id === t.ref.taskId);
  })(), noFn('createHqReviewRequest'), 'ownerTeamId=cs · 현재 단계=총괄 결정');

red('U14. submittedBy 는 보낸 팀장이고 제출 시각이 보존된다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    return t.submittedBy?.teamId === 'cs' && t.submittedBy?.kind === 'human' && t.submittedAt === AT;
  })(), noFn('createHqReviewRequest'), '제출자=CS팀장 · 시각 보존');

red('U15. 메시지 제목·본문과 원본 메시지 ID 를 역추적할 수 있다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    const refs = [...(t.inputRefs ?? []), ...(t.artifactRefs ?? [])];
    return t.title.includes(MSG.title)
      && (t.resultSummary ?? '').includes('30일 이내')
      && refs.some((x) => String(x).includes(MSG.id));
  })(), noFn('createHqReviewRequest'), '제목·본문·원본 메시지 ID 연결');

red('U16. 첨부는 원본 메시지를 참조하고 dataUrl 을 복제하지 않는다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const raw = JSON.stringify(S.loadLifecycleTasks()[0]);
    return !raw.includes('data:image') && !raw.includes('base64');
  })(), noFn('createHqReviewRequest'), 'dataUrl 미복제');

red('U17. HQ 수행자·HQ AI 배정이 없다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    return t.assignedAgentId === '' && !t.executorId && t.executorKind !== 'agent';
  })(), noFn('createHqReviewRequest'), '수행자 배정 없음');

red('U18. 보낸 팀은 상태를 볼 수 있지만 승인·미채택 결정을 할 수 없다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    const visible = A.taskFlowsFor(LEAD_CS).some((f) => f.task.ref.taskId === t.ref.taskId);
    const offered = A.availableDecisions(t, LEAD_CS).map((d) => d.kind);
    const approve = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_CS }, { nowIso: AT2 });
    const drop = A.applyDecision(t.ref.taskId, { kind: 'not_adopted', actor: LEAD_CS, reason: 'x' }, { nowIso: AT2 });
    return visible && !offered.includes('approve') && !offered.includes('not_adopted')
      && approve.ok === false && drop.ok === false;
  })(), noFn('createHqReviewRequest'), '열람 O · 결정 X');

red('U23. 같은 원본 메시지로 다시 호출해도 카드가 중복 생성되지 않는다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const again = tryHqReview({ message: MSG, actor: LEAD_CS });
    return S.loadLifecycleTasks().length === 1 && (again.rejected || !!again.value);
  })(), noFn('createHqReviewRequest'), '중복 생성 0');

// ════════════════════════════════════════════════════════════════════════════
// HQ 결정 3경로 (U19~U22)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- HQ 결정 3경로 ---');

red('U19. HQ 만 확인 완료·수정 요청·이번에는 사용 안 함을 결정할 수 있다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    // RC-2 D-1.3.3.1: '포함' 검사는 네 번째 행동(stop)을 놓쳤다.
    //   길이와 전체 집합이 정확히 같은지 본다.
    const forHq = [...A.availableDecisions(t, HQ).map((d) => d.kind)].sort();
    const expected = ['approve', 'not_adopted', 'request_revision'];   // 정렬 기준
    const forSender = A.availableDecisions(t, LEAD_CS).length;
    const forOther = A.availableDecisions(t, LEAD_DESIGN).length;
    return forHq.length === 3 && JSON.stringify(forHq) === JSON.stringify(expected)
      && forSender === 0 && forOther === 0;
  })(),
  (() => { if (!hasFn('createHqReviewRequest')) return noFn('createHqReviewRequest');
    reset(); const r = tryHqReview({ message: MSG, actor: LEAD_CS });
    if (r.rejected) return '카드 생성 실패';
    const got = A.availableDecisions(S.loadLifecycleTasks()[0], HQ).map((d) => d.kind);
    return `HQ 에게 ${got.length}개 = [${got.join(', ')}]`;
  })(), 'HQ 정확히 3행동 · 보낸 팀·타 팀 0');

red('U20. 확인 완료하면 완료가 되고 기록이 남는다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    const d = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: HQ }, { nowIso: AT2 });
    const after = readTask(t.ref.taskId);
    return d.ok === true && after.status === 'completed'
      && after.decisions.some((x) => x.kind === 'approve' && x.actorTeamId === 'hq')
      && L.hasSubmittedResult(after);
  })(), noFn('createHqReviewRequest'), 'completed · 결정·제출 내용 보존');

red('U21. 수정 요청 시 원본은 보존되고 사유가 담긴 새 업무가 원래 팀에 열린다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: HQ, reason: '기간을 14일로 줄여 주세요' },
      { nowIso: AT2, newId: ids.newId });
    const all = S.loadLifecycleTasks();
    const orig = all.find((x) => x.ref.taskId === t.ref.taskId);
    const rev = all.find((x) => x.ref.revisionOfTaskId === t.ref.taskId);
    return orig.status === 'superseded' && L.hasSubmittedResult(orig)
      && !!rev && rev.ownerTeamId === 'cs' && rev.status === 'open' && rev.executorKind === 'unassigned'
      && JSON.stringify(orig).includes('기간을 14일로 줄여 주세요')
      && A.taskFlowsFor(LEAD_CS).some((f) => f.task.ref.taskId === rev.ref.taskId);
  })(), noFn('createHqReviewRequest'), '원본 superseded · 새 업무가 CS팀에 open');

red('U22. 이번에는 사용 안 함 처리 시 원 제출물과 사유가 남는다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    const d = A.applyDecision(t.ref.taskId, { kind: 'not_adopted', actor: HQ, reason: '이번 분기엔 보류' }, { nowIso: AT2 });
    const after = readTask(t.ref.taskId);
    return d.ok === true && after.status === 'not_adopted'
      && L.hasSubmittedResult(after) && JSON.stringify(after).includes('이번 분기엔 보류');
  })(), noFn('createHqReviewRequest'), 'not_adopted · 제출물·사유 보존');

// ════════════════════════════════════════════════════════════════════════════
// 생성 권한 · 자동 해석 금지 · 구조 확장 금지 (U26~U27 + 권한)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 생성 권한 · 자동 해석 금지 ---');

red('U26. 채팅 문구를 해석해 HQ 결정 카드나 중단 상태를 자동 생성하지 않는다',
  (() => {
    const autoCard = /createHqReviewRequest\(/.test(chatConsole + controlChat);
    const autoStop = /kind: 'stop'|requestTaskStop\(/.test(chatConsole + controlChat);
    // 라우팅은 종류·수신처만 본다 — 제목·본문을 읽어 분기하면 안 된다.
    const routeReadsText = /routeTeamMessage[\s\S]{0,600}?(title|body)\s*[.=]/.test(adapterSrc);
    return !autoCard && !autoStop && !routeReadsText;
  })(), '채팅 경로에 자동 생성·자동 중단이 있거나 라우팅이 문구를 읽음', '문구 해석 없음');

red('U27. 새 상태·새 결재함·새 대시보드가 추가되지 않는다',
  (() => {
    const statusUnion = /export type TaskLifecycleStatus[\s\S]{0,400}?;/.exec(contractSrc);
    const noNewStatus = !statusUnion || !/hq_review|pending_hq|review_wait/.test(statusUnion[0]);
    const noNewPanel = !/HqReviewPanel|HqInboxPanel|ReviewDashboard/.test(deptPanel + teamTaskPanel);
    return noNewStatus && noNewPanel;
  })(), '새 상태·새 패널이 추가됨', '기존 상태·기존 화면 재사용');

red('U28. HQ 확인요청 생성은 인간 팀장이 자기 팀 명의로 HQ 에 보낼 때만 성립한다',
  (() => { reset();
    if (!hasFn('createHqReviewRequest')) return false;
    const bad = [
      { message: { ...MSG, toTeam: 'design' }, actor: LEAD_CS },                     // 수신처가 HQ 아님
      { message: { ...MSG, from: { kind: 'human', teamId: 'hq', label: 'HQ' } }, actor: HQ }, // HQ 발신
      { message: MSG, actor: LEAD_PRODUCT },                                          // 다른 팀 사칭
      { message: { ...MSG, from: { kind: 'agent', teamId: 'cs', label: 'AI', agentId: 'inquiry_analyst' } }, actor: LEAD_CS }, // AI 명의
      { message: { ...MSG, title: '', body: '' }, actor: LEAD_CS },                  // 내용 없음
      { message: { ...MSG, id: '' }, actor: LEAD_CS }                                // 원본 ID 없음
    ].every((input) => tryHqReview(input).rejected);
    const savedAfterRejects = S.loadLifecycleTasks().length;
    const good = tryHqReview({ message: MSG, actor: LEAD_CS });
    return bad && savedAfterRejects === 0 && !good.rejected;
  })(), noFn('createHqReviewRequest'), '6종 거부 · 저장 0건 · 정상만 성립');

red('U29. 소비자가 수신처·종류로만 분기하고 HQ 를 수행팀으로 만들지 않는다',
  (() => {
    const usesRouter = /routeTeamMessage\(/.test(deptPanel);
    const oldRule = /input\.kind === 'support' && input\.from\.teamId !== 'hq' && input\.toTeam !== input\.from\.teamId/.test(deptPanel);
    const handlesHqConfirm = /onHqReview|createsHqReview/.test(deptPanel);
    return usesRouter && !oldRule && handlesHqConfirm;
  })(), "소비자가 toTeam==='hq' 를 구분하지 않고 support 면 무조건 협업을 만듦",
  '수신처·종류 기준 분기 · HQ 확인요청 처리');

red('U30. HQ 결정 카드에는 수행자 선택·결과 제출 경로가 열리지 않는다',
  (() => { const r = mkHqCard();
    if (r.rejected) return false;
    const t = S.loadLifecycleTasks()[0];
    const assign = A.assignExecutor(t.ref.taskId, { kind: 'human', actor: HQ }, { nowIso: AT2 });
    const take = A.takeOverByLead(t.ref.taskId, { actor: HQ }, { nowIso: AT2 });
    const submit = A.submitResult(t.ref.taskId, { resultSummary: 'x', actor: HQ }, { nowIso: AT2 });
    const after = readTask(t.ref.taskId);
    return assign.ok === false && take.ok === false && submit.ok === false
      && after.status === 'awaiting_approval';
  })(), noFn('createHqReviewRequest'), '배정·인수·제출 3종 차단');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (중단 요청 권한 · 팀→HQ 확인요청 U1~U30)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
if (redUnmet > 0) {
  console.log(`\n✗ RC-2 D-1.3.3 — ${redUnmet}건 미충족`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1.3.3 GREEN 도달 (중단 요청은 HQ·요청팀만 · 팀→HQ 확인요청은 결정 카드)');
