// ────────────────────────────────────────────────────────────────────────────
// Team Id Contract — 팀 식별자 정본(Single Source of Truth)
//
// 배경: 같은 팀 식별자 유니온이 세 곳에 복사돼 있었다.
//   src/types/teamMessage.ts · src/services/departmentChatMemory.ts · DepartmentWorkspacePanel.tsx
// 한 곳이 바뀌면 나머지가 조용히 어긋난다. 정의를 여기 한 곳으로 모은다.
//
// 마케팅 두 팀 분리(marketing_internal / marketing_external)의 **저장 의미**를 여기서 고정한다.
// ⚠️ 이번 단계에서 기존 소비자의 저장 값은 하나도 바꾸지 않는다. 이유:
//    `taskLifecycleContract` 의 승인 라우팅이 `actor.teamId === task.ownerTeamId` 로 판정한다.
//    저장된 업무의 담당팀이 'marketing' 인데 세션 팀이 'marketing_internal' 이면
//    같은 팀인데도 승인이 막힌다. 그래서 **비교는 scope 로** 하고, 값 이관은 별도 작업으로 둔다.
// ────────────────────────────────────────────────────────────────────────────

/**
 * 현재 저장·기록에 실제로 쓰이는 팀 식별자.
 * **이 유니온의 값은 바꾸지 않는다** — 기존 localStorage 자료가 이 값으로 저장돼 있다.
 */
export type DeptTeamId = 'hq' | 'product' | 'cs' | 'marketing' | 'design';

export const DEPT_TEAM_IDS: readonly DeptTeamId[] = ['hq', 'product', 'cs', 'marketing', 'design'] as const;

/**
 * 마케팅 두 팀. **아직 어떤 저장 경로도 이 값을 쓰지 않는다.**
 *   marketing_internal — 자사몰 안에서 하는 마케팅(상세페이지·기획전·쿠폰·온사이트)
 *   marketing_external — 자사몰 밖에서 하는 마케팅(광고·채널·유입)
 */
export type MarketingTeamId = 'marketing_internal' | 'marketing_external';

export const MARKETING_TEAM_IDS: readonly MarketingTeamId[] = ['marketing_internal', 'marketing_external'] as const;

/** 정본 팀 식별자 — 기존 값 + 마케팅 두 팀. */
export type TeamId = DeptTeamId | MarketingTeamId;

/**
 * 팀 범위(scope) — 승인 라우팅·조회 비교의 기준.
 * 마케팅 두 팀은 같은 `'marketing'` scope 에 속한다.
 * 그래야 기존에 `teamId: 'marketing'` 으로 저장된 기록과 새 두 팀이 서로를 알아본다.
 */
export type TeamScope = DeptTeamId;

/**
 * 구분 이전에 저장된 마케팅 값. **자동으로 두 팀 중 하나로 승격하지 않는다.**
 * 어느 팀 업무였는지 알 수 없기 때문이다(추측 금지 — 헌법 §10).
 */
export const LEGACY_MARKETING_TEAM_ID: DeptTeamId = 'marketing';

const MARKETING_SCOPE_OF: Record<MarketingTeamId, TeamScope> = {
  marketing_internal: 'marketing',
  marketing_external: 'marketing'
};

const ALL_TEAM_IDS: readonly TeamId[] = [...DEPT_TEAM_IDS, ...MARKETING_TEAM_IDS];

export const isTeamId = (v: unknown): v is TeamId =>
  typeof v === 'string' && (ALL_TEAM_IDS as readonly string[]).includes(v);

export const isDeptTeamId = (v: unknown): v is DeptTeamId =>
  typeof v === 'string' && (DEPT_TEAM_IDS as readonly string[]).includes(v);

export const isMarketingTeamId = (v: unknown): v is MarketingTeamId =>
  typeof v === 'string' && (MARKETING_TEAM_IDS as readonly string[]).includes(v);

/** 팀 식별자 → 비교용 scope. 알 수 없는 값은 null(추측하지 않는다). */
export function teamScopeOf(teamId: unknown): TeamScope | null {
  if (isMarketingTeamId(teamId)) return MARKETING_SCOPE_OF[teamId];
  if (isDeptTeamId(teamId)) return teamId;
  return null;
}

/**
 * 두 팀 식별자가 같은 팀 범위인가.
 * `'marketing'`(구분 이전 저장분) 과 `'marketing_internal'` 은 **같은 범위**로 본다.
 * 판별 불가 값끼리는 같다고 하지 않는다(fail-closed).
 */
export function isSameTeamScope(a: unknown, b: unknown): boolean {
  const sa = teamScopeOf(a);
  const sb = teamScopeOf(b);
  if (sa === null || sb === null) return false;
  return sa === sb;
}

/**
 * 저장 경계에서 읽은 팀 값을 정본으로 해석한다.
 * 아는 값이면 그대로, 모르는 값이면 null. **기본값으로 뭉개지 않는다.**
 */
export function readStoredTeamId(v: unknown): TeamId | null {
  return isTeamId(v) ? v : null;
}

export interface TeamIdMeta {
  name: string;
  /** 저장 의미 — 이 값이 기록에 남았을 때 무엇을 뜻하는가. */
  storageMeaning: string;
  scope: TeamScope;
  /** 실제 저장·기록 경로에서 현재 쓰이고 있는가. */
  inUse: boolean;
}

export const TEAM_ID_META: Record<TeamId, TeamIdMeta> = {
  hq: { name: '총괄', storageMeaning: '총괄(HQ)이 지시·확인한 기록', scope: 'hq', inUse: true },
  product: { name: '상품관리팀', storageMeaning: '상품관리팀 소속 기록', scope: 'product', inUse: true },
  cs: { name: 'CS팀', storageMeaning: 'CS팀 소속 기록', scope: 'cs', inUse: true },
  design: { name: '디자인팀', storageMeaning: '디자인팀 소속 기록', scope: 'design', inUse: true },
  marketing: {
    name: '마케팅팀',
    storageMeaning: '**마케팅 두 팀 구분 이전**에 저장된 기록. 어느 팀 업무였는지 알 수 없으므로 승격하지 않는다.',
    scope: 'marketing',
    inUse: true
  },
  marketing_internal: {
    name: '마케팅 1팀(자사몰 내부)',
    storageMeaning: '자사몰 안에서 수행한 마케팅 업무(상세페이지·기획전·쿠폰·온사이트) 기록',
    scope: 'marketing',
    inUse: false
  },
  marketing_external: {
    name: '마케팅 2팀(외부 채널)',
    storageMeaning: '자사몰 밖에서 수행한 마케팅 업무(광고·채널·유입) 기록',
    scope: 'marketing',
    inUse: false
  }
};
