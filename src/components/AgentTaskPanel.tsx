import React, { useEffect, useMemo, useState } from 'react';
import {
  runManualAgentTask, approveAgentTask, rejectAgentTask, cancelAgentTask
} from '../services/agentTaskRunner';
import { latestAgentTaskRunState, type AgentTaskRunState } from '../services/agentTaskRunState';
import { loadActivity, subscribeActivity } from '../services/repositories/activityLedgerRepository';
import { userLabelOf } from '../services/dataSourceProvenanceContract';
import { scheduleLabel, APPROVAL_MODE_META, FOCUS_META, type AgentTaskSpec } from '../types/agentTask';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';
import type { ActorRef } from '../services/taskLifecycleContract';
import type { RevenueResult } from '../services/departmentDataService';

// 팀 AI 에이전트 자동 업무 — 정의된 작업을 canonical 엔진으로 계산 → 팀장이 확인.
//
// D-0: **상태 정본은 이 컴포넌트의 React 상태가 아니라 업무기록 장부(activityLedger)다.**
//   예전에는 승인 대기·완료가 메모리에만 있어 새로고침하면 사라졌다. 대표 업무에서는 허용하지 않는다.
//   여기 남는 React 상태는 **아직 저장되지 않은 단기 입력값**뿐이다(초안 편집·반려 사유·호출 실패 안내).

interface Props {
  teamId: DeptTeamId;
  /** 실제 로그인 신원. 없으면(미로그인·미확인) 조작하지 않는다. */
  actor: ActorRef | null;
  /** 담당 팀장인가. **서비스도 같은 권한을 다시 검사한다** — 화면 숨김을 보안 경계로 삼지 않는다. */
  canOperate: boolean;
  tasks: AgentTaskSpec[];
  revenue: RevenueResult | null;
  onRan: () => void;   // 실행/확인 후 메시지 새로고침(원장은 구독으로 자동 갱신)
}

/** 팀 내부 기록 업무인가(`reportTo === teamId`). 문구를 팀 내부용으로 바꾼다. */
const isInternal = (t: AgentTaskSpec): boolean => t.reportTo === t.teamId;

/**
 * 아직 저장되지 않은 **단기 입력값**. 업무 상태(대기·완료·반려)는 여기 두지 않는다 —
 * 그건 장부(`latestAgentTaskRunState`)가 정본이다.
 */
interface TaskUiInput {
  draft?: string;       // 초안 수정 본문
  rejectOpen?: boolean; // 반려 입력칸 열림
  reason?: string;      // 반려·중단 사유 입력값
  note?: string;        // 현재 호출 실패 안내
}

