import React from 'react';
import './MarketingCustomerBehaviorModal.css';
import { CUSTOMER_BEHAVIOR_EVENTS, TOTAL_BEHAVIOR_EVENTS, connectedBehaviorEventCount } from '../services/marketingCustomerBehaviorEvents';
import { buildMarketingBehaviorInsights } from '../services/marketingBehaviorInsights';
import { demoMarketingBehaviorEvents } from '../services/marketingBehaviorDemoData';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Customer Behavior Modal v0.1 + Data Contract v0 — 운영자 친화 행동 분석 화면
//
// 메인 4질문(①어디서 들어왔나 ②안에서 어디로 이동 ③무엇을 클릭 ④어디서 이탈)을
//   쉬운 말 + 표/막대로 보여준다. 기술 추적용어는 메인에서 숨기고 하단 details에서만 노출.
//
// ★ Data Contract: 모달은 더 이상 수치를 직접 만들지 않는다.
//   buildMarketingBehaviorInsights(events, {mode, fallbackDemo}) 결과만 렌더한다.
//   지금은 (demoMarketingBehaviorEvents, {mode:'demo'}) → 승인된 "데모 예시" 수치.
//   실 수집 시작 시 (liveEvents, {mode:'live', fallbackDemo:false})로 바꾸면 동일 화면이 실데이터로 채워짐.
//
// 데이터 정책: insights.dataStatus.isDemo=true면 "데모 예시" 배지/면책 표기(실데이터 오해 방지).
// PII 없음. 인과 단정 없음. WRITE/외부 API 연결 없음.
// ────────────────────────────────────────────────────────────────────────────

const DemoBadge: React.FC<{ small?: boolean }> = ({ small }) => (
  <span className={`mcb-demo-badge ${small ? 'small' : ''}`} title="실제 수집 데이터가 아닌 화면 구성용 예시값입니다">
    데모 예시
  </span>
);

