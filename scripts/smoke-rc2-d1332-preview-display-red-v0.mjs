#!/usr/bin/env node
/*
 * scripts/smoke-rc2-d1332-preview-display-red-v0.mjs
 * RC-2 D-1.3.3.2 — Preview 표시·수정사유·인간 수행자 보정 (RED 진단, 강화판)
 *
 * Preview 눈검수 결함 4건 + 같은 원인이 다른 화면에 남지 않도록 보완 조건을 함께 재현한다.
 * **제품 소스는 한 줄도 고치지 않는다(RED 전용).**
 *
 *   결함1) reviewOnly 확인요청의 ApprovalDetailModal 에 '담당 에이전트: 수행자 미정' 이 뜬다.
 *   결함2) ApprovalListModal 의 확인요청 카드에도 '수행자 미정' 이 뜬다.
 *   결함3) 수정 요청으로 돌아온 일반 업무에서 원래 수정 사유가 팀장에게 보이지 않는다.
 *   결함4) 팀장이 '내가 직접 처리' 를 고르면 인간 수행자가 '소속 확인 필요' 로 표시된다.
 *
 * 보완(사장님 지시):
 *   1) TaskBoard 의 reviewOnly 확인요청 카드도 제출팀·제출자를 표시해야 한다.
 *   2) reviewOnly 뿐 아니라 인간 팀장이 직접 처리해 제출한 일반 업무도
 *      ApprovalListModal·ApprovalDetailModal·TaskBoard 에서 사람 이름으로 표시돼야 한다.
 *   3) requestedByAgentId 를 읽는 제품 소비자를 전수 확인 — 실제 lifecycle 승인자료를 받는
 *      화면(ApprovalDetailModal/ApprovalListModal/TaskBoard/MetricDrilldownModal)에 같은 표시 원칙 적용.
 *   4) TaskResultModal 의 reviewOnly 중단 버튼 부재는 새 UI 없이 렌더 게이트로 잠근다.
 *
 * 세 원인:
 *   A) reviewOnly / 인간 제출자 표시 분기 누락  → 승인자료를 받는 모든 화면
 *   B) revisionOfTaskId 원본의 수정 사유 조회 누락 → TeamTaskPanel (revision 카드)
 *   C) executorKind 무시(‘AI 명단에서만 이름을 찾음’) → 공통 수행자 표시 함수 부재
 *
 * 계약·권한·계산식은 건드리지 않는다. 이 진단은 **표시(read/display)** 만 본다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2d1332-'));

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
const apprList = src('src/components/ApprovalListModal.tsx');
const taskBoard = src('src/components/TaskBoard.tsx');
const metricDrill = src('src/components/MetricDrilldownModal.tsx');
const taskResult = src('src/components/TaskResultModal.tsx');
const appSource = src('src/App.tsx');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1.3.3.2 — Preview 표시·수정사유·인간 수행자 보정 (RED 진단, 강화판) ===');

const AT = '2026-07-24T00:00:00.000Z';
const AT2 = '2026-07-24T04:00:00.000Z';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const reset = () => { store.clear(); _n = 0; };
const HQ = A.actorForRole('hq');
const LEAD_CS = A.actorForRole('cs');
const LEAD_PRODUCT = A.actorForRole('product');
const LEAD_DESIGN = A.actorForRole('design');
const readTask = (id) => S.loadLifecycleTasks().find((x) => x.ref.taskId === id);
const allTasks = () => S.loadLifecycleTasks();

const MSG = {
  id: 'tmsg-3301',
  from: { kind: 'human', teamId: 'cs', label: 'CS팀장' },
  toTeam: 'hq',
  kind: 'confirm',
  title: '환불 규정 개정안 확인 요청',
  body: '30일 이내 무상 반품으로 바꾸는 안입니다.',
  attachments: [],
  createdAt: AT
};

/** reviewOnly HQ 확인요청 카드 1건(정본). */
const hqCard = () => {
  reset();
  const r = A.createHqReviewRequest({ message: MSG, actor: LEAD_CS }, ids);
  return r.ok ? readTask(r.task.ref.taskId) : null;
};

/** 인간 수행자(팀장 직접 처리)로 진행 중인 일반 업무. */
const humanInProgress = () => {
  reset();
  const t = A.createDirectiveTask({ title: '재고 실사', targetTeamId: 'product', instructedBy: HQ }, ids);
  A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
  return readTask(t.ref.taskId);
};

