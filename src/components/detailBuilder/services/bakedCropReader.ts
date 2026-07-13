// 통이미지형 v2 — "원본 구도 그대로 + 깨끗한 크롭 + 진짜 텍스트(강조)" 방식.
//   기존(픽셀 여백분할+지그재그)의 한계(옆텍스트/테두리/병합/축소)를 버리고,
//   Claude가 통이미지를 보고 각 파트의 [이미지 크롭박스 + 그 설명 텍스트]를 "원본 순서대로" 반환.
//   금색 라인/테두리/잡텍스트는 크롭박스에서 제외(제품 컷만). 텍스트는 진짜 텍스트로 읽어 강조(##)까지.
//   ⚠️ 정밀도 확보: 긴 통이미지는 세로 타일로 쪼개 각 타일을 Claude에 보내고 좌표를 원본으로 환산.
import { chatWithProvider } from '../../../services/aiProviderAdapter';
import { hasProviderKey } from '../../../services/aiKeyVault';
import { CONVERTER_PROVIDER, CONVERTER_MODEL } from './basicVisionReader';
import type { ChatContentPart } from '../../../types/aiProvider';
import { toProxyUrl } from './exportImagePrep';

// 원본 좌표계(원본 통이미지 픽셀 기준)의 파트.
export interface CropPart {
  kind: 'image' | 'marketing';   // marketing=상단 큰 대표(구분/설명 없음), image=제품 컷(설명 있음)
  x: number; y: number; w: number; h: number;  // 크롭박스(원본 픽셀). 금색선/테두리/잡텍스트 제외한 제품 영역만
  caption: string;               // 그 파트의 한글 설명(읽어서 리라이트+##강조##). marketing/설명없으면 ''
  crop?: string;                 // 위 박스로 원본에서 잘라낸 이미지(dataUrl) — readCropParts가 채움
}
export interface CropReadResult { W: number; H: number; parts: CropPart[]; notes: string[] }

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('load')); im.src = src; });

// 타일: 통이미지를 세로로 잘라 각 타일을 정해진 폭(scaleW)으로 그린 canvas + 원본 y오프셋/스케일 반환.
interface Tile { dataUrl: string; y0: number; scale: number; sw: number; sh: number }
const makeTiles = (img: HTMLImageElement, scaleW = 760, maxTileH = 1400): Tile[] => {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const scale = Math.min(1, scaleW / W);
  const sw = Math.round(W * scale);
  const tileSrcH = Math.round(maxTileH / scale);       // 원본 기준 타일 높이
  const tiles: Tile[] = [];
  for (let y = 0; y < H; y += tileSrcH) {
    const sh0 = Math.min(tileSrcH, H - y);
    const sh = Math.round(sh0 * scale);
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const ctx = c.getContext('2d'); if (!ctx) continue;
    ctx.drawImage(img, 0, y, W, sh0, 0, 0, sw, sh);
    let url: string; try { url = c.toDataURL('image/jpeg', 0.85); } catch { throw new Error('CORS taint — 프록시 경유 필요'); }
    tiles.push({ dataUrl: url, y0: y, scale, sw, sh });
  }
  return tiles;
};

const SYSTEM = [
  '당신은 국내(한국) 성인용품 쇼핑몰 상세페이지를 분석합니다. 입력은 세로 통이미지의 한 구간(타일) 이미지입니다.',
  '이 타일 안에서 "제품 사진 파트"를 위→아래 순서로 찾아, 각각의 [크롭박스 + 설명]을 반환합니다.',
  '',
  '[크롭박스 규칙] 좌표는 이 타일 이미지의 픽셀(좌상단 0,0 기준) x,y,w,h.',
  '· 박스는 "제품/패키지 사진"만 감싼다. 금색/컬러 구분선·테두리 박스·사진 옆이나 위의 잡텍스트(상품명 헤딩·일본어 등)는 박스에서 제외.',
  '· 사진에 박힌 치수 표시(예 145mm·278g)는 사진의 일부이므로 포함해도 됨.',
  '· 여러 작은 컷/패키지가 한 덩어리로 붙어 하나의 설명을 가지면 그 덩어리 전체를 한 박스로.',
  '[kind] · marketing = 상단의 크고 화려한 대표/마케팅 이미지(일본어·캐릭터, 한글 설명 없음). · image = 아래에 한글 설명이 붙는 제품 컷.',
  '[caption] 각 제품 사진 "바로 아래/옆의 한글 설명"을 읽어 표현·톤만 리라이트(숫자·사이즈·재질 등 팩트 그대로, 창작 금지). 의미단위 줄바꿈(\\n). 가장 중요한 어구 1곳만 ##문구##. marketing이거나 한글 설명 없으면 caption="".',
  '· 상품명/옵션명 헤딩("버진 루프 하드","TORNADO" 등 이름 단어)·통짜 일본어/영어는 설명이 아님 → caption으로 쓰지 말 것.',
  '· 타일 경계에서 잘린 파트는 무리하게 넣지 말 것(다음 타일에서 처리).',
  '',
  '[출력] JSON 하나만: {"parts":[{"kind":"image","x":0,"y":0,"w":0,"h":0,"caption":"..\\n.."}],"notes":[]}',
].join('\n');

