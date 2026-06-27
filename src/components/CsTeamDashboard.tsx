import React, { useMemo, useState } from 'react';
import './CsTeamDashboard.css';
import type { RevenueResult } from '../services/departmentDataService';
import { composeCsDraftFromOrders } from '../services/csDraftComposer';
import {
  buildCsDashboardFacts,
  buildCsAdminWorkflow,
  buildCsDetailItem,
  csTopicKo,
  csTypeColorClass,
  type CsDashboardFacts,
  type CsAdminWorkflowFacts,
  type CsPriorityInquiry,
  type CsLowRatingReview,
  type CsIssueProduct,
  type CsKpiItem,
  type CsKpiInquiryItem,
  type CsKpiReviewItem,
  type CsResolvedItem,
  type CsDashContact
} from '../services/csTeamDashboardFacts';
import { buildCsCustomerProfileHub, searchCustomerProfiles, type CsCustomerProfileHubItem } from '../services/csCustomerManagementFacts';
import {
  buildCompletedWorkItem,
  addCompletedWorkItems,
  completedOriginalIdSet,
  isAiAutoCompletable,
  toResolvedItem,
  type CsCompletedWorkItem,
  type CsCompletionSource,
  type CsCompletionMethod
} from '../services/csWorkCompletionState';

// CS팀 처리판 v0.3 — 관리자 업무 흐름 KPI: 미처리 문의 / 처리완료 문의 / AI 자동처리함 / 고객관리.
// 데이터: 이미 로드된 revenue 재사용. 고객 PII는 CS UI 경로(contacts)만. 실제 WRITE/발송 없음.

interface CsTeamDashboardProps {
  revenue: RevenueResult | null;
  goodsNames: Record<string, string>;
  loading: boolean;
  onRefresh: () => void;
}

type KpiKey = 'unresolved' | 'resolved' | 'ai' | 'customers';

const statusKo = (s: string): string =>
  /needs_human/i.test(s) ? '담당자 확인' : /unanswered|pending|open|미답변/i.test(s) ? '미답변' : /answered/i.test(s) ? '답변완료' : s;
const sentimentKo = (s: string): string => (/positive|만족/i.test(s) ? '만족' : /negative|부정|불만/i.test(s) ? '불만' : '보통');
const riskKo = (r: string): string => (r === 'high' ? '높음' : r === 'medium' ? '중간' : '낮음');
const shortDate = (d: string): string => (d || '').slice(0, 10);
const ageKo = (n: number): string => (n <= 0 ? '오늘' : `${n}일 경과`);
const won = (n?: number): string => (typeof n === 'number' ? `${Math.round(n).toLocaleString()}원` : '-');
const itemColor = (i: CsKpiItem): string => (i.kind === 'review' ? 'type-review' : csTypeColorClass(i.topic));

const reviewReplyDraft = (r: CsKpiReviewItem): string => {
  const low = r.rating <= 2 || /negative|부정|불만/i.test(r.sentiment);
  return low
    ? '안녕하세요, 고객님.\n불편을 드려 죄송합니다. 남겨주신 의견은 꼼꼼히 확인하겠습니다.\n더 나은 경험을 드릴 수 있도록 개선하겠습니다. 감사합니다.'
    : '안녕하세요, 고객님.\n소중한 후기 남겨주셔서 감사합니다.\n앞으로도 좋은 상품과 서비스로 보답하겠습니다. 감사합니다.';
};

const KpiCard: React.FC<{ label: string; value: number; unit: string; sub: string; icon: string; accent: string; onClick: () => void }>
  = ({ label, value, unit, sub, icon, accent, onClick }) => (
    <button type="button" className="dept-stat-card cs-dash-kpi cs-dash-kpi-btn" style={{ borderTopColor: accent }} onClick={onClick}>
      <div className="dept-stat-head"><span className="dept-stat-icon">{icon}</span><span>{label}</span></div>
      <div className="dept-stat-value" style={{ color: accent }}>{value}{unit}</div>
      <div className="cs-dash-kpi-sub">{sub}</div>
      <span className="cs-dash-kpi-more">클릭하여 열기 →</span>
    </button>
  );

