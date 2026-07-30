import React, { useEffect, useState } from 'react';
import type { Agent } from '../types';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import { ChatConsole } from './ChatConsole';
import { ExecutiveBriefing } from './ExecutiveBriefing';
import type { DirectiveSendResult } from './HqDirectiveComposer';
import { HqDirectiveComposer } from './HqDirectiveComposer';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { NativeAgentRun, DepartmentDefinition } from '../engine/nativeAgentRuntime/types';
import type { ValidationScenarioType } from '../engine/nativeAgentRuntime/validationScenarios';
import { TeamOperationsBoard } from './TeamOperationsBoard';
import { DeptActivityModal } from './DeptActivityModal';
import { OperationBriefingModal } from './OperationBriefingModal';
import { defaultDepartments, defaultNativeAgents } from '../data/defaultNativeAgentRuntime';
import { fetchRevenue, type RevenueResult } from '../services/departmentDataService';
import { screenStateFromRevenue } from '../services/revenueScreenState';
import { type DeptTeamId, type TeamMessageAttachment } from '../types/teamMessage';
import './OfficeView.css';

// 부서 카드 id → 활동 원장 팀 id (manager=총괄→hq)
const DEPT_TO_TEAM: Record<string, DeptTeamId> = { manager: 'hq', product: 'product', cs: 'cs', marketing: 'marketing', design: 'design' };

interface OfficeViewProps {
  agents: Agent[];
  tasks: OperationTask[];
  isSimulating: boolean;
  approvalQueue: ApprovalItem[];
  /**
   * B-use-5 교정: **지금 이 사용자가 결정할 수 있는 승인 항목만**(App 의 `myPendingApprovals`).
   * 전체 `approvalQueue`(모든 사용자의 대기열)와 **의도적으로 분리**한다.
   * 왼쪽 요약 숫자·오른쪽 승인 항목·눌러서 열리는 목록이 모두 이 배열 하나를 근거로 삼는다.
   */
  pendingApprovalsForIdentity: ApprovalItem[];
  onStartSimulation: () => void;
  onAddTask: (title: string, agentId: string) => void;
  onApprove: (id: string) => void;
  onSelectApproval?: (item: ApprovalItem) => void;
  /**
   * B-use-3: HQ 지시 1건 처리. **App 이 소유한다.**
   *   화면은 고른 팀·문구·첨부만 넘기고, 행위자(actor)·업무 생성·원장 기록은 App 이 한다.
   *   화면이 actor 를 만들면 실제 로그인 신원이 아닌 값이 기록에 남는다.
   */
  /** B-use-5: 전송 결과를 그대로 통과시킨다(중간 배선이 성공 여부를 삼키지 않는다). */
  onSendDirective: (toTeam: DeptTeamId, text: string, attachments: TeamMessageAttachment[]) => DirectiveSendResult;
  /** B-use-5: 관제 보드 승인 요약·브리핑 승인 항목 → 실제 승인 대기열. */
  onOpenApprovals?: () => void;
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
  pendingApprovalsForIdentity,
  onStartSimulation,
  onAddTask,
  onSendDirective,
  onOpenApprovals,
  onApprove,
  activeOperationsData,
  onUpdateAgents,
  onAddLog,
  lastNativeAgentRun,

  validationScenario,
  onScenarioChange
}) => {
  const [selectedDept, setSelectedDept] = useState<DepartmentDefinition | null>(null);
  const [briefingModalOpen, setBriefingModalOpen] = useState(false);

  // HQ 채팅 통계/그래프용 매출 응답(부서 채팅과 **동일 소스**).
  //
  // Local migration: 이전에는 `rev.orders.length` 가 있을 때만 얇은 복사본을 저장해서
  //   ① 실제 성공 0건 ② 실제 주문 연결 실패 ③ 아직 불러오는 중 이 전부 `null` 로 합쳐졌다.
  //   `fetchRevenue` 는 네트워크·HTTP 실패를 **throw 하지 않고** source:'unavailable' 을
  //   반환하므로 `.catch(() => {})` 는 일반 실패 경로도 아니었다.
  // 이제 **RevenueResult 전체를 그대로 보존**하고, 화면 판정은 공통 계약
  //   `screenStateFromRevenue` 하나가 한다(새 규칙을 만들지 않는다).
  //
  // `null` 은 **'아직 불러오는 중'** 이라는 뜻으로만 쓴다.
  const [revenue, setRevenue] = useState<RevenueResult | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRevenue(true, 'commerce_universe_v1', { includeUniverseAux: true })
      .then((rev) => { if (alive) setRevenue(rev); })
      // 계약상 여기로는 오지 않는다(실패는 반환값). 그래도 오면 상태를 지어내지 않고
      // 정본 판정이 fail-closed 로 '연결 안 됨' 을 내도록 unavailable 응답을 만들어 넣는다.
      .catch((err: unknown) => {
        if (!alive) return;
        setRevenue({
          count: 0, source: 'unavailable', live: false, summary: null, stockImpact: [], orders: [],
          errorMessage: err instanceof Error ? err.message : String(err)
        });
      });
    return () => { alive = false; };
  }, []);

  // 공통 판정 계약 재사용 — OfficeView 는 상태를 추측하지 않는다.
  const revenueScreenState = revenue ? screenStateFromRevenue(revenue) : null;

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
          approvalItems={pendingApprovalsForIdentity}
          onOpenApprovals={onOpenApprovals}
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
          agents={agents}
          onUpdateAgents={onUpdateAgents}
          isLarge={true}
          isSimulating={isSimulating}
          quickBarSlot={<HqDirectiveComposer onSend={onSendDirective} />}
          revenue={revenue}
          revenueScreenState={revenueScreenState}
        />
      </div>

      {/* 3열 (우측): 전사 브리핑(활동 원장 기반, 읽기 전용) — 오늘의할일/승인대기 대체 */}
      <div className="office-right-column">
        <ExecutiveBriefing pendingApprovalsForIdentity={pendingApprovalsForIdentity} onOpenApprovals={onOpenApprovals} />
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
        />
      )}
    </div>
  );
};
