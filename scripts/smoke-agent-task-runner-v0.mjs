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
let R = null, A = null, TC = null, S = null, DEFAULTS = null, DEPT = null;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'agentTaskRunner.ts'),
    path.join(REPO, 'src', 'types', 'agentTask.ts'),
    path.join(REPO, 'src', 'services', 'teamMessageCenter.ts'),
    // D-0: 상태 복원 계약과 기본 업무 스펙도 함께 컴파일해 실제 반환값으로 검사한다.
    path.join(REPO, 'src', 'services', 'agentTaskRunState.ts'),
    path.join(REPO, 'src', 'data', 'defaultAgentTasks.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const p of walkJs(tmp)) {
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const find = (name) => walkJs(tmp).find((p) => p.endsWith(name));
  R = await import(pathToFileURL(find('agentTaskRunner.js')).href);
  A = await import(pathToFileURL(find('agentTask.js')).href);
  TC = await import(pathToFileURL(find('teamMessageCenter.js')).href);
  const stPath = find('agentTaskRunState.js');
  if (stPath) S = await import(pathToFileURL(stPath).href);
  const dfPath = find('defaultAgentTasks.js');
  if (dfPath) DEFAULTS = await import(pathToFileURL(dfPath).href);
  // agentTaskRunner 가 이미 끌어온 공통 스냅샷 엔진 — CS 수치 검증에 그대로 쓴다.
  const dsPath = find('departmentDataSourceOfTruth.js');
  if (dsPath) DEPT = await import(pathToFileURL(dsPath).href);
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
  // D-0 교체: 과거에는 `revenue=null` 이어도 보고를 전송했다. 새 계약에서는
  //   데이터 없음·연결 안 됨을 완료·대기로 저장하지 않으므로 **유효한 시험자료**로 실행한다.
  const SIM_REVENUE = {
    count: 0, source: 'mock', live: false,
    realOrdersStatus: 'unavailable', syntheticStatus: 'success',
    summary: { syntheticOrderCount: 1, realOrderCount: 0, syntheticTotalNetSoldQuantity: 0 },
    stockImpact: [], orders: []
  };
  const productLead = { kind: 'human', teamId: 'product', label: '[시험] 상품팀장', userId: 'u-product-lead', accountRole: 'team_lead' };
  const productMember = { kind: 'human', teamId: 'product', label: '[시험] 상품팀원', userId: 'u-product-member', accountRole: 'member' };
  const csLead = { kind: 'human', teamId: 'cs', label: '[시험] CS팀장', userId: 'u-cs-lead', accountRole: 'team_lead' };

  const specAuto = { ...specInv, approvalMode: 'auto', standing: APPROVED_STANDING };
  const ran = R.runScheduledAgentTask(specAuto, { revenue: SIM_REVENUE, nowIso: NOW });
  ok('8. 스케줄 진입점이 상시 지시 승인분을 실행', ran.ran === true && typeof ran.body === 'string');
  const out = { posted: TC.inboxFor(TC.loadTeamMessages(), 'hq')[0] };
  ok('8b. 미승인 상시 지시는 실행되지 않음',
    R.runScheduledAgentTask({ ...specInv, approvalMode: 'auto' }, { revenue: SIM_REVENUE, nowIso: NOW }).ran === false);
  ok('8c. 수동 진입점은 담당 팀장만',
    R.runManualAgentTask(specAuto, csLead, { revenue: SIM_REVENUE, nowIso: NOW }).ran === false
    && R.runManualAgentTask({ ...specAuto, id: 't-auto2' }, productLead, { revenue: SIM_REVENUE, nowIso: NOW }).ran === true);
  ok('8d. 데이터 없음(revenue=null)은 실행·대기·기록을 만들지 않는다', (() => {
    const before = JSON.parse(store.get('godo_activity_ledger_v0') || '[]').length;
    const r = R.runManualAgentTask({ ...specAuto, id: 't-nodata' }, productLead, { revenue: null, nowIso: NOW });
    return r.ran === false && r.staged === false
      && JSON.parse(store.get('godo_activity_ledger_v0') || '[]').length === before;
  })());
  const hqInbox = TC.inboxFor(TC.loadTeamMessages(), 'hq');
  ok('9. reportTo(hq) 요청함에 보고 도착', hqInbox.some((m) => m.id === out.posted.id));
  const msg = hqInbox.find((m) => m.id === out.posted.id);
  ok('10. 발신자 actor=AI 에이전트(agentId 포함)', msg.from.kind === 'agent' && msg.from.agentId === 'a' && msg.from.teamId === 'product');
  ok('11. 보고 제목=작업명', msg.title === '재고·매출 일일 점검');

  // 4) 승인 경로: stageApprovalTask → 원장 pending(발신 없음), approveAgentTask → 발신 + approval(done)
  const ledger = () => JSON.parse(store.get('godo_activity_ledger_v0') || '[]');
  store.clear();
  const specAppr = { ...specInv, id: 't2', approvalMode: 'approval' };
  const staged = R.runManualAgentTask(specAppr, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
  ok('12. stage: 본문 생성', staged.staged === true && typeof staged.body === 'string');
  ok('13. stage: 원장 task_run(pending)만·메시지 발신 없음', ledger().filter((e) => e.type === 'task_run' && e.status === 'pending').length === 1 && TC.inboxFor(TC.loadTeamMessages(), 'hq').length === 0);
  const appr = R.approveAgentTask(specAppr, productLead, { revenue: SIM_REVENUE, nowIso: NOW }, '사람이 승인한 본문');
  ok('14. approve: 발신됨(승인 본문)', appr.ok === true && !!appr.posted && TC.inboxFor(TC.loadTeamMessages(), 'hq').some((m) => m.id === appr.posted.id && m.body === '사람이 승인한 본문'));
  ok('15b. approve: 원장에 approval(done) 기록', ledger().some((e) => e.type === 'approval' && e.status === 'done'));

  // ══════════════════════════════════════════════════════════════════════
  // D-0 Task 1 — 업무기록 장부에서 반복 업무 상태를 복원하는 순수 계약
  //   새로고침·탭 이동 뒤에도 같은 상태가 복원되어야 한다. React 메모리를 정본으로 두지 않는다.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n  --- D-0 Task 1 · 장부 기반 상태 복원 ---');
  {
    const SPEC_ID = 'task-product-daily';
    const TID = 'agenttask-task-product-daily';
    const ev = (o) => ({ id: `e${Math.random()}`, teamId: 'product', taskId: TID, at: NOW, actor: { kind: 'agent', teamId: 'product', label: '상품 관리 AI', agentId: 'product-lead' }, title: 't', ...o });
    const st = (events) => (S ? S.latestAgentTaskRunState(events, SPEC_ID) : { phase: '모듈 없음' });

    const state = st([ev({ type: 'task_run', status: 'pending', resultBody: '재고 위험 4건', dataProvenance: 'simulation' })]);
    ok('상태 1. pending 복원', state.phase === 'awaiting_review');

    const done = st([
      ev({ type: 'task_run', status: 'pending', resultBody: '재고 위험 4건', dataProvenance: 'simulation' }),
      ev({ type: 'task_run', status: 'done' }),
      ev({ type: 'approval', status: 'done', actor: { kind: 'human', teamId: 'product', label: '[시험] 상품팀장', userId: 'u-product-lead' } })
    ]);
    ok('상태 2. 완료 뒤 결과·출처 복원',
      done.phase === 'completed'
      && done.resultBody === '재고 위험 4건'
      && done.dataProvenance === 'simulation');

    const rejected = st([
      ev({ type: 'task_run', status: 'pending', resultBody: '재고 위험 4건', dataProvenance: 'simulation' }),
      ev({ type: 'approval', status: 'rejected', decisionReason: '재고 수치를 다시 확인해 주세요' })
    ]);
    ok('상태 3. 반려 사유 복원',
      rejected.phase === 'rejected'
      && rejected.decisionReason === '재고 수치를 다시 확인해 주세요');

    // 같은 at 값이어도 배열 뒤가 최신이다(원장은 append-only).
    const sameTime = st([
      ev({ type: 'task_run', status: 'pending' }),
      ev({ type: 'task_run', status: 'done' })
    ]);
    ok('상태 4. 같은 시각에는 배열 뒤 이벤트가 최신', sameTime.phase === 'completed');

    // 구버전 저장분: 선택 필드가 아예 없다.
    const legacy = st([{ id: 'l1', teamId: 'product', taskId: TID, type: 'task_run', status: 'pending', title: 't', actor: { kind: 'agent', teamId: 'product', label: 'AI' }, at: NOW }]);
    ok('상태 5. 과거 이벤트 선택 필드 누락 허용', legacy.phase === 'awaiting_review');

    ok('상태 6. 다른 업무 이벤트는 섞이지 않는다',
      st([{ ...ev({ type: 'task_run', status: 'done' }), taskId: 'agenttask-other' }]).phase === 'idle');
    ok('상태 7. 장부 추적 키가 runner 와 같다',
      !!S && S.agentTaskActivityId(SPEC_ID) === TID && R.lifecycleTaskId({ id: SPEC_ID }) === TID);
  }

  // ══════════════════════════════════════════════════════════════════════
  // D-0 Task 2 — 상품 일일 점검을 **팀 내부 완료**로. 출처·행위자·중복 방지 고정.
  //   HQ 요청함·HQ 승인대기를 자동 생성하지 않는다(D-010).
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n  --- D-0 Task 2 · 팀 내부 완주 ---');
  {
    const inbox = (teamId) => TC.inboxFor(TC.loadTeamMessages(), teamId);
    const productDaily = DEFAULTS ? DEFAULTS.DEFAULT_AGENT_TASKS.find((t) => t.id === 'task-product-daily') : null;
    const internalSpec = productDaily ? { ...productDaily, schedule: { kind: 'manual' } } : null;

    ok('내부 1. 상품 일일 점검 reportTo=product', !!internalSpec && internalSpec.reportTo === 'product');
    ok('내부 2. 시험 결과는 시험 데이터', (() => {
      const rep = R.formatTaskReport(internalSpec ?? specInv, { ...snap, sourceMode: 'synthetic' });
      return rep.dataProvenance === 'simulation' && rep.dataLabel === '시험 데이터' && rep.body.startsWith('[시험 데이터]');
    })());
    ok('내부 2b. 실제·연결 안 됨이 서로 바뀌지 않는다', (() => {
      const real = R.formatTaskReport(internalSpec ?? specInv, { ...snap, sourceMode: 'real' });
      const none = R.formatTaskReport(internalSpec ?? specInv, { ...snap, sourceMode: 'unavailable' });
      return real.dataProvenance === 'actual' && real.dataLabel === '실제 데이터'
        && none.dataProvenance === 'unavailable' && none.dataLabel === '연결 안 됨';
    })());

    store.clear();
    const noData = R.runManualAgentTask(internalSpec, productLead, { revenue: null, nowIso: NOW });
    ok('내부 3. 데이터 없음은 완료·pending·메시지 0건',
      noData.ran === false && noData.staged === false
      && ledger().length === 0 && inbox('hq').length === 0 && inbox('product').length === 0);

    store.clear();
    const memberAttempt = R.runManualAgentTask(internalSpec, productMember, { revenue: SIM_REVENUE, nowIso: NOW });
    ok('내부 4. 상품팀 member는 실행 불가',
      memberAttempt.ran === false && memberAttempt.staged === false && ledger().length === 0);
    const leadAttempt = R.runManualAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
    ok('내부 5. 상품팀장만 실행 가능', leadAttempt.ran === false && leadAttempt.staged === true);
    ok('내부 6. 실행 뒤 pending 1건',
      ledger().filter((e) => e.type === 'task_run' && e.status === 'pending').length === 1);

    const beforeDuplicate = ledger().length;
    const duplicate = R.runManualAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
    ok('내부 7. pending 중 재클릭은 새 pending 0건',
      duplicate.ran === false && duplicate.staged === false && ledger().length === beforeDuplicate);

    const approved = R.approveAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW }, leadAttempt.body);
    ok('내부 8. 확인 뒤 HQ 메시지 0건', approved.ok === true && inbox('hq').length === 0);
    ok('내부 9. 확인 뒤 product 자기 메시지도 0건', inbox('product').length === 0);
    ok('내부 10. task_run done의 actor는 agent',
      ledger().some((e) => e.type === 'task_run' && e.status === 'done'
        && e.actor.kind === 'agent' && e.actor.agentId === internalSpec.agentId));
    ok('내부 11. approval done의 actor는 실제 팀장 label/userId',
      ledger().some((e) => e.type === 'approval' && e.status === 'done'
        && e.actor.label === productLead.label && e.actor.userId === productLead.userId));
    ok('내부 11b. 새 기록에 \'운영자\' 하드코딩 없음',
      ledger().every((e) => e.actor.label !== '운영자'));
    ok('내부 11c. 확인 완료 상태·결과·출처가 장부에서 복원된다', (() => {
      const st = S.latestAgentTaskRunState(ledger(), internalSpec.id);
      return st.phase === 'completed' && st.resultBody === leadAttempt.body && st.dataProvenance === 'simulation';
    })());

    store.clear();
    R.runManualAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
    const blank = R.rejectAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW }, '   ');
    ok('내부 11d. 사유 없는 반려는 거부되고 원장을 바꾸지 않는다',
      blank.ok === false && S.latestAgentTaskRunState(ledger(), internalSpec.id).phase === 'awaiting_review');
    R.rejectAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW }, '재고 수치를 다시 확인해 주세요');
    const rejectedState = S.latestAgentTaskRunState(ledger(), internalSpec.id);
    ok('내부 12. 반려 사유 한 문장 복원',
      rejectedState.phase === 'rejected'
      && rejectedState.decisionReason === '재고 수치를 다시 확인해 주세요');

    store.clear();
    // 계획서 스니펫 교정: `task-product-daily` 에는 `standing` 이 없어
    //   `canRunStandingDirective(undefined)` 가 `requiresLeadConfirmation: true` 를 돌려준다
    //   (기존 규칙 `standingDirectiveContract.ts:63-71` — 이번 구현이 바꾼 동작이 아니다).
    //   auto 전송 경로에 실제로 도달해야 회귀를 볼 수 있으므로 승인된 상시 지시를 붙인다.
    const externalSpec = { ...internalSpec, id: 'external-regression', reportTo: 'hq', approvalMode: 'auto', standing: APPROVED_STANDING };
    const externalRun = R.runManualAgentTask(externalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
    ok('회귀 1. reportTo가 다른 팀인 기존 업무는 메시지 전송 유지',
      externalRun.ran === true && inbox('hq').length === 1);
  }

  // ══════════════════════════════════════════════════════════════════════
  // D-0 Task 3 — 화면 배선. 상태 정본이 React 메모리가 아니라 업무기록 장부여야 한다.
  //   (배선 정적 검사 — 화면 동작 자체는 위 실행 검사와 Codex 게이트가 함께 증명한다.)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n  --- D-0 Task 3 · 패널 장부 구독 배선 ---');
  {
    const panelSource = readFileSync(path.join(REPO, 'src/components/AgentTaskPanel.tsx'), 'utf8');
    const workspaceSource = readFileSync(path.join(REPO, 'src/components/DepartmentWorkspacePanel.tsx'), 'utf8');
    const modalSource = readFileSync(path.join(REPO, 'src/components/DeptActivityModal.tsx'), 'utf8');

    ok('UI 1. AgentTaskPanel이 activityLedgerRepository를 구독',
      /subscribeActivity/.test(panelSource) && /latestAgentTaskRunState/.test(panelSource));
    // 계획서 스니펫 교정: 원래 단언은 `useState<Record<string,string>>({})` 라는 **일반 React 관용구**를
    //   통째로 금지해, 저장 전 단기 입력값(초안·사유·안내)까지 막았다. 확인하려는 사실은
    //   "**업무 결과 상태**를 React 정본으로 두지 않는다" 이므로 그것을 직접 본다 — 더 강한 판정이다.
    ok('UI 2. done/pending 결과 상태를 useState 정본으로 두지 않음',
      !/\[\s*done\s*,\s*setDone\s*\]/.test(panelSource)
      && !/\[\s*pending\s*,\s*setPending\s*\]/.test(panelSource)
      && !/useState<Record<string, Pending>>/.test(panelSource)
      && /latestAgentTaskRunState\(activity/.test(panelSource)
      && /st\.resultBody/.test(panelSource));
    ok('UI 3. 실제 identity.actor 전달', /actor=\{identity\.actor\}/.test(workspaceSource));
    ok('UI 4. 팀 내부 완료 문구 존재',
      /팀 내부 확인 완료/.test(panelSource) && /팀 내부 점검/.test(panelSource));
    ok('UI 5. 반려가 rejectAgentTask 호출', /rejectAgentTask\(/.test(panelSource));
    ok('UI 6. 취소가 로컬 pending 삭제만 하지 않음',
      /cancelAgentTask\(/.test(panelSource) && !/delete n\[t\.id\]/.test(panelSource));
    ok('UI 7. viewerRole 대신 실제 행위자 기반 권한',
      !/viewerRole/.test(panelSource) && /canOperate/.test(workspaceSource));
    ok('UI 8. 부서 업무 확인 화면이 실패 상태를 빈 문구로 두지 않음',
      /failed:\s*'실패'/.test(modalSource));
  }

  // ══════════════════════════════════════════════════════════════════════
  // D-0 두 번째 팀 업무 — CS 문의·리뷰 일일 점검 팀 내부 완주 (D-010)
  //   CS 상담 AI 가 시험자료로 초안을 만들고, CS팀장이 확인·수정해 팀 내부 기록으로 마감한다.
  //   HQ 자동 보고·자동 승인 요청을 만들지 않는다. 상품팀에서 만든 **일반 내부 업무 경계**
  //   (`reportTo === teamId`)를 그대로 재사용한다 — 팀 이름 조건문을 만들지 않는다.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n  --- D-0 · CS 문의·리뷰 일일 점검 팀 내부 완주 ---');
  {
    const inbox = (teamId) => TC.inboxFor(TC.loadTeamMessages(), teamId);
    const csDaily = DEFAULTS ? DEFAULTS.DEFAULT_AGENT_TASKS.find((t) => t.id === 'task-cs-daily') : null;
    const csSpec = csDaily ? { ...csDaily, schedule: { kind: 'manual' } } : null;

    // 시험 fixture — 문의 5건(미처리 3) · 리뷰 2건.
    //   autoCandidates = 리뷰 2 + (미처리 & 배송 주제) 2 = 4  (기존 계약 그대로, 새 계산식 없음)
    const inq = (status, topic) => ({ inquiryId: `q${Math.random()}`, status, topic, createdAt: '2026-06-20 09:00:00' });
    const CS_REVENUE = {
      count: 0, source: 'mock', live: false,
      realOrdersStatus: 'unavailable', syntheticStatus: 'success',
      summary: { syntheticOrderCount: 1, realOrderCount: 0, syntheticTotalNetSoldQuantity: 0 },
      stockImpact: [], orders: [],
      universeAux: {
        customers: [],
        reviews: [{ reviewId: 'rv1', rating: 5 }, { reviewId: 'rv2', rating: 2 }],
        inquiries: [
          inq('answered', 'delivery'),      // 처리됨 — 자동응대 후보 아님
          inq('unanswered', 'delivery'),    // 미처리 + 배송 → 후보
          inq('unanswered', 'payment'),     // 미처리
          inq('needs_human', '배송'),        // 미처리 + 배송 → 후보
          inq('answered', 'refund')          // 처리됨
        ],
        meta: { syntheticProfile: 'commerce_universe_v1' }
      }
    };
    const csLeadActor = { kind: 'human', teamId: 'cs', label: '[시험] CS팀장', userId: 'u-cs-lead', accountRole: 'team_lead' };
    const csMember = { kind: 'human', teamId: 'cs', label: '[시험] CS팀원', userId: 'u-cs-member', accountRole: 'member' };
    const hqActor = { kind: 'human', teamId: 'hq', label: '[시험] 총괄', userId: 'u-hq', accountRole: 'hq' };
    const otherLead = { kind: 'human', teamId: 'product', label: '[시험] 상품팀장', userId: 'u-p-lead', accountRole: 'team_lead' };
    const aiActor = { kind: 'agent', teamId: 'cs', label: 'CS 상담 AI', agentId: 'cs-lead' };
    const csCtx = { revenue: CS_REVENUE, nowIso: NOW };

    ok('CS 1. task-cs-daily 가 팀 내부 업무다(reportTo=cs · draft 유지)',
      !!csSpec && csSpec.reportTo === 'cs' && csSpec.approvalMode === 'draft' && csSpec.focus === 'cs');

    const csReport = csSpec ? R.formatTaskReport(csSpec, DEPT.buildDepartmentSourceOfTruthSnapshot(CS_REVENUE, { nowMs: 0 })) : null;
    ok('CS 2. 시험 fixture 의 문의·리뷰 수치가 결과에 정확히 들어간다', (() => {
      if (!csReport) return false;
      return /총 문의 5건 중 미처리 3건 · 리뷰 2건 · 자동응대 후보 4건\./.test(csReport.body);
    })(), csReport ? csReport.body : '보고 없음');
    ok('CS 3. 출처가 simulation 이고 사용자 문구는 시험 데이터',
      !!csReport && csReport.dataProvenance === 'simulation' && csReport.dataLabel === '시험 데이터'
      && csReport.body.startsWith('[시험 데이터]'));

    store.clear();
    ok('CS 5. CS팀원·HQ·타 팀장·AI 는 실행할 수 없다',
      [csMember, hqActor, otherLead, aiActor].every((a) => {
        const r = R.runManualAgentTask(csSpec, a, csCtx);
        return r.ran === false && r.staged === false;
      }) && ledger().length === 0);

    const csRun = R.runManualAgentTask(csSpec, csLeadActor, csCtx);
    ok('CS 4. CS팀장 실행 허용(초안 대기)', csRun.ran === false && csRun.staged === true && typeof csRun.body === 'string');
    ok('CS 6. 실행 후 pending 정확히 1건',
      ledger().filter((e) => e.type === 'task_run' && e.status === 'pending').length === 1);

    const beforeDup = ledger().length;
    const csDup = R.runManualAgentTask(csSpec, csLeadActor, csCtx);
    ok('CS 7. pending 중 재클릭 시 추가 pending 0건',
      csDup.ran === false && csDup.staged === false && ledger().length === beforeDup);

    // draft — 팀장이 AI 초안을 수정해 확인한다.
    const EDITED = '[시험 데이터] 총 문의 5건 중 미처리 3건. 배송 지연 문의 2건은 오늘 중 답변 예정.';
    const csApproved = R.approveAgentTask(csSpec, csLeadActor, csCtx, EDITED);
    ok('CS 8. 팀장이 수정한 초안이 최종 결과로 복원된다', (() => {
      const st = S.latestAgentTaskRunState(ledger(), csSpec.id);
      return csApproved.ok === true && st.phase === 'completed' && st.resultBody === EDITED
        && st.dataProvenance === 'simulation';
    })());
    ok('CS 9. 확인 후 HQ inbox 0건', inbox('hq').length === 0);
    ok('CS 10. 확인 후 CS 자기 inbox 0건', inbox('cs').length === 0);
    ok('CS 11. AI 계산 actor 와 실제 팀장 actor 가 구분돼 남는다',
      ledger().some((e) => e.type === 'task_run' && e.status === 'done'
        && e.actor.kind === 'agent' && e.actor.agentId === csSpec.agentId)
      && ledger().some((e) => e.type === 'approval' && e.status === 'done'
        && e.actor.kind === 'human' && e.actor.label === csLeadActor.label && e.actor.userId === csLeadActor.userId));
    ok('CS 14. 새로고침을 가정해 원장만 다시 읽어도 상태가 복원된다', (() => {
      // 화면 메모리를 쓰지 않고 저장소 원본만으로 다시 계산한다.
      const reread = JSON.parse(store.get('godo_activity_ledger_v0') || '[]');
      const st = S.latestAgentTaskRunState(reread, csSpec.id);
      return st.phase === 'completed' && st.resultBody === EDITED
        && st.dataProvenance === 'simulation' && st.actor.userId === csLeadActor.userId;
    })());

    store.clear();
    R.runManualAgentTask(csSpec, csLeadActor, csCtx);
    R.rejectAgentTask(csSpec, csLeadActor, csCtx, '리뷰 건수가 어제와 달라 다시 확인해 주세요');
    ok('CS 12. 반려 이유가 실제 팀장 신원과 함께 복원된다', (() => {
      const st = S.latestAgentTaskRunState(ledger(), csSpec.id);
      return st.phase === 'rejected'
        && st.decisionReason === '리뷰 건수가 어제와 달라 다시 확인해 주세요'
        && st.actor.userId === csLeadActor.userId;
    })());

    store.clear();
    const csNoData = R.runManualAgentTask(csSpec, csLeadActor, { revenue: null, nowIso: NOW });
    const csUnavail = R.runManualAgentTask(csSpec, csLeadActor, {
      revenue: { ...CS_REVENUE, syntheticStatus: 'unavailable', summary: null }, nowIso: NOW
    });
    ok('CS 13. unavailable·데이터 없음은 기록·메시지 0건',
      csNoData.ran === false && csNoData.staged === false
      && csUnavail.ran === false && csUnavail.staged === false
      && ledger().length === 0 && inbox('hq').length === 0 && inbox('cs').length === 0);
  }
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
