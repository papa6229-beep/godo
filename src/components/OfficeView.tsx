import React from 'react';
import type { Agent, LogEntry } from '../types';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import { TaskBoard } from './TaskBoard';
import { ActivityLog } from './ActivityLog';
import { PixelOfficeView } from './PixelOfficeView';
import './OfficeView.css';

interface OfficeViewProps {
  agents: Agent[];
  tasks: OperationTask[];
  logs: LogEntry[];
  isSimulating: boolean;
  approvalQueue: ApprovalItem[];
  onStartSimulation: () => void;
  onAddTask: (title: string, agentId: string) => void;
  onSelectAgent: (agent: Agent) => void;
  onClearLogs?: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const OfficeView: React.FC<OfficeViewProps> = ({
  agents,
  tasks,
  logs,
  isSimulating,
  approvalQueue,
  onStartSimulation,
  onAddTask,
  onSelectAgent,
  onClearLogs,
  onApprove,
  onReject
}) => {
  return (
    <div className="office-view-container">
      {/* 왼쪽: 픽셀 오피스 맵 + 하단 액티비티 로그 */}
      <div className="office-left-column">
        {/* 픽셀 오피스 맵 */}
        <div className="office-map-card">
          <div className="map-header">
            <span className="map-badge">LIVE OFFICE VIEW</span>
            <span className="map-desc">에이전트들이 각 구역에서 자동 연산을 수행 중입니다.</span>
          </div>

          <PixelOfficeView agents={agents} onSelectAgent={onSelectAgent} />
        </div>

        {/* 하단 액티비티 로그 */}
        <div className="office-log-container">
          <ActivityLog logs={logs} onClearLogs={onClearLogs} />
        </div>
      </div>

      {/* 오른쪽: 태스크 보드 */}
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
        />
      </div>
    </div>
  );
};
