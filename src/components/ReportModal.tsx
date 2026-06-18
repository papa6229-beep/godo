import React, { useEffect, useMemo } from 'react';
import type { OperationReport } from '../types/operation';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import './ReportModal.css';

interface ReportModalProps {
  report: OperationReport;
  onClose: () => void;
  activeOperationsData?: OperationsDataSnapshot;
  setActiveTab?: (tab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar') => void;
  setLastSelectedDate?: (date: string) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ 
  report, 
  onClose, 
  activeOperationsData,
  setActiveTab,
  setLastSelectedDate
}) => {
  useEffect(() => {
    // 이전 overflow 상태 기록
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    // 모달 활성화 시 스크롤 lock
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('modal-open', 'no-scroll', 'overflow-hidden');

    return () => {
      // 모달 해제(cleanup) 시 원래 상태 복구
      document.body.style.overflow = prevBodyOverflow || '';
      document.documentElement.style.overflow = prevHtmlOverflow || '';
      document.body.classList.remove('modal-open', 'no-scroll', 'overflow-hidden');
    };
  }, []);

  const stats = useMemo(() => {
    if (!activeOperationsData) {
      return {
        sourceType: 'Demo Data',
        importedAt: new Date().toLocaleDateString(),
        qualityScore: 100,
        ordersCount: 5,
        inquiriesCount: 3,
        reviewsCount: 3,
        inventoryCount: 5,
        salesPeriod: '2026-06-16 ~ 2026-06-18'
      };
    }

    let salesPeriod = '데이터 없음';
    if (activeOperationsData.sales.length > 0) {
      const dates = activeOperationsData.sales.map(s => s.date).sort();
      salesPeriod = `${dates[0]} ~ ${dates[dates.length - 1]}`;
    }

    const typeMapping: Record<string, string> = {
      demo: 'Demo Data',
      csv: 'CSV Import',
      json: 'JSON Import',
      manual: 'Manual Input',
      api_mock: 'Mock API'
    };

    return {
      sourceType: typeMapping[activeOperationsData.sourceType] || activeOperationsData.sourceType.toUpperCase(),
      importedAt: activeOperationsData.importedAt ? new Date(activeOperationsData.importedAt).toLocaleString() : '미정',
      qualityScore: activeOperationsData.qualityReport?.qualityScore ?? 100,
      ordersCount: activeOperationsData.orders.length,
      inquiriesCount: activeOperationsData.inquiries.length,
      reviewsCount: activeOperationsData.reviews.length,
      inventoryCount: activeOperationsData.inventory.length,
      salesPeriod
    };
  }, [activeOperationsData]);

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="report-modal-header">
          <div className="report-header-glow"></div>
          <h2 className="report-modal-title">📊 DAILY OPERATION SUMMARY REPORT</h2>
          <span className="report-modal-subtitle">GODO AI OS KERNEL v1.0.0</span>
          <button className="report-close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="report-modal-body">
          {/* 데이터 커넥터 소스 통계 카드 */}
          <div className="report-section data-source-card">
            <h3 className="report-section-title">📡 DATA CONNECTOR SOURCE INFO</h3>
            <div className="source-info-grid">
              <div className="info-item">
                <span className="info-lbl">데이터 소스</span>
                <span className="info-val">{stats.sourceType}</span>
              </div>
              <div className="info-item">
                <span className="info-lbl">마지막 업데이트</span>
                <span className="info-val" style={{ fontSize: '0.62rem' }}>{stats.importedAt}</span>
              </div>
              <div className="info-item">
                <span className="info-lbl">데이터 품질 점수</span>
                <span className={`info-val ${stats.qualityScore >= 90 ? 'score-good' : 'score-warn'}`}>
                  {stats.qualityScore}점
                </span>
              </div>
              <div className="info-item">
                <span className="info-lbl">매출 데이터 기간</span>
                <span className="info-val" style={{ fontSize: '0.62rem' }}>{stats.salesPeriod}</span>
              </div>
            </div>

            <div className="source-detail-counts">
              <span className="count-badge">📦 주문 {stats.ordersCount}건</span>
              <span className="count-badge">💬 CS {stats.inquiriesCount}건</span>
              <span className="count-badge">⭐ 리뷰 {stats.reviewsCount}건</span>
              <span className="count-badge">📊 재고 {stats.inventoryCount}옵션</span>
            </div>
          </div>

          <div className="report-section summary-card">
            <h3 className="report-section-title">📝 오늘의 핵심 요약</h3>
            <p className="report-summary-text">{report.summary}</p>
          </div>
          
          <div className="report-stats-row">
            <div className="report-stat-box success">
              <span className="report-stat-val">{report.autoCompletedCount}건</span>
              <span className="report-stat-lbl">자동 처리 완료</span>
            </div>
            <div className="report-stat-box warning">
              <span className="report-stat-val">{report.approvalRequiredCount}건</span>
              <span className="report-stat-lbl">승인 검토 대기</span>
            </div>
          </div>
          
          <div className="report-grid">
            <div className="report-grid-section warning-signals">
              <h3 className="report-section-title text-danger">⚠️ 발견된 위험 신호 (RISKS)</h3>
              <ul className="report-list">
                {report.warningSignals.map((sig, i) => (
                  <li key={i} className="report-list-item warning">
                    <span className="bullet">🚨</span> <span>{sig}</span>
                  </li>
                ))}
                {report.warningSignals.length === 0 && (
                  <li className="report-list-item empty">안전 재고 미달 및 위협 요소가 포착되지 않았습니다.</li>
                )}
              </ul>
            </div>
            
            <div className="report-grid-section recommended-actions">
              <h3 className="report-section-title text-success">🎯 권장 조치 사항 (ACTIONS)</h3>
              <ul className="report-list">
                {report.recommendedActions.map((act, i) => (
                  <li key={i} className="report-list-item action">
                    <span className="bullet">⚡</span> <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        
        <div className="report-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {setActiveTab && setLastSelectedDate && (
            <button 
              className="report-confirm-btn" 
              style={{ background: 'transparent', border: '1px solid var(--accent-border)' }}
              onClick={() => {
                let recentDate = activeOperationsData?.importedAt?.split('T')[0] || new Date().toISOString().split('T')[0];
                const dates: string[] = [];
                if (activeOperationsData) {
                  activeOperationsData.orders.forEach(o => { if (o.orderDate) dates.push(o.orderDate.split(' ')[0]); });
                  activeOperationsData.inquiries.forEach(i => { if (i.inquiryDate) dates.push(i.inquiryDate.split(' ')[0]); });
                  activeOperationsData.reviews.forEach(r => { if (r.reviewDate) dates.push(r.reviewDate.split(' ')[0]); });
                  activeOperationsData.sales.forEach(s => { if (s.date) dates.push(s.date); });
                }
                if (dates.length > 0) {
                  dates.sort();
                  recentDate = dates[dates.length - 1];
                }
                setLastSelectedDate(recentDate);
                setActiveTab('calendar');
                onClose();
              }}
            >
              📅 View Daily Brief
            </button>
          )}
          <button className="report-confirm-btn" onClick={onClose}>대시보드로 복귀</button>
        </div>
      </div>
    </div>
  );
};
