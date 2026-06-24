import React, { useState } from 'react';
import './DepartmentWorkspacePanel.css';
import {
  fetchAdminProducts,
  fetchAdminOrders,
  type AdminProductsResult,
  type AdminOrdersResult,
  type DataSourceTag
} from '../services/departmentDataService';

// ────────────────────────────────────────────────────────────────────────────
// 부서 업무 관장 (Department Workspace) — 1차 뼈대(shell)
//
// 역할: 쇼핑몰 연동 탭이 "데이터를 끌어오는 배관실"이라면, 이 탭은 운영자가
// 끌어온 데이터를 팀별로 보고·선택·질문·명령하는 "업무 공간"이다.
//
// ⚠️ 이번 단계는 빈 사무실(화면 뼈대)만 만든다.
//   - 실제 데이터/표/필터/목록 출력 없음 (placeholder만)
//   - 실제 AI/LLM/API 호출 없음 (우측 채팅은 미리보기 응답만)
//
// 다음 단계 데이터 연결 계획(구조만 팀 단위로 분리해 둠):
//   상품관리팀 → Products REAL READ
//   CS팀       → Inquiries / Reviews
//   마케팅팀    → Sales / Products / Campaign
//   총괄팀      → 모든 팀 요약 + Approval Queue
// ────────────────────────────────────────────────────────────────────────────

type TeamId = 'hq' | 'product' | 'cs' | 'marketing';

interface TeamConfig {
  id: TeamId;
  emoji: string;
  name: string;
  roleSummary: string;
  lead: string;
  members: string[];
  mission: string;
  dashboardTitle: string;
  dashboardDesc: string;
  chatTitle: string;
  chatPlaceholder: string;
  // 다음 단계에서 연결할 데이터 출처 (현재는 안내 문구로만 노출)
  futureDataNote: string;
}

const TEAMS: TeamConfig[] = [
  {
    id: 'hq',
    emoji: '🏛️',
    name: '총괄팀',
    roleSummary: '부서별 업무 상태와 승인 대기 항목을 조율',
    lead: '총괄 매니저 AI',
    members: ['전체 부서'],
    mission: '부서별 업무 상태와 승인 대기 항목을 조율합니다.',
    dashboardTitle: '총괄팀 대시보드',
    dashboardDesc: '전체 부서의 업무 상태, 위험 알림, 승인 대기 항목을 이곳에서 확인할 예정입니다.',
    chatTitle: '총괄팀에게 지시하기',
    chatPlaceholder: '예: 오늘 위험한 업무만 요약해줘',
    futureDataNote: '다음 단계 연결 예정: 모든 팀 요약 + Approval Queue'
  },
  {
    id: 'product',
    emoji: '🏷️',
    name: '상품관리팀',
    roleSummary: '상품·재고·노출상태·판매상태 점검',
    lead: '상품 관리 AI',
    members: ['주문 확인 AI', '재고 감시 AI'],
    mission: '상품, 재고, 노출상태, 판매상태를 점검합니다.',
    dashboardTitle: '상품관리팀 대시보드',
    dashboardDesc: '상품 목록, 카테고리, 재고, 품절, 노출상태, 판매상태를 이곳에서 확인할 예정입니다.',
    chatTitle: '상품관리팀에게 지시하기',
    chatPlaceholder: '예: 미결제 주문만 보여줘',
    futureDataNote: '연결됨: Products REAL READ · Orders READ v0 (관리자 주문)'
  },
  {
    id: 'cs',
    emoji: '💬',
    name: 'CS팀',
    roleSummary: '문의·리뷰·배송 이슈 확인',
    lead: 'CS 상담 AI',
    members: ['배송 추적 AI', '리뷰 답글 AI'],
    mission: '문의, 리뷰, 배송 이슈를 확인합니다.',
    dashboardTitle: 'CS팀 대시보드',
    dashboardDesc: '고객 문의, 리뷰, 답변 대기, 불만 이슈를 이곳에서 확인할 예정입니다.',
    chatTitle: 'CS팀에게 지시하기',
    chatPlaceholder: '예: 답변 대기 문의만 정리해줘',
    futureDataNote: '다음 단계 연결 예정: Inquiries / Reviews 데이터'
  },
  {
    id: 'marketing',
    emoji: '📊',
    name: '마케팅팀',
    roleSummary: '판매 흐름·캠페인 후보 점검',
    lead: '마케팅 기획 AI',
    members: ['매출 분석 AI'],
    mission: '판매 흐름과 캠페인 후보를 점검합니다.',
    dashboardTitle: '마케팅팀 대시보드',
    dashboardDesc: '판매 현황, 인기 상품, 캠페인 후보, 매출 흐름을 이곳에서 확인할 예정입니다.',
    chatTitle: '마케팅팀에게 지시하기',
    chatPlaceholder: '예: 인기 상품 기준으로 캠페인 후보를 뽑아줘',
    futureDataNote: '다음 단계 연결 예정: Sales / Products / Campaign 데이터'
  }
];

