import React, { useEffect, useMemo, useRef, useState } from 'react';
import './ProductTeamDashboard.css';
import type {
  AdminProductsResult,
  RevenueResult,
  RevenueOrderLite,
  StockImpactItem
} from '../services/departmentDataService';
import { screenStateFromRevenue } from '../services/revenueScreenState';
import { buildTrendBuckets, labelStepFor } from '../services/productDashboardTrendBuckets';
import {
  aggregateProductRanking as aggregateProducts,
  aggregateProductCategoryShare,
  filterProductOrdersByPeriod,
  filterOrdersByCategory,
  filterOrdersBySource
} from '../services/productSalesAggregation';
import { categoryDisplayName as catName, formatSharePercent as pctStr } from '../services/productCategoryDisplay';
import { REVENUE_METRIC_LABELS as RV } from '../services/revenueMetricContract';
import { OPERATIONAL_METRIC_LABELS as OP } from '../services/departmentMetricContract';
import { classifyStockRisk, summarizeStockRisk } from '../services/inventoryRiskContract';
import { buildDepartmentSourceOfTruthSnapshot } from '../services/departmentDataSourceOfTruth';

// 상품관리팀 매출/재고 대시보드 v1.1
// - 데이터: /api/godomall/orders-revenue?includeSynthetic=true (orders/summary/stockImpact)
// - 하드코딩 매출/수량 없음. 모든 수치는 orders·stockImpact에서 파생
// - 외부 차트 라이브러리 없이 인라인 SVG/CSS로 시각화
// - 카테고리 코드 → 한글 표시명은 "표시용 라벨 맵"만 허용(데이터 아님)

interface ProductTeamDashboardProps {
  products: AdminProductsResult | null;
  revenue: RevenueResult | null;
  loading: boolean;
  onRefresh: () => void;
}

// 카테고리 표시명/비중 포맷은 productCategoryDisplay로 공유(채팅과 동일 라벨·소수 표기).
// catName/pctStr은 상단 import에서 alias.

// 색상 위계: 청록은 강조에만, 보조는 슬레이트/블루 계열
const TEAL = '#31D6C4';
const CAT_COLORS = ['#31D6C4', '#1F9AAA', '#5B7DB1', '#136F73', '#8190A5', '#B08968', '#6C7A89', '#A8B3C4'];
const KPI_ACCENT = ['#31D6C4', '#5B7DB1', '#1F9AAA', '#FBBF24'];

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const qty = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}`;
const wonShort = (n: number): string => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
  return `${Math.round(n).toLocaleString('ko-KR')}`;
};

// C-3: 재고 위험 단계는 공통 계약(inventoryRiskContract)으로 판정. 임계값 하드코딩 금지.
type StockLevel = 'danger' | 'warn' | 'ok' | 'unknown';
const stockLevel = (stock: number, safetyStock?: number): StockLevel => {
  const lv = classifyStockRisk(stock, safetyStock).level;
  return lv === 'out_of_stock' ? 'danger' : lv === 'low_stock' ? 'warn' : lv === 'unknown' ? 'unknown' : 'ok';
};
const levelKo = (l: StockLevel): string => (l === 'danger' ? '위험' : l === 'warn' ? '주의' : l === 'unknown' ? '확인 필요' : '정상');

// 매출추이 단위 (버킷 생성은 productDashboardTrendBuckets.ts로 분리)
type Period = 'month' | 'week' | 'day';

// 기간 프리셋 — CS팀(csDashboardTimeFilter)과 동일 구성. 상대기간은 데이터 최신 주문일 기준(합성데이터 대응).
type PeriodPreset = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom';
const PERIOD_PRESETS: [PeriodPreset, string][] = [['all', '전체'], ['today', '오늘'], ['7d', '최근 7일'], ['30d', '최근 30일'], ['month', '이번 달'], ['custom', '직접']];

const niceCeil = (v: number): number => {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / mag;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * mag;
};

// Catmull-Rom → cubic bezier (부드러운 곡선)
const smoothPath = (pts: { x: number; y: number }[]): string => {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
};

// 숫자 카운트업
const useCountUp = (target: number, dur = 500): number => {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
};

interface PeriodBucket {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  deliveryFee: number;
  totalAmount: number;
}

// orders → 상품별 집계는 productSalesAggregation.aggregateProductRanking로 추출(채팅과 공유).
// 이 파일에서는 alias(aggregateProducts)로 그대로 사용한다(계산식 동일 · 대시보드 수치 불변).

// ── 매출 추이 차트 (SVG, 부드러운 곡선 + 금액축 + 호버 툴팁) ──
const TrendChart: React.FC<{ data: PeriodBucket[]; period: Period }> = ({ data, period }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) return <p className="ptd-muted">표시할 데이터가 없습니다.</p>;
  const W = 560;
  const H = 240;
  const padL = 46;
  const padR = 12;
  const padT = 14;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const niceMax = niceCeil(Math.max(1, ...data.map((d) => d.revenue)));
  const maxOrders = Math.max(1, ...data.map((d) => d.orders));
  const n = data.length;
  const x = (i: number): number => (n === 1 ? padL + innerW / 2 : padL + (innerW * i) / (n - 1));
  const y = (v: number): number => padT + innerH - (v / niceMax) * innerH;
  const pts = data.map((d, i) => ({ x: x(i), y: y(d.revenue) }));
  const line = smoothPath(pts);
  const area = `${line} L${pts[n - 1].x.toFixed(1)},${(padT + innerH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const barW = Math.max(3, Math.min(14, innerW / n / 2.2));
  // 라벨 표시 간격: 단위별 정책(버킷은 유지, 라벨만 축약). month≤18·week≤20·day≤14 → 전부 표시.
  const labelStep = labelStepFor(period, n);
  const sig = `${period}:${data.map((d) => d.key).join(',')}`;

  return (
    <div className="ptd-trend">
      <svg className="ptd-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="매출 추이">
        <defs>
          <linearGradient id="ptdAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity="0.28" />
            <stop offset="100%" stopColor={TEAL} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = padT + innerH - innerH * t;
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={yy} y2={yy} className="ptd-grid" />
              <text x={padL - 6} y={yy + 3} className="ptd-ylabel" textAnchor="end">{wonShort(niceMax * t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.orders / maxOrders) * innerH * 0.45;
          return <rect key={`b${i}`} x={x(i) - barW / 2} y={padT + innerH - h} width={barW} height={h} className="ptd-chart-bar" />;
        })}
        <path d={area} className="ptd-chart-area" />
        <path key={sig} d={line} className="ptd-chart-line" pathLength={1} />
        {data.map((d, i) => (
          <g key={`p${i}`}>
            {i % labelStep === 0 && (
              <text x={x(i)} y={H - 8} className="ptd-chart-xlabel" textAnchor="middle">{d.label}</text>
            )}
            <circle
              cx={x(i)}
              cy={y(d.revenue)}
              r={hover === i ? 5 : 3}
              className="ptd-chart-dot"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>
      {hover != null && (
        <div className="ptd-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <div className="ptd-tt-title">
            {period === 'month' ? `${data[hover].key}` : data[hover].key} ({data[hover].label})
          </div>
          <div className="ptd-tt-row"><span>상품매출</span><b>{won(data[hover].revenue)}</b></div>
          <div className="ptd-tt-row"><span>주문수</span><b>{data[hover].orders}건</b></div>
          <div className="ptd-tt-row"><span>배송비</span><b>{won(data[hover].deliveryFee)}</b></div>
          <div className="ptd-tt-row"><span>총주문금액</span><b>{won(data[hover].totalAmount)}</b></div>
        </div>
      )}
    </div>
  );
};

// ── 공통 모달 ──
const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="ptd-modal-overlay" onClick={onClose}>
      <div className="ptd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ptd-modal-head">
          <h3>{title}</h3>
          <button type="button" className="ptd-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="ptd-modal-body">{children}</div>
      </div>
    </div>
  );
};

