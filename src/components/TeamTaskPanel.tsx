import React, { useState } from 'react';
import type { LifecycleTask, ActorRef, ApprovalDecisionKind } from '../services/taskLifecycleContract';
import { userStatusLabel } from '../services/taskLifecycleContract';
import { availableDecisions, executorDisplayName, pendingStopRequest } from '../services/taskLifecycleAppAdapter';
import type { TaskFlow } from '../services/taskLifecycleAppAdapter';
import { defaultNativeAgents } from '../data/defaultNativeAgentRuntime';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';

// ────────────────────────────────────────────────────────────────────────────
// RC-2 D-1.3 — 팀장 업무 패널
//
// 부서 워크스페이스의 업무 탭 안에서 쓴다(별도 개발자 화면이 아니다).
// 팀장이 실제로 해야 하는 일만 둔다:
//   할 일 → 수행 방식 선택 · 결과 도착 → 확인 · 수정 요청 → 다시 선택.
//
// 저장·갱신은 App 이 소유한다. 이 컴포넌트는 localStorage 를 직접 읽거나 쓰지 않는다.
// 실행 엔진이 없는 AI 업무는 가짜 결과를 만들지 않고 '진행 중'에서 정직하게 기다린다.
// ────────────────────────────────────────────────────────────────────────────

export interface TeamTaskPanelProps {
  /** 지금 이 화면을 보는 사람. 권한 판정의 기준. */
  actor: ActorRef;
  /** 지금 보고 있는 팀. */
  teamId: DeptTeamId;
  /**
   * App 이 소유한 정본에서 내려온 **업무 흐름**들(이미 열람 범위로 걸러져 있다).
   * 협업은 부모·자식이 한 흐름으로 묶여 오므로 같은 일이 두 장으로 보이지 않는다.
   */
  flows: TaskFlow[];
  /** 총괄·요청자가 담당 팀장에게 중단을 요청한다(실제 중단은 팀장이 한다). */
  onRequestStop: (taskId: string, reason: string) => void;
  onAssign: (taskId: string, kind: 'agent' | 'human', executorId?: string) => void;
  onTakeOver: (taskId: string) => void;
  onSubmit: (taskId: string, report: string) => void;
  onDecide: (taskId: string, kind: ApprovalDecisionKind, reason?: string) => void;
}

const SECTIONS = [
  { key: 'open', title: '할 일', desc: '수행 방식을 정해 주세요.' },
  { key: 'in_progress', title: '진행 중', desc: '수행자가 정해져 일이 돌아가는 중입니다.' },
  { key: 'awaiting_approval', title: '결과 도착', desc: '제출된 결과를 확인해 주세요.' }
] as const;

/** 이 업무의 담당 팀 소속 AI 후보(다른 팀 AI 는 고를 수 없다). */
const agentsOfTeam = (teamId: DeptTeamId) =>
  defaultNativeAgents.filter((a) => {
    const dept = a.departmentId === 'manager' ? 'hq' : a.departmentId;
    return dept === teamId;
  });

const lastReasonOf = (t: LifecycleTask): string | undefined => {
  for (let i = t.decisions.length - 1; i >= 0; i--) {
    if (t.decisions[i].reason) return t.decisions[i].reason;
  }
  return undefined;
};

