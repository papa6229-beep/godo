// @ts-nocheck — 고도몰 전용 상세페이지 레이아웃(벤더 생성기 확장). GODO 엄격 TS/lint 면제.
// components/PreviewGodo.tsx
// 정본: test/예제.jpg · 설명: test/가이드.jpg + test/고도몰 상세페이지 생성기 가이드.md
// 기존 Preview.tsx(바나나몰)와 완전 분리 → 회귀 0. 동일 data:ProductData를 다른 레이아웃으로 렌더.

import React, { forwardRef } from 'react';
import { Rnd } from 'react-rnd';
import type { ProductData } from '../types';

// 고도몰 브랜딩(footer·저작권). 사장님 확정 시 이 한 곳만 교체. [1.4에서 섬네일과 함께 확정]
export const GODO_BRAND = {
  name: 'GODO MALL',
  copyright: 'COPYRIGHT © GODO MALL. ALL RIGHTS RESERVED.',
};

const isGradient = (color: string) => !!color && color.toLowerCase().includes('gradient');

// 테마 컬러를 텍스트에 적용(그라데이션이면 clip, 단색이면 color)
const themedText = (themeColor: string) => isGradient(themeColor) ? {
  backgroundImage: themeColor,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  color: 'transparent',
} : { color: themeColor };

// 테마 액센트 점(●)
const Dot = ({ color, size = 16 }: { color: string; size?: number }) => (
  <span
    aria-hidden
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      flexShrink: 0,
      background: isGradient(color) ? undefined : color,
      backgroundImage: isGradient(color) ? color : undefined,
    }}
  />
);

