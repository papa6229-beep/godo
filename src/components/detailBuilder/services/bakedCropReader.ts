// 통이미지형 리더 v3 — "결정론 픽셀 분할 + AI는 텍스트 읽기만".
//   ⚠️ v2(LLM에 크롭 좌표를 시키던 방식)의 근본 결함: 비전모델(Claude·qwen 공통)은 픽셀 단위
//   경계를 못 찍는다(눈대중 수십 px 오차) → 금색선 딸려옴·제품 짤림이 매번 반복. 모델·타일로 해결 불가.
//   → 자르기는 "수학"(색/여백/금색선을 픽셀 스캔해 정확히 절단·트림), AI는 "이해"(캡션 텍스트 읽기+리라이트)만.
//   원본은 섹션을 흰 여백과 얇은 금색 구분선으로 나눠 둠 = 둘 다 색으로 100% 감지되는 결정론 신호.
import { chatWithProvider } from '../../../services/aiProviderAdapter';
import { hasProviderKey } from '../../../services/aiKeyVault';
import { CONVERTER_PROVIDER, CONVERTER_MODEL } from './basicVisionReader';
import type { ChatContentPart } from '../../../types/aiProvider';
import { toProxyUrl } from './exportImagePrep';

// 원본 좌표계(원본 통이미지 픽셀 기준)의 파트.
export interface CropPart {
  kind: 'image' | 'marketing';   // marketing=상단 대표(설명 없음, 통째 유지), image=제품 컷(설명 있음)
  x: number; y: number; w: number; h: number;  // 크롭박스(원본 픽셀)
  caption: string;               // 그 파트의 한글 설명(읽어서 리라이트+##강조##). marketing/설명없으면 ''
  crop?: string;                 // 위 박스로 원본에서 잘라낸 이미지(dataUrl)
}
export interface CropReadResult { W: number; H: number; parts: CropPart[]; notes: string[] }

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('load')); im.src = src; });

// ── 행 분류 임계값(splitClassified 실측값 재사용) ──
const WHITE_LUM = 232;   // 이 밝기 이상 = 흰 픽셀
const BLANK_FRAC = 0.985; // 행의 흰 비율 ≥ = 빈(여백) 행
const COLOR_SAT = 45;    // 이 채도 이상 + 밝지 않음 = 컬러(사진) 픽셀
const COLOR_FRAC = 0.06; // 행의 컬러 비율 ≥ = 사진 행
const INK_LUM = 115;     // 이 밝기 미만 + 저채도 = 잉크(텍스트/선) 픽셀
const INK_SAT = 40;
const INK_FRAC = 0.02;   // 행의 잉크 비율 ≥ = 텍스트 행
const MIN_BAND = 24;     // 이보다 얇은 밴드는 버림(금색선·노이즈 자동 탈락)
const MIN_PHOTO = 40;    // 유지할 최소 사진 높이
const MERGE_GAP = 14;    // 인접 사진 밴드 사이 틈이 이 미만 + 텍스트 없음 = 한 이미지의 내부 분할 → 재병합

// 통이미지 블록을 감싼 "각진 노랑 사각 프레임"(버진루프류). 실측색 ≈ RGB(230,219,86)·sat≈144.
//   ⚠️ 2026-07-13 미해결분: 이 프레임은 1px 밝은 노랑이라 GOLD 행판정(sat≤120·전폭)에 안 걸려
//   세로 rail이 제품 크롭에 딸려 남았음. 판정식을 "밝은 노랑"으로 좁혀(살색·빨강치수선 배제) 크롭에서 제외.
//   · 살색 보호: (g-b)>65 요구 → 살구/살색(살색은 g-b 작음)·주황(g≤170) 탈락. · 빨강 치수선 보호: g>170 요구.
//   실측 검증(버진루프 7블록·트리니티): 프레임 4변 제거·빨강치수 보존·살색 무손상 확인.
const isFrameYellow = (r: number, g: number, b: number): boolean =>
  r > 190 && g > 170 && b < 160 && Math.abs(r - g) < 45 && (r - b) > 85 && (g - b) > 65;

type RowKind = 'BLANK' | 'GOLD' | 'PHOTO' | 'TEXT' | 'BG';

interface RowStat { white: number; ink: number; color: number; gold: number }

