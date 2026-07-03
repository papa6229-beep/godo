import React, { useEffect, useState } from 'react';
import type { Agent } from '../types';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import { ChatConsole } from './ChatConsole';
import { ExecutiveBriefing } from './ExecutiveBriefing';
import { HqDirectiveComposer } from './HqDirectiveComposer';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { NativeAgentRun, DepartmentDefinition } from '../engine/nativeAgentRuntime/types';
import type { ValidationScenarioType } from '../engine/nativeAgentRuntime/validationScenarios';
import { TeamOperationsBoard } from './TeamOperationsBoard';
import { DeptActivityModal } from './DeptActivityModal';
import { OperationBriefingModal } from './OperationBriefingModal';
import { defaultDepartments, defaultNativeAgents } from '../data/defaultNativeAgentRuntime';
import { postTeamMessage } from '../services/teamMessageCenter';
import { logActivity } from '../services/activityLedger';
import { fetchRevenue, type RevenueOrderLite } from '../services/departmentDataService';
import { DEPT_TEAM_META, type DeptTeamId, type TeamMessageAttachment } from '../types/teamMessage';
import './OfficeView.css';

// 부서 카드 id → 활동 원장 팀 id (manager=총괄→hq)
const DEPT_TO_TEAM: Record<string, DeptTeamId> = { manager: 'hq', product: 'product', cs: 'cs', marketing: 'marketing' };
const HQ_ACTOR = { kind: 'human' as const, teamId: 'hq' as DeptTeamId, label: '최고관리자' };

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
  activeOperationsData,
  onUpdateAgents,
  onAddLog,
  lastNativeAgentRun,

  validationScenario,
  onScenarioChange
}) => {
  const [selectedDept, setSelectedDept] = useState<DepartmentDefinition | null>(null);
  const [briefingModalOpen, setBriefingModalOpen] = useState(false);

  // HQ 채팅 통계/그래프용 커머스 데이터(부서 채팅과 동일 소스). 로컬 dev엔 API 없을 수 있음(그땐 콘솔 기본 응답).
  const [commerceData, setCommerceData] = useState<{ orders: RevenueOrderLite[]; reviews?: unknown[]; inquiries?: unknown[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRevenue(true, 'commerce_universe_v1', { includeUniverseAux: true })
      .then((rev) => { if (alive && rev?.orders?.length) setCommerceData({ orders: rev.orders, reviews: rev.universeAux?.reviews, inquiries: rev.universeAux?.inquiries }); })
      .catch(() => { /* 데이터 없음 — 콘솔 기본 경로 */ });
    return () => { alive = false; };
  }, []);

  // 최고관리자 → 팀 지시(메시지+파일). 팀 inbox로 발송 + 활동 원장 기록.
  const sendDirective = (toTeam: DeptTeamId, text: string, attachments: TeamMessageAttachment[]) => {
    const title = text || (attachments.length ? '자료 전달' : '지시');
    const posted = postTeamMessage({ from: HQ_ACTOR, toTeam, kind: 'info', title, body: '', attachments });
    logActivity({ teamId: 'hq', type: 'message_sent', status: 'info', title, detail: `${DEPT_TEAM_META[toTeam].name}에 지시${attachments.length ? ` · 첨부 ${attachments.length}` : ''}`, actor: HQ_ACTOR, relatedTeam: toTeam, refId: posted.id });
  };

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
          quickBarSlot={<HqDirectiveComposer onSend={sendDirective} />}
          commerceData={commerceData}
        />
      </div>

      {/* 3열 (우측): 전사 브리핑(활동 원장 기반, 읽기 전용) — 오늘의할일/승인대기 대체 */}
      <div className="office-right-column">
        <ExecutiveBriefing />
      </div>

      {/* 부서 업무 확인 — 활동 원장 기반(읽기 전용) */}
      {selectedDept && (
        <DeptActivityModal
          teamId={DEPT_TO_TEAM[selectedDept.id] ?? (selectedDept.id as DeptTeamId)}
          onClose={() => setSelectedDept(null)}
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