// 중앙 대시보드 placeholder 카드 (실제 수치 아님 — 미연결 상태 명시)
const PLACEHOLDER_CARDS = [
  { key: 'todo', label: '오늘 확인할 항목', icon: '📋' },
  { key: 'warning', label: '주의가 필요한 항목', icon: '⚠️' },
  { key: 'recent', label: '최근 업데이트', icon: '🔄' },
  { key: 'pending', label: '대기 중인 요청', icon: '⏳' }
];

interface ChatMessage {
  role: 'user' | 'system';
  text: string;
}

const SOURCE_LABEL: Record<DataSourceTag, string> = {
  real: '고도몰 REAL READ',
  sandbox: 'SANDBOX (Live)',
  mock: 'Mock / Fallback',
  unavailable: '불러오기 실패 (미연결)'
};

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;

export const DepartmentWorkspacePanel: React.FC = () => {
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId>('hq');
  const [chatLog, setChatLog] = useState<Record<TeamId, ChatMessage[]>>({
    hq: [],
    product: [],
    cs: [],
    marketing: []
  });
  const [input, setInput] = useState('');

  // 상품관리팀 대시보드 데이터 (Products REAL READ + Orders READ v0)
  const [productData, setProductData] = useState<{
    products: AdminProductsResult | null;
    orders: AdminOrdersResult | null;
    loading: boolean;
    loaded: boolean;
  }>({ products: null, orders: null, loading: false, loaded: false });

  const loadProductTeamData = async () => {
    setProductData((prev) => ({ ...prev, loading: true }));
    const [products, orders] = await Promise.all([fetchAdminProducts(), fetchAdminOrders()]);
    setProductData({ products, orders, loading: false, loaded: true });
  };

  // 팀 선택 — 상품관리팀을 처음 선택하면 1회 자동 로드 (이벤트 핸들러에서 트리거)
  const handleSelectTeam = (id: TeamId) => {
    setSelectedTeamId(id);
    if (id === 'product' && !productData.loaded && !productData.loading) {
      void loadProductTeamData();
    }
  };

  const team = TEAMS.find((t) => t.id === selectedTeamId) as TeamConfig;
  const messages = chatLog[selectedTeamId];

  // 우측 명령 전송 — 실제 AI/API 호출 없음. 미리보기 안내 응답만 추가한다.
  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const reply: ChatMessage = {
      role: 'system',
      text: `이 영역은 다음 단계에서 ${team.name}의 데이터와 연결됩니다. (현재는 미리보기 화면으로, 실제 AI/API 호출은 하지 않습니다.)`
    };
    setChatLog((prev) => ({
      ...prev,
      [selectedTeamId]: [...prev[selectedTeamId], { role: 'user', text }, reply]
    }));
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 상품관리팀 대시보드 데이터 영역 (최소 확인용 — 디자인 고도화 X)
  const renderProductData = () => {
    const { products, orders, loading, loaded } = productData;

    if (!loaded && loading) {
      return <div className="dept-data-loading">데이터를 불러오는 중…</div>;
    }
    if (!loaded) {
      return (
        <div className="dept-data-loading">
          <button type="button" className="dept-refresh-btn" onClick={() => void loadProductTeamData()}>
            데이터 불러오기
          </button>
        </div>
      );
    }

    const p = products;
    const o = orders;
    const productPreview = (p?.products ?? []).slice(0, 5);
    const orderPreview = o?.orders ?? [];

    return (
      <div className="dept-data-wrap">
        <div className="dept-data-toolbar">
          <span className="dept-data-hint">상품관리팀 대시보드 데이터 연결 확인용</span>
          <button
            type="button"
            className="dept-refresh-btn"
            onClick={() => void loadProductTeamData()}
            disabled={loading}
          >
            {loading ? '새로고침 중…' : '↻ 새로고침'}
          </button>
        </div>

        {/* 요약 카드 */}
        <div className="dept-card-grid">
          <div className="dept-stat-card">
            <div className="dept-stat-head">
              <span className="dept-stat-icon">🏷️</span>
              <span className="dept-stat-label">상품 수</span>
            </div>
            <div className="dept-stat-value">{p?.count ?? 0}<span className="dept-stat-unit">개</span></div>
            <span className={`dept-stat-tag src-${p?.source ?? 'unavailable'}`}>
              출처: {SOURCE_LABEL[p?.source ?? 'unavailable']}
            </span>
          </div>

          <div className="dept-stat-card">
            <div className="dept-stat-head">
              <span className="dept-stat-icon">🧾</span>
              <span className="dept-stat-label">주문 수</span>
            </div>
            <div className="dept-stat-value">{o?.count ?? 0}<span className="dept-stat-unit">건</span></div>
            <span className={`dept-stat-tag src-${o?.source ?? 'unavailable'}`}>
              출처: {SOURCE_LABEL[o?.source ?? 'unavailable']}
            </span>
          </div>

          <div className="dept-stat-card">
            <div className="dept-stat-head">
              <span className="dept-stat-icon">💳</span>
              <span className="dept-stat-label">미결제 주문</span>
            </div>
            <div className="dept-stat-value">{o?.unpaidCount ?? 0}<span className="dept-stat-unit">건</span></div>
            <span className="dept-stat-tag">결제 대기/미입금</span>
          </div>

          <div className="dept-stat-card">
            <div className="dept-stat-head">
              <span className="dept-stat-icon">📦</span>
              <span className="dept-stat-label">미배송 주문</span>
            </div>
            <div className="dept-stat-value">{o?.undeliveredCount ?? 0}<span className="dept-stat-unit">건</span></div>
            <span className="dept-stat-tag">배송 전</span>
          </div>
        </div>

        {/* 상품 미리보기 */}
        <div className="dept-preview-block">
          <h4 className="dept-preview-title">상품 미리보기 <small>상품명 / 판매가 / 재고상태</small></h4>
          {productPreview.length === 0 ? (
            <p className="dept-preview-empty">표시할 상품이 없습니다.</p>
          ) : (
            <ul className="dept-preview-list">
              {productPreview.map((pr) => (
                <li key={pr.productId || pr.productName} className="dept-preview-row">
                  <span className="dept-preview-name">{pr.productName || '(이름 없음)'}</span>
                  <span className="dept-preview-mid">{won(pr.price)}</span>
                  <span className={`dept-preview-badge ${pr.soldOut ? 'danger' : pr.stockEnabled && pr.stock <= 0 ? 'danger' : 'ok'}`}>
                    {pr.soldOut ? '품절' : pr.stockEnabled ? `재고 ${pr.stock}` : '재고무제한'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 주문 미리보기 (관리자 화면 — 원본 고객정보 표시 가능) */}
        <div className="dept-preview-block">
          <h4 className="dept-preview-title">주문 미리보기 <small>주문번호 / 상품 / 금액 / 결제 / 배송</small></h4>
          {orderPreview.length === 0 ? (
            <p className="dept-preview-empty">표시할 주문이 없습니다.</p>
          ) : (
            <ul className="dept-preview-list">
              {orderPreview.map((or) => (
                <li key={or.orderId || or.orderNo} className="dept-order-row">
                  <div className="dept-order-line1">
                    <span className="dept-order-no">{or.orderNo || '(주문번호 없음)'}</span>
                    <span className="dept-order-amount">{won(or.totalAmount)}</span>
                  </div>
                  <div className="dept-order-line2">
                    <span className="dept-order-prod">{or.productName || '(상품 없음)'}</span>
                    {or.quantity ? <span className="dept-order-qty">×{or.quantity}</span> : null}
                  </div>
                  <div className="dept-order-line3">
                    <span className={`dept-order-badge ${or.unpaid ? 'danger' : 'ok'}`}>{or.paymentStatus}</span>
                    <span className={`dept-order-badge ${or.undelivered ? 'warn' : 'ok'}`}>{or.deliveryStatus}</span>
                    {(or.ordererName || or.receiverName) && (
                      <span className="dept-order-cust">
                        주문자 {or.ordererName || '-'} · 수령 {or.receiverName || '-'}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="dept-data-disclaimer">
          이 화면은 상품관리팀 대시보드 데이터 연결 확인용입니다. 상세 출력 방식과 디자인은 다음 단계에서 조정됩니다.
        </p>
        {(p?.source === 'unavailable' || o?.source === 'unavailable') && (
          <p className="dept-data-disclaimer warn">
            ※ 일부 데이터를 불러오지 못했습니다. (로컬 dev 환경에서는 서버 라우트가 없을 수 있습니다. 배포 환경에서 확인하세요.)
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="dept-workspace">
      {/* ── 좌측: 부서 선택 / 팀 정보 ── */}
      <aside className="dept-col dept-col-left">
        <div className="dept-col-head">
          <h3>부서 선택</h3>
          <p className="dept-col-sub">팀을 선택해 업무 공간을 전환하세요.</p>
        </div>

        <div className="dept-team-list">
          {TEAMS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dept-team-card ${t.id === selectedTeamId ? 'active' : ''}`}
              onClick={() => handleSelectTeam(t.id)}
            >
              <div className="dept-team-card-top">
                <span className="dept-team-emoji">{t.emoji}</span>
                <span className="dept-team-name">{t.name}</span>
              </div>
              <p className="dept-team-role">{t.roleSummary}</p>
              <div className="dept-team-meta">
                <span>팀장: {t.lead}</span>
                <span>팀원 {t.members.length}명</span>
              </div>
            </button>
          ))}
        </div>

        {/* 선택한 팀 상세 정보 */}
        <div className="dept-team-detail">
          <div className="dept-detail-title">
            <span className="dept-team-emoji">{team.emoji}</span>
            <strong>{team.name}</strong>
          </div>
          <dl className="dept-detail-list">
            <div>
              <dt>팀장</dt>
              <dd>{team.lead}</dd>
            </div>
            <div>
              <dt>팀원</dt>
              <dd>{team.members.join(', ')}</dd>
            </div>
            <div>
              <dt>오늘의 미션</dt>
              <dd>{team.mission}</dd>
            </div>
          </dl>
        </div>
      </aside>

      {/* ── 중앙: 팀별 업무 대시보드 (placeholder) ── */}
      <section className="dept-col dept-col-center">
        <div className="dept-col-head">
          <h2 className="dept-dashboard-title">
            <span className="dept-team-emoji">{team.emoji}</span>
            {team.dashboardTitle}
          </h2>
          <p className="dept-dashboard-desc">{team.dashboardDesc}</p>
        </div>

        {team.id === 'product' ? (
          renderProductData()
        ) : (
          <>
            <div className="dept-placeholder-banner">
              🚧 이 화면은 아직 데이터가 연결되지 않은 미리보기입니다. 아래 수치는 예시(placeholder)입니다.
            </div>

            <div className="dept-card-grid">
              {PLACEHOLDER_CARDS.map((c) => (
                <div key={c.key} className="dept-stat-card">
                  <div className="dept-stat-head">
                    <span className="dept-stat-icon">{c.icon}</span>
                    <span className="dept-stat-label">{c.label}</span>
                  </div>
                  <div className="dept-stat-value">—</div>
                  <span className="dept-stat-tag">예시 · 미연결</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="dept-future-note">
          <span className="dept-future-icon">🔌</span>
          {team.futureDataNote}
        </div>
      </section>

      {/* ── 우측: 팀별 명령 채팅창 (미리보기, 실제 호출 없음) ── */}
      <aside className="dept-col dept-col-right">
        <div className="dept-col-head">
          <h3>{team.chatTitle}</h3>
          <p className="dept-col-sub">선택한 팀에게 업무를 지시하는 자리입니다.</p>
        </div>

        <div className="dept-chat-log">
          {messages.length === 0 ? (
            <div className="dept-chat-empty">
              <p>아직 지시한 내용이 없습니다.</p>
              <p className="dept-chat-empty-hint">{team.chatPlaceholder}</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`dept-chat-msg ${m.role}`}>
                {m.text}
              </div>
            ))
          )}
        </div>

        <div className="dept-chat-input-row">
          <textarea
            className="dept-chat-input"
            value={input}
            placeholder={team.chatPlaceholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button
            type="button"
            className="dept-chat-send"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            지시 전송
          </button>
        </div>
        <p className="dept-chat-disclaimer">
          ※ 미리보기 단계 — 메시지를 보내도 실제 AI/API를 호출하지 않습니다.
        </p>
      </aside>
    </div>
  );
};