// ── 하단 섹션 행(유지) ─────────────────────────────────────────────────────────
const PriorityRow: React.FC<{ q: CsPriorityInquiry }> = ({ q }) => (
  <li className={`cs-dash-pri-item ${q.needsHumanCheck ? 'is-risk' : ''}`}>
    <div className="cs-dash-pri-rank">{q.rank}</div>
    <div className="cs-dash-pri-body">
      <div className="cs-dash-pri-title">{q.title}</div>
      <div className="cs-dash-pri-meta">{q.productName} · {csTopicKo(q.topic)} · {statusKo(q.status)} · {shortDate(q.createdAt)}</div>
      <div className="cs-dash-badges">
        <span className={`cs-badge ${q.orderLinked ? 'ok' : 'muted'}`}>{q.orderLinked ? '주문 연결됨' : '주문 미연결'}</span>
        {q.needsHumanCheck && <span className="cs-badge warn">내부확인 필요</span>}
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

// ── 공통 팝업 셸 ───────────────────────────────────────────────────────────────
const PopupShell: React.FC<{ title: string; count: number; onClose: () => void; children: React.ReactNode }>
  = ({ title, count, onClose, children }) => (
    <div className="cs-pop-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="cs-pop" onClick={(e) => e.stopPropagation()}>
        <div className="cs-pop-head">
          <h3>{title} <span className="cs-pop-count">{count}건</span></h3>
          <button type="button" className="cs-pop-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {children}
      </div>
    </div>
  );

const PROCESS_STAGES = ['미확인', 'AI 초안 가능', '초안 작성됨', '내부 확인 중', '답변 대기', '처리 완료', '보류'];
interface PopupTab { key: string; label: string; match: (i: CsKpiItem) => boolean }
const itemId = (i: CsKpiItem): string => (i.kind === 'inquiry' ? i.inquiryId : i.reviewId);

// ── 미처리 문의 / AI 자동처리함 팝업(item + 6섹션 상세) ──────────────────────
const CsItemPopup: React.FC<{
  title: string; items: CsKpiItem[]; tabs: PopupTab[]; allowDraft: boolean; allowRegister: boolean;
  orders: RevenueResult['orders']; contacts: CsDashContact[]; goodsNames: Record<string, string>; onClose: () => void;
  onCompleteItem?: (item: CsKpiItem, payload: { answerText: string; assignee?: string; method: CsCompletionMethod }) => void;
  onCompleteBatch?: (entries: Array<{ item: CsKpiItem; draft: string }>) => void;
}> = ({ title, items, tabs, allowDraft, allowRegister, orders, contacts, goodsNames, onClose, onCompleteItem, onCompleteBatch }) => {
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || 'all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [memo, setMemo] = useState<Record<string, string>>({});
  const [stageByItem, setStageByItem] = useState<Record<string, string>>({});
  const [assigneeByItem, setAssigneeByItem] = useState<Record<string, string>>({});
  const [replyByItem, setReplyByItem] = useState<Record<string, string>>({});
  const [draftOpen, setDraftOpen] = useState(false);
  const [regenDraft, setRegenDraft] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [previews, setPreviews] = useState<Array<{ label: string; draft: string }>>([]);
  const selectItem = (id: string): void => { setSelectedId(id); setDraftOpen(false); setRegenDraft(null); setReplyOpen(false); };

  const tab = tabs.find((t) => t.key === activeTab) || tabs[0];
  const filtered = tab ? items.filter(tab.match) : items;
  const selected = filtered.find((i) => itemId(i) === selectedId) || null;
  const genDraft = (i: CsKpiItem): string =>
    i.kind === 'review' ? reviewReplyDraft(i) : composeCsDraftFromOrders({ inquiryId: i.inquiryId, orderNo: i.orderNo, goodsNo: i.goodsNo, topic: i.topic }, orders || []).customerDraft;
  const makeDrafts = (list: CsKpiItem[]): void =>
    setPreviews(list.map((i) => ({ label: i.kind === 'review' ? `리뷰 · ${i.productName}` : `${(i as CsKpiInquiryItem).title} · ${i.productName}`, draft: genDraft(i) })));

  const [doneNote, setDoneNote] = useState('');
  // AI 자동처리함: draft 있는 리뷰/배송만 처리완료(상품/결제/일반/환불은 애초에 목록에 없음).
  const runBatchComplete = (list: CsKpiItem[]): void => {
    if (!onCompleteBatch) return;
    const entries = list.map((i) => ({ item: i, draft: genDraft(i) }))
      .filter(({ item, draft }) => isAiAutoCompletable(item.kind === 'review' ? 'review' : 'delivery', draft));
    if (!entries.length) { setDoneNote('처리완료할 초안 대상이 없습니다.'); return; }
    onCompleteBatch(entries);
    setDoneNote(`${entries.length}건 처리완료되었습니다. 처리완료 문의로 이동되었습니다.`);
    setSelectedId(null);
  };
  // 미처리: 직접 답변 또는 AI 초안 기준 단건 처리완료.
  const runItemComplete = (item: CsKpiItem): void => {
    if (!onCompleteItem) return;
    const id = itemId(item);
    const manual = (replyByItem[id] || '').trim();
    const answerText = manual || genDraft(item);
    if (!answerText) { setDoneNote('답변 내용 또는 AI 초안이 필요합니다.'); return; }
    onCompleteItem(item, { answerText, assignee: assigneeByItem[id] || undefined, method: manual ? 'manual_reply' : 'ai_draft' });
    setDoneNote('처리 완료되었습니다. 처리완료 문의에서 확인할 수 있습니다.');
    setSelectedId(null);
  };

  return (
    <PopupShell title={title} count={filtered.length} onClose={onClose}>
      <div className="cs-pop-tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={`cs-pop-tab ${t.key === activeTab ? 'active' : ''}`} onClick={() => { setActiveTab(t.key); selectItem(''); }}>
            {t.label} <span className="cs-pop-tab-n">{items.filter(t.match).length}</span>
          </button>
        ))}
      </div>
      {allowDraft && (
        <div className="cs-pop-actions">
          <button type="button" className="dept-refresh-btn" onClick={() => makeDrafts(filtered)}>전체 초안 만들기</button>
          <button type="button" className="dept-refresh-btn" onClick={() => makeDrafts(filtered.filter((i) => checked[itemId(i)]))}>선택 초안 만들기</button>
          {allowRegister && onCompleteBatch && <>
            <button type="button" className="dept-refresh-btn" onClick={() => runBatchComplete(filtered.filter((i) => checked[itemId(i)]))}>선택 처리완료</button>
            <button type="button" className="dept-refresh-btn" onClick={() => runBatchComplete(filtered)}>전체 처리완료</button>
          </>}
          <span className="cs-pop-actions-note">※ v0: 로컬 처리완료(처리완료 문의로 이동) — 실제 고도몰 등록은 WRITE 연결 후 활성화됩니다(AI 자동발송 아님, 운영자 트리거 필요).</span>
          {doneNote && <span className="cs-pop-done-note">{doneNote}</span>}
        </div>
      )}
      <div className="cs-pop-body wide">
        <ul className="cs-pop-list">
          {filtered.length === 0 && <li className="cs-dash-muted">해당 항목이 없습니다.</li>}
          {filtered.map((i) => {
            const id = itemId(i);
            return (
              <li key={id} className={`cs-pop-item ${itemColor(i)} ${selectedId === id ? 'active' : ''}`} onClick={() => selectItem(id)}>
                {allowDraft && <input type="checkbox" checked={!!checked[id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setChecked((p) => ({ ...p, [id]: e.target.checked }))} />}
                <div className="cs-pop-item-main">
                  <div className="cs-pop-item-title">
                    {i.kind === 'inquiry' ? (i as CsKpiInquiryItem).title : `${'★'.repeat(Math.max(0, Math.min(5, (i as CsKpiReviewItem).rating)))} ${(i as CsKpiReviewItem).rating}점`}
                    <span className={`cs-badge type ${itemColor(i)}`}>{i.kind === 'inquiry' ? i.topicKo : '리뷰'}</span>
                  </div>
                  <div className="cs-pop-item-meta">{i.productName} · {ageKo(i.ageDays)} · {i.stage}</div>
                  <div className="cs-dash-badges">
                    <span className={`cs-badge ${i.aiProcessable ? 'ok' : 'muted'}`}>{i.aiProcessable ? 'AI 처리 가능' : 'AI 보류'}</span>
                    {!allowRegister && i.needsInternalCheck && <span className="cs-badge warn">내부확인 필요</span>}
                    {allowRegister && <span className="cs-badge muted">승인큐 미연결</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="cs-pop-detail">
          {selected ? (() => {
            const id = itemId(selected);
            const d = buildCsDetailItem(selected, { orders: orders || [], contacts, goodsNames });
            const stage = stageByItem[id] || d.processStage || '미확인';
            const assignee = assigneeByItem[id] || '';
            const history = [`${shortDate(d.createdAt || '')} · ${d.sourceType === 'inquiry' ? '문의' : '리뷰'} 접수`, `분류: ${d.processRoute === 'ai_auto' ? 'AI 자동처리 가능' : '내부확인 필요'}`, `현재 담당직원: ${assignee || '미지정'}`, ...(draftOpen || regenDraft ? ['AI 초안 생성됨'] : [])];
            return (
              <>
                <div className="cs-pop-sec">
                  <div className="cs-pop-sec-title">{d.sourceType === 'inquiry' ? '문의 내용' : '리뷰 내용'}</div>
                  <div className="cs-pop-detail-title">{d.title}</div>
                  <dl className="cs-pop-detail-list">
                    <div><dt>상품</dt><dd>{d.productName || '상품미상'}</dd></div>
                    <div><dt>유형</dt><dd>{d.type}</dd></div>
                    {d.sourceType === 'inquiry' ? <div><dt>상태</dt><dd>{statusKo(d.status || '')}</dd></div> : <div><dt>평점/감성</dt><dd>{d.rating}점 · {sentimentKo(d.sentiment || '')}</dd></div>}
                    <div><dt>접수/경과</dt><dd>{shortDate(d.createdAt || '')} · {ageKo(d.elapsedDays || 0)}</dd></div>
                    <div><dt>처리분류</dt><dd>{d.flags.needsInternalCheck ? `내부확인 필요${selected.needsInternalCheck && selected.internalReason ? ` — ${selected.internalReason}` : ''}` : 'AI 자동처리 가능'}</dd></div>
                  </dl>
                  {d.bodyText && <div className="cs-pop-body-text">{d.bodyText}</div>}
                </div>
                <div className="cs-pop-sec">
                  <div className="cs-pop-sec-title">주문 정보</div>
                  {d.flags.orderLinked && d.order ? (
                    <>
                      <dl className="cs-pop-detail-list">
                        <div><dt>주문번호</dt><dd>{d.order.orderNo}</dd></div>
                        <div><dt>주문일</dt><dd>{shortDate(d.order.orderDate || '')}</dd></div>
                        <div><dt>결제상태</dt><dd>{d.order.paymentState}</dd></div>
                        <div><dt>주문금액</dt><dd>{won(d.order.orderAmount)} (상품 {won(d.order.goodsAmount)} · 배송 {won(d.order.deliveryCharge)})</dd></div>
                        {d.order.claimTypes?.length ? <div><dt>클레임</dt><dd>{d.order.claimTypes.join(', ')} (완료 여부 미확정)</dd></div> : null}
                      </dl>
                      <div className="cs-pop-order-items">{(d.order.items || []).map((it, i) => <div key={i} className="cs-pop-order-item">- {it.productName} / {it.quantity}개 / {won(it.amount)}</div>)}</div>
                    </>
                  ) : <p className="cs-dash-muted">연결된 주문이 없습니다. 주문번호 확인이 필요합니다.</p>}
                </div>
                <div className="cs-pop-sec">
                  <div className="cs-pop-sec-title">고객 정보 {d.customer?.isSynthetic && <span className="cs-badge warn">가상 고객(synthetic/fake)</span>}</div>
                  {d.customer ? (
                    <dl className="cs-pop-detail-list">
                      <div><dt>회원구분</dt><dd>{d.customer.memberType || '-'}</dd></div>
                      <div><dt>회원ID</dt><dd>{d.customer.memberId || '-'}</dd></div>
                      <div><dt>고객명</dt><dd>{d.customer.name || '-'}</dd></div>
                      <div><dt>연락처</dt><dd>{d.customer.phone || '-'}</dd></div>
                      <div><dt>이메일</dt><dd>{d.customer.email || '-'}</dd></div>
                      <div><dt>최근 주문</dt><dd>{d.customer.recentOrderCount ?? '-'}건</dd></div>
                    </dl>
                  ) : <p className="cs-dash-muted">연결된 고객 정보가 없습니다.</p>}
                </div>
                <div className="cs-pop-sec">
                  <div className="cs-pop-sec-title">처리 상태 / 메모</div>
                  <label className="cs-pop-memo-label">처리 단계</label>
                  <select className="cs-pop-stage" value={stage} onChange={(e) => setStageByItem((p) => ({ ...p, [id]: e.target.value }))}>{PROCESS_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                  <label className="cs-pop-memo-label">담당직원</label>
                  <input className="cs-pop-stage" type="text" list="cs-assignee-options" value={assignee} onChange={(e) => setAssigneeByItem((p) => ({ ...p, [id]: e.target.value }))} placeholder="담당직원 이름을 입력하세요 (미지정)" />
                  <datalist id="cs-assignee-options"><option value="CS팀장" /><option value="CS 담당자 A" /><option value="CS 담당자 B" /></datalist>
                  <label className="cs-pop-memo-label">내부 메모 (local · v0 미영속)</label>
                  <textarea className="cs-pop-memo" rows={2} value={memo[id] || ''} onChange={(e) => setMemo((p) => ({ ...p, [id]: e.target.value }))} placeholder="내부 확인 메모를 남겨보세요…" />
                  <div className="cs-pop-history">{history.map((h, i) => <div key={i} className="cs-pop-history-item">{h}</div>)}</div>
                </div>
                <div className="cs-pop-sec">
                  <div className="cs-pop-sec-title">AI 초안 / 응답 액션</div>
                  <div className="cs-pop-action-btns">
                    <button type="button" className="dept-refresh-btn" onClick={() => { setDraftOpen(true); setRegenDraft(null); }}>AI 초안 보기</button>
                    <button type="button" className="dept-refresh-btn" onClick={() => { setDraftOpen(true); setRegenDraft(genDraft(selected)); }}>AI 초안 다시 만들기</button>
                    <button type="button" className="dept-refresh-btn" onClick={() => setReplyOpen((v) => !v)}>직접 답변 작성</button>
                    {onCompleteItem && <button type="button" className="dept-refresh-btn cs-pop-complete-btn" onClick={() => runItemComplete(selected)}>처리 완료</button>}
                  </div>
                  <p className="cs-pop-actions-note">※ v0: 처리 완료는 로컬 이력으로 이동 — 실제 고도몰 등록은 WRITE 연결 후. 발송·전화·알림 없음.</p>
                  {doneNote && <p className="cs-pop-done-note">{doneNote}</p>}
                  {draftOpen && <div className="cs-pop-detail-draft"><div className="cs-pop-detail-draft-label">AI 초안 미리보기</div><pre className="cs-pop-draft-pre">{regenDraft ?? genDraft(selected)}</pre></div>}
                  {replyOpen && <div className="cs-pop-detail-draft"><div className="cs-pop-detail-draft-label">직접 답변 작성 (local · v0)</div><textarea className="cs-pop-memo" rows={3} value={replyByItem[id] || ''} onChange={(e) => setReplyByItem((p) => ({ ...p, [id]: e.target.value }))} placeholder="직접 답변을 작성하세요…" /></div>}
                </div>
              </>
            );
          })() : <p className="cs-dash-muted">항목을 선택하면 상세가 표시됩니다.</p>}
        </div>
      </div>
      {allowDraft && previews.length > 0 && (
        <div className="cs-pop-preview">
          <div className="cs-pop-preview-head">생성된 초안 미리보기 {previews.length}건 (발송/등록 안 함)</div>
          {previews.map((p, i) => <div key={i} className="cs-pop-preview-item"><div className="cs-pop-preview-label">{p.label}</div><pre className="cs-pop-draft-pre">{p.draft}</pre></div>)}
        </div>
      )}
    </PopupShell>
  );
};

// ── 처리완료 문의 팝업 ─────────────────────────────────────────────────────────
const CsResolvedPopup: React.FC<{ items: CsResolvedItem[]; onClose: () => void }> = ({ items, onClose }) => {
  const tabs = [
    { key: 'all', label: '전체', m: () => true },
    { key: 'pay', label: '결제·주문', m: (r: CsResolvedItem) => /결제|주문/.test(r.type) },
    { key: 'rc', label: '환불·취소', m: (r: CsResolvedItem) => /환불|취소|반품|교환/.test(r.type) },
    { key: 'dlv', label: '배송', m: (r: CsResolvedItem) => /배송/.test(r.type) },
    { key: 'prod', label: '상품', m: (r: CsResolvedItem) => /상품/.test(r.type) },
    { key: 'repeat', label: '반복문의', m: (r: CsResolvedItem) => !!r.followUp }
  ];
  const [active, setActive] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const tab = tabs.find((t) => t.key === active) || tabs[0];
  const list = items.filter(tab.m);
  const selected = list.find((r) => r.inquiryId === sel) || null;
  return (
    <PopupShell title="처리완료 문의" count={list.length} onClose={onClose}>
      <div className="cs-pop-tabs">{tabs.map((t) => <button key={t.key} type="button" className={`cs-pop-tab ${t.key === active ? 'active' : ''}`} onClick={() => { setActive(t.key); setSel(null); }}>{t.label} <span className="cs-pop-tab-n">{items.filter(t.m).length}</span></button>)}</div>
      <div className="cs-pop-body wide">
        <ul className="cs-pop-list">
          {list.length === 0 && <li className="cs-dash-muted">해당 항목이 없습니다.</li>}
          {list.map((r) => (
            <li key={r.inquiryId} className={`cs-pop-item ${csTypeColorClass(r.type)} ${sel === r.inquiryId ? 'active' : ''}`} onClick={() => setSel(r.inquiryId)}>
              <div className="cs-pop-item-main">
                <div className="cs-pop-item-title">{r.title} <span className="cs-badge muted">{r.type}</span> {r.localCompleted && <span className="cs-badge ok">방금 완료</span>} {r.followUp && <span className="cs-badge warn">반복문의</span>}</div>
                <div className="cs-pop-item-meta">{r.productName} · {r.customerLabel || r.orderNo || '주문 미상'} · 처리 {shortDate(r.processedAt || '')}{r.handledBy ? ` · ${r.handledBy}` : ''}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="cs-pop-detail">
          {selected ? (
            <>
              {/* 1. 처리완료 기본 정보 */}
              <div className="cs-pop-sec">
                <div className="cs-pop-sec-title">처리완료 기본 정보</div>
                <dl className="cs-pop-detail-list">
                  <div><dt>제목</dt><dd>{selected.title}</dd></div>
                  <div><dt>유형</dt><dd>{selected.type}</dd></div>
                  <div><dt>상품</dt><dd>{selected.productName}</dd></div>
                  <div><dt>주문번호</dt><dd>{selected.orderNo || '-'}</dd></div>
                  <div><dt>고객</dt><dd>{selected.customerLabel || selected.customer?.name || '미상'}</dd></div>
                  <div><dt>처리일</dt><dd>{shortDate(selected.processedAt || '')}</dd></div>
                  <div><dt>처리결과</dt><dd>{selected.result}</dd></div>
                  <div><dt>후속문의</dt><dd>{selected.followUp ? '있음(반복 고객)' : '없음'}</dd></div>
                  <div><dt>담당직원</dt><dd>{selected.handledBy || '미기록'}</dd></div>
                </dl>
              </div>
              {/* 2. 질문 내용 */}
              <div className="cs-pop-sec">
                <div className="cs-pop-sec-title">질문 내용</div>
                <div className="cs-pop-body-text">{selected.questionText || '문의 원문 없음'}</div>
              </div>
              {/* 3. 이전 답변 / 처리한 답변 */}
              <div className="cs-pop-sec">
                <div className="cs-pop-sec-title">{selected.localCompleted ? '처리한 답변' : '이전 답변'} {selected.localCompleted && <span className="cs-badge warn">WRITE 미연결</span>}</div>
                <div className="cs-pop-body-text">{selected.answerText || selected.prevAnswer || '이전 답변 원문 미연동'}</div>
              </div>
              {/* 4. 주문 정보 */}
              <div className="cs-pop-sec">
                <div className="cs-pop-sec-title">주문 정보</div>
                {selected.order?.matched ? (
                  <>
                    <dl className="cs-pop-detail-list">
                      <div><dt>주문번호</dt><dd>{selected.order.orderNo}</dd></div>
                      <div><dt>주문일</dt><dd>{shortDate(selected.order.orderDate || '')}</dd></div>
                      <div><dt>결제상태</dt><dd>{selected.order.paymentState}</dd></div>
                      <div><dt>주문금액</dt><dd>{won(selected.order.orderAmount)} (상품 {won(selected.order.goodsAmount)} · 배송 {won(selected.order.deliveryCharge)})</dd></div>
                      {selected.order.claimTypes?.length ? <div><dt>클레임</dt><dd>{selected.order.claimTypes.join(', ')}</dd></div> : null}
                    </dl>
                    <div className="cs-pop-order-items">{(selected.order.items || []).map((it, i) => <div key={i} className="cs-pop-order-item">- {it.productName} / {it.quantity}개 / {won(it.amount)}</div>)}</div>
                  </>
                ) : <p className="cs-dash-muted">연결된 주문이 없습니다.</p>}
              </div>
              {/* 5. 고객 정보 */}
              <div className="cs-pop-sec">
                <div className="cs-pop-sec-title">고객 정보 {selected.customer?.isSynthetic && <span className="cs-badge warn">가상 고객(synthetic/fake)</span>}</div>
                {selected.customer ? (
                  <dl className="cs-pop-detail-list">
                    <div><dt>회원ID</dt><dd>{selected.customer.memberId || '-'}</dd></div>
                    <div><dt>고객명</dt><dd>{selected.customer.name || '-'}</dd></div>
                    <div><dt>연락처</dt><dd>{selected.customer.phone || '-'}</dd></div>
                    <div><dt>이메일</dt><dd>{selected.customer.email || '-'}</dd></div>
                    <div><dt>최근 주문</dt><dd>{selected.customer.recentOrderCount ?? '-'}건</dd></div>
                  </dl>
                ) : <p className="cs-dash-muted">연결된 고객 정보가 없습니다.</p>}
              </div>
              {/* 6. 처리 기록 */}
              <div className="cs-pop-sec">
                <div className="cs-pop-sec-title">처리 기록</div>
                <dl className="cs-pop-detail-list">
                  <div><dt>처리단계</dt><dd>처리 완료</dd></div>
                  <div><dt>처리결과</dt><dd>{selected.result}</dd></div>
                  <div><dt>담당직원</dt><dd>{selected.handledBy || '미기록'}</dd></div>
                  {selected.completionMethod && <div><dt>처리방식</dt><dd>{selected.completionMethod === 'manual_reply' ? '직접 답변' : selected.completionMethod === 'ai_auto_batch' ? 'AI 자동처리(일괄)' : 'AI 초안'}</dd></div>}
                  {selected.localCompleted && <div><dt>등록상태</dt><dd>WRITE 미연결</dd></div>}
                  <div><dt>후속문의</dt><dd>{selected.followUp ? '있음' : '없음'}</dd></div>
                </dl>
              </div>
            </>
          ) : <p className="cs-dash-muted">항목을 선택하면 처리 이력이 표시됩니다.</p>}
        </div>
      </div>
    </PopupShell>
  );
};

// ── 고객관리 팝업 ──────────────────────────────────────────────────────────────
type ProfileTab = 'summary' | 'basic' | 'orders' | 'inqrev' | 'claims' | 'memo';
const PROFILE_TABS: Array<{ key: ProfileTab; label: string }> = [
  { key: 'summary', label: '요약' }, { key: 'basic', label: '기본정보' }, { key: 'orders', label: '주문내역' },
  { key: 'inqrev', label: '문의/리뷰' }, { key: 'claims', label: '클레임' }, { key: 'memo', label: '메모/관리상태' }
];
const kv = (label: string, value: React.ReactNode): React.ReactNode => <div><dt>{label}</dt><dd>{value}</dd></div>;
const opt = (v: React.ReactNode): React.ReactNode => (v === undefined || v === null || v === '' ? <span className="cs-dash-muted">미연동</span> : v);
const optBool = (v?: boolean): React.ReactNode => (v === undefined ? <span className="cs-dash-muted">미연동</span> : v ? '허용' : '미허용');

const CsCustomerProfilePopup: React.FC<{ items: CsCustomerProfileHubItem[]; onClose: () => void }> = ({ items, onClose }) => {
  const FTABS = [
    { key: 'all', label: '전체', m: () => true },
    { key: 'ri', label: '반복문의', m: (c: CsCustomerProfileHubItem) => c.tags.includes('반복문의') },
    { key: 'rc', label: '반복 환불·취소', m: (c: CsCustomerProfileHubItem) => c.tags.includes('반복 환불·취소') },
    { key: 'lr', label: '저평점 반복', m: (c: CsCustomerProfileHubItem) => c.tags.includes('저평점 반복') },
    { key: 'hv', label: '고액 고객', m: (c: CsCustomerProfileHubItem) => c.tags.includes('고액 고객') },
    { key: 'watch', label: '주의 고객', m: (c: CsCustomerProfileHubItem) => c.tags.includes('주의 고객') },
    { key: 'bl', label: '블랙리스트 후보', m: (c: CsCustomerProfileHubItem) => c.tags.includes('블랙리스트 후보') }
  ];
  const [active, setActive] = useState('all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [ptab, setPtab] = useState<ProfileTab>('summary');
  const [detail, setDetail] = useState<{ kind: string; id: string } | null>(null);
  const [memo, setMemo] = useState<Record<string, string>>({});
  const [watchTag, setWatchTag] = useState<Record<string, boolean>>({});
  const [blackTag, setBlackTag] = useState<Record<string, boolean>>({});

  const filterTab = FTABS.find((t) => t.key === active) || FTABS[0];
  const list = searchCustomerProfiles(items.filter(filterTab.m), query);
  const c = items.find((x) => x.memberKey === sel) || null;
  const openProfile = (key: string): void => { setSel(key); setPtab('summary'); setDetail(null); };
  const goDetail = (kind: string, id: string, tab: ProfileTab): void => { setPtab(tab); setDetail({ kind, id }); };

  return (
    <PopupShell title="고객관리" count={list.length} onClose={onClose}>
      <div className="cs-pop-tabs">
        {FTABS.map((t) => <button key={t.key} type="button" className={`cs-pop-tab ${t.key === active ? 'active' : ''}`} onClick={() => { setActive(t.key); setSel(null); }}>{t.label} <span className="cs-pop-tab-n">{items.filter(t.m).length}</span></button>)}
      </div>
      <div className="cs-pop-actions"><input className="cs-pop-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="고객명, ID, 연락처, 주문번호로 검색" /></div>
      <div className="cs-pop-body cs-pop-body-cust">
        <ul className="cs-pop-list">
          {list.length === 0 && <li className="cs-dash-muted">해당 고객이 없습니다.</li>}
          {list.map((x) => {
            const shown = x.tags.slice(0, 4);
            return (
              <li key={x.memberKey} className={`cs-pop-item type-customer ${x.summary.riskLevel === 'high' ? 'is-risk' : ''} ${sel === x.memberKey ? 'active' : ''}`} onClick={() => openProfile(x.memberKey)}>
                <div className="cs-pop-item-main">
                  <div className="cs-pop-item-title">{x.basic.name || x.basic.memberId || x.customerId} {x.isSynthetic && <span className="cs-badge warn">fake</span>} <span className={`cs-badge risk-${x.summary.riskLevel}`}>위험 {riskKo(x.summary.riskLevel)}</span></div>
                  <div className="cs-pop-item-meta">{x.basic.memberId || x.customerId}{x.basic.phone ? ` · ${x.basic.phone}` : ''}</div>
                  <div className="cs-pop-item-meta">주문 {x.summary.orderCount} · {won(x.summary.totalOrderAmount)} · 문의 {x.summary.inquiryCount} · 클레임 {x.summary.claimCount}</div>
                  <div className="cs-dash-badges">{shown.map((t, i) => <span key={i} className="cs-badge muted">{t}</span>)}{x.tags.length > 4 && <span className="cs-badge muted">+{x.tags.length - 4}</span>}</div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="cs-pop-detail">
          {!c ? <p className="cs-dash-muted">고객을 선택하면 프로필이 표시됩니다.</p> : (() => {
            const isWatch = watchTag[c.memberKey] ?? c.management.isCaution ?? false;
            const isBlack = blackTag[c.memberKey] ?? c.management.isBlacklistCandidate ?? false;
            return (
              <>
                <div className="cs-cust-header">
                  <div className="cs-cust-header-name">{c.basic.name || c.basic.memberId || c.customerId}</div>
                  <div className="cs-cust-header-sub">{c.basic.memberId || c.customerId} · {c.basic.memberType || '회원'} · 위험 {riskKo(c.summary.riskLevel)}</div>
                  <div className="cs-dash-badges">
                    {c.isSynthetic && <span className="cs-badge warn">fake/synthetic</span>}
                    {isWatch && <span className="cs-badge warn">주의 고객</span>}
                    {isBlack && <span className="cs-badge risk-high">블랙리스트 후보</span>}
                  </div>
                </div>
                <div className="cs-pop-tabs cs-prof-tabs">
                  {PROFILE_TABS.map((t) => <button key={t.key} type="button" className={`cs-pop-tab ${ptab === t.key ? 'active' : ''}`} onClick={() => { setPtab(t.key); setDetail(null); }}>{t.label}</button>)}
                </div>

                {ptab === 'summary' && (
                  <>
                    <div className="cs-pop-sec"><div className="cs-pop-sec-title">핵심 지표</div>
                      <div className="cs-cust-metrics">
                        <div className="cs-cust-metric"><span>총 주문</span><b>{c.summary.orderCount}건</b></div>
                        <div className="cs-cust-metric"><span>총 구매금액</span><b>{won(c.summary.totalOrderAmount)}</b></div>
                        <div className="cs-cust-metric"><span>최근1년</span><b>{won(c.summary.recentYearOrderAmount)}</b></div>
                        <div className="cs-cust-metric"><span>문의</span><b>{c.summary.inquiryCount}</b></div>
                        <div className="cs-cust-metric"><span>리뷰</span><b>{c.summary.reviewCount}</b></div>
                        <div className="cs-cust-metric"><span>클레임</span><b>{c.summary.claimCount}</b></div>
                        <div className="cs-cust-metric"><span>환불·취소</span><b>{c.summary.refundCancelCount}</b></div>
                        <div className="cs-cust-metric"><span>최근활동</span><b>{shortDate(c.summary.lastActivityAt || '') || '미연동'}</b></div>
                      </div>
                    </div>
                    <div className="cs-pop-sec"><div className="cs-pop-sec-title">최근 주문</div>
                      <div className="cs-pop-order-items">{c.orders.slice(0, 3).map((o) => <div key={o.orderNo} className="cs-pop-order-row" onClick={() => goDetail('order', o.orderNo, 'orders')}>- {o.orderNo} · {shortDate(o.orderDate || '')} · {won(o.amount)} · {(o.productNames || []).join(', ')}</div>)}{!c.orders.length && <span className="cs-dash-muted">없음</span>}</div>
                    </div>
                    <div className="cs-pop-sec"><div className="cs-pop-sec-title">최근 문의/리뷰</div>
                      <div className="cs-pop-order-items">
                        {c.inquiries.slice(0, 3).map((q) => <div key={q.inquiryId} className="cs-pop-order-row" onClick={() => goDetail('inquiry', q.inquiryId, 'inqrev')}>문의 · {q.title} · {q.type} · {shortDate(q.createdAt || '')} · {q.status}</div>)}
                        {c.reviews.slice(0, 3).map((r) => <div key={r.reviewId} className="cs-pop-order-row" onClick={() => goDetail('review', r.reviewId, 'inqrev')}>리뷰 · {r.productName} · {r.rating}점 · {shortDate(r.createdAt || '')}</div>)}
                        {!c.inquiries.length && !c.reviews.length && <span className="cs-dash-muted">없음</span>}
                      </div>
                    </div>
                    <div className="cs-pop-sec"><div className="cs-pop-sec-title">최근 클레임</div>
                      <div className="cs-pop-order-items">{c.claims.slice(0, 3).map((cl) => <div key={cl.claimId} className="cs-pop-order-row" onClick={() => goDetail('claim', cl.claimId, 'claims')}>{cl.type} · {cl.orderNo} · {cl.productName} · {shortDate(cl.createdAt || '')}</div>)}{!c.claims.length && <span className="cs-dash-muted">없음</span>}</div>
                    </div>
                  </>
                )}

                {ptab === 'basic' && (
                  <div className="cs-pop-sec"><div className="cs-pop-sec-title">회원 기본정보 {c.isSynthetic && <span className="cs-badge warn">가상 고객(synthetic/fake)</span>}</div>
                    <dl className="cs-pop-detail-list cs-cust-grid">
                      {kv('성명', opt(c.basic.name))}{kv('닉네임', opt(c.basic.nickname))}{kv('아이디', opt(c.basic.memberId))}
                      {kv('회원구분', opt(c.basic.memberType))}{kv('회원등급', opt(c.basic.memberGrade))}{kv('전화번호', opt(c.basic.phone))}
                      {kv('핸드폰', opt(c.basic.mobile))}{kv('이메일', opt(c.basic.email))}{kv('주소', opt(c.basic.address))}
                      {kv('생년월일', opt(c.basic.birthDate))}{kv('성별', opt(c.basic.gender))}{kv('가입일', opt(c.basic.joinDate))}
                      {kv('가입경로', opt(c.basic.joinPath))}{kv('최근접속', opt(c.basic.lastLoginAt))}{kv('로그인횟수', opt(c.basic.loginCount))}
                      {kv('SMS수신', optBool(c.basic.smsOptIn))}{kv('메일수신', optBool(c.basic.emailOptIn))}{kv('접속허용', optBool(c.basic.accessAllowed))}
                      {kv('적립금', opt(c.basic.rewardAmount))}{kv('포인트', opt(c.basic.pointAmount))}{kv('배송방법', opt(c.basic.deliveryMethod))}
                    </dl>
                    <p className="cs-pop-actions-note">※ v0: 회원정보 수정은 아직 고도몰에 반영되지 않습니다(WRITE 미연결).</p>
                  </div>
                )}

                {ptab === 'orders' && (
                  <div className="cs-pop-sec"><div className="cs-pop-sec-title">주문내역 ({c.orders.length})</div>
                    {c.orders.length ? c.orders.map((o) => (
                      <div key={o.orderNo} className={`cs-cust-row ${detail?.kind === 'order' && detail.id === o.orderNo ? 'active' : ''}`} onClick={() => setDetail({ kind: 'order', id: o.orderNo })}>
                        <div className="cs-cust-row-title">{o.orderNo} <span className="cs-badge muted">{o.paymentState}</span>{o.hasClaim && <span className="cs-badge warn">클레임</span>}</div>
                        <div className="cs-cust-row-meta">{shortDate(o.orderDate || '')} · {won(o.amount)} · {(o.productNames || []).join(', ')} ({o.itemCount}건)</div>
                        {detail?.kind === 'order' && detail.id === o.orderNo && (
                          <div className="cs-cust-detail">
                            <dl className="cs-pop-detail-list">
                              {kv('결제상태', o.paymentState)}{kv('배송상태', opt(o.deliveryState))}
                              {kv('주문금액', `${won(o.amount)} (상품 ${won(o.goodsAmount)} · 배송 ${won(o.deliveryCharge)})`)}
                              {o.claimTypes?.length ? kv('클레임', o.claimTypes.join(', ')) : null}
                            </dl>
                            <div className="cs-pop-order-items">{(o.items || []).map((it, i) => <div key={i} className="cs-pop-order-item">- {it.productName} / {it.quantity}개 / {won(it.amount)}</div>)}</div>
                            <p className="cs-pop-actions-note">송장/쿠폰/적립금: 미연동</p>
                          </div>
                        )}
                      </div>
                    )) : <p className="cs-dash-muted">주문 없음</p>}
                  </div>
                )}

                {ptab === 'inqrev' && (
                  <>
                    <div className="cs-pop-sec"><div className="cs-pop-sec-title">문의 ({c.inquiries.length})</div>
                      {c.inquiries.length ? c.inquiries.map((q) => (
                        <div key={q.inquiryId} className={`cs-cust-row ${detail?.kind === 'inquiry' && detail.id === q.inquiryId ? 'active' : ''}`} onClick={() => setDetail({ kind: 'inquiry', id: q.inquiryId })}>
                          <div className="cs-cust-row-title">{q.title} <span className="cs-badge muted">{q.type}</span> <span className="cs-badge muted">{q.status}</span>{q.isRepeat && <span className="cs-badge warn">반복</span>}</div>
                          <div className="cs-cust-row-meta">{q.productName} · {shortDate(q.createdAt || '')}{q.assignee ? ` · ${q.assignee}` : ''}</div>
                          {detail?.kind === 'inquiry' && detail.id === q.inquiryId && (
                            <div className="cs-cust-detail">
                              <div className="cs-pop-body-text">{q.bodyText || '문의 원문 없음'}</div>
                              <dl className="cs-pop-detail-list">
                                {kv('연결주문', opt(q.orderNo))}{kv('처리상태', q.status)}{kv('처리결과', opt(q.result))}
                                {kv('담당직원', q.assignee || '미기록')}{q.completedAt ? kv('처리일', shortDate(q.completedAt)) : null}
                                {q.completionMethod ? kv('처리방식', q.completionMethod === 'manual_reply' ? '직접 답변' : q.completionMethod === 'ai_auto_batch' ? 'AI 자동처리' : 'AI 초안') : null}
                                {q.writeStatus ? kv('등록상태', 'WRITE 미연결') : null}
                              </dl>
                              <div className="cs-pop-detail-draft-label">답변 내용</div>
                              <div className="cs-pop-body-text">{q.answerText || '답변 원문 미연동'}</div>
                            </div>
                          )}
                        </div>
                      )) : <p className="cs-dash-muted">문의 없음</p>}
                    </div>
                    <div className="cs-pop-sec"><div className="cs-pop-sec-title">리뷰 ({c.reviews.length})</div>
                      {c.reviews.length ? c.reviews.map((r) => (
                        <div key={r.reviewId} className={`cs-cust-row ${detail?.kind === 'review' && detail.id === r.reviewId ? 'active' : ''}`} onClick={() => setDetail({ kind: 'review', id: r.reviewId })}>
                          <div className="cs-cust-row-title">{r.productName} <span className="cs-badge type-review">{'★'.repeat(Math.max(0, Math.min(5, r.rating || 0)))} {r.rating}점</span> <span className="cs-badge muted">{r.replyStatus}</span></div>
                          <div className="cs-cust-row-meta">{sentimentKo(r.sentiment || '')} · {shortDate(r.createdAt || '')}</div>
                          {detail?.kind === 'review' && detail.id === r.reviewId && (
                            <div className="cs-cust-detail">
                              <div className="cs-pop-body-text">{r.bodyText || '리뷰 원문 없음'}</div>
                              <div className="cs-pop-detail-draft-label">답글</div>
                              <div className="cs-pop-body-text">{r.replyText || '답글 원문 미연동'}</div>
                              <dl className="cs-pop-detail-list">{kv('담당직원', r.assignee || '미기록')}{r.completedAt ? kv('처리일', shortDate(r.completedAt)) : null}</dl>
                            </div>
                          )}
                        </div>
                      )) : <p className="cs-dash-muted">리뷰 없음</p>}
                    </div>
                  </>
                )}

                {ptab === 'claims' && (
                  <div className="cs-pop-sec"><div className="cs-pop-sec-title">클레임 ({c.claims.length})</div>
                    {c.claims.length ? c.claims.map((cl) => (
                      <div key={cl.claimId} className={`cs-cust-row ${detail?.kind === 'claim' && detail.id === cl.claimId ? 'active' : ''}`} onClick={() => setDetail({ kind: 'claim', id: cl.claimId })}>
                        <div className="cs-cust-row-title">{cl.type} <span className="cs-badge muted">{cl.orderNo}</span>{cl.isRepeat && <span className="cs-badge warn">반복</span>}</div>
                        <div className="cs-cust-row-meta">{cl.productName} · {shortDate(cl.createdAt || '')} · {cl.status}</div>
                        {detail?.kind === 'claim' && detail.id === cl.claimId && (
                          <div className="cs-cust-detail">
                            <dl className="cs-pop-detail-list">
                              {kv('클레임 유형', cl.type)}{kv('관련 주문', cl.orderNo)}{kv('상품', cl.productName)}
                              {kv('처리상태', cl.status)}{kv('처리결과', opt(cl.result))}{kv('담당직원', cl.assignee || '미기록')}
                            </dl>
                          </div>
                        )}
                      </div>
                    )) : <p className="cs-dash-muted">클레임 없음</p>}
                  </div>
                )}

                {ptab === 'memo' && (
                  <div className="cs-pop-sec"><div className="cs-pop-sec-title">메모 / 관리상태 (local · v0)</div>
                    <div className="cs-pop-action-btns">
                      <button type="button" className="dept-refresh-btn" onClick={() => setWatchTag((p) => ({ ...p, [c.memberKey]: !isWatch }))}>{isWatch ? '✓ 주의 고객' : '주의 고객으로 표시'}</button>
                      <button type="button" className="dept-refresh-btn" onClick={() => setBlackTag((p) => ({ ...p, [c.memberKey]: !isBlack }))}>{isBlack ? '✓ 블랙리스트 후보' : '블랙리스트 후보로 표시'}</button>
                    </div>
                    <textarea className="cs-pop-memo" rows={3} value={memo[c.memberKey] || ''} onChange={(e) => setMemo((p) => ({ ...p, [c.memberKey]: e.target.value }))} placeholder="고객 관리 메모…" />
                    <dl className="cs-pop-detail-list">
                      {kv('관리 태그', c.tags.length ? c.tags.join(', ') : '없음')}
                      {kv('writeTarget', `${c.management.writeTargets.memberUpdate.targetType} / ${c.management.writeTargets.memberMemo.targetType} / ${c.management.writeTargets.blacklistFlag.targetType}`)}
                      {kv('등록상태', 'local_only (WRITE 미연결)')}
                    </dl>
                    <p className="cs-pop-actions-note">※ v0: 현재는 로컬 표시/메모만 — 실제 고도몰 회원정보·메모·블랙리스트 반영은 WRITE 연결 후 활성화됩니다.</p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </PopupShell>
  );
};

// ── 메인 ──────────────────────────────────────────────────────────────────────
export const CsTeamDashboard: React.FC<CsTeamDashboardProps> = ({ revenue, goodsNames, loading, onRefresh }) => {
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  // CS Work Completion Flow v0 — 세션 local 완료 이력(미처리/AI함 → 처리완료).
  const [completed, setCompleted] = useState<CsCompletedWorkItem[]>([]);

  const facts = useMemo<CsDashboardFacts | null>(() => {
    if (!revenue?.universeAux) return null;
    return buildCsDashboardFacts({ inquiries: revenue.universeAux.inquiries || [], reviews: revenue.universeAux.reviews || [], orders: revenue.orders || [], goodsNames });
  }, [revenue, goodsNames]);

  const wf = useMemo<CsAdminWorkflowFacts | null>(() => {
    if (!revenue?.universeAux) return null;
    return buildCsAdminWorkflow({
      inquiries: revenue.universeAux.inquiries || [], reviews: revenue.universeAux.reviews || [], orders: revenue.orders || [],
      contacts: (revenue.universeAux.csOnlyFakeContacts || []) as CsDashContact[], goodsNames
    });
  }, [revenue, goodsNames]);

  if (!facts || !wf) {
    return (
      <div className="cs-dash-empty">
        <p>CS 데이터가 아직 없습니다. 데이터를 불러오면 처리판이 표시됩니다.</p>
        <button type="button" className="dept-refresh-btn" onClick={onRefresh} disabled={loading}>{loading ? '불러오는 중…' : '데이터 불러오기'}</button>
      </div>
    );
  }

  const orders = revenue?.orders || [];
  const contacts = (revenue?.universeAux?.csOnlyFakeContacts || []) as CsDashContact[];
  // 고객 프로필 허브 — completed(세션 완료 이력) 병합. CS UI 경로라 contacts(PII) 포함.
  const customerHub = buildCsCustomerProfileHub({
    inquiries: revenue?.universeAux?.inquiries || [], reviews: revenue?.universeAux?.reviews || [], orders,
    contacts, completed, goodsNames
  });

  const UNRES_TABS: PopupTab[] = [
    { key: 'all', label: '전체', match: () => true },
    { key: 'pay', label: '결제·주문', match: (i) => i.kind === 'inquiry' && i.topic === 'payment' },
    { key: 'rc', label: '환불·취소', match: (i) => i.kind === 'inquiry' && ['refund', 'cancel', 'return', 'exchange'].includes(i.topic) },
    { key: 'dlv', label: '배송', match: (i) => i.kind === 'inquiry' && i.topic === 'delivery' },
    { key: 'prod', label: '상품', match: (i) => i.kind === 'inquiry' && i.topic === 'product' },
    { key: 'etc', label: '일반', match: (i) => i.kind === 'inquiry' && !['payment', 'refund', 'cancel', 'return', 'exchange', 'delivery', 'product'].includes(i.topic) },
    { key: 'ai', label: 'AI초안가능', match: (i) => i.aiProcessable },
    { key: 'int', label: '내부확인', match: (i) => i.needsInternalCheck },
    { key: 'hold', label: '보류', match: (i) => /hold|보류/i.test((i as CsKpiInquiryItem).status || '') }
  ];
  const AI_TABS: PopupTab[] = [
    { key: 'all', label: '전체', match: () => true },
    { key: 'rev', label: '리뷰답글', match: (i) => i.kind === 'review' },
    { key: 'dlv', label: '배송안내', match: (i) => i.kind === 'inquiry' && i.topic === 'delivery' }
  ];

  const u = wf.unresolved, r = wf.resolved, a = wf.aiAuto, cs = wf.customers;

  // 완료된 originalId는 미처리/AI함에서 제외, 처리완료에는 prepend.
  const completedIds = completedOriginalIdSet(completed);
  const unresolvedItems = u.items.filter((i) => !completedIds.has(i.inquiryId));
  const aiAutoItems = a.items.filter((i) => !completedIds.has(itemId(i)));
  const resolvedItems = [...completed.map(toResolvedItem), ...r.items];

  const nowIso = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const handleCompleteItem = (item: CsKpiItem, payload: { answerText: string; assignee?: string; method: CsCompletionMethod }): void => {
    const d = buildCsDetailItem(item, { orders, contacts, goodsNames });
    const built = buildCompletedWorkItem({
      sourceType: 'inquiry', originalId: itemId(item), title: item.kind === 'inquiry' ? item.title : `${item.productName} 리뷰`,
      type: item.topicKo, productName: item.productName, orderNo: item.orderNo, originalText: d.bodyText,
      answerText: payload.answerText, assignee: payload.assignee, completedAt: nowIso(), completionMethod: payload.method,
      order: d.order, customer: d.customer
    });
    setCompleted((prev) => addCompletedWorkItems(prev, [built]));
  };
  const handleCompleteBatch = (entries: Array<{ item: CsKpiItem; draft: string }>): void => {
    const builds = entries.map(({ item, draft }) => {
      const sourceType: CsCompletionSource = item.kind === 'review' ? 'review' : 'delivery';
      const d = buildCsDetailItem(item, { orders, contacts, goodsNames });
      return buildCompletedWorkItem({
        sourceType, originalId: itemId(item), title: item.kind === 'review' ? `${item.productName} 리뷰` : item.title,
        type: item.kind === 'review' ? '리뷰' : item.topicKo, productName: item.productName, orderNo: item.orderNo, originalText: d.bodyText,
        answerText: draft, completedAt: nowIso(), completionMethod: 'ai_auto_batch', order: d.order, customer: d.customer
      });
    });
    setCompleted((prev) => addCompletedWorkItems(prev, builds));
  };

  const unresolvedSub = `AI초안 ${unresolvedItems.filter((i) => i.aiProcessable).length} · 내부확인 ${unresolvedItems.filter((i) => i.needsInternalCheck).length} · 보류 ${u.byStage.hold}`;
  const resolvedSub = `로컬완료 ${completed.length} · 최근7일 ${r.last7d} · 반복 ${r.repeat}`;
  const aiSub = `리뷰 ${aiAutoItems.filter((i) => i.kind === 'review').length} · 배송 ${aiAutoItems.filter((i) => i.kind === 'inquiry').length}`;
  const custSub = `반복문의 ${cs.byTag.repeatInquiry} · 클레임반복 ${cs.byTag.repeatClaim} · 고액 ${cs.byTag.highValue} · 주의 ${cs.byTag.watch}`;

  return (
    <div className="cs-dash">
      <div className="cs-dash-head">
        <h2 className="dept-dashboard-title"><span className="dept-team-emoji">💬</span>CS팀 처리판</h2>
        <p className="dept-dashboard-desc">관리자 업무 흐름 기준. (Commerce Universe safe data · 고객정보는 CS 처리 화면에서만 표시)</p>
      </div>

      <div className="dept-card-grid cs-dash-kpi-grid">
        <KpiCard label="미처리 문의" value={unresolvedItems.length} unit="건" sub={unresolvedSub} icon="✉️" accent="#31D6C4" onClick={() => setOpenKpi('unresolved')} />
        <KpiCard label="처리완료 문의" value={r.count + completed.length} unit="건" sub={resolvedSub} icon="✅" accent="#5B7DB1" onClick={() => setOpenKpi('resolved')} />
        <KpiCard label="AI 자동처리함" value={aiAutoItems.length} unit="건" sub={aiSub} icon="🤖" accent="#FBBF24" onClick={() => setOpenKpi('ai')} />
        <KpiCard label="고객관리" value={cs.count} unit="명" sub={custSub} icon="👤" accent="#2DD4BF" onClick={() => setOpenKpi('customers')} />
      </div>
      <p className="cs-dash-kpi-note">미처리=지금 처리할 문의 · 처리완료=과거 이력 조회 · AI 자동처리함=리뷰·배송 저위험 일괄(운영자 등록 트리거) · 고객관리=고객 단위 이력</p>

      <section className="cs-dash-section">
        <h3 className="cs-dash-section-title">🧭 우선 처리 문의</h3>
        {facts.priorityInquiries.length ? <ul className="cs-dash-pri-list">{facts.priorityInquiries.map((q) => <PriorityRow key={q.inquiryId || q.rank} q={q} />)}</ul> : <p className="cs-dash-muted">처리할 문의가 없습니다.</p>}
      </section>

      <div className="cs-dash-two-col">
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">⚠️ 주의 리뷰</h3>
          <p className="cs-dash-section-desc">저평점·부정 감성·상품 불만 신호</p>
          {facts.lowRatingReviews.length ? <ul className="cs-dash-rev-list">{facts.lowRatingReviews.map((rv, i) => <ReviewRow key={i} r={rv} />)}</ul> : <p className="cs-dash-muted">주의 리뷰가 없습니다.</p>}
        </section>
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">📦 CS 이슈 상품</h3>
          <p className="cs-dash-section-desc">문의·리뷰 이슈가 반복되는 상품</p>
          {facts.issueProducts.length ? <ul className="cs-dash-issue-list">{facts.issueProducts.map((p) => <IssueRow key={p.goodsNo} p={p} />)}</ul> : <p className="cs-dash-muted">이슈 상품이 없습니다.</p>}
        </section>
      </div>

      <div className="cs-dash-hint">
        <span className="cs-dash-hint-label">우측 CS팀장에게 이렇게 물어보세요</span>
        <div className="cs-dash-hint-list">{wf.chatHints.map((h, i) => <span key={i} className="cs-dash-hint-chip">{h}</span>)}</div>
      </div>

      {openKpi === 'unresolved' && <CsItemPopup title="미처리 문의" items={unresolvedItems} tabs={UNRES_TABS} allowDraft={false} allowRegister={false} orders={orders} contacts={contacts} goodsNames={goodsNames} onClose={() => setOpenKpi(null)} onCompleteItem={handleCompleteItem} />}
      {openKpi === 'ai' && <CsItemPopup title="AI 자동처리함 (리뷰·배송)" items={aiAutoItems} tabs={AI_TABS} allowDraft allowRegister orders={orders} contacts={contacts} goodsNames={goodsNames} onClose={() => setOpenKpi(null)} onCompleteBatch={handleCompleteBatch} />}
      {openKpi === 'resolved' && <CsResolvedPopup items={resolvedItems} onClose={() => setOpenKpi(null)} />}
      {openKpi === 'customers' && <CsCustomerProfilePopup items={customerHub.items} onClose={() => setOpenKpi(null)} />}
    </div>
  );
};
