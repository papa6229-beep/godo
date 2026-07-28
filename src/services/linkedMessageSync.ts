// src/services/linkedMessageSync.ts
// B-use-5 — lifecycle 업무 상태 ↔ **원본 팀 메시지** 상태 연결.
//
// 배경(사용자가 실제 화면에서 관측): HQ 가 최종 확인을 마쳐 왼쪽 `승인 대기` 가 0 이 됐는데도
//   오른쪽 `승인·확인 필요` 에는 원래 지시 메시지가 계속 남았다.
//   `App.handleTaskDecision` 이 lifecycle 결정만 저장하고 **연결된 메시지 상태를 갱신하지 않았고**,
//   `ExecutiveBriefing` 은 `status === 'open'` 인 팀 메시지를 계속 표시했기 때문이다.
//
// 원칙
//   - **화면이 메시지 상태를 추측하지 않는다.** 판정은 이 파일 한 곳에서 한다.
//   - 원본 메시지는 lifecycle 업무의 `inputRefs` 에서 **기존 `messageRef` 규칙**으로 찾는다.
//     새 참조 형식을 만들지 않는다.
//   - 메시지·업무·결정 이력을 **삭제하지 않는다.** 상태 전이만 한다(기존 `resolveTeamMessage` 재사용).
//   - **트랜잭션이 아니다.** 현재는 localStorage 두 저장소에 순차로 쓴다.
//     업무 저장이 끝난 뒤 메시지 저장이 실패하면 자동으로 되돌리지 않는다.
//     보장 범위를 넘어서는 주장을 하지 않는다(서버 기록 작업에서 다룬다).

import type { ActorRef, LifecycleTask } from './taskLifecycleContract';
import { isTerminalStatus } from './taskLifecycleContract';
import { messageRef, MESSAGE_REF_PREFIX } from './taskLifecycleAppAdapter';
import { loadLifecycleTasks } from './taskLifecycleStore';
import { loadTeamMessages, resolveTeamMessage } from './repositories/teamMessageRepository';
import type { TeamMessage, TeamMessageStatus, TeamMessageActor } from '../types/teamMessage';

/** 업무의 `inputRefs` 에서 원본 팀 메시지 id 를 꺼낸다. 없으면 `null`. */
export function linkedMessageIdOf(task: Pick<LifecycleTask, 'inputRefs'> | null | undefined): string | null {
  for (const ref of task?.inputRefs ?? []) {
    if (typeof ref === 'string' && ref.startsWith(MESSAGE_REF_PREFIX)) {
      const id = ref.slice(MESSAGE_REF_PREFIX.length);
      if (id) return id;
    }
  }
  return null;
}

/**
 * 이 업무 상태에서 **원본 메시지가 가져야 할 상태**.
 *
 *   `open`              → 아직 아무도 손대지 않음 (그대로 둔다 = `null`)
 *   수행자 지정 이후      → `in_progress`
 *   실제 흐름 종료        → `done`
 *
 * ⚠️ 종료로 보지 않는 것:
 *   - `superseded` — 수정 요청으로 **후속 업무가 살아 있다.** 원본 메시지를 닫으면 할 일이 사라진다.
 *   - `returned`   — 반송이라 **다시 사람이 처리해야 한다.** 조용히 완료로 숨기지 않는다.
 *   - `not_selected` — 선택되지 않았을 뿐 흐름이 끝난 것이 아니다.
 *   - `failed`     — 실패를 완료로 표시하지 않는다.
 *
 * 판정할 수 없으면 `null`(= 바꾸지 않는다).
 */
export function resolveLinkedMessageStatus(task: Pick<LifecycleTask, 'status' | 'executorKind'>): TeamMessageStatus | null {
  const s = task.status;
  if (s === 'completed' || s === 'partially_completed' || s === 'not_adopted' || s === 'stopped') return 'done';
  if (s === 'superseded' || s === 'returned' || s === 'not_selected' || s === 'failed') return null;
  if (s === 'in_progress' || s === 'awaiting_approval') return 'in_progress';
  // 'open' — 수행자가 정해졌다면 진행 중으로 본다(배정 직후 화면 반영).
  if (task.executorKind === 'agent' || task.executorKind === 'human') return 'in_progress';
  return null;
}

/**
 * 같은 메시지를 참조하는 **아직 끝나지 않은 다른 업무**가 있는가.
 * 있으면 완료로 닫지 않는다(수정본·협업 자식 등이 살아 있는 경우).
 */
export function hasOpenTaskLinkedTo(messageId: string, exceptTaskId: string): boolean {
  const ref = messageRef(messageId);
  return loadLifecycleTasks().some(
    (t) => t.ref.taskId !== exceptTaskId && (t.inputRefs ?? []).includes(ref) && !isTerminalStatus(t.status)
  );
}

const toMessageActor = (actor: ActorRef): TeamMessageActor => ({
  kind: actor.kind,
  teamId: actor.teamId,
  label: actor.label,
  ...(actor.agentId ? { agentId: actor.agentId } : {})
});

export interface LinkedMessageSyncResult {
  messageId: string;
  from: TeamMessageStatus;
  to: TeamMessageStatus;
}

/**
 * 업무 상태를 원본 메시지에 반영한다.
 *
 * 아무것도 하지 않고 `null` 을 돌려주는 경우:
 *   - 업무에 원본 메시지 참조가 없다
 *   - 그 메시지가 저장소에 없다(이미 절단됐거나 잘못된 참조)
 *   - 판정 결과가 없다(`resolveLinkedMessageStatus` 가 `null`)
 *   - **이미 같은 상태다**(중복 이력을 만들지 않는다)
 *   - 완료로 닫으려는데 같은 메시지를 참조하는 비종료 업무가 남아 있다
 */
export function syncLinkedMessageForTask(
  task: LifecycleTask | null | undefined,
  actor: ActorRef
): LinkedMessageSyncResult | null {
  if (!task) return null;
  const messageId = linkedMessageIdOf(task);
  if (!messageId) return null;

  const message: TeamMessage | undefined = loadTeamMessages().find((m) => m.id === messageId);
  if (!message) return null;                       // 잘못된·절단된 참조는 조용히 무시

  const next = resolveLinkedMessageStatus(task);
  if (!next) return null;
  if (message.status === next) return null;        // 중복 이력 금지

  if (next === 'done' && hasOpenTaskLinkedTo(messageId, task.ref.taskId)) {
    return null;                                   // 후속 업무가 살아 있으면 닫지 않는다
  }

  resolveTeamMessage(messageId, next, toMessageActor(actor));
  return { messageId, from: message.status, to: next };
}
