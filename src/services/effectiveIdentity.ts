// src/services/effectiveIdentity.ts
// B-use-4 보완 — **로그인 권한 정본 단일화**.
//
// 배경(Codex 독립검증 결함 A): 서버 계정이 들어와도 화면 곳곳이 여전히 시험용 역할
//   전환기(`sessionRole.loadRole()`)를 각자 읽고 있었다.
//     - `App.tsx` 의 업무·흐름 상태는 마운트 시점(계정 아직 없음)에 시험 역할로 만들어지고
//       서버 계정이 도착해도 다시 계산되지 않았다.
//     - `MainLayout` 은 자체 `loadRole()` 로 HQ 메뉴를 판정했다.
//     - `DepartmentWorkspacePanel` · `AgentDetailModal` 도 각자 `loadRole()` 을 읽었다.
//   그래서 로그인 전 시험 역할이 HQ 였다면 로그인 뒤에도 HQ 목록·메뉴가 남을 수 있었다.
//
// 이 모듈은 **"지금 누구인가"를 계산하는 유일한 곳**이다. 화면은 여기서 나온 값만 쓴다.
//
// 규칙
//   1. 인증이 구성된 운영 모드에서는 **서버 계정만** 신원 근거다.
//   2. 인증 구성인데 서버 계정이 없으면 **시험 역할로 대체하지 않는다**(권한 0).
//   3. 인증 미구성(명시적 로컬 개발)에서만 시험 역할 전환기를 쓴다.
//   4. 팀 식별자는 정본 `teamIdContract` 로만 해석한다. 새 팀 체계를 만들지 않는다.

import type { ActorRef, AccountRoleRef } from './taskLifecycleContract';
import { hasHqAuthority, hasLeadAuthority } from './taskLifecycleContract';
import type { DeptTeamId } from './teamIdContract';
import { actorForRole } from './taskLifecycleAppAdapter';
import { roleMeta, type ViewerRole } from './sessionRole';
import { actorFromServerAccount, type ServerAccountLike } from './authAccountActor';

export type IdentityMode = 'authenticated' | 'demo';

export interface EffectiveIdentity {
  /** `authenticated` = 서버 계정이 정본 · `demo` = 시험 역할 전환기가 정본. */
  mode: IdentityMode;
  /** 업무 생성·승인·열람에 쓰는 행위자. **인증 모드에서 계정이 없으면 `null`**(권한 0). */
  actor: ActorRef | null;
  /** 지금 이 사람의 팀. 알 수 없으면 `null` — 추측하지 않는다. */
  teamId: DeptTeamId | null;
  /** 서버 계정 역할. 시험 모드에는 없다(`null`). */
  role: AccountRoleRef | null;
  /** 총괄 전용 메뉴·HQ 확인 단계 자격. */
  isHq: boolean;
  /** 팀장 행동(배정·확인·중단·팀 업무 등록) 자격. */
  isLead: boolean;
  /** 시험 역할 전환기를 **조작할 수 있는가**. 인증 모드에서는 항상 false. */
  roleSwitcherEnabled: boolean;
  /** 화면 표시용 이름(계정 이름 또는 시험 역할 라벨). */
  label: string;
  /**
   * React 의존성 배열용 안정 키.
   * 이 값이 바뀔 때만 열람 범위를 다시 계산한다(객체 동일성으로 루프를 만들지 않는다).
   */
  key: string;
}

export interface EffectiveIdentityInput {
  /** `authGate.isAuthConfigured()` — 빌드에 publishable key 가 주입됐는가. */
  authConfigured: boolean;
  /** `/api/auth/me` 가 돌려준 계정. 아직 못 받았으면 `null`. */
  serverAccount: ServerAccountLike | null;
  /** 시험 역할 전환기 현재 값(인증 미구성일 때만 쓰인다). */
  demoRole: ViewerRole;
}

const keyOf = (mode: IdentityMode, actor: ActorRef | null, teamId: string | null, role: string | null): string =>
  `${mode}:${actor?.userId ?? ''}:${teamId ?? ''}:${role ?? ''}`;

/**
 * 지금 이 사람의 **단일 권한 문맥**을 계산한다. 순수 함수 — 저장소·DOM 을 만지지 않는다.
 */
export function computeEffectiveIdentity(input: EffectiveIdentityInput): EffectiveIdentity {
  if (input.authConfigured) {
    const account = input.serverAccount;
    if (!account) {
      // 인증은 켜져 있는데 계정을 아직(또는 영영) 못 받았다.
      //   **시험 역할로 대체하지 않는다.** 권한 0 으로 두고 인증 게이트가 화면을 막는다.
      return {
        mode: 'authenticated', actor: null, teamId: null, role: null,
        isHq: false, isLead: false, roleSwitcherEnabled: false,
        label: '확인 중', key: keyOf('authenticated', null, null, null)
      };
    }
    const actor = actorFromServerAccount(account);
    return {
      mode: 'authenticated',
      actor,
      teamId: actor.teamId,
      role: account.role,
      isHq: hasHqAuthority(actor),
      isLead: hasLeadAuthority(actor),
      roleSwitcherEnabled: false,
      label: actor.label,
      key: keyOf('authenticated', actor, actor.teamId, account.role)
    };
  }
  // 인증 미구성(명시적 로컬 개발) — 기존 시험 역할 전환기가 그대로 정본이다.
  const actor = actorForRole(input.demoRole);
  return {
    mode: 'demo',
    actor,
    teamId: actor.teamId,
    role: null,
    isHq: hasHqAuthority(actor),
    isLead: hasLeadAuthority(actor),
    roleSwitcherEnabled: true,
    label: roleMeta(input.demoRole).label,
    key: keyOf('demo', actor, actor.teamId, null)
  };
}

