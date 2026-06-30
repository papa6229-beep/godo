import React, { useMemo, useState } from 'react';
import './MarketingAnalysisDashboard.css';
import './charts/commerceCharts.css';
import { CommerceComboChart, type CommerceComboChartPoint } from './charts/CommerceComboChart';
import { CommerceGroupedBarChart, type CommerceGroupedBarChartPoint } from './charts/CommerceGroupedBarChart';
import { resolveMarketingChartRoute } from './charts/marketingChartRoute';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import type { RevenueResult, AdminProductsResult } from '../services/departmentDataService';
import { OPERATIONAL_METRIC_LABELS as OP } from '../services/departmentMetricContract';
import { buildDepartmentSourceOfTruthSnapshot } from '../services/departmentDataSourceOfTruth';
import { MarketingDetailModal, type MarketingDetailSortKey } from './MarketingDetailModal';
import {
  buildMarketingAnalysisFacts,
  type MarketingAnalysisPeriod,
  type MarketingAnalysisPeriodPreset,
  type MarketingAnalysisFacts,
  type MarketingDimensionMetric,
  type MarketingInsight
} from '../services/marketingAnalysisFacts';
import type { MarketingChatChartArtifact, MarketingChartSpec, MarketingChartSeries } from '../services/marketingChatChartSpec';
import { MarketingCustomerBehaviorModal } from './MarketingCustomerBehaviorModal';
import { CUSTOMER_BEHAVIOR_EVENTS, connectedBehaviorEventCount } from '../services/marketingCustomerBehaviorEvents';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Analysis Dashboard v0.1 — Focused Insight Layout
//
// 변경: KPI 다발 + 차원 카드 나열 → "기간 → 분석 지표 선택 → 고정 KPI 2 + 선택 지표 → 메인 비교 그래프
//   → AI 분석 리포트 → 세부 분석 → requiredData 축소"의 집중형 흐름.
//   - 계산 로직은 그대로(buildMarketingAnalysisFacts). 표시 방식(위계/선택)만 개선.
//   - 외부 데이터 지표(ROAS/GA4/방문/상품조회/장바구니/SNS)는 여전히 requiredData로만.
//   - PII(고객명/전화/이메일/주소/memberKey) 미표시. 인과 단정 금지(관찰 표현만).
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  revenue: RevenueResult | null;
  products: AdminProductsResult | null;
  loading: boolean;
  onRefresh: () => void;
  // 채팅 질문 기반 chartSpec artifact(비영속). 있으면 중앙 그래프/AI 리포트를 이 결과로 우선 표시.
  marketingChartArtifact?: MarketingChatChartArtifact | null;
  onClearMarketingChartArtifact?: () => void;
  // 최근 유사 분석 메모리 힌트 수(비PII). dev marker + 작은 안내용.
  marketingMemoryHintCount?: number;
}

const PRESETS: { key: MarketingAnalysisPeriodPreset; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'today', label: '오늘' },
  { key: 'last7d', label: '최근 7일' },
  { key: 'last30d', label: '최근 30일' },
  { key: 'thisMonth', label: '이번 달' },
  { key: 'lastMonth', label: '지난 달' },
  { key: 'thisYear', label: '올해' },
  { key: 'custom', label: '직접 선택' }
];

// 분석 지표 선택 칩
type MarketingFocusMetric =
  | 'aov'
  | 'firstRepeat'
  | 'coupon'
  | 'discount'
  | 'reward'
  | 'memberGroup'
  | 'orderChannel'
  | 'topProducts'
  | 'topCategories'
  | 'topBrands';

const FOCUS_CHIPS: { key: MarketingFocusMetric; label: string }[] = [
  { key: 'aov', label: '객단가' },
  { key: 'firstRepeat', label: '첫구매/재구매' },
  { key: 'coupon', label: '쿠폰' },
  { key: 'discount', label: '할인' },
  { key: 'reward', label: '리워드' },
  { key: 'memberGroup', label: '회원그룹' },
  { key: 'orderChannel', label: '주문채널' },
  { key: 'topProducts', label: '상품 TOP' },
  { key: 'topCategories', label: '카테고리 TOP' },
  { key: 'topBrands', label: '브랜드 TOP' }
];

const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;
const cnt = (n: number): string => `${Math.round(n).toLocaleString()}건`;

// ── focus 뷰 모델 (표시 매핑 전용 — facts가 이미 계산, 신규 집계 없음) ──────────
type FocusBar = { label: string; value: number; display: string; group: string };
type FocusView = {
  chipLabel: string;
  selectedKpi: { label: string; value: number; kind: 'won' | 'count' };
  comparison: { label: string; text: string };
  chart: { title: string; desc: string; bars: FocusBar[]; summary: string };
};

const dimBars = (items: MarketingDimensionMetric[]): FocusBar[] =>
  items.slice(0, 8).map((m) => ({ label: m.label || '미분류', value: m.revenue, display: `${won(m.revenue)} · ${m.sharePercent}%`, group: 'rev' }));

const bucket = (arr: MarketingDimensionMetric[], key: string): MarketingDimensionMetric | undefined => arr.find((x) => x.key === key);

// 그래프 요약: 가장 높은 항목(인과 단정 없이 관찰 표현)
const highestSummary = (bars: FocusBar[], group?: string): string => {
  const pool = group ? bars.filter((b) => b.group === group) : bars;
  if (!pool.length) return '표시할 데이터가 없습니다.';
  let top = pool[0];
  for (const b of pool) if (b.value > top.value) top = b;
  return `가장 높은 항목은 ${top.label}(${top.display})으로 나타납니다.`;
};

