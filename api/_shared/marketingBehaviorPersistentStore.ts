import type { SafeMarketingBehaviorEvent } from './marketingBehaviorCollectionValidator.js';
import type {
  MarketingBehaviorStorage,
  MarketingBehaviorStorageStats,
  MarketingBehaviorStorageAppendResult,
  MarketingBehaviorStoredEvent
} from './marketingBehaviorStorageTypes.js';
import { appendMarketingBehaviorEvents, getMarketingBehaviorEventStoreStats } from './marketingBehaviorEventStore.js';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Persistent Store — adapter selection v0
//
// 환경에 맞는 저장소 adapter를 고른다.
//   - persistent 백엔드 env(KV/Postgres/Supabase 등)가 "감지되지 않으면" → dev_buffer(현 상태, 비영속).
//   - env가 감지되면 → 아직 실제 adapter 미구현이므로 pending(이벤트는 dev buffer로 보존해 손실 방지 +
//     "구현 필요" 신호). ★ 사용 가능한 저장소가 없는데 persistent라고 거짓 표시하지 않는다.
//   - local JSON/file 저장은 만들지 않는다(serverless 운영 persistence로 부적합).
//
// 저장 이벤트는 SafeMarketingBehaviorEvent(검증 통과) + storedAt/schemaVersion/shopId. PII 추가 없음.
// ────────────────────────────────────────────────────────────────────────────

const toStored = (
  events: SafeMarketingBehaviorEvent[],
  context?: { shopId?: string; schemaVersion?: number }
): MarketingBehaviorStoredEvent[] => {
  const storedAt = new Date().toISOString();
  const schemaVersion = context?.schemaVersion ?? 0;
  return events.map((e) => ({
    ...e,
    storedAt,
    schemaVersion,
    ...(context?.shopId ? { shopId: context.shopId } : {})
  }));
};

// dev in-memory buffer adapter — 기존 store 함수를 그대로 사용(비영속).
export function createDevBufferMarketingBehaviorStorage(): MarketingBehaviorStorage {
  return {
    async appendEvents(events, context): Promise<MarketingBehaviorStorageAppendResult> {
      const n = appendMarketingBehaviorEvents(toStored(events, context));
      return { ok: true, mode: 'dev_buffer', accepted: n, rejected: 0 };
    },
    async getStats(): Promise<MarketingBehaviorStorageStats> {
      const s = getMarketingBehaviorEventStoreStats();
      return {
        mode: 'dev_buffer',
        eventCount: s.count,
        maxEvents: s.max,
        persistentReady: false,
        note: 'In-memory dev buffer — 비영속(serverless 재시작/배포 시 소실). 누적 분석엔 영속 저장소 필요.'
      };
    }
  };
}

// pending adapter — persistent 백엔드가 env로 감지됐지만 코드 adapter는 미구현.
//   이벤트 손실을 막기 위해 dev buffer로 보존하되 mode='pending' + note로 "구현 필요"를 명확히 신호.
export function createPendingMarketingBehaviorStorage(note: string): MarketingBehaviorStorage {
  return {
    async appendEvents(events, context): Promise<MarketingBehaviorStorageAppendResult> {
      const n = appendMarketingBehaviorEvents(toStored(events, context)); // 손실 방지 fallback
      return { ok: true, mode: 'pending', accepted: n, rejected: 0, errors: [{ reason: note }] };
    },
    async getStats(): Promise<MarketingBehaviorStorageStats> {
      const s = getMarketingBehaviorEventStoreStats();
      return { mode: 'pending', eventCount: s.count, maxEvents: s.max, persistentReady: false, note };
    }
  };
}

// 영속 백엔드 env 감지 — 키 "존재"만 확인(secret 값 미사용). 없으면 null.
function detectPersistentBackend(): string | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) return 'Vercel KV (KV_REST_API_URL)';
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return 'Upstash Redis (UPSTASH_REDIS_REST_URL)';
  if (env.POSTGRES_URL || env.DATABASE_URL || env.NEON_DATABASE_URL) return 'Postgres (POSTGRES_URL/DATABASE_URL/NEON_DATABASE_URL)';
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return 'Supabase (SUPABASE_URL)';
  return null;
}

let cachedStorage: MarketingBehaviorStorage | null = null;

// 현재 환경에 맞는 저장소 반환. env 미감지 → dev_buffer / 감지 → pending(손실 없이 신호).
export function getMarketingBehaviorStorage(): MarketingBehaviorStorage {
  if (cachedStorage) return cachedStorage;
  const backend = detectPersistentBackend();
  cachedStorage = backend
    ? createPendingMarketingBehaviorStorage(`Persistent backend detected (${backend}) — adapter 미구현, dev buffer로 임시 보존 중. 영속화하려면 해당 adapter를 구현하세요.`)
    : createDevBufferMarketingBehaviorStorage();
  return cachedStorage;
}

// test 전용 reset.
export function resetMarketingBehaviorStorageForTest(): void {
  cachedStorage = null;
}
