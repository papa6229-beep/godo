// D-0 — 반복 AI 업무의 **현재 상태를 업무기록 장부에서 복원**하는 순수 계약.
//
// 배경: `AgentTaskPanel` 의 승인 대기·완료 상태가 React 메모리에만 있어 새로고침하면 사라졌다.
//   대표 업무에서는 이를 허용하지 않는다. 새 저장소를 만들지 않고, 이미 HQ 부서 관제 화면과
//   함께 쓰는 append-only `activityLedger` 를 상태 정본으로 삼는다.
//
// 이 모듈은 **읽기 전용 순수 함수**다. 저장·발신·권한 판정을 하지 않는다.

import type { ActivityEvent, ActivityDataProvenance } from '../types/activityLedger';
import type { TeamMessageActor } from '../types/teamMessage';

export type AgentTaskRunPhase =
  | 'idle'
  | 'awaiting_review'
  | 'completed'
  | 'rejected'
  | 'failed';

export interface AgentTaskRunState {
  phase: AgentTaskRunPhase;
  taskId: string;
  /** AI 가 만든(또는 사람이 수정한) 결과 본문. */
  resultBody?: string;
  /** 그 결과를 만든 자료의 출처. 화면이 다시 추측하지 않는다. */
  dataProvenance?: ActivityDataProvenance;
  /** 반려·중단 사유 한 문장. */
  decisionReason?: string;
  /** 마지막 상태변화를 만든 행위자(AI 계산 또는 사람 확인·반려). */
  actor?: TeamMessageActor;
  at?: string;
}

/** 반복 AI 업무의 장부 추적 키. `agentTaskRunner.lifecycleTaskId` 와 같은 값이어야 한다. */
export const agentTaskActivityId = (specId: string): string => `agenttask-${specId}`;

/**
 * 한 업무의 최신 상태를 계산한다.
 *
 * 판정 규칙
 *   - 같은 `taskId` 의 이벤트만 본다.
 *   - **입력 배열의 저장 순서를 보존**해 마지막 상태변화를 적용한다.
 *     같은 `at` 값이어도 **배열 뒤의 이벤트가 최신**이다(원장은 append-only 라 저장 순서가 곧 시간 순서다).
 *   - `task_run/pending`                        → `awaiting_review`
 *   - `task_run/done` · `approval/done`         → `completed`
 *   - `task_run/rejected` · `approval/rejected` → `rejected`
 *   - `task_run/failed`                         → `failed`
 *   - 결과 본문·출처·사유는 마지막 이벤트에 없으면 **같은 업무의 직전 값에서 이어받는다.**
 *   - 관련 이벤트가 없으면 `idle`.
 */
export function latestAgentTaskRunState(
  events: readonly ActivityEvent[],
  specId: string
): AgentTaskRunState {
  const taskId = agentTaskActivityId(specId);
  const state: AgentTaskRunState = { phase: 'idle', taskId };

  for (const e of events) {
    if (e.taskId !== taskId) continue;

    // 값은 상태변화 여부와 무관하게 이어받는다(마지막 이벤트에 없으면 직전 값 유지).
    if (e.resultBody !== undefined) state.resultBody = e.resultBody;
    if (e.dataProvenance !== undefined) state.dataProvenance = e.dataProvenance;
    if (e.decisionReason !== undefined) state.decisionReason = e.decisionReason;

    const phase = phaseOf(e);
    if (!phase) continue;
    state.phase = phase;
    state.actor = e.actor;
    state.at = e.at;
  }

  return state;
}

const phaseOf = (e: ActivityEvent): AgentTaskRunPhase | null => {
  if (e.type === 'task_run') {
    if (e.status === 'pending') return 'awaiting_review';
    if (e.status === 'done') return 'completed';
    if (e.status === 'rejected') return 'rejected';
    if (e.status === 'failed') return 'failed';
    return null;
  }
  if (e.type === 'approval') {
    if (e.status === 'done') return 'completed';
    if (e.status === 'rejected') return 'rejected';
    return null;
  }
  return null;
};