/** 인간 팀장이 직접 처리해 결과까지 제출한 일반 업무(승인 대기). */
const humanSubmitted = () => {
  const t = humanInProgress();
  A.submitResult(t.ref.taskId, { resultSummary: '낱개 기준으로 실사 완료', actor: LEAD_PRODUCT }, { nowIso: AT });
  return readTask(t.ref.taskId);
};

/** AI 수행자로 결과까지 온 일반 업무(무회귀 대조군). */
const aiSubmitted = () => {
  reset();
  const t = A.createManualTask({ title: '문구 초안', assignedAgentId: 'cs_lead', createdBy: LEAD_CS }, ids);
  const id = t.ref.taskId;
  // 자기 팀 AI 직접 지정 → executorKind=agent 로 확정된다(assignExecutor 로 in_progress).
  A.assignExecutor(id, { kind: 'agent', executorId: 'cs_lead', actor: LEAD_CS }, { nowIso: AT });
  A.submitResult(id, { resultSummary: '초안 3안', actor: { kind: 'agent', teamId: 'cs', label: 'cs_lead', agentId: 'cs_lead' } }, { nowIso: AT });
  return readTask(id);
};

/** 수정 요청으로 돌아온 일반 업무(revision) + 원 사유. */
const REVISE_REASON = '수량 단위를 박스가 아니라 낱개로 다시 세어 주세요';
const revisionOfGeneralTask = () => {
  const t = humanSubmitted();
  const id = t.ref.taskId;
  A.applyDecision(id, { kind: 'request_revision', actor: LEAD_PRODUCT, reason: REVISE_REASON }, { nowIso: AT2, newId: ids.newId });
  const rev = allTasks().find((x) => x.ref.revisionOfTaskId === id) ?? null;
  return { rev, originalId: id };
};

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. reviewOnly HQ 확인요청 카드가 만들어지고 제출자·제출팀 정본을 갖는다',
  (() => { const t = hqCard(); return !!t && t.reviewOnly === true && t.ownerTeamId === 'cs'
    && !!t.submittedBy && t.submittedBy.label === 'CS팀장' && t.assignedAgentId === ''; })(),
  (() => { const t = hqCard(); return t ? `reviewOnly=${t.reviewOnly} · 제출팀=${t.ownerTeamId} · 제출자=${t.submittedBy?.label} · assignedAgentId="${t.assignedAgentId}"` : '카드 생성 실패'; })());

base('B2. 인간 제출 일반 업무는 executorKind=human · executorId=사용자ID · 이력에 사람 이름 · assignedAgentId 비어 있음',
  (() => { const t = humanSubmitted(); const last = t.executorHistory[t.executorHistory.length - 1];
    return t.status === 'awaiting_approval' && t.executorKind === 'human' && t.executorId === 'u-product'
      && last?.kind === 'human' && last?.byLabel === '상품관리팀장' && t.assignedAgentId === ''; })(),
  (() => { const t = humanSubmitted(); const last = t.executorHistory[t.executorHistory.length - 1];
    return `status=${t.status} · executorKind=${t.executorKind} · executorId=${t.executorId} · 이력 byLabel=${last?.byLabel} · assignedAgentId="${t.assignedAgentId}"`; })());

base('B3. 수정 요청 사유의 정본은 **원본(superseded)** 업무의 결정 이력이고 revision 업무는 사유가 비어 있다',
  (() => { const { rev, originalId } = revisionOfGeneralTask(); if (!rev) return false;
    const orig = readTask(originalId);
    const origReason = orig.decisions[orig.decisions.length - 1]?.reason;
    return rev.ref.revisionOfTaskId === originalId && origReason === REVISE_REASON && rev.decisions.length === 0; })(),
  (() => { const { rev, originalId } = revisionOfGeneralTask(); const orig = readTask(originalId);
    return rev ? `원본 사유="${orig.decisions[orig.decisions.length - 1]?.reason}" · revision.decisions=${rev.decisions.length}건` : '수정본 없음'; })());

