import React from 'react';
import type { AgentJob, AgentResult, AgentHandoff } from '../engine/nativeAgentRuntime/types';
import type { ApprovalItem } from '../types/approval';
import { approvalActorDisplay, executorDisplayName } from '../services/taskLifecycleAppAdapter';
import './MetricDrilldownModal.css';

export type MetricType = 'in_progress' | 'completed' | 'handoff' | 'approval';

interface MetricDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentId: string;
  departmentName: string;
  metricType: MetricType;
  jobs: AgentJob[];
  results: AgentResult[];
  handoffs: AgentHandoff[];
  approvalItems: ApprovalItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

const METRIC_LABELS: Record<MetricType, { title: string; icon: string; color: string }> = {
  in_progress: { title: '진행 중 업무', icon: '⚡', color: '#f59e0b' },
  completed:   { title: '처리 완료 결과', icon: '✅', color: '#10b981' },
  handoff:     { title: '부서 간 전달', icon: '↔️', color: '#a5b4fc' },
  approval:    { title: '승인 대기 항목', icon: '🔑', color: '#f59e0b' },
};

const DEPT_LABEL: Record<string, string> = {
  product: '상품관리팀',
  cs: 'CS 운영팀',
  marketing: '마케팅팀',
  manager: '총괄 HQ',
};

export const MetricDrilldownModal: React.FC<MetricDrilldownModalProps> = ({
  isOpen,
  onClose,
  departmentId,
  departmentName,
  metricType,
  jobs,
  results,
  handoffs,
  approvalItems,
  onApprove,
  onReject,
}) => {
  // ESC 닫기
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const meta = METRIC_LABELS[metricType];

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'queued':       return '대기';
      case 'running':      return '진행 중';
      case 'completed':    return '완료';
      case 'blocked':      return '차단';
      case 'failed':       return '실패';
      case 'success':      return '완료';
      case 'needs_review': return '검토 필요';
      default: return status;
    }
  };

  return (
    <div className="metric-modal-overlay" onClick={onClose}>
      <div className="metric-modal" onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="metric-modal-header" style={{ borderBottomColor: `${meta.color}30` }}>
          <div className="metric-modal-title-group">
            <span className="metric-modal-dept">{departmentName}</span>
            <div className="metric-modal-title">
              <span className="metric-modal-icon">{meta.icon}</span>
              <h2 style={{ color: meta.color }}>{meta.title}</h2>
            </div>
          </div>
          <button className="metric-modal-close" onClick={onClose}>×</button>
        </div>

        {/* 본문 */}
        <div className="metric-modal-body">

          {/* 진행 중 업무 */}
          {metricType === 'in_progress' && (
            <div className="metric-item-list">
              {jobs.length === 0 ? (
                <div className="metric-empty">
                  <span>⚡</span>
                  <p>현재 진행 중인 업무가 없습니다.</p>
                </div>
              ) : jobs.map(job => (
                <div key={job.id} className={`metric-record-card job-card ${job.status}`}>
                  <div className="metric-record-header">
                    <span className={`metric-status-badge ${job.status}`}>{getStatusLabel(job.status)}</span>
                    <span className="metric-risk-tag">{job.riskLevel}</span>
                    <span className="metric-time">{new Date(job.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="metric-record-title">{job.title}</div>
                  <p className="metric-record-sub">{job.objective}</p>
                  {job.inputSummary && (
                    <p className="metric-record-input">{job.inputSummary}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 처리 완료 결과 */}
          {metricType === 'completed' && (
            <div className="metric-item-list">
              {results.length === 0 ? (
                <div className="metric-empty">
                  <span>✅</span>
                  <p>처리 완료된 결과가 없습니다.</p>
                </div>
              ) : results.map(res => (
                <div key={res.id} className={`metric-record-card result-card ${res.status}`}>
                  <div className="metric-record-header">
                    <span className={`metric-status-badge ${res.status}`}>{getStatusLabel(res.status)}</span>
                    {res.approvalRequired && <span className="metric-approval-tag">승인 필요</span>}
                    <span className="metric-time">{new Date(res.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="metric-record-title">{res.summary}</div>
                  {res.findings.length > 0 && (
                    <ul className="metric-findings">
                      {res.findings.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                  {res.recommendations.length > 0 && (
                    <div className="metric-recommendations">
                      <span className="metric-rec-label">권고사항:</span>
                      {res.recommendations.map((r, i) => (
                        <span key={i} className="metric-rec-item">{r}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 부서 간 전달 */}
          {metricType === 'handoff' && (
            <div className="metric-item-list">
              {handoffs.length === 0 ? (
                <div className="metric-empty">
                  <span>↔️</span>
                  <p>부서 간 전달 내역이 없습니다.</p>
                </div>
              ) : handoffs.map((h, i) => {
                const isOutgoing = h.fromDepartmentId === departmentId;
                return (
                  <div key={i} className={`metric-record-card handoff-card ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                    <div className="metric-record-header">
                      <span className={`direction-tag ${isOutgoing ? 'out' : 'in'}`}>
                        {isOutgoing ? '보낸 전달 ➔' : '받은 전달 ↵'}
                      </span>
                      <span className="handoff-route-tag">
                        {DEPT_LABEL[h.fromDepartmentId] ?? h.fromDepartmentId}
                        <span className="route-arrow"> → </span>
                        {DEPT_LABEL[h.toDepartmentId] ?? h.toDepartmentId}
                      </span>
                      <span className="metric-time">{new Date(h.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="metric-record-title">{h.title}</div>
                    <p className="metric-record-sub">{h.message}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* 승인 대기 항목 */}
          {metricType === 'approval' && (
            <div className="metric-item-list">
              {approvalItems.length === 0 ? (
                <div className="metric-empty">
                  <span>🔑</span>
                  <p>승인 대기 중인 항목이 없습니다.</p>
                </div>
              ) : approvalItems.map(item => (
                <div key={item.id} className="metric-record-card approval-card">
                  <div className="metric-record-header">
                    <span className="metric-approval-tag">승인 필요</span>
                    <span className={`metric-risk-tag risk-${item.riskLevel}`}>{item.riskLevel}</span>
                    <span className="metric-agent-tag">{approvalActorDisplay(item)?.name ?? executorDisplayName(item.requestedByAgentId)}</span>
                  </div>
                  <div className="metric-record-title">{item.title}</div>
                  <p className="metric-record-sub">{item.reason}</p>
                  {item.proposedAction && (
                    <div className="metric-proposed-action">
                      <span className="metric-pa-label">제안 내용:</span>
                      <p>{item.proposedAction.substring(0, 120)}{item.proposedAction.length > 120 ? '...' : ''}</p>
                    </div>
                  )}
                  {(onApprove || onReject) && (
                    <div className="metric-approval-actions">
                      {onReject && (
                        <button className="metric-reject-btn" onClick={() => { onReject(item.id); onClose(); }}>
                          거절
                        </button>
                      )}
                      {onApprove && (
                        <button className="metric-approve-btn" onClick={() => { onApprove(item.id); onClose(); }}>
                          승인
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
