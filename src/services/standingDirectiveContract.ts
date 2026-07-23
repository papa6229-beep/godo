// ────────────────────────────────────────────────────────────────────────────
// RC-2 D-1.2 — 상시 지시(자동 스케줄) 계약
//
// 확정 정책:
//   자동 스케줄은 **담당 팀장이 미리 승인해 둔 '상시 지시'** 만 실행한다.
//   승인이 없는 자동 업무는 스스로 돌지 않고 팀장 확인 대기로 남는다.
//   상시 지시는 소유 팀장 · 업무 범위 · 주기 · 활성 여부 · 최근 승인 시각을 보존한다.
//   고위험 자동 업무는 상시 승인이 있어도 **결과에 대한 팀장 확인을 생략하지 않는다**.
//   시험(시뮬레이션) 출처로 도는 스케줄 결과는 실제 자료로 표시하지 않는다.
//
// 이 모듈은 계산·발신을 하지 않는다. "지금 자동으로 돌아도 되는가"만 판정하고,
// 승인·중지·재개·범위변경을 **덮어쓰지 않고 이력으로 쌓는** 순수 함수만 제공한다.
// ────────────────────────────────────────────────────────────────────────────

import type { AgentTaskSchedule } from '../types/agentTask';
import type { DeptTeamId } from '../types/teamMessage';

/** 고위험 = 결과가 밖으로 나가거나 되돌리기 어려운 업무(가격·발송·고객 응대 등). */
export type StandingRiskLevel = 'normal' | 'high';

/** 상시 지시에 일어난 일. 덮어쓰지 않고 계속 쌓인다. */
export interface StandingDirectiveEvent {
  kind: 'approved' | 'paused' | 'resumed' | 'scope_changed';
  at: string;
  byUserId: string;
  byLabel: string;
  note?: string;
}

export interface StandingDirective {
  /** 이 상시 지시를 소유한 팀과 팀장. 다른 사람은 승인·중지할 수 없다. */
  ownerTeamId: DeptTeamId;
  ownerLeadUserId: string;
  /** 업무 범위 — 자동으로 어디까지 해도 되는지 팀장이 적어 둔 한계. */
  scope: string;
  /** 주기. */
  schedule: AgentTaskSchedule;
  /** 활성 여부(중지해도 기록은 남는다). */
  active: boolean;
  /** 팀장이 마지막으로 승인한 시각. 없으면 아직 승인된 적 없다. */
  approvedByLeadAt?: string;
  riskLevel: StandingRiskLevel;
  /** 이 스케줄이 실제 자료로 도는지, 시험 자료로 도는지. */
  source: 'real' | 'simulation';
  history: StandingDirectiveEvent[];
}

export interface StandingRunVerdict {
  /** 자동으로 돌아도 되는가. */
  allowed: boolean;
  /** 막혔을 때 사용자에게 그대로 보여 줄 이유. */
  reason?: string;
  /** 돌아도 되지만 **결과는 팀장이 확인해야** 하는가(고위험). */
  requiresLeadConfirmation: boolean;
  /** 이 실행 결과를 무엇으로 표시할지. */
  dataKind: 'real' | 'fixture';
}

/**
 * 지금 이 자동 업무가 스스로 돌아도 되는가.
 * 상시 지시가 없으면 자동 실행하지 않는다(추측해서 대신 돌지 않는다).
 */
export function canRunStandingDirective(d: StandingDirective | undefined | null): StandingRunVerdict {
  if (!d) {
    return {
      allowed: false,
      reason: '상시 지시로 등록되지 않은 업무입니다. 담당 팀장 확인이 필요합니다.',
      requiresLeadConfirmation: true,
      dataKind: 'real'
    };
  }
  // 고위험은 어떤 경우에도 결과 확인을 생략하지 않는다.
  const requiresLeadConfirmation = d.riskLevel === 'high';
  const dataKind: 'real' | 'fixture' = d.source === 'simulation' ? 'fixture' : 'real';

  if (!d.active) {
    return { allowed: false, reason: '중지된 상시 업무입니다.', requiresLeadConfirmation, dataKind };
  }
  if (!d.approvedByLeadAt) {
    return { allowed: false, reason: '담당 팀장 확인이 필요합니다.', requiresLeadConfirmation, dataKind };
  }
  return { allowed: true, requiresLeadConfirmation, dataKind };
}