const Chips = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="ptd-chips">
    {options.map(([v, label]) => (
      <button key={v} type="button" className={`ptd-chip ${value === v ? 'active' : ''}`} onClick={() => onChange(v)}>{label}</button>
    ))}
  </div>
);

// 최신 주문일 기준 window(일) 필터
const windowFilter = (orders: RevenueOrderLite[], win: 'all' | 'month' | 'week' | 'day'): RevenueOrderLite[] => {
  if (win === 'all' || orders.length === 0) return orders;
  const days = win === 'month' ? 30 : win === 'week' ? 7 : 1;
  let maxMs = 0;
  for (const o of orders) {
    const ms = new Date(`${o.orderDate.slice(0, 10)}T00:00:00`).getTime();
    if (ms > maxMs) maxMs = ms;
  }
  const cut = maxMs - days * 86400000;
  return orders.filter((o) => new Date(`${o.orderDate.slice(0, 10)}T00:00:00`).getTime() >= cut);
};

// 소스 필터는 productSalesAggregation.filterOrdersBySource로 추출(채팅과 공유).
const srcFilter = filterOrdersBySource;

// ── 상품별 매출 순위 전체보기 모달 ──
type RankField = 'revenue' | 'quantity' | 'stock' | 'name' | 'category';
const RankingModal: React.FC<{
  orders: RevenueOrderLite[];
  stockImpact: StockImpactItem[];
  categoryOptions: { code: string; label: string }[];
  onClose: () => void;
}> = ({ orders, stockImpact, categoryOptions, onClose }) => {
  const [cat, setCat] = useState('all');
  const [win, setWin] = useState<'all' | 'month' | 'week' | 'day'>('all');
  const [src, setSrc] = useState<'all' | 'real' | 'synthetic'>('all');
  const [sortField, setSortField] = useState<RankField>('revenue');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc'); // 기본 매출 내림차순

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stockImpact) m.set(s.productId, s.syntheticProjectedStock);
    return m;
  }, [stockImpact]);

  const rows = useMemo(() => {
    const filtered = srcFilter(windowFilter(orders, win), src);
    const agg = Array.from(aggregateProducts(filtered, cat).values());
    const total = agg.reduce((s, x) => s + x.revenue, 0);
    const arr = agg.map((a) => ({ ...a, pct: total > 0 ? a.revenue / total : 0, projected: stockMap.get(a.goodsNo) ?? 0 }));
    arr.sort((a, b) => {
      const r =
        sortField === 'quantity' ? a.quantity - b.quantity :
        sortField === 'stock' ? a.projected - b.projected :
        sortField === 'name' ? a.name.localeCompare(b.name) :
        sortField === 'category' ? catName(a.category).localeCompare(catName(b.category)) :
        a.revenue - b.revenue;
      return dir === 'asc' ? r : -r;
    });
    return arr;
  }, [orders, cat, win, src, sortField, dir, stockMap]);

  return (
    <Modal title="상품별 매출 순위 — 전체" onClose={onClose}>
      <div className="ptd-modal-filters">
        <div className="ptd-mf"><span className="ptd-filter-label">카테고리</span>
          <Chips value={cat} options={[['all', '전체'], ...categoryOptions.map((c) => [c.code, catName(c.code)] as [string, string])]} onChange={setCat} />
        </div>
        <div className="ptd-mf"><span className="ptd-filter-label">기간</span>
          <Chips value={win} options={[['all', '전체'], ['month', '월간'], ['week', '주간'], ['day', '일간']]} onChange={setWin} />
        </div>
        <div className="ptd-mf"><span className="ptd-filter-label">데이터</span>
          <Chips value={src} options={[['all', '전체'], ['real', '실제'], ['synthetic', '가상']]} onChange={setSrc} />
        </div>
        <div className="ptd-mf"><span className="ptd-filter-label">정렬</span>
          <Chips value={sortField} options={[['revenue', '상품매출'], ['quantity', '판매수량'], ['stock', '가상재고'], ['category', '카테고리'], ['name', '상품명']]} onChange={setSortField} />
          <button type="button" className="ptd-dir-toggle" onClick={() => setDir(dir === 'asc' ? 'desc' : 'asc')}>
            {dir === 'asc' ? '↑ 오름차순' : '↓ 내림차순'}
          </button>
        </div>
      </div>
      <table className="ptd-table">
        <thead><tr><th>#</th><th>상품명</th><th>카테고리</th><th className="num">상품매출</th><th className="num">판매수량</th><th className="num">가상재고</th><th className="num">비중</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="ptd-muted">표시할 상품이 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.goodsNo || i}>
              <td>{i + 1}</td>
              <td><span className="ptd-td-name">{r.name || '(이름 없음)'}</span></td>
              <td>{catName(r.category)} <span className="ptd-td-note">code {r.category || '-'}</span></td>
              <td className="num strong">{won(r.revenue)}</td>
              <td className="num">{qty(r.quantity)}</td>
              <td className="num">{qty(r.projected)}</td>
              <td className="num">{pctStr(r.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
};

// ── 전체 상품 보기 모달 ──
type AllSort = 'revenue_desc' | 'revenue_asc' | 'price_desc' | 'price_asc' | 'quantity_desc' | 'stock_asc' | 'stock_desc' | 'status' | 'name' | 'category';
const AllProductsModal: React.FC<{
  orders: RevenueOrderLite[];
  stockImpact: StockImpactItem[];
  products: AdminProductsResult | null;
  goodsCategory: Map<string, { code: string; label: string }>;
  categoryOptions: { code: string; label: string }[];
  onClose: () => void;
}> = ({ orders, stockImpact, products, goodsCategory, categoryOptions, onClose }) => {
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState<'all' | 'ok' | 'warn' | 'danger'>('all');
  const [win, setWin] = useState<'all' | 'month' | 'week' | 'day'>('all');
  const [sort, setSort] = useState<AllSort>('revenue_desc');

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products?.products ?? []) m.set(p.productId, p.price);
    return m;
  }, [products]);

  const rows = useMemo(() => {
    const agg = aggregateProducts(srcFilter(windowFilter(orders, win), 'all'), 'all');
    const arr = stockImpact
      .map((s) => {
        const a = agg.get(s.productId);
        const code = goodsCategory.get(s.productId)?.code ?? 'uncategorized';
        return {
          productId: s.productId,
          name: s.productName,
          categoryCode: code,
          price: priceMap.get(s.productId) ?? 0,
          revenue: a?.revenue ?? 0,
          quantity: a?.quantity ?? 0,
          restored: a?.restored ?? 0,
          net: (a?.sold ?? 0) - (a?.restored ?? 0),
          projected: s.syntheticProjectedStock,
          sourceStockEnabled: s.sourceStockEnabled,
          level: stockLevel(s.syntheticProjectedStock, s.safetyStock)
        };
      })
      .filter((r) => (cat === 'all' || r.categoryCode === cat) && (status === 'all' || r.level === status));
    arr.sort((a, b) => {
      switch (sort) {
        case 'revenue_asc': return a.revenue - b.revenue;
        case 'price_desc': return b.price - a.price;
        case 'price_asc': return a.price - b.price;
        case 'quantity_desc': return b.quantity - a.quantity;
        case 'stock_asc': return a.projected - b.projected;
        case 'stock_desc': return b.projected - a.projected;
        case 'status': return a.projected - b.projected;
        case 'name': return a.name.localeCompare(b.name);
        case 'category': return catName(a.categoryCode).localeCompare(catName(b.categoryCode));
        default: return b.revenue - a.revenue;
      }
    });
    return arr;
  }, [orders, stockImpact, goodsCategory, priceMap, cat, status, win, sort]);

  return (
    <Modal title="전체 상품 보기" onClose={onClose}>
      <div className="ptd-modal-filters">
        <div className="ptd-mf"><span className="ptd-filter-label">카테고리</span>
          <Chips value={cat} options={[['all', '전체'], ...categoryOptions.map((c) => [c.code, catName(c.code)] as [string, string])]} onChange={setCat} />
        </div>
        <div className="ptd-mf"><span className="ptd-filter-label">상태</span>
          <Chips value={status} options={[['all', '전체'], ['ok', '정상'], ['warn', '주의'], ['danger', '위험']]} onChange={setStatus} />
        </div>
        <div className="ptd-mf"><span className="ptd-filter-label">기간</span>
          <Chips value={win} options={[['all', '전체'], ['month', '월간'], ['week', '주간'], ['day', '일간']]} onChange={setWin} />
        </div>
        <div className="ptd-mf"><span className="ptd-filter-label">정렬</span>
          <select className="ptd-select" value={sort} onChange={(e) => setSort(e.target.value as AllSort)}>
            <option value="revenue_desc">매출 높은순</option>
            <option value="revenue_asc">매출 낮은순</option>
            <option value="price_desc">가격 높은순</option>
            <option value="price_asc">가격 낮은순</option>
            <option value="quantity_desc">판매수량 높은순</option>
            <option value="stock_asc">재고 낮은순</option>
            <option value="stock_desc">재고 높은순</option>
            <option value="status">상태순</option>
            <option value="category">카테고리순</option>
            <option value="name">상품명순</option>
          </select>
        </div>
      </div>
      <table className="ptd-table">
        <thead>
          <tr>
            <th>상품명</th><th>카테고리</th><th className="num">가격</th><th className="num">상품매출</th>
            <th className="num">판매수량</th><th className="num">복구</th><th className="num">순판매</th><th className="num">가상재고</th><th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="ptd-muted">표시할 상품이 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.productId}>
              <td>
                <span className="ptd-td-name">{r.name || '(이름 없음)'}</span>
                {!r.sourceStockEnabled && <span className="ptd-td-note">샘플몰 원본: 재고관리 안함</span>}
              </td>
              <td>{catName(r.categoryCode)}</td>
              <td className="num">{won(r.price)}</td>
              <td className="num">{won(r.revenue)}</td>
              <td className="num">{qty(r.quantity)}</td>
              <td className="num">{qty(r.restored)}</td>
              <td className="num">{qty(r.net)}</td>
              <td className="num strong">{qty(r.projected)}</td>
              <td><span className={`ptd-status lv-${r.level}`}>{levelKo(r.level)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
};