base('B4. AI 수행 일반 업무의 담당 에이전트 표시(AI 명단 조회)는 그대로 동작한다(무회귀 대조군)',
  (() => { const t = aiSubmitted(); const item = A.toApprovalItem(t);
    return t.executorKind === 'agent' && !!item.requestedByAgentId
      && A.executorDisplayName(item.requestedByAgentId) !== A.UNKNOWN_AFFILIATION_LABEL
      && A.executorDisplayName(item.requestedByAgentId) !== '수행자 미정'; })(),
  (() => { const t = aiSubmitted(); const item = A.toApprovalItem(t);
    return `executorKind=${t.executorKind} · requestedByAgentId=${item.requestedByAgentId} · 표시="${A.executorDisplayName(item.requestedByAgentId)}"`; })());

base('B5. 일반/협업 업무의 중단 흐름(요청→수행팀장 중단→부모 반영)은 그대로다',
  (() => { reset();
    const pair = A.createCollaborationRequest(
      { title: '문구 요청', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS }, ids);
    const flow = A.taskFlowsFor(LEAD_CS)[0];
    const req = A.requestTaskStop(flow.task.ref.taskId, { reason: '캠페인 취소', actor: LEAD_CS }, { nowIso: AT2 });
    const child = readTask(pair.child.ref.taskId);
    const stop = A.applyDecision(child.ref.taskId, { kind: 'stop', actor: LEAD_DESIGN, reason: '요청 확인 후 중단' }, { nowIso: AT2 });
    return req.ok === true && (child.stopRequests ?? []).length === 1 && stop.ok === true
      && readTask(pair.child.ref.taskId).status === 'stopped'
      && readTask(pair.parent.ref.taskId).status === 'stopped'; })(),
  '협업 중단 흐름 정상');

