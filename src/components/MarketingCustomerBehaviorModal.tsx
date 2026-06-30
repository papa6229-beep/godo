import React from 'react';
import './MarketingCustomerBehaviorModal.css';
import { CUSTOMER_BEHAVIOR_EVENTS, TOTAL_BEHAVIOR_EVENTS, connectedBehaviorEventCount } from '../services/marketingCustomerBehaviorEvents';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Customer Behavior Modal v0.1 — 운영자 친화 행동 분석 화면
//
// v0(체크리스트/설정 중심) → v0.1(운영자가 쉬운 말로 바로 이해하는 분석 화면)으로 개편.
//   메인 4질문: ① 어디서 들어왔나 ② 안에서 어디로 이동하나 ③ 무엇을 클릭하나 ④ 어디서 이탈하나
//   기술 추적용어는 메인에서 숨기고 하단 접힘 영역(아래 details)에서만 노출.
//
// 데이터 정책(이 모달 한정, 작업지시 승인): 실제 행동 데이터는 아직 미연결.
//   UI/UX 시안 목적의 "데모 예시" 수치를 보여주되, 반드시 "데모 예시" 배지를 명확히 표기해
//   실데이터로 오해되지 않게 한다. (대시보드 분석 facts/주문 데이터와는 무관한 가상 예시값)
// PII 미노출(이름/전화/이메일/주소/주문번호/회원식별자 없음). 인과 단정 없음. WRITE/외부 API 연결 없음.
// ────────────────────────────────────────────────────────────────────────────

// ── 데모 예시 데이터 (가상값 — 실데이터 아님. 화면에 "데모 예시" 배지 필수) ──────────
const DEMO_SUMMARY: { label: string; value: string; tone: 'in' | 'path' | 'click' | 'exit' }[] = [
  { label: '가장 많은 유입', value: '블로그 32%', tone: 'in' },
  { label: '많이 이동한 경로', value: '메인 > 신상품 > 상품상세', tone: 'path' },
  { label: '가장 많이 클릭된 영역', value: '메인 배너 2번', tone: 'click' },
  { label: '이탈 주의', value: '메인페이지 42%', tone: 'exit' }
];

const DEMO_INFLOW: { channel: string; pct: number }[] = [
  { channel: '블로그', pct: 32 },
  { channel: '검색', pct: 28 },
  { channel: '광고', pct: 21 },
  { channel: 'SNS', pct: 11 },
  { channel: '직접 방문', pct: 8 }
];

const DEMO_PATHS: { rank: number; path: string; pct: number }[] = [
  { rank: 1, path: '메인페이지 > 메인 배너 2번 > 신상품 카테고리 > 스위트 00 젤', pct: 34 },
  { rank: 2, path: '메인페이지 > 베스트 카테고리 > 에그 00', pct: 21 },
  { rank: 3, path: '메인페이지 > 검색 > 스위트 00 젤', pct: 16 },
  { rank: 4, path: '메인페이지 > 신상품 카테고리 > 미니 00', pct: 12 },
  { rank: 5, path: '메인페이지 > 이벤트 페이지 > 젤/로션 카테고리', pct: 9 }
];

const DEMO_CLICKS: { group: string; items: { label: string; pct: number }[] }[] = [
  { group: '배너 TOP', items: [{ label: '여름 기획전 배너', pct: 24 }, { label: '베스트 상품 배너', pct: 18 }, { label: '신규 회원 쿠폰 배너', pct: 13 }] },
  { group: '카테고리 TOP', items: [{ label: '신상품', pct: 31 }, { label: '바이브레이터', pct: 22 }, { label: '젤/로션', pct: 17 }] },
  { group: '상품 TOP', items: [{ label: '스위트 00 젤', pct: 12 }, { label: '에그 00', pct: 10 }, { label: '미니 00', pct: 8 }] }
];

const DEMO_EXITS: { spot: string; pct: number }[] = [
  { spot: '메인페이지', pct: 42 },
  { spot: '카테고리 보기 후 이탈', pct: 27 },
  { spot: '상품 상세 보기 후 이탈', pct: 18 },
  { spot: '장바구니 후 이탈', pct: 9 },
  { spot: '결제 시작 후 이탈', pct: 4 }
];

