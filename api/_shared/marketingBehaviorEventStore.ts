import type { SafeMarketingBehaviorEvent } from './marketingBehaviorCollectionValidator.js';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Event Store — dev in-memory buffer v0
//
// ★ v0: DB 저장 없음. module-level in-memory 배열에만 보관. production 영속 저장이 아니다.
//   Vercel serverless는 인스턴스가 재활용/소멸되므로 영속 보장 없음(문서 명시).
//   UI에서 조회하지 않으며 GET route로 내용을 노출하지 않는다. (test helper는 내부 함수만)
// ────────────────────────────────────────────────────────────────────────────

const MAX_BUFFER_SIZE = 1000;

let buffer: SafeMarketingBehaviorEvent[] = [];
let totalAppended = 0;
let lastAppendedAt: string | null = null;

// 수용된 안전 이벤트 추가. 초과 시 오래된 것부터 제거(FIFO).
export function appendMarketingBehaviorEvents(events: SafeMarketingBehaviorEvent[]): number {
  if (!Array.isArray(events) || events.length === 0) return 0;
  for (const e of events) buffer.push(e);
  totalAppended += events.length;
  lastAppendedAt = new Date().toISOString();
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(buffer.length - MAX_BUFFER_SIZE);
  }
  return events.length;
}

// 통계만 반환(이벤트 내용은 노출하지 않음).
export function getMarketingBehaviorEventStoreStats(): {
  count: number;
  max: number;
  totalAppended: number;
  lastAppendedAt: string | null;
  persistent: false;
} {
  return { count: buffer.length, max: MAX_BUFFER_SIZE, totalAppended, lastAppendedAt, persistent: false };
}

// ★ server-only: summary 집계용 최근 safe events 복사본 반환(최신 limit개). route 아님.
//   raw event를 외부로 dump하지 않으며, 호출부(summary service)가 집계 후 insights만 노출한다.
export function getRecentMarketingBehaviorEventsForSummary(limit = MAX_BUFFER_SIZE): SafeMarketingBehaviorEvent[] {
  if (limit >= buffer.length) return [...buffer];
  return buffer.slice(buffer.length - limit);
}

// test 전용 초기화(route 아님 — 내부 함수).
export function clearMarketingBehaviorEventStoreForTest(): void {
  buffer = [];
  totalAppended = 0;
  lastAppendedAt = null;
}