function buildFocusView(focus: MarketingFocusMetric, facts: MarketingAnalysisFacts, periodLabel: string): FocusView {
  const s = facts.summary;
  const chip = FOCUS_CHIPS.find((c) => c.key === focus)?.label ?? '';
  const base = (title: string, desc: string, bars: FocusBar[], summary: string): FocusView['chart'] => ({ title, desc, bars, summary });

  switch (focus) {
    case 'firstRepeat': {
      const bars: FocusBar[] = [
        { label: '첫구매 매출', value: s.firstPurchaseRevenue, display: won(s.firstPurchaseRevenue), group: 'rev' },
        { label: '재구매 매출', value: s.repeatPurchaseRevenue, display: won(s.repeatPurchaseRevenue), group: 'rev' },
        { label: '첫구매 주문수', value: s.firstPurchaseOrderCount, display: cnt(s.firstPurchaseOrderCount), group: 'cnt' },
        { label: '재구매 주문수', value: s.repeatPurchaseOrderCount, display: cnt(s.repeatPurchaseOrderCount), group: 'cnt' }
      ];
      return {
        chipLabel: chip,
        selectedKpi: { label: '재구매 매출', value: s.repeatPurchaseRevenue, kind: 'won' },
        comparison: { label: '첫구매 vs 재구매 매출', text: `첫구매 ${won(s.firstPurchaseRevenue)} vs 재구매 ${won(s.repeatPurchaseRevenue)}` },
        chart: base('첫구매/재구매 비교', `${periodLabel} · 첫구매와 재구매 매출/주문수 비교`, bars, highestSummary(bars, 'rev'))
      };
    }
    case 'coupon': {
      const c = bucket(facts.byCouponUsage, 'coupon');
      const nc = bucket(facts.byCouponUsage, 'non_coupon');
      const bars: FocusBar[] = [
        { label: '쿠폰 사용 매출', value: c?.revenue ?? 0, display: won(c?.revenue ?? 0), group: 'rev' },
        { label: '쿠폰 미사용 매출', value: nc?.revenue ?? 0, display: won(nc?.revenue ?? 0), group: 'rev' },
        { label: '쿠폰 사용 주문수', value: c?.orderCount ?? 0, display: cnt(c?.orderCount ?? 0), group: 'cnt' },
        { label: '쿠폰 미사용 주문수', value: nc?.orderCount ?? 0, display: cnt(nc?.orderCount ?? 0), group: 'cnt' },
        { label: '쿠폰 사용 객단가', value: c?.averageOrderValue ?? 0, display: won(c?.averageOrderValue ?? 0), group: 'aov' },
        { label: '쿠폰 미사용 객단가', value: nc?.averageOrderValue ?? 0, display: won(nc?.averageOrderValue ?? 0), group: 'aov' }
      ];
      return {
        chipLabel: chip,
        selectedKpi: { label: '쿠폰 사용 주문', value: s.couponOrderCount, kind: 'count' },
        comparison: { label: '쿠폰 사용 vs 미사용 객단가', text: `사용 ${won(s.couponAverageOrderValue)} vs 미사용 ${won(s.nonCouponAverageOrderValue)}` },
        chart: base('쿠폰 사용/미사용 비교', `${periodLabel} · 쿠폰 사용 여부별 매출·주문수·객단가`, bars, highestSummary(bars, 'aov'))
      };
    }
    case 'discount': {
      const etc = Math.max(0, s.totalDiscountAmount - s.totalCouponDiscountAmount);
      const bars: FocusBar[] = [
        { label: '총 할인액', value: s.totalDiscountAmount, display: won(s.totalDiscountAmount), group: 'won' },
        { label: '쿠폰 할인액', value: s.totalCouponDiscountAmount, display: won(s.totalCouponDiscountAmount), group: 'won' },
        { label: '기타(상품/회원) 할인액', value: etc, display: won(etc), group: 'won' }
      ];
      return {
        chipLabel: chip,
        selectedKpi: { label: '총 할인액', value: s.totalDiscountAmount, kind: 'won' },
        comparison: { label: '쿠폰 할인 비중', text: `쿠폰 할인 ${won(s.totalCouponDiscountAmount)} / 전체 ${won(s.totalDiscountAmount)}` },
        chart: base('할인 구성', `${periodLabel} · 전체/쿠폰/기타 할인액`, bars, highestSummary(bars, 'won'))
      };
    }
    case 'reward': {
      const r = bucket(facts.byRewardUsage, 'reward');
      const nr = bucket(facts.byRewardUsage, 'non_reward');
      const bars: FocusBar[] = [
        { label: '리워드 사용액', value: s.totalRewardUseAmount, display: won(s.totalRewardUseAmount), group: 'won' },
        { label: '마일리지 사용 주문수', value: s.mileageOrderCount, display: cnt(s.mileageOrderCount), group: 'cnt' },
        { label: '예치금 사용 주문수', value: s.depositOrderCount, display: cnt(s.depositOrderCount), group: 'cnt' }
      ];
      return {
        chipLabel: chip,
        selectedKpi: { label: '총 리워드 사용액', value: s.totalRewardUseAmount, kind: 'won' },
        comparison: { label: '리워드 사용 vs 미사용 주문', text: `사용 ${cnt(r?.orderCount ?? 0)} vs 미사용 ${cnt(nr?.orderCount ?? 0)}` },
        chart: base('리워드 사용 분석', `${periodLabel} · 리워드 사용액·마일리지·예치금`, bars, highestSummary(bars, 'cnt'))
      };
    }
    case 'memberGroup': {
      const bars = dimBars(facts.byMemberGroup);
      const top = facts.byMemberGroup[0];
      return {
        chipLabel: chip,
        selectedKpi: { label: '1위 회원그룹 매출', value: top?.revenue ?? 0, kind: 'won' },
        comparison: { label: '1위 그룹 매출 비중', text: top ? `${top.label} ${top.sharePercent}%` : '데이터 없음' },
        chart: base('회원그룹별 매출 TOP', `${periodLabel} · 회원그룹별 매출 비중`, bars, highestSummary(bars))
      };
    }
    case 'orderChannel': {
      const bars = dimBars(facts.byOrderChannel);
      const top = facts.byOrderChannel[0];
      return {
        chipLabel: chip,
        selectedKpi: { label: '1위 채널 매출', value: top?.revenue ?? 0, kind: 'won' },
        comparison: { label: '1위 채널 비중', text: top ? `${top.label} ${top.sharePercent}%` : '데이터 없음' },
        chart: base('주문채널별 매출', `${periodLabel} · 채널별 매출 비중`, bars, highestSummary(bars))
      };
    }
    case 'topProducts': {
      const bars = dimBars(facts.topProducts);
      const top = facts.topProducts[0];
      return {
        chipLabel: chip,
        selectedKpi: { label: '1위 상품 매출', value: top?.revenue ?? 0, kind: 'won' },
        comparison: { label: '1위 상품 비중', text: top ? `${top.label} ${top.sharePercent}%` : '데이터 없음' },
        chart: base('상품 매출 TOP', `${periodLabel} · 상품별 매출`, bars, highestSummary(bars))
      };
    }
    case 'topCategories': {
      const bars = dimBars(facts.topCategories);
      const top = facts.topCategories[0];
      return {
        chipLabel: chip,
        selectedKpi: { label: '1위 카테고리 매출', value: top?.revenue ?? 0, kind: 'won' },
        comparison: { label: '1위 카테고리 비중', text: top ? `${top.label} ${top.sharePercent}%` : '데이터 없음' },
        chart: base('카테고리 매출 TOP', `${periodLabel} · 카테고리별 매출`, bars, highestSummary(bars))
      };
    }
    case 'topBrands': {
      const bars = dimBars(facts.topBrands);
      const top = facts.topBrands[0];
      return {
        chipLabel: chip,
        selectedKpi: { label: '1위 브랜드 매출', value: top?.revenue ?? 0, kind: 'won' },
        comparison: { label: '1위 브랜드 비중', text: top ? `${top.label} ${top.sharePercent}%` : '브랜드 미연동' },
        chart: base('브랜드 매출 TOP', `${periodLabel} · 브랜드별 매출`, bars, bars.length ? highestSummary(bars) : '브랜드 미연동 (상품 메타데이터 부족)')
      };
    }
    default: {
      // aov
      const bars: FocusBar[] = [
        { label: '총 객단가', value: s.averageOrderValue, display: won(s.averageOrderValue), group: 'aov' },
        { label: '첫구매 객단가', value: s.firstPurchaseAverageOrderValue, display: won(s.firstPurchaseAverageOrderValue), group: 'aov' },
        { label: '재구매 객단가', value: s.repeatPurchaseAverageOrderValue, display: won(s.repeatPurchaseAverageOrderValue), group: 'aov' },
        { label: '쿠폰 사용 객단가', value: s.couponAverageOrderValue, display: won(s.couponAverageOrderValue), group: 'aov' },
        { label: '쿠폰 미사용 객단가', value: s.nonCouponAverageOrderValue, display: won(s.nonCouponAverageOrderValue), group: 'aov' }
      ];
      return {
        chipLabel: chip,
        selectedKpi: { label: '객단가', value: s.averageOrderValue, kind: 'won' },
        comparison: { label: '첫구매 vs 재구매 객단가', text: `첫구매 ${won(s.firstPurchaseAverageOrderValue)} vs 재구매 ${won(s.repeatPurchaseAverageOrderValue)}` },
        chart: base('객단가 비교', `${periodLabel} · 전체/첫구매/재구매/쿠폰 객단가`, bars, highestSummary(bars, 'aov'))
      };
    }
  }
}

