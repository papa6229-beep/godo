// @ts-nocheck — 변환기 단순형(flow) 렌더러. 기존 PreviewGodo.tsx와 완전 분리(회귀0).
// 원본 충실 스택: 상단 텍스트 + 통이미지 세로 스택 + footer. 메인/스펙/포인트/사이즈 섹션 없음.
import React, { forwardRef } from 'react';
import { Rnd } from 'react-rnd';
import type { ProductData } from '../types';
import { GODO_BRAND } from './PreviewGodo';
import { getFlowBlocks } from '../services/flowBlocks';

const IMG_BORDER = '1px solid #e5e7eb';
const isGradient = (c: string) => !!c && c.toLowerCase().includes('gradient');

// 3차 제품 이미지: 비율에 따라 폭을 한 단계 작게·일관되게(전폭 금지, 가운데 정렬).
//   가로형/치수(넓음) 82% · 세로형 60% · 일반 66%. 2열 셀은 셀폭 100%. (모바일 완화는 export=고정폭이라 불요)
const FlowImage = ({ src, alt, twoCol }: { src: string; alt: string; twoCol: boolean }) => {
  const [tier, setTier] = React.useState<'wide' | 'portrait' | 'general'>('general');
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const w = e.currentTarget.naturalWidth, h = e.currentTarget.naturalHeight;
    if (w && h) { const r = w / h; setTier(r >= 1.65 ? 'wide' : r < 0.85 ? 'portrait' : 'general'); }
  };
  const maxWidth = twoCol ? '100%' : tier === 'wide' ? '82%' : tier === 'portrait' ? '60%' : '66%';
  return (
    <img src={src} onLoad={onLoad} alt={alt} className="block h-auto object-contain rounded-xl"
      style={{ maxWidth, maxHeight: twoCol ? 320 : 500, margin: '0 auto' }} />
  );
};
const themedText = (c: string) => isGradient(c)
  ? { backgroundImage: c, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }
  : { color: c };

// 1차 상단 소개문: 문장(다./요.) 단위로 줄바꿈해 문맥상 줄맞춤(결정론·AI콜 없음). ##강조##는 렌더가 처리.
const formatHeaderText = (t: string) =>
  (t || '').replace(/\s+/g, ' ').replace(/(다|요)\.\s+/g, '$1.\n').trim();

