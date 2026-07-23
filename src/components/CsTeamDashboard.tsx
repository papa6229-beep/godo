import React, { useEffect, useMemo, useState } from 'react';
import './CsTeamDashboard.css';
import { inquiryStatusKo, isOnHold } from '../services/inquiryStatusContract';
import type { RevenueResult } from '../services/departmentDataService';
import { classifyResource, userLabelOf, type ProvenanceKind } from '../services/dataSourceProvenanceContract';
import { screenStateFromRevenue } from '../services/revenueScreenState';
import { composeCsDraftFromOrders } from '../services/csDraftComposer';
import {
  buildCsAdminWorkflow,
  buildCsDetailItem,
  csTopicKo,
  csTypeColorClass,
  type CsAdminWorkflowFacts,
  type CsKpiItem,
  type CsKpiInquiryItem,
  type CsKpiReviewItem,
  type CsResolvedItem,
  type CsDashContact
} from '../services/csTeamDashboardFacts';
import { buildCsCustomerProfileHub, searchCustomerProfiles, type CsCustomerProfileHubItem } from '../services/csCustomerManagementFacts';
import { buildCsDashboardStatistics, type CsDashboardStatistics } from '../services/csDashboardStatistics';
import { filterCsInputsByTime, isValidCustomRange, CS_TIME_RANGES, type CsTimeRange, type CsCustomRange } from '../services/csDashboardTimeFilter';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import {
  typeSliceToIntent, workflowStepToIntent, aiMetricToIntent, riskCardToIntent, riskCustomerToIntent, issueProductToIntent,
  type CsPopupIntent
} from '../services/csDashboardInteractions';
import {
  buildCsApprovalItem,
  addCsApprovalItems,
  approveCsApprovalItem,
  rejectCsApprovalItem,
  csApprovalStatusByOriginalId,
  type CsApprovalQueueItem,
  type CsApprovalSourceType,
  type CsApprovalStatus,
  type CsApprovalMethod
} from '../services/csApprovalQueueBridge';
import { loadCsPersistedState, saveCsPersistedState, clearCsPersistedState } from '../services/csLocalStatePersistence';
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


// C-4: 문의 상태 라벨은 공통 계약(inquiryStatusContract)의 단일 정의를 사용(내부 영문키 미노출).
const statusKo = (s: string): string => inquiryStatusKo(s);
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

// 카운터 애니메이션 표시 숫자(정수/소수). 레이아웃 흔들림 방지(tabular-nums).
const AnimatedNumber: React.FC<{ value: number; decimals?: number; suffix?: string }> = ({ value, decimals = 0, suffix = '' }) => {
  const v = useAnimatedNumber(value, { decimals });
  return <span className="cs-num">{decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString()}{suffix}</span>;
};

