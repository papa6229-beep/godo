// 통이미지 단순형(버진루프/트리니티류) → flow(사진+설명 지그재그) 변환.
//   흐름: 통이미지 여백분할 → Claude 1패스(상단 큰이미지/하단 사진+설명 페어링 + 리라이트+##강조##)
//   → flowBlocks 생성. 이후는 분리형과 완전히 동일(옵션닛포리와 같은 렌더/편집).
import { splitImageByWhitespace } from './flowImageSplitter';
import { toProxyUrl } from './exportImagePrep';
import { readBakedFlow } from './basicVisionReader';
import type { BasicReadContext } from './basicVisionReader';
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
  // ① 통이미지 여백분할 → 밴드(사진+설명 텍스트 포함, 순서 유지)
  onProgress?.({ phase: '통이미지 분할' });
  const bands: string[] = [];
  for (const url of detailImageUrls) {
    try {
      const segs = await splitImageByWhitespace(toProxyUrl(url));
      for (const s of segs) bands.push(s.dataUrl);
    } catch {
      notes.push(`이미지 분할 실패(건너뜀): ${url.slice(0, 50)}…`);
    }
  }
  if (!bands.length) throw new Error('통이미지에서 밴드를 추출하지 못했습니다. (이미지 URL/프록시 확인)');

  // ② Claude 1패스: 상단 큰이미지 + 하단 [사진→설명] 페어링 + 라이트 리라이트 + ##강조##
  onProgress?.({ phase: `AI 읽기·리라이트 (밴드 ${bands.length}장)` });
  const r = await readBakedFlow(bands, ctx);
  notes.push(...r.notes);

  // ③ flowBlocks 조립: 상단 큰이미지(캡션 없음=풀폭) → 하단 사진+설명 쌍(지그재그는 PreviewGodoFlow 자동)
  const at = (i: number): string | null => (i >= 0 && i < bands.length ? bands[i] : null);
  const flowBlocks: BakedFlowBlock[] = [];
  for (const ti of r.topIndices) {
    const img = at(ti);
    if (img) flowBlocks.push({ id: newBlockId(), image: img, caption: '' });
  }
  for (const b of r.blocks) {
    const img = at(b.imageIndex);
    if (img) flowBlocks.push({ id: newBlockId(), image: img, caption: b.caption || '' });
  }
  if (!flowBlocks.length) throw new Error('AI가 배치할 블록을 만들지 못했습니다. (통이미지 구조 확인)');

  return { flowBlocks, bandCount: bands.length, notes };
};
