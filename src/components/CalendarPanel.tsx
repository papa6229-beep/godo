import React, { useMemo, useEffect, useCallback } from 'react';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { DailyOperationSummary, CalendarDayCell, CalendarMetricLevel } from '../types/calendar';
import { buildDailyOperationSummaries } from '../utils/dailySummaryBuilder';
import './CalendarPanel.css';

interface CalendarPanelProps {
  activeOperationsData: OperationsDataSnapshot;
  lastSelectedDate: string;
  setLastSelectedDate: (date: string) => void;
  lastViewedMonth: string;
  setLastViewedMonth: (month: string) => void;
  setActiveTab: (tab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'calendar') => void;
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
}

export const CalendarPanel: React.FC<CalendarPanelProps> = ({
  activeOperationsData,
  lastSelectedDate,
  setLastSelectedDate,
  lastViewedMonth,
  setLastViewedMonth,
  setActiveTab,
  onAddLog
}) => {
  // 1. activeOperationsData를 기반으로 일일 요약 데이터 빌드
  const dailySummaries = useMemo(() => {
    return buildDailyOperationSummaries(activeOperationsData);
  }, [activeOperationsData]);

  // 2. 가장 최근 데이터 날짜를 찾는 헬퍼 함수
  const getMostRecentDataDate = useCallback((): string => {
    const dates = Array.from(dailySummaries.keys()).sort();
    if (dates.length > 0) {
      return dates[dates.length - 1];
    }
    return new Date().toISOString().split('T')[0];
  }, [dailySummaries]);

  // 3. 상태 초기화 및 동기화
  useEffect(() => {
    // 선택 날짜가 비어있다면 가장 최근 데이터 날짜로 채워줌
    if (!lastSelectedDate) {
      const recent = getMostRecentDataDate();
      setLastSelectedDate(recent);
      
      // 월 정보도 동기화
      const monthPart = recent.substring(0, 7); // YYYY-MM
      setLastViewedMonth(monthPart);
    }
  }, [lastSelectedDate, dailySummaries, getMostRecentDataDate, setLastSelectedDate, setLastViewedMonth]);

  // 4. 년-월 상태 추출
  const [currentYear, currentMonth] = useMemo(() => {
    if (!lastViewedMonth) {
      const today = new Date();
      return [today.getFullYear(), today.getMonth() + 1];
    }
    const [y, m] = lastViewedMonth.split('-').map(Number);
    return [y, m];
  }, [lastViewedMonth]);

  // 5. 달력 이동 이벤트 핸들러
  const handlePrevMonth = () => {
    let nextY = currentYear;
    let nextM = currentMonth - 1;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    const nextMonthStr = `${nextY}-${String(nextM).padStart(2, '0')}`;
    setLastViewedMonth(nextMonthStr);
  };

  const handleNextMonth = () => {
    let nextY = currentYear;
    let nextM = currentMonth + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    const nextMonthStr = `${nextY}-${String(nextM).padStart(2, '0')}`;
    setLastViewedMonth(nextMonthStr);
  };

  const handleGoToday = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setLastSelectedDate(todayStr);
    setLastViewedMonth(todayStr.substring(0, 7));
    onAddLog(`[Calendar] 오늘 날짜(${todayStr})로 이동했습니다.`, 'info');
  };

  // 6. 월간 통계 계산 (현재 조회 중인 월 기준)
  const monthlyStats = useMemo(() => {
    let orderCount = 0;
    let totalSales = 0;
    let inquiryCount = 0;
    let negativeReviewCount = 0;
    let inventoryRiskCount = 0;
    let dataDaysCount = 0;

    dailySummaries.forEach((summary, dateStr) => {
      if (dateStr.substring(0, 7) === lastViewedMonth) {
        orderCount += summary.orderCount;
        totalSales += summary.totalSales;
        inquiryCount += summary.inquiryCount;
        negativeReviewCount += summary.negativeReviewCount;
        // 재고 위험은 중복 누적되지 않게 스냅샷 기점에 한 번만 카운트됨
        inventoryRiskCount += summary.inventoryRiskCount;
        if (summary.orderCount > 0 || summary.inquiryCount > 0 || summary.reviewCount > 0 || summary.totalSales > 0) {
          dataDaysCount++;
        }
      }
    });

    return {
      orderCount,
      totalSales,
      inquiryCount,
      negativeReviewCount,
      inventoryRiskCount,
      dataDaysCount
    };
  }, [dailySummaries, lastViewedMonth]);

  // 7. 캘린더 그리드 셀 생성 (월요일 시작 기준)
  const calendarCells = useMemo((): CalendarDayCell[] => {
    const cells: CalendarDayCell[] = [];

    // 해당 월의 1일 날짜 객체
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    // 1일의 요일 (0: 일, 1: 월, ..., 6: 토)
    const firstDayOfWeek = firstDay.getDay();
    // 월요일 시작으로 변환 (월: 0, 화: 1, ..., 일: 6)
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // 해당 월의 마지막 날짜
    const lastDay = new Date(currentYear, currentMonth, 0);
    const totalDays = lastDay.getDate();

    // 이전 달의 마지막 날짜 정보 구하기
    const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate();

    // 1. 이전 달 날짜 채우기 (dim 처리)
    for (let i = startOffset - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      let prevM = currentMonth - 1;
      let prevY = currentYear;
      if (prevM < 1) {
        prevM = 12;
        prevY -= 1;
      }
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      
      cells.push({
        date: dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: false,
        hasData: dailySummaries.has(dateStr),
        level: 'empty'
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 2. 현재 달 날짜 채우기
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const summary = dailySummaries.get(dateStr);
      const hasData = !!summary;
      const isToday = (dateStr === todayStr);

      // 위험 레벨 판별 규칙
      let level: CalendarMetricLevel = 'empty';
      if (summary) {
        const isCritical = 
          summary.negativeReviewCount >= 3 || 
          summary.unansweredInquiryCount >= 5 || 
          summary.inventoryRiskCount >= 5 || 
          summary.invoiceMissingCount >= 5;

        const isWarning = 
          summary.negativeReviewCount >= 1 || 
          summary.unansweredInquiryCount >= 1 || 
          summary.inventoryRiskCount >= 1 || 
          summary.deliveryDelayedCount >= 1;

        level = isCritical ? 'critical' : (isWarning ? 'warning' : 'normal');
      }

      cells.push({
        date: dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday,
        hasData,
        level,
        summary
      });
    }

    // 3. 다음 달 날짜 채우기 (전체 42칸 유지)
    const remainingCells = 42 - cells.length;
    for (let d = 1; d <= remainingCells; d++) {
      let nextM = currentMonth + 1;
      let nextY = currentYear;
      if (nextM > 12) {
        nextM = 1;
        nextY += 1;
      }
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      cells.push({
        date: dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: false,
        hasData: dailySummaries.has(dateStr),
        level: 'empty'
      });
    }

    return cells;
  }, [currentYear, currentMonth, dailySummaries]);

  // 8. 선택된 날짜의 요약
  const selectedSummary = useMemo((): DailyOperationSummary | undefined => {
    return dailySummaries.get(lastSelectedDate);
  }, [dailySummaries, lastSelectedDate]);

  // 9. 날짜 셀 클릭 시 이벤트
  const handleSelectDay = (cell: CalendarDayCell) => {
    setLastSelectedDate(cell.date);
    if (!cell.isCurrentMonth) {
      setLastViewedMonth(cell.date.substring(0, 7));
    }

    const summary = dailySummaries.get(cell.date);
    
    // Activity Log 기록 남기기 (중복 호출 시 과도한 기록 방지는 부모 컴포넌트나 호출 기점을 고려)
    onAddLog(`[Calendar] ${cell.date} 운영 요약을 열람했습니다.`, 'info');
    if (summary) {
      onAddLog(
        `[Calendar] ${cell.date} 날짜에 주문 ${summary.orderCount}건, CS 문의 ${summary.inquiryCount}건, 재고 위험 ${summary.inventoryRiskCount}건이 집계되었습니다.`,
        'info'
      );
    }
  };

  // 10. 타임라인 리스크 순서 목록 구성
  const timelineEvents = useMemo(() => {
    if (!selectedSummary) return [];
    
    const events: { time: string; agent: string; desc: string; type: string }[] = [];
    
    if (selectedSummary.orderCount > 0) {
      events.push({
        time: '09:00',
        agent: '주문 확인 AI',
        desc: selectedSummary.invoiceMissingCount > 0 
          ? `송장 누락 건 ${selectedSummary.invoiceMissingCount}건이 발견되어 보완 처리를 지시했습니다.`
          : `신규 주문 ${selectedSummary.orderCount}건을 오류 없이 검수 및 완료 처리했습니다.`,
        type: selectedSummary.invoiceMissingCount > 0 ? 'warning' : 'normal'
      });
    }
    
    if (selectedSummary.inquiryCount > 0) {
      events.push({
        time: '10:30',
        agent: 'CS 상담 AI',
        desc: selectedSummary.unansweredInquiryCount > 0
          ? `답변 대기 상태인 CS 문의 ${selectedSummary.unansweredInquiryCount}건을 유형 분류 완료했습니다.`
          : `금일 접수된 문의 ${selectedSummary.inquiryCount}건에 대한 자동 답변을 처리했습니다.`,
        type: selectedSummary.unansweredInquiryCount > 0 ? 'warning' : 'normal'
      });
    }
    
    if (selectedSummary.reviewCount > 0) {
      events.push({
        time: '13:20',
        agent: '리뷰 답글 AI',
        desc: selectedSummary.negativeReviewCount > 0
          ? `저평점 부정 리뷰 ${selectedSummary.negativeReviewCount}건이 발생하여 특별 피드백 초안을 빌드했습니다.`
          : `리뷰 ${selectedSummary.reviewCount}건에 대한 감사 답글 톤앤매너 매칭 처리를 마쳤습니다.`,
        type: selectedSummary.negativeReviewCount > 0 ? 'danger' : 'normal'
      });
    }
    
    if (selectedSummary.inventoryRiskCount > 0) {
      events.push({
        time: '15:00',
        agent: '재고 감시 AI',
        desc: `재고 경고 항목 ${selectedSummary.inventoryRiskCount}건에 대해 공급망 거래처 알림 및 입고 조정을 안내했습니다.`,
        type: 'danger'
      });
    } else if (selectedSummary.date === (activeOperationsData.importedAt?.split('T')[0])) {
      events.push({
        time: '15:00',
        agent: '재고 감시 AI',
        desc: `전체 SKU 재고 현황을 모니터링하여 안전 재고선을 안전하게 통과했음을 검증했습니다.`,
        type: 'normal'
      });
    }

    if (selectedSummary.totalSales > 0) {
      events.push({
        time: '17:00',
        agent: '매출 분석 AI',
        desc: `금일 총 매출 ${selectedSummary.totalSales.toLocaleString()}원, 주문 전환율 ${selectedSummary.totalSales > 0 ? 3.2 : 0}%를 요약하여 재무 대조표를 생성했습니다.`,
        type: 'normal'
      });
    }

    return events.sort((a, b) => a.time.localeCompare(b.time));
  }, [selectedSummary, activeOperationsData]);

  return (
    <div className="calendar-panel-container">
      {/* 1. 헤더 영역 */}
      <div className="calendar-header-section">
        <div className="calendar-title-wrapper">
          <h2 className="calendar-main-title">📅 GODO OPERATION CALENDAR</h2>
          <span className="calendar-subtitle">
            로컬 쇼핑몰 데이터 샌드박스를 날짜별로 매핑하여 일일 운영 지표 및 에이전트의 AI 자동화 처리 타임라인을 파악하는 운영 일지입니다.
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="calendar-nav-btn" onClick={() => setActiveTab('data')}>
            📡 Data Center
          </button>
          <button type="button" className="calendar-nav-btn" onClick={() => setActiveTab('office')}>
            🏢 Office View
          </button>
        </div>
      </div>

      {/* 2. 상단 누적 요약 지표 */}
      <div className="calendar-metrics-row">
        <div className="calendar-metric-box active-source">
          <span className="calendar-metric-lbl">조회 년월</span>
          <span className="calendar-metric-val">{currentYear}년 {currentMonth}월</span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">데이터 일수</span>
          <span className="calendar-metric-val">{monthlyStats.dataDaysCount}일</span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">월간 총 주문</span>
          <span className="calendar-metric-val">{monthlyStats.orderCount}건</span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">월간 총 매출</span>
          <span className="calendar-metric-val">
            ₩{monthlyStats.totalSales.toLocaleString()}
          </span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">월간 고객 문의</span>
          <span className="calendar-metric-val">{monthlyStats.inquiryCount}건</span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">부정 평점 리뷰</span>
          <span className="calendar-metric-val" style={{ color: monthlyStats.negativeReviewCount > 0 ? '#ff4d4d' : 'inherit' }}>
            {monthlyStats.negativeReviewCount}건
          </span>
        </div>
        <div className="calendar-metric-box">
          <span className="calendar-metric-lbl">재고 위험 상품</span>
          <span className="calendar-metric-val" style={{ color: monthlyStats.inventoryRiskCount > 0 ? '#ffb300' : 'inherit' }}>
            {monthlyStats.inventoryRiskCount}옵션
          </span>
        </div>
      </div>

      {/* 3. 메인 레이아웃 */}
      <div className="calendar-main-layout">
        
        {/* A. 좌측 캘린더 */}
        <div className="calendar-grid-area">
          <div className="calendar-nav-bar">
            <button className="calendar-nav-btn" onClick={handlePrevMonth}>◀ 이전 달</button>
            <span className="calendar-month-title">
              {currentYear}. {String(currentMonth).padStart(2, '0')}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="calendar-nav-btn" onClick={handleGoToday}>오늘</button>
              <button className="calendar-nav-btn" onClick={handleNextMonth}>다음 달 ▶</button>
            </div>
          </div>

          <div className="calendar-grid-table">
            <div className="calendar-week-header">
              <span className="calendar-weekday">월</span>
              <span className="calendar-weekday">화</span>
              <span className="calendar-weekday">수</span>
              <span className="calendar-weekday">목</span>
              <span className="calendar-weekday">금</span>
              <span className="calendar-weekday">토</span>
              <span className="calendar-weekday">일</span>
            </div>

            <div className="calendar-cells-grid">
              {calendarCells.map((cell, idx) => {
                const isSelected = (cell.date === lastSelectedDate);
                const hasData = cell.hasData;

                return (
                  <div
                    key={idx}
                    className={`calendar-day-cell ${cell.isCurrentMonth ? '' : 'dim'} ${cell.isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectDay(cell)}
                  >
                    <div className="day-cell-header">
                      <span className="day-num">{cell.dayNumber}</span>
                      {hasData && (
                        <span className={`cell-level-dot ${cell.level}`}></span>
                      )}
                    </div>

                    {cell.summary && (
                      <div className="day-cell-badges">
                        {cell.summary.orderCount > 0 && (
                          <span className="cell-badge ord">
                            <span>ORD</span> <span>{cell.summary.orderCount}</span>
                          </span>
                        )}
                        {cell.summary.totalSales > 0 && (
                          <span className="cell-badge sales">
                            <span>₩</span> <span>{Math.round(cell.summary.totalSales / 1000)}k</span>
                          </span>
                        )}
                        {cell.summary.inquiryCount > 0 && (
                          <span className="cell-badge cs">
                            <span>CS</span> <span>{cell.summary.inquiryCount}</span>
                          </span>
                        )}
                        {cell.summary.inventoryRiskCount > 0 && (
                          <span className="cell-badge stk">
                            <span>STK</span> <span>{cell.summary.inventoryRiskCount}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* B. 우측 Daily Brief */}
        <div className="calendar-brief-area">
          {selectedSummary ? (
            <div className="brief-container">
              <div className="brief-title-row">
                <span className="brief-date">📅 {lastSelectedDate} 요약</span>
                <span className={`brief-source-badge ${selectedSummary.dataSourceType}`}>
                  {selectedSummary.dataSourceType.toUpperCase()}
                </span>
              </div>

              {/* 통계 지표 카드 */}
              <div className="brief-section-card">
                <h4>📊 일일 통계 현황</h4>
                <div className="brief-stats-grid">
                  <div className="brief-stat-item">
                    <span className="brief-stat-lbl">총 매출액</span>
                    <span className="brief-stat-val highlight">₩{selectedSummary.totalSales.toLocaleString()}</span>
                  </div>
                  <div className="brief-stat-item">
                    <span className="brief-stat-lbl">주문 건수</span>
                    <span className="brief-stat-val">{selectedSummary.orderCount}건</span>
                  </div>
                  <div className="brief-stat-item">
                    <span className="brief-stat-lbl">고객 문의 수</span>
                    <span className="brief-stat-val">{selectedSummary.inquiryCount}건</span>
                  </div>
                  <div className="brief-stat-item">
                    <span className="brief-stat-lbl">미답변 문의</span>
                    <span className={`brief-stat-val ${selectedSummary.unansweredInquiryCount > 0 ? 'warning' : ''}`}>
                      {selectedSummary.unansweredInquiryCount}건
                    </span>
                  </div>
                  <div className="brief-stat-item">
                    <span className="brief-stat-lbl">부정 평점 리뷰</span>
                    <span className={`brief-stat-val ${selectedSummary.negativeReviewCount > 0 ? 'danger' : ''}`}>
                      {selectedSummary.negativeReviewCount}건
                    </span>
                  </div>
                  <div className="brief-stat-item">
                    <span className="brief-stat-lbl">재고 위험 상품</span>
                    <span className={`brief-stat-val ${selectedSummary.inventoryRiskCount > 0 ? 'danger' : ''}`}>
                      {selectedSummary.inventoryRiskCount}옵션
                    </span>
                  </div>
                  <div className="brief-stat-item">
                    <span className="brief-stat-lbl">송장 누락</span>
                    <span className={`brief-stat-val ${selectedSummary.invoiceMissingCount > 0 ? 'danger' : ''}`}>
                      {selectedSummary.invoiceMissingCount}건
                    </span>
                  </div>
                  <div className="brief-stat-item">
                    <span className="brief-stat-lbl">배송 지연 주문</span>
                    <span className={`brief-stat-val ${selectedSummary.deliveryDelayedCount > 0 ? 'warning' : ''}`}>
                      {selectedSummary.deliveryDelayedCount}건
                    </span>
                  </div>
                </div>
              </div>

              {/* 이슈 하이라이트 */}
              <div className="brief-section-card">
                <h4>⚠️ 주요 발생 이슈 (Highlights)</h4>
                <ul className="bullet-list">
                  {selectedSummary.issueHighlights.map((hl, i) => (
                    <li key={i} className="bullet-item warning">
                      <span className="icon">🚨</span> <span>{hl}</span>
                    </li>
                  ))}
                  {selectedSummary.issueHighlights.length === 0 && (
                    <li className="bullet-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      포착된 운영상 리스크가 없습니다.
                    </li>
                  )}
                </ul>
              </div>

              {/* AI 운영 활동 요약 */}
              <div className="brief-section-card">
                <h4>🤖 AI 에이전트 운영 활동</h4>
                <ul className="bullet-list">
                  {selectedSummary.aiActivityHighlights.map((act, i) => (
                    <li key={i} className="bullet-item">
                      <span className="icon">⚡</span> <span>{act}</span>
                    </li>
                  ))}
                  {selectedSummary.aiActivityHighlights.length === 0 && (
                    <li className="bullet-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      해당 날짜에 기동된 AI 운영 프로세스가 없습니다.
                    </li>
                  )}
                </ul>
              </div>

              {/* 타임라인 */}
              <div className="brief-section-card">
                <h4>🕒 AI Issue Timeline</h4>
                {timelineEvents.length === 0 ? (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    타임라인에 기록된 일정이 없습니다.
                  </span>
                ) : (
                  <div className="timeline-list">
                    {timelineEvents.map((ev, i) => (
                      <div key={i} className="timeline-item active">
                        <span className="timeline-dot"></span>
                        <span className="timeline-time">{ev.time} [{ev.agent}]</span>
                        <span className="timeline-desc">{ev.desc}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-data-message" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              선택한 날짜(${lastSelectedDate})에 로드된 쇼핑몰 적재 데이터가 없습니다. 캘린더에서 하이라이트 배지가 있는 날짜를 클릭해 주세요.
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
