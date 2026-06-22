import React from 'react';
import type { OperationTask, TaskStatus } from '../types/task';
import type { Agent } from '../types';
import './TaskListModal.css';

interface TaskListModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: OperationTask[];
  agents: Agent[];
  statuses: TaskStatus[];
  title: string;
  onSelectTask?: (task: OperationTask) => void;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '대기 중',
  assigned: '배정됨',
  running: '분석 중',
  completed: '확인 완료',
  needs_approval: '검토/승인 대기',
  failed: '실패',
};

export const TaskListModal: React.FC<TaskListModalProps> = ({
  isOpen,
  onClose,
  tasks,
  agents,
  statuses,
  title,
  onSelectTask,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = tasks.filter(t => statuses.includes(t.status));

  const getAgentInfo = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? { name: agent.name, emoji: agent.emoji } : { name: '알 수 없음', emoji: '⚙️' };
  };

  const handleSelect = (task: OperationTask) => {
    onSelectTask?.(task);
    onClose();
  };

  return (
    <div className="task-list-modal-overlay" onClick={onClose}>
      <div className="task-list-modal" onClick={e => e.stopPropagation()}>

        <div className="task-list-header">
          <div className="task-list-header-left">
            <span className="task-list-badge">오늘의 작업</span>
            <h2 className="task-list-title">{title}</h2>
            <span className="task-list-count">{filtered.length}건</span>
          </div>
          <button className="task-list-close-btn" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="task-list-body">
          {filtered.length === 0 ? (
            <div className="task-list-empty">
              <span className="task-list-empty-icon">📋</span>
              <p>해당 상태의 작업이 없습니다.</p>
              <p className="task-list-empty-hint">운영을 시작하거나 총괄 매니저에게 업무를 지시해 주세요.</p>
            </div>
          ) : (
            <div className="task-list-cards">
              {filtered.map(task => {
                const info = getAgentInfo(task.assignedAgentId);
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={`task-list-card status-${task.status}`}
                    onClick={() => handleSelect(task)}
                    title="작업 상세 보기"
                  >
                    <div className="task-list-card-top">
                      <span className="task-list-emoji">{info.emoji}</span>
                      <div className="task-list-card-main">
                        <div className="task-list-card-title-row">
                          <span className="task-list-card-title">{task.title}</span>
                          <span className={`task-list-status-badge status-${task.status}`}>
                            {STATUS_LABEL[task.status]}
                          </span>
                        </div>
                        <span className="task-list-card-agent">담당: {info.name}</span>
                      </div>
                    </div>
                    {task.description && (
                      <p className="task-list-card-desc">{task.description}</p>
                    )}
                    {task.resultSummary && (
                      <p className="task-list-card-result">{task.resultSummary}</p>
                    )}
                    <span className="task-list-card-hint">상세 보기 →</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
