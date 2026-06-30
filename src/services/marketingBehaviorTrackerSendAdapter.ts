import type { MarketingBehaviorEvent } from './marketingBehaviorTypes';
import { MARKETING_BEHAVIOR_FORBIDDEN_FIELDS, MARKETING_BEHAVIOR_FUTURE_ENDPOINT } from './marketingBehaviorCollectionPlan';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Tracker — Send Adapter v0
//
// tracker prototype이 만든 MarketingBehaviorEvent[]를 collection endpoint로 "선택적으로" 보낸다.
//   payload → MarketingBehaviorTransport → createMarketingBehaviorFetchTransport() → POST endpoint
//
// ★ 기본값 = 전송 없음. tracker는 transport 옵션이 주어졌을 때만 send를 호출한다(opt-in).
// ★ fetch는 send() 호출 시에만 실행 — 모듈 top-level에서 fetch/window/document 접근 금지.
//   실패(네트워크/non-2xx)는 throw하지 않고 ok:false 결과로 반환(UI 보호).
//   client 1차 PII guard(서버 validator가 최종) — forbidden key 발견 시 endpoint 호출 안 함.
//   forbidden 목록은 marketingBehaviorCollectionPlan 단일 소스를 소비.
// ────────────────────────────────────────────────────────────────────────────

export interface MarketingBehaviorSendResult {
  ok: boolean;
  accepted: number;
  rejected: number;
  status?: number;
  errors?: Array<{ index?: number; reason: string }>;
}

export interface MarketingBehaviorTransport {
  send: (events: MarketingBehaviorEvent[]) => Promise<MarketingBehaviorSendResult>;
}

export interface MarketingBehaviorFetchTransportOptions {
  endpoint?: string;
  shopId?: string;
  schemaVersion?: number;
  credentials?: RequestCredentials;
  debug?: boolean;
}

const MAX_BATCH = 50;

// forbidden key 검사 — 'name'은 정확 key만(공개 *Name 보호), 나머지는 정규화 substring.
// 목록은 plan 단일 소스에서 파생(드리프트 방지).
const normalizeKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const FORBIDDEN_SUBSTR = (MARKETING_BEHAVIOR_FORBIDDEN_FIELDS as readonly string[])
  .filter((f) => f !== 'name')
  .map(normalizeKey);
const isForbiddenKey = (key: string): boolean => {
  const n = normalizeKey(key);
  if (n === 'name') return true; // 정확 'name'만 — productName/bannerName/categoryName은 통과
  return FORBIDDEN_SUBSTR.some((t) => n.includes(t));
};
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const findForbiddenKey = (obj: unknown, depth = 0): string | null => {
  if (depth > 6) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) { const f = findForbiddenKey(item, depth + 1); if (f) return f; }
    return null;
  }
  if (!isPlainObject(obj)) return null;
  for (const key of Object.keys(obj)) {
    if (isForbiddenKey(key)) return key;
    const nested = findForbiddenKey(obj[key], depth + 1);
    if (nested) return nested;
  }
  return null;
};

const normErrors = (raw: unknown): Array<{ index?: number; reason: string }> | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((e): e is Record<string, unknown> => isPlainObject(e) && typeof e.reason === 'string')
    .map((e) => ({ index: typeof e.index === 'number' ? e.index : undefined, reason: String(e.reason) }));
  return out.length > 0 ? out : undefined;
};

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// fetch transport 생성. send() 호출 시에만 fetch 실행.
export function createMarketingBehaviorFetchTransport(
  options?: MarketingBehaviorFetchTransportOptions
): MarketingBehaviorTransport {
  const endpoint = options?.endpoint ?? MARKETING_BEHAVIOR_FUTURE_ENDPOINT; // 기본 '/api/marketing/behavior-events'
  const schemaVersion = options?.schemaVersion ?? 0;
  const shopId = options?.shopId;
  const credentials = options?.credentials;
  const debug = options?.debug ?? false;

  return {
    async send(events: MarketingBehaviorEvent[]): Promise<MarketingBehaviorSendResult> {
      // 빈 배열 → endpoint 호출 없이 no-op 성공(보낼 게 없음 = 성공, 더 명확/안전).
      if (!Array.isArray(events) || events.length === 0) {
        return { ok: true, accepted: 0, rejected: 0 };
      }
      // batch 초과 → client에서 reject(split 없음). 서버도 50 제한(이중 방어).
      if (events.length > MAX_BATCH) {
        if (debug && typeof console !== 'undefined') console.warn('[GODO behavior:send] batch too large', events.length);
        return { ok: false, accepted: 0, rejected: events.length, errors: [{ reason: `Batch too large: ${events.length} > ${MAX_BATCH}` }] };
      }
      // client 1차 PII guard — forbidden key 있으면 전송하지 않음.
      const forbidden = findForbiddenKey({ events, client: { schemaVersion, shopId } });
      if (forbidden) {
        if (debug && typeof console !== 'undefined') console.warn('[GODO behavior:send] forbidden field, not sending:', forbidden);
        return { ok: false, accepted: 0, rejected: events.length, errors: [{ reason: `Forbidden field detected: ${forbidden}` }] };
      }

      const body = JSON.stringify({ events, client: { schemaVersion, ...(shopId ? { shopId } : {}) } });
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(credentials ? { credentials } : {}),
          body
        });
        const status = res.status;
        let json: Record<string, unknown> = {};
        try { json = (await res.json()) as Record<string, unknown>; } catch { /* 비 JSON 응답 */ }

        if (!res.ok) {
          if (debug && typeof console !== 'undefined') console.warn('[GODO behavior:send] non-2xx', status);
          return { ok: false, accepted: num(json.accepted, 0), rejected: num(json.rejected, events.length), status, errors: normErrors(json.errors) };
        }
        return {
          ok: typeof json.ok === 'boolean' ? json.ok : true,
          accepted: num(json.accepted, 0),
          rejected: num(json.rejected, 0),
          status,
          errors: normErrors(json.errors)
        };
      } catch (err) {
        // 네트워크 실패 등 — throw하지 않고 ok:false. UI를 깨지 않는다.
        if (debug && typeof console !== 'undefined') console.warn('[GODO behavior:send] network error', err);
        return { ok: false, accepted: 0, rejected: events.length, errors: [{ reason: 'Network error' }] };
      }
    }
  };
}
