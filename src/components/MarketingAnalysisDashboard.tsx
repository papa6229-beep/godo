import React, { useMemo, useState } from 'react';
import './MarketingAnalysisDashboard.css';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import type { RevenueResult, AdminProductsResult } from '../services/departmentDataService';
import {
  buildMarketingAnalysisFacts,
  type MarketingAnalysisPeriod,
  type MarketingAnalysisPeriodPreset,
  type MarketingDimensionMetric,
  type MarketingInsight
} from '../services/marketingAnalysisFacts';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Analysis Dashboard v0
//
// 역할: 마케팅 분석팀 화면. buildMarketingAnalysisFacts(순수 helper)가 계산한 facts를 "표시만" 한다.
//   - 대시보드 내부에서 새 집계 로직을 만들지 않는다(계산은 facts builder가 권위).
//   - 고도몰 스펙 기반 주문/상품 데이터로 계산 가능한 지표만 표시.
//   - 방문자/광고/ROAS/GA4/SNS 등 외부 데이터 지표는 requiredData(잠금 카드)로만 안내(0/추정 금지).
//   - PII(고객명/전화/이메일/주소) 미표시. 집계/그룹/차원 라벨만.
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

const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;

// KPI 카드 (카운터 애니메이션, reduced-motion guard는 useAnimatedNumber 내부)
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

