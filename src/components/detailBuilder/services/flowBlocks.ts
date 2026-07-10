// @ts-nocheck — flowBlocks(신모델: 이미지+캡션) 유틸. 구모델 flowImages(문자열 배열)와 호환.
// PreviewGodoFlow·EditorFlow·exportImagePrep가 공유해 단일 규칙으로 블록을 읽는다.
import type { ProductData, FlowBlock } from '../types';

let _seq = 0;
export const newBlockId = (): string => `fb_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

// data에서 블록 리스트를 얻는다. flowBlocks가 있으면 그것, 없으면 구 flowImages에서 파생(캡션 빈값).
// ⚠️ 폴백 id는 인덱스 기반 결정적 값 — 렌더마다 재생성되지 않아야 React 키/포커스가 안정적(첫 편집 전).
//    첫 편집 시 setBlocks가 이 결과를 flowBlocks로 굳혀 이후엔 이 경로를 안 탄다.
export const getFlowBlocks = (data: ProductData): FlowBlock[] => {
  if (Array.isArray(data.flowBlocks)) return data.flowBlocks.filter((b) => b && b.image);
  const imgs = Array.isArray(data.flowImages) ? data.flowImages : [];
  return imgs.filter(Boolean).map((image, i) => ({ id: `legacy_${i}`, image, caption: '' }));
};

// 이미지 URL/데이터 배열 → 블록 배열(캡션 빈값).
export const imagesToBlocks = (images: string[]): FlowBlock[] =>
  (images || []).filter(Boolean).map((image) => ({ id: newBlockId(), image, caption: '' }));