// 캡션 내 ##키워드## → 테마색 볼드 강조(godo 디자인 언어와 동일). 그 외는 그대로.
const renderHighlight = (text: string, themeColor: string) => {
  if (!text) return null;
  return text.split(/(##.*?##)/g).map((part, i) =>
    part.startsWith('##') && part.endsWith('##')
      ? <span key={i} style={{ ...themedText(themeColor), fontWeight: 800 }}>{part.replace(/##/g, '')}</span>
      : <span key={i}>{part}</span>,
  );
};

interface Props {
  data: ProductData;
  onWatermarkLayoutChange?: (id: string, layout: { x: number, y: number, width: number, height: number }) => void;
  onGapChange?: (id: string, value: number) => void;
}

const PreviewGodoFlow = forwardRef<HTMLDivElement, Props>(({ data, onWatermarkLayoutChange, onGapChange }, ref) => {
  const { productNameKr, productNameEn, brandName, themeColor, flowHeaderText, flowEyebrow } = data;
  const accent = themeColor;
  const blocks = getFlowBlocks(data);

  const gaps = data.godoGaps || {};
  const gapVal = (id: string, def: number) => (gaps[id] != null ? gaps[id] : def);
  // 이미지 사이 간격 드래그(위치별 독립). mouseup 놓쳐도 창 blur로 종료.
  const makeGapDrag = (id: string, def: number, step = 2) => (e: React.MouseEvent) => {
    if (!onGapChange) return;
    e.preventDefault(); e.stopPropagation();
    const y0 = e.clientY; const v0 = gapVal(id, def);
    const move = (ev: MouseEvent) => onGapChange(id, Math.max(0, Math.round((v0 + (ev.clientY - y0)) / step) * step));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); window.removeEventListener('blur', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); window.addEventListener('blur', up);
  };
  const GapBar = ({ id, def }: { id: string; def: number }) => {
    const v = gapVal(id, def);
    return (
      <div onMouseDown={makeGapDrag(id, def)} style={{ height: v }} title="드래그: 이미지 사이 간격"
        className="relative w-full cursor-ns-resize group/gap select-none">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-blue-400/0 group-hover/gap:bg-blue-400/60 transition-colors flex items-center justify-center">
          <span className="text-[10px] font-bold text-blue-600 bg-white/90 px-1.5 rounded opacity-0 group-hover/gap:opacity-100 whitespace-nowrap">↕ {v}</span>
        </div>
      </div>
    );
  };

  // 스택 이미지 위 워터마크(각 이미지 개별). godo와 동일한 조작감.
  const RenderWatermark = ({ targetKey }: { targetKey: string }) => {
    const s = data.watermarkSettings?.[targetKey];
    if (!data.watermarkImage || !s?.show) return null;
    return (
      <Rnd
        size={{ width: s.width || 100, height: s.height || 100 }}
        position={{ x: s.x || 0, y: s.y || 0 }}
        onDragStop={(e, d) => onWatermarkLayoutChange && onWatermarkLayoutChange(targetKey, { x: d.x, y: d.y, width: s.width || 100, height: s.height || 100 })}
        onResizeStop={(e, dir, refEl, delta, position) => onWatermarkLayoutChange && onWatermarkLayoutChange(targetKey, { width: parseInt(refEl.style.width), height: parseInt(refEl.style.height), ...position })}
        bounds="parent"
        className="z-50 group"
      >
        <div data-wm className="w-full h-full relative cursor-move">
          <img src={data.watermarkImage} className="w-full h-full object-contain pointer-events-none select-none" alt="watermark" />
          <div className="absolute inset-0 border-2 border-transparent group-hover:border-purple-400 rounded transition-colors"></div>
          <div className="absolute bottom-[-4px] right-[-4px] w-3 h-3 bg-purple-500 rounded-full opacity-0 group-hover:opacity-100 cursor-nwse-resize"></div>
        </div>
      </Rnd>
    );
  };

  const hasHeader = (flowHeaderText || '').trim() || (productNameKr || '').trim() || (brandName || '').trim()
    || (flowEyebrow || '').trim() || (productNameEn || '').trim();
  const HEADER_GAP = gapVal('flow-header-gap', 40);

  return (
    <div className="flex flex-col items-center bg-gray-100">
      <div
        ref={ref}
        id="detail-page-container"
        className="bg-white overflow-hidden"
        style={{ width: 800, minHeight: 600, fontFamily: 'Pretendard, "Pretendard Variable", -apple-system, sans-serif' }}
      >
        {/* ===== 상단 텍스트(단순형: 예쁘게) ===== */}
        {hasHeader && (
          <header className="px-[56px] pt-16 pb-2">
            {/* eyebrow(상품명 앞 [태그]) — 브랜드와 동일 크기, 액센트색 */}
            {(flowEyebrow || '').trim() && (
              <div className="text-sm font-black tracking-[0.15em] uppercase mb-4" style={themedText(accent)}>{flowEyebrow}</div>
            )}
            {/* 한글 상품명 — 큰 제목. leading 타이트+break-keep+pre-line → 긴 이름 2줄 자동/수동(godo 동일) */}
            {(productNameKr || '').trim() && (
              <h1 className="text-[34px] leading-[1.15] font-black tracking-tight text-gray-900 break-keep whitespace-pre-line mb-1">{productNameKr}</h1>
            )}
            {/* 영문/일본어 상품명(괄호 없이, 원문 그대로) + 브랜드 옆에 작게. 한글명과 간격 좁게(mt-0) */}
            {((productNameEn || '').trim() || (brandName || '').trim()) && (
              <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 mb-5">
                {(productNameEn || '').trim() && (
                  <span className="text-[15px] font-semibold tracking-wide text-gray-500">{productNameEn}</span>
                )}
                {(productNameEn || '').trim() && (brandName || '').trim() && (
                  <span className="w-px h-3 bg-gray-300 self-center" aria-hidden />
                )}
                {(brandName || '').trim() && (
                  <span className="text-xs font-bold tracking-[0.12em] uppercase text-gray-400">{brandName}</span>
                )}
              </div>
            )}
            {(flowHeaderText || '').trim() && (
              <p className="text-[17px] leading-[1.75] font-medium text-gray-600 break-keep whitespace-pre-line">{renderHighlight(formatHeaderText(flowHeaderText), themeColor)}</p>
            )}
          </header>
        )}
        {hasHeader && <div style={{ height: HEADER_GAP }} />}

        {/* ===== 이미지+캡션 블록 세로 스택 ===== */}
        {blocks.length === 0 ? (
          <div className="mx-[56px] mb-16 border-2 border-dashed border-gray-200 rounded-xl py-24 flex items-center justify-center text-gray-300 font-black text-2xl select-none">
            통이미지를 추가하세요
          </div>
        ) : (
          <div className="px-[56px] pb-16 flex flex-col">
            {(() => {
              const accentBar = isGradient(accent) ? { backgroundImage: accent } : { background: accent };
              const dimLine = { background: isGradient(accent) ? '#d1d5db' : accent, opacity: 0.3 };
              // 원본 레이아웃 보존: 2열(정사각컷 다수) / 1열(세로 통이미지). data.flowColumns로 판정.
              const cols = (data as any).flowColumns === 2 ? 2 : 1;
              const out: any[] = [];
              let grid: any[] = [];
              let secIdx = 0;
              let pointNum = 0; // 옵션 없는 상품의 3차 블록 번호(POINT 01, 02…)
              const hasAnyOption = blocks.some((b: any) => (b.option || '').trim());
              const flushGrid = () => {
                if (!grid.length) return;
                out.push(<div key={'grid' + out.length} className="grid grid-cols-2 gap-x-6 gap-y-10 my-8">{grid}</div>);
                grid = [];
              };
              const cell = (b: any, i: number, compact: boolean) => {
                const hasCap = (b.caption || '').trim();
                return (
                  <div key={b.id || i} className="flex flex-col gap-3.5">
                    {/* 이미지 크기 통일: 비율별 폭 캡 + 가운데 정렬(전폭 금지·들쭉날쭉 방지). */}
                    <div className="relative w-full flex justify-center">
                      <FlowImage src={b.image} alt={`flow-${i}`} twoCol={compact} />
                      <RenderWatermark targetKey={`flowImage${i}`} />
                    </div>
                    {hasCap && (
                      // 캡션도 가운데 정렬(이미지와 축 일치 → 시선 분산 해소). 상단 중앙 짧은 액센트바.
                      <div className="flex flex-col items-center gap-2.5 mt-1">
                        <span className="w-8 h-[3px] rounded-full" style={accentBar} />
                        <p className={`w-full font-medium text-gray-700 break-keep whitespace-pre-line text-center ${compact ? 'text-[14px] leading-[1.7]' : 'text-[16px] leading-[1.9]'}`}>
                          {renderHighlight(b.caption, themeColor)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              };
              blocks.forEach((b: any, i: number) => {
                const optChanged = (b.option || '') !== (blocks[i - 1]?.option || '');
                const showOptHeader = optChanged && (b.option || '').trim();
                const isMarketing = !!b.marketing; // 2차 마케팅 대표컷만 풀폭 보존. 캡션 없는 3차 제품컷은 아래 sized 경로로.
                if (showOptHeader) {
                  flushGrid();
                  out.push(
                    <div key={'opt' + i} className="mt-14 mb-6 flex items-center gap-3">
                      <span className="text-xs font-black tracking-[0.15em] uppercase px-2.5 py-1 rounded text-white" style={accentBar}>OPTION</span>
                      <span className="text-[22px] font-black text-gray-900 break-keep leading-tight">{b.option}</span>
                      <div className="flex-1 h-0.5 rounded-full" style={dimLine} />
                    </div>
                  );
                  secIdx = 0;
                }
                if (b.preserved) {
                  // 단순형3 2차 보존이미지: 원본 비율·중앙 정렬·축소 금지(3차 그리드/축소 클래스 배제).
                  flushGrid();
                  out.push(
                    <div key={'pres' + i} className="relative w-full flex justify-center" style={{ margin: '36px auto 52px' }}>
                      <img src={b.image} className="block h-auto object-contain" style={{ width: 'auto', maxWidth: '100%' }} alt={`flow-${i}`} />
                      <RenderWatermark targetKey={`flowImage${i}`} />
                    </div>
                  );
                  secIdx = 0;
                  return;
                }
                if (isMarketing) {
                  // 풀폭(엣지-투-엣지) — 2차 마케팅 대표컷(원본 보존). 다음 3차와 간격 확보(mb-10).
                  flushGrid();
                  out.push(
                    <div key={'full' + i} className="mt-2 mb-10 relative w-full overflow-hidden">
                      <img src={b.image} className="w-full h-auto block" alt={`flow-${i}`} />
                      <RenderWatermark targetKey={`flowImage${i}`} />
                    </div>
                  );
                  secIdx = 0;
                  return;
                }
                if (cols === 2) {
                  grid.push(cell(b, i, true)); // 2열 그리드에 누적(2개씩 흐름)
                } else {
                  // 1열 스택 구분(line.png 언어): 옵션 없는 상품 = POINT 넘버 뱃지 + 빨간 라인(구분감 강화).
                  //   옵션 있는 상품은 위 OPTION 헤더로 구분하므로 여기선 점 구분선 유지(혼동 방지).
                  if (!hasAnyOption) {
                    pointNum++;
                    out.push(
                      <div key={'pt' + i} className="mt-14 mb-6 flex items-center gap-3">
                        <span className="text-[11px] font-black tracking-[0.15em] uppercase px-2.5 py-1 rounded text-white" style={accentBar}>POINT</span>
                        <span className="text-[20px] font-black text-gray-900 tabular-nums leading-none">{String(pointNum).padStart(2, '0')}</span>
                        <div className="flex-1 h-0.5 rounded-full" style={dimLine} />
                      </div>
                    );
                  } else if (secIdx > 0) {
                    out.push(
                      <div key={'div' + i} className="flex items-center justify-center gap-2.5 my-8">
                        <span className="h-px w-10 rounded-full" style={dimLine} />
                        <span className="w-1.5 h-1.5 rounded-full" style={accentBar} />
                        <span className="h-px w-10 rounded-full" style={dimLine} />
                      </div>
                    );
                  }
                  out.push(<div key={'sec' + i}>{cell(b, i, false)}</div>);
                }
                secIdx++;
              });
              flushGrid();
              return out;
            })()}
          </div>
        )}

        {/* ===== Footer ===== */}
        <footer className="py-16 text-center bg-gray-900">
          <div className="mb-3">
            <span className="text-2xl font-black" style={themedText(themeColor)}>{GODO_BRAND.footerName}</span>
          </div>
          <p className="text-gray-500 text-xs tracking-[0.2em] font-medium">{GODO_BRAND.copyright}</p>
        </footer>
      </div>
    </div>
  );
});

export default PreviewGodoFlow;
