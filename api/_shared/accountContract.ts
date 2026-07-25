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

// 정본 팀 목록(sessionRole.VIEWER_ROLES 의 운영팀과 동일 어휘 재사용 — 새 팀 체계를 만들지 않는다).
// hq 는 팀이 아니라 역할이므로 소속 팀은 'hq' 표식으로 둔다.
export type TeamId = 'product' | 'cs' | 'marketing' | 'design';
export type AccountTeam = TeamId | 'hq';
export const CANONICAL_TEAMS: readonly TeamId[] = ['product', 'cs', 'marketing', 'design'] as const;
export const isTeamId = (v: unknown): v is TeamId =>
  typeof v === 'string' && (CANONICAL_TEAMS as readonly string[]).includes(v);
export const isAccountRole = (v: unknown): v is AccountRole =>
  v === 'hq' || v === 'team_lead' || v === 'member';

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

// 공개 가입 신청 입력(사용자에게 보이는 5개 항목). 비밀번호는 여기 포함되지 않는다
// (비밀번호는 관리형 인증이 직접 받아 저장하며 우리 제품 계층을 통과하지 않는다).
export interface SignupApplication {
  userId: string;             // 인증 공급자가 가입 직후 발급한 검증 ID
  name: string;
  team: string;               // 신청 값(검증 전) — 정본 팀만 허용
  position: string;           // 직책
  role: string;               // 신청 값(검증 전) — hq 는 거부
}

// ── 가입 검증·생성 ────────────────────────────────────────────────────────────
// 공개 가입에서 요청 가능한 역할: member, team_lead 만. hq 는 공개 가입에서 신청할 수 없다.
export const isPublicSignupRoleAllowed = (role: unknown): role is 'member' | 'team_lead' =>
  role === 'member' || role === 'team_lead';

export interface SignupResult {
  ok: boolean;
  account?: Account;
  errorCode?: 'INVALID_ROLE' | 'INVALID_TEAM' | 'INVALID_NAME' | 'INVALID_POSITION' | 'HQ_NOT_ALLOWED';
}

// 공개 가입 신청 → pending 계정 생성(또는 거부). 비밀번호는 다루지 않는다.
export function createSignupAccount(app: SignupApplication, at: string): SignupResult {
  const name = (app.name ?? '').trim();
  const position = (app.position ?? '').trim();
  if (!name) return { ok: false, errorCode: 'INVALID_NAME' };
  if (!position) return { ok: false, errorCode: 'INVALID_POSITION' };
  if (app.role === 'hq') return { ok: false, errorCode: 'HQ_NOT_ALLOWED' };
  if (!isPublicSignupRoleAllowed(app.role)) return { ok: false, errorCode: 'INVALID_ROLE' };
  if (!isTeamId(app.team)) return { ok: false, errorCode: 'INVALID_TEAM' };
  const role = app.role;
  const team: AccountTeam = app.team;
  const account: Account = {
    userId: app.userId,
    name,
    team,
    position,
    role,
    status: 'pending',
    history: [{ at, event: 'created', name, team, position, role }]
  };
  return { ok: true, account };
}

// ── 접근 판정 ─────────────────────────────────────────────────────────────────
// 보호 라우트 접근은 active 계정만. pending·suspended 는 거부.
export const canAccessProtected = (account: Account | null | undefined): boolean =>
  !!account && account.status === 'active';

// ── 승인 규칙 ─────────────────────────────────────────────────────────────────
// member 신청 → 같은 팀의 active team_lead 또는 HQ 만 승인.
// team_lead 신청 → HQ 만 승인.
// hq 계정은 이 흐름으로 승인되지 않는다(공개 가입 불가·부트스트랩 별도).
export function canApproveApplication(approver: Account, applicant: Account): boolean {
  if (approver.status !== 'active') return false;           // 승인자도 active 여야 함
  if (applicant.status !== 'pending') return false;         // 대기 상태만 승인 대상
  if (applicant.role === 'hq') return false;
  if (applicant.role === 'team_lead') return approver.role === 'hq';
  // applicant.role === 'member'
  if (approver.role === 'hq') return true;
  if (approver.role === 'team_lead') return approver.team === applicant.team;
  return false;                                             // member 는 승인 권한 없음
}

// 정지 권한: HQ 는 누구든(자신 제외), team_lead 는 자기 팀 member 만.
export function canSuspend(actor: Account, target: Account): boolean {
  if (actor.status !== 'active') return false;
  if (actor.userId === target.userId) return false;         // 자기 자신 정지 방지
  if (target.role === 'hq') return false;                   // HQ 는 이 흐름으로 정지하지 않음
  if (actor.role === 'hq') return true;
  if (actor.role === 'team_lead') return target.role === 'member' && actor.team === target.team;
  return false;
}

// 비밀번호 초기화 권한(임시 비번 발급): 자기 팀장 또는 HQ.
// (실제 비번은 관리형 인증이 설정한다. 이 판정은 "누가 초기화를 명령할 수 있는가"만 다룬다.)
export function canResetPassword(actor: Account, target: Account): boolean {
  if (actor.status !== 'active') return false;
  if (actor.role === 'hq') return true;
  if (actor.role === 'team_lead') return actor.team === target.team && target.role === 'member';
  return actor.userId === target.userId;                    // 본인은 자기 초기화 요청 가능
}

// ── 상태 전이(이력 보존) ───────────────────────────────────────────────────────
const snapshot = (a: Account, event: AccountHistoryEvent, at: string, by?: string): AccountHistoryEntry =>
  ({ at, event, name: a.name, team: a.team, position: a.position, role: a.role, ...(by ? { by } : {}) });

export function applyApproval(account: Account, by: string, at: string): Account {
  const next: Account = { ...account, status: 'active', history: [...account.history] };
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
