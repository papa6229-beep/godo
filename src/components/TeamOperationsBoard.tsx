import React, { useState } from 'react';
import type { DepartmentDefinition, NativeAgentDefinition, AgentJob, AgentResult, AgentHandoff } from '../engine/nativeAgentRuntime/types';
import type { ApprovalItem } from '../types/approval';
import type { ValidationScenarioType } from '../engine/nativeAgentRuntime/validationScenarios';
import { MetricDrilldownModal, type MetricType } from './MetricDrilldownModal';
import { HandoffDetailModal } from './HandoffDetailModal';
import './TeamOperationsBoard.css';

interface TeamOperationsBoardProps {
  departments: DepartmentDefinition[];
  agents: NativeAgentDefinition[];
  lastRunJobs: AgentJob[];
  lastRunResults: AgentResult[];
  lastRunHandoffs: AgentHandoff[];
  activeScenario: ValidationScenarioType;
  onScenarioChange: (scenario: ValidationScenarioType) => void;
  scenarioDescription: string;
  onSelectDepartment: (dept: DepartmentDefinition) => void;
  onStartSimulation: () => void;
  isSimulating: boolean;
  managerBriefing?: string | null;
  onOpenBriefingModal: () => void;
  approvalItems?: ApprovalItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

const DEPT_ICONS: Record<string, string> = {
  product: '📦',
  cs: '💬',
  marketing: '📢',
  manager: '👑',
};

const DEPT_LABEL: Record<string, string> = {
  product: '상품관리팀',
  cs: 'CS 운영팀',
  marketing: '마케팅팀',
  manager: '총괄 HQ',
};

interface DrilldownState {
  deptId: string;
  deptName: string;
  metricType: MetricType;
}

export const TeamOperationsBoard: React.FC<TeamOperationsBoardProps> = ({
  departments,
  agents,
  lastRunJobs,
  lastRunResults,
  lastRunHandoffs,
  activeScenario,
  onScenarioChange,
  scenarioDescription,
  onSelectDepartment,
  onStartSimulation,
  isSimulating,
  managerBriefing,
  onOpenBriefingModal,
  approvalItems = [],
  onApprove,
  onReject,
}) => {
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const [selectedHandoff, setSelectedHandoff] = useState<AgentHandoff | null>(null);

  const openDrilldown = (deptId: string, deptName: string, metricType: MetricType) => {
    setDrilldown({ deptId, deptName, metricType });
  };

  const getDeptStats = (deptId: string) => {
    const deptJobs     = lastRunJobs.filter(j => j.departmentId === deptId);
    const deptResults  = lastRunResults.filter(r => r.departmentId === deptId);
    const outgoing     = lastRunHandoffs.filter(h => h.fromDepartmentId === deptId).length;
    const deptApprovals = approvalItems.filter(a => a.requestedByAgentId.startsWith(deptId)).length;

    let statusText = '대기 중';
    let statusClass = 'idle';

    const hasFailed = deptJobs.some(j => j.status === 'failed') || deptResults.some(r => r.status === 'failed');
    const isRunning = deptJobs.some(j => j.status === 'running');
    const isCompleted = deptJobs.length > 0 && deptJobs.every(j => j.status === 'completed' || j.status === 'failed');
    const isDeptDisabled = !departments.find(d => d.id === deptId)?.enabled;
    const approvalCount = deptResults.filter(r => r.approvalRequired).length;

    if (isDeptDisabled) {
      statusText = '비활성화';
      statusClass = 'disabled';
    } else if (hasFailed) {
      statusText = '확인 필요';
      statusClass = 'blocked';
    } else if (approvalCount > 0 || deptApprovals > 0) {
      statusText = '승인 대기';
      statusClass = 'needs_review';
    } else if (isRunning) {
      statusText = '분석 중';
      statusClass = 'active';
    } else if (isCompleted) {
      statusText = outgoing > 0 ? '협업 중' : '정상 운영';
      statusClass = 'completed';
    }

    const lastResult = deptResults[deptResults.length - 1];
    const recentActivity = lastResult?.summary || (deptJobs[0]?.objective ?? null);

    return {
      jobsCount:     deptJobs.length,
      resultsCount:  deptResults.length,
      outgoing,
      approvalCount: approvalCount + deptApprovals,
      statusText,
      statusClass,
      recentActivity,
    };
  };

  const totalDepts   = departments.filter(d => d.enabled).length;
  const totalHandoffs = lastRunHandoffs.length;
  const totalApproval = lastRunResults.filter(r => r.approvalRequired).length + approvalItems.length;
  const hasRun = lastRunJobs.length > 0;

  const recentHandoffs = lastRunHandoffs.slice(-3).reverse();

  const briefingSummary = managerBriefing
    ? managerBriefing.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>'))?.replace(/^[*-]\s*/, '').trim()
    : null;

  // 현재 운영 상태 표시 텍스트
  const operationStatusText = isSimulating
    ? '🛰️ 운영 진행 중'
    : hasRun
    ? '✅ 오늘 운영 완료'
    : '⏳ 운영 대기 중';

  return (
    <div className="team-operations-board">
      {/* 헤더 */}
      <div className="board-header-row">
        <div className="board-header-left">
          <span className="board-badge">AI 부서 현황</span>
          <h3 className="board-title">부서 관제 보드</h3>
        </div>
        <span className={`ops-status-chip ${isSimulating ? 'running' : hasRun ? 'done' : 'idle'}`}>
          {operationStatusText}
        </span>
      </div>

      {/* 오늘의 부서 요약 */}
      <div className="dept-summary-strip">
        <div className="summary-stat">
          <span className="summary-num">{totalDepts}</span>
          <span className="summary-lbl">가동 중</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <span className="summary-num">{totalHandoffs}</span>
          <span className="summary-lbl">협업 진행</span>
        </div>
        <div className="summary-divider" />
        <div className={`summary-stat ${totalApproval > 0 ? 'alert' : ''}`}>
          <span className="summary-num">{totalApproval}</span>
          <span className="summary-lbl">승인 대기</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <span className="summary-num">{hasRun ? '정상' : '대기'}</span>
          <span className="summary-lbl">운영 상태</span>
        </div>
      </div>

      {/* 부서 팀장 카드 */}
      <div className="dept-cards-section">
        {departments.map((dept) => {
          const stats = getDeptStats(dept.id);
          const leadAgent = agents.find(a => a.id === dept.leadAgentId);
          const icon = DEPT_ICONS[dept.id] ?? '🏢';

          return (
            <div key={dept.id} className={`dept-card ${stats.statusClass}`}>
              <div className="dept-card-top">
                <div className="dept-card-identity">
                  <span className="dept-card-icon">{icon}</span>
                  <div className="dept-card-names">
                    <span className="dept-card-name">{dept.name}</span>
                    <span className="dept-card-lead">
                      {leadAgent ? leadAgent.name.split(' (')[0] : '팀장 없음'}
                    </span>
                  </div>
                </div>
                <span className={`dept-status-badge ${stats.statusClass}`}>
                  {stats.statusText}
                </span>
              </div>

              {/* ─── KPI 클릭 가능 칩 ─── */}
              <div className="dept-card-stats">
                <button
                  className={`stat-chip clickable ${stats.jobsCount > 0 ? '' : 'zero'}`}
                  onClick={() => stats.jobsCount > 0 && openDrilldown(dept.id, dept.name, 'in_progress')}
                  title="진행 중 업무 상세 보기"
                  disabled={stats.jobsCount === 0}
                >
                  <span className="chip-num">{stats.jobsCount}</span>
                  <span className="chip-lbl">진행</span>
                </button>

                <button
                  className={`stat-chip clickable ${stats.resultsCount > 0 ? '' : 'zero'}`}
                  onClick={() => stats.resultsCount > 0 && openDrilldown(dept.id, dept.name, 'completed')}
                  title="처리 완료 결과 상세 보기"
                  disabled={stats.resultsCount === 0}
                >
                  <span className="chip-num">{stats.resultsCount}</span>
                  <span className="chip-lbl">완료</span>
                </button>

                <button
                  className={`stat-chip clickable ${stats.outgoing > 0 ? '' : 'zero'}`}
                  onClick={() => stats.outgoing > 0 && openDrilldown(dept.id, dept.name, 'handoff')}
                  title="부서 간 전달 상세 보기"
                  disabled={stats.outgoing === 0}
                >
                  <span className="chip-num">{stats.outgoing}</span>
                  <span className="chip-lbl">전달</span>
                </button>

                <button
                  className={`stat-chip clickable ${stats.approvalCount > 0 ? 'chip-alert' : 'zero'}`}
                  onClick={() => stats.approvalCount > 0 && openDrilldown(dept.id, dept.name, 'approval')}
                  title="승인 대기 항목 보기"
                  disabled={stats.approvalCount === 0}
                >
                  <span className="chip-num">{stats.approvalCount}</span>
                  <span className="chip-lbl">승인</span>
                </button>
              </div>

              {stats.recentActivity && (
                <div className="dept-card-activity">
                  {stats.recentActivity}
                </div>
              )}

              <button
                className="dept-enter-btn"
                onClick={() => onSelectDepartment(dept)}
              >
                부서 보기 →
              </button>
            </div>
          );
        })}
      </div>

      {/* 최근 협업 흐름 (클릭 가능) */}
      {recentHandoffs.length > 0 && (
        <div className="collab-flow-section">
          <div className="section-title-row">
            <span className="section-title">최근 부서 협업</span>
            {lastRunHandoffs.length > 3 && (
              <button
                className="collab-view-all-btn"
                onClick={onOpenBriefingModal}
              >
                전체 {lastRunHandoffs.length}건 →
              </button>
            )}
          </div>
          <div className="collab-flow-list">
            {recentHandoffs.map((h, i) => (
              <button
                key={i}
                className="collab-flow-item clickable"
                onClick={() => setSelectedHandoff(h)}
                title="전달 상세 보기"
              >
                <div className="collab-flow-route">
                  <span className="flow-from">{DEPT_LABEL[h.fromDepartmentId] ?? h.fromDepartmentId}</span>
                  <span className="flow-arrow">→</span>
                  <span className="flow-to">{DEPT_LABEL[h.toDepartmentId] ?? h.toDepartmentId}</span>
                  <span className="collab-detail-hint">상세 →</span>
                </div>
                <p className="collab-flow-msg">{h.message}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 종합 브리핑 요약 */}
      {managerBriefing && (
        <div className="briefing-summary-section">
          <div className="section-title-row">
            <span className="section-title">오늘의 종합 브리핑</span>
          </div>
          {briefingSummary && (
            <p className="briefing-summary-text">{briefingSummary}</p>
          )}
          <button className="briefing-full-btn" onClick={onOpenBriefingModal}>
            전체 브리핑 보기 →
          </button>
        </div>
      )}

      {/* 개발자 검증 도구 (접힘 패널) */}
      <div className="dev-tool-panel">
        <button
          className="dev-tool-toggle"
          onClick={() => setDevPanelOpen(prev => !prev)}
        >
          🔧 개발자 검증 도구
          <span className="toggle-caret">{devPanelOpen ? '▲' : '▼'}</span>
        </button>
        {devPanelOpen && (
          <div className="dev-tool-body">
            <div className="dev-tool-row">
              <label htmlFor="scenario-select" className="dev-label">운영 상황 테스트:</label>
              <select
                id="scenario-select"
                value={activeScenario}
                onChange={(e) => onScenarioChange(e.target.value as ValidationScenarioType)}
                disabled={isSimulating}
                className="dev-dropdown"
              >
                <option value="normal">🟢 정상 운영</option>
                <option value="low_stock">🔴 재고 부족</option>
                <option value="cs_negative">🟡 CS 이슈</option>
                <option value="disabled_marketing">⚫ 마케팅팀 정지</option>
              </select>
            </div>
            <div className="dev-desc-box">
              <span className="dev-desc-icon">ℹ️</span>
              <p className="dev-desc-text">{scenarioDescription}</p>
            </div>
            <button
              onClick={onStartSimulation}
              disabled={isSimulating}
              className={`dev-run-btn ${isSimulating ? 'running' : ''}`}
            >
              {isSimulating ? '운영 흐름 수행 중...' : '상황 반영 및 실행'}
            </button>
          </div>
        )}
      </div>

      {/* MetricDrilldownModal */}
      {drilldown && (
        <MetricDrilldownModal
          isOpen={!!drilldown}
          onClose={() => setDrilldown(null)}
          departmentId={drilldown.deptId}
          departmentName={drilldown.deptName}
          metricType={drilldown.metricType}
          jobs={lastRunJobs.filter(j => j.departmentId === drilldown.deptId)}
          results={lastRunResults.filter(r => r.departmentId === drilldown.deptId)}
          handoffs={lastRunHandoffs.filter(
            h => h.fromDepartmentId === drilldown.deptId || h.toDepartmentId === drilldown.deptId
          )}
          approvalItems={approvalItems.filter(a => a.requestedByAgentId.startsWith(drilldown.deptId))}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}

      {/* HandoffDetailModal */}
      {selectedHandoff && (
        <HandoffDetailModal
          isOpen={!!selectedHandoff}
          onClose={() => setSelectedHandoff(null)}
          handoff={selectedHandoff}
          relatedResults={lastRunResults.filter(
            r => r.departmentId === selectedHandoff.fromDepartmentId ||
                 r.departmentId === selectedHandoff.toDepartmentId
          )}
        />
      )}
    </div>
  );
};
