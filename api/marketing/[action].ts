import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { validateMarketingBehaviorCollectionRequest, isBehaviorOriginAllowed } from '../_shared/marketingBehaviorCollectionValidator.js';
import { getMarketingBehaviorStorage } from '../_shared/marketingBehaviorPersistentStore.js';
import { buildMarketingBehaviorSummaryResponse } from '../_shared/marketingBehaviorSummaryService.js';

// ────────────────────────────────────────────────────────────────────────────
// /api/marketing/[action] — Vercel demo gateway adapter (route entry 1개로 통합)
//
// URL은 그대로 유지된다(프론트/문서 변경 없음):
//   POST /api/marketing/behavior-events   → 수집(validate/PII reject/storage append)  (구 behavior-events.ts)
//   GET  /api/marketing/behavior-summary  → 집계 insights only (raw event 미노출)       (구 behavior-summary.ts)
//
// ★ 기능 통합이 아니라 entry adapter 통합이다. 도메인 로직은 api/_shared service layer에 그대로 보존.
//   Vercel Hobby의 12 함수 제한은 데모 배포 제약일 뿐 — 장기 아키텍처를 여기 종속시키지 않는다.
// ────────────────────────────────────────────────────────────────────────────

interface ExtendedRequest extends IncomingMessage {
  body?: unknown;
}

const asObject = (v: unknown): Record<string, unknown> | undefined =>
  (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

// 동적 라우트 마지막 경로 세그먼트(action) — URL을 그대로 받아 분기.
const actionOf = (req: IncomingMessage): string => {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return '';
  }
};

// ── POST /api/marketing/behavior-events — 수집(구 behavior-events.ts 로직 보존) ──
async function handleCollect(req: ExtendedRequest, res: VercelResponse) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    if (origin && isBehaviorOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ ok: false, accepted: 0, rejected: 0, errors: [{ index: -1, reason: 'Method not allowed. POST only.' }] });
    return;
  }
  if (!isBehaviorOriginAllowed(origin)) {
    res.status(403).json({ ok: false, accepted: 0, rejected: 0, errors: [{ index: -1, reason: 'Origin not allowed' }] });
    return;
  }

  const result = validateMarketingBehaviorCollectionRequest(req.body);
  if (result.errors.length > 0 && result.acceptedEvents.length === 0 && result.rejected.length === 0) {
    res.status(400).json({ ok: false, accepted: 0, rejected: 0, errors: result.errors.map((reason) => ({ index: -1, reason })) });
    return;
  }

  const client = asObject(asObject(req.body)?.client);
  const shopId = typeof client?.shopId === 'string' ? client.shopId : undefined;
  const schemaVersion = typeof client?.schemaVersion === 'number' ? client.schemaVersion : 0;
  const storage = getMarketingBehaviorStorage();
  const appendResult = await storage.appendEvents(result.acceptedEvents, { shopId, schemaVersion });

  const errors = [
    ...result.errors.map((reason) => ({ index: -1, reason })),
    ...result.rejected
  ];

  res.status(200).json({
    ok: result.ok,
    accepted: appendResult.accepted,
    rejected: result.rejected.length,
    mode: appendResult.mode,
    storage: {
      mode: appendResult.mode,
      backend: appendResult.backend ?? appendResult.mode,
      persistentReady: appendResult.mode === 'persistent'
    },
    ...(errors.length > 0 ? { errors } : {})
  });
}

// ── GET /api/marketing/behavior-summary — 집계 insights only(구 behavior-summary.ts 로직 보존) ──
async function handleSummary(req: IncomingMessage, res: VercelResponse) {
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

export default async function handler(req: ExtendedRequest, res: VercelResponse) {
  const action = actionOf(req);
  if (action === 'behavior-events') return handleCollect(req, res);
  if (action === 'behavior-summary') return handleSummary(req, res);
  res.status(404).json({ ok: false, errorMessage: `Unknown marketing behavior action: ${action}` });
}
