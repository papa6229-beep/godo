import React, { useState } from 'react';
import { runAgentTask, stageApprovalTask, approveAgentTask, canAutoRunAgentTask } from '../services/agentTaskRunner';
import { scheduleLabel, APPROVAL_MODE_META, FOCUS_META, type AgentTaskSpec } from '../types/agentTask';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';
import type { RevenueResult } from '../services/departmentDataService';

// 팀 AI 에이전트 자동 업무 — 정의된 작업을 canonical 엔진으로 계산 → 팀 소통에 AI 명의로 보고.
// 승인모드: 자동 완료 / 승인 후 보고 / 검토·수정 후 등록. (정의·편집은 AI 직원 탭에서)

interface Props {
  teamId: DeptTeamId;
  tasks: AgentTaskSpec[];
  revenue: RevenueResult | null;
  onRan: () => void;   // 실행/승인 후 메시지·원장 새로고침
}

interface Pending { body: string; editable: boolean }

export const AgentTaskPanel: React.FC<Props> = ({ tasks, revenue, onRan }) => {
  const [done, setDone] = useState<Record<string, string>>({});   // 완료 결과 본문
  const [pending, setPending] = useState<Record<string, Pending>>({}); // 승인 대기 본문
  // 자동 완료가 막힌 이유(상시 지시 미승인 · 중지 · 고위험)를 그대로 보여 준다.
  const [gateNote, setGateNote] = useState<Record<string, string>>({});

  const run = (spec: AgentTaskSpec) => {
    // RC-2 D-1.2: 자동 완료는 '팀장이 승인해 둔 상시 지시' + '고위험 아님' 일 때만.
    //   고위험이거나 상시 승인이 없으면 결과를 바로 내보내지 않고 팀장 확인 대기로 둔다.
    const verdict = canAutoRunAgentTask(spec);
    const mayAutoComplete = spec.approvalMode === 'auto' && verdict.allowed && !verdict.requiresLeadConfirmation;
    if (mayAutoComplete) {
      const { body } = runAgentTask(spec, { revenue });
      setDone((p) => ({ ...p, [spec.id]: body }));
      setPending((p) => { const n = { ...p }; delete n[spec.id]; return n; });
    } else {
      const { body } = stageApprovalTask(spec, { revenue });
      setPending((p) => ({ ...p, [spec.id]: { body, editable: spec.approvalMode === 'draft' } }));
      if (spec.approvalMode === 'auto') {
        setGateNote((p) => ({
          ...p,
          [spec.id]: verdict.requiresLeadConfirmation && verdict.allowed
            ? '고위험 업무라 상시 지시가 있어도 팀장 확인 후 보고합니다.'
            : (verdict.reason ?? '담당 팀장 확인이 필요합니다.')
        }));
      }
    }
    onRan();
  };

  const approve = (spec: AgentTaskSpec) => {
    const body = pending[spec.id]?.body ?? '';
    approveAgentTask(spec, { revenue }, body);
    setPending((p) => { const n = { ...p }; delete n[spec.id]; return n; });
    setDone((p) => ({ ...p, [spec.id]: body }));
    onRan();
  };

  return (
    <div className="atask-panel">
      <p className="atask-intro">
        이 팀 AI 에이전트의 자동 업무입니다. 정해진 시간에 스스로 점검하고 결과를 담당 팀에 보고합니다.
        <br /><span className="atask-intro-sub">※ 업무·승인모드 편집은 <b>AI 직원 → 자동 업무</b>에서. 시각 자동 실행은 서버 연결(2단계) 후 활성화.</span>
      </p>
      {tasks.length === 0 ? (
        <p className="atask-empty">이 팀에 등록된 자동 업무가 없습니다. (AI 직원 → 자동 업무에서 추가)</p>
      ) : (
        <div className="atask-list">
          {tasks.map((t) => {
            const am = APPROVAL_MODE_META[t.approvalMode];
            const pend = pending[t.id];
            return (
              <div key={t.id} className="atask-item">
                <div className="atask-item-head">
                  <span className="atask-title">🤖 {t.title}</span>
                  <span className="atask-sched">{scheduleLabel(t.schedule)}</span>
                </div>
                <div className="atask-meta">
                  <span className="atask-agent">{t.agentLabel}</span>
                  <span className={`atask-mode mode-${t.approvalMode}`} title={am.desc}>{am.label}</span>
                  <span>{FOCUS_META[t.focus]} · → {DEPT_TEAM_META[t.reportTo].emoji} {DEPT_TEAM_META[t.reportTo].name}</span>
                </div>

                {pend ? (
                  <div className="atask-pending">
                    <div className="atask-pending-label">🕒 {t.approvalMode === 'draft' ? '초안 검토 후 등록' : '승인 대기'}</div>
                    {gateNote[t.id] && <div className="atask-gate-note">⚠ {gateNote[t.id]}</div>}
                    {pend.editable ? (
                      <textarea className="atask-pending-edit" rows={3} value={pend.body}
                        onChange={(e) => setPending((p) => ({ ...p, [t.id]: { ...p[t.id], body: e.target.value } }))} />
                    ) : (
                      <div className="atask-pending-body">{pend.body}</div>
                    )}
                    <div className="atask-pending-actions">
                      <button type="button" className="atask-approve" onClick={() => approve(t)}>
                        {t.approvalMode === 'draft' ? '검토 완료 · 등록' : '승인 · 보고'}
                      </button>
                      <button type="button" className="atask-cancel" onClick={() => setPending((p) => { const n = { ...p }; delete n[t.id]; return n; })}>취소</button>
                    </div>
                  </div>
                ) : done[t.id] ? (
                  <div className="atask-result">방금 완료 · {DEPT_TEAM_META[t.reportTo].name} 요청함으로 전송됨<div className="atask-result-body">{done[t.id]}</div></div>
                ) : null}

                {!pend && (
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
