import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { buildMarketingBehaviorSummaryResponse } from '../_shared/marketingBehaviorSummaryService.js';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/marketing/behavior-summary
//
// 안전하게 "집계된" 고객 행동 summary(insights)만 반환한다.
//   ★ raw events / sessionIdHash / orderIdHash / eventId 목록을 절대 반환하지 않는다.
//   ★ GET /api/marketing/behavior-events(raw dump)는 만들지 않는다. demo는 client fallback에서 처리.
//   POST는 405. OPTIONS 최소 지원.
// ────────────────────────────────────────────────────────────────────────────

export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ ok: false, errorMessage: 'Method not allowed. GET only.' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const q = url.searchParams;
  const startDate = q.get('startDate') ?? undefined;
  const endDate = q.get('endDate') ?? undefined;
  const rangeLabel = q.get('rangeLabel') ?? undefined;
  const topLimitRaw = q.get('topLimit');
  const topLimit = topLimitRaw && /^\d+$/.test(topLimitRaw) ? Number(topLimitRaw) : undefined;

  const summary = await buildMarketingBehaviorSummaryResponse({ startDate, endDate, rangeLabel, topLimit });
  res.status(200).json(summary);
}
