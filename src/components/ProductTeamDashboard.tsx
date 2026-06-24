import React, { useMemo, useState } from 'react';
import './ProductTeamDashboard.css';
import type {
  AdminProductsResult,
  RevenueResult,
  RevenueOrderLite,
  StockImpactItem
} from '../services/departmentDataService';

// 상품관리팀 매출/재고 대시보드 v1
// - 데이터: /api/godomall/orders-revenue?includeSynthetic=true (orders/summary/stockImpact)
// - 하드코딩 없음, 모든 수치/차트는 orders·stockImpact에서 파생
// - 외부 차트 라이브러리 없이 인라인 SVG/CSS로 시각화

interface ProductTeamDashboardProps {
  products: AdminProductsResult | null;
  revenue: RevenueResult | null;
  loading: boolean;
  onRefresh: () => void;
}

const CAT_COLORS = [
  'var(--accent-primary)',
  '#3DDC97',
  '#5AC8FA',
  '#FBBF24',
  '#FF6B6B',
  '#A78BFA',
  '#F472B6',
  '#94A3B8'
];

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const qty = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}`;
const pctStr = (n: number): string => `${(n * 100).toFixed(1)}%`;

type StockLevel = 'danger' | 'warn' | 'ok';
const stockLevel = (projected: number): StockLevel =>
  projected <= 20 ? 'danger' : projected <= 40 ? 'warn' : 'ok';

export const ProductTeamDashboard: React.FC<ProductTeamDashboardProps> = ({
  products,
  revenue,
  loading,
  onRefresh
}) => {
  const [category, setCategory] = useState<string>('all');
  const [year, setYear] = useState<string>('all');
  const [month, setMonth] = useState<string>('all'); // 'all' | '1'..'12'
  const [dataSrc, setDataSrc] = useState<'all' | 'real' | 'synthetic'>('all');

  const orders = useMemo<RevenueOrderLite[]>(() => revenue?.orders ?? [], [revenue]);
  const stockImpact = useMemo<StockImpactItem[]>(() => revenue?.stockImpact ?? [], [revenue]);
  const summary = revenue?.summary ?? null;

  // 라인에서 goodsNo → 카테고리 맵 (재고 카테고리 필터 / 테이블 카테고리용)
  const goodsCategory = useMemo(() => {
    const m = new Map<string, { code: string; label: string }>();
    for (const o of orders) {
      for (const l of o.lines) {
        if (l.goodsNo && !m.has(l.goodsNo)) m.set(l.goodsNo, { code: l.categoryCode, label: l.categoryLabel });
      }
    }
    return m;
  }, [orders]);

  // 필터 옵션 (실데이터 기반)
  const categoryOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) for (const l of o.lines) if (!m.has(l.categoryCode)) m.set(l.categoryCode, l.categoryLabel);
    return Array.from(m.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [orders]);

  const yearOptions = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) if (o.orderDate.length >= 4) s.add(o.orderDate.slice(0, 4));
    return Array.from(s).sort();
  }, [orders]);

  const monthsPresent = useMemo(() => {
    const s = new Set<string>(); // 'M' (1..12)
    for (const o of orders) {
      if (year !== 'all' && o.orderDate.slice(0, 4) !== year) continue;
      if (o.orderDate.length >= 7) s.add(String(parseInt(o.orderDate.slice(5, 7), 10)));
    }
    return s;
  }, [orders, year]);

  // 주문 레벨 필터 (연도/월/데이터소스) — 카테고리는 라인 레벨에서
  const ordersFiltered = useMemo(() => {
    return orders.filter((o) => {
      const y = o.orderDate.slice(0, 4);
      const m = o.orderDate.length >= 7 ? String(parseInt(o.orderDate.slice(5, 7), 10)) : '';
      if (year !== 'all' && y !== year) return false;
      if (month !== 'all' && m !== month) return false;
      if (dataSrc === 'real' && o.sourceType !== 'real_godomall') return false;
      if (dataSrc === 'synthetic' && o.sourceType !== 'synthetic_test') return false;
      return true;
    });
  }, [orders, year, month, dataSrc]);

  const lineInCat = (code: string): boolean => category === 'all' || code === category;

  // 카테고리 필터까지 적용된 "관련 주문" (해당 카테고리 라인을 가진 주문)
  const relevantOrders = useMemo(() => {
    if (category === 'all') return ordersFiltered;
    return ordersFiltered.filter((o) => o.lines.some((l) => l.categoryCode === category));
  }, [ordersFiltered, category]);

  const filteredStock = useMemo(() => {
    if (category === 'all') return stockImpact;
    return stockImpact.filter((s) => (goodsCategory.get(s.productId)?.code ?? 'uncategorized') === category);
  }, [stockImpact, category, goodsCategory]);

  // KPI
  const kpi = useMemo(() => {
    let revenueSum = 0;
    let sold = 0;
    let restored = 0;
    let real = 0;
    let synth = 0;
    for (const o of relevantOrders) {
      if (o.sourceType === 'synthetic_test') synth++;
      else real++;
      for (const l of o.lines) {
        if (!lineInCat(l.categoryCode)) continue;
        revenueSum += l.lineRevenue;
        if (o.canceled) restored += l.quantity;
        else if (o.paid) sold += l.quantity;
      }
    }
    const virtualStock = filteredStock.reduce((s, x) => s + x.syntheticProjectedStock, 0);
    const riskCount = filteredStock.filter((x) => x.syntheticProjectedStock <= 20).length;
    return {
      revenue: revenueSum,
      orderCount: relevantOrders.length,
      real,
      synth,
      sold,
      restored,
      net: sold - restored,
      virtualStock,
      trackedCount: filteredStock.length,
      riskCount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantOrders, filteredStock, category]);

  // 월별 매출 추이
  const monthly = useMemo(() => {
    const m = new Map<string, { ym: string; revenue: number; orders: number; deliveryFee: number; totalAmount: number }>();
    for (const o of relevantOrders) {
      if (o.orderDate.length < 7) continue;
      const ym = o.orderDate.slice(0, 7);
      const b = m.get(ym) || { ym, revenue: 0, orders: 0, deliveryFee: 0, totalAmount: 0 };
      b.orders += 1;
      b.deliveryFee += o.deliveryFee;
      b.totalAmount += o.totalAmount;
      for (const l of o.lines) if (lineInCat(l.categoryCode)) b.revenue += l.lineRevenue;
      m.set(ym, b);
    }
    return Array.from(m.values()).sort((a, b) => a.ym.localeCompare(b.ym));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantOrders, category]);

  // 카테고리 비중 (도넛) — 카테고리 필터 미적용(선택기 역할)
  const categoryData = useMemo(() => {
    const m = new Map<string, { code: string; label: string; revenue: number }>();
    let total = 0;
    for (const o of ordersFiltered) {
      for (const l of o.lines) {
        const b = m.get(l.categoryCode) || { code: l.categoryCode, label: l.categoryLabel, revenue: 0 };
        b.revenue += l.lineRevenue;
        total += l.lineRevenue;
        m.set(l.categoryCode, b);
      }
    }
    const arr = Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
    return { total, items: arr.map((x) => ({ ...x, pct: total > 0 ? x.revenue / total : 0 })) };
  }, [ordersFiltered]);

  // 상품별 매출/판매 순위
  const ranking = useMemo(() => {
    const m = new Map<string, { goodsNo: string; name: string; revenue: number; quantity: number }>();
    for (const o of relevantOrders) {
      for (const l of o.lines) {
        if (!lineInCat(l.categoryCode)) continue;
        const b = m.get(l.goodsNo) || { goodsNo: l.goodsNo, name: l.goodsName, revenue: 0, quantity: 0 };
        b.revenue += l.lineRevenue;
        b.quantity += l.quantity;
        m.set(l.goodsNo, b);
      }
    }
    const arr = Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
    const max = arr.length > 0 ? arr[0].revenue : 0;
    const totalRev = arr.reduce((s, x) => s + x.revenue, 0);
    return arr.slice(0, 8).map((x) => ({ ...x, bar: max > 0 ? x.revenue / max : 0, pct: totalRev > 0 ? x.revenue / totalRev : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantOrders, category]);

  // 재고 위험 (가상 현재 재고 낮은 순)
  const stockRisk = useMemo(
    () => [...filteredStock].sort((a, b) => a.syntheticProjectedStock - b.syntheticProjectedStock),
    [filteredStock]
  );

  // 상품 리스트 테이블 (매출 + 가상재고 결합)
  const tableRows = useMemo(() => {
    const rev = new Map<string, { revenue: number; quantity: number }>();
    for (const o of relevantOrders) {
      for (const l of o.lines) {
        if (!lineInCat(l.categoryCode)) continue;
        const b = rev.get(l.goodsNo) || { revenue: 0, quantity: 0 };
        b.revenue += l.lineRevenue;
        b.quantity += l.quantity;
        rev.set(l.goodsNo, b);
      }
    }
    return filteredStock
      .map((s) => {
        const r = rev.get(s.productId) || { revenue: 0, quantity: 0 };
        const cat = goodsCategory.get(s.productId);
        return {
          productId: s.productId,
          name: s.productName,
          category: cat?.label || 'uncategorized',
          revenue: r.revenue,
          quantity: r.quantity,
          projected: s.syntheticProjectedStock,
          sourceStockEnabled: s.sourceStockEnabled,
          sourceStock: s.sourceStock,
          level: stockLevel(s.syntheticProjectedStock)
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantOrders, filteredStock, goodsCategory, category]);

  const resetFilters = () => {
    setCategory('all');
    setYear('all');
    setMonth('all');
    setDataSrc('all');
  };

  const synthOn = (summary?.syntheticOrderCount ?? 0) > 0;
  const unavailable = !revenue || revenue.source === 'unavailable' || !summary;

  return (
    <div className="ptd">
      {/* 헤더 */}
      <div className="ptd-header">
        <div>
          <h2 className="ptd-title">상품관리팀 대시보드</h2>
          <p className="ptd-sub">매출 · 판매수량 · 가상재고 · 상품상태를 확인합니다.</p>
        </div>
        <div className="ptd-header-right">
          <span className={`ptd-badge ${synthOn ? 'on' : 'off'}`}>
            🧪 {synthOn ? `실제 ${summary?.realOrderCount ?? 0}건 + 가상 ${summary?.syntheticOrderCount ?? 0}건 포함` : 'REAL ONLY'}
            <span className="ptd-badge-tag">REAL + SYNTHETIC</span>
          </span>
          <button type="button" className="ptd-refresh" onClick={onRefresh} disabled={loading}>
            {loading ? '새로고침 중…' : '↻ 새로고침'}
          </button>
        </div>
      </div>

      {unavailable ? (
        <div className="ptd-empty">
          데이터를 불러오지 못했습니다. (로컬 dev에서는 서버 라우트가 없을 수 있습니다 — 배포 환경에서 확인하세요.)
        </div>
      ) : (
        <>
          {/* 필터바 */}
          <div className="ptd-filterbar">
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">카테고리</span>
              <button className={`ptd-chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>전체</button>
              {categoryOptions.map((c) => (
                <button key={c.code} className={`ptd-chip ${category === c.code ? 'active' : ''}`} onClick={() => setCategory(c.code)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">연도</span>
              <button className={`ptd-chip ${year === 'all' ? 'active' : ''}`} onClick={() => { setYear('all'); }}>전체</button>
              {yearOptions.map((y) => (
                <button key={y} className={`ptd-chip ${year === y ? 'active' : ''}`} onClick={() => setYear(y)}>{y}</button>
              ))}
            </div>
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">월</span>
              <button className={`ptd-chip ${month === 'all' ? 'active' : ''}`} onClick={() => setMonth('all')}>전체</button>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                <button
                  key={m}
                  className={`ptd-chip ${month === m ? 'active' : ''} ${monthsPresent.has(m) ? '' : 'dim'}`}
                  onClick={() => setMonth(m)}
                >
                  {m}월
                </button>
              ))}
            </div>
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">데이터</span>
              {([['all', '전체'], ['real', '실제만'], ['synthetic', '가상만']] as const).map(([v, label]) => (
                <button key={v} className={`ptd-chip ${dataSrc === v ? 'active' : ''}`} onClick={() => setDataSrc(v)}>{label}</button>
              ))}
            </div>
            <button type="button" className="ptd-reset" onClick={resetFilters}>↺ 초기화</button>
          </div>

          {/* KPI 카드 4개 */}
          <div className="ptd-kpi-grid">
            <div className="ptd-kpi-card">
              <div className="ptd-kpi-label">💰 상품매출</div>
              <div className="ptd-kpi-value">{won(kpi.revenue)}</div>
              <div className="ptd-kpi-sub">배송비 제외 (라인합)</div>
            </div>
            <div className="ptd-kpi-card">
              <div className="ptd-kpi-label">🧾 총 주문</div>
              <div className="ptd-kpi-value">{qty(kpi.orderCount)}<span className="ptd-kpi-unit">건</span></div>
              <div className="ptd-kpi-sub">실제 {kpi.real} · 가상 {kpi.synth}</div>
            </div>
            <div className="ptd-kpi-card">
              <div className="ptd-kpi-label">📈 판매수량</div>
              <div className="ptd-kpi-value">{qty(kpi.sold)}<span className="ptd-kpi-unit">개</span></div>
              <div className="ptd-kpi-sub">복구 {kpi.restored} · 순판매 {kpi.net}</div>
            </div>
            <div className="ptd-kpi-card">
              <div className="ptd-kpi-label">🏬 가상 현재 재고</div>
              <div className="ptd-kpi-value">
                {qty(kpi.virtualStock)}<span className="ptd-kpi-unit">개</span>
                {kpi.riskCount > 0 && <span className="ptd-kpi-risk">위험 {kpi.riskCount}</span>}
              </div>
              <div className="ptd-kpi-sub">관리 상품 {kpi.trackedCount}개</div>
            </div>
          </div>

          {/* 차트 Row 1 */}
          <div className="ptd-row">
            <div className="ptd-panel ptd-panel-wide">
              <div className="ptd-panel-head"><h3>월별 매출 추이</h3><span className="ptd-panel-meta">상품매출 · 주문수</span></div>
              {renderMonthlyChart(monthly)}
            </div>
            <div className="ptd-panel">
              <div className="ptd-panel-head"><h3>매출 구성</h3><span className="ptd-panel-meta">카테고리 비중</span></div>
              {renderDonut(categoryData, category, setCategory)}
            </div>
          </div>

          {/* 차트 Row 2 */}
          <div className="ptd-row">
            <div className="ptd-panel ptd-panel-wide">
              <div className="ptd-panel-head"><h3>상품별 매출 순위</h3><span className="ptd-panel-meta">상위 {ranking.length}</span></div>
              {ranking.length === 0 ? (
                <p className="ptd-muted">표시할 상품이 없습니다.</p>
              ) : (
                <ul className="ptd-rank-list">
                  {ranking.map((r, i) => (
                    <li key={r.goodsNo || i} className="ptd-rank-row">
                      <span className="ptd-rank-no">{i + 1}</span>
                      <span className="ptd-rank-name" title={r.name}>{r.name || '(이름 없음)'}</span>
                      <div className="ptd-rank-bar-wrap">
                        <div className="ptd-rank-bar" style={{ width: `${Math.max(2, r.bar * 100)}%` }} />
                      </div>
                      <span className="ptd-rank-rev">{won(r.revenue)}</span>
                      <span className="ptd-rank-qty">{qty(r.quantity)}개 · {pctStr(r.pct)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="ptd-panel">
              <div className="ptd-panel-head"><h3>재고 영향</h3><span className="ptd-panel-meta">가상 현재 재고 낮은 순</span></div>
              {stockRisk.length === 0 ? (
                <p className="ptd-muted">표시할 상품이 없습니다.</p>
              ) : (
                <ul className="ptd-stock-list">
                  {stockRisk.slice(0, 6).map((s) => (
                    <li key={s.productId} className={`ptd-stock-card lv-${stockLevel(s.syntheticProjectedStock)}`}>
                      <div className="ptd-stock-top">
                        <span className="ptd-stock-name" title={s.productName}>{s.productName}</span>
                        <span className="ptd-stock-now">{qty(s.syntheticProjectedStock)}</span>
                      </div>
                      <div className="ptd-stock-meta">
                        초기 {qty(s.syntheticInitialStock)} · 판매 {qty(s.syntheticSoldQuantity)} · 복구 {qty(s.syntheticRestoredQuantity)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 상품 리스트 테이블 */}
          <div className="ptd-panel">
            <div className="ptd-panel-head"><h3>상품 리스트</h3><span className="ptd-panel-meta">{tableRows.length}개 · 가상재고 기준</span></div>
            <div className="ptd-table-wrap">
              <table className="ptd-table">
                <thead>
                  <tr>
                    <th>상품명</th><th>카테고리</th><th className="num">상품매출</th><th className="num">판매수량</th><th className="num">가상재고</th><th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr><td colSpan={6} className="ptd-muted">표시할 상품이 없습니다.</td></tr>
                  ) : (
                    tableRows.map((row) => (
                      <tr key={row.productId}>
                        <td>
                          <span className="ptd-td-name">{row.name || '(이름 없음)'}</span>
                          {!row.sourceStockEnabled && <span className="ptd-td-note">샘플몰 원본: 재고관리 안함</span>}
                        </td>
                        <td>{row.category}</td>
                        <td className="num">{won(row.revenue)}</td>
                        <td className="num">{qty(row.quantity)}</td>
                        <td className="num strong">{qty(row.projected)}</td>
                        <td>
                          <span className={`ptd-status lv-${row.level}`}>
                            {row.level === 'danger' ? '위험' : row.level === 'warn' ? '주의' : '정상'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="ptd-foot">
            데이터: <code>/api/godomall/orders-revenue?includeSynthetic=true</code> · 상품 수 {products?.count ?? 0}개 ·
            모든 수치는 orders / summary / stockImpact 에서 파생 (하드코딩 없음). 가상재고 = synthetic projected, 원본재고는 보조.
          </p>
        </>
      )}
    </div>
  );
};

// ── 인라인 SVG: 월별 매출 추이 (area + line + 주문수 막대) ──
function renderMonthlyChart(
  data: { ym: string; revenue: number; orders: number; deliveryFee: number; totalAmount: number }[]
): React.ReactElement {
  if (data.length === 0) return <p className="ptd-muted">표시할 데이터가 없습니다.</p>;
  const W = 560;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxRev = Math.max(1, ...data.map((d) => d.revenue));
  const maxOrders = Math.max(1, ...data.map((d) => d.orders));
  const n = data.length;
  const x = (i: number): number => (n === 1 ? padL + innerW / 2 : padL + (innerW * i) / (n - 1));
  const yRev = (v: number): number => padT + innerH - (v / maxRev) * innerH;
  const points = data.map((d, i) => ({ x: x(i), y: yRev(d.revenue), d }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${(padT + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const barW = Math.max(3, Math.min(18, innerW / n / 3));

  return (
    <svg className="ptd-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="월별 매출 추이">
      <defs>
        <linearGradient id="ptdAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* 그리드 */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={padL} x2={W - padR} y1={padT + innerH * g} y2={padT + innerH * g} className="ptd-grid" />
      ))}
      {/* 주문수 막대 (보조) */}
      {data.map((d, i) => {
        const h = (d.orders / maxOrders) * innerH * 0.5;
        return <rect key={`b${i}`} x={x(i) - barW / 2} y={padT + innerH - h} width={barW} height={h} className="ptd-chart-bar" />;
      })}
      {/* 매출 area + line */}
      <path d={areaPath} fill="url(#ptdAreaGrad)" stroke="none" />
      <path d={linePath} className="ptd-chart-line" fill="none" />
      {/* 포인트 + 네이티브 툴팁 */}
      {points.map((p, i) => {
        const mm = parseInt(p.d.ym.slice(5, 7), 10);
        return (
          <g key={`p${i}`}>
            <circle cx={p.x} cy={p.y} r={3.5} className="ptd-chart-dot" />
            <title>
              {p.d.ym} · 상품매출 {won(p.d.revenue)} · 주문 {p.d.orders}건 · 배송비 {won(p.d.deliveryFee)} · 총주문 {won(p.d.totalAmount)}
            </title>
            <text x={p.x} y={H - 8} className="ptd-chart-xlabel" textAnchor="middle">{mm}월</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 인라인 SVG: 카테고리 비중 도넛 (클릭 시 필터) ──
function renderDonut(
  data: { total: number; items: { code: string; label: string; revenue: number; pct: number }[] },
  selected: string,
  onSelect: (code: string) => void
): React.ReactElement {
  if (data.items.length === 0 || data.total <= 0) return <p className="ptd-muted">표시할 데이터가 없습니다.</p>;
  const size = 200;
  const r = 70;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  const stroke = 24;
  const top = data.items[0];
  let cum = 0;
  return (
    <div className="ptd-donut-wrap">
      <svg className="ptd-donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="카테고리 매출 비중">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line-subtle)" strokeWidth={stroke} opacity={0.25} />
        {data.items.map((it, i) => {
          const dash = it.pct * C;
          const seg = (
            <circle
              key={it.code}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={CAT_COLORS[i % CAT_COLORS.length]}
              strokeWidth={selected === it.code ? stroke + 4 : stroke}
              strokeDasharray={`${dash.toFixed(2)} ${(C - dash).toFixed(2)}`}
              strokeDashoffset={(-cum * C).toFixed(2)}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="ptd-donut-seg"
              onClick={() => onSelect(selected === it.code ? 'all' : it.code)}
            >
              <title>{it.label} · {won(it.revenue)} · {pctStr(it.pct)}</title>
            </circle>
          );
          cum += it.pct;
          return seg;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="ptd-donut-center-pct">{pctStr(top.pct)}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="ptd-donut-center-label">{top.label}</text>
      </svg>
      <ul className="ptd-donut-legend">
        {data.items.map((it, i) => (
          <li
            key={it.code}
            className={`ptd-legend-row ${selected === it.code ? 'active' : ''}`}
            onClick={() => onSelect(selected === it.code ? 'all' : it.code)}
          >
            <span className="ptd-legend-dot" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
            <span className="ptd-legend-name">{it.label}</span>
            <span className="ptd-legend-pct">{pctStr(it.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
