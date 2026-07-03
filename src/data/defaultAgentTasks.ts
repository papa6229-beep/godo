// 팀 AI 에이전트 기본 자동 업무 스펙(선언형).
// 계산 로직 없음 — 어느 팀이 무엇에 초점을 두고 누구에게 언제 보고할지만 선언.
// 팀장(총괄)이 각 팀의 일일 점검 보고를 한곳(총괄팀 요청함)에서 받아보는 구조.

import type { AgentTaskSpec } from '../types/agentTask';

export const DEFAULT_AGENT_TASKS: AgentTaskSpec[] = [
  {
    id: 'task-product-daily',
    teamId: 'product',
    agentId: 'product-lead',
    agentLabel: '상품 관리 AI',
    title: '재고·매출 일일 점검',
    focus: 'inventory',
    reportTo: 'hq',
    reportKind: 'info',
    schedule: { kind: 'daily', at: '09:00' },
    approvalMode: 'approval'
  },
  {
    id: 'task-marketing-daily',
    teamId: 'marketing',
    agentId: 'marketing-lead',
    agentLabel: '마케팅 기획 AI',
    title: '매출 요약 리포트',
    focus: 'sales',
    reportTo: 'hq',
    reportKind: 'info',
    schedule: { kind: 'daily', at: '09:30' },
    approvalMode: 'auto'
  },
  {
    id: 'task-cs-daily',
    teamId: 'cs',
    agentId: 'cs-lead',
    agentLabel: 'CS 상담 AI',
    title: '문의·리뷰 데스크 점검',
    focus: 'cs',
    reportTo: 'hq',
    reportKind: 'info',
    schedule: { kind: 'daily', at: '09:00' },
    approvalMode: 'draft'
  }
];

// (편의) 스펙 배열에서 팀별 필터 — 스토어/기본 모두에 사용.
export const agentTasksForTeam = (list: AgentTaskSpec[], teamId: string): AgentTaskSpec[] =>
  list.filter((t) => t.teamId === teamId);
