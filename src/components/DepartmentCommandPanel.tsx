import React, { useState } from 'react';
import type { DepartmentDefinition, NativeAgentDefinition, AgentJob, AgentResult, AgentHandoff } from '../engine/nativeAgentRuntime/types';
import './DepartmentCommandPanel.css';

interface DepartmentCommandPanelProps {
  isOpen: boolean;
  onClose: () => void;
  department: DepartmentDefinition;
  agents: NativeAgentDefinition[];
  lastRunJobs: AgentJob[];
  lastRunResults: AgentResult[];
  lastRunHandoffs: AgentHandoff[];
  onAddManualCommand: (deptId: string, commandText: string) => void;
  onAddFileMetadata: (deptId: string, file: { name: string; size: number; type: string }) => void;
  uploadedFiles: { name: string; size: number; type: string; timestamp: string }[];
  manualCommands: { text: string; timestamp: string }[];
}

type ActiveTab = 'jobs' | 'results' | 'handoffs' | 'files' | 'command';

const TAB_LABELS: { key: ActiveTab; label: string }[] = [
  { key: 'jobs',    label: '할당 업무' },
  { key: 'results', label: '처리 결과' },
  { key: 'handoffs',label: '부서 간 전달' },
  { key: 'files',   label: '자료 전달' },
  { key: 'command', label: '업무 지시' },
];

const DEPT_ICONS: Record<string, string> = {
  product: '📦',
  cs: '💬',
  marketing: '📢',
  manager: '👑',
};

