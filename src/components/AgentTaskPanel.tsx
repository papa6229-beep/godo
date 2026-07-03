import React, { useState } from 'react';
import { agentTasksForTeam } from '../data/defaultAgentTasks';
import { runAgentTask } from '../services/agentTaskRunner';
import { scheduleLabel, type AgentTaskSpec } from '../types/agentTask';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';
import type { RevenueResult } from '../services/departmentDataService';

// 팀 AI 에이전트 자동 업무 — 정의된 작업을 canonical 엔진으로 계산 → 팀 소통에 AI 명의로 보고.
// 지금은 "선언된 스케줄 + 지금 실행". 실제 시각 자동 발화는 백엔드(2단계)에서.

interface Props {
  teamId: DeptTeamId;
  revenue: RevenueResult | null;
  onRan: () => void;   // 실행 후 메시지/배지 새로고침
}

export const AgentTaskPanel: React.FC<Props> = ({ teamId, revenue, onRan }) => {
  const tasks = agentTasksForTeam(teamId);
  const [lastResult, setLastResult] = useState<Record<string, string>>({});

  const run = (spec: AgentTaskSpec) => {
    const { body } = runAgentTask(spec, { revenue });
    setLastResult((prev) => ({ ...prev, [spec.id]: body }));
    onRan();
  };

  return (
    <div className="atask-panel">
      <p className="atask-intro">
        이 팀 AI 에이전트의 자동 업무입니다. 정해진 시간에 스스로 점검하고 결과를 담당 팀에 보고합니다.
        <br /><span className="atask-intro-sub">※ 지금은 선언된 스케줄 + 수동 실행 단계입니다. 시각 자동 실행은 서버 연결(2단계) 후 활성화됩니다.</span>
      </p>
      {tasks.length === 0 ? (
        <p className="atask-empty">이 팀에 등록된 자동 업무가 없습니다.</p>
      ) : (
        <div className="atask-list">
          {tasks.map((t) => (
            <div key={t.id} className="atask-item">
              <div className="atask-item-head">
                <span className="atask-title">🤖 {t.title}</span>
                <span className="atask-sched">{scheduleLabel(t.schedule)}</span>
              </div>
              <div className="atask-meta">
                <span className="atask-agent">{t.agentLabel}</span>
                <span className="atask-report">→ {DEPT_TEAM_META[t.reportTo].emoji} {DEPT_TEAM_META[t.reportTo].name}에 보고</span>
              </div>
              {lastResult[t.id] && (
                <div className="atask-result">방금 실행 · {DEPT_TEAM_META[t.reportTo].name} 요청함으로 전송됨<div className="atask-result-body">{lastResult[t.id]}</div></div>
              )}
              <button type="button" className="atask-run" onClick={() => run(t)}>지금 실행</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
