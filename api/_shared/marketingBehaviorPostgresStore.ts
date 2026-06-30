import type { Pool } from 'pg';
import type { SafeMarketingBehaviorEvent } from './marketingBehaviorCollectionValidator.js';
import type { MarketingBehaviorStorage, MarketingBehaviorStorageAppendResult, MarketingBehaviorStorageStats } from './marketingBehaviorStorageTypes.js';
import { appendMarketingBehaviorEvents } from './marketingBehaviorEventStore.js';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Postgres Store v0 (env-gated persistent backend)
//
// env가 준비되면(GODO_BEHAVIOR_STORAGE_BACKEND=postgres + DATABASE_URL/POSTGRES_URL)
//   sanitized behavior event를 Postgres에 저장하고 summary용 recent events를 읽는다.
//
// ★ pg는 lazy dynamic import — top-level에서 DB 연결/Pool 생성 강제 안 함(serverless friendly).
//   env 없으면 이 adapter는 선택되지 않으며 Pool도 만들지 않는다.
// ★ 자동 DDL 없음(table 생성은 사용자가 직접 — schema 문서 참고). secret(connection string)은
//   로그/응답/note에 절대 노출하지 않는다(backend 이름·table 이름만).
// ★ 저장 금지: IP/userAgent 원문 · name/phone/email/address · orderNo 원문 · memberKey · raw*.
//   searchTerm은 v0 persistent schema에서 제외(자유 입력에 민감정보 혼입 가능 — 보수적).
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_TABLE = 'marketing_behavior_events';
const DEFAULT_MAX_EVENTS = 10000;
const RECENT_LIMIT_DEFAULT = 1000;
const RECENT_LIMIT_MAX = 5000;

const getEnv = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

// 설정 여부: backend=postgres + connection url 존재. 값은 확인만(미노출).
export function isPostgresMarketingBehaviorStorageConfigured(): boolean {
  const env = getEnv();
  const backend = (env.GODO_BEHAVIOR_STORAGE_BACKEND ?? '').toLowerCase();
  const url = env.DATABASE_URL ?? env.POSTGRES_URL ?? '';
  return backend === 'postgres' && url.trim().length > 0;
}

// table name sanitize — 안전 identifier만(SQL injection 방지). 위반 시 기본값.
export function getPostgresMarketingBehaviorTableName(): string {
  const raw = getEnv().GODO_BEHAVIOR_POSTGRES_TABLE;
  if (raw && /^[A-Za-z0-9_]+$/.test(raw)) return raw;
  return DEFAULT_TABLE;
}

const getMaxEvents = (): number => {
  const raw = getEnv().GODO_BEHAVIOR_POSTGRES_MAX_EVENTS;
  const n = raw && /^\d+$/.test(raw) ? Number(raw) : DEFAULT_MAX_EVENTS;
  return n > 0 ? n : DEFAULT_MAX_EVENTS;
};

// ── lazy Pool (연결은 실제 query 시점에만) ───────────────────────────────────
let pool: Pool | null = null;
async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const env = getEnv();
  const connectionString = env.DATABASE_URL ?? env.POSTGRES_URL;
  const ssl = (env.GODO_BEHAVIOR_POSTGRES_SSL ?? '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined;
  const { Pool: PgPool } = await import('pg');
  pool = new PgPool({ connectionString, ssl, max: 3 });
  return pool;
}

// 저장 컬럼 순서(searchTerm 제외, stored_at은 DB DEFAULT NOW()).
const INSERT_COLUMNS = [
  'shop_id', 'event_id', 'session_id_hash', 'event_name', 'source', 'occurred_at',
  'page_path', 'page_title', 'referrer_host', 'campaign', 'medium',
  'banner_id', 'banner_name', 'category_id', 'category_name', 'product_id', 'product_name',
  'order_id_hash', 'revenue', 'schema_version'
];

