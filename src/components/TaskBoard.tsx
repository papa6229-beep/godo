import React, { useState } from 'react';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import type { Agent } from '../types';
import './TaskBoard.css';

interface TaskBoardProps {
  tasks: OperationTask[];
  agents: Agent[];
  isSimulating: boolean;
  approvalQueue: ApprovalItem[];
  onStartSimulation: () => void;
  onAddTask: (title: string, agentId: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({
  tasks,
  agents,
  isSimulating,
  approvalQueue,
  onStartSimulation,
  onAddTask,
  onApprove,
  onReject
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || 'cs');

  const getAgentInfo = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent ? { name: agent.name, emoji: agent.emoji } : { name: '알 수 없음', emoji: '⚙️' };
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask(newTitle, selectedAgentId);
    setNewTitle('');
  };

  return (
    <div className="task-board-container">
      <div className="task-board">
        <div className="board-header">
          <div className="board-title-row">
            <h2 className="board-title">📋 TODAY'S TASKS ({tasks.length})</h2>
            <button
              className={`simulate-btn ${isSimulating ? 'running' : ''}`}
              onClick={onStartSimulation}
              disabled={isSimulating}
            >
              {isSimulating ? '🛰️ 운영 진행 중...' : '▶ 운영 시작 (Auto Run)'}
            </button>
          </div>
          <p className="board-subtitle">쇼핑몰 일일 자동화 프로세스 작업 목록입니다.</p>
        </div>

        <div className="tasks-list">
          {tasks.length === 0 ? (
            <div className="empty-tasks">작업이 존재하지 않습니다. 운영 시작 버튼을 눌러주십시오.</div>
          ) : (
            tasks.map((task) => {
              const agentInfo = getAgentInfo(task.assignedAgentId);
              return (
                <div key={task.id} className={`task-item ${task.status}`}>
                  <div className="task-main">
                    <span className="task-emoji">{agentInfo.emoji}</span>
                    <div className="task-info">
                      <div className="task-title-row">
                        <span className="task-title">{task.title}</span>
                        <div className="task-badges-row">
                          <span className={`badge-type route ${task.routeType}`}>
                            {task.routeType.toUpperCase()}
                          </span>
                          <span className={`badge-type perm ${task.permission}`}>
                            {task.permission.toUpperCase().replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <div className="task-agent-name" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                        <span>담당: {agentInfo.name.split(' ')[0]}</span>
                        {task.inputCount !== undefined && (
                          <span className="task-data-badge" style={{
                            fontSize: '0.6rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(45, 245, 162, 0.08)',
                            border: '1px solid rgba(45, 245, 162, 0.2)',
                            color: 'var(--accent-primary)'
                          }}>
                            DATA: {task.relatedDataType} {task.inputCount}건
                          </span>
                        )}
                        {task.dataSourceType && (
                          <span className="task-source-badge" style={{
                            fontSize: '0.6rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: 'var(--text-secondary)'
                          }}>
                            SOURCE: {task.dataSourceType.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {task.resultSummary && (
                        <div className="task-result-summary">📄 {task.resultSummary}</div>
                      )}
                    </div>
                  </div>
                  <div className="task-status-area">
                    <span className={`task-badge ${task.status}`}>
                      {task.status === 'pending' && '대기 중'}
                      {task.status === 'assigned' && '배정됨'}
                      {task.status === 'running' && '진행 중'}
                      {task.status === 'completed' && '완료'}
                      {task.status === 'needs_approval' && '승인 필요'}
                      {task.status === 'failed' && '실패'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="add-task-box">
          <h3 className="add-task-title">➕ 새 태스크 추가</h3>
          <form onSubmit={handleAddSubmit} className="add-task-form">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="추가할 일일 작업 제목을 입력하세요..."
              className="add-task-input"
            />
            <div className="add-task-meta">
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="agent-select"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.emoji} {agent.name.split(' ')[0]}
                  </option>
                ))}
              </select>
              <button type="submit" className="add-task-submit">
                ADD
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Approval Queue 패널 */}
      <div className="approval-queue-board">
        <div className="board-header">
          <h2 className="board-title">🔑 APPROVAL QUEUE ({approvalQueue.length})</h2>
          <p className="board-subtitle">운영자 개입(Human-in-the-loop) 및 의사결정이 요구되는 대기 작업입니다.</p>
        </div>
        <div className="approval-list">
          {approvalQueue.length === 0 ? (
            <div className="empty-approvals">
              <span>🛡️ 승인 대기 중인 고위험 작업이 없습니다.</span>
            </div>
          ) : (
            approvalQueue.map((item) => {
              const agentInfo = getAgentInfo(item.requestedByAgentId);
              return (
                <div key={item.id} className={`approval-item-card status-${item.status}`}>
                  <div className="approval-card-header">
                    <span className="approval-agent">
                      {agentInfo.emoji} {agentInfo.name.split(' ')[0]}
                    </span>
                    <span className={`risk-badge ${item.riskLevel}`}>
                      {item.riskLevel.toUpperCase()} RISK
                    </span>
                  </div>
                  <h4 className="approval-card-title">{item.title}</h4>
                  <p className="approval-card-reason">💡 <strong>사유:</strong> {item.reason}</p>
                  <p className="approval-card-proposal">📝 <strong>제안 액션:</strong> {item.proposedAction}</p>
                  
                  <div className="approval-card-actions">
                    {item.status === 'waiting' ? (
                      <>
                        <button 
                          className="appr-btn approve" 
                          onClick={() => onApprove(item.id)}
                        >
                          승인 (Approve)
                        </button>
                        <button 
                          className="appr-btn reject" 
                          onClick={() => onReject(item.id)}
                        >
                          거절 (Reject)
                        </button>
                      </>
                    ) : (
                      <span className={`approval-result-status ${item.status}`}>
                        {item.status === 'approved' ? '✓ 승인 완료' : '✗ 거절 처리됨'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
