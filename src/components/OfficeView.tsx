import React from 'react';
import type { Agent } from '../types';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import { TaskBoard } from './TaskBoard';
import { PixelOfficeView } from './PixelOfficeView';
import { AiBriefing } from './AiBriefing';
import { ChatConsole } from './ChatConsole';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import './OfficeView.css';

interface OfficeViewProps {
  agents: Agent[];
  tasks: OperationTask[];
  isSimulating: boolean;
  operationRunState: 'idle' | 'running' | 'completed';
  approvalQueue: ApprovalItem[];
  onStartSimulation: () => void;
  onAddTask: (title: string, agentId: string) => void;
  onSelectAgent: (agent: Agent) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSelectTask?: (task: OperationTask) => void;
  onSelectApproval?: (item: ApprovalItem) => void;
  activeOperationsData: OperationsDataSnapshot;
  onNavigateToLogs: () => void;
  onUpdateAgents: (items: Agent[]) => void;
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
}

export const OfficeView: React.FC<OfficeViewProps> = ({
  agents,
  tasks,
  isSimulating,
  operationRunState,
  approvalQueue,
  onStartSimulation,
  onAddTask,
  onSelectAgent,
  onApprove,
  onReject,
  onSelectTask,
  onSelectApproval,
  activeOperationsData,
  onNavigateToLogs,
  onUpdateAgents,
  onAddLog
}) => {
  return (
    <div className="office-view-container">
      {/* 1열 (좌측 현황판): Mini Live Office View + AI 운영 브리핑 요약 */}
      <div className="office-left-column">
        {/* 픽셀 오피스 미니 맵 */}
        <div className="office-map-card mini-map">
          <div className="map-header">
            <span className="map-badge">MINI LIVE OFFICE</span>
            <span className="map-desc">실시간 AI 사무실 미니뷰</span>
          </div>
          <PixelOfficeView agents={agents} onSelectAgent={onSelectAgent} isMini={true} />
        </div>

        {/* AI 운영 브리핑 요약 */}
        <div className="office-briefing-wrapper">
          <AiBriefing
            activeOperationsData={activeOperationsData}
            approvalQueue={approvalQueue}
            onNavigateToLogs={onNavigateToLogs}
            isMini={true}
            operationRunState={operationRunState}
          />
        </div>
      </div>

      {/* 2열 (중앙 총괄 매니저 콘솔): Operational Control Chat 대형 패널 */}
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
        />
      </div>

      {/* 3열 (우측 작업보드): Today’s Tasks + Approval Queue */}
      <div className="office-right-column">
        <TaskBoard
          tasks={tasks}
          agents={agents}
          isSimulating={isSimulating}
          approvalQueue={approvalQueue}
          onStartSimulation={onStartSimulation}
          onAddTask={onAddTask}
          onApprove={onApprove}
          onReject={onReject}
          onSelectTask={onSelectTask}
          onSelectApproval={onSelectApproval}
          hideAddTask={true} // 우측 수동 추가 영역 제거
        />
      </div>
    </div>
  );
};
