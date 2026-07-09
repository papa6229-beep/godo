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
  onFeatureImageLayoutChange?: (layout: { x: number, y: number, width: number, height: number }) => void;
  onSpacingChange?: (spacing: { section: number, element: number, heading: number }) => void;
  onGapChange?: (id: string, value: number) => void;
}

// ① 모든 이미지 영역 공용 테두리(옵션 이미지와 동일 · 얇고 옅은 회색). 패키지/투명 feature 제외.
const IMG_BORDER = '1px solid #e5e7eb';

// 미리보기 섹션 클릭 → 좌측 Editor 해당 입력부로 스크롤(⑧ 역방향)
const scrollEditorTo = (editorId: string) => {
  const el = document.getElementById(editorId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const PreviewGodo = forwardRef<HTMLDivElement, PreviewGodoProps>(({ data, onOptionLayoutChange, onPackageLayoutChange, onWatermarkLayoutChange, onFeatureImageLayoutChange, onSpacingChange, onGapChange }, ref) => {
  const {
    productNameKr, productNameEn, brandName, themeColor, summaryInfo, options,
    mainImage, packageImage, featureImage, sizeImage,
    point1Title, point2Title, aiPoint1Desc, aiPoint2Desc,
  } = data;

  const accent = themeColor;
  // ⑪ 수동 간격(px): section=섹션 상하여백, element=블록 사이(이미지↔다음설명), heading=제목↔내용
  const sp = data.godoSpacing || { section: 56, element: 32, heading: 24 };
  const BLOCK_INNER_GAP = 12; // ⑨ 설명↔자기 이미지: 항상 가깝게(블록 내부 고정)
  // ⑤ KEY FEATURE 이미지 마우스 위치·크기 (react-rnd 오프셋 버그 회피 → 커스텀 absolute 드래그/리사이즈)
  const fl = data.featureImageLayout || { x: 0, y: 0, width: 320, height: 380 };
  const startFeatureDrag = (e: React.MouseEvent) => {
    if (!onFeatureImageLayoutChange) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, fx = fl.x || 0, fy = fl.y || 0;
    const move = (ev: MouseEvent) => onFeatureImageLayoutChange({ x: fx + (ev.clientX - x0), y: fy + (ev.clientY - y0), width: fl.width || 320, height: fl.height || 380 });
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };
  const startFeatureResize = (e: React.MouseEvent) => {
    if (!onFeatureImageLayoutChange) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, fw = fl.width || 320, fh = fl.height || 380;
    const move = (ev: MouseEvent) => onFeatureImageLayoutChange({ x: fl.x || 0, y: fl.y || 0, width: Math.max(120, fw + (ev.clientX - x0)), height: Math.max(120, fh + (ev.clientY - y0)) });
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };

  // ⑬ 간격 독립 조절: 위치마다 고유 id로 저장(godoGaps). 지정 없으면 종류별 기본값(sp)으로 폴백.
  //    → 같은 종류(heading/element/section)라도 위치별로 따로 조절됨(한 곳 드래그가 다른 곳에 영향 없음).
  const gaps = data.godoGaps || {};
  const gapVal = (id: string, kind: 'section' | 'heading' | 'element') => (gaps[id] != null ? gaps[id] : sp[kind]);
  // 위치(id)별 드래그 핸들 생성기. export 시 hover-off로 숨김.
  const makeGapDrag = (id: string, kind: 'section' | 'heading' | 'element', step: number) => (e: React.MouseEvent) => {
    if (!onGapChange && !onSpacingChange) return;
    e.preventDefault(); e.stopPropagation();
    const y0 = e.clientY; const v0 = gapVal(id, kind);
    const commit = (nv: number) => {
      if (onGapChange) onGapChange(id, nv);
      else if (onSpacingChange) onSpacingChange({ ...sp, [kind]: nv }); // 구버전 폴백
    };
    const move = (ev: MouseEvent) => commit(Math.max(2, Math.round((v0 + (ev.clientY - y0)) / step) * step));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };
  // 섹션 상단 간격 핸들(pill) — 섹션마다 고유 id로 독립
  const SectionGap = ({ id }: { id: string }) => (
    <div onMouseDown={makeGapDrag(id, 'section', 4)} title="드래그하여 이 섹션 간격 조절 (임시저장으로 고정)"
      className="absolute left-1/2 -translate-x-1/2 top-2 flex items-center gap-1 px-3 py-1 rounded-full bg-gray-900/85 text-white text-[11px] font-bold cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity z-30 select-none">
      ⇕ 섹션 {gapVal(id, 'section')}
    </div>
  );
  // ⑥⑦⑧⑨⑬ 실제 간격 위치의 드래그 바(높이=값) — 위치별 고유 id로 독립. hover 시 파란 그립+수치, export엔 빈 공간만.
  const GapBar = ({ kind, id }: { kind: 'heading' | 'element'; id: string }) => {
    const v = gapVal(id, kind);
    return (
      <div onMouseDown={makeGapDrag(id, kind, 2)} style={{ height: v }}
        title={kind === 'heading' ? '드래그: 제목↔내용 간격' : '드래그: 블록(이미지↔다음설명) 간격'}
        className="relative w-full cursor-ns-resize group/gap select-none">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-blue-400/0 group-hover/gap:bg-blue-400/60 transition-colors flex items-center justify-center">
          <span className="text-[10px] font-bold text-blue-600 bg-white/90 px-1.5 rounded opacity-0 group-hover/gap:opacity-100 whitespace-nowrap">↕ {kind === 'heading' ? '제목' : '블록'} {v}</span>
        </div>
      </div>
    );
  };
  // ③ 영문명 마퀴 밴드(섹션 구분용) — KEY FEATURE 아래 + SIZE 위 2곳에 동일 렌더
  const MarqueeBand = () => !(productNameEn || '').trim() ? null : (
    <div>
      <Hairline color="#d1d5db" thickness={1} />
      <div className="py-4 overflow-hidden">
        <div className="whitespace-nowrap text-center text-gray-400 font-medium tracking-[0.25em] uppercase text-sm">
          {Array(6).fill(productNameEn).join('  ·  ')}
        </div>
      </div>
      <Hairline color="#d1d5db" thickness={1} />
    </div>
  );

  const maker = (brandName || summaryInfo?.maker || '').trim();
  const keyFeatures = data.keyFeatures && data.keyFeatures.length === 3
    ? data.keyFeatures
    : [{ title: '', desc: '' }, { title: '', desc: '' }, { title: '', desc: '' }];
  const featureSubtitle = (summaryInfo?.feature || '').trim(); // ⑤ 스펙 '특징' → KEY FEATURE 부제 자동

  // 스펙 2행 배치(②): 1행 타입/재질/치수, 2행 무게/전원(좌측 → 우측 패키지에 안 가림). 채워진 항목만.
  const specRow1 = [
    { label: '타입', value: summaryInfo?.type },
    { label: '재질', value: summaryInfo?.material },
    { label: '치수', value: summaryInfo?.size },
  ].filter((s) => (s.value || '').trim());
  const specRow2 = [
    { label: '무게', value: summaryInfo?.weight },
    { label: '전원', value: summaryInfo?.power },
  ].filter((s) => (s.value || '').trim());
  const hasSpec = specRow1.length > 0 || specRow2.length > 0;
  // ③ 각 스펙 열 고정폭(약 145px) → 3열이 상세폭(700)의 2/3 이내, 5개 균등폭
  const SpecCol = ({ s }: { s: { label: string; value: string } }) => (
    <div style={{ width: 145 }} className="flex-shrink-0 min-w-0">
      <div className="flex items-center gap-1.5 text-sm font-bold text-gray-500 whitespace-nowrap"><span>{s.label}</span><Dot color={accent} size={9} /></div>
      <Hairline color="#111827" thickness={2} className="my-2" />
      <div className="text-[15px] font-black text-gray-900 break-keep leading-snug">{s.value}</div>
    </div>
  );

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
    // ⑥ '__ENABLED__' 센티넬(빈 활성 슬롯)은 실제 값이 아님 → 정리.
    const cleanBlocks = blocks.map(([descRaw, imgRaw, key]) => ({
      desc: (descRaw && descRaw !== '__ENABLED__') ? descRaw : '',
      imgReal: imgRaw && imgRaw !== '__ENABLED__' ? imgRaw : '',
      imgEnabled: imgRaw === '__ENABLED__',
      key,
    }));
    const cleanTitle = (title && title !== '__ENABLED__') ? title : '';
    const active = cleanTitle || cleanBlocks.some((b) => b.desc || b.imgReal || b.imgEnabled);
    if (!active) return <div id={sectionId} />; // ⑧ 비활성이어도 스크롤 앵커 유지
    return (
      <React.Fragment>
        {topDivider && (
          <div className="px-[50px]"><Hairline color="#111827" thickness={1} /></div>
        )}
        <section id={sectionId} className="px-[50px] relative group" style={{ paddingTop: gapVal(`${sectionId}-sec`, 'section'), paddingBottom: gapVal(`${sectionId}-sec`, 'section') }} onClick={() => scrollEditorTo(sectionId.replace('preview-', 'editor-'))}>
          <SectionGap id={`${sectionId}-sec`} />
          <Dot color={accent} size={22} />
          <h2 className={`${SECTION_HEADING} mt-4`}>Point {num}</h2>
          {cleanTitle && (
            <p className="flex items-center gap-2 text-2xl font-black text-gray-900 mt-3 break-keep">
              {cleanTitle} <Dot color={accent} size={12} />
            </p>
          )}
          {/* ⑧ 제목(main)↔첫 설명 간격(독립 드래그) — 4.png: 여기를 좁히면 point01만 반영 */}
          <GapBar kind="heading" id={`${sectionId}-head`} />
          {/* 각 블록: 설명↔자기 이미지는 가깝게(BLOCK_INNER_GAP), 블록끼리는 GapBar(element)로 벌림 ⑨ */}
          <div className="flex flex-col">
            {cleanBlocks.filter((b) => b.desc || b.imgReal || b.imgEnabled).map((b, i) => {
              // ② 슬롯(1/2/3) 기준 앵커 → 좌측 입력(1-1/1-2/1-3)이 각자 위치로 정확히 스크롤(1-2 고정 버그 해결)
              const slot = (String(b.key).match(/\d+$/) || ['1'])[0];
              return (
                <React.Fragment key={i}>
                  {/* ⑤.png: image 1-1 ↔ 설명 1-2 간격(블록 사이) — 슬롯 기준 id(다른 슬롯 토글해도 값 유지) */}
                  {i > 0 && <GapBar kind="element" id={`${sectionId}-el-${slot}`} />}
                  <div id={`${sectionId}-${slot}`} className="flex flex-col" style={{ gap: BLOCK_INNER_GAP }}>
                  {b.desc && (
                    i === 0 ? (
                      // 첫 블록: 위에 Point 제목+부제(main)가 있어 그대로 평문
                      <p className="text-base font-medium text-gray-600 leading-relaxed whitespace-pre-line break-keep">
                        {renderHighlightText(b.desc, themeColor)}
                      </p>
                    ) : (
                      // ⑤ 서브 블록(1-2/1-3): 위에 main이 없어 허전 → 액센트 바 콜아웃으로 앵커(디자인 의도 부여)
                      <div className="flex gap-4">
                        <div style={{ width: 4, borderRadius: 999, background: accent, flexShrink: 0 }} />
                        <p className="flex-1 py-0.5 text-base font-medium text-gray-600 leading-relaxed whitespace-pre-line break-keep">
                          {renderHighlightText(b.desc, themeColor)}
                        </p>
                      </div>
                    )
                  )}
                  {b.imgReal && (
                    <div className="relative w-full overflow-hidden" style={{ border: IMG_BORDER }}>
                      <img src={b.imgReal} className="w-full h-auto block" alt={`point-${num}-${i}`} />
                      <RenderWatermark targetKey={b.key} />
                    </div>
                  )}
                  {!b.imgReal && b.imgEnabled && (
                    <div className="w-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 font-black text-2xl" style={{ height: 240 }}>이미지 영역</div>
                  )}
                  </div>
                </React.Fragment>
              );
            })}
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
          {/* 제조사 (우상단 고정) — ① 브랜드 입력 시 여기로 스크롤 */}
          <div id="preview-maker" className="text-right mb-3">
            <span className="text-2xl font-black tracking-tight text-gray-900">{maker || 'BRAND'}</span>
          </div>

          {/* 히어로 래퍼(relative) — 패키지가 이 영역 전체를 자유 이동(메인이미지 밖으로도 가능) */}
          <div className="relative">
            {/* 메인 이미지: 정사각 고정 해제 → 가로 700 고정, 세로는 비율대로. 아래 텍스트가 비율 따라 붙음(②) */}
            <div id="preview-main" className="relative mx-auto bg-white overflow-hidden" style={{ width: 700, border: IMG_BORDER }}>
              {mainImage ? (
                <img src={mainImage} className="w-full h-auto block" alt="Main" />
              ) : (
                <div className="w-full flex items-center justify-center bg-gray-100" style={{ height: 700 }}>
                  <span className="text-gray-300 font-black text-3xl">MAIN IMAGE (가로 700)</span>
                </div>
              )}
              <RenderWatermark targetKey="mainImage" />
            </div>

            {/* 상품명(한글, 블랙, ④ 줄바꿈 반영) + 영문명(1차). ① 입력 시 여기로 스크롤 */}
            <h1 id="preview-name" className="mt-8 text-[52px] leading-[1.05] font-black tracking-tight break-keep text-gray-900 whitespace-pre-line">
              {productNameKr || '상품명을 입력하세요'}
            </h1>
            <p className="mt-1 text-xl font-medium tracking-[0.15em] text-gray-400 uppercase break-all">
              {productNameEn || 'PRODUCT ENGLISH NAME'}
            </p>

            {/* 스펙 2행(②) — 1행 타입/재질/치수, 2행 무게/전원(좌측). 라벨●/가로라인/값, 긴 값 줄바꿈(⑨) */}
            <div id="preview-spec" className="mt-10 space-y-4">
              {specRow1.length > 0 && (
                <div className="flex gap-4">{specRow1.map((s, i) => <SpecCol key={i} s={s} />)}</div>
              )}
              {specRow2.length > 0 && (
                <div className="flex gap-4">{specRow2.map((s, i) => <SpecCol key={i} s={s} />)}</div>
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
                  {/* ②박스와 하단 바 동일 너비·직각(라운드 제거)·일체형 */}
                  <div className="w-full flex-1 bg-white overflow-hidden flex items-center justify-center" style={{ border: '2px solid #111827', borderBottom: 'none' }}>
                    {packageImage ? (
                      <img src={packageImage} className="w-full h-full object-contain p-2 pointer-events-none" alt="Package" />
                    ) : (
                      <span className="text-gray-300 font-bold text-sm pointer-events-none">PACKAGE</span>
                    )}
                  </div>
                  <div className="w-full bg-gray-900 text-white text-center font-black text-sm tracking-wide py-2 pointer-events-none">
                    package desing
                  </div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 cursor-nwse-resize"></div>
                </div>
              </Rnd>
            )}
          </div>
        </header>

        {/* ===== KEY FEATURE (상시 활성 ④) — ⑤ 이미지 드래그/리사이즈, ⑦ 간격핸들, ⑧ 클릭→Editor ===== */}
        <section id="preview-feature" className="px-[50px] relative group" style={{ paddingTop: gapVal('preview-feature-sec', 'section'), paddingBottom: gapVal('preview-feature-sec', 'section') }} onClick={() => scrollEditorTo('editor-feature')}>
          <SectionGap id="preview-feature-sec" />
          <Dot color={accent} size={22} />
          <h2 className={`${SECTION_HEADING} mt-4`}>KEY<br />FEATURE</h2>
          {featureSubtitle && (
            <p className="mt-3 text-lg font-bold text-gray-500 break-keep">{featureSubtitle}</p>
          )}
          <GapBar kind="heading" id="preview-feature-head" />
          {/* ⑤투명 박스 + ④마우스 드래그/리사이즈(커스텀). 우: 핵심특징 3항목(우측 고정) */}
          <div className="relative w-full" style={{ height: Math.max((fl.y || 0) + (fl.height || 380) + 10, 440) }}>
            <div className="absolute right-0 top-0 w-[360px] flex flex-col" style={{ gap: sp.element }}>
              {keyFeatures.map((f, i) => (
                // ② 메인특징 블록별 앵커 → 좌측 '메인특징 1/2/3' 입력이 각자 블록으로 스크롤(미리보기 불일치 해결)
                <div key={i} id={`preview-feature-${i}`} className="bg-gray-100 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Dot color={accent} size={12} />
                    <span className="font-black text-lg text-gray-900 break-keep">{(f.title || '').trim() || `핵심특징 ${i + 1}`}</span>
                  </div>
                  {((f.desc || '').trim() && f.desc !== '__ENABLED__') && (
                    <p className="text-sm font-medium text-gray-600 leading-snug break-keep truncate">
                      {renderHighlightText((f.desc || '').replace(/\n+/g, ' '), themeColor)}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {/* 좌: 특징 이미지(투명·드래그/리사이즈). absolute left/top → transform 오프셋 버그 없음 */}
            <div className="absolute group/fi overflow-hidden" style={{ left: fl.x || 0, top: fl.y || 0, width: fl.width || 320, height: fl.height || 380, cursor: 'move', zIndex: 10 }} onMouseDown={startFeatureDrag}>
              {featureImage ? (
                <img src={featureImage} className="w-full h-full object-contain block pointer-events-none select-none" alt="Feature" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 font-bold bg-gray-50">FEATURE</div>
              )}
              <RenderWatermark targetKey="featureImage" />
              <div onMouseDown={startFeatureResize} title="드래그하여 크기 조절" className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 border-2 border-white rounded-full opacity-0 group-hover/fi:opacity-100 cursor-nwse-resize z-20"></div>
            </div>
          </div>
        </section>

        {/* ===== 영문명 반복 마퀴 밴드(2차) — KEY FEATURE 아래 ③ ===== */}
        <MarqueeBand />

        {/* ===== OPTION CHECK — 자유 배치(Rnd) 복원 ⑫ ===== */}
        {options.length === 0 && <div id="preview-option" />}
        {options.length > 0 && (
          <section
            id="preview-option"
            className="px-[50px] relative group"
            style={{ paddingTop: gapVal('preview-option-sec', 'section'), paddingBottom: gapVal('preview-option-sec', 'section'), minHeight: 260 + Math.max(0, ...options.map((o) => (o.y || 0) + (o.height || 400))) }}
            onClick={() => scrollEditorTo('editor-option')}
          >
            <SectionGap id="preview-option-sec" />
            <Dot color={accent} size={22} />
            <h2 className={`${SECTION_HEADING} mt-4`}>OPTION<br />CHECK</h2>
            <GapBar kind="heading" id="preview-option-head" />
            <div className="relative w-full" style={{ minHeight: 420 }}>
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
                    <div className="w-full flex-1 bg-white overflow-hidden flex items-center justify-center" style={{ border: IMG_BORDER, borderBottom: 'none' }}>
                      {opt.image ? (
                        // ① 흰 여백 없이 꽉 채움(object-cover). 박스 비율은 마우스로 조절 → 잘림 최소화
                        <img src={opt.image} className="w-full h-full object-cover pointer-events-none" alt={opt.name} />
                      ) : (
                        <span className="text-gray-300 font-bold text-sm pointer-events-none">NO IMAGE</span>
                      )}
                    </div>
                    <div className="w-full bg-gray-900 text-white text-center font-bold py-2.5 break-keep pointer-events-none">
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
        {!(sizeImage || (summaryInfo?.weight || '').trim()) && <div id="preview-size" />}
        {(sizeImage || (summaryInfo?.weight || '').trim()) && (
          <React.Fragment>
          {/* ③ 영문명 마퀴 밴드 — SIZE 위에도 동일 렌더(섹션 구분용) */}
          <MarqueeBand />
          <section id="preview-size" className="px-[50px] bg-gray-50 relative group" style={{ paddingTop: gapVal('preview-size-sec', 'section'), paddingBottom: gapVal('preview-size-sec', 'section') }} onClick={() => scrollEditorTo('editor-size')}>
            <SectionGap id="preview-size-sec" />
            <h2 className={SECTION_HEADING}>SIZE</h2>
            <p className="flex items-center gap-2 text-base font-bold text-gray-500 mt-2 break-keep">
              측정 방법에 따라 약간의 오차가 있을 수 있습니다 <Dot color={accent} size={12} />
            </p>
            {/* ① 흰 여백 제거(p-6 제거) + 얇은 회색 테두리 → 이미지 꽉 채움 */}
            <div className="mt-8 bg-white relative overflow-hidden" style={{ border: IMG_BORDER }}>
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
          </React.Fragment>
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