const PctBar: React.FC<{ label: string; pct: number; tone: string; max?: number }> = ({ label, pct, tone, max = 100 }) => (
  <div className="mcb-bar-row">
    <span className="mcb-bar-label">{label}</span>
    <div className="mcb-bar-track">
      <div className={`mcb-bar-fill tone-${tone}`} style={{ width: `${Math.min(100, (pct / Math.max(1, max)) * 100)}%` }} />
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

  // 행동 인사이트 — 현재는 데모 input. 실 수집 시 input만 교체하면 됨(UI 불변).
  const insights = React.useMemo(
    () => buildMarketingBehaviorInsights(demoMarketingBehaviorEvents, { mode: 'demo', fallbackDemo: true }),
    []
  );

  if (!isOpen) return null;

  const connected = connectedBehaviorEventCount();
  const isDemo = insights.dataStatus.isDemo;
  const { topSources } = insights.acquisition;
  const { topPaths, dropOffs, summaryCards } = insights;
  const inflowMax = topSources[0]?.sharePercent ?? 100;
  const exitMax = dropOffs[0]?.dropOffPercent ?? 100;
  const clickGroups: { group: string; items: { label: string; pct: number }[] }[] = [
    { group: '배너 TOP', items: insights.topClicks.banners.map((b) => ({ label: b.label, pct: b.clickPercent })) },
    { group: '카테고리 TOP', items: insights.topClicks.categories.map((c) => ({ label: c.label, pct: c.clickPercent })) },
    { group: '상품 TOP', items: insights.topClicks.products.map((p) => ({ label: p.label, pct: p.clickPercent })) }
  ];
  const summaryItems = [
    { label: '가장 많은 유입', value: `${summaryCards.topSourceLabel} ${summaryCards.topSourcePercent}%`, tone: 'in' },
    { label: '많이 이동한 경로', value: summaryCards.topPathLabel, tone: 'path' },
    { label: '가장 많이 클릭된 영역', value: summaryCards.topClickLabel, tone: 'click' },
    { label: '이탈 주의', value: `${summaryCards.topDropOffLabel} ${summaryCards.topDropOffPercent}%`, tone: 'exit' }
  ];

  return (
    <div className="mcb-overlay" onClick={onClose}>
      <div className="mcb-modal" role="dialog" aria-modal="true" aria-labelledby="mcb-title" onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더 ── */}
        <div className="mcb-header">
          <div className="mcb-header-text">
            <div className="mcb-title-row">
              <h2 id="mcb-title" className="mcb-title">고객 행동 분석</h2>
              {isDemo && <DemoBadge />}
            </div>
            <p className="mcb-subtitle">
              손님이 <strong>어디서 들어와서</strong>, 쇼핑몰 안에서 <strong>어디로 이동하고</strong>,
              <strong> 무엇을 많이 누르고</strong>, <strong>어디서 빠져나가는지</strong>를 쉽게 보여주는 화면입니다.
            </p>
            {isDemo ? (
              <p className="mcb-demo-note">
                ※ 아래 수치는 화면 구성을 보여주기 위한 <strong>데모 예시</strong>입니다. 실제 손님 데이터가 아니며,
                추적이 연결되면 진짜 수치로 자동 바뀝니다.
              </p>
            ) : (
              <p className="mcb-demo-note">{insights.dataStatus.label}</p>
            )}
          </div>
          <button type="button" className="mcb-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="mcb-body">
          {/* ── 1. 운영자 관점 요약 카드 4 ── */}
          <section className="mcb-section">
            <div className="mcb-summary-grid">
              {summaryItems.map((c) => (
                <div key={c.label} className={`mcb-summary-card tone-${c.tone}`}>
                  <div className="mcb-summary-top">
                    <span className="mcb-summary-label">{c.label}</span>
                    {isDemo && <DemoBadge small />}
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
              {isDemo && <DemoBadge small />}
            </div>
            <p className="mcb-section-note">손님이 우리 쇼핑몰을 어디서 보고 들어왔는지입니다. 가장 위가 제일 많이 들어온 곳이에요.</p>
            <div className="mcb-bars">
              {topSources.map((d) => (
                <PctBar key={d.source} label={d.label} pct={d.sharePercent} tone="in" max={inflowMax} />
              ))}
            </div>
          </section>

          {/* ── 3. 쇼핑몰 내부 이동 경로 ── */}
          <section className="mcb-section">
            <div className="mcb-section-head">
              <h3 className="mcb-section-title">사람들이 많이 이동한 경로 <span className="mcb-section-sub">쇼핑몰 안에서</span></h3>
              {isDemo && <DemoBadge small />}
            </div>
            <p className="mcb-section-note">손님이 들어와서 어떤 순서로 화면을 옮겨 다녔는지 많은 순서대로 보여줍니다. 배너 위치·카테고리 순서를 정할 때 참고하세요.</p>
            <div className="mcb-path-table" role="table" aria-label="많이 이동한 경로">
              <div className="mcb-path-row mcb-path-head" role="row">
                <span role="columnheader">순위</span>
                <span role="columnheader">이동 경로</span>
                <span role="columnheader">비중</span>
              </div>
              {topPaths.map((p) => (
                <div className="mcb-path-row" role="row" key={p.rank}>
                  <span className="mcb-path-rank" role="cell">{p.rank}위</span>
                  <span className="mcb-path-route" role="cell">{p.pathLabels.join(' > ')}</span>
                  <span className="mcb-path-pct tabular-nums" role="cell">{p.sharePercent}%</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 4. 많이 클릭한 영역 ── */}
          <section className="mcb-section">
            <div className="mcb-section-head">
              <h3 className="mcb-section-title">무엇을 많이 눌렀나요 <span className="mcb-section-sub">많이 클릭한 영역</span></h3>
              {isDemo && <DemoBadge small />}
            </div>
            <div className="mcb-click-grid">
              {clickGroups.map((g) => (
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
              {isDemo && <DemoBadge small />}
            </div>
            <p className="mcb-section-note">손님이 구경하다가 많이 빠져나간 화면입니다. 이 지점을 개선하면 이탈을 줄일 수 있어요.</p>
            <div className="mcb-bars">
              {dropOffs.map((d) => (
                <PctBar key={d.label} label={d.label} pct={d.dropOffPercent} tone="exit" max={exitMax} />
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
