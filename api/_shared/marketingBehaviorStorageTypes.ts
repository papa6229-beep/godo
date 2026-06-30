import type { SafeMarketingBehaviorEvent } from './marketingBehaviorCollectionValidator.js';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Storage — interface types v0
//
// dev in-memory buffer와 future persistent(DB/KV) 저장소를 같은 인터페이스로 다룬다.
//   → endpoint는 storage 구현을 몰라도 appendEvents/getStats만 호출한다(갈아끼우기 가능).
//
// 저장 대상은 이미 validator를 통과한 SafeMarketingBehaviorEvent(허용 필드만)다.
//   storage layer는 PII를 새로 추가하지 않는다(IP·브라우저 UA 원문 저장 금지).
// 확장: 같은 패턴을 CS/상품/운영 이벤트 누적에도 재사용할 수 있도록 generic하지 않게,
//   대신 'BehaviorStorage'로 도메인 명시(후속 도메인은 별도 store로 동형 확장).
// ────────────────────────────────────────────────────────────────────────────

export type MarketingBehaviorStorageMode = 'dev_buffer' | 'persistent' | 'pending';

// 저장되는 이벤트 = sanitized event + 저장 메타. orderNo/memberKey/raw* 등은 애초에 없음(Safe 타입).
export type MarketingBehaviorStoredEvent = SafeMarketingBehaviorEvent & {
  storedAt: string;
  schemaVersion: number;
  shopId?: string;
};

export interface MarketingBehaviorStorageAppendResult {
  ok: boolean;
  mode: MarketingBehaviorStorageMode;
  accepted: number;
  rejected?: number;
  errors?: Array<{ reason: string }>;
}

export interface MarketingBehaviorStorageStats {
  mode: MarketingBehaviorStorageMode;
  eventCount?: number;
  maxEvents?: number;
  persistentReady: boolean;
  note?: string;
}

export interface MarketingBehaviorStorage {
  appendEvents: (
    events: SafeMarketingBehaviorEvent[],
    context?: { shopId?: string; schemaVersion?: number }
  ) => Promise<MarketingBehaviorStorageAppendResult>;
  getStats: () => Promise<MarketingBehaviorStorageStats>;
  // ★ server-only: summary 집계용 최근 safe events 조회. raw event 조회 "API"로 노출하지 않는다.
  //   (route로 dump하지 않으며, summary API는 이 결과를 집계해 insights만 반환한다.)
  getRecentEventsForAggregation: () => Promise<SafeMarketingBehaviorEvent[]>;
}
