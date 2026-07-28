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
