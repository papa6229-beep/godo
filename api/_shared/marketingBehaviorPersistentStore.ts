import type { SafeMarketingBehaviorEvent } from './marketingBehaviorCollectionValidator.js';
import type {
  MarketingBehaviorStorage,
  MarketingBehaviorStorageStats,
  MarketingBehaviorStorageAppendResult,
  MarketingBehaviorStoredEvent
} from './marketingBehaviorStorageTypes.js';
import { appendMarketingBehaviorEvents, getMarketingBehaviorEventStoreStats, getRecentMarketingBehaviorEventsForSummary } from './marketingBehaviorEventStore.js';
import { isPostgresMarketingBehaviorStorageConfigured, createPostgresMarketingBehaviorStorage } from './marketingBehaviorPostgresStore.js';

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
      return { ok: true, mode: 'dev_buffer', backend: 'dev_buffer', accepted: n, rejected: 0 };
    },
    async getStats(): Promise<MarketingBehaviorStorageStats> {
      const s = getMarketingBehaviorEventStoreStats();
      return {
        mode: 'dev_buffer',
        backend: 'dev_buffer',
        eventCount: s.count,
        maxEvents: s.max,
        persistentReady: false,
        note: 'In-memory dev buffer — 비영속(serverless 재시작/배포 시 소실). 누적 분석엔 영속 저장소 필요.'
      };
    },
    async getRecentEventsForAggregation(): Promise<SafeMarketingBehaviorEvent[]> {
      return getRecentMarketingBehaviorEventsForSummary();
    }
  };
}

// pending adapter — persistent 백엔드가 env로 감지됐지만 코드 adapter는 미구현.
//   이벤트 손실을 막기 위해 dev buffer로 보존하되 mode='pending' + note로 "구현 필요"를 명확히 신호.
export function createPendingMarketingBehaviorStorage(note: string): MarketingBehaviorStorage {
  return {
    async appendEvents(events, context): Promise<MarketingBehaviorStorageAppendResult> {
      const n = appendMarketingBehaviorEvents(toStored(events, context)); // 손실 방지 fallback
      return { ok: true, mode: 'pending', backend: 'pending', accepted: n, rejected: 0, errors: [{ reason: note }] };
    },
    async getStats(): Promise<MarketingBehaviorStorageStats> {
      const s = getMarketingBehaviorEventStoreStats();
      return { mode: 'pending', backend: 'pending', eventCount: s.count, maxEvents: s.max, persistentReady: false, note };
    },
    // pending 모드: 영속 미준비 → summary는 live로 보지 않는다(빈 배열 → collecting 표시).
    async getRecentEventsForAggregation(): Promise<SafeMarketingBehaviorEvent[]> {
      return [];
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
  // 1순위: Postgres가 완전 설정(backend=postgres + url)되면 실제 persistent adapter.
  if (isPostgresMarketingBehaviorStorageConfigured()) {
    cachedStorage = createPostgresMarketingBehaviorStorage();
    return cachedStorage;
  }
  // 2순위: 영속 backend env가 일부만 감지되면 pending(손실 없이 dev buffer 보존 + 신호).
  // 3순위: 아무 것도 없으면 dev_buffer(현 상태). ★ 거짓 persistent 표시 안 함.
  const backend = detectPersistentBackend();
  cachedStorage = backend
    ? createPendingMarketingBehaviorStorage(`Persistent backend detected (${backend}) — 아직 활성화되지 않음(backend 미선택 또는 미구현), dev buffer로 임시 보존 중.`)
    : createDevBufferMarketingBehaviorStorage();
  return cachedStorage;
}

// test 전용 reset.
export function resetMarketingBehaviorStorageForTest(): void {
  cachedStorage = null;
}