export const TeamTaskPanel: React.FC<TeamTaskPanelProps> = ({
  actor, teamId, flows, onAssign, onTakeOver, onSubmit, onDecide, onRequestStop
}) => {
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportText, setReportText] = useState('');
  const [reasonFor, setReasonFor] = useState<{ taskId: string; kind: ApprovalDecisionKind } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [stopReqFor, setStopReqFor] = useState<string | null>(null);
  const [stopReqText, setStopReqText] = useState('');

  // 이 팀의 흐름만. (열람 범위는 App 이 이미 걸렀고, 여기서는 보고 있는 팀으로 한 번 더 좁힌다.)
  const teamFlows = flows.filter(
    (f) => f.task.ownerTeamId === teamId || f.task.requestingTeamId === teamId
  );
  const isOwningLead = actor.kind === 'human' && actor.teamId === teamId;
  const teamAgents = agentsOfTeam(teamId);

  const submitReport = (taskId: string) => {
    const text = reportText.trim();
    if (!text) return;
    onSubmit(taskId, text);
    setReportFor(null);
    setReportText('');
  };

  const submitReason = () => {
    if (!reasonFor) return;
    const text = reasonText.trim();
    if (!text) return;
    onDecide(reasonFor.taskId, reasonFor.kind, text);
    setReasonFor(null);
    setReasonText('');
  };

  const renderCard = (flow: TaskFlow) => {
    const t = flow.task;
    // 협업 요청팀 카드는 수행팀 진행 상황을 함께 보여 준다(별도 카드를 만들지 않는다).
    const tracked = flow.tracking;
    const canAct = flow.actionable;
    // RC-2 D-1.3.2: 중단 요청·표시는 **실제 수행 업무** 기준이다.
    //   추적 카드에 요청을 쌓으면 수행팀 화면에 영영 도착하지 않는다.
    const workTask = tracked ?? t;
    const stopReq = pendingStopRequest(flow.tracking ?? t);
    // RC-2 D-1.3.3.1: 확인 요청 카드는 이미 나온 내용을 결정만 하는 자리다.
    //   수행할 작업도 수행자도 없으므로 실행·중단 관련 표시를 아예 만들지 않는다.
    const isReviewOnly = t.reviewOnly === true;
    // 화면에 보이는 행동 = 서비스가 허용하는 행동. 추적 카드에는 애초에 계산하지 않는다.
    const decisions = canAct ? availableDecisions(t, actor) : [];
    const revisionReason = t.ref.revisionOfTaskId ? lastReasonOf(t) : undefined;
    const iAmExecutor = t.executorKind === 'human' && actor.kind === 'human' && actor.userId === t.executorId;
    const startedAt = t.executorHistory[t.executorHistory.length - 1]?.at;

    return (
      <li key={t.ref.taskId} className="ttask-item">
        <div className="ttask-head">
          <span className="ttask-title">{t.title}</span>
          <span className="ttask-status">{userStatusLabel(t.status)}</span>
        </div>
        <div className="ttask-meta">
          <span>지시: {t.createdBy.label}</span>
          {t.requestingTeamId && t.requestingTeamId !== t.ownerTeamId && (
            <span>요청팀: {DEPT_TEAM_META[t.requestingTeamId]?.name ?? t.requestingTeamId}</span>
          )}
          {isReviewOnly ? (
            <>
              <span>제출팀: {DEPT_TEAM_META[t.ownerTeamId]?.name ?? t.ownerTeamId}</span>
              {t.submittedBy && <span>제출: {t.submittedBy.label}</span>}
            </>
          ) : (
            <span>수행자: {t.executorKind === 'unassigned' ? '미정' : executorDisplayName(t.executorId)}</span>
          )}
          {startedAt && t.status === 'in_progress' && <span>시작: {startedAt.slice(0, 16).replace('T', ' ')}</span>}
        </div>

        {revisionReason && (
          <p className="ttask-revision">✏️ 수정 요청 사유: {revisionReason}</p>
        )}

        {stopReq && (
          <p className="ttask-stopreq">
            ⏸ 중단 요청 도착 — {stopReq.requestedBy.label}: {stopReq.reason}
            {isOwningLead && canAct ? ' (아래 작업 중단으로 처리해 주세요)' : ' (담당 팀이 처리합니다)'}
          </p>
        )}

        {tracked && (
          <p className="ttask-tracking">
            🔗 수행: {DEPT_TEAM_META[tracked.ownerTeamId]?.name ?? tracked.ownerTeamId} · {userStatusLabel(tracked.status)}
            {tracked.executorKind !== 'unassigned' ? ' · ' + executorDisplayName(tracked.executorId) : ''}
          </p>
        )}

        {t.executorHistory.length > 1 && (
          <details className="ttask-history">
            <summary>이전 수행자 이력 {t.executorHistory.length}건</summary>
            <ul>
              {t.executorHistory.map((h, i) => (
                <li key={i}>
                  {h.kind === 'agent' ? executorDisplayName(h.id) : h.byLabel}
                  {h.reason ? ` — ${h.reason}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}

        {t.status === 'awaiting_approval' && (
          <div className="ttask-result">
            {t.resultSummary && <p className="ttask-result-body">{t.resultSummary}</p>}
            {(t.artifactRefs ?? []).length > 0 && (
              <p className="ttask-result-refs">첨부 {t.artifactRefs!.length}건</p>
            )}
            {t.submittedBy && <p className="ttask-result-by">제출: {t.submittedBy.label}</p>}
          </div>
        )}

        {/* ── 할 일: 수행 방식 선택 (담당 팀장만) ── */}
        {t.status === 'open' && isOwningLead && canAct && (
          <div className="ttask-actions">
            {teamAgents.length > 0 && (
              <button type="button" className="ttask-btn" onClick={() => setPickerFor(pickerFor === t.ref.taskId ? null : t.ref.taskId)}>
                🤖 우리 팀 AI에게 맡기기
              </button>
            )}
            <button type="button" className="ttask-btn" onClick={() => onAssign(t.ref.taskId, 'human')}>
              🙋 내가 직접 처리
            </button>
            {pickerFor === t.ref.taskId && (
              <div className="ttask-picker">
                {teamAgents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`ttask-picker-item ${t.suggestedExecutorId === a.id ? 'suggested' : ''}`}
                    onClick={() => { onAssign(t.ref.taskId, 'agent', a.id); setPickerFor(null); }}
                  >
                    {a.name}{t.suggestedExecutorId === a.id ? ' · 추천' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 진행 중: 인수 / 결과 제출 ── */}
        {t.status === 'in_progress' && isOwningLead && canAct && (
          <div className="ttask-actions">
            {t.executorKind === 'agent' && (
              <>
                <button type="button" className="ttask-btn" onClick={() => onTakeOver(t.ref.taskId)}>
                  🙋 내가 직접 인수
                </button>
                <p className="ttask-note">
                  AI 실행 연결은 아직 준비 중입니다. 결과가 나오기 전까지 진행 중으로 유지됩니다.
                </p>
              </>
            )}
            {iAmExecutor && (
              reportFor === t.ref.taskId ? (
                <div className="ttask-report">
                  <textarea
                    className="ttask-report-input"
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="무엇을 했는지 적어 주세요. (이 내용이 결과로 보고됩니다)"
                  />
                  <div className="ttask-actions">
                    <button type="button" className="ttask-btn primary" disabled={!reportText.trim()} onClick={() => submitReport(t.ref.taskId)}>
                      결과 제출
                    </button>
                    <button type="button" className="ttask-btn" onClick={() => { setReportFor(null); setReportText(''); }}>취소</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="ttask-btn primary" onClick={() => { setReportFor(t.ref.taskId); setReportText(''); }}>
                  ✍️ 결과 제출
                </button>
              )
            )}
          </div>
        )}

        {/* ── 결정 버튼: 지금 이 사람이 실제로 할 수 있는 것만 ── */}
        {decisions.length > 0 && (
          <div className="ttask-actions">
            {decisions.map((d) => (
              <button
                key={d.kind}
                type="button"
                className={`ttask-btn ${d.kind === 'approve' ? 'primary' : ''}`}
                onClick={() => {
                  if (d.kind === 'approve') onDecide(t.ref.taskId, 'approve');
                  else { setReasonFor({ taskId: t.ref.taskId, kind: d.kind }); setReasonText(''); }
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        {!isReviewOnly && (!isOwningLead || !canAct) && !['stopped', 'completed', 'not_adopted', 'returned', 'superseded', 'failed'].includes(workTask.status) && (
          <div className="ttask-actions">
            <button
              type="button"
              className="ttask-btn"
              onClick={() => { setStopReqFor(t.ref.taskId); setStopReqText(''); }}
            >
              ⏸ 중단 요청
            </button>
          </div>
        )}

        {stopReqFor === t.ref.taskId && (
          <div className="ttask-report">
            <textarea
              className="ttask-report-input"
              value={stopReqText}
              onChange={(e) => setStopReqText(e.target.value)}
              placeholder="왜 그만두려는지 적어 주세요. 담당 팀장이 보고 판단합니다."
            />
            <div className="ttask-actions">
              <button
                type="button"
                className="ttask-btn primary"
                disabled={!stopReqText.trim()}
                onClick={() => { onRequestStop((flow.tracking ?? t).ref.taskId, stopReqText.trim()); setStopReqFor(null); setStopReqText(''); }}
              >
                중단 요청 보내기
              </button>
              <button type="button" className="ttask-btn" onClick={() => setStopReqFor(null)}>취소</button>
            </div>
          </div>
        )}

        {reasonFor?.taskId === t.ref.taskId && (
          <div className="ttask-report">
            <textarea
              className="ttask-report-input"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="사유를 적어 주세요. (기록으로 남습니다)"
            />
            <div className="ttask-actions">
              <button type="button" className="ttask-btn primary" disabled={!reasonText.trim()} onClick={submitReason}>확인</button>
              <button type="button" className="ttask-btn" onClick={() => setReasonFor(null)}>취소</button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="ttask-panel">
      <p className="ttask-intro">
        {isOwningLead
          ? '지시받은 업무입니다. 수행 방식을 정하고, 결과가 나오면 확인해 주세요.'
          : '읽기 전용입니다. 수행 방식과 결과 확인은 담당 팀장이 합니다.'}
      </p>

      {SECTIONS.map((sec) => {
        const rows = teamFlows.filter((f) => f.task.status === sec.key);
        if (rows.length === 0) return null;
        return (
          <section key={sec.key} className="ttask-section">
            <h4 className="ttask-section-title">{sec.title} <span className="ttask-count">{rows.length}</span></h4>
            <p className="ttask-section-desc">{sec.desc}</p>
            <ul className="ttask-list">{rows.map(renderCard)}</ul>
          </section>
        );
      })}

      {teamFlows.filter((f) => ['open', 'in_progress', 'awaiting_approval'].includes(f.task.status)).length === 0 && (
        <p className="ttask-empty">지금 처리할 업무가 없습니다.</p>
      )}
    </div>
  );
};
