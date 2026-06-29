import React, { useMemo, useState } from 'react';
import './MarketingAnalysisDashboard.css';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import type { RevenueResult, AdminProductsResult } from '../services/departmentDataService';
import {
  buildMarketingAnalysisFacts,
  type MarketingAnalysisPeriod,
  type MarketingAnalysisPeriodPreset,
  type MarketingAnalysisFacts,
  type MarketingDimensionMetric,
  type MarketingInsight
} from '../services/marketingAnalysisFacts';

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
const KpiCard: React.FC<{ label: string; value: number; kind: 'won' | 'count'; tone?: string }> = ({ label, value, kind, tone }) => {
  const v = useAnimatedNumber(value, { durationMs: 420 });
  return (
    <div className={`mkt-kpi-card ${tone || ''}`}>
      <span className="mkt-kpi-label">{label}</span>
      <span className="mkt-kpi-value tabular-nums">
        {Math.round(v).toLocaleString()}
        {kind === 'won' ? '원' : '건'}
      </span>
    </div>
  );
};

// 세부 분석 차원 블록 (기존 마커 유지: mkt-dim-*)
const DimensionBlock: React.FC<{ title: string; markerClass: string; items: MarketingDimensionMetric[]; emptyText?: string }> = ({ title, markerClass, items, emptyText }) => (
  <div className={`mkt-dim-block ${markerClass}`}>
    <h4 className="mkt-dim-title">{title}</h4>
    {items.length === 0 ? (
      <p className="mkt-dim-empty">{emptyText || '표시할 데이터가 없습니다.'}</p>
    ) : (
      <ul className="mkt-dim-list">
        {items.map((it) => (
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
  </div>
);

const SEV_LABEL: Record<MarketingInsight['severity'], string> = { info: '관찰', positive: '긍정', warning: '주의' };

export const MarketingAnalysisDashboard: React.FC<Props> = ({ revenue, products, loading, onRefresh }) => {
  const [preset, setPreset] = useState<MarketingAnalysisPeriodPreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedCustom, setAppliedCustom] = useState<{ start?: string; end?: string }>({});
  const [focus, setFocus] = useState<MarketingFocusMetric>('aov');

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
        고도몰 주문·상품·CS 데이터 기준으로 <strong>계산 가능한 마케팅 분석만</strong> 표시합니다. 방문자, 광고비, ROAS, GA4, SNS 성과는 외부 데이터 연결 후
        활성화됩니다.
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
            <button key={c.key} type="button" className={`marketing-focus-chip ${focus === c.key ? 'active' : ''}`} onClick={() => setFocus(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {s.orderCount === 0 && <div className="mkt-empty-banner">선택한 기간에 분석할 주문이 없습니다. 기간을 넓혀보세요.</div>}

      {/* ── 고정 KPI 2 + 선택 지표 + 비교 요약 (compact) ── */}
      <div className="marketing-kpi-compact-grid mkt-kpi-grid">
        <KpiCard label="총매출" value={s.totalRevenue} kind="won" tone="primary" />
        <KpiCard label="주문수" value={s.orderCount} kind="count" />
        <KpiCard label={view.selectedKpi.label} value={view.selectedKpi.value} kind={view.selectedKpi.kind} tone="focus" />
        <div className="mkt-kpi-card mkt-kpi-compare">
          <span className="mkt-kpi-label">{view.comparison.label}</span>
          <span className="mkt-kpi-compare-text">{view.comparison.text}</span>
        </div>
      </div>

      {/* ── 메인 비교 그래프 (smart chart) ── */}
      <div className="marketing-smart-chart">
        <div className="marketing-smart-chart-head">
          <h3 className="mkt-section-title">선택 지표 비교 그래프 · {view.chipLabel}</h3>
          <p className="marketing-smart-chart-desc">{view.chart.desc}</p>
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

      {/* ── AI 분석 리포트 (smart chart 바로 아래) ── */}
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

      {/* ── 세부 분석 (기존 차원 카드 재배치) ── */}
      <div className="marketing-detail-section">
        <h3 className="mkt-section-title">📂 세부 분석</h3>
        <div className="mkt-dim-grid">
          <DimensionBlock title="회원그룹별 매출" markerClass="mkt-dim-memberGroup" items={facts.byMemberGroup} />
          <DimensionBlock title="주문채널별 매출" markerClass="mkt-dim-channel" items={facts.byOrderChannel} />
          <DimensionBlock title="쿠폰 사용/미사용 비교" markerClass="mkt-dim-coupon" items={facts.byCouponUsage} />
          <DimensionBlock title="마일리지/예치금 사용 비교" markerClass="mkt-dim-reward" items={facts.byRewardUsage} />
          <DimensionBlock title="상품 매출 TOP" markerClass="mkt-dim-product" items={facts.topProducts} />
          <DimensionBlock title="카테고리 매출 TOP" markerClass="mkt-dim-category" items={facts.topCategories} />
          <DimensionBlock title="브랜드 매출 TOP" markerClass="mkt-dim-brand" items={facts.topBrands} emptyText="브랜드 미연동 (상품 메타데이터 부족)" />
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
    </div>
  );
};
