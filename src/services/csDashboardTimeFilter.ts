// CS Dashboard Interactive Statistics v0 — 기간 필터(순수 함수).
//
// 날짜 없는 항목은 기간 필터에서 제외(전체 기간에만 포함). nowMs는 호출부가 주입(결정성).

import type { CsDashInquiry, CsDashReview } from './csTeamDashboardFacts';
import type { CsCompletedWorkItem } from './csWorkCompletionState';
import type { CsApprovalQueueItem } from './csApprovalQueueBridge';

export type CsTimeRange = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom';
// pill 목록(직접 선택은 컴포넌트가 별도 버튼으로 처리).
export const CS_TIME_RANGES: Array<{ key: CsTimeRange; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'today', label: '오늘' },
  { key: '7d', label: '최근 7일' },
  { key: '30d', label: '최근 30일' },
  { key: 'month', label: '이번 달' }
];

export interface CsCustomRange { start?: string; end?: string } // 'YYYY-MM-DD'

// 직접 선택 유효성: 둘 다 있고 종료일 >= 시작일.
export const isValidCustomRange = (c?: CsCustomRange): boolean =>
  !!c && !!c.start && !!c.end && c.start <= c.end;

const dayStr = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const monthStr = (ms: number): string => new Date(ms).toISOString().slice(0, 7);

// 날짜 문자열이 기간에 포함되는가. all=항상, 날짜없음=false(기간 필터 제외).
export function inCsTimeRange(dateStr: string | undefined, range: CsTimeRange, nowMs: number, custom?: CsCustomRange): boolean {
  if (range === 'all') return true;
  const s = (dateStr || '').trim();
  if (!s) return false;
  if (range === 'custom') {
    if (!isValidCustomRange(custom)) return false;
    const day = s.slice(0, 10);
    return day >= (custom!.start as string) && day <= (custom!.end as string);
  }
  const t = Date.parse(s.replace(' ', 'T'));
  if (Number.isNaN(t)) return false;
  if (range === 'today') return dayStr(t) === dayStr(nowMs);
  if (range === 'month') return monthStr(t) === monthStr(nowMs);
  const days = range === '7d' ? 7 : 30;
  return t <= nowMs && nowMs - t <= days * 86400000;
}

// orders는 호출부의 구체 타입(RevenueOrderLite 등)을 보존하도록 제네릭.
export function filterCsInputsByTime<O extends { orderDate?: string }>(
  inputs: { inquiries: CsDashInquiry[]; reviews: CsDashReview[]; orders: O[]; completed?: CsCompletedWorkItem[]; approvals?: CsApprovalQueueItem[] },
  range: CsTimeRange,
  nowMs: number,
  custom?: CsCustomRange
): { inquiries: CsDashInquiry[]; reviews: CsDashReview[]; orders: O[]; completed: CsCompletedWorkItem[]; approvals: CsApprovalQueueItem[] } {
  // custom인데 범위가 유효하지 않으면 '전체'로 폴백(빈 화면 방지).
  const eff: CsTimeRange = range === 'custom' && !isValidCustomRange(custom) ? 'all' : range;
  return {
    inquiries: (inputs.inquiries || []).filter((q) => inCsTimeRange(q.createdAt, eff, nowMs, custom)),
    reviews: (inputs.reviews || []).filter((r) => inCsTimeRange(r.createdAt, eff, nowMs, custom)),
    orders: (inputs.orders || []).filter((o) => inCsTimeRange(o.orderDate, eff, nowMs, custom)),
    completed: (inputs.completed || []).filter((c) => inCsTimeRange(c.completedAt, eff, nowMs, custom)),
    approvals: (inputs.approvals || []).filter((a) => inCsTimeRange(a.createdAt, eff, nowMs, custom))
  };
}
