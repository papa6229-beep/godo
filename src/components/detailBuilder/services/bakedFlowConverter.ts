// 통이미지 단순형(버진루프/트리니티류) → flow(사진+설명 지그재그) 변환.
//   흐름: 통이미지 "분류 분할"(splitClassified: PHOTO/TEXT/LINE) → LINE(금색선 등) 버림 →
//   Claude 1패스(메인이미지 지정 + [사진↔설명글] 페어링 + 리라이트+##강조##) → flowBlocks.
//   핵심: 이미지 슬롯엔 "깨끗한 PHOTO 밴드만"(설명 글자는 별도 TEXT 밴드라 안 박힘). 이후는 분리형과 동일.
import { splitClassified } from './flowImageSplitter';
import { toProxyUrl } from './exportImagePrep';
import { readBakedFlow } from './basicVisionReader';
import type { BasicReadContext, TypedBand } from './basicVisionReader';
import { newBlockId } from './flowBlocks';

export interface BakedFlowBlock { id: string; image: string; caption: string }
export interface BakedFlowConvertResult { flowBlocks: BakedFlowBlock[]; bandCount: number; notes: string[] }
export interface BakedFlowProgress { phase: string }

export const convertBakedToFlow = async (
  detailImageUrls: string[],
  ctx: BasicReadContext,
  onProgress?: (p: BakedFlowProgress) => void,
): Promise<BakedFlowConvertResult> => {
  const notes: string[] = [];

  // ① 분류 분할: 각 밴드를 PHOTO/TEXT/LINE으로. 순서 유지.
  onProgress?.({ phase: '통이미지 분류 분할' });
  const classified: { dataUrl: string; type: 'PHOTO' | 'TEXT' | 'LINE' }[] = [];
  for (const url of detailImageUrls) {
    try {
      const segs = await splitClassified(toProxyUrl(url));
      for (const s of segs) classified.push({ dataUrl: s.dataUrl, type: s.type });
    } catch {
      notes.push(`이미지 분할 실패(건너뜀): ${url.slice(0, 50)}…`);
    }
  }
  // LINE(금색 구분선/테두리 얇은 선)은 버리고, PHOTO(깨끗한 사진)+TEXT(설명글)만 순서대로 유지.
  const kept = classified.filter((s) => s.type !== 'LINE');
  if (!kept.some((s) => s.type === 'PHOTO')) throw new Error('제품 사진(PHOTO)을 찾지 못했습니다. (통이미지 구조 확인)');
  const bands: TypedBand[] = kept.map((s) => ({ dataUrl: s.dataUrl, type: s.type }));

  // ② Claude 1패스: 메인이미지 지정 + [사진↔설명글] 페어링 + 리라이트 + ##강조##
  onProgress?.({ phase: `AI 읽기·리라이트 (밴드 ${bands.length}개)` });
  const r = await readBakedFlow(bands, ctx);
  notes.push(...r.notes);

  // ③ flowBlocks 조립. 이미지 슬롯엔 PHOTO 밴드만(설명 글자 안 박힘). 메인=풀폭(캡션X), 나머지=사진+캡션 지그재그.
  const isPhoto = (i: number) => i >= 0 && i < kept.length && kept[i].type === 'PHOTO';
  let mainIdx = isPhoto(r.mainIndex) ? r.mainIndex : kept.findIndex((s) => s.type === 'PHOTO');
  const flowBlocks: BakedFlowBlock[] = [];
  if (mainIdx >= 0) flowBlocks.push({ id: newBlockId(), image: kept[mainIdx].dataUrl, caption: '' });
  for (const b of r.blocks) {
    if (b.imageIndex === mainIdx) continue;         // 메인 중복 방지
    if (!isPhoto(b.imageIndex)) continue;           // 설명글 밴드가 imageIndex로 오면 무시
    flowBlocks.push({ id: newBlockId(), image: kept[b.imageIndex].dataUrl, caption: b.caption || '' });
  }
  if (!flowBlocks.length) throw new Error('AI가 배치할 블록을 만들지 못했습니다. (통이미지 구조 확인)');
  if (flowBlocks.length === 1) notes.push('블록이 메인 1개뿐 — 설명글 분류/프롬프트 확인 필요.');

  return { flowBlocks, bandCount: bands.length, notes };
};
