import React, { useState } from 'react';
import { runManualAgentTask, approveAgentTask } from '../services/agentTaskRunner';
import { scheduleLabel, APPROVAL_MODE_META, FOCUS_META, type AgentTaskSpec } from '../types/agentTask';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';
import type { RevenueResult } from '../services/departmentDataService';

// 팀 AI 에이전트 자동 업무 — 정의된 작업을 canonical 엔진으로 계산 → 팀 소통에 AI 명의로 보고.
// 승인모드: 자동 완료 / 승인 후 보고 / 검토·수정 후 등록. (정의·편집은 AI 직원 탭에서)

interface Props {
  teamId: DeptTeamId;
  /**
   * RC-2 D-1.3: 보고 있는 사람의 역할.
   *   자기 팀 자동 업무를 실행·승인할 수 있는 사람은 **그 팀 팀장뿐**이다.
   *   총괄·다른 팀장은 열람만 한다(버튼을 숨기고 핸들러에서도 막는다).
   */
  viewerRole?: string;
  tasks: AgentTaskSpec[];
  revenue: RevenueResult | null;
  onRan: () => void;   // 실행/승인 후 메시지·원장 새로고침
}

interface Pending { body: string; editable: boolean }

export const AgentTaskPanel: React.FC<Props> = ({ teamId, tasks, revenue, onRan, viewerRole }) => {
  // 이 팀의 팀장만 조작할 수 있다. 역할이 오지 않으면(구 호출부) 안전하게 열람 전용.
  const canOperate = !!viewerRole && viewerRole === teamId;
  const [done, setDone] = useState<Record<string, string>>({});   // 완료 결과 본문
  const [pending, setPending] = useState<Record<string, Pending>>({}); // 승인 대기 본문
  // 자동 완료가 막힌 이유(상시 지시 미승인 · 중지 · 고위험)를 그대로 보여 준다.
  const [gateNote, setGateNote] = useState<Record<string, string>>({});

  const run = (spec: AgentTaskSpec) => {
    if (!canOperate) return;   // 화면 숨김에만 기대지 않는다.
    // RC-2 D-1.3: 실행은 공개 진입점으로만 한다.
    //   runManualAgentTask 가 담당 팀장 권한과 고위험 여부를 함께 판정하고,
    //   자동 완료가 아니면 결과를 내보내지 않고 확인 대기로 둔다.
    const outcome = runManualAgentTask(spec, { kind: 'human', teamId }, { revenue });
    if (outcome.ran) {
      setDone((p) => ({ ...p, [spec.id]: outcome.body }));
      setPending((p) => { const n = { ...p }; delete n[spec.id]; return n; });
      setGateNote((p) => { const n = { ...p }; delete n[spec.id]; return n; });
    } else if (outcome.staged) {
      setPending((p) => ({ ...p, [spec.id]: { body: outcome.body, editable: spec.approvalMode === 'draft' } }));
      setGateNote((p) => ({
        ...p,
        [spec.id]: outcome.dataKind === 'fixture'
          ? `${outcome.reason} (시험 자료로 계산한 결과입니다)`
          : outcome.reason
      }));
    } else {
      setGateNote((p) => ({ ...p, [spec.id]: outcome.reason }));
    }
    onRan();
  };

  const approve = (spec: AgentTaskSpec) => {
    if (!canOperate) return;
    const body = pending[spec.id]?.body ?? '';
    approveAgentTask(spec, { revenue }, body);
    setPending((p) => { const n = { ...p }; delete n[spec.id]; return n; });
    setDone((p) => ({ ...p, [spec.id]: body }));
    onRan();
  };

  return (
    <div className="atask-panel">
      <p className="atask-intro">
        {!canOperate && (
          <><b>열람 전용입니다.</b> 실행·승인은 담당 팀장만 할 수 있습니다.<br /></>
        )}
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
                      {canOperate && (<button type="button" className="atask-approve" onClick={() => approve(t)}>
                        {t.approvalMode === 'draft' ? '검토 완료 · 등록' : '승인 · 보고'}
                      </button>
                      )}
                      <button type="button" className="atask-cancel" onClick={() => setPending((p) => { const n = { ...p }; delete n[t.id]; return n; })}>취소</button>
                    </div>
                  </div>
                ) : done[t.id] ? (
                  <div className="atask-result">방금 완료 · {DEPT_TEAM_META[t.reportTo].name} 요청함으로 전송됨<div className="atask-result-body">{done[t.id]}</div></div>
                ) : null}

                {!pend && canOperate && (
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