const PERIOD_LABEL: Record<MarketingAnalysisPeriodPreset, string> = {
  all: '전체 기간', today: '오늘', last7d: '최근 7일', last30d: '최근 30일',
  thisMonth: '이번 달', lastMonth: '지난 달', thisYear: '올해', custom: '직접 선택 기간'
};

// 그룹별 최대값(bar 폭 정규화) — reduce 미사용
const groupMaxOf = (bars: FocusBar[], group: string): number => {
  const vals = bars.filter((b) => b.group === group).map((b) => b.value);
  return Math.max(1, ...vals);
};

// KPI 카드 (카운터 애니메이션)
const KpiCard: React.FC<{ label: string; value: number; kind: 'won' | 'count'; tone?: string; icon?: string; sub?: string; accent?: string }> = ({ label, value, kind, tone, icon, sub, accent }) => {
  const v = useAnimatedNumber(value, { durationMs: 420 });
  return (
    <div className={`mkt-kpi-card ${tone || ''}${accent ? ' has-accent' : ''}`} style={accent ? ({ ['--mkt-kpi-accent']: accent } as React.CSSProperties) : undefined}>
      {accent && <span className="mkt-kpi-accent-line" aria-hidden="true" />}
      <span className="mkt-kpi-label">{icon ? `${icon} ` : ''}{label}</span>
      <span className="mkt-kpi-value tabular-nums">
        {Math.round(v).toLocaleString()}
        {kind === 'won' ? '원' : '건'}
      </span>
      {sub && <span className="mkt-kpi-sub">{sub}</span>}
    </div>
  );
};

// 세부 분석 차원 블록 (기존 마커 유지: mkt-dim-*). limit: 기본 노출 수 제한, onExpand: 전체보기 모달.
const DimensionBlock: React.FC<{ title: string; markerClass: string; items: MarketingDimensionMetric[]; emptyText?: string; limit?: number; onExpand?: () => void }> = ({ title, markerClass, items, emptyText, limit = 4, onExpand }) => {
  const shown = items.slice(0, limit);
  const hasMore = items.length > limit;
  return (
  <div className={`mkt-dim-block ${markerClass}`}>
    <div className="mkt-dim-head">
      <h4 className="mkt-dim-title">{title}</h4>
      {onExpand && items.length > 0 && (
        <button type="button" className="mkt-dim-expand" onClick={onExpand} aria-label={`${title} 전체보기`}>전체보기 →</button>
      )}
    </div>
    {items.length === 0 ? (
      <p className="mkt-dim-empty">{emptyText || '표시할 데이터가 없습니다.'}</p>
    ) : (
      <ul className="mkt-dim-list">
        {shown.map((it) => (
          <li key={it.key} className="mkt-dim-row">
            <div className="mkt-dim-row-head">
              <span className="mkt-dim-label">{it.label || '미분류'}</span>
              <span className="mkt-dim-share tabular-nums">{it.sharePercent}%</span>
            </div>
            <div className="mkt-dim-bar-track">
              <div className="mkt-dim-bar" style={{ width: `${Math.min(100, Math.max(0, it.sharePercent))}%` }} />
            </div>
            <div className="mkt-dim-row-foot">
              <span>매출 {won(it.revenue)}</span>
              <span>주문 {it.orderCount}건</span>
              <span>객단가 {won(it.averageOrderValue)}</span>
            </div>
          </li>
        ))}
      </ul>
    )}
    {hasMore && (
      <button type="button" className="mkt-dim-more" onClick={onExpand} aria-label={`${title} 전체 ${items.length}개 보기`}>
        +{items.length - limit}개 더 · 전체보기
      </button>
    )}
  </div>
  );
};

const SEV_LABEL: Record<MarketingInsight['severity'], string> = { info: '관찰', positive: '긍정', warning: '주의' };

// ────────────────────────────────────────────────────────────────────────────
// 채팅 chartSpec artifact 렌더 (계산 없음 — chartSpec 결과만 표시). JSON 미노출, PII 미노출.
// ────────────────────────────────────────────────────────────────────────────
const BUCKET_LIMIT = 12;
const formatMetricValue = (value: number, unit?: MarketingChartSpec['unit']): string => {
  if (unit === 'count') return `${Math.round(value).toLocaleString()}건`;
  if (unit === 'percent') return `${value}%`;
  return won(value); // krw / mixed 기본
};
const unionBuckets = (chartSpec: MarketingChartSpec): { keys: string[]; labels: Record<string, string>; truncated: boolean } => {
  const labels: Record<string, string> = {};
  const set = new Set<string>();
  for (const s of chartSpec.series) for (const p of s.points) { set.add(p.bucketKey); labels[p.bucketKey] = p.bucketLabel; }
  const sorted = [...set].sort();
  if (sorted.length <= BUCKET_LIMIT) return { keys: sorted, labels, truncated: false };
  return { keys: sorted.slice(-BUCKET_LIMIT), labels, truncated: true };
};
const seriesTotal = (s: MarketingChartSeries): number => {
  let t = 0;
  for (const p of s.points) t += p.value;
  return t;
};
const seriesOrderCount = (s: MarketingChartSeries): number => {
  let t = 0;
  for (const p of s.points) t += p.orderCount ?? 0;
  return t;
};

// 시리즈 시각 스타일(결정적 — Math.random/inline color 금지). 연도(2025/2026)·쿠폰·첫재구매·시나리오 구분.
const SERIES_STYLE_MAP: Record<string, string> = {
  coupon: 'mkt-s-coupon', non_coupon: 'mkt-s-noncoupon', first: 'mkt-s-first', repeat: 'mkt-s-repeat',
  baseline: 'mkt-s-baseline', promotion: 'mkt-s-promotion', reward: 'mkt-s-reward', non_reward: 'mkt-s-nonreward'
};
const getMarketingSeriesVisualStyle = (seriesKey: string, seriesIndex: number, seriesLabel?: string): { className: string; label: string } => {
  const label = seriesLabel ?? seriesKey;
  const ym = /(\d{4})/.exec(seriesKey) || /(\d{4})/.exec(label); // 2025/2026 등 연도 시리즈는 짝/홀로 확실히 구분
  if (ym) return { className: `mkt-s-year-${Number(ym[1]) % 2 === 0 ? 'even' : 'odd'}`, label };
  const mapped = SERIES_STYLE_MAP[seriesKey];
  if (mapped) return { className: mapped, label };
  return { className: `s${seriesIndex % 4}`, label };
};

type MarketingTooltipPayload = { title: string; rows: { label: string; value: string }[]; delta?: string };
const buildMarketingTooltipPayload = (input: { chartSpec: MarketingChartSpec; bucketKey?: string; seriesKey?: string }): MarketingTooltipPayload => {
  const { chartSpec, bucketKey, seriesKey } = input;
  const s = chartSpec.series.find((x) => x.key === seriesKey) ?? chartSpec.series[0];
  if (!s) return { title: '', rows: [] };
  const p = bucketKey ? s.points.find((x) => x.bucketKey === bucketKey) : undefined;
  const value = p ? p.value : seriesTotal(s);
  const orderCount = p ? p.orderCount : seriesOrderCount(s);
  const title = p ? p.bucketLabel : s.label;
  const rows = [
    { label: s.label, value: formatMetricValue(value, chartSpec.unit) },
    ...(orderCount != null ? [{ label: '주문수', value: `${orderCount}건` }] : [])
  ];
  let delta: string | undefined;
  const other = chartSpec.series.find((x) => x.key !== s.key);
  if (other && p) {
    const op = other.points.find((x) => x.bucketKey === p.bucketKey);
    if (op) { const d = p.value - op.value; const pc = op.value !== 0 ? `${d >= 0 ? '+' : ''}${((d / Math.abs(op.value)) * 100).toFixed(1)}%` : 'n/a'; delta = `${other.label} 대비 ${d >= 0 ? '+' : ''}${formatMetricValue(Math.abs(d), chartSpec.unit)} (${pc})`; }
  }
  return { title, rows, delta };
};

