import React from 'react';
import './MarketingCustomerBehaviorModal.css';
import { CUSTOMER_BEHAVIOR_EVENTS, TOTAL_BEHAVIOR_EVENTS, connectedBehaviorEventCount } from '../services/marketingCustomerBehaviorEvents';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Customer Behavior Modal v0 — 고객 행동 분석 (수집 준비 상태)
//
// 가오픈 단계: GA4/GTM/광고/방문자 추적이 실제 연결되지 않았다.
//   → 방문자/클릭/이탈률/전환율 등 행동 수치는 절대 fake로 생성하지 않는다.
//   → 이 모달은 "실제 행동 데이터 연결 전, UI/UX 구조 + 데이터 수집 슬롯"을 먼저 만든 것.
//   → 모든 영역은 '연결되면 무엇을 보여줄지'를 설명하는 placeholder. 숫자 0명/0회도 만들지 않는다.
// 추적 이벤트 정의는 ../services/marketingCustomerBehaviorEvents (KPI 카드와 단일 소스 공유).
// PII 미노출(이름/전화/이메일/주소/주문번호/회원식별자 없음). 인과 단정 없음.
// ────────────────────────────────────────────────────────────────────────────

// ── 상단 상태 요약 카드 (4) ──────────────────────────────────────────────────
type ConnectStatus = 'disconnected' | 'ready';
interface StatusCard {
  key: string;
  title: string;
  statusLabel: string;
  status: ConnectStatus;
  desc: string;
}
const STATUS_CARDS: StatusCard[] = [
  { key: 'ga4', title: 'GA4', statusLabel: '미연결', status: 'disconnected', desc: '방문, 페이지뷰, 유입 소스 수집 필요' },
  { key: 'gtm', title: 'GTM', statusLabel: '미연결', status: 'disconnected', desc: '배너 클릭, 검색, 장바구니 이벤트 수집 필요' },
  { key: 'events', title: '추적 이벤트', statusLabel: `${connectedBehaviorEventCount()} / ${TOTAL_BEHAVIOR_EVENTS}`, status: 'disconnected', desc: '행동 이벤트 연결 전' },
  // 구매 매칭은 "연결됨"이 아니라 "준비 가능" — purchase 이벤트 연결 후 기존 주문 데이터와 매칭 가능.
  { key: 'purchase_match', title: '구매 매칭', statusLabel: '준비 가능', status: 'ready', desc: 'purchase 이벤트 연결 후 주문 데이터와 매칭 가능' }
];

// ── 고객 행동 퍼널 (8단계) ──────────────────────────────────────────────────
const FUNNEL_STEPS: { stage: string; need: string }[] = [
  { stage: '방문', need: 'GA4 필요' },
  { stage: '랜딩 페이지', need: 'page_view 필요' },
  { stage: '배너 클릭', need: 'GTM click event 필요' },
  { stage: '카테고리 이동', need: 'category_view 필요' },
  { stage: '상품 상세 조회', need: 'view_item 필요' },
  { stage: '검색', need: 'search event 필요' },
  { stage: '장바구니', need: 'add_to_cart 필요' },
  { stage: '결제 시작 / 구매 완료', need: 'begin_checkout / purchase 필요' }
];

