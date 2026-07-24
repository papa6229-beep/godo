// ────────────────────────────────────────────────────────────────────────────
// RC-2 (G4) — agentId 단일 별칭표
//
// 배경: 두 네임스페이스가 병존했다.
//   화면/제안 : 'stock', 'order', 'cs', 'marketing'   (data/agents.ts · managerOrchestrator)
//   런타임    : 'inventory_monitor', 'product_analyst' (defaultNativeAgentRuntime · jobPlanner)
// App 이 if-else 9줄로 수동 연결하고 있었고, 어긋나면 조용히 연결이 끊겼다(RC-2 RED R5).
//
// 정본은 **런타임의 안정적인 canonical agentId** 다. 화면·레거시 id 는 이 표에서만 변환한다.
// 화면 캐릭터명·표시명은 바꾸지 않는다(표시용 id 는 displayAgentId 로 되돌린다).
// ────────────────────────────────────────────────────────────────────────────

/** 레거시/화면 id → 런타임 canonical id. 이 표가 유일한 매핑 지점이다. */
const LEGACY_TO_CANONICAL: Record<string, string> = {
  manager: 'manager_agent',
  product: 'product_lead',
  order: 'product_analyst',
  stock: 'inventory_monitor',
  cs: 'cs_lead',
  delivery: 'inquiry_analyst',
  review: 'review_detector',
  marketing: 'marketing_lead',
  finance: 'trend_researcher'
};

/** canonical → 화면 id(역방향). 표시 계층이 기존 캐릭터를 계속 찾을 수 있게 한다. */
const CANONICAL_TO_DISPLAY: Record<string, string> = Object.entries(LEGACY_TO_CANONICAL)
  .reduce<Record<string, string>>((acc, [legacy, canonical]) => {
    if (!(canonical in acc)) acc[canonical] = legacy;
    return acc;
  }, {});

/** 어떤 표기의 agentId 든 런타임 canonical id 로 정규화한다. 이미 canonical 이면 그대로. */
export function toCanonicalAgentId(agentId: string | undefined | null): string {
  const id = String(agentId ?? '').trim();
  if (!id) return '';
  return LEGACY_TO_CANONICAL[id] ?? id;
}

/** canonical id → 화면(레거시) id. 매핑이 없으면 입력을 그대로 돌려준다. */
export function displayAgentId(agentId: string | undefined | null): string {
  const id = String(agentId ?? '').trim();
  if (!id) return '';
  return CANONICAL_TO_DISPLAY[id] ?? id;
}

/** 두 표기가 같은 에이전트를 가리키는가(네임스페이스 무관 비교). */
export const isSameAgent = (a: string | undefined, b: string | undefined): boolean => {
  const ca = toCanonicalAgentId(a);
  return !!ca && ca === toCanonicalAgentId(b);
};
