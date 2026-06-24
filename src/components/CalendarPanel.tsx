import React, { useMemo, useEffect, useState } from 'react';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { CalendarMetricLevel } from '../types/calendar';
import { fetchRevenue, type RevenueResult } from '../services/departmentDataService';
import './CalendarPanel.css';

// Operation Calendar Revenue Binding v0
// - 기존 /api/godomall/orders-revenue?includeSynthetic=true 데이터를 프론트에서 날짜별 집계
// - 새 API/생성 로직 수정 없음. 실데이터가 쌓이면 같은 구조로 자동 반영.

interface CalendarPanelProps {
  activeOperationsData: OperationsDataSnapshot;
  lastSelectedDate: string;
  setLastSelectedDate: (date: string) => void;
  lastViewedMonth: string;
  setLastViewedMonth: (month: string) => void;
  setActiveTab: (tab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'calendar') => void;
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
}

// 카테고리 코드 → 표시명 (표시 전용, 상품팀 대시보드와 동일 컨셉)
const CAT_NAMES: Record<string, string> = {
  uncategorized: '미분류', '001': '생활가전', '003': '주방가전', '006': '공기·청정', '007': '계절가전',
  C1: '생활가전', C2: '주방가전', C3: '공기·청정'
};
const catName = (c: string): string => CAT_NAMES[c] || (c === 'uncategorized' || !c ? '미분류' : c);
const RISK_THRESHOLD = 20;

interface DailyRev {
  orderCount: number;
  productRevenue: number;
  deliveryFee: number;
  totalAmount: number;
  soldQty: number;
  real: number;
  synthetic: number;
  catRev: Map<string, number>;
  prodRev: Map<string, { name: string; revenue: number; qty: number }>;
  riskGoods: Set<string>;
}
const emptyDaily = (): DailyRev => ({
  orderCount: 0, productRevenue: 0, deliveryFee: 0, totalAmount: 0, soldQty: 0, real: 0, synthetic: 0,
  catRev: new Map(), prodRev: new Map(), riskGoods: new Set()
});

interface RevCell {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  level: CalendarMetricLevel;
  daily?: DailyRev;
}

const won = (n: number): string => `₩${Math.round(n).toLocaleString('ko-KR')}`;

