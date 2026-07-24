#!/usr/bin/env node
/*
 * scripts/smoke-rc2-app-integration-red-v0.mjs
 * RC-2 D-1 — App 실배선 통합 계약 (RED→GREEN)
 *
 * 배경: RC-2 GREEN 에서 계약 모듈(taskLifecycleContract/Store)은 40/40 통과했지만,
 *   **사용자가 실제로 누르는 App 경로**가 그 계약을 쓰지 않았다.
 *     - store 의 load/save 가 App 에서 한 번도 호출되지 않음
 *     - tasks/approvalQueue 가 useState([]) 로 시작 → 새로고침 보존 미연결
 *     - handleApprove/Reject 가 decideApproval 대신 상태를 직접 변경
 *     - 승인 후 filter 로 큐 항목을 **영구 삭제**(결정 이력 소실)
 *     - request_revision 경로·수동 업무 lifecycle·승인대기 completed 오표시
 *   → 40/40 은 "계약 모듈이 옳다"는 증거였지 "App 이 그 계약을 쓴다"는 증거가 아니었다.
 *
 * 이 검사는 App 이 쓸 **순수 상태 어댑터(taskLifecycleAppAdapter)** 를 실제로 호출해
 *   저장→새로고침→승인→새로고침 흐름을 검증한다. 문자열 대조는 배선 가드로만 최소 사용한다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2app-'));

// localStorage shim — 새로고침을 "모듈 상태를 비우고 저장소만 남기는" 것으로 재현한다.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

const ADAPTER_SRC = path.join(REPO, 'src', 'services', 'taskLifecycleAppAdapter.ts');
const hasAdapter = existsSync(ADAPTER_SRC);

let A = null, L = null, S = null;
try {
  execFileSync(process.execPath, [tscBin,
    ...(hasAdapter ? [ADAPTER_SRC] : []),
    path.join(REPO, 'src', 'services', 'taskLifecycleContract.ts'),
    path.join(REPO, 'src', 'services', 'taskLifecycleStore.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  const dir = path.join(tmp, 'services');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const imp = async (n) => import(pathToFileURL(path.join(dir, n)).href);
  L = await imp('taskLifecycleContract.js');
  S = await imp('taskLifecycleStore.js');
  if (hasAdapter) A = await imp('taskLifecycleAppAdapter.js');
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const appSource = readFileSync(path.join(REPO, 'src', 'App.tsx'), 'utf8');
const apprModal = readFileSync(path.join(REPO, 'src', 'components', 'ApprovalDetailModal.tsx'), 'utf8');
const taskBoard = readFileSync(path.join(REPO, 'src', 'components', 'TaskBoard.tsx'), 'utf8');
const taskResult = readFileSync(path.join(REPO, 'src', 'components', 'TaskResultModal.tsx'), 'utf8');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1 — App 실배선 통합 계약 (RED→GREEN) ===');

const AT = '2026-07-23T00:00:00.000Z';
const noAdapter = 'taskLifecycleAppAdapter 모듈 없음';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const resetIds = () => { _n = 0; };

const HQ = { kind: 'human', teamId: 'hq', label: '총괄 관리자', userId: 'u-hq' };
const LEAD_PRODUCT = { kind: 'human', teamId: 'product', label: '상품 팀장', userId: 'u-prod-lead' };

// RC-2 D-1.2/D-1.3: 업무는 생성만으로 승인 대기가 되지 않고(수신≠승인),
//   결과 확인 계열 결정은 '실제 제출된 결과'가 있어야 성립한다.
//   아래 검사들의 전제(= 확인 대기 N건)를 실제 경로(배정 → 제출)로 만들어 준다.
const startWork = (taskId, teamId) => {
  const lead = A.actorForRole(teamId);
  A.assignExecutor(taskId, { kind: 'human', actor: lead }, { nowIso: AT });
  return lead;
};
const submitted = (taskId, teamId) => {
  const lead = startWork(taskId, teamId);
  A.submitResult(taskId, { artifactRefs: [`art-${taskId}`], actor: lead }, { nowIso: AT });
};
const LEAD_CS = { kind: 'human', teamId: 'cs', label: 'CS 팀장', userId: 'u-cs-lead' };
const AI = { kind: 'agent', teamId: 'product', label: '재고 AI', agentId: 'inventory_monitor' };

// "새로고침" = 저장소만 남기고 다시 읽는다.
const reload = () => (A ? A.hydrateAppState() : { tasks: [], approvalQueue: [], history: [] });

// ── [BASE] 전제 ──────────────────────────────────────────────────────────────
base('B1. 계약 모듈과 저장 서비스는 이미 존재한다(RC-2 GREEN 산출물)',
  typeof L.createLifecycleTask === 'function' && typeof L.decideApproval === 'function' && typeof S.loadLifecycleTasks === 'function',
  'createLifecycleTask · decideApproval · loadLifecycleTasks');

base('B2. 저장소를 비우면 복원 결과도 비어 있다(테스트 격리)',
  (() => { store.clear(); return S.loadLifecycleTasks().length === 0; })(), '초기 0건');

// ── [RED] App 통합 계약 ──────────────────────────────────────────────────────
console.log('');

// A1. 저장 → 첫 hydration 복원
red('A1. 저장된 lifecycle task 가 첫 hydration 에서 App 업무 상태로 복원된다',
  (() => { if (!A) return false;
    store.clear(); resetIds();
    const t = L.createLifecycleTask({ title: '재고 점검', ownerTeamId: 'product', ownerHumanId: 'u-prod-lead',
      assignedAgentId: 'inventory_monitor', createdBy: HQ, approvalRoute: L.APPROVAL_ROUTES.hq_directive }, ids);
    S.saveLifecycleTask(t);
    // RC-2 D-1.2: 업무는 생성만으로 승인 대기가 되지 않는다(수신과 승인은 별개).
    //   팀장이 수행자를 정하고 결과가 제출돼야 확인 대상이 된다 → 아래 A2~A5 의 전제를 실제 경로로 만든다.
    //   결과를 낸 것은 배정받은 AI 이므로 제출자도 그 AI 다(D-1.3: 제출자=현재 수행자).
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['art-inv-1'],
      actor: { kind: 'agent', teamId: 'product', label: '재고 감시 AI', agentId: 'inventory_monitor' } }, { nowIso: AT });
    const st = reload();
    return st.tasks.length === 1 && st.tasks[0].id === t.ref.taskId && st.tasks[0].title === '재고 점검';
  })(), noAdapter, '복원 1건 · taskId 일치');

// A2. 승인 대기 + 이력이 새로고침 후 유지
red('A2. 승인 대기 항목과 결정 이력이 새로고침 후에도 유지된다',
  (() => { if (!A) return false;
    const st = reload();
    return st.approvalQueue.length === 1 && st.approvalQueue[0].taskId === st.tasks[0].id && st.history.length === 1;
  })(), noAdapter, '대기 1건 · 이력 1건');

// A3~A5. App 승인이 decideApproval 을 통과하고 HQ 2단계가 지켜진다
red('A3. App 승인 동작이 공통 decideApproval 을 통과한다(직접 상태 변경 아님)',
  (() => { if (!A) return false;
    const st = reload();
    const r = A.applyDecision(st.approvalQueue[0].taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    return r.ok === true;
  })(), noAdapter, '결정 적용됨');

red('A4. HQ 지시 업무는 팀장 1차 확인만으로 completed 가 되지 않는다',
  (() => { if (!A) return false;
    const st = reload();
    const t = st.tasks[0];
    return t.status !== 'completed' && st.approvalQueue.length === 1;
  })(), noAdapter, '다음 단계(총괄 확인) 남음');

red('A5. HQ 최종 확인 후에만 completed 가 된다',
  (() => { if (!A) return false;
    const r = A.applyDecision(reload().approvalQueue[0].taskId, { kind: 'approve', actor: HQ }, { nowIso: AT });
    if (!r.ok) return false;
    const st = reload();
    return st.tasks[0].status === 'completed' && st.approvalQueue.length === 0 && st.history.length === 1;
  })(), noAdapter, 'completed · pending 0 · 이력 유지');

// A6. 권한 없는 actor
red('A6. 권한 없는 actor 의 결정은 상태를 바꾸지 않는다',
  (() => { if (!A) return false;
    store.clear(); resetIds();
    const t = L.createLifecycleTask({ title: '권한 시험', ownerTeamId: 'product', ownerHumanId: 'u', assignedAgentId: 'x',
      createdBy: HQ, approvalRoute: L.APPROVAL_ROUTES.team_internal }, ids);
    S.saveLifecycleTask(t);
    const before = reload().tasks[0].status;
    const r1 = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_CS }, { nowIso: AT });     // 다른 팀
    const r2 = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: AI }, { nowIso: AT });          // AI 자기승인
    return r1.ok === false && r2.ok === false && reload().tasks[0].status === before;
  })(), noAdapter, '차단됨 · 상태 불변');

// A7. 수정 요청 — 원본 superseded + revision 둘 다 저장
red('A7. 수정 요청 시 원본 superseded + revision 신규 업무가 모두 저장된다',
  (() => { if (!A) return false;
    store.clear(); resetIds();
    const t = L.createLifecycleTask({ title: '수정 대상', ownerTeamId: 'product', ownerHumanId: 'u', assignedAgentId: 'x',
      createdBy: LEAD_PRODUCT, approvalRoute: L.APPROVAL_ROUTES.team_internal }, ids);
    S.saveLifecycleTask(t);
    submitted(t.ref.taskId, 'product');
    const r = A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: LEAD_PRODUCT, reason: '수치 재확인' }, { nowIso: AT, newId: ids.newId });
    if (!r.ok) return false;
    const all = S.loadLifecycleTasks();
    const orig = all.find((x) => x.ref.taskId === t.ref.taskId);
    const rev = all.find((x) => x.ref.revisionOfTaskId === t.ref.taskId);
    return !!orig && orig.status === 'superseded' && !!rev
      && rev.ref.correlationId === t.ref.correlationId && JSON.stringify(orig).includes('수치 재확인');
  })(), noAdapter, '원본 superseded + revision 저장');

// A8. 미채택·중단·반송이 삭제 없이 저장
red('A8. 이번 결과 미채택 · 작업 중단 · 협업 반송이 삭제 없이 저장된다',
  (() => { if (!A) return false;
    const mk = (title, roleRoute) => { const t = L.createLifecycleTask({ title, ownerTeamId: 'product', ownerHumanId: 'u',
      assignedAgentId: 'x', createdBy: LEAD_PRODUCT, approvalRoute: roleRoute, requestingTeamId: 'cs' }, ids); S.saveLifecycleTask(t); return t; };
    store.clear(); resetIds();
    const a = mk('미채택', L.APPROVAL_ROUTES.team_internal);
    const b = mk('중단', L.APPROVAL_ROUTES.team_internal);
    const c = mk('반송', L.APPROVAL_ROUTES.team_internal);
    submitted(a.ref.taskId, 'product');   // 미채택 = 제출된 결과를 안 쓰는 것
    submitted(b.ref.taskId, 'product');
    startWork(c.ref.taskId, 'product');    // 반송 = 수행 불가이므로 결과 전
    A.applyDecision(a.ref.taskId, { kind: 'not_adopted', actor: LEAD_PRODUCT, reason: '이번엔 미사용' }, { nowIso: AT });
    A.applyDecision(b.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '중단' }, { nowIso: AT });
    A.applyDecision(c.ref.taskId, { kind: 'return', actor: LEAD_PRODUCT, reason: '자료 부족' }, { nowIso: AT });
    const all = S.loadLifecycleTasks();
    const st = reload();
    return all.length === 3
      && all.find((x) => x.ref.taskId === a.ref.taskId).status === 'not_adopted'
      && all.find((x) => x.ref.taskId === b.ref.taskId).status === 'stopped'
      && all.find((x) => x.ref.taskId === c.ref.taskId).status === 'returned'
      && st.approvalQueue.length === 0 && st.history.length === 3;
  })(), noAdapter, '3건 보존 · pending 0 · 이력 3건');

// A9. 수동 업무도 공통 생성기를 통과
red('A9. 수동 업무도 createLifecycleTask 를 통과해 taskId/correlationId/approvalRoute 를 갖는다',
  (() => { if (!A) return false;
    store.clear(); resetIds();
    const t = A.createManualTask({ title: '수동 점검', ownerTeamId: 'product', ownerHumanId: 'u-prod-lead',
      assignedAgentId: 'inventory_monitor', createdBy: LEAD_PRODUCT }, ids);
    const saved = S.loadLifecycleTasks();
    return !!t.ref.taskId && t.ref.correlationId === t.ref.taskId
      && Array.isArray(t.approvalRoute?.stages) && t.approvalRoute.stages.length > 0
      && saved.length === 1 && saved[0].ref.taskId === t.ref.taskId
      && !/opt-task-/.test(t.ref.taskId);
  })(), noAdapter, 'taskId·correlationId·approvalRoute 보유 + 저장됨');

// A10. runtime 승인대기 업무가 completed 로 고정되지 않는다
red('A10. 승인 대기 runtime 제안 업무가 App 에서 completed 로 고정되지 않는다',
  (() => { if (!A) return false;
    store.clear(); resetIds();
    const accepted = A.acceptRuntimeProposals({
      proposedTasks: [{ id: 'T-run-1', correlationId: 'C-run', title: '재고 발주 검토', agentId: 'inventory_monitor', description: 'd' }],
      proposedApprovalItems: [{ taskId: 'T-run-1', correlationId: 'C-run', title: '재고 발주 검토', proposedAction: 'a', reason: 'r',
        agentId: 'inventory_monitor', artifact: { id: 'art1', runId: 'run1', resultId: 'res1', agentId: 'inventory_monitor',
          departmentId: 'product', type: 'inventory_report', title: 'x', body: 'y', approvalRequired: true, createdAt: AT } }]
    }, { createdBy: HQ, ...ids });
    const st = reload();
    const t = st.tasks.find((x) => x.id === 'T-run-1');
    return accepted.length >= 1 && !!t && t.status !== 'completed' && st.approvalQueue.some((q) => q.taskId === 'T-run-1');
  })(), noAdapter, '승인 대기 상태 유지');

red('A11. 승인 항목과 업무가 같은 taskId/correlationId 를 쓴다(App 이 새로 만들지 않음)',
  (() => { if (!A) return false;
    const st = reload();
    const q = st.approvalQueue.find((x) => x.taskId === 'T-run-1');
    const t = st.tasks.find((x) => x.id === 'T-run-1');
    return !!q && !!t && q.taskId === t.id && q.correlationId === t.correlationId;
  })(), noAdapter, 'taskId·correlationId 동일');

// A12. 재로드 2회에도 중복 없음
red('A12. 재로드 2회에도 중복 업무·승인 항목이 생기지 않는다',
  (() => { if (!A) return false;
    const s1 = reload(); const s2 = reload();
    const dup = new Set(s2.tasks.map((t) => t.id)).size !== s2.tasks.length;
    return !dup && s1.tasks.length === s2.tasks.length && s1.approvalQueue.length === s2.approvalQueue.length;
  })(), noAdapter, '중복 0');


// A13. pending 과 전체 이력 분리
red('A13. pending 집계와 전체 이력이 분리된다(승인·미채택·중단은 이력에만)',
  (() => { if (!A) return false;
    store.clear(); resetIds();
    const t1 = L.createLifecycleTask({ title: '대기', ownerTeamId: 'product', ownerHumanId: 'u', assignedAgentId: 'x', createdBy: LEAD_PRODUCT, approvalRoute: L.APPROVAL_ROUTES.team_internal }, ids);
    const t2 = L.createLifecycleTask({ title: '완료될것', ownerTeamId: 'product', ownerHumanId: 'u', assignedAgentId: 'x', createdBy: LEAD_PRODUCT, approvalRoute: L.APPROVAL_ROUTES.team_internal }, ids);
    S.saveLifecycleTasks([t1, t2]);
    submitted(t1.ref.taskId, 'product'); submitted(t2.ref.taskId, 'product');
    A.applyDecision(t2.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    const st = reload();
    return st.approvalQueue.length === 1 && st.approvalQueue[0].taskId === t1.ref.taskId
      && st.history.length === 2 && st.tasks.length === 2;
  })(), noAdapter, 'pending 1 · 이력 2');

// ── 배선 가드(최소) ──────────────────────────────────────────────────────────
red('A14. App 이 저장 서비스/결정 함수를 실제로 import·호출한다',
  /taskLifecycleAppAdapter/.test(appSource) &&
  /hydrateAppState|loadLifecycleTasks/.test(appSource) &&
  /applyDecision/.test(appSource),
  'App.tsx 가 어댑터를 쓰지 않음', 'App.tsx 에서 어댑터 호출 확인');

red('A15. App 에 승인 후 영구 삭제(filter) 경로가 없다',
  !/setApprovalQueue\(prev => prev\.filter/.test(appSource),
  'setApprovalQueue(...filter...) 잔존 → 결정 이력 소실');

red('A16. 수동 업무가 opt-task-${Date.now()} 로 생성되지 않는다',
  !/opt-task-\$\{Date\.now\(\)\}/.test(appSource), 'opt-task-… 임의 생성 잔존');

red('A17. App 상태가 저장소에서 복원된다(useState 빈 배열 시작 아님)',
  !/useState<OperationTask\[\]>\(\[\]\)/.test(appSource) && !/useState<ApprovalItem\[\]>\(\[\]\)/.test(appSource),
  'tasks/approvalQueue 가 useState([]) 로 시작');

red('A18. App 이 새 localStorage 직접 호출을 추가하지 않는다(RC-2 상태는 저장 서비스 소유)',
  !/localStorage\.(get|set)Item\(['"`]godo\.rc2/.test(appSource),
  'App 에 RC-2 localStorage 직접 호출 존재', 'RC-2 저장은 서비스가 단독 소유');

// ── 사용자 문구 정직화 ───────────────────────────────────────────────────────
const uiSources = { 'ApprovalDetailModal': apprModal, 'TaskBoard': taskBoard, 'TaskResultModal': taskResult };
for (const [name, src] of Object.entries(uiSources)) {
  red(`A19-${name}. '거절 (Reject)' 문구가 없다`, !/거절 \(Reject\)/.test(src), "'거절 (Reject)' 잔존");
}
red("A20. '승인 및 조치 실행' 문구가 없다(실제 외부 실행 미연동)",
  !/승인 및 조치 실행/.test(apprModal), "'승인 및 조치 실행' 잔존");
red('A21. 승인 상세에 확인완료·수정요청·미채택·작업중단 행동이 있다',
  /확인 완료/.test(apprModal) && /수정 요청/.test(apprModal) && /사용 안 함/.test(apprModal) && /작업 중단/.test(apprModal),
  '결정 4종 버튼 미비');
red('A22. 실제 미구현 외부 실행을 성공으로 단언하지 않는다',
  !/샌드박스로 임포트|쿠폰 발급 완료|외부 커밋 성공/.test(appSource + apprModal),
  '미연동 동작을 성공으로 단언하는 문구 잔존');


// ════════════════════════════════════════════════════════════════════════════
// D-1.1 — 역할·소유팀·승인함 실배선 (A23~A32)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- D-1.1 역할·소유팀·승인함 실배선 ---');

// 아직 없는 어댑터 함수를 호출해도 throw 하지 않고 RED 로 떨어지게 한다.
const has = (fn) => !!A && typeof A[fn] === 'function';
const ROLES = ['hq', 'product', 'cs', 'marketing', 'design'];
const LEADS = {
  hq: { kind: 'human', teamId: 'hq', label: '총괄 관리자', userId: 'u-hq' },
  product: { kind: 'human', teamId: 'product', label: '상품관리팀장', userId: 'u-product' },
  cs: { kind: 'human', teamId: 'cs', label: 'CS팀장', userId: 'u-cs' },
  marketing: { kind: 'human', teamId: 'marketing', label: '마케팅팀장', userId: 'u-marketing' },
  design: { kind: 'human', teamId: 'design', label: '디자인팀장', userId: 'u-design' }
};

// A23 — 실행 시작/실패 중에도 승인 목록 유지 (소스 가드 + 상태 보존)
red('A23. 작업 시작·실패 시 기존 승인 목록이 화면에서 사라지지 않는다',
  !/setApprovalQueue\(\[\]\)/.test(appSource) &&
  (appSource.match(/setApprovalQueue\(/g) || []).length <= 1,
  `setApprovalQueue([]) 잔존 또는 refreshLifecycleState 밖 직접 호출 (${(appSource.match(/setApprovalQueue\(/g) || []).length}회)`,
  'setApprovalQueue 는 refreshLifecycleState 단일 지점에서만');

// A24 — 역할 전환 → ActorRef
red('A24. 역할 전환(hq/product/cs/marketing/design)이 ActorRef 로 그대로 이어진다',
  (() => { if (!has('actorForRole')) return false;
    return ROLES.every((r) => {
      const actor = A.actorForRole(r);
      return actor && actor.kind === 'human' && actor.teamId === r && typeof actor.label === 'string' && actor.label.length > 0;
    });
  })(), noAdapter, ROLES.join('/') + ' 각각 일치');

// A25 — runtime 제안의 담당 팀 = 에이전트 소속
red('A25. runtime 제안 업무의 담당 팀이 에이전트 소속과 일치한다(제목 추측 아님)',
  (() => { if (!has('acceptRuntimeProposals')) return false;
    store.clear(); resetIds();
    const props = {
      proposedTasks: [
        { id: 'T-inv', correlationId: 'C1', title: '재고', agentId: 'inventory_monitor', description: 'd' },
        { id: 'T-cs', correlationId: 'C1', title: '문의', agentId: 'inquiry_analyst', description: 'd' },
        { id: 'T-mkt', correlationId: 'C1', title: '캠페인', agentId: 'campaign_planner', description: 'd' },
        { id: 'T-dsn', correlationId: 'C1', title: '디자인', agentId: 'design_lead', description: 'd' },
        { id: 'T-mgr', correlationId: 'C1', title: '총괄', agentId: 'manager_agent', description: 'd' }
      ],
      proposedApprovalItems: []
    };
    A.acceptRuntimeProposals(props, { createdBy: LEADS.hq, nowIso: AT });
    const all = S.loadLifecycleTasks();
    const owner = (id) => all.find((t) => t.ref.taskId === id)?.ownerTeamId;
    return owner('T-inv') === 'product' && owner('T-cs') === 'cs'
      && owner('T-mkt') === 'marketing' && owner('T-dsn') === 'design' && owner('T-mgr') === 'hq';
  })(), noAdapter, 'product/cs/marketing/design/hq 각각 일치');

// A26 — 수동 업무의 담당 팀·승인 경로가 생성자·수행팀 관계로 결정
red('A26. 수동 업무의 담당 팀·승인 경로가 생성자와 수행팀 관계로 결정된다',
  (() => { if (!has('actorForRole') || !has('createManualTask') || !has('pendingForActor')) return false;
    store.clear(); resetIds();
    // HQ 가 상품팀 에이전트에게 지시 → 담당팀 product · 2단계(팀장→HQ)
    const byHq = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: LEADS.hq }, ids);
    // 상품팀장이 자기 팀 업무 생성 → 담당팀 product · 1단계(팀장 종료)
    const byLead = A.createManualTask({ title: '팀 자체', assignedAgentId: 'inventory_monitor', createdBy: LEADS.product }, ids);
    // CS팀장이 상품팀에 협업 요청 → 담당팀 product · 2단계(수행팀장 → 요청팀)
    const collab = A.createManualTask({ title: '협업 요청', assignedAgentId: 'inventory_monitor', createdBy: LEADS.cs }, ids);
    return byHq.ownerTeamId === 'product' && byHq.approvalRoute.stages.length === 2
      && byHq.approvalRoute.stages[1].approverKind === 'hq'
      && byLead.ownerTeamId === 'product' && byLead.approvalRoute.stages.length === 1
      && collab.ownerTeamId === 'product' && collab.approvalRoute.stages.length === 2
      && collab.approvalRoute.stages[1].approverKind === 'requesting_team'
      && collab.requestingTeamId === 'cs';
  })(), noAdapter, 'HQ지시 2단계 · 팀자체 1단계 · 협업 요청팀확인');

// A27~A29 — 실제 단계 권한
red('A27. 상품팀 업무는 상품팀장 1차 확인만으로 completed 가 아니고 HQ 확인 후에만 completed',
  (() => { if (!has('actorForRole') || !has('createManualTask') || !has('pendingForActor')) return false;
    store.clear(); resetIds();
    const t = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: LEADS.hq }, ids);
    submitted(t.ref.taskId, 'product');
    const r1 = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: A.actorForRole('product') }, { nowIso: AT });
    if (!r1.ok) return false;
    const mid = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId);
    if (mid.status === 'completed') return false;
    const r2 = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: A.actorForRole('hq') }, { nowIso: AT });
    const end = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId);
    return r2.ok && end.status === 'completed';
  })(), noAdapter, '1차 후 대기 · HQ 후 완료');

red('A28. HQ 가 담당 팀장 단계를 건너뛰어 먼저 승인할 수 없다(상태 불변)',
  (() => { if (!has('actorForRole') || !has('createManualTask') || !has('pendingForActor')) return false;
    store.clear(); resetIds();
    const t = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: LEADS.hq }, ids);
    const before = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId).status;
    const r = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: A.actorForRole('hq') }, { nowIso: AT });
    const after = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId);
    return r.ok === false && after.status === before && after.decisions.length === 0;
  })(), noAdapter, '차단 · 상태·이력 불변');

red('A29. 상품팀장은 CS·마케팅팀 업무 단계를 처리할 수 없다',
  (() => { if (!has('actorForRole') || !has('createManualTask') || !has('pendingForActor')) return false;
    store.clear(); resetIds();
    const csTask = A.createManualTask({ title: 'CS 업무', assignedAgentId: 'inquiry_analyst', createdBy: LEADS.cs }, ids);
    const mktTask = A.createManualTask({ title: '마케팅 업무', assignedAgentId: 'campaign_planner', createdBy: LEADS.marketing }, ids);
    const r1 = A.applyDecision(csTask.ref.taskId, { kind: 'approve', actor: A.actorForRole('product') }, { nowIso: AT });
    const r2 = A.applyDecision(mktTask.ref.taskId, { kind: 'approve', actor: A.actorForRole('product') }, { nowIso: AT });
    return r1.ok === false && r2.ok === false;
  })(), noAdapter, '타 팀 단계 차단');

// A30 — 팀장 '내 확인 대기'
red('A30. 팀장 역할에서 본인이 결정 가능한 업무만 "내 확인 대기" 에 보인다',
  (() => { if (!has('actorForRole') || !has('createManualTask') || !has('pendingForActor')) return false;
    store.clear(); resetIds();
    const pt = A.createManualTask({ title: '상품 업무', assignedAgentId: 'inventory_monitor', createdBy: LEADS.hq }, ids);
    const ct = A.createManualTask({ title: 'CS 업무', assignedAgentId: 'inquiry_analyst', createdBy: LEADS.hq }, ids);
    submitted(pt.ref.taskId, 'product'); submitted(ct.ref.taskId, 'cs');
    const forProduct = A.pendingForActor(A.actorForRole('product'));
    const forCs = A.pendingForActor(A.actorForRole('cs'));
    const forHq = A.pendingForActor(A.actorForRole('hq'));
    return forProduct.length === 1 && forProduct[0].title === '상품 업무'
      && forCs.length === 1 && forCs[0].title === 'CS 업무'
      && forHq.length === 0;   // 아직 팀장 단계라 HQ 는 결정할 수 없다
  })(), noAdapter, '팀장 각 1건 · HQ 0건(팀장 단계 선행)');

red('A30b. HQ 는 전체 업무를 열람할 수 있다(결정 가능 여부와 분리)',
  (() => { if (!has('actorForRole') || !has('createManualTask') || !has('pendingForActor')) return false;
    const all = A.hydrateAppState();
    return all.tasks.length === 2 && A.pendingForActor(A.actorForRole('hq')).length === 0;
  })(), noAdapter, '열람 2건 · 결정 가능 0건');

// A31 — 결정 후 새로고침 보존
red('A31. 각 결정 후 새로고침해도 단계·이력·원본·수정본이 보존된다',
  (() => { if (!has('actorForRole') || !has('createManualTask') || !has('pendingForActor')) return false;
    store.clear(); resetIds();
    const t = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: LEADS.hq }, ids);
    submitted(t.ref.taskId, 'product');
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: A.actorForRole('product') }, { nowIso: AT });
    const afterStage1 = reload();
    const stillPending = afterStage1.approvalQueue.some((q) => q.taskId === t.ref.taskId);
    const rev = A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: A.actorForRole('hq'), reason: '재확인' },
      { nowIso: AT, newId: ids.newId });
    const after = reload();
    const all = S.loadLifecycleTasks();
    const orig = all.find((x) => x.ref.taskId === t.ref.taskId);
    const revision = all.find((x) => x.ref.revisionOfTaskId === t.ref.taskId);
    return stillPending && rev.ok && orig.status === 'superseded' && !!revision
      && orig.decisions.length === 2 && after.history.length === all.length;
  })(), noAdapter, '단계·이력·원본·수정본 보존');

// A32 — 기존 N건 + 신규 합침
red('A32. 기존 승인 N건에 새 runtime 결과가 더해질 때 소실·중복이 없다',
  (() => { if (!has('actorForRole') || !has('createManualTask') || !has('pendingForActor')) return false;
    store.clear(); resetIds();
    const e1 = A.createManualTask({ title: '기존1', assignedAgentId: 'inventory_monitor', createdBy: LEADS.hq }, ids);
    const e2 = A.createManualTask({ title: '기존2', assignedAgentId: 'inquiry_analyst', createdBy: LEADS.hq }, ids);
    submitted(e1.ref.taskId, 'product'); submitted(e2.ref.taskId, 'cs');
    const before = reload().approvalQueue.length;
    // D-1.3: 결과로 인정하려면 실제 근거가 있어야 한다(artifact 또는 텍스트 보고).
    A.acceptRuntimeProposals({
      proposedTasks: [{ id: 'T-new', correlationId: 'C-new', title: '신규', agentId: 'campaign_planner', description: 'd' }],
      proposedApprovalItems: [{ taskId: 'T-new', correlationId: 'C-new', title: '신규', agentId: 'campaign_planner',
        artifactRefs: ['art-campaign-1'] }]
    }, { createdBy: LEADS.hq, nowIso: AT });
    const after = reload();
    const ids2 = after.approvalQueue.map((q) => q.taskId);
    return before === 2 && after.approvalQueue.length === 3
      && new Set(ids2).size === ids2.length
      && after.tasks.some((t) => t.title === '기존1') && after.tasks.some((t) => t.title === '기존2');
  })(), noAdapter, '2 → 3건 · 중복 0 · 기존 보존');

// ── 소스 가드 ────────────────────────────────────────────────────────────────
red('A33. sessionActor 가 teamId:\'hq\' 로 하드코딩돼 있지 않다',
  !/toActorRef\(\{\s*teamId:\s*'hq'/.test(appSource),
  "sessionActor 가 'hq' 고정");

red('A34. runtime/manual 생성부에 무조건 ownerTeamId:\'hq\' 가 없다',
  !/ownerTeamId:\s*'hq'/.test(appSource),
  "App 에 ownerTeamId:'hq' 고정 잔존");

red('A35. App 이 역할 전환기(sessionRole)를 결정 권한에 연결한다',
  /actorForRole/.test(appSource) && /viewerRole|sessionRole|loadRole/.test(appSource),
  'App 이 역할을 ActorRef 로 쓰지 않음');

red('A36. 팀장용 "내 확인 대기" 진입로가 기존 승인 모달을 재사용해 존재한다',
  /내 확인 대기/.test(appSource + apprModal + readFileSync(path.join(REPO, 'src', 'components', 'ApprovalListModal.tsx'), 'utf8')) &&
  /pendingForActor/.test(appSource),
  "'내 확인 대기' 진입로 없음");


console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (전제 — fail>0이면 검사 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (App 실배선 통합 계약 A1~A36)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0 || redUnmet > 0) {
  console.log(`\n✗ 미충족 — BASE fail ${baseF} · RED unmet ${redUnmet}`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1 도달 (App 실경로가 생명주기 계약을 사용)');
