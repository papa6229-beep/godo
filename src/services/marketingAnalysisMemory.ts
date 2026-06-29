// Marketing Analysis Memory v0 — 사용자가 요청한 분석을 비PII로 저장하고, 다음 유사 질문 힌트로 쓴다.
//
// 원칙(절대):
//   - raw order/customer/orderNo/memberKey/이름/전화/이메일/주소 저장 금지.
//   - 질문 원문은 PII mask 후 저장. plan summary / chart summary / resultType / requiredData / timestamp만.
//   - "학습" 아님 — 최근 분석 패턴 힌트. capability validation이 항상 우선.
//   - localStorage 한 key(godo.marketing.analysisMemory.v0)만 사용. 저장 실패가 앱을 깨면 안 됨.

import type { MarketingIntelligencePlan } from './marketingIntelligencePlanner';
import type { MarketingChatChartArtifact } from './marketingChatChartSpec';

export type MarketingAnalysisMemoryEntry = {
  id: string;
  createdAt: string;
  originalQuestionMasked: string;
  normalizedQuestion: string;
  resultType: 'calculated' | 'partial_with_proxy' | 'required_data' | 'unsupported' | 'failed';
  plannerSource: 'marketingIntelligencePlanner' | 'marketingLlmPlannerAdapter' | 'marketingChatChartSpec' | 'fallback';
  planSummary: {
    goal?: string;
    metrics: string[];
    dimensions: string[];
    segments: string[];
    filters: string[];
    comparison?: string;
    timeBucket?: string;
    chartType?: string;
  };
  chartSummary: {
    chartType?: string;
    seriesCount?: number;
    bucketCount?: number;
    primaryMetric?: string;
  };
  requiredData: string[];
  failureReason?: string;
  userFeedback?: 'positive' | 'negative' | 'needs_better_chart' | 'needs_deeper_analysis';
};

export const MARKETING_ANALYSIS_MEMORY_KEY = 'godo.marketing.analysisMemory.v0';
export const MARKETING_ANALYSIS_MEMORY_MAX = 100;

// ── PII 마스킹 (질문 원문 저장 전 비식별) ────────────────────────────────────
export function maskMarketingMemoryText(text: string): string {
  let t = String(text || '');
  t = t.replace(/01[016789]-?\d{3,4}-?\d{4}/g, '[전화]');
  t = t.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[이메일]');
  t = t.replace(/\b\d{6}-?\d{7}\b/g, '[주민]');
  t = t.replace(/syn_member_\w+/g, '[회원]');
  t = t.replace(/\b\d{2,}-\d{2,}-\d{2,}\b/g, '[번호]');
  // 카드/계좌형 긴 숫자
  t = t.replace(/\b\d{10,}\b/g, '[번호]');
  return t.trim().slice(0, 200);
}

