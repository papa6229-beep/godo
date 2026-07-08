// @ts-nocheck — 이식된 상세페이지 생성기(벤더 코드): GODO 엄격 TS/lint 면제. 로직 수정 최소화.
import React, { forwardRef } from 'react';
import { Rnd } from 'react-rnd';
import type { ProductData } from '../types';
import { GODO_BRAND } from './PreviewGodo';

interface ThumbnailPreviewProps {
  data: ProductData;
  width: number;
  height: number;
  hidePackage?: boolean;
  externalScale?: number; // App에서 축소해서 보여줄 때의 비율 (Rnd 드래그 보정용)
  onLayoutChange?: (layout: { x: number, y: number, width: number, height: number }) => void;
  layoutMode?: 'bananamall' | 'godo';
}

const ThumbnailPreview = forwardRef<HTMLDivElement, ThumbnailPreviewProps>(({ data, width, height, hidePackage, externalScale = 1, onLayoutChange, layoutMode = 'bananamall' }, ref) => {
  const image = data.thumbnailImage || data.mainImage;

  // 브랜딩(모드별). 고도몰 값은 GODO_BRAND 단일 소스에서.
  const brand = layoutMode === 'godo'
    ? { badge: GODO_BRAND.thumbBadge, slogan: GODO_BRAND.thumbSlogan, name: GODO_BRAND.thumbName, url: GODO_BRAND.thumbUrl }
    : { badge: 'SINCE 1999', slogan: '대한민국 No.1 성인용품점', name: '바나나몰', url: 'bananamall.co.kr' };

  // 썸네일 크기에 따른 스케일 비율 계산 (기준: 500px 너비)
  const scale = width / 500;
  
  // 패키지 이미지 레이아웃 (500px 기준 -> 현재 크기로 변환)
  // 값이 없으면 기본값 (우측 하단)
  // 기본값: width 100 (20%), x: 388 (500-100-12), y: 388 (대략)
  const baseLayout = data.thumbnailPackageLayout || { x: 380, y: 380, width: 100, height: 120 };
  
  const currentLayout = {
    x: baseLayout.x * scale,
    y: baseLayout.y * scale,
    width: baseLayout.width * scale,
    height: baseLayout.height * scale
  };

  return (
    <div 
      ref={ref}
      style={{ width: `${width}px`, height: `${height}px` }}
      className="bg-white relative overflow-hidden flex items-center justify-center shrink-0 border border-gray-200 shadow-[var(--shadow-sm)] transition-all duration-200 ease-out hover:shadow-[var(--shadow-md)]"
    >
      {/* 1. 이미지 영역 (Background Layer) */}
      <div className="absolute inset-0 flex items-center justify-center bg-white z-0">
        {image ? (
          <img src={image} className="w-full h-full object-contain" alt="Thumbnail" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200 font-bold" style={{ fontSize: `${20 * scale}px` }}>
            NO IMAGE
          </div>
        )}
      </div>

      {/* 2. 텍스트 정보 영역 (Overlay Layer) — ⑩ 고도몰은 자동 문구 삽입 비활성(패키지는 유지) */}
      {layoutMode !== 'godo' && (
      <div
        className="absolute left-0 bottom-0 w-full flex flex-col justify-end items-start font-sans z-10 pointer-events-none"
        style={{
          padding: `${24 * scale}px`,
          gap: `${2 * scale}px`
        }}
      >
        {/* SINCE 1999 뱃지 & 슬로건 */}
        <div className="flex items-center" style={{ gap: `${6 * scale}px`, marginBottom: `${4 * scale}px` }}>
          <div 
            className="border border-gray-500 rounded-full flex items-center justify-center text-gray-600 font-bold bg-white/80 backdrop-blur-[2px]"
            style={{ 
              padding: `${2 * scale}px ${8 * scale}px`,
              fontSize: `${11 * scale}px`,
              borderWidth: `${1 * scale}px`,
              height: `${20 * scale}px`
            }}
          >
            {brand.badge}
          </div>
          <span
            className="text-gray-800 font-bold tracking-tight bg-white/60 backdrop-blur-[1px] px-1 rounded"
            style={{ fontSize: `${13 * scale}px` }}
          >
            {brand.slogan}
          </span>
        </div>

        {/* 메인 브랜드 텍스트 */}
        <div className="flex items-end leading-none text-gray-900" style={{ gap: `${8 * scale}px` }}>
          <span 
            className="font-black tracking-tighter text-gray-900"
            style={{ 
              fontSize: `${38 * scale}px`,
              textShadow: `${1 * scale}px 0 0 currentColor`
            }}
          >
            {brand.name}
          </span>
          <span 
            className="font-light text-gray-400"
            style={{ fontSize: `${36 * scale}px`, marginBottom: `${3 * scale}px` }}
          >
            |
          </span>
          <span 
            className="font-light uppercase tracking-tight truncate"
            style={{ 
              fontSize: `${38 * scale}px`,
              maxWidth: `${260 * scale}px`
            }}
          >
            {data.brandName || "BRAND"}
          </span>
        </div>

        {/* URL */}
        <div 
          className="text-gray-800 font-bold tracking-wide mt-1"
          style={{ fontSize: `${18 * scale}px` }}
        >
          {brand.url}
        </div>
      </div>
      )}

      {/* 3. 패키지 이미지 오버레이 (Draggable) */}
      {(!hidePackage && data.packageImage && (data.isPackageImageEnabled ?? true)) && (
        <Rnd
          scale={externalScale}
          size={{ width: currentLayout.width, height: currentLayout.height }}
          position={{ x: currentLayout.x, y: currentLayout.y }}
          onDragStop={(e, d) => {
              if (onLayoutChange) {
                  onLayoutChange({
                      x: d.x / scale,
                      y: d.y / scale,
                      width: currentLayout.width / scale,
                      height: currentLayout.height / scale
                  });
              }
          }}
          onResizeStop={(e, direction, ref, delta, position) => {
              if (onLayoutChange) {
                  onLayoutChange({
                      width: parseInt(ref.style.width) / scale,
                      height: parseInt(ref.style.height) / scale,
                      x: position.x / scale,
                      y: position.y / scale
                  });
              }
          }}
          className="group z-20"
          lockAspectRatio={true} // 이미지 비율 유지
        >
             <div className="w-full h-full relative group-hover:border border-blue-400 border-dashed">
                <img
                    src={data.packageImage}
                    className="w-full h-full object-contain pointer-events-none" // pointer-events-none to let Rnd handle drag
                    alt="Package Overlay"
                />
                {/* 핸들 (호버 시 표시) */}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100"></div>
             </div>
        </Rnd>
      )}
    </div>
  );
});

export default ThumbnailPreview;