// @ts-nocheck — 변환기 단순형(flow) 렌더러. 기존 PreviewGodo.tsx와 완전 분리(회귀0).
// 원본 충실 스택: 상단 텍스트 + 통이미지 세로 스택 + footer. 메인/스펙/포인트/사이즈 섹션 없음.
import React, { forwardRef } from 'react';
import { Rnd } from 'react-rnd';
import type { ProductData } from '../types';
import { GODO_BRAND } from './PreviewGodo';

const IMG_BORDER = '1px solid #e5e7eb';
const isGradient = (c: string) => !!c && c.toLowerCase().includes('gradient');
const themedText = (c: string) => isGradient(c)
  ? { backgroundImage: c, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }
  : { color: c };

interface Props {
  data: ProductData;
  onWatermarkLayoutChange?: (id: string, layout: { x: number, y: number, width: number, height: number }) => void;
  onGapChange?: (id: string, value: number) => void;
}

const PreviewGodoFlow = forwardRef<HTMLDivElement, Props>(({ data, onWatermarkLayoutChange, onGapChange }, ref) => {
  const { productNameKr, productNameEn, brandName, themeColor, flowHeaderText, flowEyebrow } = data;
  const accent = themeColor;
  const images = Array.isArray(data.flowImages) ? data.flowImages.filter(Boolean) : [];

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
              <p className="text-[17px] leading-[1.75] font-medium text-gray-600 break-keep whitespace-pre-line">{flowHeaderText}</p>
            )}
          </header>
        )}
        {hasHeader && <div style={{ height: HEADER_GAP }} />}

        {/* ===== 통이미지 세로 스택 ===== */}
        {images.length === 0 ? (
          <div className="mx-[56px] mb-16 border-2 border-dashed border-gray-200 rounded-xl py-24 flex items-center justify-center text-gray-300 font-black text-2xl select-none">
            통이미지를 추가하세요
          </div>
        ) : (
          <div className="px-[56px] pb-16 flex flex-col">
            {images.map((src, i) => (
              <React.Fragment key={i}>
                {i > 0 && <GapBar id={`flow-img-gap-${i}`} def={16} />}
                <div className="relative w-full overflow-hidden" style={{ border: IMG_BORDER }}>
                  <img src={src} className="w-full h-auto block" alt={`flow-${i}`} />
                  <RenderWatermark targetKey={`flowImage${i}`} />
                </div>
              </React.Fragment>
            ))}
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