const tokenize = (s: string): string[] =>
  String(s || '').toLowerCase().replace(/[^a-z0-9가-힣\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);

// ── entry 생성 (집계/계획만, raw 금지) ───────────────────────────────────────
export function createMarketingAnalysisMemoryEntry(input: {
  question: string;
  plan?: MarketingIntelligencePlan | null;
  artifact?: MarketingChatChartArtifact | null;
  resultType?: string;
  plannerSource?: string;
  failureReason?: string;
  nowMs?: number;
}): MarketingAnalysisMemoryEntry {
  const nowMs = input.nowMs ?? Date.now();
  const plan = input.plan ?? null;
  const planFromArtifact = (input.artifact?.plan ?? null) as Record<string, unknown> | null;
  const cs = input.artifact?.chartSpec;
  const masked = maskMarketingMemoryText(input.question);
  const resultType = (input.resultType as MarketingAnalysisMemoryEntry['resultType']) ?? 'calculated';
  const plannerSource = (input.plannerSource as MarketingAnalysisMemoryEntry['plannerSource']) ?? (input.artifact?.source === 'marketingLlmPlannerAdapter' ? 'marketingLlmPlannerAdapter' : input.artifact?.source === 'marketingChatChartSpec' ? 'marketingChatChartSpec' : 'marketingIntelligencePlanner');

  const planSummary = {
    goal: plan?.goal ?? (planFromArtifact?.goal as string | undefined),
    metrics: (plan?.requestedMetrics ?? (planFromArtifact?.requestedMetrics as string[] | undefined) ?? []).slice(0, 12),
    dimensions: (plan?.dimensions ?? (planFromArtifact?.dimensions as string[] | undefined) ?? []).map(String).slice(0, 8),
    segments: (plan?.segments ?? []).map((s) => s.key).slice(0, 6),
    filters: (plan?.filters ?? []).map((f) => `${f.kind}:${f.key}`).slice(0, 6),
    comparison: plan?.comparison ?? (planFromArtifact?.comparison as string | undefined),
    timeBucket: plan?.timeBucket ?? (planFromArtifact?.timeBucket as string | undefined),
    chartType: cs?.chartType ?? plan?.chartRecommendation?.chartType
  };
  // 메모리에 들어가는 metric/dimension/segment/filter는 enum 값만(이미 비PII) — 안전.

  return {
    id: `mam_${nowMs.toString(36)}_${(planSummary.goal ?? 'x')}`,
    createdAt: new Date(nowMs).toISOString(),
    originalQuestionMasked: masked,
    normalizedQuestion: tokenize(masked).join(' '),
    resultType,
    plannerSource,
    planSummary,
    chartSummary: {
      chartType: cs?.chartType,
      seriesCount: cs?.series?.length,
      bucketCount: cs ? new Set((cs.series || []).flatMap((s) => s.points.map((p) => p.bucketKey))).size : undefined,
      primaryMetric: cs?.primaryMetric
    },
    requiredData: (input.artifact?.requiredData ?? plan?.dataRequirements?.flatMap((r) => r.requiredData) ?? []).slice(0, 10),
    ...(input.failureReason ? { failureReason: input.failureReason } : {})
  };
}

// ── localStorage 저장/로드 (안전 폴백) ───────────────────────────────────────
const readAll = (): MarketingAnalysisMemoryEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MARKETING_ANALYSIS_MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MarketingAnalysisMemoryEntry[]) : [];
  } catch {
    return [];
  }
};

export function loadMarketingAnalysisMemoryEntries(): MarketingAnalysisMemoryEntry[] {
  return readAll();
}

export function saveMarketingAnalysisMemoryEntry(entry: MarketingAnalysisMemoryEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const all = readAll();
    all.push(entry);
    // 최대 개수 초과 시 오래된 것부터 제거
    const trimmed = all.length > MARKETING_ANALYSIS_MEMORY_MAX ? all.slice(all.length - MARKETING_ANALYSIS_MEMORY_MAX) : all;
    window.localStorage.setItem(MARKETING_ANALYSIS_MEMORY_KEY, JSON.stringify(trimmed));
  } catch {
    // 저장 실패는 무시(앱 동작 중단 금지)
  }
}

export function clearMarketingAnalysisMemory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MARKETING_ANALYSIS_MEMORY_KEY);
  } catch {
    // ignore
  }
}

// ── 유사 질문 검색 (단순 점수) ───────────────────────────────────────────────
const overlap = (a: string[], b: string[]): number => { const sb = new Set(b); let n = 0; for (const x of a) if (sb.has(x)) n++; return n; };

export function findSimilarMarketingAnalysisMemories(input: { question: string; plan?: MarketingIntelligencePlan | null; limit?: number }): MarketingAnalysisMemoryEntry[] {
  const all = readAll();
  if (all.length === 0) return [];
  const plan = input.plan ?? null;
  const qTokens = tokenize(maskMarketingMemoryText(input.question));
  const metrics = plan?.requestedMetrics ?? [];
  const dims = (plan?.dimensions ?? []).map(String);
  const segs = (plan?.segments ?? []).map((s) => s.key);
  const comparison = plan?.comparison;

  const scored = all.map((e) => {
    const metricOverlap = overlap(metrics, e.planSummary.metrics);
    const dimensionOverlap = overlap(dims, e.planSummary.dimensions);
    const segmentOverlap = overlap(segs, e.planSummary.segments);
    const comparisonMatch = comparison && e.planSummary.comparison === comparison ? 1 : 0;
    const tokenOverlap = overlap(qTokens, tokenize(e.normalizedQuestion));
    const score = metricOverlap * 3 + dimensionOverlap * 2 + segmentOverlap * 2 + comparisonMatch * 2 + tokenOverlap;
    return { e, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  return scored.slice(0, input.limit ?? 5).map((x) => x.e);
}
