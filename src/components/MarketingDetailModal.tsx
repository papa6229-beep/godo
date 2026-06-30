import React, { useMemo, useState } from 'react';
import './MarketingDetailModal.css';
import type { MarketingDimensionMetric } from '../services/marketingAnalysisFacts';

// 세부 분석 카드 "전체보기" 모달 — 표시 전용(계산 없음). 기존 facts 항목을 검색/정렬만 한다.
// 데이터에 없는 정렬 기준은 만들지 않는다(revenue/orderCount/averageOrderValue/sharePercent만).

const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;
export type MarketingDetailSortKey = 'revenue' | 'orderCount' | 'averageOrderValue' | 'sharePercent';
const SORT_LABELS: Record<MarketingDetailSortKey, string> = {
  revenue: '매출순', orderCount: '주문수순', averageOrderValue: '객단가순', sharePercent: '비중순'
};

export interface MarketingDetailModalProps {
  open: boolean;
  title: string;
  periodLabel: string;
  items: MarketingDimensionMetric[];
  sorts?: MarketingDetailSortKey[];
  onClose: () => void;
}

export const MarketingDetailModal: React.FC<MarketingDetailModalProps> = ({
  open, title, periodLabel, items, sorts = ['revenue', 'orderCount', 'averageOrderValue', 'sharePercent'], onClose
}) => {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<MarketingDetailSortKey>(sorts[0] ?? 'revenue');

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? items.filter((it) => (it.label || '').toLowerCase().includes(needle)) : items;
    return [...filtered].sort((a, b) => (Number(b[sort]) || 0) - (Number(a[sort]) || 0));
  }, [items, q, sort]);

  if (!open) return null;
  return (
    <div className="mkt-detail-modal-overlay" role="dialog" aria-modal="true" aria-label={`${title} 전체보기`} onClick={onClose}>
      <div className="mkt-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mkt-detail-modal-head">
          <div>
            <h3 className="mkt-detail-modal-title">{title}</h3>
            <span className="mkt-detail-modal-period">기간: {periodLabel} · 총 {items.length}개</span>
          </div>
          <button type="button" className="mkt-detail-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="mkt-detail-modal-controls">
          <input
            className="mkt-detail-modal-search"
            type="search"
            placeholder="이름 검색…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="항목 이름 검색"
          />
          <div className="mkt-detail-modal-sorts" role="group" aria-label="정렬 기준">
            {sorts.map((k) => (
              <button key={k} type="button" className={`mkt-detail-sort-btn ${sort === k ? 'active' : ''}`} onClick={() => setSort(k)}>
                {SORT_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="mkt-detail-modal-body">
          {view.length === 0 ? (
            <p className="mkt-detail-modal-empty">표시할 항목이 없습니다.</p>
          ) : (
            <ul className="mkt-detail-modal-list">
              {view.map((it) => (
                <li key={it.key} className="mkt-detail-modal-row">
                  <div className="mkt-detail-modal-row-head">
                    <span className="mkt-detail-modal-label">{it.label || '미분류'}</span>
                    <span className="tabular-nums">{it.sharePercent}%</span>
                  </div>
                  <div className="mkt-detail-modal-bar-track">
                    <div className="mkt-detail-modal-bar" style={{ width: `${Math.min(100, Math.max(0, it.sharePercent))}%` }} />
                  </div>
                  <div className="mkt-detail-modal-row-foot">
                    <span>매출 {won(it.revenue)}</span>
                    <span>주문 {it.orderCount}건</span>
                    <span>객단가 {won(it.averageOrderValue)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mkt-detail-modal-foot-note">※ 표시 전용 — 기존 분석값을 검색/정렬만 합니다(새 계산 없음).</p>
      </div>
    </div>
  );
};
