// api/_shared/accountContract.ts
// R-AUTH-FOUNDATION-01 GREEN A — 계정·인가 도메인 계약(서버 정본, 순수 함수).
//
// 원칙:
//   - 이 모듈은 "권한 판정 규칙"의 단일 정본이다. 라우트 가드·승인 API 는 여기의 규칙만 사용한다.
//   - 관리형 인증(Clerk)이 아이디·비밀번호·세션을 맡는다. 이 계약은 팀·직책·역할·승인상태·권한만 다룬다.
//   - 비밀번호는 이 계약의 어떤 필드에도 담기지 않는다(입력·저장·반환 금지).
//   - 클라이언트가 보낸 역할·팀·body 값이나 화면용 sessionRole 을 권한 근거로 쓰지 않는다.
//     권한 판정의 입력 Account 는 반드시 "서버가 검증한 인증 사용자 ID 로 조회한 계정"이어야 한다.
//   - 정지(suspended)는 과거 기록을 삭제하지 않는다. 변경 이력은 append-only 로 보존한다.

// ── 역할·상태·팀 어휘 ─────────────────────────────────────────────────────────
export type AccountRole = 'hq' | 'team_lead' | 'member';
export type AccountStatus = 'pending' | 'active' | 'suspended';

// ── 팀 어휘 ──────────────────────────────────────────────────────────────────
// ★ B-use-4: **팀 식별자의 정본은 `src/services/teamIdContract.ts` 다.**
//   이 인증 계층은 정본을 새로 만들지 않는다. 아래 목록은 정본 `DEPT_TEAM_IDS` 에서
//   'hq'(팀이 아니라 역할)를 뺀 **파생 목록**이며, 두 파일이 어긋나면
//   `scripts/smoke-b-use-4-auth-integration-v0.mjs` 의 팀 어휘 일치 검사가 실패한다.
//
//   왜 import 하지 않는가: `api/` 번들이 `src/`(브라우저 계층)를 import 한 선례가 0건이고
//   (B-core-2a 에서 의도적으로 유지한 경계), Vercel 함수 번들러가 api 트리 밖 상대 경로를
//   어떻게 해석하는지 이번 작업 범위(§7)에서 실증할 수 없다. 검증되지 않은 런타임 위험을
//   만드는 대신, **어긋나면 게이트가 깨지는 미러**로 둔다.
//
//   마케팅 두 팀(marketing_internal/marketing_external)은 여기 넣지 않는다 —
//   정본이 `inUse: false` 로 두었고, 기존 저장값 'marketing' 을 승격하지 않기 때문이다.
export type AccountTeamId = 'product' | 'cs' | 'marketing' | 'design';
export type AccountTeam = AccountTeamId | 'hq';
export const ACCOUNT_TEAMS: readonly AccountTeamId[] = ['product', 'cs', 'marketing', 'design'] as const;
export const isAccountTeamId = (v: unknown): v is AccountTeamId =>
  typeof v === 'string' && (ACCOUNT_TEAMS as readonly string[]).includes(v);
export const isAccountRole = (v: unknown): v is AccountRole =>
  v === 'hq' || v === 'team_lead' || v === 'member';
export const isAccountStatus = (v: unknown): v is AccountStatus =>
  v === 'pending' || v === 'active' || v === 'suspended';

/**
 * B-use-4 보완 — 역할과 팀의 **조합**이 허용되는가.
 *   hq        → 소속 표식은 반드시 'hq'
 *   team_lead · member → 반드시 실제 운영팀(hq 는 팀이 아니다)
 * 어긋나면 추측하거나 기본값으로 보정하지 않고 거부한다.
 */
export function isValidRoleTeamPair(role: unknown, team: unknown): boolean {
  if (!isAccountRole(role)) return false;
  if (role === 'hq') return team === 'hq';
  return isAccountTeamId(team);
}

export type AccountHistoryEvent =
  | 'created' | 'approved' | 'suspended' | 'reinstated' | 'password_reset';

export interface AccountHistoryEntry {
  at: string;                 // ISO 시각(호출자가 주입 — 순수성 유지)
  event: AccountHistoryEvent;
  // 당시 스냅샷(과거 업무기록의 당시 이름·팀·직책·역할 보존용)
  name: string;
  team: AccountTeam;
  position: string;
  role: AccountRole;
  by?: string;                // 행위자 userId(승인·정지·초기화한 사람)
}

