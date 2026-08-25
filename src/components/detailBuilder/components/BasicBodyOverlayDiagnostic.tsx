// 기본형 본문 라이브 텍스트 오버레이 — **격리 진단 미리보기** (2026-08-25 실험).
//
// 이 컴포넌트가 하는 일은 "보여 주기" 하나뿐이다.
//   · 본문에 실제로 실린 원본 통이미지를 그대로 띄우고,
//   · 안전하다고 판정된 글자 자리에만 흰 사각 마스크 + HTML 글자를 겹쳐 보여 준다.
//   · 위험하다고 본 자리는 아무 것도 덮지 않고 사유만 목록에 적는다.
//
// 하지 않는 일 (지키지 않으면 이 실험의 의미가 없다)
//   · ProductData 를 바꾸지 않는다(onChange 없음). 저장·다운로드를 부르지 않는다.
//   · 실제 본문 출력(PreviewGodo)과 아무 관계가 없다 — 좌측 편집 패널 안에서만 산다.
//   · 기본은 접힘이다. 펼치지 않으면 화면과 성능에 영향이 없다.
import React from 'react';
import type {
  BasicBodyOverlayExperiment, BodyOverlayDecision, OverlayBodyImage,
} from '../services/basicBodyTextOverlay';
import './BasicBodyOverlayDiagnostic.css';

/** 미리보기 폭(px). 원본 픽셀 → 이 폭으로 비례 축소해 마스크·글자를 같은 배율로 얹는다. */
const PREVIEW_WIDTH = 360;

/** 세 가지 고정 스타일만 쓴다(상품별 스타일 생성 금지 — 이번 실험의 범위 밖). */
const TEXT_STYLE: Record<BodyOverlayDecision['role'], React.CSSProperties> = {
  heading: { fontSize: '4.2%', fontWeight: 800, color: '#111827', letterSpacing: '-0.01em' },
  body: { fontSize: '3.0%', fontWeight: 500, color: '#374151', lineHeight: 1.45 },
  label: { fontSize: '2.6%', fontWeight: 700, color: '#6B7280', letterSpacing: '0.02em' },
};

const SIGNAL_TEXT: Record<BasicBodyOverlayExperiment['signal'], { label: string; cls: string; help: string }> = {
  green: { label: 'GREEN', cls: 'obd-green', help: '안전하게 교체할 수 있는 글자만 나왔습니다.' },
  yellow: { label: 'YELLOW', cls: 'obd-yellow', help: '교체 가능한 글자와 원본을 지켜야 하는 글자가 섞여 있습니다.' },
  red: { label: 'RED', cls: 'obd-red', help: '글자는 찾았지만 안전하게 교체할 수 있는 자리가 없습니다 — 수동 처리 대상입니다.' },
};

/** 원본 픽셀 좌표를 미리보기 이미지 안의 % 로 바꾼다(HTML 저장·이미지 저장과 무관한 표시 계산). */
const pct = (value: number, total: number): string => `${total > 0 ? (value / total) * 100 : 0}%`;

const ImageBoard = React.memo(({ image, decisions }: { image: OverlayBodyImage; decisions: BodyOverlayDecision[] }) => {
  const replaced = decisions.filter((d) => d.outcome === 'replaced' && d.rect);
  const usable = image.width > 0 && image.height > 0;
  return (
    <div className="obd-board">
      <div className="obd-board-head">
        원본 파일 {image.sourceIndex + 1} · {usable ? `${image.width}×${image.height}px` : '크기 미상'}
        {' · '}교체 미리보기 {replaced.length}건
      </div>
      <div className="obd-stage" style={{ width: PREVIEW_WIDTH }}>
        <img className="obd-origin" src={image.src} alt={`본문 원본 ${image.sourceIndex + 1}`} />
        {usable && replaced.map((d) => (
          <div
            key={d.id}
            className="obd-patch"
            style={{
              left: pct(d.rect!.x, image.width),
              top: pct(d.rect!.y, image.height),
              width: pct(d.rect!.width, image.width),
              height: pct(d.rect!.height, image.height),
            }}
          >
            <span className="obd-mask" />
            <span className="obd-text" style={TEXT_STYLE[d.role]}>{d.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

const DecisionList = React.memo(({ title, items }: { title: string; items: BodyOverlayDecision[] }) => {
  if (!items.length) return null;
  return (
    <div className="obd-list">
      <div className="obd-list-title">{title} {items.length}건</div>
      <ul>
        {items.map((d) => (
          <li key={d.id}>
            <b>[밴드 {d.bandIndex} · {d.role}]</b> {d.text.replace(/\n/g, ' ')}
            <span className="obd-reason"> — {d.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

const BasicBodyOverlayDiagnostic: React.FC<{ experiment: BasicBodyOverlayExperiment }> = ({ experiment }) => {
  const signal = SIGNAL_TEXT[experiment.signal];
  const replaced = experiment.decisions.filter((d) => d.outcome === 'replaced');
  const kept = experiment.decisions.filter((d) => d.outcome === 'kept_raster');
  const dropped = experiment.decisions.filter((d) => d.outcome === 'rejected');
  const boards = experiment.images.filter((img) => experiment.decisions.some((d) => d.bodySourceIndex === img.bodySourceIndex));

  return (
    <details className="obd-root">
      <summary className="obd-summary">
        🧪 본문 글자 오버레이 진단(실험) — 검출 {experiment.detected} · 교체 {replaced.length} · 보존 {kept.length} · 제외 {dropped.length + experiment.rejected.length}
        <span className={`obd-signal ${signal.cls}`}>{signal.label}</span>
      </summary>
      <div className="obd-body">
        <p className="obd-help">{signal.help}</p>
        <p className="obd-help obd-warn">
          이 패널은 <b>가능성 시험 전용</b>입니다. 오른쪽 실제 상세페이지 출력·이미지 저장에는 연결되어 있지 않습니다.
        </p>

        {boards.length === 0
          ? <p className="obd-help">미리보기로 보여 줄 본문 원본이 없습니다.</p>
          : boards.map((img) => (
            <ImageBoard
              key={img.bodySourceIndex}
              image={img}
              decisions={experiment.decisions.filter((d) => d.bodySourceIndex === img.bodySourceIndex)}
            />
          ))}

        <DecisionList title="✅ 교체된 문구" items={replaced} />
        <DecisionList title="🖼 원본 보존" items={kept} />
        <DecisionList title="⛔ 진단 제외" items={dropped} />

        {experiment.rejected.length > 0 && (
          <div className="obd-list">
            <div className="obd-list-title">⛔ 형식 오류로 제외 {experiment.rejected.length}건</div>
            <ul>{experiment.rejected.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
      </div>
    </details>
  );
};

export default BasicBodyOverlayDiagnostic;