/** 소유 팀장 본인인지. 소유자가 아니면 상시 지시를 건드릴 수 없다. */
export function isStandingOwner(d: StandingDirective, actor: { userId?: string; teamId?: string }): boolean {
  return !!actor.userId && actor.userId === d.ownerLeadUserId && actor.teamId === d.ownerTeamId;
}

type ActorLike = { userId?: string; teamId?: string; label?: string };

function withEvent(
  d: StandingDirective,
  patch: Partial<StandingDirective>,
  ev: Omit<StandingDirectiveEvent, 'byUserId' | 'byLabel'> & { actor: ActorLike }
): StandingDirective {
  const { actor, ...rest } = ev;
  return {
    ...d,
    ...patch,
    history: [...d.history, { ...rest, byUserId: actor.userId ?? '', byLabel: actor.label ?? '' }]
  };
}

export type StandingResult =
  | { ok: true; directive: StandingDirective }
  | { ok: false; reason: string };

/** 팀장이 상시 지시를 승인한다(최근 승인 시각 갱신 + 이력 추가). */
export function approveStanding(d: StandingDirective, input: { actor: ActorLike; nowIso: string; note?: string }): StandingResult {
  if (!isStandingOwner(d, input.actor)) return { ok: false, reason: '소유 팀장만 상시 지시를 승인할 수 있습니다.' };
  return {
    ok: true,
    directive: withEvent(d, { active: true, approvedByLeadAt: input.nowIso },
      { kind: 'approved', at: input.nowIso, note: input.note, actor: input.actor })
  };
}

/** 중지 — 승인 기록은 지우지 않는다(언제 승인됐었는지 계속 보인다). */
export function pauseStanding(d: StandingDirective, input: { actor: ActorLike; nowIso: string; note?: string }): StandingResult {
  if (!isStandingOwner(d, input.actor)) return { ok: false, reason: '소유 팀장만 상시 지시를 중지할 수 있습니다.' };
  return {
    ok: true,
    directive: withEvent(d, { active: false }, { kind: 'paused', at: input.nowIso, note: input.note, actor: input.actor })
  };
}

/** 재개 — 중지 후 다시 돌리려면 **다시 승인**해야 한다(재개만으로 자동 실행되지 않는다). */
export function resumeStanding(d: StandingDirective, input: { actor: ActorLike; nowIso: string; note?: string }): StandingResult {
  if (!isStandingOwner(d, input.actor)) return { ok: false, reason: '소유 팀장만 상시 지시를 재개할 수 있습니다.' };
  return {
    ok: true,
    directive: withEvent(d, { active: true, approvedByLeadAt: undefined },
      { kind: 'resumed', at: input.nowIso, note: input.note, actor: input.actor })
  };
}

/** 업무 범위 변경 — 범위가 바뀌면 이전 승인은 무효다(바뀐 범위를 다시 승인해야 한다). */
export function changeStandingScope(
  d: StandingDirective,
  input: { scope: string; actor: ActorLike; nowIso: string; note?: string }
): StandingResult {
  if (!isStandingOwner(d, input.actor)) return { ok: false, reason: '소유 팀장만 업무 범위를 바꿀 수 있습니다.' };
  return {
    ok: true,
    directive: withEvent(d, { scope: input.scope, approvedByLeadAt: undefined },
      { kind: 'scope_changed', at: input.nowIso, note: input.note ?? `범위 변경: ${input.scope}`, actor: input.actor })
  };
}
