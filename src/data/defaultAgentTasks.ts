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
    // D-0/D-010: **팀 내부 일상 점검**이다. `reportTo === teamId` = 팀 내부 기록.
    //   HQ 요청함·HQ 승인대기·팀 간 메시지를 만들지 않는다. HQ 는 부서 업무 확인 화면에서 열람한다.
    //   (HQ 가 지시한 업무와 팀장이 명시적으로 보낸 보고는 기존 경로로 HQ 에 도착한다.)
    reportTo: 'product',
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
    // D-0/D-010: **마케팅팀 내부 일상 요약**이다(`reportTo === teamId` = 팀 내부 기록).
    //   HQ 요청함·HQ 승인대기를 만들지 않는다 — HQ 는 부서 업무 확인 화면에서 열람한다.
    reportTo: 'marketing',
    reportKind: 'info',
    // ⚠️ `매일 09:30` 은 **업무 설정값(표시)** 이다. 실제 시각 자동 스케줄러는 **미연결**이다
    //    (`runScheduledAgentTask` 제품 호출자 0건 — E 단계). 지금은 팀장이 직접 실행한다.
    schedule: { kind: 'daily', at: '09:30' },
    // Codex A안 판정: 'auto' 로 두면 **승인된 standing 이 없어**
    //   `canRunStandingDirective(undefined)` 가 `requiresLeadConfirmation:true` 를 돌려주므로
    //   (`standingDirectiveContract.ts:63-71`) 수동 실행이 즉시 완료되지 않는다.
    //   승인받은 적 없는 `standing.approvedByLeadAt` 을 지어내지 않고, 공통 안전 경계
    //   (runManualAgentTask·runScheduledAgentTask·standingDirectiveContract)도 바꾸지 않는다.
    //   대신 상품·CS 와 같은 흐름으로 **팀장이 확인해 팀 내부에서 마감**한다.
    approvalMode: 'approval'
  },
  {
    id: 'task-cs-daily',
    teamId: 'cs',
    agentId: 'cs-lead',
    agentLabel: 'CS 상담 AI',
    title: '문의·리뷰 데스크 점검',
    focus: 'cs',
    // D-0/D-010: **CS팀 내부 일상 점검**이다(`reportTo === teamId` = 팀 내부 기록).
    //   CS 상담 AI 가 초안을 만들고 CS팀장이 확인·수정해 팀 안에서 마감한다.
    //   HQ 요청함·HQ 승인대기를 만들지 않는다 — HQ 는 부서 업무 확인 화면에서 열람한다.
    //   HQ 가 지시한 업무와 팀장이 명시적으로 보내는 보고는 기존 경로로 HQ 에 도착한다.
    reportTo: 'cs',
    reportKind: 'info',
    schedule: { kind: 'daily', at: '09:00' },
    approvalMode: 'draft'
  }
];

// (편의) 스펙 배열에서 팀별 필터 — 스토어/기본 모두에 사용.
export const agentTasksForTeam = (list: AgentTaskSpec[], teamId: string): AgentTaskSpec[] =>
  list.filter((t) => t.teamId === teamId);
