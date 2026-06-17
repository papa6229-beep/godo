import React, { useEffect } from 'react';
import type { OperationReport } from '../types/operation';
import './ReportModal.css';

interface ReportModalProps {
  report: OperationReport;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ report, onClose }) => {
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
        
        <div className="report-modal-footer">
          <button className="report-confirm-btn" onClick={onClose}>대시보드로 복귀</button>
        </div>
      </div>
    </div>
  );
};