const num = (v: any) => { const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? n : 0; };
const str = (v: any) => (typeof v === 'string' ? v : '');
const stripFence = (s: string) => s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();

const readTile = async (tile: Tile): Promise<Omit<CropPart, never>[]> => {
  const content: ChatContentPart[] = [
    { type: 'text', text: `이 타일 크기: 폭 ${tile.sw} x 높이 ${tile.sh} 픽셀. 규칙대로 JSON 하나만.` },
    { type: 'image', image: tile.dataUrl },
  ];
  const res = await chatWithProvider({
    providerId: CONVERTER_PROVIDER, modelIdOverride: CONVERTER_MODEL, purpose: 'agent_run', maxTokens: 2600,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }],
  });
  if (!res.ok || !res.content) throw new Error(res.errorMessage || 'Claude 응답 없음');
  const m = stripFence(res.content).match(/\{[\s\S]*\}/);
  const obj: any = m ? JSON.parse(m[0]) : {};
  const parts = (Array.isArray(obj.parts) ? obj.parts : []).map((p: any) => ({
    kind: p?.kind === 'marketing' ? 'marketing' : 'image',
    // 타일 좌표 → 원본 좌표 환산(scale 역보정 + y오프셋)
    x: Math.round(num(p?.x) / tile.scale),
    y: Math.round(num(p?.y) / tile.scale) + tile.y0,
    w: Math.round(num(p?.w) / tile.scale),
    h: Math.round(num(p?.h) / tile.scale),
    caption: str(p?.caption),
  })).filter((p: CropPart) => p.w > 8 && p.h > 8);
  return parts;
};

/** 통이미지 URL(들) → 원본 좌표계의 파트 목록(크롭박스+설명). 크롭/렌더는 호출측에서. */
export const readCropParts = async (
  detailImageUrls: string[],
  onProgress?: (p: { phase: string }) => void,
): Promise<CropReadResult[]> => {
  if (!hasProviderKey(CONVERTER_PROVIDER)) {
    throw new Error('변환기 AI(Claude) 키가 연결되어 있지 않습니다. 관리자 설정 → AI 연결에서 Claude API 키를 붙여넣어 주세요.');
  }
  const out: CropReadResult[] = [];
  for (const url of detailImageUrls) {
    const img = await loadImage(toProxyUrl(url));
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const tiles = makeTiles(img);
    const parts: CropPart[] = [];
    const notes: string[] = [];
    for (let i = 0; i < tiles.length; i++) {
      onProgress?.({ phase: `AI 읽기 (구간 ${i + 1}/${tiles.length})` });
      try { parts.push(...(await readTile(tiles[i]) as CropPart[])); }
      catch (e: any) { notes.push(`구간 ${i + 1} 실패: ${e?.message || e}`); }
    }
    // 좌표박스로 원본에서 크롭(제품 컷만). 박스는 원본 좌표계라 원본 해상도로 잘라 선명.
    for (const p of parts) {
      const x = Math.max(0, Math.min(p.x, W - 1)), y = Math.max(0, Math.min(p.y, H - 1));
      const w = Math.max(1, Math.min(p.w, W - x)), h = Math.max(1, Math.min(p.h, H - y));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d'); if (!cx) continue;
      cx.drawImage(img, x, y, w, h, 0, 0, w, h);
      try { p.crop = c.toDataURL('image/jpeg', 0.9); } catch { p.crop = ''; }
    }
    out.push({ W, H, parts, notes });
  }
  return out;
};