// 분석 차원 블록 (라벨/매출/주문수/객단가/비중 + bar)
const DimensionBlock: React.FC<{ title: string; markerClass: string; items: MarketingDimensionMetric[]; emptyText?: string }> = ({
  title,
  markerClass,
  items,
  emptyText
}) => (
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

  const period = useMemo<MarketingAnalysisPeriod>(
    () => (preset === 'custom' ? { preset, startDate: appliedCustom.start, endDate: appliedCustom.end } : { preset }),
    [preset, appliedCustom.start, appliedCustom.end]
  );

  // RevenueOrderLite → 마케팅 facts 입력 어댑터(state 중첩 + enrichment 필드). PII 미포함.
  const marketingOrders = useMemo(() => {
    return (revenue?.orders || []).map((o) => ({
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
      state: { paid: o.paid, canceled: o.canceled },
      lines: o.lines.map((l) => ({
        goodsNo: l.goodsNo,
        goodsName: l.goodsName,
        categoryCode: l.categoryCode,
        categoryLabel: l.categoryLabel,
        lineRevenue: l.lineRevenue,
        quantity: l.quantity
      }))
    }));
  }, [revenue]);

  const facts = useMemo(
    () =>
      buildMarketingAnalysisFacts({
        orders: marketingOrders,
        products: products?.products,
        reviews: revenue?.universeAux?.reviews,
        inquiries: revenue?.universeAux?.inquiries,
        period
      }),
    [marketingOrders, products, revenue, period]
  );

  const s = facts.summary;
  const evidenceLabel = (id: string): string => {
    const e = facts.evidence.find((x) => x.id === id);
    return e ? `${e.label} ${e.value}` : '';
  };

  const kpis: { label: string; value: number; kind: 'won' | 'count'; tone?: string }[] = [
    { label: '총매출', value: s.totalRevenue, kind: 'won', tone: 'primary' },
    { label: '주문수', value: s.orderCount, kind: 'count' },
    { label: '객단가', value: s.averageOrderValue, kind: 'won' },
    { label: '첫구매 매출', value: s.firstPurchaseRevenue, kind: 'won' },
    { label: '재구매 매출', value: s.repeatPurchaseRevenue, kind: 'won' },
    { label: '쿠폰 사용 주문', value: s.couponOrderCount, kind: 'count' },
    { label: '총 할인액', value: s.totalDiscountAmount, kind: 'won' },
    { label: '리워드 사용액', value: s.totalRewardUseAmount, kind: 'won' }
  ];

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
        현재 화면은 고도몰 스펙 기반 주문·상품·CS 데이터로 <strong>계산 가능한 마케팅 지표만</strong> 표시합니다. 방문자, 광고비, ROAS, GA4, SNS
        성과는 외부 데이터 연결 후 활성화됩니다.
      </p>

      {/* ── 기간 필터 ── */}
      <div className="mkt-period">
        <div className="mkt-period-presets">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`mkt-period-btn ${preset === p.key ? 'active' : ''}`}
              onClick={() => setPreset(p.key)}
            >
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
            <button
              type="button"
              className="mkt-period-reset"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setAppliedCustom({});
              }}
            >
              초기화
            </button>
          </div>
        )}
      </div>

      {s.orderCount === 0 && <div className="mkt-empty-banner">선택한 기간에 분석할 주문이 없습니다. 기간을 넓혀보세요.</div>}

      {/* ── KPI 카드 ── */}
      <div className="mkt-kpi-grid">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} kind={k.kind} tone={k.tone} />
        ))}
      </div>

      {/* ── 분석 차원 ── */}
      <div className="mkt-dim-grid">
        <DimensionBlock title="회원그룹별 매출" markerClass="mkt-dim-memberGroup" items={facts.byMemberGroup} />
        <DimensionBlock title="주문채널별 매출" markerClass="mkt-dim-channel" items={facts.byOrderChannel} />
        <DimensionBlock title="쿠폰 사용/미사용 비교" markerClass="mkt-dim-coupon" items={facts.byCouponUsage} />
        <DimensionBlock title="마일리지/예치금 사용 비교" markerClass="mkt-dim-reward" items={facts.byRewardUsage} />
        <DimensionBlock title="상품 매출 TOP" markerClass="mkt-dim-product" items={facts.topProducts} />
        <DimensionBlock title="카테고리 매출 TOP" markerClass="mkt-dim-category" items={facts.topCategories} />
        <DimensionBlock title="브랜드 매출 TOP" markerClass="mkt-dim-brand" items={facts.topBrands} emptyText="브랜드 미연동 (상품 메타데이터 부족)" />
      </div>

      {/* ── AI 분석 패널 (관찰 기반) ── */}
      <div className="mkt-insights">
        <h3 className="mkt-section-title">🤖 AI 분석 (관찰 기반 · 인과 단정 아님)</h3>
        <div className="mkt-insights-list">
          {facts.insights.map((ins) => (
            <div key={ins.id} className={`mkt-insight sev-${ins.severity}`}>
              <div className="mkt-insight-head">
                <span className={`mkt-insight-sev sev-${ins.severity}`}>{SEV_LABEL[ins.severity]}</span>
                <strong>{ins.title}</strong>
              </div>
              <p className="mkt-insight-summary">{ins.summary}</p>
              {ins.recommendedNextAction && <p className="mkt-insight-action">▶ 제안: {ins.recommendedNextAction}</p>}
              {ins.evidenceIds.length > 0 && (
                <div className="mkt-insight-evidence">근거: {ins.evidenceIds.map(evidenceLabel).filter(Boolean).join(' · ')}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── requiredData (외부 연동 필요 · 미계산) ── */}
      <div className="mkt-required">
        <h3 className="mkt-section-title">🔒 외부 데이터 연결 필요 (현재 미계산)</h3>
        <p className="mkt-required-note">
          아래 지표는 현재 <strong>계산하지 않습니다</strong>. 추정값이나 0을 표시하지 않으며, 외부 데이터 연결 후 활성화됩니다.
        </p>
        <div className="mkt-required-grid">
          {facts.requiredData.map((rd) => (
            <div key={rd.key} className="mkt-required-card locked">
              <div className="mkt-required-head">
                <span className="mkt-lock">🔒</span>
                <strong>{rd.unlocks.join(' · ')}</strong>
              </div>
              <p className="mkt-required-reason">필요 데이터: {rd.label} — {rd.reason}</p>
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
