import React, { useMemo } from 'react';
import './CsTeamDashboard.css';
import type { RevenueResult } from '../services/departmentDataService';
import {
  buildCsDashboardFacts,
  csTopicKo,
  type CsDashboardFacts,
  type CsPriorityInquiry,
  type CsLowRatingReview,
  type CsIssueProduct
} from '../services/csTeamDashboardFacts';

// CS팀 중앙 대시보드 v0 — "분석 리포트"가 아니라 "처리판".
// 데이터: 이미 로드된 revenue.orders + universeAux.inquiries/reviews (새 API 호출 없음).
// PII/fake contact/memberKey 미표시. 마케팅 제안 없음(CS는 이슈 공급자).

interface CsTeamDashboardProps {
  revenue: RevenueResult | null;
  goodsNames: Record<string, string>;
  loading: boolean;
  onRefresh: () => void;
}

const statusKo = (s: string): string =>
  /needs_human/i.test(s) ? '담당자 확인' : /unanswered|pending|open|미답변/i.test(s) ? '미답변' : /answered/i.test(s) ? '답변완료' : s;
const urgencyKo = (u: string): string =>
  /high|urgent|긴급/i.test(u) ? '긴급' : /medium/i.test(u) ? '보통' : /low/i.test(u) ? '낮음' : u;
const sentimentKo = (s: string): string => (/positive|만족/i.test(s) ? '만족' : /negative|부정|불만/i.test(s) ? '불만' : '보통');
const riskKo = (r: string): string => (r === 'high' ? '높음' : r === 'medium' ? '중간' : '낮음');
const shortDate = (d: string): string => (d || '').slice(0, 10);

const KPI_CARDS: Array<{ key: keyof CsDashboardFacts['kpis']; label: string; icon: string; accent: string }> = [
  { key: 'unansweredCount', label: '미답변 문의', icon: '✉️', accent: '#31D6C4' },
  { key: 'urgentCount', label: '긴급 문의', icon: '🚨', accent: '#FB7185' },
  { key: 'lowRatingReviewCount', label: '저평점 리뷰', icon: '⭐', accent: '#FBBF24' },
  { key: 'needsHumanCheckCount', label: '내부 확인 필요', icon: '🔎', accent: '#5B7DB1' }
];

const PriorityRow: React.FC<{ q: CsPriorityInquiry }> = ({ q }) => (
  <li className={`cs-dash-pri-item ${q.needsHumanCheck ? 'is-risk' : ''}`}>
    <div className="cs-dash-pri-rank">{q.rank}</div>
    <div className="cs-dash-pri-body">
      <div className="cs-dash-pri-title">{q.title}</div>
      <div className="cs-dash-pri-meta">
        {q.productName} · {csTopicKo(q.topic)} · {statusKo(q.status)} · {urgencyKo(q.urgency)} · {shortDate(q.createdAt)}
      </div>
      <div className="cs-dash-badges">
        <span className={`cs-badge ${q.orderLinked ? 'ok' : 'muted'}`}>{q.orderLinked ? '주문 연결됨' : '주문 미연결'}</span>
        <span className={`cs-badge ${q.draftable ? 'ok' : 'muted'}`}>{q.draftable ? '초안 가능' : '초안 보류'}</span>
        {q.needsHumanCheck && <span className="cs-badge warn">내부 확인 필요</span>}
        <span className={`cs-badge risk-${q.riskLevel}`}>위험 {riskKo(q.riskLevel)}</span>
      </div>
    </div>
  </li>
);

const ReviewRow: React.FC<{ r: CsLowRatingReview }> = ({ r }) => (
  <li className="cs-dash-rev-item">
    <span className="cs-dash-rev-rating">{'★'.repeat(Math.max(0, Math.min(5, r.rating)))}<span className="cs-dash-rev-num">{r.rating}점</span></span>
    <div className="cs-dash-rev-body">
      <div className="cs-dash-rev-prod">{r.productName} <span className="cs-badge muted">{sentimentKo(r.sentiment)}</span> <span className="cs-dash-rev-topic">{csTopicKo(r.topic)}</span></div>
      {r.excerpt && <div className="cs-dash-rev-excerpt">{r.excerpt}</div>}
    </div>
    <span className="cs-dash-rev-date">{shortDate(r.createdAt)}</span>
  </li>
);

