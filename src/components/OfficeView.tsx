import React, { useEffect, useMemo, useState } from 'react';
import type { Agent } from '../types';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import { ChatConsole } from './ChatConsole';
import { ExecutiveBriefing } from './ExecutiveBriefing';
import { TeamMessagePanel } from './TeamMessagePanel';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { NativeAgentRun } from '../engine/nativeAgentRuntime/types';
import type { ValidationScenarioType } from '../engine/nativeAgentRuntime/validationScenarios';
import {
  loadTeamMessages, subscribeTeamMessages, postTeamMessage, resolveTeamMessage, markInboxRead,
  type CreateTeamMessageInput
} from '../services/teamMessageCenter';
import { logActivity } from '../services/activityLedger';
import { DEPT_TEAM_META, type DeptTeamId, type TeamMessage, type TeamMessageStatus } from '../types/teamMessage';
import './OfficeView.css';

// 오늘의 운영 = 최고관리자 관제(읽기) + HQ 지시/보고.
//  좌: HQ 지시/보고(팀 메시지) · 중앙: HQ AI 채팅 + 팀 지시 바 · 우: 전사 브리핑(활동 원장)

interface OfficeViewProps {
  agents: Agent[];
  tasks: OperationTask[];
  isSimulating: boolean;
  approvalQueue: ApprovalItem[];
  onStartSimulation: () => void;
  onAddTask: (title: string, agentId: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSelectTask?: (task: OperationTask) => void;
  onSelectApproval?: (item: ApprovalItem) => void;
  activeOperationsData: OperationsDataSnapshot;
  onUpdateAgents: (items: Agent[]) => void;
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
  lastNativeAgentRun?: NativeAgentRun | null;
  validationScenario: ValidationScenarioType;
  onScenarioChange: (scenario: ValidationScenarioType) => void;
  uploadedFiles: Record<string, { name: string; size: number; type: string; timestamp: string }[]>;
  onAddFileMetadata: (deptId: string, file: { name: string; size: number; type: string }) => void;
  manualCommands: Record<string, { text: string; timestamp: string }[]>;
  onAddManualCommand: (deptId: string, text: string) => void;
}

const HQ_ACTOR = { kind: 'human' as const, teamId: 'hq' as DeptTeamId, label: '최고관리자' };
const DIRECTIVE_TEAMS: DeptTeamId[] = ['product', 'cs', 'marketing'];

// 중앙 채팅 하단 — 팀에 지시 보내기 바(Quick Task Add 대체).
const HqDirectiveBar: React.FC<{ onSend: (team: DeptTeamId, text: string) => void }> = ({ onSend }) => {
  const [team, setTeam] = useState<DeptTeamId>('product');
  const [text, setText] = useState('');
  const send = () => { if (!text.trim()) return; onSend(team, text.trim()); setText(''); };
  return (
    <div className="office-directive-bar">
      <span className="office-directive-label">📣 팀에 지시</span>
      <select className="office-directive-team" value={team} onChange={(e) => setTeam(e.target.value as DeptTeamId)}>
        {DIRECTIVE_TEAMS.map((t) => <option key={t} value={t}>{DEPT_TEAM_META[t].emoji} {DEPT_TEAM_META[t].name}</option>)}
      </select>
      <input className="office-directive-input" value={text} placeholder="예: 품절 상품 응대 우선 처리해주세요" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
      <button type="button" className="office-directive-btn" onClick={send}>보내기</button>
    </div>
  );
};

export const OfficeView: React.FC<OfficeViewProps> = ({
  agents,
  tasks,
  isSimulating,
  approvalQueue,
  onStartSimulation,
  onAddTask,
  onApprove,
  onReject,
  activeOperationsData,
  onUpdateAgents,
  onAddLog
}) => {
  const [teamMessages, setTeamMessages] = useState<TeamMessage[]>(() => loadTeamMessages());
  useEffect(() => subscribeTeamMessages(() => setTeamMessages(loadTeamMessages())), []);
  const refresh = () => setTeamMessages(loadTeamMessages());

  const handlePost = (input: CreateTeamMessageInput) => {
    const posted = postTeamMessage(input);
    logActivity({ teamId: 'hq', type: 'message_sent', status: 'info', title: input.title || '지시', detail: `${DEPT_TEAM_META[input.toTeam].name}에 지시`, actor: input.from, relatedTeam: input.toTeam, refId: posted.id });
    refresh();
  };
  const handleResolve = (id: string, status: TeamMessageStatus) => {
    resolveTeamMessage(id, status, HQ_ACTOR);
    if (status === 'done' || status === 'in_progress') {
      const msg = teamMessages.find((m) => m.id === id);
      logActivity({ teamId: 'hq', type: 'approval', status: status === 'done' ? 'done' : 'in_progress', title: msg?.title || '요청 처리', actor: HQ_ACTOR, refId: id });
    }
    refresh();
  };
  const handleMarkRead = (id: string) => { markInboxRead(id, HQ_ACTOR); refresh(); };

  const sendDirective = (team: DeptTeamId, text: string) => {
    handlePost({ from: HQ_ACTOR, toTeam: team, kind: 'info', title: text, body: '' });
  };

  const directiveBar = useMemo(() => <HqDirectiveBar onSend={sendDirective} />, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="office-view-container">
      {/* 1열 (좌측): HQ 지시/보고 — 팀에 지시 발송 + 팀 보고 수신 */}
      <div className="office-left-column">
        <div className="office-col-head">
          <h3 className="office-col-title">🏛️ HQ 지시 / 보고</h3>
          <p className="office-col-sub">각 팀에 지시를 보내고, 팀·AI의 보고를 확인·처리합니다.</p>
        </div>
        <TeamMessagePanel
          teamId="hq"
          messages={teamMessages}
          onPost={handlePost}
          onResolve={handleResolve}
          onMarkRead={handleMarkRead}
        />
      </div>

      {/* 2열 (중앙): 총괄 매니저 콘솔 + 팀 지시 바 */}
      <div className="office-center-column">
        <ChatConsole
          activeOperationsData={activeOperationsData}
          tasks={tasks}
          approvalQueue={approvalQueue}
          onAddLog={onAddLog}
          onAddTask={onAddTask}
          onStartSimulation={onStartSimulation}
          onApprove={onApprove}
          onReject={onReject}
          agents={agents}
          onUpdateAgents={onUpdateAgents}
          isLarge={true}
          isSimulating={isSimulating}
          quickBarSlot={directiveBar}
        />
      </div>

      {/* 3열 (우측): 전사 브리핑(활동 원장, 읽기 전용) */}
      <div className="office-right-column">
        <ExecutiveBriefing />
      </div>
    </div>
  );
};