// tooltip 영역은 항상 자리를 차지해(빈 placeholder) hover 시 레이아웃 점프/깜빡임을 방지.
const ChartTooltip: React.FC<{ payload: MarketingTooltipPayload | null }> = ({ payload }) => {
  if (!payload || !payload.title) return <div className="marketing-chart-tooltip marketing-chart-tooltip-empty" aria-hidden="true" />;
  return (
    <div className="marketing-chart-tooltip" role="status">
      <div className="marketing-chart-tooltip-title">{payload.title}</div>
      {payload.rows.map((r, i) => (
        <div key={i} className="marketing-chart-tooltip-row"><span>{r.label}</span><span className="tabular-nums">{r.value}</span></div>
      ))}
      {payload.delta && <div className="marketing-chart-tooltip-delta">{payload.delta}</div>}
    </div>
  );
};

const ChartLegend: React.FC<{ chartSpec: MarketingChartSpec }> = ({ chartSpec }) => (
  <div className="marketing-chart-legend">
    {chartSpec.series.map((s, i) => {
      const style = getMarketingSeriesVisualStyle(s.key, i, s.label);
      return (
        <span key={s.key} className="marketing-chart-legend-item">
          <span className={`marketing-chart-legend-dot ${style.className}`} />
          <span className="marketing-chart-series-label">{s.label}</span>
        </span>
      );
    })}
  </div>
);

