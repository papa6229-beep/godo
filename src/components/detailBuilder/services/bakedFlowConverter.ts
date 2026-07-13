// 통이미지 단순형(버진루프/트리니티류) → flow(사진+설명 지그재그) 변환.
//   흐름: 분류 분할(splitClassified: PHOTO/TEXT/LINE) → LINE 버림 → Claude 1패스
//   (mainIndices=상단 마케팅/대표 영역 + [사진↔설명글] 페어링 + 리라이트+##강조##) → flowBlocks.
//   핵심: ①이미지 슬롯엔 깨끗한 PHOTO 밴드만 ②상단 마케팅 밴드들은 세로로 합쳐 메인 1개 ③PHOTO는 절대 안 버림.
import { splitClassified } from './flowImageSplitter';
import { toProxyUrl } from './exportImagePrep';
import { readBakedFlow } from './basicVisionReader';
import type { BasicReadContext, TypedBand } from './basicVisionReader';
import { newBlockId } from './flowBlocks';

export interface BakedFlowBlock { id: string; image: string; caption: string }
export interface BakedFlowConvertResult { flowBlocks: BakedFlowBlock[]; bandCount: number; notes: string[] }
export interface BakedFlowProgress { phase: string }

const loadImg = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('load')); im.src = src; });

// 여러 밴드(같은 폭)를 세로로 이어붙여 한 장으로. 상단 마케팅 영역(여러 밴드)을 메인 이미지 1개로 만든다.
const mergeBandsVertically = async (dataUrls: string[]): Promise<string> => {
  if (dataUrls.length === 1) return dataUrls[0];
  const imgs = await Promise.all(dataUrls.map(loadImg));
  const W = Math.max(...imgs.map((im) => im.naturalWidth || im.width));
  const H = imgs.reduce((s, im) => s + (im.naturalHeight || im.height), 0);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); if (!ctx) return dataUrls[0];
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  let y = 0;
  for (const im of imgs) {
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    ctx.drawImage(im, Math.round((W - w) / 2), y, w, h); y += h;
  }
  try { return c.toDataURL('image/jpeg', 0.9); } catch { return dataUrls[0]; }
};

export const convertBakedToFlow = async (
  detailImageUrls: string[],
  ctx: BasicReadContext,
  onProgress?: (p: BakedFlowProgress) => void,
): Promise<BakedFlowConvertResult> => {
  const notes: string[] = [];

  // ① 분류 분할: PHOTO/TEXT/LINE. 순서 유지.
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
  const kept = classified.filter((s) => s.type !== 'LINE'); // 금색선(LINE) 버림, PHOTO+TEXT 순서 유지
  if (!kept.some((s) => s.type === 'PHOTO')) throw new Error('제품 사진(PHOTO)을 찾지 못했습니다. (통이미지 구조 확인)');
  const bands: TypedBand[] = kept.map((s) => ({ dataUrl: s.dataUrl, type: s.type }));

  // ② Claude 1패스
  onProgress?.({ phase: `AI 읽기·리라이트 (밴드 ${bands.length}개)` });
  const r = await readBakedFlow(bands, ctx);
  notes.push(...r.notes);

  // ③ 조립. 메인 = 상단 마케팅 밴드 세로 병합(없으면 첫 PHOTO). 나머지 PHOTO는 순서대로 캡션 붙여 배치(안 버림).
  const isPhoto = (i: number) => i >= 0 && i < kept.length && kept[i].type === 'PHOTO';
  const mainSet = new Set<number>(r.mainIndices.filter(isPhoto));
  if (!mainSet.size) { const fi = kept.findIndex((s) => s.type === 'PHOTO'); if (fi >= 0) mainSet.add(fi); }

  const flowBlocks: BakedFlowBlock[] = [];
  const mainUrls = [...mainSet].sort((a, b) => a - b).map((i) => kept[i].dataUrl);
  if (mainUrls.length) {
    onProgress?.({ phase: mainUrls.length > 1 ? '상단 마케팅 병합' : '메인 이미지' });
    flowBlocks.push({ id: newBlockId(), image: await mergeBandsVertically(mainUrls), caption: '' });
  }

  const capByIdx = new Map<number, string>();
  for (const b of r.blocks) if (isPhoto(b.imageIndex) && !mainSet.has(b.imageIndex)) capByIdx.set(b.imageIndex, b.caption || '');

  // 메인에 포함 안 된 모든 PHOTO를 위→아래 순서로(캡션 있으면 지그재그, 없으면 풀폭). 절대 안 버림.
  kept.forEach((s, i) => {
    if (s.type !== 'PHOTO' || mainSet.has(i)) return;
    flowBlocks.push({ id: newBlockId(), image: s.dataUrl, caption: capByIdx.get(i) || '' });
  });

  if (!flowBlocks.length) throw new Error('AI가 배치할 블록을 만들지 못했습니다. (통이미지 구조 확인)');
  return { flowBlocks, bandCount: bands.length, notes };
};