export interface Account {
  userId: string;             // 관리형 인증(Clerk)이 발급한 검증된 사용자 ID. 비밀번호 아님.
  name: string;
  team: AccountTeam;
  position: string;           // 직책
  role: AccountRole;
  status: AccountStatus;
  history: AccountHistoryEntry[];
}

// 공개 가입 신청 입력. 사용자 화면 입력은 이름·팀·직책·희망 아이디·비밀번호 5개뿐이며
// 아이디·비밀번호는 관리형 인증이 직접 받는다(우리 제품 계층 미통과). 여기는 이름·팀·직책만.
// ★ A.1 보정: 공개 가입 body 로 role 을 결정하지 않는다 — 신청은 항상 member·pending 으로
//   생성되고, 역할 상향(team_lead)은 HQ 가 승인 시점에 결정한다. 공개 가입으로 HQ 불가.
export interface SignupApplication {
  userId: string;             // 인증 공급자가 가입 직후 발급한 검증 ID
  name: string;
  team: string;               // 신청 값(검증 전) — 정본 팀만 허용
  position: string;           // 직책
}

export interface SignupResult {
  ok: boolean;
  account?: Account;
  errorCode?: 'INVALID_TEAM' | 'INVALID_NAME' | 'INVALID_POSITION';
}

// 공개 가입 신청 → 항상 member·pending 계정 생성(또는 거부). 비밀번호·역할은 다루지 않는다.
export function createSignupAccount(app: SignupApplication, at: string): SignupResult {
  const name = (app.name ?? '').trim();
  const position = (app.position ?? '').trim();
  if (!name) return { ok: false, errorCode: 'INVALID_NAME' };
  if (!position) return { ok: false, errorCode: 'INVALID_POSITION' };
  if (!isAccountTeamId(app.team)) return { ok: false, errorCode: 'INVALID_TEAM' };
  const team: AccountTeam = app.team;
  const account: Account = {
    userId: app.userId,
    name,
    team,
    position,
    role: 'member',
    status: 'pending',
    history: [{ at, event: 'created', name, team, position, role: 'member' }]
  };
  return { ok: true, account };
}

// ── 접근 판정 ─────────────────────────────────────────────────────────────────
// 보호 라우트 접근은 active 계정만. pending·suspended 는 거부.
export const canAccessProtected = (account: Account | null | undefined): boolean =>
  !!account && account.status === 'active';

// ── 승인 규칙 ─────────────────────────────────────────────────────────────────
// A.1 보정: 신청은 전부 member·pending 이므로 "무슨 역할로 승인하는가"를 승인 시점에 결정한다.
//   - member 로 승인: 같은 팀의 active team_lead 또는 HQ.
//   - team_lead 로 승인: HQ 만.
//   - hq 로 승인: 이 흐름으로 불가(부트스트랩 별도).
export type ApproveAsRole = 'member' | 'team_lead';
export const isApproveAsRole = (v: unknown): v is ApproveAsRole => v === 'member' || v === 'team_lead';

export function canApproveAs(approver: Account, applicant: Account, asRole: ApproveAsRole): boolean {
  if (approver.status !== 'active') return false;           // 승인자도 active 여야 함
  if (applicant.status !== 'pending') return false;         // 대기 상태만 승인 대상
  if (applicant.role === 'hq') return false;                // hq 는 이 흐름 대상 아님(부트스트랩 별도)
  if (applicant.role === 'team_lead') return approver.role === 'hq'; // (legacy) 팀장 신청은 HQ 전용
  if (asRole === 'team_lead') return approver.role === 'hq';
  // asRole === 'member'
  if (approver.role === 'hq') return true;
  if (approver.role === 'team_lead') return approver.team === applicant.team;
  return false;                                             // member 는 승인 권한 없음
}

// 승인자에게 노출 가능한 신청(목록 스코프): member 로라도 승인 가능한 대상만.
// → 팀장에게 타 팀 신청은 보이지 않는다. HQ 는 전체.
export const canViewApplication = (approver: Account, applicant: Account): boolean =>
  canApproveAs(approver, applicant, 'member');

