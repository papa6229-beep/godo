#!/usr/bin/env node
/*
 * scripts/smoke-rc2-task-lifecycle-red-v0.mjs
 * RC-2 — 업무·실행·결과물·승인 생명주기 계약 (RED 진단)
 *
 * 목적: 하나의 업무가 생성된 뒤 실행·결과물·승인·기록까지 **같은 업무로 추적되는지**를
 *   문자열 grep 이 아니라 **실제 함수 호출**로 검증한다.
 *
 * 이 단계는 RED 진단 전용. 제품 소스는 한 줄도 고치지 않는다.
 *   [BASE] = 진단 전제(현재 코드에서도 참). fail>0 이면 진단 자체를 다시 써야 한다.
 *   [RED ] = 생명주기 계약 목표. 지금은 미충족(unmet)이 정상이다.
 *
 * 결정성: 시각·랜덤에 의존하지 않도록 nowIso 를 고정 주입하고, 단정은 **관계**(같은 id 로
 *   이어지는가)만 본다. 생성되는 id 문자열 자체를 기대값으로 쓰지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2-'));

// localStorage 기반 원장을 Node 에서 그대로 돌리기 위한 최소 shim(결정적·인메모리).
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

// G0: 정책 계약 모듈(아직 없을 수 있음 — 없으면 정책 RED 가 미충족으로 남는다)
const OPTIONAL_SRC = [
  ['LIFE', path.join(REPO, 'src', 'services', 'taskLifecycleContract.ts'), 'services', 'taskLifecycleContract.js'],
  ['STORE', path.join(REPO, 'src', 'services', 'taskLifecycleStore.ts'), 'services', 'taskLifecycleStore.js'],
  ['IDREG', path.join(REPO, 'src', 'services', 'agentIdRegistry.ts'), 'services', 'agentIdRegistry.js']
];
const optionalPresent = OPTIONAL_SRC.filter(([, f]) => existsSync(f));

let LEDGER, RUNNER, HANDOFF, ORCH, AGG;
const OPT = {};
try {
  execFileSync(process.execPath, [tscBin,
    ...optionalPresent.map(([, f]) => f),
    path.join(REPO, 'src', 'services', 'activityLedger.ts'),
    path.join(REPO, 'src', 'services', 'agentTaskRunner.ts'),
    path.join(REPO, 'src', 'engine', 'nativeAgentRuntime', 'handoffEngine.ts'),
    path.join(REPO, 'src', 'engine', 'nativeAgentRuntime', 'managerOrchestrator.ts'),
    path.join(REPO, 'src', 'engine', 'nativeAgentRuntime', 'teamLeadAggregator.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const sub of ['services', 'engine/nativeAgentRuntime', 'types', 'data']) {
    const dir = path.join(tmp, ...sub.split('/'));
    let files = [];
    try { files = readdirSync(dir).filter((x) => x.endsWith('.js')); } catch { continue; }
    for (const f of files) {
      const p = path.join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
  }
  const svc = async (n) => import(pathToFileURL(path.join(tmp, 'services', n)).href);
  const eng = async (n) => import(pathToFileURL(path.join(tmp, 'engine', 'nativeAgentRuntime', n)).href);
  LEDGER = await svc('activityLedger.js');
  RUNNER = await svc('agentTaskRunner.js');
  HANDOFF = await eng('handoffEngine.js');
  ORCH = await eng('managerOrchestrator.js');
  AGG = await eng('teamLeadAggregator.js');
  for (const [key, , sub, file] of optionalPresent) {
    OPT[key] = await import(pathToFileURL(path.join(tmp, sub, file)).href);
  }
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const appSource = readFileSync(path.join(REPO, 'src', 'App.tsx'), 'utf8');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 — 업무·실행·결과물·승인 생명주기 계약 (RED 진단) ===');

// ── 결정적 fixture ───────────────────────────────────────────────────────────
const AT = '2026-07-23T00:00:00.000Z';
const RUN_ID = 'run-FIXED';

const artifact = (id, type, deptId, agentId, approvalRequired = false) => ({
  id, runId: RUN_ID, agentId, departmentId: deptId, type,
  title: `${type} 산출물`, body: `${type} 본문`, approvalRequired, createdAt: AT
});
const result = (id, deptId, agentId, findings, opts = {}) => ({
  id, runId: RUN_ID, jobId: `job-${agentId}-${RUN_ID}`, agentId, departmentId: deptId,
  status: opts.status ?? 'success', summary: `${agentId} 요약`, findings,
  recommendations: [`${agentId} 권고`], handoffTargets: [],
  artifacts: opts.artifacts ?? [], riskFlags: opts.riskFlags ?? [],
  approvalRequired: opts.approvalRequired ?? false, createdAt: AT
});

// 상품팀이 **여러 결과**를 낸다: 판매분석 + 재고 + (기획성) 리뷰반영
const prodAnalyst = result('res-product-analyst', 'product', 'product_analyst', ['판매량 최고 상품 A']);
const prodInventory = result('res-product-inventory', 'product', 'inventory_monitor', ['안전재고 미달: 상품 B', '재고 소진 임박: 상품 C']);
// CS팀도 여러 결과: 문의 + 리뷰
const csInquiry = result('res-cs-inquiry', 'cs', 'inquiry_analyst', ['미답변 문의 3건']);
const csReview = result('res-cs-review', 'cs', 'review_detector', ['부정 리뷰 2건(별점 1점)']);
const mktPlan = result('res-mkt-plan', 'marketing', 'campaign_planner', ['캠페인 후보 2건'],
  { artifacts: [artifact('art-mkt-plan', 'marketing_plan', 'marketing', 'campaign_planner', true)], approvalRequired: true });

const ALL_RESULTS = [prodAnalyst, prodInventory, csInquiry, csReview, mktPlan];

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. fixture: 한 부서(product)가 결과를 2건 낸다 — 판매분석 + 재고',
  ALL_RESULTS.filter((r) => r.departmentId === 'product').length === 2,
  '재고 결과가 두 번째다(첫 결과가 아님)');

base('B2. fixture: CS 부서도 결과 2건 — 문의 + 리뷰',
  ALL_RESULTS.filter((r) => r.departmentId === 'cs').length === 2, '리뷰 결과가 두 번째');

base('B3. AgentResult/AgentArtifact 는 이미 id·runId·jobId·agentId 를 갖는다(재사용 가능 필드)',
  !!prodInventory.id && !!prodInventory.runId && !!prodInventory.jobId && !!prodInventory.agentId &&
  !!mktPlan.artifacts[0].id && !!mktPlan.artifacts[0].runId,
  'result.id/runId/jobId/agentId · artifact.id/runId 존재');

base('B4. 원장 ActivityEvent 는 refId 한 칸만 갖는다(taskId/runId/artifactId 구분 없음)',
  (() => { const ev = LEDGER.createActivity({ teamId: 'product', type: 'task_run', status: 'pending', title: 't', actor: { kind: 'agent', teamId: 'product', label: 'x', agentId: 'stock' } }, AT);
    return 'refId' in ev && !('taskId' in ev) && !('runId' in ev) && !('artifactId' in ev); })(),
  'refId 단일 슬롯');

base('B5. 원장 상태 집계는 refId 로 dedup 하고, refId 없는 이벤트는 dedup 을 우회한다',
  (() => {
    const withRef = [
      LEDGER.createActivity({ teamId: 'product', type: 'task_run', status: 'pending', title: 'a', actor: { kind: 'agent', teamId: 'product', label: 'x', agentId: 'stock' }, refId: 'R1' }, AT),
      LEDGER.createActivity({ teamId: 'product', type: 'task_run', status: 'done', title: 'a', actor: { kind: 'agent', teamId: 'product', label: 'x', agentId: 'stock' }, refId: 'R1' }, '2026-07-23T00:00:01.000Z')
    ];
    const s = LEDGER.teamSummary(withRef, 'product');
    return s.pending === 0 && s.done === 1;
  })(),
  'refId 가 같으면 최신 1건으로 dedup(정상 동작)');

// ── [RED] 생명주기 계약 ──────────────────────────────────────────────────────
console.log('');

// RED 1 — 제안 업무 ID와 런타임 업무 ID
const orch = ORCH.orchestrateManager(RUN_ID, ALL_RESULTS, []);
const propTask = orch.proposedTasks[0];
const propAppr = orch.proposedApprovalItems[0];
red('R1a. orchestrateManager 의 제안 업무가 자기 식별자(id)를 갖는다',
  !!propTask && typeof propTask.id === 'string' && propTask.id.length > 0,
  `proposedTasks[0] 키=[${propTask ? Object.keys(propTask).join(',') : '없음'}] → id 없음`,
  `id=${propTask?.id}`);
red('R1b. 제안 승인건이 원래 업무를 가리키는 taskId(또는 동등 참조)를 갖는다',
  !!propAppr && (typeof propAppr.taskId === 'string' || typeof propAppr.refId === 'string'),
  `proposedApprovalItems[0] 키=[${propAppr ? Object.keys(propAppr).join(',') : '없음'}] → task 참조 없음`);
red('R1c. 소비자(App)가 업무 id 와 승인 taskId 를 **각각 따로** 만들어내지 않는다',
  !(/id: `runtime-task-\$\{idx\}-\$\{Date\.now\(\)\}`/.test(appSource) && /taskId: `task-\$\{item\.agentId\}-\$\{Date\.now\(\)\}`/.test(appSource)),
  'App.tsx 가 runtime-task-… 와 task-… 를 독립 생성 → 승인 후 원 업무 조회 불가');

// RED 2 — pending 에 refId 없음 → 누적
store.clear();
const spec = { id: 'spec-inv', teamId: 'product', agentId: 'stock', agentLabel: '상품 관리 AI', title: '재고 일일 점검',
  focus: 'inventory', reportTo: 'hq', reportKind: 'report', schedule: { kind: 'manual' }, approvalMode: 'approval' };
const ctx = { revenue: null, nowIso: AT, nowMs: 0 };
RUNNER.stageApprovalTask(spec, ctx);
const stagedEvents = LEDGER.loadActivity();
const pendingEv = stagedEvents.find((e) => e.status === 'pending');
red('R2a. 승인 대기(pending) 기록이 refId(추적 식별자)를 갖는다',
  !!pendingEv && typeof pendingEv.refId === 'string' && pendingEv.refId.length > 0,
  `pending refId=${pendingEv ? JSON.stringify(pendingEv.refId) : '이벤트 없음'}`);

RUNNER.approveAgentTask(spec, { ...ctx, nowIso: '2026-07-23T00:00:05.000Z' }, '승인된 본문');
const afterApprove = LEDGER.loadActivity();
const sumAfter = LEDGER.teamSummary(afterApprove, 'product');
red('R2b. 승인 후 pending 이 0 이 된다(같은 업무로 닫힘)',
  sumAfter.pending === 0,
  `pending=${sumAfter.pending} · done=${sumAfter.done} (pending 이 닫히지 않고 누적)`);

// 같은 업무를 2회 대기시키면 계속 쌓이는가
RUNNER.stageApprovalTask(spec, { ...ctx, nowIso: '2026-07-23T00:00:06.000Z' });
RUNNER.stageApprovalTask(spec, { ...ctx, nowIso: '2026-07-23T00:00:07.000Z' });
const sumTwice = LEDGER.teamSummary(LEDGER.loadActivity(), 'product');
red('R2c. 같은 업무를 반복 대기시켜도 중복 누적되지 않는다',
  sumTwice.pending <= 1, `pending=${sumTwice.pending}건 누적`);

// RED 3 — 승인·반려·취소 3경로
red('R3a. 반려(reject) 경로가 원장에 상태를 남긴다',
  typeof RUNNER.rejectAgentTask === 'function',
  `agentTaskRunner 에 반려 API 없음(export=[${Object.keys(RUNNER).join(',')}])`);
red('R3b. 취소(cancel) 경로가 존재한다',
  typeof RUNNER.cancelAgentTask === 'function', 'agentTaskRunner 에 취소 API 없음');
red('R3c. 소비자(App)에 취소 처리 핸들러가 있다',
  /handleCancel|취소 처리/.test(appSource), 'App.tsx 에 승인/반려만 있고 취소 없음');

// RED 4 — handoff 가 부서의 첫 결과만 고름
const ho = HANDOFF.processHandoffs(RUN_ID, ALL_RESULTS);
const referenced = new Set(ho.handoffs.flatMap((h) => h.referencedResultIds));
red('R4a. handoff 가 상품팀의 재고 결과(두 번째)도 참조한다',
  referenced.has(prodInventory.id),
  `참조된 결과=[${[...referenced].join(', ')}] → 재고 결과 누락`);
red('R4b. handoff 가 CS팀의 리뷰 결과(두 번째)도 참조한다',
  referenced.has(csReview.id), `리뷰 결과(${csReview.id}) 누락`);
red('R4c. 부서 결과가 여러 건이면 handoff 도 그 수만큼 추적된다',
  ALL_RESULTS.every((r) => r.departmentId === 'manager' || referenced.has(r.id)),
  `전체 ${ALL_RESULTS.length}건 중 ${referenced.size}건만 참조됨`);

// RED 5 — agentId 네임스페이스
const orchAgentIds = [...orch.proposedTasks.map((t) => t.agentId), ...orch.proposedApprovalItems.map((i) => i.agentId)];
const runtimeAgentIds = new Set(ALL_RESULTS.map((r) => r.agentId));
const orphan = orchAgentIds.filter((id) => !runtimeAgentIds.has(id));
red('R5a. 제안 항목의 agentId 가 런타임 결과의 agentId 네임스페이스와 일치한다',
  orphan.length === 0,
  `런타임에 없는 agentId=[${[...new Set(orphan)].join(', ')}] (런타임=[${[...runtimeAgentIds].join(', ')}])`);
red('R5b. 소비자(App)가 네임스페이스를 if-else 하드코딩으로 잇지 않는다',
  !/a\.id === 'stock'[\s\S]{0,120}inventory_monitor/.test(appSource),
  "App.tsx 가 'stock'→'inventory_monitor' 등을 if-else 로 수동 매핑");

// RED 6 — 부분 실패 표현
const failedMember = result('res-fail', 'product', 'inventory_monitor', ['수집 실패'], { status: 'failed', riskFlags: ['에이전트_오류'] });
const aggWithFailure = AGG.aggregateTeamResults(RUN_ID, 'product', [prodAnalyst, failedMember], 'product_lead');
red('R6a. 팀원 결과에 실패가 있으면 부서 집계가 success 로 단정하지 않는다',
  aggWithFailure.status !== 'success',
  `팀원 1건 실패인데 집계 status=${aggWithFailure.status}`);
red('R6b. 부분 실패를 표현할 상태값이 계약에 있다(성공/실패 이분법 아님)',
  ['partial', 'partial_failure', 'needs_review'].includes(aggWithFailure.status),
  `상태=${aggWithFailure.status} · AgentResultStatus 에 partial 개념 없음`);
red('R6c. 실행 예외가 없다는 이유만으로 run 을 completed 로 고정하지 않는다',
  !/status: 'completed',\s*\n\s*startedAt: startTime/.test(readFileSync(path.join(REPO, 'src', 'engine', 'nativeAgentRuntime', 'nativeAgentRuntime.ts'), 'utf8')),
  'nativeAgentRuntime 이 run.status 를 무조건 completed 로 하드코딩');

// RED 7 — 결과물·승인의 역추적
const apprArtifact = propAppr?.artifact;
red('R7a. 승인 항목의 결과물이 원래 result 로 역추적 가능하다(resultId 등)',
  !!apprArtifact && (typeof apprArtifact.resultId === 'string' || typeof apprArtifact.jobId === 'string'),
  `artifact 키=[${apprArtifact ? Object.keys(apprArtifact).join(',') : '없음'}] → result/job 역참조 없음`);
red('R7b. 원장 기록이 run/task 로 역추적 가능하다(refId 가 메시지 id 가 아니라 업무 식별자)',
  (() => {
    store.clear();
    const { posted } = RUNNER.postAgentReport(spec, { title: 't', body: 'b' }, ctx);
    const ev = LEDGER.loadActivity().find((e) => e.type === 'task_run');
    return !!ev && ev.refId !== posted.id;
  })(),
  'refId 가 발신 메시지 id 라 원래 업무(spec.id)/run 으로 못 돌아간다');
red('R7c. 원장 이벤트에 업무 식별자(taskId/specId)가 남는다',
  (() => { const ev = LEDGER.loadActivity().find((e) => e.type === 'task_run');
    return !!ev && JSON.stringify(ev).includes(spec.id); })(),
  `이벤트에 spec.id(${spec.id}) 흔적 없음`);


// ════════════════════════════════════════════════════════════════════════════
// G0 — 운영 정책 RED (사장 확정 정책의 계약 반영 여부)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 운영 정책 계약 (G0) ---');
const L = OPT.LIFE, S = OPT.STORE, ID = OPT.IDREG;
const noMod = (m) => `${m} 모듈 없음`;

let _n = 0;
const ids = () => `id-${++_n}`;
const resetIds = () => { _n = 0; };

const HQ = { kind: 'human', teamId: 'hq', label: '총괄 관리자', userId: 'u-hq' };
const LEAD_PRODUCT = { kind: 'human', teamId: 'product', label: '상품 팀장', userId: 'u-prod-lead' };
const LEAD_CS = { kind: 'human', teamId: 'cs', label: 'CS 팀장', userId: 'u-cs-lead' };
const AI_PRODUCT = { kind: 'agent', teamId: 'product', label: '재고 감시 AI', agentId: 'inventory_monitor' };

const mkTask = (over = {}) => L && L.createLifecycleTask({
  title: '재고 점검', ownerTeamId: 'product', ownerHumanId: 'u-prod-lead',
  assignedAgentId: 'inventory_monitor', createdBy: HQ,
  approvalRoute: L.APPROVAL_ROUTES.hq_directive, dependencyMode: 'independent', ...over
}, { newId: ids, nowIso: AT });

red('P1. HQ 지시 업무: 담당팀 완료 보고 후 HQ 가 최종 확인한다',
  (() => { if (!L) return false;
    resetIds();
    const t = mkTask();
    const afterTeam = L.decideApproval(t, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    if (!afterTeam.ok) return false;
    if (afterTeam.task.status === 'completed') return false;
    const afterHq = L.decideApproval(afterTeam.task, { kind: 'approve', actor: HQ }, { nowIso: AT });
    return afterHq.ok && afterHq.task.status === 'completed' && L.finalApprover(afterHq.task).approverKind === 'hq';
  })(), noMod('taskLifecycleContract'));

red('P2. 팀 자체 일반 업무는 팀장 선에서 종료 가능하다',
  (() => { if (!L) return false;
    resetIds();
    const t = mkTask({ createdBy: LEAD_PRODUCT, approvalRoute: L.APPROVAL_ROUTES.team_internal });
    const r = L.decideApproval(t, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    return r.ok && r.task.status === 'completed';
  })(), noMod('taskLifecycleContract'));

red('P3. 협업 자식 업무는 부모와 같은 correlationId · parentTaskId 로 이어지고 taskId 는 다르다',
  (() => { if (!L) return false;
    resetIds();
    const parent = mkTask({ ownerTeamId: 'cs', ownerHumanId: 'u-cs-lead', createdBy: LEAD_CS });
    const child = L.createChildTask(parent, { title: '재고 확인 요청', ownerTeamId: 'product', ownerHumanId: 'u-prod-lead',
      assignedAgentId: 'inventory_monitor', createdBy: LEAD_CS }, { newId: ids, nowIso: AT });
    return child.ref.taskId !== parent.ref.taskId
      && child.ref.correlationId === parent.ref.correlationId
      && child.ref.parentTaskId === parent.ref.taskId;
  })(), noMod('taskLifecycleContract'));

red('P4. 협업 자식 완료 → 요청팀 확인 단계로 간다(수행팀 단독 종료 불가)',
  (() => { if (!L) return false;
    resetIds();
    const parent = mkTask({ ownerTeamId: 'cs', ownerHumanId: 'u-cs-lead', createdBy: LEAD_CS });
    const child = L.createChildTask(parent, { title: '재고 확인 요청', ownerTeamId: 'product', ownerHumanId: 'u-prod-lead',
      assignedAgentId: 'inventory_monitor', createdBy: LEAD_CS }, { newId: ids, nowIso: AT });
    const byDoer = L.decideApproval(child, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    if (!byDoer.ok || byDoer.task.status === 'completed') return false;
    const byRequester = L.decideApproval(byDoer.task, { kind: 'approve', actor: LEAD_CS }, { nowIso: AT });
    return byRequester.ok && byRequester.task.status === 'completed';
  })(), noMod('taskLifecycleContract'));

red('P5. 수행 불가/반송은 이유를 남기고 부모 업무를 종료시키지 않는다',
  (() => { if (!L) return false;
    resetIds();
    const parent = mkTask({ ownerTeamId: 'cs', ownerHumanId: 'u-cs-lead', createdBy: LEAD_CS });
    const child = L.createChildTask(parent, { title: '재고 확인 요청', ownerTeamId: 'product', ownerHumanId: 'u-prod-lead',
      assignedAgentId: 'inventory_monitor', createdBy: LEAD_CS }, { newId: ids, nowIso: AT });
    const r = L.decideApproval(child, { kind: 'return', actor: LEAD_PRODUCT, reason: '원본 자료 부족' }, { nowIso: AT });
    if (!r.ok || r.task.status !== 'returned') return false;
    if (!JSON.stringify(r.task).includes('원본 자료 부족')) return false;
    const p2 = L.resolveParentStatus(parent, [r.task]);
    return p2.status !== 'completed' && p2.status !== 'failed';
  })(), noMod('taskLifecycleContract'));

red('P6. 오류 발견 시 기존 결과는 대체됨(superseded)으로 남고 새 revision 업무가 생성된다',
  (() => { if (!L) return false;
    resetIds();
    const t = mkTask({ approvalRoute: L.APPROVAL_ROUTES.team_internal, createdBy: LEAD_PRODUCT });
    const done = L.decideApproval(t, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    const rev = L.createRevisionTask(done.task, { reason: '수치 오류', createdBy: LEAD_PRODUCT }, { newId: ids, nowIso: AT });
    return rev.revision.ref.revisionOfTaskId === done.task.ref.taskId
      && rev.revision.ref.correlationId === done.task.ref.correlationId
      && rev.superseded.status === 'superseded'
      && JSON.stringify(rev.superseded).includes('수치 오류');
  })(), noMod('taskLifecycleContract'));

const kids = (mode) => {
  const parent = mkTask({ dependencyMode: mode });
  const okChild = { ...L.createChildTask(parent, { title: 'a', ownerTeamId: 'product', ownerHumanId: 'u', assignedAgentId: 'x', createdBy: HQ }, { newId: ids, nowIso: AT }), status: 'completed' };
  const badChild = { ...L.createChildTask(parent, { title: 'b', ownerTeamId: 'product', ownerHumanId: 'u', assignedAgentId: 'y', createdBy: HQ }, { newId: ids, nowIso: AT }), status: 'failed' };
  return { parent, okChild, badChild };
};

red('P7. independent: 한 업무 실패가 성공한 업무를 부분완료로 강등하지 않는다',
  (() => { if (!L) return false;
    resetIds();
    const { parent, okChild, badChild } = kids('independent');
    const r = L.resolveParentStatus(parent, [okChild, badChild]);
    return r.status !== 'partially_completed' && okChild.status === 'completed';
  })(), noMod('taskLifecycleContract'));

red('P8. all_required: 일부 실패 시 부모는 partially_completed 이고 성공 결과는 보존된다',
  (() => { if (!L) return false;
    resetIds();
    const { parent, okChild, badChild } = kids('all_required');
    const r = L.resolveParentStatus(parent, [okChild, badChild]);
    return r.status === 'partially_completed' && r.retryableTaskIds.includes(badChild.ref.taskId)
      && !r.retryableTaskIds.includes(okChild.ref.taskId);
  })(), noMod('taskLifecycleContract'));

red('P9. all_required: 관리자가 현재 결과로 충분하다고 하면 부분 결과로 최종 채택 가능',
  (() => { if (!L) return false;
    resetIds();
    const { parent, okChild, badChild } = kids('all_required');
    const r = L.resolveParentStatus(parent, [okChild, badChild], { acceptPartial: true });
    return r.status === 'completed' && r.acceptedPartial === true;
  })(), noMod('taskLifecycleContract'));

red('P10. selection: 선택되지 않은 성공 결과는 failed 가 아니라 not_selected',
  (() => { if (!L) return false;
    resetIds();
    const parent = mkTask({ dependencyMode: 'selection' });
    const c1 = { ...L.createChildTask(parent, { title: 'A안', ownerTeamId: 'design', ownerHumanId: 'u', assignedAgentId: 'x', createdBy: HQ }, { newId: ids, nowIso: AT }), status: 'completed' };
    const c2 = { ...L.createChildTask(parent, { title: 'B안', ownerTeamId: 'design', ownerHumanId: 'u', assignedAgentId: 'y', createdBy: HQ }, { newId: ids, nowIso: AT }), status: 'completed' };
    const r = L.resolveParentStatus(parent, [c1, c2], { selectedTaskId: c1.ref.taskId });
    const other = r.children.find((c) => c.ref.taskId === c2.ref.taskId);
    return r.status === 'completed' && other.status === 'not_selected' && other.status !== 'failed';
  })(), noMod('taskLifecycleContract'));

red('P11. AI 는 자신의 결과물을 최종 승인할 수 없다',
  (() => { if (!L) return false;
    resetIds();
    const t = mkTask({ approvalRoute: L.APPROVAL_ROUTES.team_internal });
    const r = L.decideApproval(t, { kind: 'approve', actor: AI_PRODUCT }, { nowIso: AT });
    return r.ok === false && /ai|자기|self/i.test(String(r.reason ?? ''));
  })(), noMod('taskLifecycleContract'));

red('P12. 승인 경로에 없는 사용자의 결정은 차단된다',
  (() => { if (!L) return false;
    resetIds();
    const t = mkTask();
    const r = L.decideApproval(t, { kind: 'approve', actor: { kind: 'human', teamId: 'design', label: '디자인 팀장', userId: 'u-design' } }, { nowIso: AT });
    return r.ok === false;
  })(), noMod('taskLifecycleContract'));

red('P13. 미채택·중단 결정 후에도 기록은 남고 pending 집계에서만 빠진다',
  (() => { if (!L) return false;
    resetIds();
    const t = mkTask({ approvalRoute: L.APPROVAL_ROUTES.team_internal });
    const notAdopted = L.decideApproval(t, { kind: 'not_adopted', actor: LEAD_PRODUCT, reason: '이번엔 사용 안 함' }, { nowIso: AT });
    const stopped = L.decideApproval(mkTask({ approvalRoute: L.APPROVAL_ROUTES.team_internal }), { kind: 'stop', actor: LEAD_PRODUCT, reason: '중단' }, { nowIso: AT });
    return notAdopted.ok && notAdopted.task.status === 'not_adopted'
      && stopped.ok && stopped.task.status === 'stopped'
      && L.isPendingForApproval(notAdopted.task) === false
      && L.isPendingForApproval(stopped.task) === false
      && notAdopted.events.length > 0 && stopped.events.length > 0;
  })(), noMod('taskLifecycleContract'));

red('P14. 내부 상태와 사용자 문구가 분리돼 쉬운 표현으로 노출된다',
  (() => { if (!L) return false;
    const labels = ['awaiting_approval', 'partially_completed', 'not_adopted', 'stopped', 'returned', 'not_selected']
      .map((s2) => L.userStatusLabel(s2));
    return labels.every((x) => typeof x === 'string' && x.length > 0 && !/_/.test(x));
  })(), noMod('taskLifecycleContract'));

red('P15. 업무·승인·결정 이력이 새로고침 후에도 보존된다(schemaVersion 보유·바이너리 미저장)',
  (() => { if (!S || !L) return false;
    store.clear(); resetIds();
    const t = mkTask();
    S.saveLifecycleTask(t);
    const reloaded = S.loadLifecycleTasks();
    const raw = [...store.values()].join('');
    return reloaded.length === 1 && reloaded[0].ref.taskId === t.ref.taskId
      && typeof S.SCHEMA_VERSION === 'number' && raw.includes('schemaVersion')
      && !raw.includes('data:image') && !raw.includes('base64');
  })(), noMod('taskLifecycleStore'));

red('P16. 구버전 원장 이벤트(taskId 없음)는 refId 로 안전 후퇴해 집계된다',
  (() => {
    const legacy = [
      LEDGER.createActivity({ teamId: 'product', type: 'task_run', status: 'pending', title: 'legacy', actor: { kind: 'agent', teamId: 'product', label: 'x', agentId: 'stock' }, refId: 'LEG1' }, AT),
      LEDGER.createActivity({ teamId: 'product', type: 'task_run', status: 'done', title: 'legacy', actor: { kind: 'agent', teamId: 'product', label: 'x', agentId: 'stock' }, refId: 'LEG1' }, '2026-07-23T00:00:02.000Z')
    ];
    const s2 = LEDGER.teamSummary(legacy, 'product');
    return s2.pending === 0 && s2.done === 1;
  })(), '구버전 호환 후퇴 실패', '구버전 refId 후퇴 정상');

red('P17. 레거시/화면 agentId 가 단일 별칭표로 canonical id 에 매핑된다',
  (() => { if (!ID) return false;
    return ID.toCanonicalAgentId('stock') === 'inventory_monitor'
      && ID.toCanonicalAgentId('order') === 'product_analyst'
      && ID.toCanonicalAgentId('inventory_monitor') === 'inventory_monitor'
      && typeof ID.displayAgentId === 'function';
  })(), noMod('agentIdRegistry'));

red('P18. handoff 가 부서의 모든 결과를 각각 처리하고 taskId/correlationId/resultId 를 보존한다',
  (() => {
    const out = HANDOFF.processHandoffs(RUN_ID, ALL_RESULTS, { taskId: 'T1', correlationId: 'C1' });
    const refd = new Set(out.handoffs.flatMap((h) => h.referencedResultIds));
    const allRefd = ALL_RESULTS.every((r) => refd.has(r.id));
    const idsUnique = new Set(out.handoffs.map((h) => h.id)).size === out.handoffs.length;
    const carries = out.handoffs.every((h) => h.taskId === 'T1' && h.correlationId === 'C1');
    return allRefd && idsUnique && carries;
  })(), 'handoff 가 일부 결과만 참조하거나 lifecycle 참조를 보존하지 않음');

red('P19. 일부 완료 후 실패한 부분만 재실행 대상으로 지목된다',
  (() => { if (!L) return false;
    resetIds();
    const { parent, okChild, badChild } = kids('all_required');
    const r = L.resolveParentStatus(parent, [okChild, badChild]);
    return r.retryableTaskIds.length === 1 && r.retryableTaskIds[0] === badChild.ref.taskId;
  })(), noMod('taskLifecycleContract'));

red('P20. 수정 요청은 기존 결과를 보존하고 같은 업무의 새 revision 을 만든다',
  (() => { if (!L) return false;
    resetIds();
    const t = mkTask({ approvalRoute: L.APPROVAL_ROUTES.team_internal });
    const r = L.decideApproval(t, { kind: 'request_revision', actor: LEAD_PRODUCT, reason: '수치 재확인' }, { nowIso: AT, newId: ids });
    return r.ok && !!r.revisionTask && r.revisionTask.ref.revisionOfTaskId === t.ref.taskId
      && r.task.status === 'superseded' && JSON.stringify(r.task).includes('수치 재확인');
  })(), noMod('taskLifecycleContract'));

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (생명주기 계약 — GREEN 미착수이므로 unmet>0 정상)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
console.log(`\n✗ RC-2 RED — 생명주기 계약 ${redUnmet}건 미충족(의도된 실패 · GREEN 대기)`);
process.exit(1);
