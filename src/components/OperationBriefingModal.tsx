import React, { useState } from 'react';
import type { NativeAgentRun, AgentHandoff } from '../engine/nativeAgentRuntime/types';
import type { ApprovalItem } from '../types/approval';
import { MetricDrilldownModal, type MetricType } from './MetricDrilldownModal';
import { HandoffDetailModal } from './HandoffDetailModal';
import './OperationBriefingModal.css';

interface OperationBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  lastRun: NativeAgentRun;
  approvalItems?: ApprovalItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

type BriefingTab = 'briefing' | 'handoffs' | 'techlog';

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

export const OperationBriefingModal: React.FC<OperationBriefingModalProps> = ({
  isOpen,
  onClose,
  lastRun,
  approvalItems = [],
  onApprove,
  onReject,
}) => {
  const [activeTab, setActiveTab] = useState<BriefingTab>('briefing');
  const [techExpanded, setTechExpanded] = useState(false);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const [selectedHandoff, setSelectedHandoff] = useState<AgentHandoff | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 내부 모달이 열려 있을 때는 그 모달이 먼저 닫히도록 우선순위 양보
        if (drilldown || selectedHandoff) return;
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, drilldown, selectedHandoff, onClose]);

  if (!isOpen) return null;

  const briefingLines = lastRun.managerBriefing?.split('\n') ?? [];
  const handoffs = lastRun.handoffs;
  const results = lastRun.results;
  const approvalPending = results.filter(r => r.approvalRequired);

  // 알람 박스 → 전체 승인 대기 드릴다운
  const openApprovalDrilldown = () => {
    setDrilldown({ deptId: '*', deptName: '전체 승인 대기', metricType: 'approval' });
  };

  // 부서별 결과 카드 → 해당 부서의 처리 결과 드릴다운
  const openDeptResultDrilldown = (deptId: string) => {
    setDrilldown({
      deptId,
      deptName: DEPT_LABEL[deptId] ?? deptId,
      metricType: 'completed',
    });
  };

  return (
    <div className="briefing-modal-overlay" onClick={onClose}>
      <div className="briefing-modal" onClick={e => e.stopPropagation()}>
        <div className="briefing-modal-header">
          <div className="briefing-header-left">
            <span className="briefing-modal-badge">종합 브리핑</span>
            <h2 className="briefing-modal-title">오늘의 운영 종합 브리핑</h2>
          </div>
          <button className="briefing-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="briefing-modal-tabs">
          <button className={`briefing-tab ${activeTab === 'briefing' ? 'active' : ''}`} onClick={() => setActiveTab('briefing')}>
            📋 종합 요약
          </button>
          <button className={`briefing-tab ${activeTab === 'handoffs' ? 'active' : ''}`} onClick={() => setActiveTab('handoffs')}>
            ↔️ 부서 간 전달 ({handoffs.length})
          </button>
          <button className={`briefing-tab ${activeTab === 'techlog' ? 'active' : ''}`} onClick={() => setActiveTab('techlog')}>
            🔧 기술 로그
          </button>
        </div>

        <div className="briefing-modal-body">

          {/* 종합 요약 탭 */}
          {activeTab === 'briefing' && (
            <div className="briefing-content">
              {/* 승인 대기 강조 (클릭 가능) */}
              {(approvalPending.length > 0 || approvalItems.length > 0) && (
                <button
                  type="button"
                  className="briefing-alert-box clickable"
                  onClick={openApprovalDrilldown}
                  title="승인 대기 상세 보기"
                >
                  <span className="briefing-alert-icon">⚠️</span>
                  <div className="briefing-alert-text">
                    <strong>최종 확인이 필요한 작업 {Math.max(approvalPending.length, approvalItems.length)}건</strong>
                    <p>승인 대기 항목을 모아서 확인합니다. 클릭해 상세를 열어 주세요.</p>
                  </div>
                  <span className="briefing-alert-arrow">→</span>
                </button>
              )}

              {/* 브리핑 본문 */}
              <div className="briefing-markdown">
                {briefingLines.map((line, idx) => {
                  if (!line.trim()) return <div key={idx} className="briefing-spacer" />;
                  if (line.startsWith('###')) return <h3 key={idx} className="briefing-h3">{line.replace('###', '').trim()}</h3>;
                  if (line.startsWith('##'))  return <h2 key={idx} className="briefing-h2">{line.replace('##', '').trim()}</h2>;
                  if (line.startsWith('>'))   return <blockquote key={idx} className="briefing-quote">{line.replace('>', '').trim()}</blockquote>;
                  if (line.startsWith('* ') || line.startsWith('- ')) return <li key={idx} className="briefing-li">{line.substring(2).trim()}</li>;
                  return <p key={idx} className="briefing-p">{line}</p>;
                })}
              </div>

              {/* 부서별 처리 결과 요약 (클릭 가능) */}
              <div className="dept-results-grid">
                <h4 className="section-mini-title">부서별 처리 결과 <span className="section-hint">(클릭해 상세 보기)</span></h4>
                {results.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className={`dept-result-card clickable ${r.status}`}
                    onClick={() => openDeptResultDrilldown(r.departmentId)}
                    title={`${DEPT_LABEL[r.departmentId] ?? r.departmentId} 처리 결과 상세`}
                  >
                    <div className="dept-result-header">
                      <span className="dept-result-name">{DEPT_LABEL[r.departmentId] ?? r.departmentId}</span>
                      <span className={`dept-result-badge ${r.status}`}>
                        {r.status === 'success' ? '완료' : r.status === 'failed' ? '실패' : r.status === 'needs_review' ? '검토 필요' : r.status === 'blocked' ? '차단' : r.status}
                      </span>
                      {r.approvalRequired && <span className="approval-required-badge">승인 필요</span>}
                      <span className="dept-result-arrow">→</span>
                    </div>
                    <p className="dept-result-summary">{r.summary}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 부서 간 전달 탭 (클릭 가능) */}
          {activeTab === 'handoffs' && (
            <div className="handoffs-content">
              {handoffs.length === 0 ? (
                <div className="empty-state">
                  <span>↔️</span>
                  <p>이번 운영에서 부서 간 전달이 없었습니다.</p>
                </div>
              ) : (
                <div className="handoff-full-list">
                  {handoffs.map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      className="handoff-full-item clickable"
                      onClick={() => setSelectedHandoff(h)}
                      title="전달 상세 보기"
                    >
                      <div className="handoff-full-route">
                        <span className="handoff-from">{DEPT_LABEL[h.fromDepartmentId] ?? h.fromDepartmentId}</span>
                        <span className="handoff-arrow">→</span>
                        <span className="handoff-to">{DEPT_LABEL[h.toDepartmentId] ?? h.toDepartmentId}</span>
                        <span className="handoff-time">{new Date(h.createdAt).toLocaleTimeString()}</span>
                        <span className="handoff-detail-hint">상세 →</span>
                      </div>
                      <div className="handoff-full-title">{h.title}</div>
                      <p className="handoff-full-msg">{h.message}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 기술 로그 탭 */}
          {activeTab === 'techlog' && (
            <div className="techlog-content">
              <div className="techlog-meta">
                <div className="techlog-row"><span>Run ID</span><span className="mono">{lastRun.id}</span></div>
                <div className="techlog-row"><span>시작 시각</span><span className="mono">{new Date(lastRun.startedAt).toLocaleString()}</span></div>
                {lastRun.completedAt && (
                  <div className="techlog-row"><span>완료 시각</span><span className="mono">{new Date(lastRun.completedAt).toLocaleString()}</span></div>
                )}
                <div className="techlog-row"><span>할당 업무</span><span>{lastRun.jobs.length}건</span></div>
                <div className="techlog-row"><span>처리 결과</span><span>{lastRun.results.length}건</span></div>
                <div className="techlog-row"><span>부서 간 전달</span><span>{lastRun.handoffs.length}건</span></div>
              </div>

              <div className="techlog-toggle-section">
                <button className="techlog-toggle" onClick={() => setTechExpanded(prev => !prev)}>
                  {techExpanded ? '▼' : '▶'} 상세 기술 로그 보기
                </button>
                {techExpanded && (
                  <div className="techlog-raw">
                    <div className="techlog-section-title">Jobs</div>
                    {lastRun.jobs.map(j => (
                      <div key={j.id} className="techlog-entry">
                        <span className={`techlog-status ${j.status}`}>[{j.status.toUpperCase()}]</span>
                        <span>{j.title}</span>
                        <span className="techlog-dept">({j.departmentId})</span>
                      </div>
                    ))}
                    <div className="techlog-section-title" style={{ marginTop: 10 }}>Results</div>
                    {lastRun.results.map(r => (
                      <div key={r.id} className="techlog-entry">
                        <span className={`techlog-status ${r.status}`}>[{r.status.toUpperCase()}]</span>
                        <span>{r.summary}</span>
                        <span className="techlog-dept">({r.departmentId})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Nested drilldown: 부서 처리 결과 / 승인 대기 */}
        {drilldown && (
          <MetricDrilldownModal
            isOpen={!!drilldown}
            onClose={() => setDrilldown(null)}
            departmentId={drilldown.deptId}
            departmentName={drilldown.deptName}
            metricType={drilldown.metricType}
            jobs={drilldown.deptId === '*' ? lastRun.jobs : lastRun.jobs.filter(j => j.departmentId === drilldown.deptId)}
            results={drilldown.deptId === '*' ? lastRun.results : lastRun.results.filter(r => r.departmentId === drilldown.deptId)}
            handoffs={drilldown.deptId === '*' ? lastRun.handoffs : lastRun.handoffs.filter(
              h => h.fromDepartmentId === drilldown.deptId || h.toDepartmentId === drilldown.deptId
            )}
            approvalItems={drilldown.deptId === '*'
              ? approvalItems
              : approvalItems.filter(a => a.requestedByAgentId.startsWith(drilldown.deptId))}
            onApprove={onApprove}
            onReject={onReject}
          />
        )}

        {/* Nested drilldown: 부서 간 전달 단건 */}
        {selectedHandoff && (
          <HandoffDetailModal
            isOpen={!!selectedHandoff}
            onClose={() => setSelectedHandoff(null)}
            handoff={selectedHandoff}
            relatedResults={lastRun.results.filter(
              r => r.departmentId === selectedHandoff.fromDepartmentId ||
                   r.departmentId === selectedHandoff.toDepartmentId
            )}
          />
        )}
      </div>
    </div>
  );
};
