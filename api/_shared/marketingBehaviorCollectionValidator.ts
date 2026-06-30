// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Collection — Validator v0 (서버 신뢰 경계)
//
// tracker prototype이 보낸 payload를 서버에서 검증/정화한다. 서버는 클라이언트가 보낸
// 어떤 것도 신뢰하지 않으므로, allowlist/forbidden/한도를 이 파일이 자체 보유한다(방어심층).
//   → src/services/marketingBehaviorCollectionPlan.ts 의 계약과 의도적으로 동일하게 유지(미러).
//
// 절대 안 함: DB 저장 · 고도몰 WRITE · GA4/GTM · 외부 fetch. 순수 검증 함수.
// PII 금지: forbidden key deep-scan + email/전화 value 패턴 reject. allowlist 외 필드는 drop.
// ────────────────────────────────────────────────────────────────────────────

// 검증을 통과한 안전한 이벤트(허용 필드만). src MarketingBehaviorEvent와 동일 형태.
export interface SafeMarketingBehaviorEvent {
  eventId: string;
  sessionIdHash: string;
  occurredAt: string;
  eventName: string;
  source?: string;
  medium?: string;
  campaign?: string;
  referrerHost?: string;
  pagePath?: string;
  pageTitle?: string;
  bannerId?: string;
  bannerName?: string;
  categoryId?: string;
  categoryName?: string;
  productId?: string;
  productName?: string;
  searchTerm?: string;
  orderIdHash?: string;
  revenue?: number;
}

export interface MarketingBehaviorValidationResult {
  ok: boolean;
  acceptedEvents: SafeMarketingBehaviorEvent[];
  rejected: Array<{ index: number; reason: string }>;
  errors: string[]; // 구조적 오류(body/events 레벨)
}

// ── allowlist / 한도 (계약 미러) ──────────────────────────────────────────────
export const BEHAVIOR_EVENT_NAMES = [
  'visit', 'landing', 'banner_click', 'category_click', 'product_view',
  'search', 'add_to_cart', 'checkout_start', 'purchase', 'exit'
] as const;

export const BEHAVIOR_SOURCES = [
  'blog', 'search', 'ad', 'sns', 'direct', 'referral', 'unknown'
] as const;

export const BEHAVIOR_MAX_EVENTS_PER_BATCH = 50;

// 허용 필드(이외는 drop) — string 필드 길이 한도 포함.
const STRING_FIELD_LIMITS: Record<string, number> = {
  eventId: 120, sessionIdHash: 160, occurredAt: 40, eventName: 40, source: 40,
  medium: 120, campaign: 120, referrerHost: 160, pagePath: 240, pageTitle: 160,
  bannerId: 120, bannerName: 120, categoryId: 120, categoryName: 120,
  productId: 120, productName: 120, searchTerm: 120, orderIdHash: 160
};
const ALLOWED_FIELDS = new Set<string>([...Object.keys(STRING_FIELD_LIMITS), 'revenue']);

// 자유 텍스트 필드(전화번호 패턴 value scan 대상 — id/hash는 제외해 오탐 방지).
const FREE_TEXT_FIELDS = new Set<string>(['pageTitle', 'bannerName', 'categoryName', 'productName', 'searchTerm', 'campaign']);

// ── PII 금지 key ──────────────────────────────────────────────────────────────
// 'name'은 정확 key만 금지(bannerName/productName 등 공개정보 보호). 나머지는 변형 포함.
export const BEHAVIOR_FORBIDDEN_FIELDS = [
  'name', 'phone', 'email', 'address', 'customerName', 'contact', 'memberKey', 'orderNo', 'rawSessionId', 'rawUserId'
] as const;
const FORBIDDEN_SUBSTR = ['phone', 'email', 'address', 'contact', 'memberkey', 'orderno', 'customername', 'rawsessionid', 'rawuserid'];
const normalizeKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const isForbiddenKey = (key: string): boolean => {
  const n = normalizeKey(key);
  if (n === 'name') return true; // 정확 'name'만(공개 *Name 필드는 통과)
  return FORBIDDEN_SUBSTR.some((t) => n.includes(t));
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d[\d\-\s]{8,}\d)/; // 10자리+ 숫자/하이픈 (자유 텍스트 한정)

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// 객체 전체에서 금지 key 재귀 탐색(중첩 방어).
const findForbiddenKey = (obj: unknown, depth = 0): string | null => {
  if (depth > 6 || !isPlainObject(obj)) return null;
  for (const key of Object.keys(obj)) {
    if (isForbiddenKey(key)) return key;
    const nested = findForbiddenKey(obj[key], depth + 1);
    if (nested) return nested;
  }
  return null;
};