// 캔버스에서 행별 통계 뽑기(원본 해상도). CORS taint면 예외.
const scanRows = (img: HTMLImageElement): { W: number; H: number; rows: RowStat[]; get: (x: number, y: number) => [number, number, number] } => {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 컨텍스트 실패');
  ctx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, W, H).data; }
  catch { throw new Error('이미지 픽셀을 읽을 수 없습니다(CORS taint) — 프록시 경유 필요'); }
  const colStep = Math.max(1, Math.floor(W / 64));
  const rows: RowStat[] = new Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0, w = 0, ink = 0, col = 0, gold = 0;
    const off = y * W * 4;
    for (let x = 0; x < W; x += colStep) {
      const i = off + x * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      n++;
      if (lum >= WHITE_LUM) w++;
      else if (lum < INK_LUM && sat < INK_SAT) ink++;
      if (sat >= COLOR_SAT && lum < 245) col++;
      // 금색/탄색 구분선: 중간밝기 + R≥G≥B(노랑기) + 적당한 채도
      if (lum > 120 && lum < 228 && r >= g && g >= b - 6 && (r - b) >= 32 && sat >= 14 && sat <= 120) gold++;
    }
    rows[y] = { white: w / n, ink: ink / n, color: col / n, gold: gold / n };
  }
  const get = (x: number, y: number): [number, number, number] => {
    const i = y * W * 4 + x * 4; return [data[i], data[i + 1], data[i + 2]];
  };
  return { W, H, rows, get };
};

const rowKind = (r: RowStat): RowKind => {
  if (r.gold >= 0.5 && r.color < 0.35) return 'GOLD';   // 전폭 금색선
  if (r.white >= BLANK_FRAC) return 'BLANK';
  if (r.color >= COLOR_FRAC) return 'PHOTO';
  if (r.ink >= INK_FRAC) return 'TEXT';
  return 'BG';
};

interface Band { a: number; b: number; kind: 'PHOTO' | 'TEXT' }

// 색+여백+금색선으로 통이미지를 밴드로 절단. BLANK/GOLD 행 = 컷(버림). 나머지 연속구간 = 밴드.
const segmentBands = (H: number, kinds: RowKind[]): Band[] => {
  const raw: Array<[number, number]> = [];
  let s = -1;
  for (let y = 0; y <= H; y++) {
    const cut = y === H || kinds[y] === 'BLANK' || kinds[y] === 'GOLD';
    if (cut) { if (s >= 0) { raw.push([s, y]); s = -1; } }
    else if (s < 0) s = y;
  }
  const bands: Band[] = [];
  for (const [a, b] of raw) {
    if (b - a < MIN_BAND) continue;                     // 얇은 금색선/노이즈 탈락
    let ph = 0, tx = 0;
    for (let y = a; y < b; y++) { if (kinds[y] === 'PHOTO') ph++; else if (kinds[y] === 'TEXT') tx++; }
    bands.push({ a, b, kind: ph >= tx ? 'PHOTO' : 'TEXT' });
  }
  // 한 이미지가 내부 흰 띠/치수 화살표로 잘게 쪼개진 경우 재병합: 인접 PHOTO 밴드 사이 틈이 작고(<MERGE_GAP)
  //   그 틈에 캡션(TEXT 행)이 없으면 같은 이미지로 본다. (진짜 다른 섹션은 그 사이 여백이 크거나 캡션이 있음)
  const merged: Band[] = [];
  for (const band of bands) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'PHOTO' && band.kind === 'PHOTO' && band.a - last.b < MERGE_GAP) {
      let hasText = false;
      for (let y = last.b; y < band.a; y++) if (kinds[y] === 'TEXT') { hasText = true; break; }
      if (!hasText) { last.b = band.b; continue; }
    }
    merged.push({ ...band });
  }
  return merged;
};

const SYSTEM = [
  '입력 이미지들은 한국 성인용품 쇼핑몰 상세페이지에서 잘라낸 "설명 텍스트 띠"입니다(위→아래 순서, [0],[1],...).',
  '각 띠에 적힌 한글 설명 문장을 읽어, 표현·톤만 자연스럽게 라이트 리라이트하세요(숫자·사이즈·무게·재질 등 팩트는 원문 그대로, 창작 금지).',
  '· 의미 단위로 줄바꿈(\\n) — 한 줄이 완결된 덩어리가 되게.',
  '· 각 문구에서 가장 중요한 소구 어구 "1곳만" ##문구## 로 감쌀 것(빨강 강조).',
  '· 그 띠가 한글 설명 문장이 아니면(상품명/옵션명 헤딩, 통짜 일본어·영어, 치수 숫자만, 빈 것) 반드시 빈 문자열 "".',
  '· 입력 띠 개수와 정확히 같은 길이의 배열을 순서대로 반환.',
  '[출력] JSON 하나만: {"captions":["..\\n..",""]}',
].join('\n');

const stripFence = (s: string) => s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();