const IssueRow: React.FC<{ p: CsIssueProduct }> = ({ p }) => (
  <li className="cs-dash-issue-item">
    <div className="cs-dash-issue-prod">{p.productName}</div>
    <div className="cs-dash-issue-meta">
      문의 {p.inquiryCount} · 리뷰이슈 {p.reviewIssueCount} · 주요 {csTopicKo(p.mainTopic)}
    </div>
    <span className={`cs-badge risk-${p.riskLevel}`}>위험 {riskKo(p.riskLevel)}</span>
  </li>
);

export const CsTeamDashboard: React.FC<CsTeamDashboardProps> = ({ revenue, goodsNames, loading, onRefresh }) => {
  const facts = useMemo<CsDashboardFacts | null>(() => {
    if (!revenue?.universeAux) return null;
    return buildCsDashboardFacts({
      inquiries: revenue.universeAux.inquiries || [],
      reviews: revenue.universeAux.reviews || [],
      orders: revenue.orders || [],
      goodsNames
    });
  }, [revenue, goodsNames]);

  if (!facts) {
    return (
      <div className="cs-dash-empty">
        <p>CS 데이터가 아직 없습니다. 데이터를 불러오면 처리판이 표시됩니다.</p>
        <button type="button" className="dept-refresh-btn" onClick={onRefresh} disabled={loading}>
          {loading ? '불러오는 중…' : '데이터 불러오기'}
        </button>
      </div>
    );
  }

  const k = facts.kpis;
  return (
    <div className="cs-dash">
      <div className="cs-dash-head">
        <h2 className="dept-dashboard-title"><span className="dept-team-emoji">💬</span>CS팀 처리판</h2>
        <p className="dept-dashboard-desc">오늘 먼저 처리할 문의·리뷰·이슈 상품을 한눈에. (Commerce Universe safe data · 개인정보 제외)</p>
      </div>

      {/* 상단 KPI */}
      <div className="dept-card-grid cs-dash-kpi-grid">
        {KPI_CARDS.map((c) => (
          <div key={c.key} className="dept-stat-card cs-dash-kpi" style={{ borderTopColor: c.accent }}>
            <div className="dept-stat-head"><span className="dept-stat-icon">{c.icon}</span><span>{c.label}</span></div>
            <div className="dept-stat-value" style={{ color: c.accent }}>{k[c.key]}건</div>
          </div>
        ))}
      </div>
      <div className="cs-dash-subkpi">
        <span>주문 연결 문의 <b>{k.orderLinkedCount}</b></span>
        <span>초안 가능 문의 <b>{k.draftableCount}</b></span>
        <span>CS 이슈 상품 <b>{k.issueProductCount}</b></span>
      </div>

      {/* 우선 처리 문의 */}
      <section className="cs-dash-section">
        <h3 className="cs-dash-section-title">🧭 우선 처리 문의</h3>
        {facts.priorityInquiries.length ? (
          <ul className="cs-dash-pri-list">
            {facts.priorityInquiries.map((q) => <PriorityRow key={q.inquiryId || q.rank} q={q} />)}
          </ul>
        ) : (
          <p className="cs-dash-muted">처리할 문의가 없습니다.</p>
        )}
      </section>

      <div className="cs-dash-two-col">
        {/* 저평점/부정 리뷰 */}
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">⭐ 저평점/부정 리뷰</h3>
          {facts.lowRatingReviews.length ? (
            <ul className="cs-dash-rev-list">
              {facts.lowRatingReviews.map((r, i) => <ReviewRow key={i} r={r} />)}
            </ul>
          ) : (
            <p className="cs-dash-muted">저평점/부정 리뷰가 없습니다.</p>
          )}
        </section>

        {/* CS 이슈 상품 */}
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">📦 CS 이슈 상품</h3>
          {facts.issueProducts.length ? (
            <ul className="cs-dash-issue-list">
              {facts.issueProducts.map((p) => <IssueRow key={p.goodsNo} p={p} />)}
            </ul>
          ) : (
            <p className="cs-dash-muted">이슈 상품이 없습니다.</p>
          )}
        </section>
      </div>

      {/* 채팅 연결 힌트 */}
      <div className="cs-dash-hint">
        <span className="cs-dash-hint-label">우측 CS팀장에게 이렇게 물어보세요</span>
        <div className="cs-dash-hint-list">
          {facts.chatHints.map((h, i) => <span key={i} className="cs-dash-hint-chip">{h}</span>)}
        </div>
      </div>
    </div>
  );
};
