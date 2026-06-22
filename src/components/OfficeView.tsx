import React, { useState } from 'react';
import type { Agent } from '../types';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import { TaskBoard } from './TaskBoard';
import { ChatConsole } from './ChatConsole';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { NativeAgentRun, DepartmentDefinition } from '../engine/nativeAgentRuntime/types';
import type { ValidationScenarioType } from '../engine/nativeAgentRuntime/validationScenarios';
import { TeamOperationsBoard } from './TeamOperationsBoard';
import { DepartmentCommandPanel } from './DepartmentCommandPanel';
import { OperationBriefingModal } from './OperationBriefingModal';
import { defaultDepartments, defaultNativeAgents } from '../data/defaultNativeAgentRuntime';
import './OfficeView.css';

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

  // Native Runtime Verification props
  validationScenario: ValidationScenarioType;
  onScenarioChange: (scenario: ValidationScenarioType) => void;
  uploadedFiles: Record<string, { name: string; size: number; type: string; timestamp: string }[]>;
  onAddFileMetadata: (deptId: string, file: { name: string; size: number; type: string }) => void;
  manualCommands: Record<string, { text: string; timestamp: string }[]>;
  onAddManualCommand: (deptId: string, text: string) => void;
}

export const OfficeView: React.FC<OfficeViewProps> = ({
  agents,
  tasks,
  isSimulating,
  approvalQueue,
  onStartSimulation,
  onAddTask,
  onApprove,
  onReject,
  onSelectTask,
  onSelectApproval,
  activeOperationsData,
  onUpdateAgents,
  onAddLog,
  lastNativeAgentRun,

  validationScenario,
  onScenarioChange,
  uploadedFiles,
  onAddFileMetadata,
  manualCommands,
  onAddManualCommand
}) => {
  const [selectedDept, setSelectedDept] = useState<DepartmentDefinition | null>(null);
  const [briefingModalOpen, setBriefingModalOpen] = useState(false);

  const scenarioDescriptions: Record<ValidationScenarioType, string> = {
    normal: '정상 운영: 재고 수량 양호, 고객 미답변 문의 없음, 평점 5점 만족',
    low_stock: '재고 부족: 시그니처 세트·마사지 오일 재고 고갈 → 마케팅 캠페인 자동 배제',
    cs_negative: 'CS 이슈: 마사지 오일 피부 트러블 민원 → 마케팅 보류 및 캠페인 카피 경고',
    disabled_marketing: '마케팅팀 정지: 마케팅 에이전트 전체 비활성화 → 관련 업무 생략'
  };

  return (
    <div className="office-view-container">
      {/* 1열 (좌측): AI 부서 관제 보드 */}
      <div className="office-left-column">
        <TeamOperationsBoard
          departments={defaultDepartments}
          agents={defaultNativeAgents}
          lastRunJobs={lastNativeAgentRun ? lastNativeAgentRun.jobs : []}
          lastRunResults={lastNativeAgentRun ? lastNativeAgentRun.results : []}
          lastRunHandoffs={lastNativeAgentRun ? lastNativeAgentRun.handoffs : []}
          activeScenario={validationScenario}
          onScenarioChange={onScenarioChange}
          scenarioDescription={scenarioDescriptions[validationScenario]}
          onSelectDepartment={(dept) => setSelectedDept(dept)}
          onStartSimulation={onStartSimulation}
          isSimulating={isSimulating}
          managerBriefing={lastNativeAgentRun?.managerBriefing ?? null}
          onOpenBriefingModal={() => setBriefingModalOpen(true)}
          approvalItems={approvalQueue}
          onApprove={onApprove}
          onReject={onReject}
        />
      </div>

      {/* 2열 (중앙): 총괄 매니저 콘솔 */}
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

      {/* 3열 (우측): Today's Tasks + Approval Queue */}
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
          hideAddTask={true}
        />
      </div>

      {/* 부서 상세 워크스페이스 모달 */}
      {selectedDept && (
        <DepartmentCommandPanel
          isOpen={!!selectedDept}
          onClose={() => setSelectedDept(null)}
          department={selectedDept}
          agents={defaultNativeAgents}
          lastRunJobs={lastNativeAgentRun ? lastNativeAgentRun.jobs : []}
          lastRunResults={lastNativeAgentRun ? lastNativeAgentRun.results : []}
          lastRunHandoffs={lastNativeAgentRun ? lastNativeAgentRun.handoffs : []}
          onAddManualCommand={onAddManualCommand}
          onAddFileMetadata={onAddFileMetadata}
          uploadedFiles={uploadedFiles[selectedDept.id] || []}
          manualCommands={manualCommands[selectedDept.id] || []}
        />
      )}

      {/* 종합 브리핑 모달 */}
      {briefingModalOpen && lastNativeAgentRun && (
        <OperationBriefingModal
          isOpen={briefingModalOpen}
          onClose={() => setBriefingModalOpen(false)}
          lastRun={lastNativeAgentRun}
          approvalItems={approvalQueue}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}
    </div>
  );
};