export const DepartmentCommandPanel: React.FC<DepartmentCommandPanelProps> = ({
  isOpen,
  onClose,
  department,
  agents,
  lastRunJobs,
  lastRunResults,
  lastRunHandoffs,
  onAddManualCommand,
  onAddFileMetadata,
  uploadedFiles,
  manualCommands,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('jobs');
  const [commandText, setCommandText] = useState('');
  const [fileInputKey, setFileInputKey] = useState(() => Date.now());

  if (!isOpen) return null;

  const deptAgents = agents.filter(a => a.departmentId === department.id);
  const leadAgent = deptAgents.find(a => a.role === 'team_lead' || a.role === 'manager');
  const memberAgents = deptAgents.filter(a => a.role === 'team_member');

  const deptJobs     = lastRunJobs.filter(j => j.departmentId === department.id);
  const deptResults  = lastRunResults.filter(r => r.departmentId === department.id);
  const deptHandoffs = lastRunHandoffs.filter(
    h => h.fromDepartmentId === department.id || h.toDepartmentId === department.id
  );

  const deptIcon = DEPT_ICONS[department.id] ?? '🏢';

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandText.trim()) return;
    onAddManualCommand(department.id, commandText.trim());
    setCommandText('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onAddFileMetadata(department.id, { name: file.name, size: file.size, type: file.type || 'unknown' });
      setFileInputKey(Date.now());
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'success':      return '완료';
      case 'completed':    return '완료';
      case 'running':      return '진행 중';
      case 'pending':      return '대기';
      case 'queued':       return '대기';
      case 'needs_review': return '검토 필요';
      case 'blocked':      return '차단';
      case 'failed':       return '실패';
      default: return status;
    }
  };

  return (
    <div className="workspace-modal-overlay" onClick={onClose}>
      <div className="workspace-modal" onClick={e => e.stopPropagation()}>

        {/* 모달 헤더 */}
        <div className="workspace-header">
          <div className="workspace-back" onClick={onClose}>
            ← 오늘의 운영으로 돌아가기
          </div>
          <div className="workspace-title-group">
            <span className="workspace-dept-icon">{deptIcon}</span>
            <div>
              <div className="workspace-dept-label">부서 작업실</div>
              <h2 className="workspace-dept-name">{department.name}</h2>
            </div>
          </div>
          <button className="workspace-close-btn" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {/* 모달 본문: 좌측 info + 우측 탭 */}
        <div className="workspace-body">

          {/* 좌측 패널 */}
          <aside className="workspace-sidebar">
            {/* 팀장 정보 */}
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">팀장 AI</h3>
              {leadAgent ? (
                <div className="sidebar-lead-card">
                  <div className="sidebar-lead-avatar">👑</div>
                  <div className="sidebar-lead-info">
                    <span className="sidebar-lead-name">{leadAgent.name}</span>
                    <span className="sidebar-lead-title">{leadAgent.title}</span>
                    <p className="sidebar-lead-desc">{leadAgent.description}</p>
                    <div className="sidebar-skills">
                      {leadAgent.skills.slice(0, 4).map((s, i) => (
                        <span key={i} className="skill-tag">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="sidebar-empty">팀장 AI 없음</p>
              )}
            </div>

            {/* 팀원 목록 */}
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">팀원 AI ({memberAgents.length}명)</h3>
              <div className="sidebar-members">
                {memberAgents.map(m => (
                  <div key={m.id} className={`sidebar-member ${m.enabled ? 'active' : 'inactive'}`}>
                    <div className="member-row-top">
                      <span className="member-nm">{m.name}</span>
                      <span className={`member-badge ${m.enabled ? 'on' : 'off'}`}>
                        {m.enabled ? '활성' : '비활성'}
                      </span>
                    </div>
                    <span className="member-title-txt">{m.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 부서 지표 */}
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">부서 지표</h3>
              <div className="sidebar-metrics">
                <div className="metric-row">
                  <span className="metric-lbl">할당 업무</span>
                  <span className="metric-val">{deptJobs.length}건</span>
                </div>
                <div className="metric-row">
                  <span className="metric-lbl">처리 결과</span>
                  <span className="metric-val">{deptResults.length}건</span>
                </div>
                <div className="metric-row">
                  <span className="metric-lbl">부서 간 전달</span>
                  <span className="metric-val">{deptHandoffs.length}건</span>
                </div>
                <div className="metric-row">
                  <span className="metric-lbl">승인 대기</span>
                  <span className={`metric-val ${deptResults.filter(r => r.approvalRequired).length > 0 ? 'alert' : ''}`}>
                    {deptResults.filter(r => r.approvalRequired).length}건
                  </span>
                </div>
              </div>
            </div>

            <div className="sidebar-dept-desc">
              <p>{department.description}</p>
            </div>
          </aside>

          {/* 우측 탭 영역 */}
          <div className="workspace-main">
            <div className="workspace-tabs">
              {TAB_LABELS.map(t => (
                <button
                  key={t.key}
                  className={`workspace-tab-btn ${activeTab === t.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="workspace-tab-content">

              {/* 할당 업무 탭 */}
              {activeTab === 'jobs' && (
                <div className="tab-panel">
                  {deptJobs.length === 0 ? (
                    <div className="tab-empty">
                      <span className="tab-empty-icon">📋</span>
                      <p>최근 할당된 업무가 없습니다.<br/>운영을 시작하면 이 부서의 업무가 표시됩니다.</p>
                    </div>
                  ) : (
                    <div className="record-list">
                      {deptJobs.map(job => (
                        <div key={job.id} className={`record-card ${job.status}`}>
                          <div className="record-card-header">
                            <span className={`record-status-badge ${job.status}`}>{getStatusLabel(job.status)}</span>
                            <span className="record-risk">{job.riskLevel}</span>
                            <span className="record-time">{new Date(job.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="record-title">{job.title}</div>
                          <p className="record-sub">{job.objective}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 처리 결과 탭 */}
              {activeTab === 'results' && (
                <div className="tab-panel">
                  {deptResults.length === 0 ? (
                    <div className="tab-empty">
                      <span className="tab-empty-icon">📊</span>
                      <p>아직 처리 결과가 없습니다.<br/>운영 시작 후 이 부서의 분석 결과가 여기 표시됩니다.</p>
                    </div>
                  ) : (
                    <div className="record-list">
                      {deptResults.map(res => (
                        <div key={res.id} className={`record-card ${res.status}`}>
                          <div className="record-card-header">
                            <span className={`record-status-badge ${res.status}`}>{getStatusLabel(res.status)}</span>
                            {res.approvalRequired && <span className="approval-tag">승인 대기</span>}
                            <span className="record-time">{new Date(res.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="record-title">{res.summary}</div>
                          <ul className="findings-list">
                            {res.findings.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 부서 간 전달 탭 */}
              {activeTab === 'handoffs' && (
                <div className="tab-panel">
                  {deptHandoffs.length === 0 ? (
                    <div className="tab-empty">
                      <span className="tab-empty-icon">↔️</span>
                      <p>부서 간 전달 내역이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="record-list">
                      {deptHandoffs.map((h, i) => {
                        const isOutgoing = h.fromDepartmentId === department.id;
                        return (
                          <div key={i} className={`handoff-card ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                            <div className="handoff-card-header">
                              <span className={`direction-badge ${isOutgoing ? 'out' : 'in'}`}>
                                {isOutgoing ? '보낸 전달 ➔' : '받은 전달 ↵'}
                              </span>
                              <span className="handoff-route">
                                {h.fromDepartmentId.toUpperCase()} → {h.toDepartmentId.toUpperCase()}
                              </span>
                              <span className="record-time">{new Date(h.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <div className="record-title">{h.title}</div>
                            <p className="record-sub">{h.message}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 자료 전달 탭 */}
              {activeTab === 'files' && (
                <div className="tab-panel">
                  <div className="file-upload-area">
                    <div className="file-upload-desc">
                      <h4>자료 첨부</h4>
                      <p>엑셀, CSV, PDF, 텍스트, 이미지 파일을 이 부서에 전달할 수 있습니다.</p>
                      <p className="file-notice">※ 첨부 파일은 업무 참고용으로만 기록되며, 원문은 외부 AI로 전송하지 않습니다.</p>
                    </div>
                    <label htmlFor={`dept-file-input-${department.id}`} className="file-upload-btn">
                      📁 파일 선택
                    </label>
                    <input
                      id={`dept-file-input-${department.id}`}
                      key={fileInputKey}
                      type="file"
                      accept=".csv,.xlsx,.xls,.txt,.pdf,.jpg,.png"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </div>
                  {uploadedFiles.length > 0 && (
                    <div className="file-list-section">
                      <h4>전달 완료된 자료 ({uploadedFiles.length}건)</h4>
                      <div className="file-list">
                        {uploadedFiles.map((file, i) => (
                          <div key={i} className="file-item-row">
                            <span className="file-icon-char">📄</span>
                            <div className="file-info">
                              <span className="file-nm">{file.name}</span>
                              <span className="file-meta">{formatFileSize(file.size)} · {file.type || '알 수 없음'}</span>
                            </div>
                            <span className="file-time">{new Date(file.timestamp).toLocaleTimeString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 업무 지시 탭 */}
              {activeTab === 'command' && (
                <div className="tab-panel">
                  <div className="command-area">
                    <h4 className="command-title">운영자 직속 업무 지시</h4>
                    <p className="command-desc">이 부서 팀장 AI에게 직접 업무를 지시합니다. 지시 내용은 운영 기록에 저장됩니다.</p>
                    <form onSubmit={handleSendCommand} className="command-form">
                      <textarea
                        placeholder={`예: ${department.id === 'product' ? '이 상품들의 재고 위험을 확인하고 마케팅팀에 전달해줘.' : department.id === 'cs' ? '미답변 문의 중 긴급 민원을 먼저 처리해줘.' : '이번 달 캠페인 후보 상품 목록을 정리해줘.'}`}
                        value={commandText}
                        onChange={e => setCommandText(e.target.value)}
                        className="command-textarea"
                        rows={4}
                      />
                      <button type="submit" className="command-submit" disabled={!commandText.trim()}>
                        업무 지시 전달
                      </button>
                    </form>
                    {manualCommands.length > 0 && (
                      <div className="command-history">
                        <h4 className="command-history-title">최근 지시 이력 ({manualCommands.length}건)</h4>
                        <div className="command-history-list">
                          {manualCommands.map((cmd, i) => (
                            <div key={i} className="command-history-item">
                              <span className="cmd-time">{new Date(cmd.timestamp).toLocaleTimeString()}</span>
                              <p className="cmd-text">"{cmd.text}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
