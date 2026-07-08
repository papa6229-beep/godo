// @ts-nocheck — 고도몰 전용 상세페이지 레이아웃(벤더 생성기 확장). GODO 엄격 TS/lint 면제.
// components/PreviewGodo.tsx
// 정본: test/예제.jpg · 설명: test/가이드.jpg + test/고도몰 상세페이지 생성기 가이드.md
// 기존 Preview.tsx(바나나몰)와 완전 분리 → 회귀 0. 동일 data:ProductData를 다른 레이아웃으로 렌더.

import React, { forwardRef } from 'react';
import { Rnd } from 'react-rnd';
import type { ProductData } from '../types';

// 고도몰 브랜딩 단일 소스(footer·섬네일 공용). ⚠️ 사장님 확정 시 이 한 곳만 교체(현재 플레이스홀더).
export const GODO_BRAND = {
  footerName: 'GODO MALL',
  copyright: 'COPYRIGHT © GODO MALL. ALL RIGHTS RESERVED.',
  thumbBadge: 'SINCE 2026',
  thumbSlogan: '프리미엄 셀렉트 스토어',
  thumbName: '고도몰',
  thumbUrl: 'godomall.co.kr',
};

const isGradient = (color: string) => !!color && color.toLowerCase().includes('gradient');

const themedText = (themeColor: string) => isGradient(themeColor) ? {
  backgroundImage: themeColor,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  color: 'transparent',
} : { color: themeColor };

// 테마 액센트 점(●) — border/preflight 영향 없는 background 방식
const Dot = ({ color, size = 16 }: { color: string; size?: number }) => (
  <span
    aria-hidden
    style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, // 단색/그라데이션 문자열 모두 background 하나로 처리(shorthand 혼용 경고 방지)
    }}
  />
);

// 가로 라인 — border 유틸(preflight off 환경) 대신 배경 div로 확실히 렌더
const Hairline = ({ color = '#e5e7eb', thickness = 1, className = '' }: { color?: string; thickness?: number; className?: string }) => (
  <div className={`w-full ${className}`} style={{ height: thickness, background: color }} />
);

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