export const AgentTaskPanel: React.FC<Props> = ({ actor, canOperate, tasks, revenue, onRan }) => {
  // 장부 구독 — 다른 탭·같은 탭 저장 모두 듣는다(activityLedgerRepository).
  const [activity, setActivity] = useState(() => loadActivity());
  useEffect(() => subscribeActivity(() => setActivity(loadActivity())), []);

  const [ui, setUi] = useState<Record<string, TaskUiInput>>({});
  const patch = (id: string, next: TaskUiInput) => setUi((p) => ({ ...p, [id]: { ...p[id], ...next } }));

  const states = useMemo(() => {
    const out: Record<string, AgentTaskRunState> = {};
    for (const t of tasks) out[t.id] = latestAgentTaskRunState(activity, t.id);
    return out;
  }, [activity, tasks]);

  const setNoteFor = (id: string, text: string) => patch(id, { note: text });
  const clearInputs = (id: string) => setUi((p) => ({ ...p, [id]: { note: p[id]?.note } }));

  const run = (spec: AgentTaskSpec) => {
    if (!canOperate || !actor) return;   // 화면 숨김에만 기대지 않는다(서비스도 막는다).
    const outcome = runManualAgentTask(spec, actor, { revenue });
    // 성공·실패 모두 상태는 장부에서 다시 읽는다. 여기서는 안내 문구만 남긴다.
    setNoteFor(spec.id, outcome.ran || outcome.staged ? '' : outcome.reason);
    onRan();
  };

  const approve = (spec: AgentTaskSpec) => {
    if (!canOperate || !actor) return;
    const body = ui[spec.id]?.draft ?? states[spec.id]?.resultBody ?? '';
    const r = approveAgentTask(spec, actor, { revenue }, body);
    setNoteFor(spec.id, r.ok ? '' : r.reason);
    if (r.ok) clearInputs(spec.id);
    onRan();
  };

  const reject = (spec: AgentTaskSpec) => {
    if (!canOperate || !actor) return;
    const r = rejectAgentTask(spec, actor, { revenue }, ui[spec.id]?.reason ?? '');
    setNoteFor(spec.id, r.ok ? '' : r.reason);
    if (r.ok) clearInputs(spec.id);
    onRan();
  };

  // 사용자가 **실행 자체를 중단**하는 동작. 화면만 닫고 장부에 대기를 남기지 않는다.
  const stop = (spec: AgentTaskSpec) => {
    if (!canOperate || !actor) return;
    const r = cancelAgentTask(spec, actor, { revenue }, ui[spec.id]?.reason ?? '점검 결과를 쓰지 않고 중단');
    setNoteFor(spec.id, r.ok ? '' : r.reason);
    if (r.ok) clearInputs(spec.id);
    onRan();
  };

  return (
    <div className="atask-panel">
      <p className="atask-intro">
        {!canOperate && (
          <><b>열람 전용입니다.</b> 실행·확인은 담당 팀장만 할 수 있습니다.<br /></>
        )}
        이 팀 AI 에이전트의 자동 업무입니다. 결과는 담당 팀장이 확인해 마감합니다.
        <br /><span className="atask-intro-sub">※ 업무·승인모드 편집은 <b>AI 직원 → 자동 업무</b>에서. 시각 자동 실행은 서버 연결(2단계) 후 활성화.</span>
      </p>
      {tasks.length === 0 ? (
        <p className="atask-empty">이 팀에 등록된 자동 업무가 없습니다. (AI 직원 → 자동 업무에서 추가)</p>
      ) : (
        <div className="atask-list">
          {tasks.map((t) => {
            const am = APPROVAL_MODE_META[t.approvalMode];
            const st = states[t.id] ?? { phase: 'idle' as const, taskId: t.id };
            const internal = isInternal(t);
            const waiting = st.phase === 'awaiting_review';
            const editable = t.approvalMode === 'draft';
            const body = ui[t.id]?.draft ?? st.resultBody ?? '';
            const label = st.dataProvenance ? userLabelOf(st.dataProvenance) : null;
            return (
              <div key={t.id} className="atask-item">
                <div className="atask-item-head">
                  <span className="atask-title">🤖 {t.title}</span>
                  <span className="atask-sched">{scheduleLabel(t.schedule)}</span>
                </div>
                <div className="atask-meta">
                  <span className="atask-agent">{t.agentLabel}</span>
                  <span className={`atask-mode mode-${t.approvalMode}`} title={am.desc}>{am.label}</span>
                  <span>
                    {FOCUS_META[t.focus]} · {internal
                      ? '팀 내부 점검'
                      : <>→ {DEPT_TEAM_META[t.reportTo].emoji} {DEPT_TEAM_META[t.reportTo].name}</>}
                  </span>
                </div>

                {ui[t.id]?.note && <div className="atask-gate-note">⚠ {ui[t.id]?.note}</div>}

                {waiting && (
                  <div className="atask-pending">
                    <div className="atask-pending-label">
                      🕒 {internal ? '팀장 확인 대기' : (editable ? '초안 검토 후 등록' : '승인 대기')}
                      {label && <span className="atask-source"> · {label}</span>}
                    </div>
                    {editable ? (
                      <textarea className="atask-pending-edit" rows={3} value={body}
                        onChange={(e) => patch(t.id, { draft: e.target.value })} />
                    ) : (
                      <div className="atask-pending-body">{body}</div>
                    )}
                    {canOperate && (
                      <div className="atask-pending-actions">
                        <button type="button" className="atask-approve" onClick={() => approve(t)}>
                          {internal ? '확인 완료' : (editable ? '검토 완료 · 등록' : '승인 · 보고')}
                        </button>
                        {ui[t.id]?.rejectOpen ? (
                          <>
                            <input
                              className="atask-reject-reason" type="text" placeholder="이유를 한 문장 적어 주세요"
                              value={ui[t.id]?.reason ?? ''}
                              onChange={(e) => patch(t.id, { reason: e.target.value })}
                            />
                            <button type="button" className="atask-reject-confirm" onClick={() => reject(t)}>반려</button>
                            <button type="button" className="atask-cancel" onClick={() => stop(t)}>작업 중단</button>
                          </>
                        ) : (
                          <button type="button" className="atask-reject" onClick={() => patch(t.id, { rejectOpen: true })}>
                            확인하지 않음
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {st.phase === 'completed' && (
                  <div className="atask-result">
                    {internal ? '팀 내부 확인 완료' : `${DEPT_TEAM_META[t.reportTo].name} 요청함으로 전송됨`}
                    {label && <span className="atask-source"> · {label}</span>}
                    <div className="atask-result-body">{st.resultBody}</div>
                  </div>
                )}
                {st.phase === 'rejected' && (
                  <div className="atask-rejected">
                    반려됨{st.decisionReason ? ` · ${st.decisionReason}` : ''}
                  </div>
                )}
                {st.phase === 'failed' && (
                  <div className="atask-rejected">실패{st.decisionReason ? ` · ${st.decisionReason}` : ''}</div>
                )}

                {!waiting && canOperate && (
                  <button type="button" className="atask-run" onClick={() => run(t)}>
                    {t.approvalMode === 'auto' ? '지금 실행' : '지금 점검'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