export const CalendarPanel: React.FC<CalendarPanelProps> = ({
  lastSelectedDate,
  setLastSelectedDate,
  lastViewedMonth,
  setLastViewedMonth,
  setActiveTab,
  onAddLog
}) => {
  // 1. revenue 데이터 fetch (운영일지 진입 시 1회)
  const [revenue, setRevenue] = useState<RevenueResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchRevenue(true).then((r) => {
      if (active) {
        setRevenue(r);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // 2. 날짜별 매출/주문 집계
  const stockRiskCount = useMemo(
    () => (revenue?.stockImpact ?? []).filter((s) => s.syntheticProjectedStock <= RISK_THRESHOLD).length,
    [revenue]
  );
  const revByDate = useMemo(() => {
    const map = new Map<string, DailyRev>();
    const riskSet = new Set(
      (revenue?.stockImpact ?? []).filter((s) => s.syntheticProjectedStock <= RISK_THRESHOLD).map((s) => s.productId)
    );
    for (const o of revenue?.orders ?? []) {
      const d = o.orderDate.slice(0, 10);
      if (d.length < 10) continue;
      const b = map.get(d) || emptyDaily();
      b.orderCount += 1;
      b.deliveryFee += o.deliveryFee;
      b.totalAmount += o.totalAmount;
      if (o.sourceType === 'synthetic_test') b.synthetic += 1;
      else b.real += 1;
      for (const l of o.lines) {
        b.productRevenue += l.lineRevenue;
        b.soldQty += l.quantity;
        b.catRev.set(l.categoryCode, (b.catRev.get(l.categoryCode) || 0) + l.lineRevenue);
        const p = b.prodRev.get(l.goodsNo) || { name: l.goodsName, revenue: 0, qty: 0 };
        p.revenue += l.lineRevenue;
        p.qty += l.quantity;
        b.prodRev.set(l.goodsNo, p);
        if (riskSet.has(l.goodsNo)) b.riskGoods.add(l.goodsNo);
      }
      map.set(d, b);
    }
    return map;
  }, [revenue]);

  // 3. 최초 로드 시 가장 최근 매출 날짜로 기본 선택 (값 없을 때만)
  useEffect(() => {
    if (!loaded || lastSelectedDate) return;
    const dates = Array.from(revByDate.keys()).sort();
    const recent = dates.length ? dates[dates.length - 1] : new Date().toISOString().split('T')[0];
    setLastSelectedDate(recent);
    if (!lastViewedMonth) setLastViewedMonth(recent.substring(0, 7));
  }, [loaded, lastSelectedDate, lastViewedMonth, revByDate, setLastSelectedDate, setLastViewedMonth]);

  // 4. 년-월
  const [currentYear, currentMonth] = useMemo(() => {
    if (!lastViewedMonth) {
      const t = new Date();
      return [t.getFullYear(), t.getMonth() + 1];
    }
    const [y, m] = lastViewedMonth.split('-').map(Number);
    return [y, m];
  }, [lastViewedMonth]);

  const handlePrevMonth = () => {
    let y = currentYear;
    let m = currentMonth - 1;
    if (m < 1) { m = 12; y -= 1; }
    setLastViewedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };
  const handleNextMonth = () => {
    let y = currentYear;
    let m = currentMonth + 1;
    if (m > 12) { m = 1; y += 1; }
    setLastViewedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };
  const handleGoToday = () => {
    const t = new Date().toISOString().split('T')[0];
    setLastSelectedDate(t);
    setLastViewedMonth(t.substring(0, 7));
    onAddLog(`[Calendar] 오늘 날짜(${t})로 이동했습니다.`, 'info');
  };

  // 5. 월간 KPI
  const monthlyStats = useMemo(() => {
    let orderCount = 0;
    let productRevenue = 0;
    let totalAmount = 0;
    let dataDays = 0;
    revByDate.forEach((d, dateStr) => {
      if (dateStr.substring(0, 7) === lastViewedMonth) {
        orderCount += d.orderCount;
        productRevenue += d.productRevenue;
        totalAmount += d.totalAmount;
        if (d.orderCount > 0) dataDays += 1;
      }
    });
    return { orderCount, productRevenue, totalAmount, dataDays };
  }, [revByDate, lastViewedMonth]);

  // 6. 캘린더 셀 (월요일 시작, 42칸)
  const calendarCells = useMemo((): RevCell[] => {
    const cells: RevCell[] = [];
    const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay();
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = startOffset - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      let pm = currentMonth - 1;
      let py = currentYear;
      if (pm < 1) { pm = 12; py -= 1; }
      const dateStr = `${py}-${String(pm).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push({ date: dateStr, dayNumber: dayNum, isCurrentMonth: false, isToday: false, level: 'empty' });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const daily = revByDate.get(dateStr);
      const level: CalendarMetricLevel = daily ? (daily.riskGoods.size > 0 ? 'warning' : 'normal') : 'empty';
      cells.push({ date: dateStr, dayNumber: d, isCurrentMonth: true, isToday: dateStr === todayStr, level, daily });
    }
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      let nm = currentMonth + 1;
      let ny = currentYear;
      if (nm > 12) { nm = 1; ny += 1; }
      const dateStr = `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date: dateStr, dayNumber: d, isCurrentMonth: false, isToday: false, level: 'empty' });
    }
    return cells;
  }, [currentYear, currentMonth, revByDate]);

  // 7. 선택 날짜 일일 집계 (없으면 0)
  const sel = revByDate.get(lastSelectedDate);
  const selData = sel ?? emptyDaily();
  const topCategories = useMemo(
    () => Array.from(selData.catRev.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3),
    [selData]
  );
  const topProducts = useMemo(
    () => Array.from(selData.prodRev.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 3),
    [selData]
  );

  const handleSelectDay = (cell: RevCell) => {
    setLastSelectedDate(cell.date);
    if (!cell.isCurrentMonth) setLastViewedMonth(cell.date.substring(0, 7));
    const d = revByDate.get(cell.date);
    onAddLog(
      d
        ? `[Calendar] ${cell.date} — 주문 ${d.orderCount}건, 상품매출 ${won(d.productRevenue)} 열람`
        : `[Calendar] ${cell.date} — 매출 데이터 없음`,
      'info'
    );
  };

  const sourceTag = selData.synthetic > 0 ? (selData.real > 0 ? 'SYNTHETIC+REAL' : 'SYNTHETIC') : selData.real > 0 ? 'REAL' : 'NO-DATA';

  return (
    <div className="calendar-panel-container">
      {/* 헤더 */}
      <div className="calendar-header-section">
        <div className="calendar-title-wrapper">
          <h2 className="calendar-main-title">📅 GODO OPERATION CALENDAR</h2>
          <span className="calendar-subtitle">
            최근 6개월 주문/매출(실데이터 + synthetic) 데이터를 날짜별로 매핑한 운영 일지입니다. (orders-revenue 기반)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="calendar-nav-btn" onClick={() => setActiveTab('data')}>📡 Data Center</button>
          <button type="button" className="calendar-nav-btn" onClick={() => setActiveTab('office')}>🏢 Office View</button>
        </div>
      </div>

      {/* 월간 KPI */}
      <div className="calendar-metrics-row">
        <div className="calendar-metric-box active-source">
          <span className="calendar-metric-lbl">조회 년월</span>
          <span className="calendar-metric-val">{currentYear}년 {currentMonth}월</span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">데이터 일수</span>
          <span className="calendar-metric-val">{monthlyStats.dataDays}일</span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">월간 총 주문</span>
          <span className="calendar-metric-val">{monthlyStats.orderCount.toLocaleString('ko-KR')}건</span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">월간 총 매출</span>
          <span className="calendar-metric-val">{won(monthlyStats.productRevenue)}</span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">월간 고객 문의</span>
          <span className="calendar-metric-val">0건<small className="cal-pending"> (미연동)</small></span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">부정 평점 리뷰</span>
          <span className="calendar-metric-val">0건<small className="cal-pending"> (미연동)</small></span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">재고 위험 상품</span>
          <span className="calendar-metric-val" style={{ color: stockRiskCount > 0 ? '#ffb300' : 'inherit' }}>
            {stockRiskCount}개<small className="cal-pending"> (현재)</small>
          </span>
        </div>
      </div>

      {!loaded && <div className="empty-data-message" style={{ padding: '10px 0', color: 'var(--text-muted)' }}>매출 데이터를 불러오는 중…</div>}
      {loaded && revenue?.source === 'unavailable' && (
        <div className="empty-data-message" style={{ padding: '10px 0', color: 'var(--warning, #ffb300)' }}>
          ※ 매출 데이터를 불러오지 못했습니다. (로컬 dev에서는 서버 라우트가 없을 수 있습니다 — 배포 환경에서 확인하세요.)
        </div>
      )}

      {/* 메인 레이아웃 */}
      <div className="calendar-main-layout">
        {/* 좌측 캘린더 */}
        <div className="calendar-grid-area">
          <div className="calendar-nav-bar">
            <button className="calendar-nav-btn" onClick={handlePrevMonth}>◀ 이전 달</button>
            <span className="calendar-month-title">{currentYear}. {String(currentMonth).padStart(2, '0')}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="calendar-nav-btn" onClick={handleGoToday}>오늘</button>
              <button className="calendar-nav-btn" onClick={handleNextMonth}>다음 달 ▶</button>
            </div>
          </div>

          <div className="calendar-grid-table">
            <div className="calendar-week-header">
              {['월', '화', '수', '목', '금', '토', '일'].map((w) => <span key={w} className="calendar-weekday">{w}</span>)}
            </div>
            <div className="calendar-cells-grid">
              {calendarCells.map((cell, idx) => {
                const isSelected = cell.date === lastSelectedDate;
                return (
                  <div
                    key={idx}
                    className={`calendar-day-cell ${cell.isCurrentMonth ? '' : 'dim'} ${cell.isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectDay(cell)}
                  >
                    <div className="day-cell-header">
                      <span className="day-num">{cell.dayNumber}</span>
                      {cell.daily && <span className={`cell-level-dot ${cell.level}`}></span>}
                    </div>
                    {cell.daily && (
                      <div className="day-cell-badges">
                        {cell.daily.orderCount > 0 && (
                          <span className="cell-badge ord"><span>ORD</span> <span>{cell.daily.orderCount}</span></span>
                        )}
                        {cell.daily.productRevenue > 0 && (
                          <span className="cell-badge sales"><span>₩</span> <span>{Math.round(cell.daily.productRevenue / 1000)}k</span></span>
                        )}
                        {cell.daily.riskGoods.size > 0 && (
                          <span className="cell-badge stk"><span>STK</span> <span>{cell.daily.riskGoods.size}</span></span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 우측 Daily Brief */}
        <div className="calendar-brief-area">
          <div className="brief-container">
            <div className="brief-title-row">
              <span className="brief-date">📅 {lastSelectedDate || '날짜 선택'} 요약</span>
              <span className={`brief-source-badge ${selData.synthetic > 0 ? 'synthetic' : 'real'}`}>{sourceTag}</span>
            </div>

            {/* 매출/주문 통계 (실 synthetic revenue 기반) */}
            <div className="brief-section-card">
              <h4>📊 일일 매출 · 주문 현황</h4>
              <div className="brief-stats-grid">
                <div className="brief-stat-item">
                  <span className="brief-stat-lbl">상품매출</span>
                  <span className="brief-stat-val highlight">{won(selData.productRevenue)}</span>
                </div>
                <div className="brief-stat-item">
                  <span className="brief-stat-lbl">총 주문금액</span>
                  <span className="brief-stat-val">{won(selData.totalAmount)}</span>
                </div>
                <div className="brief-stat-item">
                  <span className="brief-stat-lbl">주문 건수</span>
                  <span className="brief-stat-val">{selData.orderCount}건</span>
                </div>
                <div className="brief-stat-item">
                  <span className="brief-stat-lbl">배송비</span>
                  <span className="brief-stat-val">{won(selData.deliveryFee)}</span>
                </div>
                <div className="brief-stat-item">
                  <span className="brief-stat-lbl">판매수량</span>
                  <span className="brief-stat-val">{selData.soldQty.toLocaleString('ko-KR')}개</span>
                </div>
                <div className="brief-stat-item">
                  <span className="brief-stat-lbl">실제 · 가상</span>
                  <span className="brief-stat-val">{selData.real} · {selData.synthetic}건</span>
                </div>
                <div className="brief-stat-item">
                  <span className="brief-stat-lbl">재고 위험 상품</span>
                  <span className={`brief-stat-val ${stockRiskCount > 0 ? 'danger' : ''}`}>{stockRiskCount}개</span>
                </div>
                <div className="brief-stat-item">
                  <span className="brief-stat-lbl">당일 위험상품 거래</span>
                  <span className={`brief-stat-val ${selData.riskGoods.size > 0 ? 'warning' : ''}`}>{selData.riskGoods.size}개</span>
                </div>
              </div>
            </div>

            {/* 카테고리 / 상위 상품 */}
            <div className="brief-section-card">
              <h4>🏷️ 주요 판매 카테고리 · 상위 상품</h4>
              {selData.orderCount === 0 ? (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>해당 날짜 매출 데이터가 없습니다. (0원 / 0건)</span>
              ) : (
                <>
                  <ul className="bullet-list">
                    {topCategories.map(([code, rev]) => (
                      <li key={code} className="bullet-item"><span className="icon">📦</span> <span>{catName(code)} — {won(rev)}</span></li>
                    ))}
                  </ul>
                  <ul className="bullet-list" style={{ marginTop: '6px' }}>
                    {topProducts.map((p, i) => (
                      <li key={i} className="bullet-item"><span className="icon">🏆</span> <span>{p.name || '(이름 없음)'} — {won(p.revenue)} · {p.qty}개</span></li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* 런타임 미연동 영역 (placeholder 유지) */}
            <div className="brief-section-card">
              <h4>🤖 AI 운영 활동 · Issue Timeline</h4>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                에이전트 운영 활동/이슈 타임라인은 실제 런타임 데이터 연동 전 단계입니다. (매출·주문·재고는 실데이터 기반)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
