import React, { useEffect, useMemo, useRef, useState } from 'react';
import './ProductTeamDashboard.css';
import type {
  AdminProductsResult,
  RevenueResult,
  RevenueOrderLite,
  StockImpactItem
} from '../services/departmentDataService';

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

// 카테고리 코드 → 화면 표시명 (표시용 라벨 맵)
// TODO: 추후 고도몰 카테고리 READ 연동 시 실제 카테고리명으로 대체
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  uncategorized: '미분류',
  '001': '생활가전',
  '003': '주방가전',
  '006': '공기·청정',
  '007': '계절가전',
  C1: '생활가전',
  C2: '주방가전',
  C3: '공기·청정'
};
const catName = (code: string): string =>
  CATEGORY_DISPLAY_NAMES[code] || (code === 'uncategorized' || !code ? '미분류' : code);

// 색상 위계: 청록은 강조에만, 보조는 슬레이트/블루 계열
const TEAL = '#31D6C4';
const CAT_COLORS = ['#31D6C4', '#1F9AAA', '#5B7DB1', '#136F73', '#8190A5', '#B08968', '#6C7A89', '#A8B3C4'];
const KPI_ACCENT = ['#31D6C4', '#5B7DB1', '#1F9AAA', '#FBBF24'];

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const qty = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}`;
const pctStr = (n: number): string => `${(n * 100).toFixed(1)}%`;
const wonShort = (n: number): string => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
  return `${Math.round(n).toLocaleString('ko-KR')}`;
};

type StockLevel = 'danger' | 'warn' | 'ok';
const stockLevel = (p: number): StockLevel => (p <= 20 ? 'danger' : p <= 40 ? 'warn' : 'ok');
const levelKo = (l: StockLevel): string => (l === 'danger' ? '위험' : l === 'warn' ? '주의' : '정상');

type Period = 'month' | 'week' | 'day';

// 기간 키/라벨
const periodKey = (dateStr: string, period: Period): string => {
  const d = dateStr.slice(0, 10);
  if (period === 'month') return d.slice(0, 7);
  if (period === 'day') return d;
  const dt = new Date(`${d}T00:00:00`);
  const off = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - off);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const periodLabel = (key: string, period: Period): string => {
  if (period === 'month') return `${parseInt(key.slice(5, 7), 10)}월`;
  return `${parseInt(key.slice(5, 7), 10)}/${parseInt(key.slice(8, 10), 10)}`;
};

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

// orders → 상품별 집계 (매출/판매/복구/수량)
interface ProdAgg {
  goodsNo: string;
  name: string;
  category: string;
  revenue: number;
  quantity: number;
  sold: number;
  restored: number;
}
const aggregateProducts = (
  orders: RevenueOrderLite[],
  category: string
): Map<string, ProdAgg> => {
  const m = new Map<string, ProdAgg>();
  for (const o of orders) {
    for (const l of o.lines) {
      if (category !== 'all' && l.categoryCode !== category) continue;
      const b =
        m.get(l.goodsNo) ||
        { goodsNo: l.goodsNo, name: l.goodsName, category: l.categoryCode, revenue: 0, quantity: 0, sold: 0, restored: 0 };
      b.revenue += l.lineRevenue;
      b.quantity += l.quantity;
      if (o.canceled) b.restored += l.quantity;
      else if (o.paid) b.sold += l.quantity;
      m.set(l.goodsNo, b);
    }
  }
  return m;
};

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
  const labelStep = Math.max(1, Math.ceil(n / 8));
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

const srcFilter = (orders: RevenueOrderLite[], s: 'all' | 'real' | 'synthetic'): RevenueOrderLite[] => {
  if (s === 'all') return orders;
  const want = s === 'real' ? 'real_godomall' : 'synthetic_test';
  return orders.filter((o) => o.sourceType === want);
};

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
          level: stockLevel(s.syntheticProjectedStock)
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
const KpiCard: React.FC<{ icon: string; label: string; value: number; money?: boolean; unit?: string; sub: React.ReactNode; accent: string; riskBadge?: number }> = ({ icon, label, value, money, unit, sub, accent, riskBadge }) => {
  const v = useCountUp(value);
  return (
    <div className="ptd-kpi-card" style={{ borderLeftColor: accent }}>
      <div className="ptd-kpi-label">{icon} {label}</div>
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
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [dataSrc, setDataSrc] = useState<'all' | 'real' | 'synthetic'>('all');
  const [period, setPeriod] = useState<Period>('month');
  // 공통 기간(범위) 필터 — KPI/매출추이/도넛/순위가 함께 공유
  const [rangePreset, setRangePreset] = useState<'all' | 'm1' | 'w1' | 'd1' | 'custom'>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [rankOpen, setRankOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  const orders = useMemo<RevenueOrderLite[]>(() => revenue?.orders ?? [], [revenue]);
  const stockImpact = useMemo<StockImpactItem[]>(() => revenue?.stockImpact ?? [], [revenue]);
  const summary = revenue?.summary ?? null;

  // 프리셋(최근 N일) 계산용 최신 주문일
  const maxOrderMs = useMemo(() => {
    let m = 0;
    for (const o of orders) {
      const ms = Date.parse(o.orderDate.slice(0, 10));
      if (Number.isFinite(ms) && ms > m) m = ms;
    }
    return m;
  }, [orders]);

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

  const yearOptions = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) if (o.orderDate.length >= 4) s.add(o.orderDate.slice(0, 4));
    return Array.from(s).sort();
  }, [orders]);

  const monthsPresent = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) {
      if (year !== 'all' && o.orderDate.slice(0, 4) !== year) continue;
      if (o.orderDate.length >= 7) s.add(String(parseInt(o.orderDate.slice(5, 7), 10)));
    }
    return s;
  }, [orders, year]);

  const ordersFiltered = useMemo(() => {
    const startMs = rangePreset === 'custom' && customStart ? Date.parse(customStart) : null;
    const endMs = rangePreset === 'custom' && customEnd ? Date.parse(customEnd) : null;
    const presetDays = rangePreset === 'm1' ? 30 : rangePreset === 'w1' ? 7 : rangePreset === 'd1' ? 1 : 0;
    const presetCut = presetDays > 0 && maxOrderMs > 0 ? maxOrderMs - presetDays * 86400000 : null;
    return orders.filter((o) => {
      const y = o.orderDate.slice(0, 4);
      const m = o.orderDate.length >= 7 ? String(parseInt(o.orderDate.slice(5, 7), 10)) : '';
      if (year !== 'all' && y !== year) return false;
      if (month !== 'all' && m !== month) return false;
      if (dataSrc === 'real' && o.sourceType !== 'real_godomall') return false;
      if (dataSrc === 'synthetic' && o.sourceType !== 'synthetic_test') return false;
      // 공통 기간(범위) 필터
      const ms = Date.parse(o.orderDate.slice(0, 10));
      if (presetCut != null && ms < presetCut) return false;
      if (startMs != null && ms < startMs) return false;
      if (endMs != null && ms > endMs) return false;
      return true;
    });
  }, [orders, year, month, dataSrc, rangePreset, customStart, customEnd, maxOrderMs]);

  const relevantOrders = useMemo(
    () => (category === 'all' ? ordersFiltered : ordersFiltered.filter((o) => o.lines.some((l) => l.categoryCode === category))),
    [ordersFiltered, category]
  );

  const filteredStock = useMemo(
    () => (category === 'all' ? stockImpact : stockImpact.filter((s) => (goodsCategory.get(s.productId)?.code ?? 'uncategorized') === category)),
    [stockImpact, category, goodsCategory]
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
      riskCount: filteredStock.filter((x) => x.syntheticProjectedStock <= 20).length
    };
  }, [relevantOrders, filteredStock, category]);

  const trend = useMemo<PeriodBucket[]>(() => {
    const m = new Map<string, PeriodBucket>();
    for (const o of relevantOrders) {
      if (o.orderDate.length < 10) continue;
      const key = periodKey(o.orderDate, period);
      const b = m.get(key) || { key, label: periodLabel(key, period), revenue: 0, orders: 0, deliveryFee: 0, totalAmount: 0 };
      b.orders += 1;
      b.deliveryFee += o.deliveryFee;
      b.totalAmount += o.totalAmount;
      for (const l of o.lines) if (category === 'all' || l.categoryCode === category) b.revenue += l.lineRevenue;
      m.set(key, b);
    }
    let arr = Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));
    if (period === 'day') arr = arr.slice(-30);
    if (period === 'week') arr = arr.slice(-26);
    return arr;
  }, [relevantOrders, period, category]);

  const categoryData = useMemo(() => {
    const m = new Map<string, { code: string; revenue: number }>();
    let total = 0;
    for (const o of ordersFiltered)
      for (const l of o.lines) {
        const b = m.get(l.categoryCode) || { code: l.categoryCode, revenue: 0 };
        b.revenue += l.lineRevenue;
        total += l.lineRevenue;
        m.set(l.categoryCode, b);
      }
    const arr = Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
    return { total, items: arr.map((x) => ({ ...x, pct: total > 0 ? x.revenue / total : 0 })) };
  }, [ordersFiltered]);

  const ranking = useMemo(() => {
    const arr = Array.from(aggregateProducts(relevantOrders, category).values()).sort((a, b) => b.revenue - a.revenue);
    const max = arr.length > 0 ? arr[0].revenue : 0;
    const totalRev = arr.reduce((s, x) => s + x.revenue, 0);
    return arr.slice(0, 8).map((x) => ({ ...x, bar: max > 0 ? x.revenue / max : 0, pct: totalRev > 0 ? x.revenue / totalRev : 0 }));
  }, [relevantOrders, category]);

  const stockRisk = useMemo(() => [...filteredStock].sort((a, b) => a.syntheticProjectedStock - b.syntheticProjectedStock), [filteredStock]);

  const resetFilters = () => {
    setCategory('all');
    setYear('all');
    setMonth('all');
    setDataSrc('all');
    setRangePreset('all');
    setCustomStart('');
    setCustomEnd('');
  };

  const synthOn = (summary?.syntheticOrderCount ?? 0) > 0;
  const unavailable = !revenue || revenue.source === 'unavailable' || !summary;
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
            🧪 {synthOn ? `실제 ${summary?.realOrderCount ?? 0}건 + 가상 ${summary?.syntheticOrderCount ?? 0}건 포함` : 'REAL ONLY'}
            <span className="ptd-badge-tag">REAL + SYNTHETIC</span>
          </span>
          <button type="button" className="ptd-refresh" onClick={onRefresh} disabled={loading}>{loading ? '새로고침 중…' : '↻ 새로고침'}</button>
        </div>
      </div>

      {unavailable ? (
        <div className="ptd-empty">데이터를 불러오지 못했습니다. (로컬 dev에서는 서버 라우트가 없을 수 있습니다 — 배포 환경에서 확인하세요.)</div>
      ) : (
        <>
          <div className="ptd-filterbar">
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">카테고리</span>
              <button className={`ptd-chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>전체</button>
              {categoryOptions.map((c) => (
                <button key={c.code} className={`ptd-chip ${category === c.code ? 'active' : ''}`} onClick={() => setCategory(c.code)}>{catName(c.code)}</button>
              ))}
            </div>
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">연도</span>
              <button className={`ptd-chip ${year === 'all' ? 'active' : ''}`} onClick={() => setYear('all')}>전체</button>
              {yearOptions.map((y) => (<button key={y} className={`ptd-chip ${year === y ? 'active' : ''}`} onClick={() => setYear(y)}>{y}</button>))}
            </div>
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">월</span>
              <button className={`ptd-chip ${month === 'all' ? 'active' : ''}`} onClick={() => setMonth('all')}>전체</button>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                <button key={m} className={`ptd-chip ${month === m ? 'active' : ''} ${monthsPresent.has(m) ? '' : 'dim'}`} onClick={() => setMonth(m)}>{m}월</button>
              ))}
            </div>
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">데이터</span>
              {([['all', '전체'], ['real', '실제만'], ['synthetic', '가상만']] as const).map(([v, label]) => (
                <button key={v} className={`ptd-chip ${dataSrc === v ? 'active' : ''}`} onClick={() => setDataSrc(v)}>{label}</button>
              ))}
            </div>
            {/* 공통 기간(범위) 필터 — 대시보드 전체(KPI/추이/도넛/순위) 공유 */}
            <div className="ptd-filter-group">
              <span className="ptd-filter-label">기간</span>
              {([['all', '전체'], ['m1', '최근 1개월'], ['w1', '최근 1주'], ['d1', '최근 1일'], ['custom', '직접 선택']] as const).map(([v, label]) => (
                <button key={v} className={`ptd-chip ${rangePreset === v ? 'active' : ''}`} onClick={() => setRangePreset(v)}>{label}</button>
              ))}
              {rangePreset === 'custom' && (
                <span className="ptd-daterange">
                  <input type="date" className="ptd-date-input" value={customStart} max={customEnd || undefined} onChange={(e) => setCustomStart(e.target.value)} aria-label="시작일" />
                  <span className="ptd-date-sep">~</span>
                  <input type="date" className="ptd-date-input" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)} aria-label="종료일" />
                </span>
              )}
            </div>
            <button type="button" className="ptd-reset" onClick={resetFilters}>↺ 초기화</button>
          </div>

          <div className="ptd-kpi-grid">
            <KpiCard icon="💰" label="상품매출" value={kpi.revenue} money sub="배송비 제외 (라인합)" accent={KPI_ACCENT[0]} />
            <KpiCard icon="🧾" label="총 주문" value={kpi.orderCount} unit="건" sub={`실제 ${kpi.real} · 가상 ${kpi.synth}`} accent={KPI_ACCENT[1]} />
            <KpiCard icon="📈" label="판매수량" value={kpi.sold} unit="개" sub={`복구 ${kpi.restored} · 순판매 ${kpi.net}`} accent={KPI_ACCENT[2]} />
            <KpiCard icon="🏬" label="가상 현재 재고" value={kpi.virtualStock} unit="개" sub={`관리 상품 ${kpi.trackedCount}개`} accent={KPI_ACCENT[3]} riskBadge={kpi.riskCount} />
          </div>

          <div className="ptd-row">
            <div className="ptd-panel ptd-panel-wide">
              <div className="ptd-panel-head">
                <h3>매출 추이</h3>
                <div className="ptd-period-toggle">
                  {([['month', '월별'], ['week', '주간별'], ['day', '일별']] as const).map(([v, label]) => (
                    <button key={v} className={`ptd-seg ${period === v ? 'active' : ''}`} onClick={() => setPeriod(v)}>{label}</button>
                  ))}
                </div>
              </div>
              <TrendChart data={trend} period={period} />
            </div>
            <div className="ptd-panel">
              <div className="ptd-panel-head"><h3>매출 구성</h3><span className="ptd-panel-meta">카테고리 비중</span></div>
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
                    <li key={s.productId} className={`ptd-stock-card lv-${stockLevel(s.syntheticProjectedStock)}`}>
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