// KPI 카드 (카운트업)
const KpiCard: React.FC<{ icon: string; label: string; value: number; money?: boolean; unit?: string; sub: React.ReactNode; accent: string; riskBadge?: number; filterBadge?: string }> = ({ icon, label, value, money, unit, sub, accent, riskBadge, filterBadge }) => {
  const v = useCountUp(value);
  return (
    <div className="ptd-kpi-card" style={{ borderLeftColor: accent }}>
      <div className="ptd-kpi-label">
        {icon} {label}
        {filterBadge && <span className="ptd-kpi-filter-badge" title="현재 선택한 필터 범위로 계산한 값입니다">필터: {filterBadge}</span>}
      </div>
      <div className="ptd-kpi-value">
        {money ? won(v) : qty(v)}{unit && <span className="ptd-kpi-unit">{unit}</span>}
        {riskBadge != null && riskBadge > 0 && <span className="ptd-kpi-risk">위험 {riskBadge}</span>}
      </div>
      <div className="ptd-kpi-sub">{sub}</div>
    </div>
  );
};

export const ProductTeamDashboard: React.FC<ProductTeamDashboardProps> = ({ products, revenue, loading, onRefresh }) => {
  const [category, setCategory] = useState('all');
  const [dataSrc, setDataSrc] = useState<'all' | 'real' | 'synthetic'>('all');
  // ★ 공통 기간 기준 (shared) — KPI/매출추이/도넛/상품순위가 모두 이 하나를 공유
  // periodPreset = CS팀과 동일 프리셋(전체/오늘/최근7일/최근30일/이번달/직접). 직접은 rangeStart~rangeEnd.
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rankOpen, setRankOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  const orders = useMemo<RevenueOrderLite[]>(() => revenue?.orders ?? [], [revenue]);
  const stockImpact = useMemo<StockImpactItem[]>(() => revenue?.stockImpact ?? [], [revenue]);
  const summary = revenue?.summary ?? null;

  const goodsCategory = useMemo(() => {
    const m = new Map<string, { code: string; label: string }>();
    for (const o of orders) for (const l of o.lines) if (l.goodsNo && !m.has(l.goodsNo)) m.set(l.goodsNo, { code: l.categoryCode, label: l.categoryLabel });
    return m;
  }, [orders]);

  const categoryOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) for (const l of o.lines) if (!m.has(l.categoryCode)) m.set(l.categoryCode, l.categoryLabel);
    return Array.from(m.keys()).sort().map((code) => ({ code, label: code }));
  }, [orders]);

  // 데이터 전체 기간(최소~최대 주문일, YYYY-MM-DD)
  const dataRange = useMemo(() => {
    let min = '';
    let max = '';
    for (const o of orders) {
      const d = o.orderDate.slice(0, 10);
      if (d.length < 10) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { min, max };
  }, [orders]);

  // 적용 기간(YYYY-MM-DD) — 프리셋별. 상대기간(오늘/7·30일/이번달)은 데이터 최신 주문일(dataRange.max) 기준.
  //   합성/과거 데이터라 실제 '오늘'을 쓰면 빈 화면이 되므로 데이터 최신일을 앵커로 삼는다(기존 상품팀 로직과 동일 취지).
  const { effStart, effEnd } = useMemo(() => {
    const { min, max } = dataRange;
    if (!min || !max) return { effStart: min, effEnd: max };
    if (periodPreset === 'all') return { effStart: min, effEnd: max };
    if (periodPreset === 'custom') return { effStart: rangeStart || min, effEnd: rangeEnd || max };
    if (periodPreset === 'today') return { effStart: max, effEnd: max };
    if (periodPreset === 'month') return { effStart: `${max.slice(0, 7)}-01`, effEnd: max };
    const days = periodPreset === '7d' ? 7 : 30;
    // UTC 자정으로 파싱·계산·포맷(로컬 파싱 후 toISOString은 +9 시간대에서 하루 밀림).
    const startMs = Date.parse(`${max}T00:00:00Z`) - (days - 1) * 86400000;
    const startStr = new Date(startMs).toISOString().slice(0, 10);
    return { effStart: startStr < min ? min : startStr, effEnd: max };
  }, [periodPreset, rangeStart, rangeEnd, dataRange]);

  // ★ 공통 기간 기준으로 orders 필터 → KPI/추이/도넛/순위가 모두 같은 기준(기간 범위) 공유
  const ordersFiltered = useMemo(
    () => filterProductOrdersByPeriod(orders, { start: effStart, end: effEnd, source: dataSrc }),
    [orders, dataSrc, effStart, effEnd]
  );

  // 매출 추이 집계 단위 — 프리셋에서 자동 도출(오늘/최근7·30일/이번달→일, 전체→월, 직접→기간 폭 기준).
  const trendGran: Period = useMemo(() => {
    if (periodPreset === 'all') return 'month';
    if (periodPreset === 'custom') {
      const s = Date.parse(`${effStart}T00:00:00Z`);
      const e = Date.parse(`${effEnd}T00:00:00Z`);
      const span = Number.isNaN(s) || Number.isNaN(e) ? 0 : (e - s) / 86400000;
      return span > 90 ? 'month' : span > 21 ? 'week' : 'day';
    }
    return 'day'; // today / 7d / 30d / month(이번 달)
  }, [periodPreset, effStart, effEnd]);

  const relevantOrders = useMemo(
    () => filterOrdersByCategory(ordersFiltered, category),
    [ordersFiltered, category]
  );

  const filteredStock = useMemo(
    () => (category === 'all' ? stockImpact : stockImpact.filter((s) => (goodsCategory.get(s.productId)?.code ?? 'uncategorized') === category)),
    [stockImpact, category, goodsCategory]
  );

  // 현재 필터(카테고리·기간·데이터소스) 범위의 운영 대표값 — 전 부서 공통 builder를 필터된 주문에 재적용(정의 동일).
  // 필터 없음(전체)이면 relevantOrders=전체 주문 → 전사 대표값과 동일 → 마케팅팀 parity 유지.
  const filteredSnap = useMemo(
    () => (revenue ? buildDepartmentSourceOfTruthSnapshot({ ...revenue, orders: relevantOrders }) : null),
    [revenue, relevantOrders]
  );

  const kpi = useMemo(() => {
    let rev = 0;
    let sold = 0;
    let restored = 0;
    let real = 0;
    let synth = 0;
    for (const o of relevantOrders) {
      if (o.sourceType === 'synthetic_test') synth++;
      else real++;
      for (const l of o.lines) {
        if (category !== 'all' && l.categoryCode !== category) continue;
        rev += l.lineRevenue;
        if (o.canceled) restored += l.quantity;
        else if (o.paid) sold += l.quantity;
      }
    }
    // C-3: 재고 위험은 공통 계약(상품별 safetyStock 기준). risky=품절+재고부족, unknown=재고 이상.
    const sr = summarizeStockRisk(filteredStock.map((x) => ({ stock: x.syntheticProjectedStock, safetyStock: x.safetyStock })));
    const lowest = filteredStock.length
      ? [...filteredStock].sort((a, b) => a.syntheticProjectedStock - b.syntheticProjectedStock)[0]
      : null;
    return {
      revenue: rev,
      orderCount: relevantOrders.length,
      real,
      synth,
      sold,
      restored,
      net: sold - restored,
      virtualStock: filteredStock.reduce((s, x) => s + x.syntheticProjectedStock, 0),
      trackedCount: filteredStock.length,
      // C-3: 공통 계약 집계. riskCount = 위험(품절)+주의(재고부족), warnCount = 재고 이상(확인 필요).
      riskCount: sr.risky,
      warnCount: sr.unknown,
      lowestName: lowest?.productName ?? '',
      lowestStock: lowest?.syntheticProjectedStock ?? 0
    };
  }, [relevantOrders, filteredStock, category]);

  // 선택 기간(effStart~effEnd) + 단위로 "연속" 버킷 생성(빈 구간 0, 기간 밖 제외). 막대·꺾은선 공유.
  const trend = useMemo<PeriodBucket[]>(
    () => buildTrendBuckets(relevantOrders, { start: effStart, end: effEnd, granularity: trendGran, category }),
    [relevantOrders, effStart, effEnd, trendGran, category]
  );

  const categoryData = useMemo(() => aggregateProductCategoryShare(ordersFiltered), [ordersFiltered]);

  const ranking = useMemo(() => {
    const arr = Array.from(aggregateProducts(relevantOrders, category).values()).sort((a, b) => b.revenue - a.revenue);
    const max = arr.length > 0 ? arr[0].revenue : 0;
    const totalRev = arr.reduce((s, x) => s + x.revenue, 0);
    return arr.slice(0, 8).map((x) => ({ ...x, bar: max > 0 ? x.revenue / max : 0, pct: totalRev > 0 ? x.revenue / totalRev : 0 }));
  }, [relevantOrders, category]);

  const stockRisk = useMemo(() => [...filteredStock].sort((a, b) => a.syntheticProjectedStock - b.syntheticProjectedStock), [filteredStock]);

  const resetFilters = () => {
    setCategory('all');
    setDataSrc('all');
    setPeriodPreset('all');
    setRangeStart('');
    setRangeEnd('');
  };

  // 표시용: 집계 단위 + 기간
  const granLabel = trendGran === 'month' ? '월별' : trendGran === 'week' ? '주간별' : '일별';
  const presetLabel = PERIOD_PRESETS.find(([k]) => k === periodPreset)?.[1] ?? '전체';
  const periodText = periodPreset === 'all'
    ? '전체 기간'
    : periodPreset === 'custom'
      ? `${effStart || '…'} ~ ${effEnd || '…'}`
      : `${presetLabel} (${effStart} ~ ${effEnd})`;
  const periodBasisLabel = `${granLabel} · ${periodText}`;

  // 현재 적용 범위(KPI가 전사 전체와 다른 이유 표시용). 필터 없으면 '전체'.
  const isFiltered = category !== 'all' || periodPreset !== 'all' || dataSrc !== 'all';
  const scopeText = (() => {
    if (!isFiltered) return '전체';
    const parts: string[] = [];
    if (category !== 'all') parts.push(catName(category));
    if (periodPreset !== 'all') parts.push(periodText);
    if (dataSrc !== 'all') parts.push(dataSrc === 'real' ? '실제 데이터' : '가상 데이터');
    return parts.join(' · ');
  })();

  // '직접'으로 전환 시 범위가 비어 있으면 데이터 전체 기간을 기본값으로 채운다.
  const selectPreset = (p: PeriodPreset) => {
    setPeriodPreset(p);
    if (p === 'custom' && !rangeStart && !rangeEnd) {
      setRangeStart(dataRange.min);
      setRangeEnd(dataRange.max);
    }
  };

  // KPI/추이/도넛/순위가 공유하는 기간 프리셋 컨트롤(CS팀과 동일 구성). '직접'만 날짜 입력 노출.
  const renderPeriodControl = () => (
    <div className="ptd-period-ctl">
      {PERIOD_PRESETS.map(([v, l]) => (
        <button key={v} type="button" className={`ptd-seg ${periodPreset === v ? 'active' : ''}`} onClick={() => selectPreset(v)}>{l}</button>
      ))}
      {periodPreset === 'custom' && (
        <span className="ptd-daterange">
          <input type="date" className="ptd-date-input" value={rangeStart} max={rangeEnd || undefined} onChange={(e) => setRangeStart(e.target.value)} aria-label="시작일" />
          <span className="ptd-date-sep">~</span>
          <input type="date" className="ptd-date-input" value={rangeEnd} min={rangeStart || undefined} onChange={(e) => setRangeEnd(e.target.value)} aria-label="종료일" />
          <button type="button" className="ptd-seg" onClick={() => { setRangeStart(''); setRangeEnd(''); }}>초기화</button>
        </span>
      )}
    </div>
  );

  const synthOn = (summary?.syntheticOrderCount ?? 0) > 0;
  // DATA-SOURCE-SERVER-01(GREEN F): 최상위 source 하나로 숨기지 않는다.
  //   실제 주문만 실패하고 2년치 시뮬레이션이 살아 있으면 시험 데이터로 계속 사용한다.
  const screenState = screenStateFromRevenue(revenue);
  const unavailable = !screenState.usable;
  const topCat = categoryData.items[0];

  return (
    <div className="ptd">
      <div className="ptd-header">
        <div>
          <h2 className="ptd-title">상품관리팀 대시보드</h2>
          <p className="ptd-sub">매출 · 판매수량 · 가상재고 · 상품상태를 확인합니다.</p>
        </div>
        <div className="ptd-header-right">
          <span className={`ptd-badge ${synthOn ? 'on' : 'off'}`}>
            {/* C-출처: 사용자 표기 3종만. 라벨은 공통 판정(screenState)이 권위 —
                summary 숫자로 추측하면 명시적 fixture 가 '실제 데이터'로 보인다(GREEN F.1). */}
            🧪 {screenState.kind === 'fixture'
              ? `시험 데이터 (기능시험 자료 · 시험 주문 ${(summary?.orderCount ?? 0).toLocaleString()}건)`
              : screenState.kind === 'simulation'
                ? `시험 데이터 (실제 유효 주문 ${(summary?.realOrderCount ?? 0).toLocaleString()}건 + 시험 주문 ${(summary?.syntheticOrderCount ?? 0).toLocaleString()}건)`
                : screenState.userLabel}
          </span>
          <button type="button" className="ptd-refresh" onClick={onRefresh} disabled={loading}>{loading ? '새로고침 중…' : '↻ 새로고침'}</button>
        </div>
      </div>

      {unavailable ? (
        <div className="ptd-empty">데이터를 불러오지 못했습니다. (로컬 dev에서는 서버 라우트가 없을 수 있습니다 — 배포 환경에서 확인하세요.)</div>
      ) : (
        <>
          {/* 실제 주문 연결만 실패한 경우: 시험 통계는 그대로 두고 안내만 함께 표시한다. */}
          {screenState.realOrdersNotice && (
            <div className="ptd-notice" style={{ padding: '8px 12px', marginBottom: 10, borderRadius: 8, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '0.85em' }}>
              ※ {screenState.realOrdersNotice}
            </div>
          )}
          <div className="ptd-filterbar">
            {/* 1차 조건 = 기간 (CS팀과 통일). KPI·추이·구성·순위가 모두 이 기준을 공유 */}
            <div className="ptd-filter-group ptd-filter-group-period">
              <span className="ptd-filter-label">기간</span>
              {renderPeriodControl()}
            </div>
            {/* 카테고리 = 보조 필터. 드롭다운(상품·카테고리 늘어나도 안 무너짐) */}
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">카테고리</span>
              <select className="ptd-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="카테고리 선택">
                <option value="all">전체 카테고리</option>
                {categoryOptions.map((c) => (
                  <option key={c.code} value={c.code}>{catName(c.code)}</option>
                ))}
              </select>
            </div>
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">데이터</span>
              {([['all', '전체'], ['real', '실제만'], ['synthetic', '가상만']] as const).map(([v, label]) => (
                <button key={v} className={`ptd-chip ${dataSrc === v ? 'active' : ''}`} onClick={() => setDataSrc(v)}>{label}</button>
              ))}
            </div>
            <span className="ptd-filter-basis ptd-filter-scope">적용 범위: <b>{scopeText}</b></span>
            <button type="button" className="ptd-reset" onClick={resetFilters}>↺ 초기화</button>
          </div>

          <div className="ptd-kpi-grid">
            <KpiCard icon="💰" label={OP.operationalRevenue.label} value={filteredSnap?.operationalRevenue ?? 0} money sub={OP.operationalRevenue.basis} accent={KPI_ACCENT[0]} filterBadge={isFiltered ? scopeText : undefined} />
            <KpiCard icon="🧾" label={OP.operationalOrderCount.label} value={filteredSnap?.operationalOrderCount ?? 0} unit="건" sub={OP.operationalOrderCount.basis} accent={KPI_ACCENT[1]} filterBadge={isFiltered ? scopeText : undefined} />
            <KpiCard icon="📈" label="판매수량" value={kpi.sold} unit="개" sub={`복구 ${kpi.restored} · 순판매 ${kpi.net}`} accent={KPI_ACCENT[2]} filterBadge={isFiltered ? scopeText : undefined} />
            <KpiCard
              icon="📦"
              label="재고 위험 상품"
              value={kpi.riskCount}
              unit="개"
              sub={
                `재고 이상 ${kpi.warnCount}개 · 관리 상품 ${kpi.trackedCount}개` +
                (kpi.lowestName ? ` · 최저 ${kpi.lowestName} ${kpi.lowestStock}개` : '')
              }
              accent={KPI_ACCENT[3]}
              riskBadge={kpi.riskCount}
              filterBadge={category !== 'all' ? catName(category) : undefined}
            />
          </div>

          {/* 상품관리 전용 분석값 — 대표 운영 KPI와 분리(같은 급으로 보이지 않게) */}
          <div className="ptd-dept-metric-row">
            <span className="ptd-dept-metric-tag">상품관리 전용 분석</span>
            <span className="ptd-dept-metric"><i>{OP.productLineRevenue.label}</i> <b>{won(kpi.revenue)}</b> <small>{OP.productLineRevenue.basis}</small></span>
            <span className="ptd-dept-metric"><i>전체 주문</i> <b>{kpi.orderCount.toLocaleString()}건</b> <small>{RV.orderCountAll.basis} · 실제 {kpi.real} · 가상 {kpi.synth}</small></span>
          </div>

          <p className="ptd-kpi-basis-note">
            ※ 상단 <b>운영매출·운영 주문수</b>는 전 부서 공통 source of truth(유효 주문 기준)입니다.
            필터를 적용하면 선택한 범위로 좁혀 계산하며, <b>전체 기준일 때 마케팅팀과 같은 값</b>입니다.
            <b>상품 라인 매출</b>은 전체 주문(취소·미입금·가상 포함) 라인합으로 상품관리 전용 분석값입니다.
            (공통 정의: <code>departmentMetricContract</code> · <code>revenueMetricContract</code>)
          </p>

          <div className="ptd-row">
            <div className="ptd-panel ptd-panel-wide">
              <div className="ptd-panel-head">
                <h3>매출 추이 <span className="ptd-panel-meta">기준: {periodBasisLabel}</span></h3>
              </div>
              <TrendChart data={trend} period={trendGran} />
            </div>
            <div className="ptd-panel">
              <div className="ptd-panel-head"><h3>매출 구성</h3><span className="ptd-panel-meta">카테고리 비중</span></div>
              <div className="ptd-donut-basis">기준: <b>{periodBasisLabel}</b></div>
              {categoryData.items.length === 0 || categoryData.total <= 0 ? (
                <p className="ptd-muted">표시할 데이터가 없습니다.</p>
              ) : (
                <div className="ptd-donut-wrap">
                  <svg className="ptd-donut" viewBox="0 0 200 200" role="img" aria-label="카테고리 매출 비중">
                    <circle cx="100" cy="100" r="70" fill="none" stroke="var(--line-subtle)" strokeWidth="24" opacity="0.25" />
                    {(() => {
                      let cum = 0;
                      const C = 2 * Math.PI * 70;
                      return categoryData.items.map((it, i) => {
                        const dash = it.pct * C;
                        const el = (
                          <circle
                            key={it.code}
                            cx="100" cy="100" r="70" fill="none"
                            stroke={category === it.code ? TEAL : CAT_COLORS[i % CAT_COLORS.length]}
                            strokeWidth={category === it.code ? 28 : 24}
                            strokeDasharray={`${dash.toFixed(2)} ${(C - dash).toFixed(2)}`}
                            strokeDashoffset={(-cum * C).toFixed(2)}
                            transform="rotate(-90 100 100)"
                            className="ptd-donut-seg"
                            onClick={() => setCategory(category === it.code ? 'all' : it.code)}
                          >
                            <title>{catName(it.code)} · {won(it.revenue)} · {pctStr(it.pct)}</title>
                          </circle>
                        );
                        cum += it.pct;
                        return el;
                      });
                    })()}
                    <text x="100" y="96" textAnchor="middle" className="ptd-donut-center-pct">{pctStr(topCat.pct)}</text>
                    <text x="100" y="116" textAnchor="middle" className="ptd-donut-center-label">{catName(topCat.code)}</text>
                  </svg>
                  <ul className="ptd-donut-legend">
                    {categoryData.items.map((it, i) => (
                      <li key={it.code} className={`ptd-legend-row ${category === it.code ? 'active' : ''}`} onClick={() => setCategory(category === it.code ? 'all' : it.code)}>
                        <span className="ptd-legend-dot" style={{ background: category === it.code ? TEAL : CAT_COLORS[i % CAT_COLORS.length] }} />
                        <span className="ptd-legend-name">{catName(it.code)}</span>
                        <span className="ptd-legend-pct">{pctStr(it.pct)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="ptd-row">
            <div className="ptd-panel ptd-panel-wide">
              <div className="ptd-panel-head">
                <h3>상품별 매출 순위</h3>
                <button type="button" className="ptd-link-btn" onClick={() => setRankOpen(true)}>전체보기 →</button>
              </div>
              {ranking.length === 0 ? (
                <p className="ptd-muted">표시할 상품이 없습니다.</p>
              ) : (
                <ul className="ptd-rank-list">
                  {ranking.map((r, i) => (
                    <li key={r.goodsNo || i} className="ptd-rank-row">
                      <span className="ptd-rank-no">{i + 1}</span>
                      <span className="ptd-rank-name" title={r.name}>{r.name || '(이름 없음)'}</span>
                      <div className="ptd-rank-bar-wrap">
                        <div className="ptd-rank-bar" style={{ width: `${Math.max(2, r.bar * 100)}%`, opacity: 1 - i * 0.07 }} />
                      </div>
                      <span className="ptd-rank-rev">{won(r.revenue)}</span>
                      <span className="ptd-rank-qty">{qty(r.quantity)}개 · {pctStr(r.pct)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="ptd-panel">
              <div className="ptd-panel-head"><h3>재고 영향</h3><span className="ptd-panel-meta">가상재고 낮은 순</span></div>
              {stockRisk.length === 0 ? (
                <p className="ptd-muted">표시할 상품이 없습니다.</p>
              ) : (
                <ul className="ptd-stock-list">
                  {stockRisk.slice(0, 6).map((s) => (
                    <li key={s.productId} className={`ptd-stock-card lv-${stockLevel(s.syntheticProjectedStock, s.safetyStock)}`}>
                      <div className="ptd-stock-top">
                        <span className="ptd-stock-name" title={s.productName}>{s.productName}</span>
                        <span className="ptd-stock-now">{qty(s.syntheticProjectedStock)}</span>
                      </div>
                      <div className="ptd-stock-meta">초기 {qty(s.syntheticInitialStock)} · 판매 {qty(s.syntheticSoldQuantity)} · 복구 {qty(s.syntheticRestoredQuantity)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="ptd-allbtn-row">
            <button type="button" className="ptd-allbtn" onClick={() => setAllOpen(true)}>📋 전체 상품 보기 ({stockImpact.length}개)</button>
            <span className="ptd-foot-inline">
              데이터: <code>/api/godomall/orders-revenue?includeSynthetic=true</code> · 모든 수치는 orders / stockImpact 파생 (하드코딩 없음)
            </span>
          </div>
        </>
      )}

      {rankOpen && <RankingModal orders={ordersFiltered} stockImpact={stockImpact} categoryOptions={categoryOptions} onClose={() => setRankOpen(false)} />}
      {allOpen && (
        <AllProductsModal
          orders={ordersFiltered}
          stockImpact={stockImpact}
          products={products}
          goodsCategory={goodsCategory}
          categoryOptions={categoryOptions}
          onClose={() => setAllOpen(false)}
        />
      )}
    </div>
  );
};
