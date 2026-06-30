import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { validateMarketingBehaviorCollectionRequest, isBehaviorOriginAllowed } from '../_shared/marketingBehaviorCollectionValidator.js';
import { getMarketingBehaviorStorage } from '../_shared/marketingBehaviorPersistentStore.js';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/marketing/behavior-events
//
// tracker prototype이 보낸 MarketingBehaviorEvent payload 수집 v0.
//   validate → PII reject → allowlist sanitize → dev in-memory buffer 저장 → accepted/rejected 반환.
//
// ★ 이번 v0: DB 저장 없음 · 대시보드 live 연결 없음 · 고도몰 WRITE 없음 · GA4/GTM/광고 API 없음.
//   GET 금지(이벤트 buffer를 노출하지 않는다). OPTIONS는 CORS preflight 최소 지원만.
// ────────────────────────────────────────────────────────────────────────────

interface ExtendedRequest extends IncomingMessage {
  body?: unknown;
}

const asObject = (v: unknown): Record<string, unknown> | undefined =>
  (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

export default async function handler(req: ExtendedRequest, res: VercelResponse) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

  // CORS preflight 최소 지원
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

  // POST 외 method 금지 — GET으로 buffer를 절대 노출하지 않는다.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ ok: false, accepted: 0, rejected: 0, errors: [{ index: -1, reason: 'Method not allowed. POST only.' }] });
    return;
  }

  // Origin allowlist (와일드카드 금지)
  if (!isBehaviorOriginAllowed(origin)) {
    res.status(403).json({ ok: false, accepted: 0, rejected: 0, errors: [{ index: -1, reason: 'Origin not allowed' }] });
    return;
  }

  const result = validateMarketingBehaviorCollectionRequest(req.body);

  // body/events 레벨 구조적 오류만 있는 경우 → 400 (이벤트가 하나도 파싱되지 않음)
  if (result.errors.length > 0 && result.acceptedEvents.length === 0 && result.rejected.length === 0) {
    res.status(400).json({ ok: false, accepted: 0, rejected: 0, errors: result.errors.map((reason) => ({ index: -1, reason })) });
    return;
  }

  // 수용된 이벤트를 storage interface로 저장(dev_buffer/pending — 환경에 따라). DB WRITE 아님.
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