// ##강조## → 테마 컬러 하이라이트
const renderHighlightText = (text: string, themeColor: string) => {
  if (!text) return null;
  return text.split(/(##.*?##)/g).map((part, i) => {
    if (part.startsWith('##') && part.endsWith('##')) {
      return <span key={i} style={{ ...themedText(themeColor), fontWeight: 700 }}>{part.replace(/##/g, '')}</span>;
    }
    return <span key={i}>{part}</span>;
  });
};

interface PreviewGodoProps {
  data: ProductData;
  onOptionLayoutChange?: (id: string, layout: { x: number, y: number, width: number, height: number }) => void;
  onPackageLayoutChange: (layout: { x: number, y: number, width: number, height: number }) => void;
  onWatermarkLayoutChange: (id: string, layout: { x: number, y: number, width: number, height: number }) => void;
}

const PreviewGodo = forwardRef<HTMLDivElement, PreviewGodoProps>(({ data, onPackageLayoutChange, onWatermarkLayoutChange }, ref) => {
  const {
    productNameKr, productNameEn, brandName, themeColor, summaryInfo, options,
    mainImage, packageImage, featureImage, sizeImage, featureTitle,
    point1Title, point2Title, aiPoint1Desc, aiPoint2Desc,
  } = data;

  const accent = themeColor;
  const maker = (brandName || summaryInfo?.maker || '').trim();
  const keyFeatures = (data.keyFeatures || []).filter((f) => f && ((f.title || '').trim() || (f.desc || '').trim()));

  // 스펙 가로행: 채워진 항목만(예제: 타입/재질/치수/무게/전원)
  const specRow = [
    { label: '타입', value: summaryInfo?.type },
    { label: '재질', value: summaryInfo?.material },
    { label: '치수', value: summaryInfo?.size },
    { label: '무게', value: summaryInfo?.weight },
    { label: '전원', value: summaryInfo?.power },
  ].filter((s) => (s.value || '').trim());

  // 워터마크 렌더러(기존 Preview와 동일 동작)
  const RenderWatermark = ({ targetKey }: { targetKey: string }) => {
    const settings = data.watermarkSettings?.[targetKey];
    if (!data.watermarkImage || !settings?.show) return null;
    const defaultWidth = 100, defaultHeight = 100;
    return (
      <Rnd
        size={{ width: settings.width || defaultWidth, height: settings.height || defaultHeight }}
        position={{ x: settings.x || 0, y: settings.y || 0 }}
        onDragStop={(e, d) => onWatermarkLayoutChange(targetKey, { x: d.x, y: d.y, width: settings.width || defaultWidth, height: settings.height || defaultHeight })}
        onResizeStop={(e, dir, refEl, delta, position) => onWatermarkLayoutChange(targetKey, { width: parseInt(refEl.style.width), height: parseInt(refEl.style.height), ...position })}
        bounds="parent"
        className="z-50 group"
      >
        <div className="w-full h-full relative cursor-move">
          <img src={data.watermarkImage} className="w-full h-full object-contain pointer-events-none select-none" alt="watermark" />
          <div className="absolute inset-0 border-2 border-transparent group-hover:border-purple-400 rounded transition-colors"></div>
          <div className="absolute bottom-[-4px] right-[-4px] w-3 h-3 bg-purple-500 rounded-full opacity-0 group-hover:opacity-100 cursor-nwse-resize"></div>
        </div>
      </Rnd>
    );
  };

  const SECTION_HEADING = 'text-[72px] leading-[0.9] font-black tracking-tighter text-gray-900';

  // Point 섹션 렌더 (01/02 동일 레이아웃)
  const renderPoint = (num: string, sectionId: string, title: string | undefined, blocks: [string | undefined, string | null | undefined, string][]) => {
    const active = title || blocks.some(([desc, img]) => desc || img);
    if (!active) return null;
    return (
      <section id={sectionId} className="px-[50px] py-16">
        <Dot color={accent} size={22} />
        <h2 className={`${SECTION_HEADING} mt-4`}>Point {num}</h2>
        {title && (
          <p className="flex items-center gap-2 text-2xl font-black text-gray-900 mt-3">
            {title} <Dot color={accent} size={12} />
          </p>
        )}
        <div className="mt-6 space-y-6">
          {blocks.map(([desc, img, key], i) => (
            <React.Fragment key={i}>
              {desc && (
                <p className="text-base font-medium text-gray-600 leading-relaxed whitespace-pre-line break-keep">
                  {renderHighlightText(desc, themeColor)}
                </p>
              )}
              {img && (
                <div className="relative w-full overflow-hidden rounded-2xl bg-gray-50">
                  <img src={img} className="w-full h-auto block" alt={`point-${num}-${i}`} />
                  <RenderWatermark targetKey={key} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </section>
    );
  };

  // 패키지 오버레이 기본값(메인이미지 700 우하단)
  const pkg = data.packageLayout || { x: 470, y: 440, width: 210, height: 250 };

  return (
    <div className="flex flex-col items-center bg-gray-100">
      <div
        ref={ref}
        id="detail-page-container"
        className="bg-white overflow-hidden"
        style={{ width: 800, minHeight: 1200, fontFamily: 'Pretendard, "Pretendard Variable", -apple-system, sans-serif' }}
      >
        {/* ===== HERO ===== */}
        <header id="preview-top" className="px-[50px] pt-14 pb-8">
          {/* 제조사 (우상단 고정) */}
          <div className="text-right mb-3">
            <span className="text-2xl font-black tracking-tight text-gray-900">{maker || 'BRAND'}</span>
          </div>

          {/* 메인 이미지 + 패키지 오버레이 */}
          <div id="preview-main" className="relative mx-auto bg-white overflow-hidden" style={{ width: 700, height: 700 }}>
            {mainImage ? (
              <img src={mainImage} className="w-full h-full object-contain block" alt="Main" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                <span className="text-gray-300 font-black text-4xl">MAIN IMAGE 700×700</span>
              </div>
            )}
            <RenderWatermark targetKey="mainImage" />

            {/* 패키지 이미지 (드래그 이동/리사이즈, 메인이미지 내부 bounds) */}
            {(data.isPackageImageEnabled ?? true) && (
              <div id="preview-package" className="absolute inset-0 pointer-events-none">
                <Rnd
                  size={{ width: pkg.width, height: pkg.height }}
                  position={{ x: pkg.x, y: pkg.y }}
                  onDragStop={(e, d) => onPackageLayoutChange({ x: d.x, y: d.y, width: pkg.width, height: pkg.height })}
                  onResizeStop={(e, dir, refEl, delta, position) => onPackageLayoutChange({ width: parseInt(refEl.style.width), height: parseInt(refEl.style.height), ...position })}
                  bounds="parent"
                  className="group pointer-events-auto z-10"
                >
                  <div className="w-full h-full flex flex-col select-none">
                    <div className="w-full flex-1 bg-white rounded-2xl shadow-[var(--shadow-lg)] border border-gray-100 overflow-hidden flex items-center justify-center">
                      {packageImage ? (
                        <img src={packageImage} className="w-full h-full object-contain p-2 pointer-events-none" alt="Package" />
                      ) : (
                        <span className="text-gray-300 font-bold text-sm">PACKAGE</span>
                      )}
                    </div>
                    <div className="bg-gray-900 text-white text-center font-black text-sm tracking-wide py-2 rounded-xl -mt-3 mx-3 relative z-10 shadow-md">
                      package desing
                    </div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 cursor-nwse-resize"></div>
                  </div>
                </Rnd>
              </div>
            )}
          </div>

          {/* 상품명(한글) + 영문명(1차) — 예제 정본: 상품명은 블랙, 액센트는 점(●)에만 */}
          <h1 className="mt-8 text-[52px] leading-[1.05] font-black tracking-tight break-keep text-gray-900">
            {productNameKr || '상품명을 입력하세요'}
          </h1>
          <p className="mt-1 text-xl font-medium tracking-[0.15em] text-gray-400 uppercase">
            {productNameEn || 'PRODUCT ENGLISH NAME'}
          </p>

          {/* 스펙 가로행 */}
          {specRow.length > 0 && (
            <div id="preview-spec" className="mt-10 flex gap-6">
              {specRow.map((s, i) => (
                <div key={i} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-gray-500">
                    <span>{s.label}</span><Dot color={accent} size={9} />
                  </div>
                  <div className="border-t-2 border-gray-900 my-2"></div>
                  <div className="text-base font-black text-gray-900 break-keep">{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </header>

        {/* ===== KEY FEATURE ===== */}
        {(featureImage || keyFeatures.length > 0 || (featureTitle || '').trim()) && (
          <section id="preview-feature" className="px-[50px] py-16">
            <Dot color={accent} size={22} />
            <h2 className={`${SECTION_HEADING} mt-4`}>KEY<br />FEATURE</h2>
            {(featureTitle || '').trim() && (
              <p className="mt-3 text-lg font-bold text-gray-500 break-keep">{featureTitle}</p>
            )}
            <div className="flex gap-6 mt-10 items-start">
              {/* 좌: 특징 이미지 */}
              <div className="w-[300px] flex-shrink-0 relative rounded-2xl overflow-hidden bg-gray-50">
                {featureImage ? (
                  <img src={featureImage} className="w-full h-auto block" alt="Feature" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-gray-300 font-bold">FEATURE</div>
                )}
                <RenderWatermark targetKey="featureImage" />
              </div>
              {/* 우: 핵심특징 3항목 */}
              <div className="flex-1 space-y-4">
                {keyFeatures.length > 0 ? keyFeatures.map((f, i) => (
                  <div key={i} className="bg-gray-100 rounded-xl px-5 py-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Dot color={accent} size={12} />
                      <span className="font-black text-lg text-gray-900 break-keep">{f.title || `핵심특징 ${i + 1}`}</span>
                    </div>
                    {(f.desc || '').trim() && (
                      <p className="text-sm font-medium text-gray-600 leading-relaxed whitespace-pre-line break-keep">
                        {renderHighlightText(f.desc, themeColor)}
                      </p>
                    )}
                  </div>
                )) : (
                  <div className="text-gray-300 font-bold text-sm">핵심특징 3개를 입력하세요</div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===== 영문명 반복 마퀴 밴드(2차) ===== */}
        {(productNameEn || '').trim() && (
          <div className="border-y border-gray-200 py-4 overflow-hidden">
            <div className="whitespace-nowrap text-center text-gray-400 font-medium tracking-[0.25em] uppercase text-sm">
              {Array(6).fill(productNameEn).join('  ·  ')}
            </div>
          </div>
        )}

        {/* ===== OPTION CHECK ===== */}
        {options.length > 0 && (
          <section id="preview-option" className="px-[50px] py-16">
            <Dot color={accent} size={22} />
            <h2 className={`${SECTION_HEADING} mt-4`}>OPTION<br />CHECK</h2>
            <div className="grid gap-4 mt-10" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
              {options.map((opt) => (
                <div key={opt.id}>
                  <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center" style={{ aspectRatio: '3 / 4' }}>
                    {opt.image ? (
                      <img src={opt.image} className="w-full h-full object-contain p-3" alt={opt.name} />
                    ) : (
                      <span className="text-gray-300 font-bold text-sm">NO IMAGE</span>
                    )}
                  </div>
                  <div className="bg-gray-900 text-white text-center font-bold py-3 rounded-xl -mt-3.5 mx-3 relative z-10 shadow-md break-keep">
                    {opt.name || '옵션명'}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== POINT 01 / 02 ===== */}
        {renderPoint('01', 'preview-point1', point1Title, [
          [aiPoint1Desc, data.point1Image1, 'point1Image1'],
          [data.aiPoint1Desc2, data.point1Image2, 'point1Image2'],
          [data.aiPoint1Desc3, data.point1Image3, 'point1Image3'],
        ])}
        {renderPoint('02', 'preview-point2', point2Title, [
          [aiPoint2Desc, data.point2Image1, 'point2Image1'],
          [data.aiPoint2Desc2, data.point2Image2, 'point2Image2'],
          [data.aiPoint2Desc3, data.point2Image3, 'point2Image3'],
        ])}

        {/* ===== SIZE ===== */}
        {(sizeImage || (summaryInfo?.weight || '').trim()) && (
          <section id="preview-size" className="px-[50px] py-16 bg-gray-50">
            <h2 className={SECTION_HEADING}>SIZE</h2>
            <p className="flex items-center gap-2 text-base font-bold text-gray-500 mt-2 break-keep">
              측정 방법에 따라 약간의 오차가 있을 수 있습니다 <Dot color={accent} size={12} />
            </p>
            <div className="mt-8 rounded-2xl bg-white p-6 relative overflow-hidden">
              {sizeImage ? (
                <img src={sizeImage} className="w-full h-auto block" alt="Size" />
              ) : (
                <div className="w-full py-24 flex items-center justify-center text-gray-200 font-black text-3xl">SIZE IMAGE 700</div>
              )}
              <RenderWatermark targetKey="sizeImage" />
            </div>
            {(summaryInfo?.weight || '').trim() && (
              <div className="flex justify-center mt-8">
                <div className="inline-flex items-center gap-4 px-10 py-4 rounded-full border-2 bg-white" style={{ borderColor: isGradient(accent) ? '#c7d2fe' : accent }}>
                  <span className="text-sm font-bold text-gray-400 tracking-[0.2em] uppercase">Weight</span>
                  <span className="text-2xl font-black text-gray-900">{summaryInfo.weight}</span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ===== Footer (고도몰 브랜딩 · 1.4에서 확정) ===== */}
        <footer className="py-16 text-center bg-gray-900">
          <div className="mb-3">
            <span className="text-2xl font-black" style={themedText(themeColor)}>{GODO_BRAND.name}</span>
          </div>
          <p className="text-gray-500 text-xs tracking-[0.2em] font-medium">{GODO_BRAND.copyright}</p>
        </footer>
      </div>
    </div>
  );
});

export default PreviewGodo;