/**
 * 이 신원이 그 팀을 **자기 팀**으로 다루는가.
 * 팀을 알 수 없으면 false(fail-closed) — `null === null` 로 통과시키지 않는다.
 */
export const isOwnTeam = (identity: EffectiveIdentity, teamId: unknown): boolean =>
  identity.teamId !== null && identity.teamId === teamId;

// ── 탭 접근 (렌더 전 동기 판정) ───────────────────────────────────────────────
/** 화면 탭 식별자 — `MainLayout` 이 렌더하는 목록과 같다. */
export type AppTab =
  | 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar' | 'department';

/** 총괄만 들어갈 수 있는 탭. 그 밖(=`department`)은 모두가 쓴다. */
export const HQ_ONLY_TABS: readonly AppTab[] =
  ['office', 'agents', 'logs', 'brain', 'studio', 'engine', 'data', 'api', 'calendar'] as const;

/**
 * **실제로 렌더할 탭**을 동기적으로 정한다.
 *
 * 이전에는 `useEffect` 안에서 `setActiveTab('department')` 로 되돌렸는데,
 * effect 는 **화면이 한 번 그려진 뒤** 실행되므로 다음 상황에서 HQ 화면이 한 렌더 동안 보였다.
 *   - 로그인 직후 기본 탭이 `office` 인 상태
 *   - HQ 계정에서 member 계정으로 바뀌었는데 이전 탭이 관리자·운영 탭인 경우
 *
 * 그래서 판정을 **렌더 경로의 순수 계산**으로 옮긴다. 비HQ 는 요청한 탭이 무엇이든 `department` 다.
 * (effect 는 저장된 탭 상태를 정리하는 용도로만 남기고, 보안 경계로 쓰지 않는다.)
 */
export function resolveActiveTab(requested: AppTab, isHq: boolean): AppTab {
  if (isHq) return requested;
  return 'department';
}

/** 이 신원이 그 탭을 열 수 있는가(요청 그대로 렌더되는가). */
export const canAccessTab = (tab: AppTab, isHq: boolean): boolean => resolveActiveTab(tab, isHq) === tab;

// ── 상세·보고서 노출 (계정 전환 격리) ─────────────────────────────────────────
//
// ⚠️ **업무 상세** 판정 함수(`isTaskVisibleToIdentity`)는 Local migration(2026-07-30)에서
//    제거했다. 유일한 소비자가 도달 불가능하던 `TaskResultModal` 표시 판정이었고,
//    그 경로를 지우면서 제품 호출자가 0건이 됐다. 검사만 붙잡아 두지 않는다.
//    **활성 경로의 같은 격리**는 화면이 담당한다 —
//    `TeamTaskPanel` 이 선택한 id 를 현재 `teamFlows` 에서 다시 찾아(`detailFlow`)
//    열람 범위 밖이면 `null` 이 되어 `TaskDetailModal` 이 아예 렌더되지 않는다.
//    아래 **승인 상세·보고서** 격리는 App 이 계속 쓰므로 그대로 둔다.

/**
 * 열려 있던 **승인 상세**를 지금 신원에게 계속 보여도 되는가.
 *
 * ⚠️ 업무 열람 권한과 **다른 기준**을 쓴다.
 *   `visibleTasksFor` 는 팀만 본다(`taskLifecycleAppAdapter`: `ownerTeamId`/`requestingTeamId` 일치).
 *   그래서 같은 팀의 **일반 팀원도 업무는 볼 수 있다.** 하지만 승인 담당자는 아니다
 *   (`pendingForActor` 는 `canDecide` → `hasLeadAuthority` 를 통과해야 한다).
 *   업무 열람을 기준으로 삼으면 팀장이 연 승인 상세가 같은 팀 팀원 계정으로 전환한 뒤에도 남는다.
 *
 * 그래서 **지금 이 신원이 실제로 결정할 수 있는 승인 항목의 고유 `id`** 로만 판정한다.
 *   `taskId` 가 아니라 `id` 를 쓰는 이유: 승인 항목은 업무 단위로 만들어지므로
 *   `taskId` 로 대조하면 같은 업무의 다른 승인 항목까지 함께 열릴 수 있다.
 * 판정 불가(빈 값·목록에 없음)는 숨긴다(fail-closed). 저장된 자료는 지우지 않는다.
 */
export const isApprovalVisibleToIdentity = (
  approvalId: string | undefined | null,
  decidableApprovalIds: readonly string[]
): boolean => !!approvalId && decidableApprovalIds.includes(approvalId);

/**
 * 시험 운영 보고서는 **그것을 만든 신원**에게만 보여 준다.
 * 만든 시점의 `identity.key` 를 함께 기록해 두고 현재 키와 비교한다.
 */
export const isReportOwnedBy = (reportIdentityKey: string | null, currentIdentityKey: string): boolean =>
  reportIdentityKey !== null && reportIdentityKey === currentIdentityKey;
