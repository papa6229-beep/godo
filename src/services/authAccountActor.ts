// src/services/authAccountActor.ts
// B-use-4 — 서버가 검증한 로그인 계정 → 업무 행위자(ActorRef) 변환.
//
// 왜 필요한가: 인증 브랜치의 App 은 로그인한 뒤에도 업무 행위자를 화면 역할 전환기
//   (`sessionRole`)에서 만들었다. 그대로 두면 **실제 로그인 신원이 업무 이력에 연결되지 않고**,
//   역할 전환기만 바꿔도 권한이 올라간다.
//
// 규칙
//   - 인증된 운영 모드에서는 `userId·이름·팀·역할`을 **서버가 돌려준 계정 뷰에서만** 가져온다.
//   - `identitySource` 는 `session_login` 이다(데모 역할과 구분된다).
//   - 팀 식별자는 정본 `teamIdContract` 로 해석한다. 이 계층은 새 팀 체계를 만들지 않는다.
//   - 저장값 `marketing` 을 `marketing_internal`/`marketing_external` 로 **승격하지 않는다**.
//   - 알 수 없는 팀 값은 추측하지 않는다(헌법 §10). 그대로 실어 보내면 어떤 팀과도
//     일치하지 않으므로 팀 권한이 생기지 않는다 — fail-closed.

import type { ActorRef, AccountRoleRef } from './taskLifecycleContract';
import type { DeptTeamId } from './teamIdContract';
import { isDeptTeamId } from './teamIdContract';

/** 서버 `/api/auth/me` 가 돌려준 계정 뷰(비밀번호·민감정보 없음). */
export interface ServerAccountLike {
  userId: string;
  name: string;
  team: string;
  position?: string;
  role: AccountRoleRef;
  status: 'pending' | 'active' | 'suspended';
}

/**
 * 해석할 수 없는 팀 값을 담는 자리표시자.
 * **어떤 실제 팀과도 같지 않다** → 승인·배정·중단 어디에도 해당하지 않는다.
 * 'hq' 같은 실제 값으로 뭉개지 않기 위해 일부러 별도 값을 쓴다.
 */
export const UNRESOLVED_TEAM = 'unresolved_team';

/** 계정 팀 문자열 → 정본 팀 식별자. 모르면 자리표시자(추측하지 않는다). */
export function resolveAccountTeam(team: unknown): DeptTeamId {
  return isDeptTeamId(team) ? team : (UNRESOLVED_TEAM as unknown as DeptTeamId);
}

/**
 * 서버 계정 뷰 → 업무 행위자.
 *
 * 이 함수는 **`active` 여부를 판정하지 않는다** — 화면 진입 차단은 인증 게이트가,
 * 최종 경계는 서버가 담당한다. 여기서는 신원만 옮긴다.
 */
export function actorFromServerAccount(account: ServerAccountLike): ActorRef {
  return {
    kind: 'human',
    teamId: resolveAccountTeam(account.team),
    label: account.name?.trim() || account.userId,
    userId: account.userId,
    identitySource: 'session_login',
    accountRole: account.role
  };
}