// 캡션 텍스트 띠(들)를 Claude가 읽어 리라이트. 좌표 없음 — 텍스트만.
const readCaptionStrips = async (strips: string[]): Promise<string[]> => {
  if (!strips.length) return [];
  const content: ChatContentPart[] = [{ type: 'text', text: `설명 띠 ${strips.length}개. 규칙대로 리라이트해 captions 배열(길이 ${strips.length})만.` }];
  strips.forEach((s, i) => { content.push({ type: 'text', text: `[${i}]` }); content.push({ type: 'image', image: s }); });
  const res = await chatWithProvider({
    providerId: CONVERTER_PROVIDER, modelIdOverride: CONVERTER_MODEL, purpose: 'agent_run', maxTokens: 2600,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }],
  });
  if (!res.ok || !res.content) throw new Error(res.errorMessage || 'Claude 응답 없음');
  const m = stripFence(res.content).match(/\{[\s\S]*\}/);
  const obj: any = m ? JSON.parse(m[0]) : {};
  const caps = Array.isArray(obj.captions) ? obj.captions.map((c: any) => (typeof c === 'string' ? c : '')) : [];
  while (caps.length < strips.length) caps.push('');
  return caps.slice(0, strips.length);
};

/** 통이미지 URL(들) → 결정론 분할로 [깨끗한 제품 크롭 + 리라이트된 캡션] 파트 목록. */
export const readCropParts = async (
  detailImageUrls: string[],
  onProgress?: (p: { phase: string }) => void,
): Promise<CropReadResult[]> => {
  if (!hasProviderKey(CONVERTER_PROVIDER)) {
    throw new Error('변환기 AI(Claude) 키가 연결되어 있지 않습니다. 관리자 설정 → AI 연결에서 Claude API 키를 붙여넣어 주세요.');
  }
  const out: CropReadResult[] = [];
  for (let u = 0; u < detailImageUrls.length; u++) {
    onProgress?.({ phase: `분할 (${u + 1}/${detailImageUrls.length})` });
    const img = await loadImage(toProxyUrl(detailImageUrls[u]));
    const { W, H, rows, get } = scanRows(img);
    const kinds = rows.map(rowKind);
    const bands = segmentBands(H, kinds);
    const notes: string[] = [];

    // 원본에서 박스를 잘라 dataUrl로. (박스는 원본 해상도라 선명)
    const cropBox = (x: number, y: number, w: number, h: number, deframe = false): string => {
      x = Math.max(0, Math.min(x, W - 1)); y = Math.max(0, Math.min(y, H - 1));
      w = Math.max(1, Math.min(w, W - x)); h = Math.max(1, Math.min(h, H - y));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true }); if (!cx) return '';
      cx.drawImage(img, x, y, w, h, 0, 0, w, h);
      // 제품 크롭(deframe=true)이면 크롭 안에 남은 노랑 프레임(세로 rail·코너)을 흰색으로 덮어 완전 제거.
      //   마케팅 크롭(deframe=false)은 원본 브랜딩 보존을 위해 건드리지 않음.
      if (deframe) {
        try {
          const id = cx.getImageData(0, 0, w, h); const d = id.data;
          for (let i = 0; i < d.length; i += 4) {
            if (isFrameYellow(d[i], d[i + 1], d[i + 2])) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
          }
          cx.putImageData(id, 0, 0);
        } catch { /* CORS taint 시 원본 그대로(프레임 잔존 감수) */ }
      }
      try { return c.toDataURL('image/jpeg', 0.92); } catch { return ''; }
    };
    // 사진 밴드 → 금색선/텍스트/여백을 상하좌우로 트림한 "제품 코어"만 크롭(짤림·딸려옴 동시 해결).
    const cropPhoto = (band: Band): { x: number; y: number; w: number; h: number; crop: string } | null => {
      // 상하: 가장자리의 금색선(GOLD)·빈 여백(BLANK)만 벗긴다. 치수 라벨(TEXT: 145mm·95mm 등)은
      //   이미지 일부이므로 유지(캡션 설명문은 애초에 밴드 밖 여백에 있어 안 들어옴).
      let top = band.a, bot = band.b;
      while (top < bot && (kinds[top] === 'GOLD' || kinds[top] === 'BLANK')) top++;
      while (bot > top && (kinds[bot - 1] === 'GOLD' || kinds[bot - 1] === 'BLANK')) bot--;
      let hasPhoto = false;
      for (let y = top; y < bot; y++) if (kinds[y] === 'PHOTO') { hasPhoto = true; break; }
      if (!hasPhoto || bot - top < MIN_PHOTO) return null;
      // 좌우: 코어 구간의 비-흰 픽셀 바운딩(전폭으로 안 늘려서 우측 짤림/여백 방지). 성긴 샘플로 빠르게.
      let left = W, right = 0;
      const xs = Math.max(1, Math.floor(W / 200)), ys = Math.max(1, Math.floor((bot - top) / 120));
      for (let y = top; y < bot; y += ys) {
        for (let x = 0; x < W; x += xs) {
          const [r, g, b] = get(x, y);
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          // 노랑 프레임은 배경 취급(바운딩에서 제외) → 크롭이 실제 제품으로 조여져 세로 rail이 빠진다.
          if (lum < WHITE_LUM - 6 && !isFrameYellow(r, g, b)) { if (x < left) left = x; if (x > right) right = x; }
        }
      }
      if (right <= left) { left = 0; right = W - 1; }
      const padX = Math.round(W * 0.01), padY = 6;
      const x = Math.max(0, left - padX), rx = Math.min(W - 1, right + padX);
      const y = Math.max(0, top - padY), by = Math.min(H, bot + padY);
      return { x, y, w: rx - x, h: by - y, crop: cropBox(x, y, rx - x, by - y, true) };
    };
    // 캡션 띠: 두 사진 밴드 사이(사진 bot ~ 다음 사진 a) 구간에 TEXT 행이 있으면 그 구간을 크롭.
    //   원본 캡션은 폰트가 작아(≈12px) → 2배 업스케일해 Claude 가독 확보.
    const captionStrip = (fromY: number, toY: number): string | null => {
      let has = false;
      for (let y = fromY; y < toY; y++) if (kinds[y] === 'TEXT') { has = true; break; }
      if (!has) return null;
      const h = toY - fromY; if (h < 4) return null;
      const sc = 2;
      const c = document.createElement('canvas'); c.width = W * sc; c.height = h * sc;
      const cx = c.getContext('2d'); if (!cx) return null;
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, fromY, W, h, 0, 0, W * sc, h * sc);
      try { return c.toDataURL('image/jpeg', 0.92); } catch { return null; }
    };

    // 사진 밴드만 추출(순서 유지) + 각 사진 뒤 캡션 띠.
    const photoBands = bands.filter((b) => b.kind === 'PHOTO');
    if (!photoBands.length) { out.push({ W, H, parts: [], notes: ['제품 사진 밴드를 찾지 못함'] }); continue; }

    interface Item { crop: string; x: number; y: number; w: number; h: number; strip: string | null }
    const items: Item[] = [];
    for (let i = 0; i < photoBands.length; i++) {
      const pb = photoBands[i];
      const c = cropPhoto(pb);
      if (!c || !c.crop) continue;
      const nextA = i + 1 < photoBands.length ? photoBands[i + 1].a : H;
      const strip = captionStrip(pb.b, nextA);
      items.push({ ...c, strip });
    }
    if (!items.length) { out.push({ W, H, parts: [], notes: ['크롭 실패'] }); continue; }

    // Claude로 캡션 띠 읽기(1콜). 띠 없는 사진은 caption ''(강조 X).
    onProgress?.({ phase: 'AI 캡션 읽기·리라이트' });
    const stripIdx: number[] = []; const stripImgs: string[] = [];
    items.forEach((it, i) => { if (it.strip) { stripIdx.push(i); stripImgs.push(it.strip); } });
    let caps: string[] = [];
    try { caps = await readCaptionStrips(stripImgs); }
    catch (e: any) { notes.push(`캡션 읽기 실패(사진은 유지): ${e?.message || e}`); }
    const capByItem = new Map<number, string>();
    stripIdx.forEach((it, k) => { if (caps[k]) capByItem.set(it, caps[k]); });

    // 상단 마케팅 통째 유지: caption이 빈(설명 없는) "연속된 최상단 사진"들 → 하나의 marketing 크롭으로 병합.
    //   (트리니티: 일본어 마케팅=한글설명 없음 → 통째. 버진루프: 첫 사진이 캡션 있음 → 병합 없음, 첫 제품.)
    let leadEmpty = 0;
    while (leadEmpty < items.length && !capByItem.get(leadEmpty)) leadEmpty++;
    const parts: CropPart[] = [];
    if (leadEmpty >= 2) {
      const top = 0, bot = items[leadEmpty - 1].y + items[leadEmpty - 1].h;
      parts.push({ kind: 'marketing', x: 0, y: top, w: W, h: bot - top, caption: '', crop: cropBox(0, top, W, bot - top) });
      notes.push(`상단 마케팅(0~${bot}px) 통째 유지 · 사진 ${items.length - leadEmpty}개 분리`);
      for (let i = leadEmpty; i < items.length; i++) {
        parts.push({ kind: 'image', x: items[i].x, y: items[i].y, w: items[i].w, h: items[i].h, caption: capByItem.get(i) || '', crop: items[i].crop });
      }
    } else {
      items.forEach((it, i) => parts.push({
        kind: capByItem.get(i) ? 'image' : (i === 0 ? 'marketing' : 'image'),
        x: it.x, y: it.y, w: it.w, h: it.h, caption: capByItem.get(i) || '', crop: it.crop,
      }));
    }
    notes.push(`밴드 ${bands.length}개(사진 ${photoBands.length}) → 파트 ${parts.length}개`);
    out.push({ W, H, parts, notes });
  }
  return out;
};