// ── 인기 클릭 영역 placeholder (4) — 연결되면 무엇을 보여줄지 설명 ──────────────
const POPULAR_PLACEHOLDERS: { key: string; title: string; status: string; willShow: string[] }[] = [
  { key: 'banner', title: '많이 클릭한 배너', status: '배너 클릭 이벤트 연결 전', willShow: ['배너별 클릭수', '클릭 후 상품조회', '클릭 후 장바구니', '클릭 후 구매전환'] },
  { key: 'item', title: '많이 본 상품', status: 'view_item 이벤트 연결 전', willShow: ['상품 상세 조회수', '조회 후 장바구니', '조회 후 구매전환'] },
  { key: 'category', title: '많이 이동한 카테고리', status: 'category_view 이벤트 연결 전', willShow: ['카테고리별 진입수', '카테고리별 이탈률', '카테고리별 구매전환'] },
  { key: 'keyword', title: '많이 검색한 키워드', status: 'search 이벤트 연결 전', willShow: ['검색어 빈도', '검색 후 상품조회', '검색 후 구매전환'] }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const MarketingCustomerBehaviorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  // ESC 닫기
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const connected = connectedBehaviorEventCount();

  return (
    <div className="mcb-overlay" onClick={onClose}>
      <div
        className="mcb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcb-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="mcb-header">
          <div className="mcb-header-text">
            <span className="mcb-eyebrow">📡 행동 추적 관제</span>
            <h2 id="mcb-title" className="mcb-title">고객 행동 분석</h2>
            <p className="mcb-subtitle">
              유입 이후 쇼핑몰 내부 이동, 클릭, 상품 관심, 이탈 지점을 추적하는 분석 영역입니다.
              현재는 GA4/GTM 행동 이벤트가 연결되지 않아 수집 준비 상태입니다.
            </p>
          </div>
          <button type="button" className="mcb-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="mcb-body">
          {/* ── 6-1. 상단 상태 요약 카드 ── */}
          <section className="mcb-section">
            <div className="mcb-status-grid">
              {STATUS_CARDS.map((c) => (
                <div key={c.key} className={`mcb-status-card status-${c.status}`}>
                  <div className="mcb-status-head">
                    <span className="mcb-status-title">{c.title}</span>
                    <span className={`mcb-status-badge badge-${c.status}`}>{c.statusLabel}</span>
                  </div>
                  <p className="mcb-status-desc">{c.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── 6-2. 고객 행동 퍼널 ── */}
          <section className="mcb-section">
            <h3 className="mcb-section-title">고객 행동 퍼널</h3>
            <p className="mcb-section-note">유입 → 구매까지의 흐름입니다. 각 단계는 해당 이벤트가 연결되면 실제 수치로 채워집니다. (현재 수치는 표시하지 않습니다.)</p>
            <ol className="mcb-funnel">
              {FUNNEL_STEPS.map((f, i) => (
                <li key={f.stage} className="mcb-funnel-step">
                  <span className="mcb-funnel-index">{i + 1}</span>
                  <span className="mcb-funnel-stage">{f.stage}</span>
                  <span className="mcb-funnel-badge">{f.need}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* ── 6-3. 인기 클릭 영역 placeholder ── */}
          <section className="mcb-section">
            <h3 className="mcb-section-title">인기 클릭 영역</h3>
            <p className="mcb-section-note">연결되면 아래 항목을 보여줍니다. 지금은 어떤 데이터가 채워질지 미리 보여주는 준비 화면입니다.</p>
            <div className="mcb-popular-grid">
              {POPULAR_PLACEHOLDERS.map((p) => (
                <div key={p.key} className="mcb-popular-card">
                  <div className="mcb-popular-head">
                    <span className="mcb-popular-title">{p.title}</span>
                    <span className="mcb-popular-status">{p.status}</span>
                  </div>
                  <span className="mcb-popular-willshow-label">연결 후 표시</span>
                  <ul className="mcb-popular-list">
                    {p.willShow.map((w) => (
                      <li key={w} className="mcb-popular-item">{w}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* ── 6-4. 필요 이벤트 체크리스트 ── */}
          <section className="mcb-section">
            <h3 className="mcb-section-title">필요 이벤트 체크리스트 <span className="mcb-checklist-count">{connected} / {TOTAL_BEHAVIOR_EVENTS} 연결됨</span></h3>
            <ul className="mcb-checklist">
              {CUSTOMER_BEHAVIOR_EVENTS.map((e) => (
                <li key={e.id} className={`mcb-check-row ${e.connected ? 'connected' : 'pending'}`}>
                  <span className="mcb-check-icon" aria-hidden="true">{e.connected ? '✓' : '○'}</span>
                  <div className="mcb-check-text">
                    <code className="mcb-check-name">{e.label}</code>
                    <span className="mcb-check-desc">{e.description}</span>
                  </div>
                  <span className={`mcb-check-status ${e.connected ? 'connected' : 'pending'}`}>
                    {e.connected ? '연결됨' : (e.id === 'begin_checkout' ? '미연결 · 주문 데이터 매칭 준비 가능' : '미연결')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <p className="mcb-footnote">
            ※ 현재 방문·클릭·이탈·전환 수치는 만들지 않습니다(가오픈 단계). GA4/GTM 연결 후 실제 행동 데이터로 분석을 활성화합니다.
            구매 데이터 매칭은 purchase 이벤트 연결 시점에 기존 주문 데이터 기준으로 준비되어 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
};