base('B6(원인4 잠금 현황). TaskResultModal 작업 중단 버튼은 이미 onCancel 유무로 렌더 게이트되고 App 은 reviewOnly 로 onCancel 을 비운다',
  /onCancel && \(/.test(taskResult) && /reviewOnly/.test(appSource) && /cancelHandlerFor\(/.test(appSource),
  `TaskResultModal onCancel 게이트=${/onCancel && \(/.test(taskResult)} · App reviewOnly onCancel 차단=${/cancelHandlerFor\(/.test(appSource)}`);

// ════════════════════════════════════════════════════════════════════════════
// 원인 C: executorKind 무시 — 인간 수행자가 '소속 확인 필요' 로 표시됨 (결함4)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 원인 C · 인간 수행자 표시 (결함4) ---');

red('C0(증거). 현재 executorDisplayName(인간 사용자ID)가 "소속 확인 필요" 를 낸다',
  A.executorDisplayName('u-product') !== A.UNKNOWN_AFFILIATION_LABEL,
  `executorDisplayName('u-product') = "${A.executorDisplayName('u-product')}"  ← 인간 수행자를 미상으로 오표시`,
  '(증거 항목)');

red('C1. executorDisplayLabel(task) 가 존재하고 executorKind 로 네 경우를 차등 표시한다',
  (() => { if (typeof A.executorDisplayLabel !== 'function') return false;
    const human = A.executorDisplayLabel(humanSubmitted());
    const agent = A.executorDisplayLabel(aiSubmitted());
    const unassigned = A.executorDisplayLabel({ executorKind: 'unassigned', executorId: undefined, executorHistory: [] });
    const unknownAgent = A.executorDisplayLabel({ executorKind: 'agent', executorId: 'ghost-xyz', executorHistory: [] });
    return human === '상품관리팀장'
      && agent === A.executorDisplayName(aiSubmitted().executorId)
      && (unassigned === '미정' || unassigned === '수행자 미정')
      && unknownAgent === A.UNKNOWN_AFFILIATION_LABEL; })(),
  (() => { if (typeof A.executorDisplayLabel !== 'function') return 'executorDisplayLabel 미구현(undefined)';
    return `human="${A.executorDisplayLabel(humanSubmitted())}" · agent="${A.executorDisplayLabel(aiSubmitted())}"`; })(),
  'human=이력 byLabel · agent=AI명 · unassigned=미정 · 미상 agent=소속 확인 필요');

red('C2(소비자). TeamTaskPanel 본 업무·협업 추적 수행자 표시가 executorDisplayLabel 을 쓴다',
  /executorDisplayLabel/.test(teamTaskPanel),
  '수행자 줄이 raw executorDisplayName(t.executorId) 라 인간이 소속 확인 필요로 뜸',
  'TeamTaskPanel 이 executorDisplayLabel 사용');

// ════════════════════════════════════════════════════════════════════════════
// 원인 B: revisionOfTaskId 원본 사유 조회 누락 (결함3)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 원인 B · 수정 요청 사유 표시 (결함3) ---');

red('C3(증거). revision 카드 자체 결정 이력에는 사유가 없어 현재 화면에 사유가 뜨지 않는다',
  (() => { const { rev } = revisionOfGeneralTask(); return !!rev && rev.decisions.length > 0; })(),
  (() => { const { rev } = revisionOfGeneralTask(); return `revision.decisions=${rev ? rev.decisions.length : 'N/A'}건 → lastReasonOf(revision)=undefined`; })(),
  '(증거 항목)');

red('B1. revisionReasonOf(task, all) 순수 resolver 가 원본에서 가장 최근 수정 사유를 돌려준다',
  (() => { if (typeof A.revisionReasonOf !== 'function') return false;
    const { rev } = revisionOfGeneralTask();
    return A.revisionReasonOf(rev, allTasks()) === REVISE_REASON; })(),
  (() => { if (typeof A.revisionReasonOf !== 'function') return 'revisionReasonOf 미구현(undefined)';
    const { rev } = revisionOfGeneralTask();
    return `revisionReasonOf(rev, all) = ${JSON.stringify(A.revisionReasonOf(rev, allTasks()))}`; })(),
  '원본 사유 반환');

red('B2. 연결된 revision 인데 원본을 못 찾으면 임의 사유를 만들지 않는다(undefined 반환)',
  (() => { if (typeof A.revisionReasonOf !== 'function') return false;
    const { rev } = revisionOfGeneralTask();
    // 원본을 목록에서 제거 → 구버전 자료 등으로 원본 유실 상황.
    const orphanList = allTasks().filter((x) => x.ref.taskId !== rev.ref.revisionOfTaskId);
    return A.revisionReasonOf(rev, orphanList) === undefined; })(),
  (() => typeof A.revisionReasonOf !== 'function' ? 'revisionReasonOf 미구현' : '원본 유실 시 반환값 확인 필요')(),
  '원본 유실 → undefined(화면은 정직하게 확인 필요 표시)');

red('B3(소비자). TeamTaskPanel 이 revision 사유를 원본 기준(revisionReasonOf)으로 읽고, 원본 유실 시 정직하게 표시한다',
  /revisionReasonOf/.test(teamTaskPanel) && /수정 사유 확인 필요/.test(teamTaskPanel),
  `revisionReasonOf 사용=${/revisionReasonOf/.test(teamTaskPanel)} · 유실 문구=${/수정 사유 확인 필요/.test(teamTaskPanel)} (현재 lastReasonOf(t) 로 revision 자신만 조회)`,
  'TeamTaskPanel 이 revisionReasonOf + 유실 문구 사용');

// ════════════════════════════════════════════════════════════════════════════
// 원인 A: reviewOnly / 인간 제출자 표시 — 승인자료 받는 화면 전수 (결함1·2 + 보완1·2·3)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 원인 A · 확인요청·인간 제출자 표시 (결함1·2, 보완1·2·3) ---');

red('C4(증거). reviewOnly ApprovalItem 의 requestedByAgentId 가 비어 두 모달이 "수행자 미정" 을 낸다',
  (() => { const item = A.toApprovalItem(hqCard()); return !!item.requestedByAgentId && item.requestedByAgentId.length > 0; })(),
  (() => { const item = A.toApprovalItem(hqCard());
    return `requestedByAgentId="${item.requestedByAgentId}" → executorDisplayName="${A.executorDisplayName(item.requestedByAgentId)}"`; })(),
  '(증거 항목)');

red('A1. toApprovalItem 이 표시용 투영(executorKind·제출팀·제출자)을 담는다',
  (() => { const rItem = A.toApprovalItem(hqCard());
    const hItem = A.toApprovalItem(humanSubmitted());
    const rTeam = rItem.submittingTeamId ?? rItem.submittedTeamId;
    const rWho = rItem.submittedByLabel ?? rItem.submitterLabel;
    const hWho = hItem.submittedByLabel ?? hItem.submitterLabel;
    return rItem.reviewOnly === true && rTeam === 'cs' && rWho === 'CS팀장'
      && hItem.executorKind === 'human' && hWho === '상품관리팀장'; })(),
  (() => { const rItem = A.toApprovalItem(hqCard()); const hItem = A.toApprovalItem(humanSubmitted());
    return `review: 제출팀=${JSON.stringify(rItem.submittingTeamId)} 제출자=${JSON.stringify(rItem.submittedByLabel)} · human: executorKind=${hItem.executorKind} 제출자=${JSON.stringify(hItem.submittedByLabel)}`; })(),
  'ApprovalItem 투영 완비');

red('A2. 공통 표시 함수 approvalActorDisplay(item) 가 네 경우를 올바르게 판정한다',
  (() => { if (typeof A.approvalActorDisplay !== 'function') return false;
    const review = A.approvalActorDisplay(A.toApprovalItem(hqCard()));
    const human = A.approvalActorDisplay(A.toApprovalItem(humanSubmitted()));
    const ai = A.approvalActorDisplay(A.toApprovalItem(aiSubmitted()));
    const reviewOk = !!review && /CS/.test(review.name) && review.name.includes('CS팀장')
      && review.name !== '수행자 미정' && review.name !== A.UNKNOWN_AFFILIATION_LABEL;
    const humanOk = !!human && human.name === '상품관리팀장';
    const aiOk = ai === null;   // AI 는 화면의 캐릭터 명단(getAgentInfo)으로 해석하도록 위임
    return reviewOk && humanOk && aiOk; })(),
  (() => { if (typeof A.approvalActorDisplay !== 'function') return 'approvalActorDisplay 미구현(undefined)';
    const review = A.approvalActorDisplay(A.toApprovalItem(hqCard()));
    const human = A.approvalActorDisplay(A.toApprovalItem(humanSubmitted()));
    const ai = A.approvalActorDisplay(A.toApprovalItem(aiSubmitted()));
    return `review=${JSON.stringify(review)} · human=${JSON.stringify(human)} · ai=${JSON.stringify(ai)}`; })(),
  'review=제출팀·제출자 · human=사람이름 · ai=null(명단 위임)');

red('A3(소비자·결함1). ApprovalDetailModal 이 공통 표시 함수로 reviewOnly·인간을 표시한다',
  /approvalActorDisplay/.test(apprDetail) && /제출/.test(apprDetail),
  `approvalActorDisplay 사용=${/approvalActorDisplay/.test(apprDetail)} · '제출' 표시=${/제출/.test(apprDetail)} (현재 항상 '담당 에이전트')`,
  'ApprovalDetailModal 공통 표시 함수 사용');

red('A4(소비자·결함2). ApprovalListModal 이 공통 표시 함수로 reviewOnly·인간을 표시한다',
  /approvalActorDisplay/.test(apprList),
  `approvalActorDisplay 사용=${/approvalActorDisplay/.test(apprList)} (현재 getAgentInfo → '수행자 미정')`,
  'ApprovalListModal 공통 표시 함수 사용');

red('A5(소비자·보완1). TaskBoard 승인 카드가 공통 표시 함수로 reviewOnly·인간을 표시한다',
  /approvalActorDisplay/.test(taskBoard),
  `approvalActorDisplay 사용=${/approvalActorDisplay/.test(taskBoard)} (현재 getAgentInfo(item.requestedByAgentId) → '수행자 미정'/'소속 확인 필요')`,
  'TaskBoard 공통 표시 함수 사용');

red('A6(소비자·보완3). MetricDrilldownModal 이 raw requestedByAgentId 대신 공통 표시 함수를 쓴다',
  /approvalActorDisplay/.test(metricDrill),
  `approvalActorDisplay 사용=${/approvalActorDisplay/.test(metricDrill)} (현재 <span>{item.requestedByAgentId}</span> raw id 노출)`,
  'MetricDrilldownModal 공통 표시 함수 사용');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (D-1.3.3.2 표시 결함 A·B·C + 보완)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
if (redUnmet > 0) {
  console.log(`\n✗ RC-2 D-1.3.3.2 — ${redUnmet}건 미충족 (RED 정상: 결함 재현됨)`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1.3.3.2 GREEN 도달');