const KpiCard: React.FC<{ label: string; value: number; unit: string; sub: string; icon: string; accent: string; onClick: () => void }>
  = ({ label, value, unit, sub, icon, accent, onClick }) => {
    const v = useAnimatedNumber(value);
    return (
      <button type="button" className="dept-stat-card cs-dash-kpi cs-dash-kpi-btn" style={{ borderTopColor: accent }} onClick={onClick}>
        <div className="dept-stat-head"><span className="dept-stat-icon">{icon}</span><span>{label}</span></div>
        <div className="dept-stat-value cs-num" style={{ color: accent }}>{Math.round(v).toLocaleString()}{unit}</div>
        <div className="cs-dash-kpi-sub">{sub}</div>
        <span className="cs-dash-kpi-more">클릭하여 열기 →</span>
      </button>
    );
  };


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
  onRequestApproval?: (item: CsKpiItem, payload: { answerText: string; assignee?: string; method: CsCompletionMethod }) => void;
  onRequestApprovalBatch?: (entries: Array<{ item: CsKpiItem; draft: string }>) => void;
  approvalStatus?: Record<string, CsApprovalStatus>;
  assigneeByItem: Record<string, string>;
  setAssigneeByItem: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  memoByItem: Record<string, string>;
  setMemoByItem: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  initialTab?: string;
}> = ({ title, items, tabs, allowDraft, allowRegister, orders, contacts, goodsNames, onClose, onCompleteItem, onCompleteBatch, onRequestApproval, onRequestApprovalBatch, approvalStatus, assigneeByItem, setAssigneeByItem, memoByItem, setMemoByItem, initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab && tabs.some((t) => t.key === initialTab) ? initialTab : (tabs[0]?.key || 'all'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const memo = memoByItem; const setMemo = setMemoByItem;
  const [stageByItem, setStageByItem] = useState<Record<string, string>>({});
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
  // 승인요청(미처리 단건): 작성된 답변/초안을 Approval Queue로.
  const runItemApproval = (item: CsKpiItem): void => {
    if (!onRequestApproval) return;
    const id = itemId(item);
    const manual = (replyByItem[id] || '').trim();
    const answerText = manual || genDraft(item);
    if (!answerText) { setDoneNote('답변 내용 또는 AI 초안이 필요합니다.'); return; }
    onRequestApproval(item, { answerText, assignee: assigneeByItem[id] || undefined, method: manual ? 'manual_reply' : 'ai_draft' });
    setDoneNote('승인요청되었습니다. 승인 큐에서 검수할 수 있습니다.');
  };
  // 승인요청(AI함 배치): draft 있는 리뷰/배송만.
  const runBatchApproval = (list: CsKpiItem[]): void => {
    if (!onRequestApprovalBatch) return;
    const entries = list.map((i) => ({ item: i, draft: genDraft(i) }))
      .filter(({ item, draft }) => isAiAutoCompletable(item.kind === 'review' ? 'review' : 'delivery', draft));
    if (!entries.length) { setDoneNote('승인요청할 초안 대상이 없습니다.'); return; }
    onRequestApprovalBatch(entries);
    setDoneNote(`${entries.length}건 승인요청되었습니다. 승인 큐에서 검수할 수 있습니다.`);
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
          {allowRegister && onRequestApprovalBatch && <>
            <button type="button" className="dept-refresh-btn cs-pop-complete-btn" onClick={() => runBatchApproval(filtered.filter((i) => checked[itemId(i)]))}>선택 승인요청</button>
            <button type="button" className="dept-refresh-btn cs-pop-complete-btn" onClick={() => runBatchApproval(filtered)}>전체 승인요청</button>
          </>}
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
                    {approvalStatus?.[id] === 'pending_approval' && <span className="cs-badge warn">승인 대기</span>}
                    {approvalStatus?.[id] === 'approved_local' && <span className="cs-badge ok">승인됨</span>}
                    {approvalStatus?.[id] === 'rejected' && <span className="cs-badge risk-high">반려됨</span>}
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
                    {onRequestApproval && <button type="button" className="dept-refresh-btn cs-pop-complete-btn" onClick={() => runItemApproval(selected)}>승인요청</button>}
                    {onCompleteItem && <button type="button" className="dept-refresh-btn" onClick={() => runItemComplete(selected)}>처리 완료</button>}
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
const CsResolvedPopup: React.FC<{ items: CsResolvedItem[]; initialTab?: string; onClose: () => void }> = ({ items, initialTab, onClose }) => {
  const tabs = [
    { key: 'all', label: '전체', m: () => true },
    { key: 'pay', label: '결제·주문', m: (r: CsResolvedItem) => /결제|주문/.test(r.type) },
    { key: 'rc', label: '환불·취소', m: (r: CsResolvedItem) => /환불|취소|반품|교환/.test(r.type) },
    { key: 'dlv', label: '배송', m: (r: CsResolvedItem) => /배송/.test(r.type) },
    { key: 'prod', label: '상품', m: (r: CsResolvedItem) => /상품/.test(r.type) },
    { key: 'ai', label: 'AI 처리완료', m: (r: CsResolvedItem) => !!r.localCompleted && /ai/.test(r.completionMethod || '') },
    { key: 'repeat', label: '반복문의', m: (r: CsResolvedItem) => !!r.followUp }
  ];
  const [active, setActive] = useState(initialTab && tabs.some((t) => t.key === initialTab) ? initialTab : 'all');
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

const CsCustomerProfilePopup: React.FC<{
  items: CsCustomerProfileHubItem[];
  memo: Record<string, string>; setMemo: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  watchTag: Record<string, boolean>; setWatchTag: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  blackTag: Record<string, boolean>; setBlackTag: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  initialFilter?: string; initialCustomerKey?: string;
  onClose: () => void;
}> = ({ items, memo, setMemo, watchTag, setWatchTag, blackTag, setBlackTag, initialFilter, initialCustomerKey, onClose }) => {
  const FTABS = [
    { key: 'all', label: '전체', m: () => true },
    { key: 'ri', label: '반복문의', m: (c: CsCustomerProfileHubItem) => c.tags.includes('반복문의') },
    { key: 'rc', label: '반복 환불·취소', m: (c: CsCustomerProfileHubItem) => c.tags.includes('반복 환불·취소') },
    { key: 'lr', label: '저평점 반복', m: (c: CsCustomerProfileHubItem) => c.tags.includes('저평점 반복') },
    { key: 'hv', label: '고액 고객', m: (c: CsCustomerProfileHubItem) => c.tags.includes('고액 고객') },
    { key: 'watch', label: '주의 고객', m: (c: CsCustomerProfileHubItem) => c.tags.includes('주의 고객') },
    { key: 'bl', label: '블랙리스트 후보', m: (c: CsCustomerProfileHubItem) => c.tags.includes('블랙리스트 후보') }
  ];
  const [active, setActive] = useState(initialFilter || 'all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(initialCustomerKey || null);
  const [ptab, setPtab] = useState<ProfileTab>('summary');
  const [detail, setDetail] = useState<{ kind: string; id: string } | null>(null);

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

// ── CS 승인 큐 팝업(HITL) ──────────────────────────────────────────────────────
const CsApprovalQueuePopup: React.FC<{
  items: CsApprovalQueueItem[];
  initialTab?: 'all' | 'pending' | 'approved' | 'rejected';
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
  onClose: () => void;
}> = ({ items, initialTab, onApprove, onReject, onClose }) => {
  const tabs = [
    { key: 'all', label: '전체', m: () => true },
    { key: 'pending', label: '승인 대기', m: (x: CsApprovalQueueItem) => x.status === 'pending_approval' },
    { key: 'approved', label: '승인됨', m: (x: CsApprovalQueueItem) => x.status === 'approved_local' },
    { key: 'rejected', label: '반려됨', m: (x: CsApprovalQueueItem) => x.status === 'rejected' }
  ];
  const [active, setActive] = useState<string>(initialTab || 'pending');
  const [sel, setSel] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const tab = tabs.find((t) => t.key === active) || tabs[0];
  const list = items.filter(tab.m);
  const s = list.find((x) => x.id === sel) || null;
  const typeKo = (t: string): string => (t === 'review_reply' ? '리뷰 답글' : t === 'delivery_reply' ? '배송안내' : '문의 답변');
  const statusKoA = (st: string): string => (st === 'approved_local' ? '승인됨(WRITE 대기)' : st === 'rejected' ? '반려됨' : '승인 대기');
  return (
    <PopupShell title="CS 승인 큐 (HITL)" count={list.length} onClose={onClose}>
      <div className="cs-pop-tabs">{tabs.map((t) => <button key={t.key} type="button" className={`cs-pop-tab ${t.key === active ? 'active' : ''}`} onClick={() => { setActive(t.key); setSel(null); }}>{t.label} <span className="cs-pop-tab-n">{items.filter(t.m).length}</span></button>)}</div>
      <div className="cs-pop-body wide">
        <ul className="cs-pop-list">
          {list.length === 0 && <li className="cs-dash-muted">해당 항목이 없습니다.</li>}
          {list.map((x) => (
            <li key={x.id} className={`cs-pop-item ${sel === x.id ? 'active' : ''}`} onClick={() => setSel(x.id)}>
              <div className="cs-pop-item-main">
                <div className="cs-pop-item-title">{x.title} <span className="cs-badge muted">{typeKo(x.sourceType)}</span> <span className={`cs-badge ${x.status === 'approved_local' ? 'ok' : x.status === 'rejected' ? 'risk-high' : 'warn'}`}>{statusKoA(x.status)}</span></div>
                <div className="cs-pop-item-meta">{x.target.productName || '상품미상'}{x.target.orderNo ? ` · ${x.target.orderNo}` : ''}{x.context.assignee ? ` · ${x.context.assignee}` : ''}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="cs-pop-detail">
          {s ? (
            <>
              <div className="cs-pop-sec">
                <div className="cs-pop-sec-title">검수 정보 <span className="cs-badge muted">CS 답변</span></div>
                <dl className="cs-pop-detail-list">
                  {kv('유형', typeKo(s.sourceType))}{kv('제목', s.title)}{kv('상품', opt(s.target.productName))}
                  {kv('주문번호', opt(s.target.orderNo))}{kv('고객', opt(s.target.memberId || s.target.customerId))}
                  {kv('담당직원', s.context.assignee || '미기록')}{kv('처리방식', opt(s.context.completionMethod))}
                  {kv('상태', statusKoA(s.status))}{kv('등록상태', 'WRITE 미연결')}
                </dl>
                {s.context.originalText && <><div className="cs-pop-detail-draft-label">원문 요약</div><div className="cs-pop-body-text">{s.context.originalText}</div></>}
                <div className="cs-pop-detail-draft-label">답변 초안</div>
                <div className="cs-pop-body-text">{s.answerText}</div>
              </div>
              <div className="cs-pop-sec">
                <div className="cs-pop-sec-title">승인 / 반려</div>
                {s.status === 'pending_approval' ? (
                  <>
                    <div className="cs-pop-action-btns">
                      <button type="button" className="dept-refresh-btn cs-pop-complete-btn" onClick={() => onApprove(s.id)}>승인</button>
                      <button type="button" className="dept-refresh-btn" onClick={() => onReject(s.id, reason[s.id])}>반려</button>
                    </div>
                    <textarea className="cs-pop-memo" rows={2} value={reason[s.id] || ''} onChange={(e) => setReason((p) => ({ ...p, [s.id]: e.target.value }))} placeholder="반려 사유(선택)…" />
                  </>
                ) : <p className="cs-dash-muted">{statusKoA(s.status)}{s.rejectReason ? ` · 사유: ${s.rejectReason}` : ''}</p>}
                <p className="cs-pop-actions-note">※ v0: 승인 상태만 변경됩니다. 실제 고도몰 등록은 WRITE 연결 후 활성화됩니다.</p>
              </div>
            </>
          ) : <p className="cs-dash-muted">항목을 선택하면 검수 정보가 표시됩니다.</p>}
        </div>
      </div>
    </PopupShell>
  );
};

// ── CS 이슈 상품 상세 팝업(통계 클릭 진입) ────────────────────────────────────
const CsIssueProductPopup: React.FC<{
  goodsNo: string; productName: string;
  inquiries: CsKpiInquiryItem[] | Array<{ inquiryId?: string; goodsNo?: string; topic?: string; title?: string; status?: string; createdAt?: string; excerpt?: string }>;
  reviews: Array<{ reviewId?: string; goodsNo?: string; rating?: number; sentiment?: string; createdAt?: string; excerpt?: string }>;
  orders: RevenueResult['orders'];
  goodsNames: Record<string, string>;
  onClose: () => void;
}> = ({ goodsNo, productName, inquiries, reviews, orders, onClose }) => {
  const relInq = (inquiries as Array<{ inquiryId?: string; goodsNo?: string; topic?: string; title?: string; status?: string; createdAt?: string; excerpt?: string }>).filter((q) => q.goodsNo === goodsNo);
  const relRev = reviews.filter((r) => r.goodsNo === goodsNo);
  const relClaims = (orders || []).filter((o) => (o.claim?.hasClaim || o.canceled) && (o.lines || []).some((l) => l.goodsNo === goodsNo));
  return (
    <PopupShell title={`CS 이슈 상품: ${productName}`} count={relInq.length + relRev.length + relClaims.length} onClose={onClose}>
      <div className="cs-pop-body wide">
        <div className="cs-pop-list">
          <div className="cs-pop-sec">
            <div className="cs-pop-sec-title">요약</div>
            <dl className="cs-pop-detail-list">{kv('상품', productName)}{kv('문의', relInq.length)}{kv('리뷰 이슈', relRev.filter((r) => (r.rating ?? 5) <= 2 || /negative|부정/i.test(r.sentiment || '')).length)}{kv('클레임', relClaims.length)}</dl>
            <span className="cs-badge warn">상품관리팀 전달 후보</span>
            <p className="cs-pop-actions-note">※ v0: 전달 후보 표시만 — 실제 handoff 생성은 하지 않습니다.</p>
          </div>
        </div>
        <div className="cs-pop-detail">
          <div className="cs-pop-sec"><div className="cs-pop-sec-title">관련 문의 ({relInq.length})</div>
            <div className="cs-pop-order-items">{relInq.length ? relInq.map((q, i) => <div key={q.inquiryId || i} className="cs-pop-order-item">{q.title || csTopicKo(q.topic)} · {statusKo(q.status || '')} · {shortDate(q.createdAt || '')} · {q.excerpt || ''}</div>) : <span className="cs-dash-muted">없음</span>}</div>
          </div>
          <div className="cs-pop-sec"><div className="cs-pop-sec-title">관련 리뷰 ({relRev.length})</div>
            <div className="cs-pop-order-items">{relRev.length ? relRev.map((r, i) => <div key={r.reviewId || i} className="cs-pop-order-item">{r.rating}점 · {sentimentKo(r.sentiment || '')} · {shortDate(r.createdAt || '')} · {r.excerpt || ''}</div>) : <span className="cs-dash-muted">없음</span>}</div>
          </div>
          <div className="cs-pop-sec"><div className="cs-pop-sec-title">관련 클레임 ({relClaims.length})</div>
            <div className="cs-pop-order-items">{relClaims.length ? relClaims.map((o) => <div key={o.orderNo} className="cs-pop-order-item">{o.orderNo} · {(o.claim?.claimTypes || (o.canceled ? ['cancel'] : [])).join(', ')} · {shortDate(o.orderDate || '')}</div>) : <span className="cs-dash-muted">없음</span>}</div>
          </div>
        </div>
      </div>
    </PopupShell>
  );
};

// ── 메인 ──────────────────────────────────────────────────────────────────────
export const CsTeamDashboard: React.FC<CsTeamDashboardProps> = ({ revenue, goodsNames, loading, onRefresh }) => {
  // CS Dashboard Interactive Statistics v0 — 통계 클릭 intent + 기간 필터.
  const [intent, setIntent] = useState<CsPopupIntent | null>(null);
  const [period, setPeriod] = useState<CsTimeRange>('all');
  const [customRange, setCustomRange] = useState<CsCustomRange>({});
  const [customDraft, setCustomDraft] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showCustom, setShowCustom] = useState(false);
  const [customError, setCustomError] = useState('');
  const [nowMs] = useState(() => { try { return Date.now(); } catch { return 0; } });
  // CS Local State Persistence v0 — mount 시 localStorage 복원(lazy, 1회).
  const [persisted] = useState(() => loadCsPersistedState());
  // CS Work Completion Flow v0 — local 완료 이력(미처리/AI함 → 처리완료).
  const [completed, setCompleted] = useState<CsCompletedWorkItem[]>(() => persisted?.completedWorkItems ?? []);
  // CS Draft → Approval Queue HITL v0 — local 승인 큐.
  const [approvals, setApprovals] = useState<CsApprovalQueueItem[]>(() => persisted?.approvalItems ?? []);
  // 미처리 담당직원/내부 메모(영속).
  const [assigneeByItem, setAssigneeByItem] = useState<Record<string, string>>(() => persisted?.assigneeByItem ?? {});
  const [memoByItem, setMemoByItem] = useState<Record<string, string>>(() => persisted?.memoByItem ?? {});
  // 고객관리 메모/주의/블랙리스트(영속).
  const [custMemo, setCustMemo] = useState<Record<string, string>>(() => persisted?.customerManagement.memoByCustomerId ?? {});
  const [custCaution, setCustCaution] = useState<Record<string, boolean>>(() => persisted?.customerManagement.cautionByCustomerId ?? {});
  const [custBlacklist, setCustBlacklist] = useState<Record<string, boolean>>(() => persisted?.customerManagement.blacklistCandidateByCustomerId ?? {});

  // 변경 시 localStorage 저장(실제 WRITE 아님).
  useEffect(() => {
    saveCsPersistedState({
      completedWorkItems: completed, approvalItems: approvals, assigneeByItem, memoByItem,
      customerManagement: { memoByCustomerId: custMemo, cautionByCustomerId: custCaution, blacklistCandidateByCustomerId: custBlacklist }
    });
  }, [completed, approvals, assigneeByItem, memoByItem, custMemo, custCaution, custBlacklist]);

  const handleClearLocal = (): void => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('저장된 CS 로컬 상태를 초기화할까요? 승인 큐/처리완료/메모 상태가 삭제됩니다. (실제 고도몰 데이터에는 영향 없음)')) return;
    clearCsPersistedState();
    setCompleted([]); setApprovals([]); setAssigneeByItem({}); setMemoByItem({}); setCustMemo({}); setCustCaution({}); setCustBlacklist({});
  };
  // 직접 선택(custom) 기간 적용/초기화.
  const applyCustomRange = (): void => {
    if (!customDraft.start || !customDraft.end) { setCustomError('시작일과 종료일을 모두 선택하세요.'); return; }
    if (customDraft.end < customDraft.start) { setCustomError('종료일은 시작일보다 빠를 수 없습니다.'); return; }
    setCustomError(''); setCustomRange({ start: customDraft.start, end: customDraft.end }); setPeriod('custom');
  };
  const resetCustomRange = (): void => {
    setCustomError(''); setCustomDraft({ start: '', end: '' }); setCustomRange({}); setShowCustom(false);
    setPeriod((p) => (p === 'custom' ? 'all' : p));
  };

  const contacts = useMemo(() => (revenue?.universeAux?.csOnlyFakeContacts || []) as CsDashContact[], [revenue]);
  // 기간 필터 적용된 입력(각 항목 자기 날짜 기준). 전체엔 날짜 없는 항목도 포함.
  const filtered = useMemo(() => filterCsInputsByTime({
    inquiries: revenue?.universeAux?.inquiries || [], reviews: revenue?.universeAux?.reviews || [], orders: revenue?.orders || [],
    completed, approvals
  }, period, nowMs, customRange), [revenue, completed, approvals, period, nowMs, customRange]);

  const stats = useMemo<CsDashboardStatistics | null>(() => {
    if (!revenue?.universeAux) return null;
    return buildCsDashboardStatistics({
      inquiries: filtered.inquiries, reviews: filtered.reviews, orders: filtered.orders, contacts,
      completed: filtered.completed, approvals: filtered.approvals, cautionByKey: custCaution, blacklistByKey: custBlacklist, goodsNames, nowMs
    });
  }, [revenue, filtered, contacts, custCaution, custBlacklist, goodsNames, nowMs]);

  const wf = useMemo<CsAdminWorkflowFacts | null>(() => {
    if (!revenue?.universeAux) return null;
    return buildCsAdminWorkflow({ inquiries: filtered.inquiries, reviews: filtered.reviews, orders: filtered.orders, contacts, goodsNames, nowMs });
  }, [revenue, filtered, contacts, goodsNames, nowMs]);

  if (!stats || !wf) {
    return (
      <div className="cs-dash-empty">
        <p>CS 데이터가 아직 없습니다. 데이터를 불러오면 처리판이 표시됩니다.</p>
        <button type="button" className="dept-refresh-btn" onClick={onRefresh} disabled={loading}>{loading ? '불러오는 중…' : '데이터 불러오기'}</button>
      </div>
    );
  }

  const orders = filtered.orders;
  // 고객 프로필 허브 — 기간 필터 + completed(세션 완료 이력) 병합. CS UI 경로라 contacts(PII) 포함.
  const customerHub = buildCsCustomerProfileHub({
    inquiries: filtered.inquiries, reviews: filtered.reviews, orders,
    contacts, completed: filtered.completed, goodsNames, nowMs
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
    { key: 'hold', label: '보류', match: (i) => isOnHold((i as CsKpiInquiryItem).status) }
  ];
  const AI_TABS: PopupTab[] = [
    { key: 'all', label: '전체', match: () => true },
    { key: 'rev', label: '리뷰답글', match: (i) => i.kind === 'review' },
    { key: 'dlv', label: '배송안내', match: (i) => i.kind === 'inquiry' && i.topic === 'delivery' }
  ];

  const u = wf.unresolved, r = wf.resolved, a = wf.aiAuto, cs = wf.customers;

  // 완료된 originalId는 미처리/AI함에서 제외, 처리완료에는 prepend(기간 필터 적용된 completed).
  const completedIds = completedOriginalIdSet(filtered.completed);
  const unresolvedItems = u.items.filter((i) => !completedIds.has(i.inquiryId));
  const aiAutoItems = a.items.filter((i) => !completedIds.has(itemId(i)));
  const resolvedItems = [...filtered.completed.map(toResolvedItem), ...r.items];

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

  // 승인 큐: 상태 맵(배지) + 핸들러.
  const approvalStatus = csApprovalStatusByOriginalId(approvals);
  const pendingApprovals = approvals.filter((x) => x.status === 'pending_approval').length;
  const toApprovalSource = (item: CsKpiItem): CsApprovalSourceType => (item.kind === 'review' ? 'review_reply' : item.topic === 'delivery' ? 'delivery_reply' : 'inquiry_reply');
  const buildApproval = (item: CsKpiItem, answerText: string, assignee?: string, method?: CsApprovalMethod): CsApprovalQueueItem => {
    const d = buildCsDetailItem(item, { orders, contacts, goodsNames });
    return buildCsApprovalItem({
      sourceType: toApprovalSource(item),
      title: item.kind === 'inquiry' ? item.title : `${item.productName} 리뷰`,
      answerText,
      target: { originalId: itemId(item), orderNo: item.orderNo, productName: item.productName, customerId: d.customer?.memberId, memberId: d.customer?.memberId },
      context: { originalText: d.bodyText, type: item.topicKo, createdAt: item.createdAt, elapsedDays: item.ageDays, assignee, completionMethod: method },
      createdAt: nowIso()
    });
  };
  const handleRequestApproval = (item: CsKpiItem, payload: { answerText: string; assignee?: string; method: CsCompletionMethod }): void => {
    setApprovals((prev) => addCsApprovalItems(prev, [buildApproval(item, payload.answerText, payload.assignee, payload.method as CsApprovalMethod)]));
  };
  const handleRequestApprovalBatch = (entries: Array<{ item: CsKpiItem; draft: string }>): void => {
    setApprovals((prev) => addCsApprovalItems(prev, entries.map(({ item, draft }) => buildApproval(item, draft, undefined, 'ai_auto_batch'))));
  };

  const unresolvedSub = `AI초안 ${unresolvedItems.filter((i) => i.aiProcessable).length} · 내부확인 ${unresolvedItems.filter((i) => i.needsInternalCheck).length} · 보류 ${u.byStage.hold}`;
  const resolvedSub = `로컬완료 ${filtered.completed.length} · 최근7일 ${r.last7d} · 반복 ${r.repeat}`;
  const aiSub = `리뷰 ${aiAutoItems.filter((i) => i.kind === 'review').length} · 배송 ${aiAutoItems.filter((i) => i.kind === 'inquiry').length}`;
  const custSub = `반복문의 ${cs.byTag.repeatInquiry} · 클레임반복 ${cs.byTag.repeatClaim} · 고액 ${cs.byTag.highValue} · 주의 ${cs.byTag.watch}`;

  return (
    <div className="cs-dash">
      <div className="cs-dash-head">
        <h2 className="dept-dashboard-title"><span className="dept-team-emoji">💬</span>CS팀 처리판
          {(() => {
            // C-출처: CS 문의/리뷰는 가상 2년치(universeAux) 기반 → 신분 라벨. 수치 계산은 불변.
            // DATA-SOURCE-SERVER-01(GREEN F): 최상위 source 로 단정하지 않는다.
            //   실제 주문만 실패하고 시뮬레이션(CS 시험자료)이 살아 있으면 '시험 데이터'를 유지한다.
            const hasSynthetic = !!(revenue?.universeAux?.inquiries?.length || revenue?.universeAux?.reviews?.length);
            const screenState = screenStateFromRevenue(revenue);
            const kind: ProvenanceKind = !screenState.usable ? 'unavailable'
              : hasSynthetic || screenState.hasSimulation ? 'simulation'
              : userLabelOf(classifyResource({ sourceType: revenue?.source }).kind) === '실제 데이터' ? 'actual' : 'simulation';
            return (
              <span className={`cs-provenance-badge prov-${kind}`} title={kind === 'simulation' ? '문의·리뷰는 가상 운영자료(시험 데이터)입니다.' : ''}
                style={{ marginLeft: 8, fontSize: '0.55em', padding: '2px 8px', borderRadius: 10, verticalAlign: 'middle', background: kind === 'actual' ? 'rgba(45,245,162,0.15)' : kind === 'unavailable' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: kind === 'actual' ? '#2df5a2' : kind === 'unavailable' ? '#ef4444' : '#f59e0b' }}>
                {userLabelOf(kind)}
              </span>
            );
          })()}
        </h2>
        <p className="dept-dashboard-desc">관리자 업무 흐름 기준. (문의·리뷰는 시험 데이터 · 고객정보는 CS 처리 화면에서만 표시)</p>
      </div>

      <div className="cs-dash-period">
        <span className="cs-dash-period-label">조회 기간{period === 'custom' && isValidCustomRange(customRange) ? ` · ${customRange.start} ~ ${customRange.end}` : ''}</span>
        <div className="cs-dash-period-pills">
          {CS_TIME_RANGES.map((rg) => (
            <button key={rg.key} type="button" className={`cs-dash-period-pill ${period === rg.key ? 'active' : ''}`} onClick={() => { setPeriod(rg.key); setShowCustom(false); }}>{rg.label}</button>
          ))}
          <button type="button" className={`cs-dash-period-pill ${period === 'custom' ? 'active' : ''}`} onClick={() => setShowCustom((v) => !v)}>직접 선택</button>
        </div>
        {showCustom && (
          <div className="cs-dash-custom-row">
            <input type="date" className="cs-dash-date" value={customDraft.start} onChange={(e) => setCustomDraft((p) => ({ ...p, start: e.target.value }))} aria-label="시작일" />
            <span className="cs-dash-custom-sep">~</span>
            <input type="date" className="cs-dash-date" value={customDraft.end} onChange={(e) => setCustomDraft((p) => ({ ...p, end: e.target.value }))} aria-label="종료일" />
            <button type="button" className="cs-dash-period-pill active" onClick={applyCustomRange}>적용</button>
            <button type="button" className="cs-dash-period-pill" onClick={resetCustomRange}>초기화</button>
            {customError && <span className="cs-dash-custom-error">{customError}</span>}
          </div>
        )}
      </div>

      <div className="dept-card-grid cs-dash-kpi-grid">
        <KpiCard label="미처리 문의" value={unresolvedItems.length} unit="건" sub={unresolvedSub} icon="✉️" accent="#31D6C4" onClick={() => setIntent({ kind: 'unresolved' })} />
        <KpiCard label="처리완료 문의" value={r.count + filtered.completed.length} unit="건" sub={resolvedSub} icon="✅" accent="#5B7DB1" onClick={() => setIntent({ kind: 'completed' })} />
        <KpiCard label="AI 자동처리함" value={aiAutoItems.length} unit="건" sub={aiSub} icon="🤖" accent="#FBBF24" onClick={() => setIntent({ kind: 'aiAuto' })} />
        <KpiCard label="고객관리" value={cs.count} unit="명" sub={custSub} icon="👤" accent="#2DD4BF" onClick={() => setIntent({ kind: 'customer' })} />
      </div>
      <p className="cs-dash-basis-note">
        ※ CS 지표는 매출 KPI와 <b>별개의 업무 흐름 지표</b>입니다. 문의·리뷰·고객은 매출 대시보드와 <b>같은 Commerce Universe(safe)</b>에서 같은 기간 필터로 집계됩니다.
        <b>고객관리 N명</b> = 주문 memberKey 기준 고유 고객 · <b>AI 자동처리함</b> = 리뷰 + 배송 문의(상품/결제/환불 제외). 고객 PII는 CS 화면에서만 표시.
      </p>
      <div className="cs-dash-kpi-noterow">
        <p className="cs-dash-kpi-note">통계 항목을 클릭하면 관련 목록이 열립니다 · 기간을 바꾸면 KPI·통계가 함께 변경됩니다.</p>
        <div className="cs-dash-noterow-btns">
          <button type="button" className="cs-dash-approval-btn" onClick={() => setIntent({ kind: 'approvalQueue', initialTab: 'pending' })}>🗳️ CS 승인 큐 {approvals.length ? `(대기 ${pendingApprovals})` : ''}</button>
          <button type="button" className="cs-dash-clear-btn" onClick={handleClearLocal} title="localStorage CS 상태 삭제(고도몰 영향 없음)">CS 로컬 상태 초기화</button>
        </div>
      </div>

      {/* ── 통계 상황판 ── */}
      <div className="cs-dash-two-col">
        {/* 1. 문의 유형 비중 */}
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">📊 문의 유형 비중</h3>
          <div className="cs-stat-bars">
            {stats.inquiryTypeDistribution.map((s) => (
              <div key={s.type} className="cs-stat-bar-row cs-stat-clickable" role="button" tabIndex={0} onClick={() => setIntent(typeSliceToIntent(s.type))} title="클릭해서 보기">
                <span className="cs-stat-bar-label">{s.label}</span>
                <span className="cs-stat-bar-track"><span className={`cs-stat-bar-fill ${csTypeColorClass(s.type === 'claim' ? 'refund' : s.type === 'review' ? '' : s.type)} ${s.type === 'review' ? 'type-review' : ''}`} style={{ width: `${Math.max(2, s.percent)}%` }} /></span>
                <span className="cs-stat-bar-val"><AnimatedNumber value={s.percent} suffix="%" /> <span className="cs-dash-muted">(<AnimatedNumber value={s.count} />)</span></span>
              </div>
            ))}
          </div>
        </section>

        {/* 2. CS 업무 흐름 요약 */}
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">🔀 CS 업무 흐름</h3>
          <div className="cs-stat-flow">
            {([['unresolved', '미처리', stats.workflowSummary.unresolved], ['pendingApproval', '승인 대기', stats.workflowSummary.pendingApproval], ['approved', '승인됨', stats.workflowSummary.approved], ['completed', '처리완료', stats.workflowSummary.completed], ['rejectedOrHeld', '반려/보류', stats.workflowSummary.rejectedOrHeld]] as Array<[string, string, number]>).map(([step, label, n], i, arr) => (
              <React.Fragment key={step}>
                <div className="cs-stat-flow-card cs-stat-clickable" role="button" tabIndex={0} onClick={() => setIntent(workflowStepToIntent(step))} title="클릭해서 보기"><span className="cs-stat-flow-n"><AnimatedNumber value={n} /></span><span className="cs-stat-flow-label">{label}</span></div>
                {i < arr.length - 1 && <span className="cs-stat-flow-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        </section>
      </div>

      <div className="cs-dash-two-col">
        {/* 3. AI 처리 성과 */}
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">🤖 AI 처리 성과</h3>
          <p className="cs-dash-section-desc">AI가 초안을 만들고, 운영자가 승인합니다.</p>
          <div className="cs-cust-metrics">
            {([['draftCount', 'AI 초안 후보', stats.aiPerformance.draftCount], ['approvalRequestedCount', '승인요청', stats.aiPerformance.approvalRequestedCount], ['approvedCount', '승인', stats.aiPerformance.approvedCount], ['rejectedCount', '반려', stats.aiPerformance.rejectedCount], ['aiCompletedCount', 'AI 처리완료', stats.aiPerformance.aiCompletedCount]] as Array<[string, string, number]>).map(([metric, label, n]) => (
              <div key={metric} className="cs-cust-metric cs-stat-clickable" role="button" tabIndex={0} onClick={() => setIntent(aiMetricToIntent(metric))} title="클릭해서 보기"><span>{label}</span><b><AnimatedNumber value={n} /></b></div>
            ))}
            <div className="cs-cust-metric"><span>승인율</span><b>{stats.aiPerformance.approvalRate != null ? <AnimatedNumber value={stats.aiPerformance.approvalRate} suffix="%" /> : '–'}</b></div>
          </div>
        </section>

        {/* 4. CS 이슈 상품 TOP */}
        <section className="cs-dash-section">
          <h3 className="cs-dash-section-title">📦 CS 이슈 상품 TOP</h3>
          {stats.issueProducts.length ? (
            <ol className="cs-stat-rank">
              {stats.issueProducts.map((p, i) => (
                <li key={p.goodsNo} className="cs-stat-rank-row cs-stat-clickable" role="button" tabIndex={0} onClick={() => setIntent(issueProductToIntent(p.goodsNo, p.productName))} title="상품 이슈 상세 보기">
                  <span className="cs-stat-rank-no">{i + 1}</span>
                  <div className="cs-stat-rank-body">
                    <div className="cs-stat-rank-title">{p.productName} <span className={`cs-badge risk-${p.riskLevel}`}>위험 {riskKo(p.riskLevel)}</span></div>
                    <div className="cs-stat-rank-meta">문의 {p.inquiryCount} · 리뷰이슈 {p.reviewIssueCount} · 클레임 {p.claimCount} · 주요 {csTopicKo(p.mainIssueType)}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="cs-dash-muted">이슈 상품이 없습니다.</p>}
        </section>
      </div>

      {/* 5. 고객 리스크 요약 */}
      <section className="cs-dash-section">
        <h3 className="cs-dash-section-title">🛡️ 고객 리스크 요약</h3>
        <div className="cs-stat-risk-cards">
          {([['repeatInquiry', '반복문의', stats.customerRiskSummary.repeatInquiryCount], ['repeatRefundCancel', '반복 환불·취소', stats.customerRiskSummary.repeatRefundCancelCount], ['caution', '주의 고객', stats.customerRiskSummary.cautionCustomerCount], ['blacklist', '블랙리스트 후보', stats.customerRiskSummary.blacklistCandidateCount], ['highValue', '고액 고객', stats.customerRiskSummary.highValueCustomerCount]] as Array<[string, string, number]>).map(([card, label, n]) => (
            <div key={card} className="cs-cust-metric cs-stat-clickable" role="button" tabIndex={0} onClick={() => setIntent(riskCardToIntent(card))} title="클릭해서 보기"><span>{label}</span><b><AnimatedNumber value={n} /></b></div>
          ))}
        </div>
        {stats.customerRiskSummary.topRiskCustomers.length > 0 && (
          <div className="cs-stat-risk-top">
            {stats.customerRiskSummary.topRiskCustomers.map((c) => (
              <div key={c.customerId} className="cs-stat-risk-top-row cs-stat-clickable" role="button" tabIndex={0} onClick={() => setIntent(riskCustomerToIntent(c.customerId))} title="고객 상세 보기">
                <span>{c.name || c.customerId}</span> <span className={`cs-badge risk-${c.riskLevel}`}>위험 {riskKo(c.riskLevel)}</span> <span className="cs-dash-muted">{c.tags.slice(0, 2).join(' · ')}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="cs-dash-hint">
        <span className="cs-dash-hint-label">우측 CS팀장에게 이렇게 물어보세요</span>
        <div className="cs-dash-hint-list">{wf.chatHints.map((h, i) => <span key={i} className="cs-dash-hint-chip">{h}</span>)}</div>
      </div>

      {intent?.kind === 'unresolved' && <CsItemPopup title="미처리 문의" items={unresolvedItems} tabs={UNRES_TABS} allowDraft={false} allowRegister={false} orders={orders} contacts={contacts} goodsNames={goodsNames} initialTab={intent.initialTab} onClose={() => setIntent(null)} onCompleteItem={handleCompleteItem} onRequestApproval={handleRequestApproval} approvalStatus={approvalStatus} assigneeByItem={assigneeByItem} setAssigneeByItem={setAssigneeByItem} memoByItem={memoByItem} setMemoByItem={setMemoByItem} />}
      {intent?.kind === 'aiAuto' && <CsItemPopup title="AI 자동처리함 (리뷰·배송)" items={aiAutoItems} tabs={AI_TABS} allowDraft allowRegister orders={orders} contacts={contacts} goodsNames={goodsNames} initialTab={intent.initialTab} onClose={() => setIntent(null)} onCompleteBatch={handleCompleteBatch} onRequestApprovalBatch={handleRequestApprovalBatch} approvalStatus={approvalStatus} assigneeByItem={assigneeByItem} setAssigneeByItem={setAssigneeByItem} memoByItem={memoByItem} setMemoByItem={setMemoByItem} />}
      {intent?.kind === 'completed' && <CsResolvedPopup items={resolvedItems} initialTab={intent.initialTab} onClose={() => setIntent(null)} />}
      {intent?.kind === 'customer' && <CsCustomerProfilePopup items={customerHub.items} memo={custMemo} setMemo={setCustMemo} watchTag={custCaution} setWatchTag={setCustCaution} blackTag={custBlacklist} setBlackTag={setCustBlacklist} initialFilter={intent.initialFilter} initialCustomerKey={intent.selectedCustomerId} onClose={() => setIntent(null)} />}
      {intent?.kind === 'approvalQueue' && <CsApprovalQueuePopup items={approvals} initialTab={intent.initialTab} onApprove={(id) => setApprovals((p) => approveCsApprovalItem(p, id))} onReject={(id, reason) => setApprovals((p) => rejectCsApprovalItem(p, id, reason))} onClose={() => setIntent(null)} />}
      {intent?.kind === 'issueProduct' && <CsIssueProductPopup goodsNo={intent.goodsNo} productName={intent.productName} inquiries={filtered.inquiries} reviews={filtered.reviews} orders={orders} goodsNames={goodsNames} onClose={() => setIntent(null)} />}
    </div>
  );
};