// 정지 권한: HQ 는 누구든(자신 제외), team_lead 는 자기 팀 member 만.
export function canSuspend(actor: Account, target: Account): boolean {
  if (actor.status !== 'active') return false;
  if (actor.userId === target.userId) return false;         // 자기 자신 정지 방지
  if (target.role === 'hq') return false;                   // HQ 는 이 흐름으로 정지하지 않음
  if (actor.role === 'hq') return true;
  if (actor.role === 'team_lead') return target.role === 'member' && actor.team === target.team;
  return false;
}

// 비밀번호 초기화 권한(임시 비번 발급): 같은 팀장 또는 HQ 만.
// A.1 보정: member self-reset 분기 제거 — 확정 정책은 "회사 메신저 등으로 팀장에게 요청 →
// 같은 팀장 또는 HQ 가 임시 비번 발급"이며 제품 내 공개 초기화 신청 경로를 만들지 않는다.
export function canResetPassword(actor: Account, target: Account): boolean {
  if (actor.status !== 'active') return false;
  if (actor.role === 'hq') return true;
  if (actor.role === 'team_lead') return actor.team === target.team && target.role === 'member';
  return false;
}

// ── 상태 전이(이력 보존) ───────────────────────────────────────────────────────
const snapshot = (a: Account, event: AccountHistoryEvent, at: string, by?: string): AccountHistoryEntry =>
  ({ at, event, name: a.name, team: a.team, position: a.position, role: a.role, ...(by ? { by } : {}) });

// 승인: 상태 active 전환 + 승인 시점에 결정된 역할(member|team_lead) 부여(이력에 스냅샷).
export function applyApproval(account: Account, by: string, at: string, asRole: ApproveAsRole = 'member'): Account {
  const next: Account = { ...account, status: 'active', role: asRole, history: [...account.history] };
  next.history.push(snapshot(next, 'approved', at, by));
  return next;
}

// 정지: 상태만 suspended 로. 과거 기록·현재 스냅샷을 삭제하지 않는다.
export function applySuspension(account: Account, by: string, at: string): Account {
  const next: Account = { ...account, status: 'suspended', history: [...account.history] };
  next.history.push(snapshot(account, 'suspended', at, by));
  return next;
}

export function applyReinstatement(account: Account, by: string, at: string): Account {
  const next: Account = { ...account, status: 'active', history: [...account.history] };
  next.history.push(snapshot(next, 'reinstated', at, by));
  return next;
}

// 비번 초기화 기록(비밀번호 값은 담지 않는다 — 이벤트 사실만 이력에 남긴다).
export function recordPasswordReset(account: Account, by: string, at: string): Account {
  const next: Account = { ...account, history: [...account.history] };
  next.history.push(snapshot(account, 'password_reset', at, by));
  return next;
}

// ── HQ 부트스트랩 ─────────────────────────────────────────────────────────────
// 최초 HQ 는 하드코딩 아이디가 아니라 "서버 환경에 지정된 검증된 인증 사용자 ID"로 1회 지정한다.
// - bootstrapUserId: 서버 env(AUTH_BOOTSTRAP_HQ_USER_ID)에서 온 값(호출자가 주입).
// - hqExists: 디렉터리에 이미 active HQ 가 있으면 부트스트랩하지 않는다.
export interface HqBootstrapOptions { bootstrapUserId: string | undefined; hqExists: boolean; }
export function shouldBootstrapHq(userId: string, opts: HqBootstrapOptions): boolean {
  if (opts.hqExists) return false;
  if (!opts.bootstrapUserId) return false;
  return userId === opts.bootstrapUserId;
}
export function bootstrapHqAccount(base: Pick<Account, 'userId' | 'name' | 'position'>, at: string): Account {
  const account: Account = {
    userId: base.userId,
    name: base.name || 'HQ',
    team: 'hq',
    position: base.position || '총괄 관리자',
    role: 'hq',
    status: 'active',
    history: [{ at, event: 'created', name: base.name || 'HQ', team: 'hq', position: base.position || '총괄 관리자', role: 'hq' }]
  };
  return account;
}

// ── 클라이언트 노출용 안전 뷰(비밀번호·민감정보 없음) ──────────────────────────
export interface AccountPublicView {
  userId: string; name: string; team: AccountTeam; position: string; role: AccountRole; status: AccountStatus;
}
export const toPublicView = (a: Account): AccountPublicView =>
  ({ userId: a.userId, name: a.name, team: a.team, position: a.position, role: a.role, status: a.status });