// 단일 이벤트 검증 → 안전 이벤트 또는 거부 사유.
function validateEvent(raw: unknown): { ok: true; event: SafeMarketingBehaviorEvent } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) return { ok: false, reason: 'Event is not an object' };

  // PII forbidden key deep scan
  const forbidden = findForbiddenKey(raw);
  if (forbidden) return { ok: false, reason: `Forbidden field detected: ${forbidden}` };

  // 필수 필드
  const eventId = raw.eventId;
  const sessionIdHash = raw.sessionIdHash;
  const eventName = raw.eventName;
  const occurredAt = raw.occurredAt;
  if (typeof eventId !== 'string' || eventId.length === 0) return { ok: false, reason: 'Missing/invalid eventId' };
  if (typeof sessionIdHash !== 'string' || sessionIdHash.length === 0) return { ok: false, reason: 'Missing/invalid sessionIdHash' };
  if (typeof eventName !== 'string' || !(BEHAVIOR_EVENT_NAMES as readonly string[]).includes(eventName)) return { ok: false, reason: 'Invalid eventName' };
  if (typeof occurredAt !== 'string' || Number.isNaN(Date.parse(occurredAt))) return { ok: false, reason: 'Invalid occurredAt' };

  // source: 없으면 optional / 빈문자열은 drop / 허용 외 값은 reject(더 안전한 방향)
  if (raw.source !== undefined && raw.source !== '') {
    if (typeof raw.source !== 'string' || !(BEHAVIOR_SOURCES as readonly string[]).includes(raw.source)) {
      return { ok: false, reason: 'Invalid source' };
    }
  }

  // 필드별: 타입/길이/PII value scan + allowlist sanitize
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_FIELDS.has(key)) continue; // unknown field drop
    const val = raw[key];
    if (val === undefined || val === '') continue;
    if (key === 'revenue') {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) return { ok: false, reason: 'Invalid revenue' };
      out.revenue = val;
      continue;
    }
    if (typeof val !== 'string') return { ok: false, reason: `Invalid type for ${key}` };
    const limit = STRING_FIELD_LIMITS[key] ?? 120;
    if (val.length > limit) return { ok: false, reason: `Field too long: ${key}` }; // truncate보다 reject(보안 명확)
    if (EMAIL_RE.test(val)) return { ok: false, reason: `Email-like value in ${key}` };
    if (FREE_TEXT_FIELDS.has(key) && PHONE_RE.test(val)) return { ok: false, reason: `Phone-like value in ${key}` };
    out[key] = val;
  }

  return { ok: true, event: out as unknown as SafeMarketingBehaviorEvent };
}

// ── 메인: 수집 요청 검증 ──────────────────────────────────────────────────────
export function validateMarketingBehaviorCollectionRequest(input: unknown): MarketingBehaviorValidationResult {
  const errors: string[] = [];
  const acceptedEvents: SafeMarketingBehaviorEvent[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];

  if (!isPlainObject(input)) {
    return { ok: false, acceptedEvents, rejected, errors: ['Body must be an object'] };
  }

  // client는 optional object지만 PII는 여기서도 금지.
  if (input.client !== undefined) {
    if (!isPlainObject(input.client)) errors.push('client must be an object');
    else {
      const f = findForbiddenKey(input.client);
      if (f) errors.push(`Forbidden field in client: ${f}`);
    }
  }

  const events = input.events;
  if (!Array.isArray(events)) {
    errors.push('events must be an array');
    return { ok: false, acceptedEvents, rejected, errors };
  }
  if (events.length === 0) {
    errors.push('events must not be empty');
    return { ok: false, acceptedEvents, rejected, errors };
  }
  if (events.length > BEHAVIOR_MAX_EVENTS_PER_BATCH) {
    errors.push(`Too many events: ${events.length} > ${BEHAVIOR_MAX_EVENTS_PER_BATCH}`);
    return { ok: false, acceptedEvents, rejected, errors };
  }

  events.forEach((ev, index) => {
    const r = validateEvent(ev);
    if (r.ok) acceptedEvents.push(r.event);
    else rejected.push({ index, reason: r.reason });
  });

  // 구조적 오류(client PII 등)가 있거나 수용된 이벤트가 0이면 ok:false.
  const ok = errors.length === 0 && acceptedEvents.length > 0;
  return { ok, acceptedEvents, rejected, errors };
}

// ── Origin allowlist (route에서 사용) ─────────────────────────────────────────
// 와일드카드 금지. env(GODO_BEHAVIOR_ALLOWED_ORIGINS) 우선, 없으면 dev localhost만.
// Origin 헤더 없음(서버-서버/same-origin)은 허용. 실제 고도몰 도메인은 env에 추가해야 함.
export function isBehaviorOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // Origin 헤더 부재(same-origin/curl/server)
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const env = g.process?.env?.GODO_BEHAVIOR_ALLOWED_ORIGINS;
  if (env && env.trim().length > 0) {
    return env.split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
  }
  // env 미설정: dev localhost/127.0.0.1만 허용(production 미지 도메인은 conservative reject).
  return /^https?:\/\/localhost(?::\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin);
}