const DemoBadge: React.FC<{ small?: boolean }> = ({ small }) => (
  <span className={`mcb-demo-badge ${small ? 'small' : ''}`} title="실제 수집 데이터가 아닌 화면 구성용 예시값입니다">
    데모 예시
  </span>
);

// 가로 막대(공통) — 퍼센트 폭. 색 tone으로 섹션 구분.
const PctBar: React.FC<{ label: string; pct: number; tone: string; max?: number }> = ({ label, pct, tone, max = 100 }) => (
  <div className="mcb-bar-row">
    <span className="mcb-bar-label">{label}</span>
    <div className="mcb-bar-track">
      <div className={`mcb-bar-fill tone-${tone}`} style={{ width: `${Math.min(100, (pct / max) * 100)}%` }} />
    </div>
    <span className="mcb-bar-pct tabular-nums">{pct}%</span>
  </div>
);

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const MarketingCustomerBehaviorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const connected = connectedBehaviorEventCount();
  const inflowMax = DEMO_INFLOW[0]?.pct ?? 100;
  const exitMax = DEMO_EXITS[0]?.pct ?? 100;

  return (
    <div className="mcb-overlay" onClick={onClose}>
      <div className="mcb-modal" role="dialog" aria-modal="true" aria-labelledby="mcb-title" onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더 ── */}
        <div className="mcb-header">
          <div className="mcb-header-text">
            <div className="mcb-title-row">
              <h2 id="mcb-title" className="mcb-title">고객 행동 분석</h2>
              <DemoBadge />
            </div>
            <p className="mcb-subtitle">
              손님이 <strong>어디서 들어와서</strong>, 쇼핑몰 안에서 <strong>어디로 이동하고</strong>,
              <strong> 무엇을 많이 누르고</strong>, <strong>어디서 빠져나가는지</strong>를 쉽게 보여주는 화면입니다.
            </p>
            <p className="mcb-demo-note">
              ※ 아래 수치는 화면 구성을 보여주기 위한 <strong>데모 예시</strong>입니다. 실제 손님 데이터가 아니며,
              추적이 연결되면 진짜 수치로 자동 바뀝니다.
            </p>
          </div>
          <button type="button" className="mcb-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="mcb-body">
          {/* ── 1. 운영자 관점 요약 카드 4 ── */}
          <section className="mcb-section">
            <div className="mcb-summary-grid">
              {DEMO_SUMMARY.map((c) => (
                <div key={c.label} className={`mcb-summary-card tone-${c.tone}`}>
                  <div className="mcb-summary-top">
                    <span className="mcb-summary-label">{c.label}</span>
                    <DemoBadge small />
                  </div>
                  <span className="mcb-summary-value">{c.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 2. 외부 유입 경로 ── */}
          <section className="mcb-section">
            <div className="mcb-section-head">
              <h3 className="mcb-section-title">어디서 들어왔나요 <span className="mcb-section-sub">외부 유입 경로</span></h3>
              <DemoBadge small />
            </div>
            <p className="mcb-section-note">손님이 우리 쇼핑몰을 어디서 보고 들어왔는지입니다. 가장 위가 제일 많이 들어온 곳이에요.</p>
            <div className="mcb-bars">
              {DEMO_INFLOW.map((d) => (
                <PctBar key={d.channel} label={d.channel} pct={d.pct} tone="in" max={inflowMax} />
              ))}
            </div>
          </section>

          {/* ── 3. 쇼핑몰 내부 이동 경로 ── */}
          <section className="mcb-section">
            <div className="mcb-section-head">
              <h3 className="mcb-section-title">사람들이 많이 이동한 경로 <span className="mcb-section-sub">쇼핑몰 안에서</span></h3>
              <DemoBadge small />
            </div>
            <p className="mcb-section-note">손님이 들어와서 어떤 순서로 화면을 옮겨 다녔는지 많은 순서대로 보여줍니다. 배너 위치·카테고리 순서를 정할 때 참고하세요.</p>
            <div className="mcb-path-table" role="table" aria-label="많이 이동한 경로">
              <div className="mcb-path-row mcb-path-head" role="row">
                <span role="columnheader">순위</span>
                <span role="columnheader">이동 경로</span>
                <span role="columnheader">비중</span>
              </div>
              {DEMO_PATHS.map((p) => (
                <div className="mcb-path-row" role="row" key={p.rank}>
                  <span className="mcb-path-rank" role="cell">{p.rank}위</span>
                  <span className="mcb-path-route" role="cell">{p.path}</span>
                  <span className="mcb-path-pct tabular-nums" role="cell">{p.pct}%</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 4. 많이 클릭한 영역 ── */}
          <section className="mcb-section">
            <div className="mcb-section-head">
              <h3 className="mcb-section-title">무엇을 많이 눌렀나요 <span className="mcb-section-sub">많이 클릭한 영역</span></h3>
              <DemoBadge small />
            </div>
            <div className="mcb-click-grid">
              {DEMO_CLICKS.map((g) => (
                <div key={g.group} className="mcb-click-card">
                  <span className="mcb-click-group">{g.group}</span>
                  <ol className="mcb-click-list">
                    {g.items.map((it, i) => (
                      <li key={it.label} className="mcb-click-item">
                        <span className="mcb-click-rank">{i + 1}</span>
                        <span className="mcb-click-name">{it.label}</span>
                        <span className="mcb-click-pct tabular-nums">{it.pct}%</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          {/* ── 5. 이탈이 많은 지점 ── */}
          <section className="mcb-section">
            <div className="mcb-section-head">
              <h3 className="mcb-section-title">어디서 많이 나갔나요 <span className="mcb-section-sub">이탈이 많은 지점</span></h3>
              <DemoBadge small />
            </div>
            <p className="mcb-section-note">손님이 구경하다가 많이 빠져나간 화면입니다. 이 지점을 개선하면 이탈을 줄일 수 있어요.</p>
            <div className="mcb-bars">
              {DEMO_EXITS.map((d) => (
                <PctBar key={d.spot} label={d.spot} pct={d.pct} tone="exit" max={exitMax} />
              ))}
            </div>
          </section>

          {/* ── 6. 데이터 연결 상태 (하단 접힘 — 기술 용어는 여기서만) ── */}
          <details className="mcb-tech">
            <summary className="mcb-tech-summary">
              데이터 연결 상태 보기
              <span className="mcb-tech-count tabular-nums">{connected} / {TOTAL_BEHAVIOR_EVENTS} 연결됨</span>
            </summary>
            <div className="mcb-tech-body">
              <p className="mcb-tech-note">실제 행동 데이터는 추후 연결 후 자동 반영됩니다. 아래는 어떤 추적이 준비되어 있는지 보여줍니다.</p>
              <ul className="mcb-tech-list">
                {CUSTOMER_BEHAVIOR_EVENTS.map((e) => (
                  <li key={e.id} className={`mcb-tech-row ${e.connected ? 'connected' : 'pending'}`}>
                    <span className="mcb-tech-icon" aria-hidden="true">{e.connected ? '✓' : '○'}</span>
                    <div className="mcb-tech-text">
                      <span className="mcb-tech-easy">{e.easyLabel} 추적</span>
                      <span className="mcb-tech-desc">{e.description}</span>
                    </div>
                    <code className="mcb-tech-code">{e.label}</code>
                    <span className={`mcb-tech-status ${e.connected ? 'connected' : 'pending'}`}>
                      {e.connected ? '연결됨' : '연결 전'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <p className="mcb-footnote">
            ※ 이 화면의 수치는 모두 <strong>데모 예시</strong>(가상값)입니다. 실제 방문·클릭·이탈 데이터는 만들지 않으며,
            추적이 연결되면 같은 화면에 진짜 수치가 자동으로 채워집니다.
          </p>
        </div>
      </div>
    </div>
  );
};