export function mapEventToPostgresRow(e: SafeMarketingBehaviorEvent, context?: { shopId?: string; schemaVersion?: number }): unknown[] {
  return [
    context?.shopId ?? 'default',
    e.eventId,
    e.sessionIdHash,
    e.eventName,
    e.source ?? 'unknown',
    e.occurredAt,
    e.pagePath ?? null,
    e.pageTitle ?? null,
    e.referrerHost ?? null,
    e.campaign ?? null,
    e.medium ?? null,
    e.bannerId ?? null,
    e.bannerName ?? null,
    e.categoryId ?? null,
    e.categoryName ?? null,
    e.productId ?? null,
    e.productName ?? null,
    e.orderIdHash ?? null,
    e.revenue ?? null,
    context?.schemaVersion ?? 0
    // ★ searchTerm 미저장(보수적). 주소·단말 원문·고객 식별 PII 컬럼 없음.
  ];
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
export function mapPostgresRowToSafeEvent(row: Record<string, unknown>): SafeMarketingBehaviorEvent {
  const occurred = row.occurred_at;
  const occurredAt = occurred instanceof Date ? occurred.toISOString() : String(occurred ?? '');
  const ev: SafeMarketingBehaviorEvent = {
    eventId: String(row.event_id ?? ''),
    sessionIdHash: String(row.session_id_hash ?? ''),
    occurredAt,
    eventName: String(row.event_name ?? ''),
    source: str(row.source),
    medium: str(row.medium),
    campaign: str(row.campaign),
    referrerHost: str(row.referrer_host),
    pagePath: str(row.page_path),
    pageTitle: str(row.page_title),
    bannerId: str(row.banner_id),
    bannerName: str(row.banner_name),
    categoryId: str(row.category_id),
    categoryName: str(row.category_name),
    productId: str(row.product_id),
    productName: str(row.product_name),
    orderIdHash: str(row.order_id_hash),
    revenue: typeof row.revenue === 'number' ? row.revenue : (row.revenue != null ? Number(row.revenue) : undefined)
  };
  return ev;
}

const toStored = (events: SafeMarketingBehaviorEvent[]): SafeMarketingBehaviorEvent[] => events;

export function createPostgresMarketingBehaviorStorage(): MarketingBehaviorStorage {
  const table = getPostgresMarketingBehaviorTableName(); // sanitized identifier
  return {
    async appendEvents(events, context): Promise<MarketingBehaviorStorageAppendResult> {
      if (!Array.isArray(events) || events.length === 0) return { ok: true, mode: 'persistent', accepted: 0, rejected: 0 };
      const placeholders = INSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${INSERT_COLUMNS.join(', ')}) VALUES (${placeholders}) ON CONFLICT (shop_id, event_id) DO NOTHING`;
      try {
        const p = await getPool();
        const client = await p.connect();
        let accepted = 0;
        try {
          for (const e of events) {
            const res = await client.query(sql, mapEventToPostgresRow(e, context));
            accepted += res.rowCount ?? 0;
          }
        } finally { client.release(); }
        return { ok: true, mode: 'persistent', backend: 'postgres', accepted, rejected: 0 };
      } catch {
        // 손실 방지: dev buffer로 보존. persistent 성공처럼 표시하지 않는다(secret 미노출).
        const n = appendMarketingBehaviorEvents(toStored(events));
        return { ok: true, mode: 'dev_buffer', backend: 'dev_buffer', accepted: n, rejected: 0, errors: [{ reason: 'Postgres write failed; buffered to dev_buffer.' }] };
      }
    },
    async getStats(): Promise<MarketingBehaviorStorageStats> {
      // ★ DB 미연결 — config 기반 readiness만 보고(COUNT query 금지: v0 과한 query 회피).
      return {
        mode: 'persistent',
        backend: 'postgres',
        eventCount: undefined,
        maxEvents: getMaxEvents(),
        persistentReady: true,
        note: `Postgres backend (table: ${table})`
      };
    },
    async getRecentEventsForAggregation(): Promise<SafeMarketingBehaviorEvent[]> {
      const limit = Math.min(RECENT_LIMIT_MAX, RECENT_LIMIT_DEFAULT);
      try {
        const p = await getPool();
        const res = await p.query(`SELECT * FROM ${table} ORDER BY occurred_at DESC LIMIT $1`, [limit]);
        return (res.rows as Record<string, unknown>[]).map(mapPostgresRowToSafeEvent);
      } catch {
        return []; // 읽기 실패 → summary는 empty(안전). UI 깨지 않음.
      }
    }
  };
}
