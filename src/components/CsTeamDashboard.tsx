import React, { useMemo, useState } from 'react';
import './CsTeamDashboard.css';
import type { RevenueResult } from '../services/departmentDataService';
import { composeCsDraftFromOrders } from '../services/csDraftComposer';
import {
  buildCsDashboardFacts,
  buildCsKpiRevision,
  csTopicKo,
  type CsDashboardFacts,
  type CsKpiRevisionFacts,
  type CsPriorityInquiry,
  type CsLowRatingReview,
  type CsIssueProduct,
  type CsKpiItem,
  type CsKpiInquiryItem,
  type CsKpiReviewItem
} from '../services/csTeamDashboardFacts';

// CS팀 처리판 v0.2 — KPI를 [접수 현황] vs [처리 분류]로 재구성 + 카드 클릭 팝업.
// 데이터: 이미 로드된 revenue 재사용. PII/fake contact/memberKey 미표시. 실제 발송/등록 없음.

interface CsTeamDashboardProps {
  revenue: RevenueResult | null;
  goodsNames: Record<string, string>;
  loading: boolean;
  onRefresh: () => void;
}

type KpiKey = 'inquiries' | 'reviews' | 'ai' | 'internal';

const statusKo = (s: string): string =>
  /needs_human/i.test(s) ? '담당자 확인' : /unanswered|pending|open|미답변/i.test(s) ? '미답변' : /answered/i.test(s) ? '답변완료' : s;
const urgencyKo = (u: string): string =>
  /high|urgent|긴급/i.test(u) ? '긴급' : /medium/i.test(u) ? '보통' : /low/i.test(u) ? '낮음' : u;
const sentimentKo = (s: string): string => (/positive|만족/i.test(s) ? '만족' : /negative|부정|불만/i.test(s) ? '불만' : '보통');
const riskKo = (r: string): string => (r === 'high' ? '높음' : r === 'medium' ? '중간' : '낮음');
const shortDate = (d: string): string => (d || '').slice(0, 10);
const ageKo = (n: number): string => (n <= 0 ? '오늘' : `${n}일 경과`);

// 리뷰 답글 안전 템플릿(PII 없음). 저평점/부정은 사과 톤.
const reviewReplyDraft = (r: CsKpiReviewItem): string => {
  const low = r.rating <= 2 || /negative|부정|불만/i.test(r.sentiment);
  return low
    ? '안녕하세요, 고객님.\n불편을 드려 죄송합니다. 남겨주신 의견은 꼼꼼히 확인하겠습니다.\n더 나은 경험을 드릴 수 있도록 개선하겠습니다. 감사합니다.'
    : '안녕하세요, 고객님.\n소중한 후기 남겨주셔서 감사합니다.\n앞으로도 좋은 상품과 서비스로 보답하겠습니다. 감사합니다.';
};

// ── KPI 카드 ──────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: number; sub: string; icon: string; accent: string; onClick: () => void }>
  = ({ label, value, sub, icon, accent, onClick }) => (
    <button type="button" className="dept-stat-card cs-dash-kpi cs-dash-kpi-btn" style={{ borderTopColor: accent }} onClick={onClick}>
      <div className="dept-stat-head"><span className="dept-stat-icon">{icon}</span><span>{label}</span></div>
      <div className="dept-stat-value" style={{ color: accent }}>{value}건</div>
      <div className="cs-dash-kpi-sub">{sub}</div>
      <span className="cs-dash-kpi-more">클릭하여 목록 보기 →</span>
    </button>
  );

// ── 하단 섹션 행 ──────────────────────────────────────────────────────────────
const PriorityRow: React.FC<{ q: CsPriorityInquiry }> = ({ q }) => (
  <li className={`cs-dash-pri-item ${q.needsHumanCheck ? 'is-risk' : ''}`}>
    <div className="cs-dash-pri-rank">{q.rank}</div>
    <div className="cs-dash-pri-body">
      <div className="cs-dash-pri-title">{q.title}</div>
      <div className="cs-dash-pri-meta">{q.productName} · {csTopicKo(q.topic)} · {statusKo(q.status)} · {urgencyKo(q.urgency)} · {shortDate(q.createdAt)}</div>
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
    <div className="cs-dash-issue-meta">문의 {p.inquiryCount} · 리뷰이슈 {p.reviewIssueCount} · 주요 {csTopicKo(p.mainTopic)}</div>
    <span className={`cs-badge risk-${p.riskLevel}`}>위험 {riskKo(p.riskLevel)}</span>
  </li>
);