const GroupedBarChart: React.FC<{ chartSpec: MarketingChartSpec; compact?: boolean }> = ({ chartSpec, compact }) => {
  const [hover, setHover] = useState<{ bk: string; sk: string } | null>(null);
  const { keys, labels, truncated } = unionBuckets(chartSpec);
  const maxV = Math.max(1, ...chartSpec.series.flatMap((s) => s.points.filter((p) => keys.includes(p.bucketKey)).map((p) => p.value)));
  const byBucket = chartSpec.series.map((s) => ({ s, map: new Map(s.points.map((p) => [p.bucketKey, p])) }));
  const payload = !compact && hover ? buildMarketingTooltipPayload({ chartSpec, bucketKey: hover.bk, seriesKey: hover.sk }) : null;
  return (
    <div className={`marketing-chart-grouped-bars${compact ? ' mkt-chart-compact-bars' : ''}`}>
      <ChartLegend chartSpec={chartSpec} />
      {!compact && <ChartTooltip payload={payload} />}
      {keys.map((bk) => (
        <div className="marketing-chart-bucket" key={bk}>
          <div className="marketing-chart-bucket-label">{labels[bk] || bk}</div>
          <div className="marketing-chart-bucket-series">
            {byBucket.map(({ s, map }, si) => {
              const p = map.get(bk);
              const v = p?.value ?? 0;
              const style = getMarketingSeriesVisualStyle(s.key, si, s.label);
              return (
                <div className="marketing-chart-series-bar" key={s.key} tabIndex={0}
                  onMouseEnter={() => setHover({ bk, sk: s.key })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ bk, sk: s.key })} onBlur={() => setHover(null)}>
                  <div className="marketing-chart-series-bar-track">
                    <div className={`marketing-chart-series-fill ${style.className}`} style={{ width: `${Math.min(100, (v / maxV) * 100)}%` }} />
                  </div>
                  <span className="marketing-chart-series-value tabular-nums">
                    {formatMetricValue(v, chartSpec.unit)}
                    {p?.orderCount != null ? <span className="marketing-chart-series-sub"> · {p.orderCount}건</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {truncated && <p className="marketing-chart-trunc">최근 {BUCKET_LIMIT}개 구간만 표시</p>}
    </div>
  );
};

const LineChart: React.FC<{ chartSpec: MarketingChartSpec; compact?: boolean }> = ({ chartSpec, compact }) => {
  const [hover, setHover] = useState<{ bk: string; sk: string } | null>(null);
  const { keys, labels, truncated } = unionBuckets(chartSpec);
  const maxV = Math.max(1, ...chartSpec.series.flatMap((s) => s.points.filter((p) => keys.includes(p.bucketKey)).map((p) => p.value)));
  const n = keys.length;
  const x = (i: number): number => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number): number => 38 - (v / maxV) * 36 + 1;
  const payload = !compact && hover ? buildMarketingTooltipPayload({ chartSpec, bucketKey: hover.bk, seriesKey: hover.sk }) : null;
  return (
    <div className="marketing-chart-line">
      <ChartLegend chartSpec={chartSpec} />
      {!compact && <ChartTooltip payload={payload} />}
      <svg className="marketing-chart-line-svg" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={chartSpec.title}>
        {chartSpec.series.map((s, si) => {
          const style = getMarketingSeriesVisualStyle(s.key, si, s.label);
          const map = new Map(s.points.map((p) => [p.bucketKey, p.value]));
          const pts = keys.map((bk, i) => `${x(i)},${y(map.get(bk) ?? 0)}`).join(' ');
          return (
            <g key={s.key}>
              <polyline className={`marketing-chart-line-path ${style.className}`} points={pts} fill="none" />
              {keys.map((bk, i) => (map.has(bk) ? (
                <circle key={bk} className={`marketing-chart-line-dot ${style.className}`} cx={x(i)} cy={y(map.get(bk) ?? 0)} r={1.05}
                  onMouseEnter={() => setHover({ bk, sk: s.key })} onMouseLeave={() => setHover(null)} />
              ) : null))}
            </g>
          );
        })}
      </svg>
      <div className="marketing-chart-line-axis">
        {keys.map((bk) => (
          <span key={bk} className="marketing-chart-line-tick">{labels[bk] || bk}</span>
        ))}
      </div>
      <div className="marketing-chart-line-last">
        {chartSpec.series.map((s, i) => {
          const last = s.points[s.points.length - 1];
          const style = getMarketingSeriesVisualStyle(s.key, i, s.label);
          return last ? (
            <span key={s.key} className="marketing-chart-legend-item">
              <span className={`marketing-chart-legend-dot ${style.className}`} />
              {s.label} {formatMetricValue(last.value, chartSpec.unit)}
            </span>
          ) : null;
        })}
      </div>
      {truncated && <p className="marketing-chart-trunc">최근 {BUCKET_LIMIT}개 구간만 표시</p>}
    </div>
  );
};

const RankedBarChart: React.FC<{ chartSpec: MarketingChartSpec; compact?: boolean }> = ({ chartSpec, compact }) => {
  const [hover, setHover] = useState<string | null>(null);
  const ranked = [...chartSpec.series].map((s) => ({ s, total: seriesTotal(s), orders: seriesOrderCount(s) })).sort((a, b) => b.total - a.total).slice(0, 8);
  const maxV = Math.max(1, ...ranked.map((r) => r.total));
  const payload = !compact && hover ? buildMarketingTooltipPayload({ chartSpec, seriesKey: hover }) : null;
  if (ranked.length === 0) return <p className="mkt-dim-empty">표시할 데이터가 없습니다.</p>;
  return (
    <div className={`marketing-chart-ranked-bars${compact ? ' mkt-chart-compact-bars' : ''}`}>
      {!compact && <ChartTooltip payload={payload} />}
      {ranked.map((r, i) => {
        const style = getMarketingSeriesVisualStyle(r.s.key, i, r.s.label);
        return (
          <div className="marketing-chart-bucket" key={r.s.key} tabIndex={0}
            onMouseEnter={() => setHover(r.s.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r.s.key)} onBlur={() => setHover(null)}>
            <div className="marketing-chart-bucket-row-head">
              <span className="marketing-chart-series-label">{r.s.label}</span>
              <span className="marketing-chart-series-value tabular-nums">
                {formatMetricValue(r.total, chartSpec.unit)}
                {r.orders > 0 ? <span className="marketing-chart-series-sub"> · 주문 {r.orders}건</span> : null}
              </span>
            </div>
            <div className="marketing-chart-series-bar-track">
              <div className={`marketing-chart-series-fill ${style.className}`} style={{ width: `${Math.min(100, (r.total / maxV) * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TableChart: React.FC<{ chartSpec: MarketingChartSpec }> = ({ chartSpec }) => (
  <div className="marketing-chart-table">
    {chartSpec.series.map((s) => (
      <div key={s.key} className="marketing-chart-table-row">
        <span className="marketing-chart-series-label">{s.label}</span>
        <span className="marketing-chart-series-value tabular-nums">{formatMetricValue(seriesTotal(s), chartSpec.unit)}</span>
      </div>
    ))}
  </div>
);

const UnsupportedChart: React.FC<{ chartSpec: MarketingChartSpec }> = ({ chartSpec }) => (
  <div className="marketing-chart-unsupported">
    <div className="marketing-chart-unsupported-lock">🔒</div>
    <p className="marketing-chart-unsupported-title">현재 계산하지 않습니다.</p>
    <p className="marketing-chart-unsupported-desc">이 분석에는 외부 데이터 연결이 필요합니다.</p>
    {chartSpec.requiredData && chartSpec.requiredData.length > 0 && (
      <div className="marketing-chart-required">
        {chartSpec.requiredData.map((rd) => (
          <span key={rd} className="marketing-chart-required-chip">필요: {rd}</span>
        ))}
      </div>
    )}
  </div>
);

// chartSpec line(단일 월별 매출) → combo points 매핑(막대=매출, 라인=매출 추세, tooltip 주문수/전월대비).
const toComboPoints = (chartSpec: MarketingChartSpec): CommerceComboChartPoint[] => {
  const s = chartSpec.series[0];
  if (!s) return [];
  return s.points.map((p, i) => {
    const prev = i > 0 ? s.points[i - 1].value : undefined;
    const delta = prev != null ? p.value - prev : undefined;
    const deltaRate = prev != null && prev !== 0 ? +(((p.value - prev) / Math.abs(prev)) * 100).toFixed(1) : undefined;
    return { key: p.bucketKey, label: p.bucketLabel, barValue: p.value, lineValue: p.value, orderCount: p.orderCount, delta, deltaRate };
  });
};
// chartSpec groupedBar(연도/세그먼트 월 비교) → grouped vertical points(구간=월, values=series).
const toGroupedPoints = (chartSpec: MarketingChartSpec): CommerceGroupedBarChartPoint[] => {
  const buckets: { key: string; label: string }[] = [];
  for (const s of chartSpec.series) for (const p of s.points) if (!buckets.some((b) => b.key === p.bucketKey)) buckets.push({ key: p.bucketKey, label: p.bucketLabel });
  buckets.sort((a, b) => a.key.localeCompare(b.key));
  return buckets.map((b) => ({
    key: b.key, label: b.label,
    values: chartSpec.series.map((s) => { const pt = s.points.find((p) => p.bucketKey === b.key); return { key: s.key, label: s.label, value: pt?.value ?? 0, orderCount: pt?.orderCount }; })
  }));
};

// chartType → 그래프 (fallback 포함). 알 수 없는 타입은 unsupported.
//   P0: 단일 월별 매출은 combo(막대+꺾은선), 연도 비교는 vertical grouped bar(공통 SVG 컴포넌트).
const renderMarketingChartSpecGraph = (chartSpec: MarketingChartSpec): React.ReactNode => {
  const route = resolveMarketingChartRoute(chartSpec);
  // compact(2~4개 비교): 값이 막대에 이미 보이므로 hover tooltip 카드 비활성(깜빡임 방지). 막대 highlight만 유지.
  const compact = chartSpec.series.flatMap((s) => s.points).length <= 4;
  if (route === 'combo') {
    return <CommerceComboChart points={toComboPoints(chartSpec)} barLabel={chartSpec.yAxisLabel || '매출'} lineLabel="추세" valueFormatter={(v) => formatMetricValue(v, chartSpec.unit)} />;
  }
  if (route === 'groupedVertical') {
    return <CommerceGroupedBarChart points={toGroupedPoints(chartSpec)} valueFormatter={(v) => formatMetricValue(v, chartSpec.unit)} />;
  }
  if (!chartSpec.available || chartSpec.chartType === 'unsupported') return <UnsupportedChart chartSpec={chartSpec} />;
  if (chartSpec.series.length === 0) return <p className="mkt-dim-empty">표시할 데이터가 없습니다.</p>;
  switch (chartSpec.chartType) {
    case 'line':
      return <LineChart chartSpec={chartSpec} compact={compact} />;
    case 'rankedBar':
    case 'donut': // fallback: rankedBar 유사
      return <RankedBarChart chartSpec={chartSpec} compact={compact} />;
    case 'table':
      return <TableChart chartSpec={chartSpec} />;
    case 'groupedBar':
    case 'stackedBar': // fallback: groupedBar 유사
      return <GroupedBarChart chartSpec={chartSpec} compact={compact} />;
    default:
      return <UnsupportedChart chartSpec={chartSpec} />;
  }
};

// 채팅 질문 기반 chartSpec 패널(헤더 배지 + 그래프 + 돌아가기). 중앙 smart chart 대체.
const MarketingChartSpecPanel: React.FC<{ artifact: MarketingChatChartArtifact; onClear?: () => void }> = ({ artifact, onClear }) => {
  const cs = artifact.chartSpec;
  // compact: 2~4개 비교(특정 월/월범위/분기/세그먼트)는 12개월 차트 높이를 쓰지 않고 여백을 줄인다.
  const compact = cs.series.flatMap((s) => s.points).length <= 4;
  return (
    <div
      className={`marketing-smart-chart marketing-chart-spec-panel${compact ? ' mkt-chart-compact' : ''}`}
      data-marketing-dynamic-chart-compact={String(compact)}
      data-marketing-dynamic-chart-active="true"
      data-marketing-dynamic-chart-intent={artifact.intent}
      data-marketing-dynamic-chart-type={cs.chartType}
      data-marketing-dynamic-chart-available={String(cs.available)}
    >
      <div className="marketing-chart-spec-header">
        <div>
          <span className="marketing-chart-spec-badge">채팅 질문 기반 분석 결과</span>
          <h3 className="mkt-section-title">{cs.title}</h3>
          <p className="marketing-smart-chart-desc">{cs.subtitle}</p>
        </div>
        {onClear && (
          <button type="button" className="marketing-chart-back-btn" onClick={onClear}>
            기본 분석으로 돌아가기
          </button>
        )}
      </div>
      {/* partial_with_proxy: 정확 지표 미계산이지만 proxy 분석이 있으면 그래프를 보여주고 requiredData는 작은 배지로. */}
      {cs.available && artifact.requiredData && artifact.requiredData.length > 0 && (
        <div className="marketing-chart-proxy-badge">
          ℹ 정확 지표는 미계산 — 대신 현재 주문 데이터 기준 proxy 분석을 표시합니다. 필요 데이터: {artifact.requiredData.join(', ')}
        </div>
      )}
      <div className="marketing-chart-spec-graph">{renderMarketingChartSpecGraph(cs)}</div>
    </div>
  );
};

// 채팅 narrative 우선 AI 분석 리포트(artifact 있을 때). JSON 미노출 — narrative 필드만.
const MarketingNarrativeReport: React.FC<{ artifact: MarketingChatChartArtifact }> = ({ artifact }) => {
  const n = artifact.narrative;
  return (
    <div className="mkt-insights marketing-ai-report marketing-narrative-report">
      <h3 className="mkt-section-title">🤖 AI 분석 리포트 (채팅 질문 기반 · 관찰)</h3>
      <div className="mkt-insight">
        <div className="mkt-insight-head"><strong>{n.title}</strong></div>
        <p className="mkt-insight-summary">{n.summary}</p>
        {n.bullets.length > 0 && (
          <ul className="marketing-narrative-bullets">
            {n.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
        {n.evidence.length > 0 && (
          <div className="mkt-insight-evidence">
            <span className="mkt-insight-tag">근거</span>
            {n.evidence.map((e, i) => <span key={i} className="marketing-narrative-evidence-chip">{e}</span>)}
          </div>
        )}
        {n.warnings.length > 0 && n.warnings.map((w, i) => <p key={i} className="mkt-insight-action">⚠ {w}</p>)}
        {n.requiredData && n.requiredData.length > 0 && (
          <p className="mkt-insight-action">🔒 필요 데이터: {n.requiredData.join(', ')}</p>
        )}
      </div>
      <p className="marketing-ai-caution">※ 위 수치는 관찰값이며 인과관계를 단정하지 않습니다.</p>
    </div>
  );
};

export const MarketingAnalysisDashboard: React.FC<Props> = ({ revenue, products, loading, onRefresh, marketingChartArtifact, onClearMarketingChartArtifact, marketingMemoryHintCount }) => {
  const [preset, setPreset] = useState<MarketingAnalysisPeriodPreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedCustom, setAppliedCustom] = useState<{ start?: string; end?: string }>({});
  const [focus, setFocus] = useState<MarketingFocusMetric>('aov');
  // 고객 행동 분석 modal(클릭형 KPI 진입점). 행동 데이터는 만들지 않음 — 수집 준비 상태 UI만.
  const [behaviorModalOpen, setBehaviorModalOpen] = useState(false);
  // 기본 진입 상태 최적화: 비교 그래프/AI 리포트는 사용자가 비교를 "요청"한 뒤에만 확장.
  const [hasRequestedComparison, setHasRequestedComparison] = useState(false);
  // 세부 분석 "전체보기" 모달(표시 전용). 카드별 전체 항목/정렬.
  const [detailModal, setDetailModal] = useState<{ title: string; items: MarketingDimensionMetric[]; sorts: MarketingDetailSortKey[] } | null>(null);
  const requestComparison = (key: MarketingFocusMetric) => { setFocus(key); setHasRequestedComparison(true); };
  const behaviorConnected = connectedBehaviorEventCount(); // 현재 0
  const behaviorTotal = CUSTOMER_BEHAVIOR_EVENTS.length; // 8

  const period = useMemo<MarketingAnalysisPeriod>(
    () => (preset === 'custom' ? { preset, startDate: appliedCustom.start, endDate: appliedCustom.end } : { preset }),
    [preset, appliedCustom.start, appliedCustom.end]
  );

  // RevenueOrderLite → facts 입력 어댑터(state 평탄 → facts isCounted가 수용). PII 미포함.
  const marketingOrders = useMemo(
    () =>
      (revenue?.orders || []).map((o) => ({
        orderNo: o.orderNo,
        orderDate: o.orderDate,
        totalAmount: o.totalAmount,
        productRevenueByLines: o.productRevenueByLines,
        isFirstPurchase: o.isFirstPurchase,
        memberGroupName: o.memberGroupName,
        memberGroupCode: o.memberGroupCode,
        orderChannel: o.orderChannel,
        settleKind: o.paymentMethodCode,
        discountSummary: o.discountSummary,
        discountAmount: o.discountAmount,
        useMileageAmount: o.useMileageAmount,
        useDepositAmount: o.useDepositAmount,
        rewardUseAmount: o.rewardUseAmount,
        paid: o.paid,
        canceled: o.canceled,
        lines: o.lines.map((l) => ({ goodsNo: l.goodsNo, goodsName: l.goodsName, categoryCode: l.categoryCode, categoryLabel: l.categoryLabel, lineRevenue: l.lineRevenue, quantity: l.quantity }))
      })),
    [revenue]
  );

  const facts = useMemo(
    () => buildMarketingAnalysisFacts({ orders: marketingOrders, products: products?.products, reviews: revenue?.universeAux?.reviews, inquiries: revenue?.universeAux?.inquiries, period }),
    [marketingOrders, products, revenue, period]
  );

  const s = facts.summary;
  // 신규/재구매 고객 비교(하단 카드용) — facts가 이미 계산한 값만 사용, 신규 집계 없음.
  // 전 부서 공통 운영 snapshot — 같은 revenue universe로 동일 builder 호출(상품/CS와 동일 값).
  const snap = useMemo(() => buildDepartmentSourceOfTruthSnapshot(revenue), [revenue]);
  const firstRevenueShare = s.totalRevenue > 0 ? Math.round((s.firstPurchaseRevenue / s.totalRevenue) * 100) : 0;
  const repeatRevenueShare = s.totalRevenue > 0 ? Math.round((s.repeatPurchaseRevenue / s.totalRevenue) * 100) : 0;
  const view = useMemo(() => buildFocusView(focus, facts, PERIOD_LABEL[preset]), [focus, facts, preset]);
  // 상위 3~4개만 먼저 노출(나머지는 [세부 분석]에서 확인). facts.insights.map + idx<4 가드.
  const INSIGHT_LIMIT = 4;
  const evidenceLabel = (id: string): string => {
    const e = facts.evidence.find((x) => x.id === id);
    return e ? `${e.label} ${e.value}` : '';
  };

  return (
    <div className="marketing-dash">
      {/* ── 헤더 ── */}
      <div className="mkt-head">
        <div>
          <h2 className="mkt-title">📊 마케팅 분석팀</h2>
          <p className="mkt-subtitle">고도몰 주문/상품/CS 데이터 기반 분석</p>
        </div>
        <button type="button" className="mkt-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>
      <p className="mkt-guide">
        현재는 <strong>고도몰 주문·상품·CS 데이터</strong> 기준으로 분석합니다. 외부 유입/광고비/방문 행동 데이터(ROAS·GA4·SNS 등)는 연결 후 확장됩니다.
      </p>

      {/* ── 기간 필터 ── */}
      <div className="mkt-period">
        <div className="mkt-period-presets">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" className={`mkt-period-btn ${preset === p.key ? 'active' : ''}`} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="mkt-period-custom">
            <label>
              시작일 <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              종료일 <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <button type="button" className="mkt-period-apply" onClick={() => setAppliedCustom({ start: startDate || undefined, end: endDate || undefined })}>
              적용
            </button>
            <button type="button" className="mkt-period-reset" onClick={() => { setStartDate(''); setEndDate(''); setAppliedCustom({}); }}>
              초기화
            </button>
          </div>
        )}
      </div>

      {/* ── 분석 지표 선택 칩 ── */}
      <div className="marketing-focus-selector">
        <span className="marketing-focus-label">분석 지표</span>
        <div className="marketing-focus-chips">
          {FOCUS_CHIPS.map((c) => (
            <button key={c.key} type="button" className={`marketing-focus-chip ${focus === c.key && hasRequestedComparison ? 'active' : ''}`} onClick={() => requestComparison(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {s.orderCount === 0 && <div className="mkt-empty-banner">선택한 기간에 분석할 주문이 없습니다. 기간을 넓혀보세요.</div>}

      {/* ── 고정 KPI 2 + 선택 지표 + 비교 요약 (compact) ── */}
      <div className="marketing-kpi-compact-grid mkt-kpi-grid">
        <KpiCard icon="💰" label={OP.operationalRevenue.label} value={snap?.operationalRevenue ?? s.totalRevenue} kind="won" tone="primary" sub={OP.operationalRevenue.basis} accent="#4f8cff" />
        <KpiCard icon="🧾" label={OP.operationalOrderCount.label} value={snap?.operationalOrderCount ?? s.orderCount} kind="count" sub={OP.operationalOrderCount.basis} accent="#36d1c4" />
        <KpiCard icon="🧮" label={OP.operationalAOV.label} value={snap?.operationalAOV ?? s.averageOrderValue} kind="won" tone="focus" sub={OP.operationalAOV.basis} accent="#a78bfa" />
        {/* 4번째 KPI — 클릭형 진입점 "고객 행동 분석" (수치 카드 아님). 클릭/Enter/Space로 modal. */}
        <div
          className="mkt-kpi-card mkt-kpi-behavior has-accent"
          style={{ ['--mkt-kpi-accent']: '#fbbf24' } as React.CSSProperties}
          role="button"
          tabIndex={0}
          aria-label={`고객 행동 분석 — 추적 이벤트 ${behaviorConnected}/${behaviorTotal} 연결됨. 클릭하면 고객 행동 흐름 분석이 열립니다.`}
          aria-haspopup="dialog"
          onClick={() => setBehaviorModalOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBehaviorModalOpen(true); } }}
        >
          <span className="mkt-kpi-accent-line" aria-hidden="true" />
          <div className="mkt-kpi-behavior-top">
            <span className="mkt-kpi-label">🧭 고객 행동 분석</span>
            <span className="mkt-kpi-behavior-badge">행동추적 미연결</span>
          </div>
          <span className="mkt-kpi-value tabular-nums mkt-kpi-behavior-value">
            {behaviorConnected} / {behaviorTotal}
            <span className="mkt-kpi-behavior-unit">추적 이벤트 연결 준비</span>
          </span>
          <span className="mkt-kpi-behavior-desc">추적 연결 후 실제 행동 흐름 분석</span>
          <span className="mkt-kpi-behavior-hint">클릭해서 행동 흐름 보기 →</span>
        </div>
      </div>

      <p className="mkt-kpi-basis-note">
        ※ <b>운영매출·운영 주문수</b>는 전 부서 공통 source of truth({OP.operationalRevenue.basis})로 상품관리팀과 같은 값입니다.
        선택 지표(객단가 등)는 기간 필터가 적용되는 마케팅 분석값입니다.
        (공통 정의: <code>departmentMetricContract</code> · <code>revenueMetricContract</code>)
      </p>

      {/* ── 메인 비교 그래프 — artifact 우선 / 비교 요청 후에만 큰 그래프 / 기본은 compact empty ── */}
      {marketingChartArtifact ? (
        <MarketingChartSpecPanel artifact={marketingChartArtifact} onClear={onClearMarketingChartArtifact} />
      ) : hasRequestedComparison ? (
      <div className="marketing-smart-chart">
        <div className="marketing-smart-chart-head">
          <h3 className="mkt-section-title">선택 지표 비교 그래프 · {view.chipLabel}</h3>
          <p className="marketing-smart-chart-desc">{view.chart.desc}</p>
          {/* 선택 지표 비교 요약(상단 KPI에서 이곳으로 이동 — focus에 따라 변함) */}
          <div className="mkt-kpi-compare marketing-inline-compare">
            <span className="mkt-kpi-label">{view.comparison.label}</span>
            <span className="mkt-kpi-compare-text">{view.comparison.text}</span>
          </div>
        </div>
        <div className="marketing-smart-chart-bars">
          {view.chart.bars.length === 0 ? (
            <p className="mkt-dim-empty">{view.chart.summary}</p>
          ) : (
            view.chart.bars.map((b, i) => {
              const gmax = groupMaxOf(view.chart.bars, b.group);
              return (
                <div key={`${b.label}-${i}`} className="marketing-smart-chart-bar">
                  <div className="marketing-smart-chart-bar-head">
                    <span className="marketing-smart-chart-bar-label">{b.label}</span>
                    <span className="marketing-smart-chart-bar-value tabular-nums">{b.display}</span>
                  </div>
                  <div className="marketing-smart-chart-bar-track">
                    <div className={`marketing-smart-chart-bar-fill grp-${b.group}`} style={{ width: `${Math.min(100, (b.value / gmax) * 100)}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="marketing-smart-chart-summary">📌 {view.chart.summary}</div>
      </div>
      ) : (
      <div className="marketing-comparison-empty">
        <h3 className="mkt-section-title">🔎 요청 기반 비교 분석</h3>
        <p className="marketing-comparison-empty-desc">
          비교할 지표를 선택하거나 <em>"첫구매와 재구매 객단가 비교해줘"</em>처럼 요청하면 이 영역에 그래프가 생성됩니다.
        </p>
        <div className="marketing-comparison-quick">
          <button type="button" className="marketing-comparison-quick-chip" onClick={() => requestComparison('firstRepeat')}>첫구매 vs 재구매</button>
          <button type="button" className="marketing-comparison-quick-chip" onClick={() => requestComparison('coupon')}>쿠폰 사용 vs 미사용</button>
          <button type="button" className="marketing-comparison-quick-chip" onClick={() => requestComparison('memberGroup')}>회원그룹 비교</button>
          <button type="button" className="marketing-comparison-quick-chip" onClick={() => requestComparison('orderChannel')}>주문채널 비교</button>
        </div>
      </div>
      )}

      {/* ── AI 분석 리포트 — artifact 있으면 narrative 우선, 없으면 기존 facts.insights ── */}
      {marketingChartArtifact ? (
        <>
          <MarketingNarrativeReport artifact={marketingChartArtifact} />
          <div
            className="marketing-analysis-memory-hint"
            data-marketing-analysis-memory-count={marketingMemoryHintCount ?? 0}
            data-marketing-analysis-memory-used={String((marketingMemoryHintCount ?? 0) > 0)}
          >
            {(marketingMemoryHintCount ?? 0) > 0 ? `🧠 유사 분석 힌트 ${marketingMemoryHintCount}건 참고` : null}
          </div>
        </>
      ) : hasRequestedComparison ? (
      <div className="mkt-insights marketing-ai-report">
        <h3 className="mkt-section-title">🤖 AI 분석 리포트 (관찰 기반 · 인과 단정 아님)</h3>
        <div className="mkt-insights-list">
          {facts.insights.map((ins, idx) =>
            idx < INSIGHT_LIMIT ? (
              <div key={ins.id} className={`mkt-insight sev-${ins.severity}`}>
                <div className="mkt-insight-head">
                  <span className={`mkt-insight-sev sev-${ins.severity}`}>{SEV_LABEL[ins.severity]}</span>
                  <strong>{ins.title}</strong>
                </div>
                <p className="mkt-insight-summary"><span className="mkt-insight-tag">핵심 관찰</span> {ins.summary}</p>
                {ins.evidenceIds.length > 0 && (
                  <div className="mkt-insight-evidence"><span className="mkt-insight-tag">근거</span> {ins.evidenceIds.map(evidenceLabel).filter(Boolean).join(' · ')}</div>
                )}
                {ins.recommendedNextAction && <p className="mkt-insight-action"><span className="mkt-insight-tag">다음 확인 후보</span> {ins.recommendedNextAction}</p>}
              </div>
            ) : null
          )}
        </div>
        <p className="marketing-ai-caution">※ 주의할 해석: 위 수치는 관찰값이며 인과관계를 단정하지 않습니다. 추가 분석은 아래 [세부 분석]에서 확인하세요.</p>
      </div>
      ) : (
      <div className="marketing-ai-report-placeholder">
        <h3 className="mkt-section-title">🤖 AI 분석 리포트</h3>
        <p className="marketing-ai-placeholder-desc">비교 그래프가 생성되면 이 영역에 핵심 해석과 추천 액션이 표시됩니다.</p>
        <ul className="marketing-ai-placeholder-examples">
          <li>재구매 고객의 객단가가 왜 높은지 분석해줘</li>
          <li>쿠폰 사용 고객과 미사용 고객을 비교해줘</li>
          <li>VIP 매출 기여도를 요약해줘</li>
        </ul>
      </div>
      )}

      {/* ── 세부 분석 (기존 차원 카드 재배치) ── */}
      <div className="marketing-detail-section">
        <h3 className="mkt-section-title">📂 세부 분석</h3>
        {/* 신규/재구매 고객 비교 — 상단 KPI에서 이동(삭제 아님). facts 기존 계산값만 사용. */}
        <div className="mkt-first-repeat-card">
          <h4 className="mkt-dim-title">신규/재구매 고객 비교</h4>
          <div className="mkt-first-repeat-grid">
            <div className="mkt-fr-cell">
              <span className="mkt-fr-label">첫구매 객단가</span>
              <span className="mkt-fr-value tabular-nums">{won(s.firstPurchaseAverageOrderValue)}</span>
            </div>
            <div className="mkt-fr-cell">
              <span className="mkt-fr-label">재구매 객단가</span>
              <span className="mkt-fr-value tabular-nums">{won(s.repeatPurchaseAverageOrderValue)}</span>
            </div>
            <div className="mkt-fr-cell">
              <span className="mkt-fr-label">첫구매 매출 비중</span>
              <span className="mkt-fr-value tabular-nums">{firstRevenueShare}%</span>
            </div>
            <div className="mkt-fr-cell">
              <span className="mkt-fr-label">재구매 매출 비중</span>
              <span className="mkt-fr-value tabular-nums">{repeatRevenueShare}%</span>
            </div>
          </div>
          <p className="mkt-fr-note">※ 첫구매/재구매는 주문 단위 관찰값이며 인과를 단정하지 않습니다.</p>
        </div>
        {/* 마케팅 사고 흐름: 누가 샀나 → 어떻게 샀나 → 무엇이 팔렸나. 기본 노출은 제한, 전체는 모달. */}
        <div className="mkt-dim-grid">
          <DimensionBlock title="회원그룹별 매출" markerClass="mkt-dim-memberGroup" items={facts.byMemberGroup} limit={4}
            onExpand={() => setDetailModal({ title: '회원그룹별 매출', items: facts.byMemberGroup, sorts: ['revenue', 'orderCount', 'averageOrderValue'] })} />
          <DimensionBlock title="주문채널별 매출" markerClass="mkt-dim-channel" items={facts.byOrderChannel} limit={4}
            onExpand={() => setDetailModal({ title: '주문채널별 매출', items: facts.byOrderChannel, sorts: ['revenue', 'orderCount', 'averageOrderValue'] })} />
          <DimensionBlock title="쿠폰 사용/미사용 비교" markerClass="mkt-dim-coupon" items={facts.byCouponUsage} limit={4}
            onExpand={() => setDetailModal({ title: '쿠폰 사용/미사용 비교', items: facts.byCouponUsage, sorts: ['revenue', 'orderCount', 'averageOrderValue'] })} />
          <DimensionBlock title="마일리지/예치금 사용 비교" markerClass="mkt-dim-reward" items={facts.byRewardUsage} limit={4}
            onExpand={() => setDetailModal({ title: '마일리지/예치금 사용 비교', items: facts.byRewardUsage, sorts: ['revenue', 'orderCount', 'averageOrderValue'] })} />
          <DimensionBlock title="상품 매출 TOP" markerClass="mkt-dim-product" items={facts.topProducts} limit={5}
            onExpand={() => setDetailModal({ title: '상품 매출 TOP', items: facts.topProducts, sorts: ['revenue', 'orderCount', 'averageOrderValue'] })} />
          <DimensionBlock title="카테고리 매출 TOP" markerClass="mkt-dim-category" items={facts.topCategories} limit={4}
            onExpand={() => setDetailModal({ title: '카테고리 매출 TOP', items: facts.topCategories, sorts: ['revenue', 'orderCount', 'sharePercent'] })} />
        </div>
      </div>

      {/* ── requiredData 축소 (외부 연동 필요) ── */}
      <div className="mkt-required marketing-required-compact">
        <h3 className="mkt-section-title">🔒 외부 데이터 연결 필요 (현재 미계산)</h3>
        <p className="mkt-required-note">
          아래 지표는 현재 <strong>계산하지 않습니다</strong>. 추정값이나 0을 표시하지 않으며, 외부 데이터 연결 후 활성화됩니다.
        </p>
        <div className="mkt-required-grid compact">
          {facts.requiredData.map((rd) => (
            <div key={rd.key} className="mkt-required-card locked">
              <div className="mkt-required-head">
                <span className="mkt-lock">🔒</span>
                <strong>{rd.unlocks.join(' · ')}</strong>
              </div>
              <span className="mkt-required-tag">외부 연동 필요</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mkt-footnote">
        ※ 분석·관찰 facts만 제공하며, 캠페인 실행/광고 집행/회원 수정 등 외부 실행은 승인 전 하지 않습니다. (실제 WRITE 없음)
      </p>

      {/* 고객 행동 분석 modal — 클릭형 KPI 진입. 닫힘 시 null 반환(MetricDrilldownModal 패턴). */}
      <MarketingCustomerBehaviorModal isOpen={behaviorModalOpen} onClose={() => setBehaviorModalOpen(false)} />

      {/* 세부 분석 전체보기 모달 — 표시 전용(검색/정렬). */}
      <MarketingDetailModal
        open={detailModal !== null}
        title={detailModal?.title ?? ''}
        periodLabel={PERIOD_LABEL[preset]}
        items={detailModal?.items ?? []}
        sorts={detailModal?.sorts}
        onClose={() => setDetailModal(null)}
      />
    </div>
  );
};
