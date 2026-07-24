import React, { useState } from 'react';
import type { OperationTask, TaskStatus } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import type { Agent } from '../types';
import { TaskListModal } from './TaskListModal';
import { ApprovalListModal } from './ApprovalListModal';
import './TaskBoard.css';
import { UNKNOWN_AFFILIATION_LABEL, approvalActorDisplay } from '../services/taskLifecycleAppAdapter';
import { isSameAgent, toCanonicalAgentId } from '../services/agentIdRegistry';
import { defaultNativeAgents } from '../data/defaultNativeAgentRuntime';
import { VIEWER_ROLES } from '../services/sessionRole';

// 업무를 받을 팀(총괄 자신은 지시 대상이 아니다).
const TARGET_TEAMS = VIEWER_ROLES.filter((r) => r.id !== 'hq');

interface TaskBoardProps {
  tasks: OperationTask[];
  agents: Agent[];
  isSimulating: boolean;
  approvalQueue: ApprovalItem[];
  onStartSimulation: () => void;
  /** RC-2 D-1.2: 업무는 **팀에게** 보낸다. 두 번째 인자는 팀 id(수행 방식은 담당 팀장이 고른다). */
  onAddTask: (title: string, targetTeamId: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSelectTask?: (task: OperationTask) => void;
  onSelectApproval?: (item: ApprovalItem) => void;
  hideAddTask?: boolean;
}

interface StatusGroup {
  key: string;
  label: string;
  statuses: TaskStatus[];
  tone: 'idle' | 'running' | 'review' | 'done' | 'failed';
}

const STATUS_GROUPS: StatusGroup[] = [
  { key: 'waiting', label: '대기', statuses: ['pending', 'assigned'], tone: 'idle' },
  { key: 'running', label: '진행 중', statuses: ['running'], tone: 'running' },
  { key: 'review', label: '검토 필요', statuses: ['needs_approval'], tone: 'review' },
  { key: 'completed', label: '완료', statuses: ['completed'], tone: 'done' },
];

export const TaskBoard: React.FC<TaskBoardProps> = ({
  tasks,
  agents,
  isSimulating,
  approvalQueue,
  onStartSimulation,
  onAddTask,
  onApprove,
  onReject,
  onSelectTask,
  onSelectApproval,
  hideAddTask = false
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(TARGET_TEAMS[0].id);
  const [listFilter, setListFilter] = useState<{ title: string; statuses: TaskStatus[] } | null>(null);
  const [approvalListFilter, setApprovalListFilter] = useState<{
    title: string;
    statuses?: ApprovalItem['status'][];
  } | null>(null);

  // 우측 hideAddTask 변수는 onStartSimulation 동일 핸들러 단일화 정책에 따라 별도 사용 안 함
  void onStartSimulation;
  void isSimulating;

  const statusCounts = STATUS_GROUPS.map(g => ({
    ...g,
    count: tasks.filter(t => g.statuses.includes(t.status)).length,
  }));

  const approvalCounts = {
    waiting: approvalQueue.filter(a => a.status === 'waiting').length,
    approved: approvalQueue.filter(a => a.status === 'approved').length,
    rejected: approvalQueue.filter(a => a.status === 'rejected').length,
    total: approvalQueue.length,
  };

  const getAgentInfo = (agentId: string) => {
    // RC-2 D-1.3: 정본은 canonical id, 화면 캐릭터 목록은 legacy id 다.
    //   별칭표(isSameAgent)를 거쳐 찾는다 — 정확 일치로만 찾으면 알려진 AI 도 미상으로 보인다.
    const agent = agents.find((a) => isSameAgent(a.id, agentId));
    if (agent) return { name: agent.name, emoji: agent.emoji };
    // 런타임 정의에 있는 AI 는 그 표시명을 쓴다(내부 id 를 그대로 노출하지 않는다).
    const known = defaultNativeAgents.find((a) => a.id === toCanonicalAgentId(agentId));
    if (known) return { name: known.name, emoji: '🤖' };
    return agentId ? { name: UNKNOWN_AFFILIATION_LABEL, emoji: '❓' } : { name: '수행자 미정', emoji: '🕓' };
  };

  const getPermissionLabel = (perm: string) => {
    switch (perm?.toLowerCase()) {
      case 'draft_only': return '초안만 생성';
      case 'approval_required': return '승인 필요';
      case 'auto': return '자동 확인 완료';
      case 'manual_only': return '사람 확인 필요';
      default: return perm;
    }
  };

  const getRouteLabel = (route: string) => {
    switch (route?.toLowerCase()) {
      case 'local': return '내부 AI 처리';
      case 'hybrid': return '고급 AI 도움';
      case 'human': return '사람 확인 필요';
      default: return route;
    }
  };

  const getTaskOperatorMessage = (task: OperationTask) => {
    const agentId = task.assignedAgentId;
    const count = task.inputCount || 0;
    
    if (agentId === 'cs') {
      return {
        desc: `답변이 필요한 문의 ${count > 0 ? `${count}건` : '들'}을 분석했습니다. 고객 불편 방지를 위해 AI가 정중한 답변 초안을 생성했습니다.`,
        action: '✍️ 초안 확인 및 수정하기'
      };
    } else if (agentId === 'review') {
      return {
        desc: `저평점 부정 리뷰 등 답변이 필요한 고객 피드백을 감지하고 AI 답글 초안을 만들었습니다.`,
        action: '⭐ 리뷰 및 답글 확인하기'
      };
    } else if (task.title.includes('배송') || task.title.includes('송장')) {
      return {
        desc: `송장이 등록되지 않았거나 영업일 3일 이상 배송이 지연되고 있는 의심 주문을 감지했습니다.`,
        action: '🚚 주문 및 배송 정보 확인'
      };
    } else if (agentId === 'order') {
      return {
        desc: `신규로 접수된 주문 정보 ${count > 0 ? `${count}건` : '들'}을 로드하고, 결제 및 입금 대기 상태를 검증했습니다.`,
        action: '📋 주문 목록 확인하기'
      };
    } else if (agentId === 'stock' || task.title.includes('재고') || task.title.includes('품절')) {
      return {
        desc: `안전재고 수량보다 현재고가 적어 품절 위험이 있는 품목을 확인했습니다. 발주 여부 검토가 권장됩니다.`,
        action: '⚠️ 재고 및 발주 검토'
      };
    } else if (agentId === 'marketing') {
      return {
        desc: `재구매 유도 및 매출 증대를 위해 특정 구매 이력 고객을 타겟으로 한 할인 쿠폰 발행 캠페인을 기획 제안합니다.`,
        action: '💡 캠페인 제안 확인'
      };
    } else if (agentId === 'finance' || task.title.includes('매출')) {
      return {
        desc: `금일의 실시간 매출 집계, 주문 결제 건수 및 광고 클릭 전환율 현황을 종합 요약 분석했습니다.`,
        action: '📊 일일 매출 대시보드 조회'
      };
    }
    
    return {
      desc: task.description || '오늘의 일일 쇼핑몰 운영 작업입니다.',
      action: '🔍 상세 작업 결과 확인'
    };
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask(newTitle, selectedTeamId);
    setNewTitle('');
  };

  return (
    <div className="task-board-container">
      <div className="task-board">
        <div className="board-header">
          <div className="board-title-row">
            <h2 className="board-title">📋 오늘의 할 일</h2>
          </div>
          <p className="board-subtitle">상단 START OPERATION을 누르거나, 총괄 매니저에게 업무를 지시해 주세요.</p>

          {/* 상태 요약 칩 — 클릭 시 해당 상태만 TaskListModal로 표시 */}
          <div className="task-status-summary">
            {statusCounts.map(g => (
              <button
                key={g.key}
                type="button"
                className={`status-chip tone-${g.tone} ${g.count > 0 ? '' : 'zero'}`}
                onClick={() => g.count > 0 && setListFilter({ title: `${g.label} 작업`, statuses: g.statuses })}
                disabled={g.count === 0}
                title={`${g.label} 상태의 작업 ${g.count}건 보기`}
              >
                <span className="status-chip-num">{g.count}</span>
                <span className="status-chip-lbl">{g.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="tasks-list">
          {tasks.length === 0 ? (
            <div className="empty-tasks">
              <p>아직 등록된 오늘의 작업이 없습니다.</p>
              <p style={{ marginTop: '6px', fontSize: '0.75rem', opacity: 0.7 }}>운영 시작을 누르거나, 총괄 매니저에게 업무를 지시해 주세요.</p>
            </div>
          ) : (
            tasks.map((task) => {
              const agentInfo = getAgentInfo(task.assignedAgentId);
              const opMessage = getTaskOperatorMessage(task);
              return (
                <div
                  key={task.id}
                  className={`task-item ${task.status}`}
                  onClick={() => onSelectTask?.(task)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="task-main">
                    <span className="task-emoji">{agentInfo.emoji}</span>
                    <div className="task-info">
                      <div className="task-title-row">
                        <span className="task-title" style={{ fontSize: '0.92rem', fontWeight: 650 }}>{task.title}</span>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                          <span className={`task-badge ${task.status}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                            {task.status === 'pending' && '대기 중'}
                            {task.status === 'assigned' && '배정됨'}
                            {task.status === 'running' && '분석 중'}
                            {task.status === 'completed' && '확인 완료'}
                            {task.status === 'needs_approval' && '검토/승인 대기'}
                            {task.status === 'failed' && '실패'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="task-agent-name" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '3px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>담당 AI: {agentInfo.name}</span>
                      </div>

                      {/* 운영자용 직관적인 상세 대상 요약 정보 노출 */}
                      <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.85)', lineHeight: '1.4' }}>
                        {opMessage.desc}
                      </div>

                      {/* 행동 유도 버튼 */}
                      {task.status !== 'pending' && task.status !== 'running' && (
                        <div style={{ 
                          marginTop: '10px', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          fontSize: '0.75rem', 
                          color: task.status === 'needs_approval' ? '#f59e0b' : 'var(--accent-primary)',
                          fontWeight: 600,
                          backgroundColor: task.status === 'needs_approval' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(45, 245, 162, 0.05)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: task.status === 'needs_approval' ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(45, 245, 162, 0.15)'
                        }}>
                          {opMessage.action}
                        </div>
                      )}

                      {/* 은은한 기술 뱃지 */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '10px', fontSize: '0.62rem', opacity: 0.6 }}>
                        <span style={{ padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>
                          {getRouteLabel(task.routeType)}
                        </span>
                        <span style={{ padding: '1px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>
                          {getPermissionLabel(task.permission)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!hideAddTask && (
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
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="agent-select"
                >
                  {TARGET_TEAMS.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.emoji} {team.short}
                    </option>
                  ))}
                </select>
                <button type="submit" className="add-task-submit">
                  ADD
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Approval Queue 패널 */}
      <div className="approval-queue-board">
        <div className="board-header">
          <h2 className="board-title">🔑 승인 대기</h2>
          <p className="board-subtitle">고객 답변, 상품 수정, 캠페인 실행처럼 최종 확인이 필요한 업무들입니다.</p>

          {/* 승인 상태 요약 칩 — 클릭 시 ApprovalListModal */}
          <div className="approval-status-summary">
            <button
              type="button"
              className={`status-chip tone-review ${approvalCounts.waiting > 0 ? '' : 'zero'}`}
              onClick={() => approvalCounts.waiting > 0 && setApprovalListFilter({
                title: '승인 대기 항목',
                statuses: ['waiting'],
              })}
              disabled={approvalCounts.waiting === 0}
              title={`승인 대기 ${approvalCounts.waiting}건 보기`}
            >
              <span className="status-chip-num">{approvalCounts.waiting}</span>
              <span className="status-chip-lbl">대기</span>
            </button>
            <button
              type="button"
              className={`status-chip tone-done ${approvalCounts.approved > 0 ? '' : 'zero'}`}
              onClick={() => approvalCounts.approved > 0 && setApprovalListFilter({
                title: '승인 완료 이력',
                statuses: ['approved'],
              })}
              disabled={approvalCounts.approved === 0}
              title={`승인 완료 ${approvalCounts.approved}건 보기`}
            >
              <span className="status-chip-num">{approvalCounts.approved}</span>
              <span className="status-chip-lbl">승인</span>
            </button>
            <button
              type="button"
              className={`status-chip tone-failed ${approvalCounts.rejected > 0 ? '' : 'zero'}`}
              onClick={() => approvalCounts.rejected > 0 && setApprovalListFilter({
                title: '거절 처리 이력',
                statuses: ['rejected'],
              })}
              disabled={approvalCounts.rejected === 0}
              title={`거절 ${approvalCounts.rejected}건 보기`}
            >
              <span className="status-chip-num">{approvalCounts.rejected}</span>
              <span className="status-chip-lbl">거절</span>
            </button>
            {approvalCounts.total > 0 && (
              <button
                type="button"
                className="status-chip tone-idle view-all-chip"
                onClick={() => setApprovalListFilter({
                  title: '전체 승인 이력',
                })}
                title={`전체 ${approvalCounts.total}건 보기`}
              >
                <span className="status-chip-lbl">전체 보기 →</span>
              </button>
            )}
          </div>
        </div>
        <div className="approval-list">
          {approvalQueue.length === 0 ? (
            <div className="empty-approvals">
              <p>승인 대기 중인 항목이 없습니다.</p>
              <p style={{ marginTop: '6px', fontSize: '0.72rem', opacity: 0.65 }}>고객 답변, 상품 수정, 캠페인 실행처럼 최종 확인이 필요한 작업이 생기면 이곳에 표시됩니다.</p>
            </div>
          ) : (
            approvalQueue.map((item) => {
              // RC-2 D-1.3.3.2: 확인요청·인간 제출자는 공통 표시 함수로, AI 는 캐릭터 명단으로.
              const agentInfo = approvalActorDisplay(item) ?? getAgentInfo(item.requestedByAgentId);
              return (
                <div key={item.id} className={`approval-item-card status-${item.status}`}>
                  <div className="approval-card-header">
                    <span className="approval-agent">
                      {agentInfo.emoji} {agentInfo.name}
                    </span>
                    <span className={`risk-badge ${item.riskLevel}`}>
                      {item.riskLevel.toUpperCase()} RISK
                    </span>
                  </div>
                  <h4 className="approval-card-title">{item.title}</h4>
                  <p className="approval-card-reason">💡 <strong>검토 사유:</strong> {item.reason}</p>
                  
                  {/* proposta 요약 출력 */}
                  <p className="approval-card-proposal" style={{ 
                    maxHeight: '60px', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    display: '-webkit-box', 
                    WebkitLineClamp: 2, 
                    WebkitBoxOrient: 'vertical',
                    fontSize: '0.78rem'
                  }}>
                    📝 <strong>요약 제안:</strong> {item.proposedAction.split('\n')[0]}
                  </p>
                  
                  <div className="approval-card-actions">
                    <button 
                      className="appr-btn detail" 
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectApproval?.(item);
                      }}
                      style={{ 
                        marginRight: 'auto', 
                        background: 'rgba(255, 255, 255, 0.08)', 
                        border: '1px solid rgba(255, 255, 255, 0.15)', 
                        color: 'var(--text-primary)',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      🔍 승인안 대조하기
                    </button>
                    {item.status === 'waiting' ? (
                      <>
                        <button 
                          className="appr-btn approve" 
                          onClick={(e) => {
                            e.stopPropagation();
                            onApprove(item.id);
                          }}
                        >
                          승인 (Approve)
                        </button>
                        <button 
                          className="appr-btn reject" 
                          onClick={(e) => {
                            e.stopPropagation();
                            onReject(item.id);
                          }}
                        >
                          이번 결과 사용 안 함
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

      {/* 상태별 작업 목록 모달 */}
      {listFilter && (
        <TaskListModal
          isOpen={!!listFilter}
          onClose={() => setListFilter(null)}
          tasks={tasks}
          agents={agents}
          statuses={listFilter.statuses}
          title={listFilter.title}
          onSelectTask={onSelectTask}
        />
      )}

      {/* 승인 대기 목록 모달 */}
      {approvalListFilter && (
        <ApprovalListModal
          isOpen={!!approvalListFilter}
          onClose={() => setApprovalListFilter(null)}
          items={approvalQueue}
          agents={agents}
          statuses={approvalListFilter.statuses}
          title={approvalListFilter.title}
          onSelectApproval={onSelectApproval}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}
    </div>
  );
};