// ── KPI 팝업 ──────────────────────────────────────────────────────────────────
interface PopupTab { key: string; label: string; match: (i: CsKpiItem) => boolean }

const itemId = (i: CsKpiItem): string => (i.kind === 'inquiry' ? i.inquiryId : i.reviewId);

const CsKpiPopup: React.FC<{
  title: string;
  items: CsKpiItem[];
  tabs: PopupTab[];
  allowDraft: boolean;
  orders: RevenueResult['orders'];
  onClose: () => void;
}> = ({ title, items, tabs, allowDraft, orders, onClose }) => {
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || 'all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [memo, setMemo] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Array<{ label: string; draft: string }>>([]);

  const tab = tabs.find((t) => t.key === activeTab) || tabs[0];
  const filtered = tab ? items.filter(tab.match) : items;
  const selected = filtered.find((i) => itemId(i) === selectedId) || null;

  const genDraft = (i: CsKpiItem): string =>
    i.kind === 'review'
      ? reviewReplyDraft(i)
      : composeCsDraftFromOrders({ inquiryId: i.inquiryId, orderNo: i.orderNo, goodsNo: i.goodsNo, topic: i.topic }, orders || []).customerDraft;

  const makeDrafts = (list: CsKpiItem[]): void =>
    setPreviews(list.map((i) => ({ label: i.kind === 'review' ? `리뷰 · ${i.productName}` : `${(i as CsKpiInquiryItem).title} · ${i.productName}`, draft: genDraft(i) })));

  return (
    <div className="cs-pop-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="cs-pop" onClick={(e) => e.stopPropagation()}>
        <div className="cs-pop-head">
          <h3>{title} <span className="cs-pop-count">{filtered.length}건</span></h3>
          <button type="button" className="cs-pop-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <div className="cs-pop-tabs">
          {tabs.map((t) => (
            <button key={t.key} type="button" className={`cs-pop-tab ${t.key === activeTab ? 'active' : ''}`} onClick={() => { setActiveTab(t.key); setSelectedId(null); }}>
              {t.label} <span className="cs-pop-tab-n">{items.filter(t.match).length}</span>
            </button>
          ))}
        </div>

        {allowDraft && (
          <div className="cs-pop-actions">
            <button type="button" className="dept-refresh-btn" onClick={() => makeDrafts(filtered)}>전체 초안 만들기</button>
            <button type="button" className="dept-refresh-btn" onClick={() => makeDrafts(filtered.filter((i) => checked[itemId(i)]))}>선택 초안 만들기</button>
            <span className="cs-pop-actions-note">※ 초안 미리보기만 — 실제 발송/등록은 하지 않습니다.</span>
          </div>
        )}

        <div className="cs-pop-body">
          <ul className="cs-pop-list">
            {filtered.length === 0 && <li className="cs-dash-muted">해당 항목이 없습니다.</li>}
            {filtered.map((i) => {
              const id = itemId(i);
              return (
                <li key={id} className={`cs-pop-item ${selectedId === id ? 'active' : ''}`} onClick={() => setSelectedId(id)}>
                  {allowDraft && (
                    <input type="checkbox" checked={!!checked[id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setChecked((p) => ({ ...p, [id]: e.target.checked }))} />
                  )}
                  <div className="cs-pop-item-main">
                    <div className="cs-pop-item-title">
                      {i.kind === 'inquiry' ? (i as CsKpiInquiryItem).title : `${'★'.repeat(Math.max(0, Math.min(5, (i as CsKpiReviewItem).rating)))} ${(i as CsKpiReviewItem).rating}점`}
                      <span className="cs-badge muted">{i.kind === 'inquiry' ? '문의' : '리뷰'}</span>
                    </div>
                    <div className="cs-pop-item-meta">{i.productName} · {i.topicKo} · {ageKo(i.ageDays)} · {i.stage}</div>
                    <div className="cs-dash-badges">
                      <span className={`cs-badge ${i.aiProcessable ? 'ok' : 'muted'}`}>{i.aiProcessable ? 'AI 처리 가능' : 'AI 보류'}</span>
                      {i.needsInternalCheck && <span className="cs-badge warn">내부확인 필요</span>}
                      {i.internalReason && <span className="cs-badge warn">{i.internalReason}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="cs-pop-detail">
            {selected ? (
              <>
                <div className="cs-pop-detail-title">{selected.kind === 'inquiry' ? (selected as CsKpiInquiryItem).title : `${selected.productName} 리뷰`}</div>
                <dl className="cs-pop-detail-list">
                  <div><dt>상품</dt><dd>{selected.productName}</dd></div>
                  {selected.kind === 'inquiry'
                    ? <div><dt>주문</dt><dd>{(selected as CsKpiInquiryItem).orderLinked ? `연결됨 (${(selected as CsKpiInquiryItem).orderNo || '-'})` : '미연결'}</dd></div>
                    : <div><dt>평점/감성</dt><dd>{(selected as CsKpiReviewItem).rating}점 · {sentimentKo((selected as CsKpiReviewItem).sentiment)}</dd></div>}
                  <div><dt>유형</dt><dd>{selected.topicKo}</dd></div>
                  <div><dt>접수/경과</dt><dd>{shortDate(selected.createdAt)} · {ageKo(selected.ageDays)}</dd></div>
                  <div><dt>처리단계</dt><dd>{selected.stage}</dd></div>
                  <div><dt>처리분류</dt><dd>{selected.aiProcessable ? 'AI 자동처리 가능' : `내부확인 필요${selected.internalReason ? ` — ${selected.internalReason}` : ''}`}</dd></div>
                  {selected.kind === 'review' && (selected as CsKpiReviewItem).excerpt && <div><dt>요약</dt><dd>{(selected as CsKpiReviewItem).excerpt}</dd></div>}
                </dl>
                <label className="cs-pop-memo-label">내부 메모 (저장 안 됨 · v0)</label>
                <textarea className="cs-pop-memo" rows={2} value={memo[itemId(selected)] || ''} onChange={(e) => setMemo((p) => ({ ...p, [itemId(selected)]: e.target.value }))} placeholder="내부 확인 메모를 남겨보세요…" />
                {allowDraft && (
                  <div className="cs-pop-detail-draft">
                    <div className="cs-pop-detail-draft-label">AI 초안 미리보기</div>
                    <pre className="cs-pop-draft-pre">{genDraft(selected)}</pre>
                  </div>
                )}
              </>
            ) : (
              <p className="cs-dash-muted">항목을 선택하면 상세가 표시됩니다.</p>
            )}
          </div>
        </div>

        {allowDraft && previews.length > 0 && (
          <div className="cs-pop-preview">
            <div className="cs-pop-preview-head">생성된 초안 미리보기 {previews.length}건 (발송/등록 안 함)</div>
            {previews.map((p, i) => (
              <div key={i} className="cs-pop-preview-item">
                <div className="cs-pop-preview-label">{p.label}</div>
                <pre className="cs-pop-draft-pre">{p.draft}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 메인 ──────────────────────────────────────────────────────────────────────
export const CsTeamDashboard: React.FC<CsTeamDashboardProps> = ({ revenue, goodsNames, loading, onRefresh }) => {
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);

  const facts = useMemo<CsDashboardFacts | null>(() => {
    if (!revenue?.universeAux) return null;
    return buildCsDashboardFacts({ inquiries: revenue.universeAux.inquiries || [], reviews: revenue.universeAux.reviews || [], orders: revenue.orders || [], goodsNames });
  }, [revenue, goodsNames]);

  const rev = useMemo<CsKpiRevisionFacts | null>(() => {
    if (!revenue?.universeAux) return null;
    return buildCsKpiRevision({ inquiries: revenue.universeAux.inquiries || [], reviews: revenue.universeAux.reviews || [], orders: revenue.orders || [], goodsNames });
  }, [revenue, goodsNames]);

  if (!facts || !rev) {
    return (
      <div className="cs-dash-empty">
        <p>CS 데이터가 아직 없습니다. 데이터를 불러오면 처리판이 표시됩니다.</p>
        <button type="button" className="dept-refresh-btn" onClick={onRefresh} disabled={loading}>{loading ? '불러오는 중…' : '데이터 불러오기'}</button>
      </div>
    );
  }

  const orders = revenue?.orders || [];
  const qItems = rev.items.unresolvedInquiries;
  const inquirySub = `오늘 ${qItems.filter((i) => i.ageDays <= 0).length} · 1일+ ${qItems.filter((i) => i.ageDays >= 1).length} · 3일+ ${qItems.filter((i) => i.ageDays >= 3).length}`;
  const rb = rev.breakdowns.reviewByType;
  const reviewSub = `좋음 ${rb['좋음'] || 0} · 보통 ${rb['보통'] || 0} · 저평점 ${rb['저평점'] || 0}`;
  const ab = rev.breakdowns.aiProcessableByType;
  const aiSub = `리뷰 ${ab['리뷰'] || 0} · 배송 ${ab['배송'] || 0} · 일반 ${ab['일반'] || 0}`;
  const ib = rev.breakdowns.needsInternalCheckByType;
  const internalSub = `결제 ${ib['결제'] || 0} · 환불·취소 ${ib['환불·취소'] || 0} · 상품 ${ib['상품'] || 0}`;

  const TABS_INQ: PopupTab[] = [
    { key: 'all', label: '전체', match: () => true },
    { key: 'pay', label: '결제·주문', match: (i) => i.topic === 'payment' },
    { key: 'rc', label: '취소·환불', match: (i) => ['refund', 'cancel', 'return', 'exchange'].includes(i.topic) },
    { key: 'dlv', label: '배송', match: (i) => i.topic === 'delivery' },
    { key: 'prod', label: '상품', match: (i) => i.topic === 'product' },
    { key: 'etc', label: '일반', match: (i) => !['payment', 'refund', 'cancel', 'return', 'exchange', 'delivery', 'product'].includes(i.topic) }
  ];
  const TABS_REV: PopupTab[] = [
    { key: 'all', label: '전체', match: () => true },
    { key: 'good', label: '좋은', match: (i) => i.kind === 'review' && i.rating >= 4 },
    { key: 'norm', label: '보통', match: (i) => i.kind === 'review' && i.rating === 3 },
    { key: 'low', label: '저평점', match: (i) => i.kind === 'review' && i.rating <= 2 },
    { key: 'neg', label: '부정', match: (i) => i.kind === 'review' && /negative|부정|불만/i.test(i.sentiment) }
  ];
  const TABS_AI: PopupTab[] = [
    { key: 'all', label: '전체', match: () => true },
    { key: 'rev', label: '리뷰', match: (i) => i.kind === 'review' },
    { key: 'dlv', label: '배송', match: (i) => i.kind === 'inquiry' && i.topic === 'delivery' },
    { key: 'pay', label: '결제확인', match: (i) => i.kind === 'inquiry' && i.topic === 'payment' },
    { key: 'prod', label: '상품정보', match: (i) => i.kind === 'inquiry' && (i.topic === 'product' || i.topic === 'stock') },
    { key: 'etc', label: '일반', match: (i) => i.kind === 'inquiry' && !['delivery', 'payment', 'product', 'stock'].includes(i.topic) }
  ];
  const TABS_INT: PopupTab[] = [
    { key: 'all', label: '전체', match: () => true },
    { key: 'pay', label: '결제', match: (i) => i.kind === 'inquiry' && i.topic === 'payment' },
    { key: 'rc', label: '환불·취소', match: (i) => i.kind === 'inquiry' && ['refund', 'cancel', 'return', 'exchange'].includes(i.topic) },
    { key: 'prod', label: '상품', match: (i) => i.kind === 'review' },
    { key: 'dlv', label: '배송', match: (i) => i.kind === 'inquiry' && i.topic === 'delivery' }
  ];

  const popupCfg: Record<KpiKey, { title: string; items: CsKpiItem[]; tabs: PopupTab[]; allowDraft: boolean }> = {
    inquiries: { title: '미처리 문의 보기', items: qItems, tabs: TABS_INQ, allowDraft: false },
    reviews: { title: '미처리 리뷰 보기', items: rev.items.unresolvedReviews, tabs: TABS_REV, allowDraft: false },
    ai: { title: 'AI 자동처리 후보', items: rev.items.aiProcessable, tabs: TABS_AI, allowDraft: true },
    internal: { title: '내부확인 필요', items: rev.items.needsInternalCheck, tabs: TABS_INT, allowDraft: false }
  };
  const cfg = openKpi ? popupCfg[openKpi] : null;

  return (
    <div className="cs-dash">
      <div className="cs-dash-head">
        <h2 className="dept-dashboard-title"><span className="dept-team-emoji">💬</span>CS팀 처리판</h2>
        <p className="dept-dashboard-desc">접수된 업무를 처리 방식별로 분류합니다. (Commerce Universe safe data · 개인정보 제외)</p>
      </div>

      {/* KPI: 접수 현황 = 처리 분류 */}
      <div className="cs-dash-kpi-groups">
        <div className="cs-dash-kpi-group">
          <div className="cs-dash-kpi-group-label">접수 현황</div>
          <div className="cs-dash-kpi-row">
            <KpiCard label="미처리 문의" value={rev.intake.unresolvedInquiries} sub={inquirySub} icon="✉️" accent="#31D6C4" onClick={() => setOpenKpi('inquiries')} />
            <KpiCard label="미처리 리뷰" value={rev.intake.unresolvedReviews} sub={reviewSub} icon="⭐" accent="#FBBF24" onClick={() => setOpenKpi('reviews')} />
          </div>
        </div>
        <div className="cs-dash-kpi-eq">=</div>
        <div className="cs-dash-kpi-group">
          <div className="cs-dash-kpi-group-label">처리 분류</div>
          <div className="cs-dash-kpi-row">
            <KpiCard label="AI 자동처리 가능" value={rev.routing.aiProcessable} sub={aiSub} icon="🤖" accent="#5B7DB1" onClick={() => setOpenKpi('ai')} />
            <KpiCard label="내부확인 필요" value={rev.routing.needsInternalCheck} sub={internalSub} icon="🔎" accent="#FB7185" onClick={() => setOpenKpi('internal')} />
          </div>
        </div>
      </div>
      <p className="cs-dash-kpi-note">왼쪽은 접수된 업무, 오른쪽은 처리 방식입니다 · <b>미처리 문의 + 미처리 리뷰 = AI 자동처리 가능 + 내부확인 필요</b></p>

      {/* 우선 처리 문의 */}
      <section className="cs-dash-section">
        <h3 className="cs-dash-section-title">🧭 우선 처리 문의</h3>
        {facts.priorityInquiries.length ? (
          <ul className="cs-dash-pri-list">{facts.priorityInquiries.map((q) => <PriorityRow key={q.inquiryId || q.rank} q={q} />)}</ul>
        ) : <p className="cs-dash-muted">처리할 문의가 없습니다.</p>}
      </section>

      <div className="cs-dash-two-col">
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">⚠️ 주의 리뷰</h3>
          <p className="cs-dash-section-desc">저평점·부정 감성·상품 불만 신호</p>
          {facts.lowRatingReviews.length ? (
            <ul className="cs-dash-rev-list">{facts.lowRatingReviews.map((r, i) => <ReviewRow key={i} r={r} />)}</ul>
          ) : <p className="cs-dash-muted">주의 리뷰가 없습니다.</p>}
        </section>
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">📦 CS 이슈 상품</h3>
          <p className="cs-dash-section-desc">문의·리뷰 이슈가 반복되는 상품</p>
          {facts.issueProducts.length ? (
            <ul className="cs-dash-issue-list">{facts.issueProducts.map((p) => <IssueRow key={p.goodsNo} p={p} />)}</ul>
          ) : <p className="cs-dash-muted">이슈 상품이 없습니다.</p>}
        </section>
      </div>

      <div className="cs-dash-hint">
        <span className="cs-dash-hint-label">우측 CS팀장에게 이렇게 물어보세요</span>
        <div className="cs-dash-hint-list">{facts.chatHints.map((h, i) => <span key={i} className="cs-dash-hint-chip">{h}</span>)}</div>
      </div>

      {cfg && <CsKpiPopup title={cfg.title} items={cfg.items} tabs={cfg.tabs} allowDraft={cfg.allowDraft} orders={orders} onClose={() => setOpenKpi(null)} />}
    </div>
  );
};