const PreviewGodo = forwardRef<HTMLDivElement, PreviewGodoProps>(({ data, onOptionLayoutChange, onPackageLayoutChange, onWatermarkLayoutChange }, ref) => {
  const {
    productNameKr, productNameEn, brandName, themeColor, summaryInfo, options,
    mainImage, packageImage, featureImage, sizeImage,
    point1Title, point2Title, aiPoint1Desc, aiPoint2Desc,
  } = data;

  const accent = themeColor;
  // ⑪ 수동 간격(px): section=섹션 상하여백, element=요소 간격, heading=제목↔내용
  const sp = data.godoSpacing || { section: 64, element: 24, heading: 40 };
  const maker = (brandName || summaryInfo?.maker || '').trim();
  const keyFeatures = data.keyFeatures && data.keyFeatures.length === 3
    ? data.keyFeatures
    : [{ title: '', desc: '' }, { title: '', desc: '' }, { title: '', desc: '' }];
  const featureSubtitle = (summaryInfo?.feature || '').trim(); // ⑤ 스펙 '특징' → KEY FEATURE 부제 자동

  // 스펙 가로행: 채워진 항목만(타입/재질/치수/무게/전원). '특징'은 여기 아니라 KEY FEATURE 부제로.
  const specRow = [
    { label: '타입', value: summaryInfo?.type },
    { label: '재질', value: summaryInfo?.material },
    { label: '치수', value: summaryInfo?.size },
    { label: '무게', value: summaryInfo?.weight },
    { label: '전원', value: summaryInfo?.power },
  ].filter((s) => (s.value || '').trim());

  // 워터마크 렌더러
  const RenderWatermark = ({ targetKey }: { targetKey: string }) => {
    const settings = data.watermarkSettings?.[targetKey];
    if (!data.watermarkImage || !settings?.show) return null;
    const dW = 100, dH = 100;
    return (
      <Rnd
        size={{ width: settings.width || dW, height: settings.height || dH }}
        position={{ x: settings.x || 0, y: settings.y || 0 }}
        onDragStop={(e, d) => onWatermarkLayoutChange(targetKey, { x: d.x, y: d.y, width: settings.width || dW, height: settings.height || dH })}
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

  // Point 섹션 렌더 (01/02 동일 레이아웃: 제목 → 부제 → 설명 → 이미지)
  const renderPoint = (num: string, sectionId: string, title: string | undefined, blocks: [string | undefined, string | null | undefined, string][], topDivider: boolean) => {
    const active = title || blocks.some(([desc, img]) => desc || img);
    if (!active) return null;
    return (
      <React.Fragment>
        {topDivider && (
          <div className="px-[50px]"><Hairline color="#111827" thickness={1} /></div>
        )}
        <section id={sectionId} className="px-[50px]" style={{ paddingTop: sp.section, paddingBottom: sp.section }}>
          <Dot color={accent} size={22} />
          <h2 className={`${SECTION_HEADING} mt-4`}>Point {num}</h2>
          {title && (
            <p className="flex items-center gap-2 text-2xl font-black text-gray-900 mt-3 break-keep">
              {title} <Dot color={accent} size={12} />
            </p>
          )}
          <div className="flex flex-col" style={{ marginTop: sp.heading, gap: sp.element }}>
            {blocks.map(([desc, img, key], i) => (
              <React.Fragment key={i}>
                {desc && (
                  <p className="text-base font-medium text-gray-600 leading-relaxed whitespace-pre-line break-keep">
                    {renderHighlightText(desc, themeColor)}
                  </p>
                )}
                {img && (
                  <div className="relative w-full overflow-hidden rounded-2xl">
                    <img src={img} className="w-full h-auto block" alt={`point-${num}-${i}`} />
                    <RenderWatermark targetKey={key} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>
      </React.Fragment>
    );
  };

  // 패키지 오버레이 기본값(히어로 영역 우하단). 이제 히어로 전체가 bounds → 메인이미지 밖으로도 이동 가능.
  const pkg = data.packageLayout || { x: 468, y: 430, width: 210, height: 250 };

  return (
    <div className="flex flex-col items-center bg-gray-100">
      <div
        ref={ref}
        id="detail-page-container"
        className="bg-white overflow-hidden"
        style={{ width: 800, minHeight: 1200, fontFamily: 'Pretendard, "Pretendard Variable", -apple-system, sans-serif' }}
      >
        {/* ===== HERO ===== */}
        <header id="preview-top" className="px-[50px] pt-14" style={{ paddingBottom: sp.section }}>
          {/* 제조사 (우상단 고정) */}
          <div className="text-right mb-3">
            <span className="text-2xl font-black tracking-tight text-gray-900">{maker || 'BRAND'}</span>
          </div>

          {/* 히어로 래퍼(relative) — 패키지가 이 영역 전체를 자유 이동(메인이미지 밖으로도 가능) */}
          <div className="relative">
            {/* 메인 이미지: 정사각 고정 해제 → 가로 700 고정, 세로는 비율대로. 아래 텍스트가 비율 따라 붙음(②) */}
            <div id="preview-main" className="relative mx-auto bg-white overflow-hidden" style={{ width: 700 }}>
              {mainImage ? (
                <img src={mainImage} className="w-full h-auto block" alt="Main" />
              ) : (
                <div className="w-full flex items-center justify-center bg-gray-100" style={{ height: 700 }}>
                  <span className="text-gray-300 font-black text-3xl">MAIN IMAGE (가로 700)</span>
                </div>
              )}
              <RenderWatermark targetKey="mainImage" />
            </div>

            {/* 상품명(한글, 블랙) + 영문명(1차) */}
            <h1 className="mt-8 text-[52px] leading-[1.05] font-black tracking-tight break-keep text-gray-900">
              {productNameKr || '상품명을 입력하세요'}
            </h1>
            <p className="mt-1 text-xl font-medium tracking-[0.15em] text-gray-400 uppercase break-all">
              {productNameEn || 'PRODUCT ENGLISH NAME'}
            </p>

            {/* 스펙 가로행 — 라벨●/가로라인/값. 긴 값도 컬럼 내 줄바꿈(⑨) */}
            <div id="preview-spec" className="mt-10">
              {specRow.length > 0 && (
                <div className="flex gap-5 items-start">
                  {specRow.map((s, i) => (
                    <div key={i} className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-gray-500 whitespace-nowrap">
                        <span>{s.label}</span><Dot color={accent} size={9} />
                      </div>
                      <Hairline color="#111827" thickness={2} className="my-2" />
                      <div className="text-[15px] font-black text-gray-900 break-keep leading-snug">{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 패키지 이미지 (히어로 전체 bounds, 드래그/리사이즈, 메인이미지 밖으로도 이동 ③) */}
            {(data.isPackageImageEnabled ?? true) && (
              <Rnd
                id="preview-package"
                size={{ width: pkg.width, height: pkg.height }}
                position={{ x: pkg.x, y: pkg.y }}
                onDragStop={(e, d) => onPackageLayoutChange({ x: d.x, y: d.y, width: pkg.width, height: pkg.height })}
                onResizeStop={(e, dir, refEl, delta, position) => onPackageLayoutChange({ width: parseInt(refEl.style.width), height: parseInt(refEl.style.height), ...position })}
                bounds="parent"
                className="group z-20"
              >
                <div className="w-full h-full flex flex-col select-none cursor-move">
                  <div className="w-full flex-1 bg-white rounded-2xl shadow-[var(--shadow-lg)] border border-gray-100 overflow-hidden flex items-center justify-center">
                    {packageImage ? (
                      <img src={packageImage} className="w-full h-full object-contain p-2 pointer-events-none" alt="Package" />
                    ) : (
                      <span className="text-gray-300 font-bold text-sm pointer-events-none">PACKAGE</span>
                    )}
                  </div>
                  <div className="bg-gray-900 text-white text-center font-black text-sm tracking-wide py-2 rounded-xl -mt-3 mx-3 relative z-10 shadow-md pointer-events-none">
                    package desing
                  </div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 cursor-nwse-resize"></div>
                </div>
              </Rnd>
            )}
          </div>
        </header>

        {/* ===== KEY FEATURE (상시 활성 ④: feature 이미지 슬롯 + 3항목 항상 노출) ===== */}
        <section id="preview-feature" className="px-[50px]" style={{ paddingTop: sp.section, paddingBottom: sp.section }}>
          <Dot color={accent} size={22} />
          <h2 className={`${SECTION_HEADING} mt-4`}>KEY<br />FEATURE</h2>
          {featureSubtitle && (
            <p className="mt-3 text-lg font-bold text-gray-500 break-keep">{featureSubtitle}</p>
          )}
          <div className="flex gap-6 items-start" style={{ marginTop: sp.heading }}>
            {/* 좌: 특징 이미지(상시) */}
            <div className="w-[300px] flex-shrink-0 relative rounded-2xl overflow-hidden bg-gray-50">
              {featureImage ? (
                <img src={featureImage} className="w-full h-auto block" alt="Feature" />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center text-gray-300 font-bold">FEATURE</div>
              )}
              <RenderWatermark targetKey="featureImage" />
            </div>
            {/* 우: 핵심특징 3항목(상시) */}
            <div className="flex-1 flex flex-col" style={{ gap: sp.element }}>
              {keyFeatures.map((f, i) => (
                <div key={i} className="bg-gray-100 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Dot color={accent} size={12} />
                    <span className="font-black text-lg text-gray-900 break-keep">{(f.title || '').trim() || `핵심특징 ${i + 1}`}</span>
                  </div>
                  {(f.desc || '').trim() && (
                    <p className="text-sm font-medium text-gray-600 leading-relaxed whitespace-pre-line break-keep">
                      {renderHighlightText(f.desc, themeColor)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== 영문명 반복 마퀴 밴드(2차) — 상하 가로라인 ⑦ ===== */}
        {(productNameEn || '').trim() && (
          <div>
            <Hairline color="#d1d5db" thickness={1} />
            <div className="py-4 overflow-hidden">
              <div className="whitespace-nowrap text-center text-gray-400 font-medium tracking-[0.25em] uppercase text-sm">
                {Array(6).fill(productNameEn).join('  ·  ')}
              </div>
            </div>
            <Hairline color="#d1d5db" thickness={1} />
          </div>
        )}

        {/* ===== OPTION CHECK — 자유 배치(Rnd) 복원 ⑫ ===== */}
        {options.length > 0 && (
          <section
            id="preview-option"
            className="px-[50px]"
            style={{ paddingTop: sp.section, paddingBottom: sp.section, minHeight: 260 + Math.max(0, ...options.map((o) => (o.y || 0) + (o.height || 400))) }}
          >
            <Dot color={accent} size={22} />
            <h2 className={`${SECTION_HEADING} mt-4`}>OPTION<br />CHECK</h2>
            <div className="relative w-full" style={{ minHeight: 420, marginTop: sp.heading }}>
              {options.map((opt) => (
                <Rnd
                  key={opt.id}
                  size={{ width: opt.width || 200, height: opt.height || 280 }}
                  position={{ x: opt.x || 0, y: opt.y || 0 }}
                  onDragStop={(e, d) => onOptionLayoutChange && onOptionLayoutChange(opt.id, { x: d.x, y: d.y, width: opt.width || 200, height: opt.height || 280 })}
                  onResizeStop={(e, dir, refEl, delta, position) => onOptionLayoutChange && onOptionLayoutChange(opt.id, { width: parseInt(refEl.style.width), height: parseInt(refEl.style.height), ...position })}
                  bounds="parent"
                  className="group z-10"
                >
                  <div className="w-full h-full flex flex-col select-none cursor-move">
                    <div className="w-full flex-1 rounded-2xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center">
                      {opt.image ? (
                        <img src={opt.image} className="w-full h-full object-contain p-3 pointer-events-none" alt={opt.name} />
                      ) : (
                        <span className="text-gray-300 font-bold text-sm pointer-events-none">NO IMAGE</span>
                      )}
                    </div>
                    <div className="bg-gray-900 text-white text-center font-bold py-2.5 rounded-xl -mt-3 mx-3 relative z-10 shadow-md break-keep pointer-events-none">
                      {opt.name || '옵션명'}
                    </div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 cursor-nwse-resize"></div>
                  </div>
                </Rnd>
              ))}
            </div>
          </section>
        )}

        {/* ===== POINT 01 / 02 (01-02 사이 가로라인 ⑦) ===== */}
        {renderPoint('01', 'preview-point1', point1Title, [
          [aiPoint1Desc, data.point1Image1, 'point1Image1'],
          [data.aiPoint1Desc2, data.point1Image2, 'point1Image2'],
          [data.aiPoint1Desc3, data.point1Image3, 'point1Image3'],
        ], false)}
        {renderPoint('02', 'preview-point2', point2Title, [
          [aiPoint2Desc, data.point2Image1, 'point2Image1'],
          [data.aiPoint2Desc2, data.point2Image2, 'point2Image2'],
          [data.aiPoint2Desc3, data.point2Image3, 'point2Image3'],
        ], true)}

        {/* ===== SIZE ===== */}
        {(sizeImage || (summaryInfo?.weight || '').trim()) && (
          <section id="preview-size" className="px-[50px] bg-gray-50" style={{ paddingTop: sp.section, paddingBottom: sp.section }}>
            <h2 className={SECTION_HEADING}>SIZE</h2>
            <p className="flex items-center gap-2 text-base font-bold text-gray-500 mt-2 break-keep">
              측정 방법에 따라 약간의 오차가 있을 수 있습니다 <Dot color={accent} size={12} />
            </p>
            <div className="mt-8 rounded-2xl bg-white p-6 relative overflow-hidden">
              {sizeImage ? (
                <img src={sizeImage} className="w-full h-auto block" alt="Size" />
              ) : (
                <div className="w-full py-24 flex items-center justify-center text-gray-200 font-black text-3xl">SIZE IMAGE (가로 700)</div>
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

export default PreviewGodo;
