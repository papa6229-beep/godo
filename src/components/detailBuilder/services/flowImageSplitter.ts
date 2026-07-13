// @ts-nocheck — 통이미지(세로 긴 상세) 여백감지 자동분할. 순수 브라우저 캔버스, 외부 의존 없음.
// 배경(2026-07-09 확정): 메인몰 상세는 세로 통이미지 1장인 경우가 많음 → 흰 여백 '행'을 감지해
//   섹션별로 자른다. 각 조각은 이후 블록(이미지+캡션)으로 편집·재배치·AI 문구의 단위가 된다.
// 판정 원리: '빈 행' = 그 행의 (샘플) 모든 픽셀이 near-white(밝기 임계 이상). 컬러/다크 배경(마케팅
//   헤더·다크 스펙밴드 등)은 밝기가 낮아 빈 행이 아니므로 그 안에서는 안 잘림 → 섹션 경계만 분리.
// ⚠️ getImageData는 same-origin 이미지에서만 가능 → CDN URL 통이미지는 먼저 base64로 변환 후 호출할 것.

export interface SplitSegment {
  dataUrl: string; // 잘린 조각 이미지(JPEG base64)
  y: number;       // 원본에서의 시작 y(px)
  height: number;  // 조각 높이(px)
}

export interface SplitOptions {
  whiteThreshold?: number; // 이 밝기(0~255) 이상이면 픽셀을 '흰 배경'으로 봄. default 232
  whiteFrac?: number;      // 행이 '빈 행'이려면 흰 픽셀 비율이 이 값 이상. default 0.98
  minGapPx?: number;       // 분할로 인정할 최소 여백 높이(px). default 40
  minSegPx?: number;       // 유지할 최소 조각 콘텐츠 높이(px). default 48(구분선/노이즈 제거)
  sampleCols?: number;     // 행마다 샘플링할 열 수(속도/정확도 트레이드오프). default 64
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = src;
  });

// 통이미지 1장 → 여백 기준으로 나눈 조각 배열. 못 나누면 원본 1장을 그대로 반환.
export const splitImageByWhitespace = async (
  source: string | HTMLImageElement,
  opts: SplitOptions = {},
): Promise<SplitSegment[]> => {
  const img = typeof source === 'string' ? await loadImage(source) : source;
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return [];

  const whiteThr = opts.whiteThreshold ?? 232;
  const whiteFrac = opts.whiteFrac ?? 0.98;
  const minGap = opts.minGapPx ?? 40;
  const minSeg = opts.minSegPx ?? 48;
  const sampleCols = opts.sampleCols ?? 64;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [{ dataUrl: typeof source === 'string' ? source : canvas.toDataURL('image/jpeg', 0.92), y: 0, height: H }];
  ctx.drawImage(img, 0, 0);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    throw new Error('이미지 픽셀을 읽을 수 없습니다(CORS taint). base64로 변환한 뒤 분할하세요.');
  }

  // 1) 각 행이 '빈(흰) 행'인지 판정 — 흰 픽셀 비율이 whiteFrac 이상이면 빈 행.
  //   ('최소 밝기' 방식은 여백을 가로지르는 얇은 선/워터마크 한 점에도 깨져 여백 런이 잘게 쪼개짐.
  //    비율 방식은 소수의 어두운 이물(≤2%)을 허용해 실제 섹션 여백을 온전한 런으로 잡는다.)
  const colStep = Math.max(1, Math.floor(W / sampleCols));
  const isBlank = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    let total = 0;
    let white = 0;
    const rowOff = y * W * 4;
    for (let x = 0; x < W; x += colStep) {
      const i = rowOff + x * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      total++;
      if (lum >= whiteThr) white++;
    }
    isBlank[y] = total > 0 && white / total >= whiteFrac ? 1 : 0;
  }

  // 2) 연속 빈 행 런 → minGap 이상이면 분리 지점(런의 중앙). 최상/최하단 가장자리 여백은 제외.
  const cuts: number[] = [];
  let runStart = -1;
  for (let y = 0; y <= H; y++) {
    const blank = y < H ? isBlank[y] : 0;
    if (blank) {
      if (runStart < 0) runStart = y;
    } else {
      if (runStart >= 0) {
        const runLen = y - runStart;
        if (runLen >= minGap && runStart > 0 && y < H) cuts.push(Math.floor((runStart + y) / 2));
        runStart = -1;
      }
    }
  }

  // 3) 컷으로 구간을 나누고, 각 구간의 앞뒤 빈 행을 트림한 뒤 크롭.
  const bounds = [0, ...cuts, H];
  const segments: SplitSegment[] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    let top = bounds[k];
    let bot = bounds[k + 1];
    while (top < bot && isBlank[top]) top++;
    while (bot > top && isBlank[bot - 1]) bot--;
    const h = bot - top;
    if (h < minSeg) continue;
    const seg = document.createElement('canvas');
    seg.width = W;
    seg.height = h;
    const sctx = seg.getContext('2d');
    sctx.drawImage(canvas, 0, top, W, h, 0, 0, W, h);
    segments.push({ dataUrl: seg.toDataURL('image/jpeg', 0.92), y: top, height: h });
  }

  if (!segments.length) {
    return [{ dataUrl: canvas.toDataURL('image/jpeg', 0.92), y: 0, height: H }];
  }
  return segments;
};

// ─────────────────────────────────────────────────────────────────────────────
// 정밀 추출(extractProductImages): 통이미지에서 '깨끗한 제품 사진'만 뽑고
//   원본 캡션 텍스트 띠·구분선(금색 라인)은 버린다. (텍스트는 AI 자동생성 or 수동입력 영역)
// 원리: 행을 흰(BLANK)/컬러많음(PHOTO)/어두운잉크만(TEXT)/얇은띠(LINE)로 분류 → PHOTO 밴드만 추출.
//   실측(2026-07-10, jpeg-js): 트리니티 사진15·텍스트8·선21 / 버진루프 6·7·4 / 핑거위글 18·22·32.

export interface ExtractOptions {
  whiteThreshold?: number; // 픽셀 '흰' 밝기 임계. default 232
  blankFrac?: number;      // 행이 '빈 행'이려면 흰 비율 이상. default 0.985
  colorSat?: number;       // 이 채도 이상이면 '컬러(사진)' 픽셀. default 45
  inkLum?: number;         // 이 밝기 미만 + 저채도면 '잉크(텍스트/선)'. default 115
  inkSat?: number;         // 잉크 판정 채도 상한. default 40
  textMaxH?: number;       // 이 높이 이하 + 저컬러 + 저잉크 밴드 = 텍스트(버림). default 75
  textMaxColor?: number;   // 텍스트 밴드 컬러 비율 상한. default 0.04
  textMaxInk?: number;     // 텍스트 밴드 잉크 비율 상한. default 0.20
  lineMaxH?: number;       // 이 높이 이하 밴드 = 구분선(버림). default 8
  minPhotoH?: number;      // 유지할 최소 사진 높이. default 40
  mergeGapPx?: number;     // 인접 사진이 이 빈틈 미만이면 병합(슬라이버 방지). default 24
  sampleCols?: number;     // 행당 샘플 열 수. default 64
}

export const extractProductImages = async (
  source: string | HTMLImageElement,
  opts: ExtractOptions = {},
): Promise<SplitSegment[]> => {
  const img = typeof source === 'string' ? await loadImage(source) : source;
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return [];

  const whiteThr = opts.whiteThreshold ?? 232;
  const blankFrac = opts.blankFrac ?? 0.985;
  const colorSat = opts.colorSat ?? 45;
  const inkLum = opts.inkLum ?? 115;
  const inkSat = opts.inkSat ?? 40;
  const textMaxH = opts.textMaxH ?? 75;
  const textMaxColor = opts.textMaxColor ?? 0.04;
  const textMaxInk = opts.textMaxInk ?? 0.20;
  const lineMaxH = opts.lineMaxH ?? 8;
  const minPhotoH = opts.minPhotoH ?? 40;
  const mergeGap = opts.mergeGapPx ?? 24;
  const sampleCols = opts.sampleCols ?? 64;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [{ dataUrl: typeof source === 'string' ? source : canvas.toDataURL('image/jpeg', 0.9), y: 0, height: H }];
  ctx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    throw new Error('이미지 픽셀을 읽을 수 없습니다(CORS taint). 프록시/ base64 경유로 로드하세요.');
  }

  // 1) 행별 흰/잉크/컬러 비율
  const colStep = Math.max(1, Math.floor(W / sampleCols));
  const rw = new Float32Array(H);
  const ri = new Float32Array(H);
  const rc = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0, w = 0, ink = 0, col = 0;
    const off = y * W * 4;
    for (let x = 0; x < W; x += colStep) {
      const i = off + x * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      n++;
      if (lum >= whiteThr) w++;
      else if (lum < inkLum && sat < inkSat) ink++;
      if (sat >= colorSat && lum < 245) col++;
    }
    rw[y] = w / n; ri[y] = ink / n; rc[y] = col / n;
  }

  // 2) 빈 행 기준으로 밴드 분리
  const rawBands: Array<[number, number]> = [];
  let s = -1;
  for (let y = 0; y <= H; y++) {
    const blank = y < H && rw[y] >= blankFrac;
    if (blank) { if (s >= 0) { rawBands.push([s, y]); s = -1; } }
    else if (s < 0) s = y;
  }

  // 3) 밴드 분류(PHOTO/TEXT/LINE)
  const classify = (a: number, b: number): { a: number; b: number; t: string } => {
    const h = b - a;
    let c = 0, ink = 0;
    for (let y = a; y < b; y++) { c += rc[y]; ink += ri[y]; }
    c /= h; ink /= h;
    let t = 'PHOTO';
    if (h <= lineMaxH) t = 'LINE';
    else if (h <= textMaxH && c < textMaxColor && ink < textMaxInk) t = 'TEXT';
    return { a, b, t };
  };
  const classed = rawBands.map(([a, b]) => classify(a, b));

  // 4) 인접 PHOTO 밴드 병합(작은 빈틈으로 갈라진 슬라이버 재결합)
  const merged: Array<{ a: number; b: number; t: string }> = [];
  for (const band of classed) {
    const last = merged[merged.length - 1];
    if (last && last.t === 'PHOTO' && band.t === 'PHOTO' && band.a - last.b < mergeGap) last.b = band.b;
    else merged.push({ ...band });
  }

  // 5) PHOTO 밴드만 크롭
  const segments: SplitSegment[] = [];
  for (const band of merged) {
    if (band.t !== 'PHOTO') continue;
    const h = band.b - band.a;
    if (h < minPhotoH) continue;
    const seg = document.createElement('canvas');
    seg.width = W;
    seg.height = h;
    seg.getContext('2d')!.drawImage(canvas, 0, band.a, W, h, 0, 0, W, h);
    segments.push({ dataUrl: seg.toDataURL('image/jpeg', 0.9), y: band.a, height: h });
  }

  if (!segments.length) {
    return [{ dataUrl: canvas.toDataURL('image/jpeg', 0.9), y: 0, height: H }];
  }
  return segments;
};

export interface ClassifiedSegment { dataUrl: string; y: number; height: number; type: 'PHOTO' | 'TEXT' | 'LINE' }

// 통이미지 → 밴드별 분류(PHOTO/TEXT/LINE) + 각 밴드 크롭. extractProductImages와 같은 픽셀 로직이나
//   PHOTO만 남기지 않고 전부(타입 붙여) 반환 → 통이미지 flow 변환에서 [깨끗한 사진]과 [설명 텍스트]를 분리해 쓴다.
export const splitClassified = async (
  source: string | HTMLImageElement,
  opts: ExtractOptions = {},
): Promise<ClassifiedSegment[]> => {
  const img = typeof source === 'string' ? await loadImage(source) : source;
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return [];
  const whiteThr = opts.whiteThreshold ?? 232;
  const blankFrac = opts.blankFrac ?? 0.985;
  const colorSat = opts.colorSat ?? 45;
  const inkLum = opts.inkLum ?? 115;
  const inkSat = opts.inkSat ?? 40;
  const textMaxH = opts.textMaxH ?? 75;
  const textMaxColor = opts.textMaxColor ?? 0.04;
  const textMaxInk = opts.textMaxInk ?? 0.20;
  const lineMaxH = opts.lineMaxH ?? 8;
  const minPhotoH = opts.minPhotoH ?? 40;
  const mergeGap = opts.mergeGapPx ?? 24;
  const sampleCols = opts.sampleCols ?? 64;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, W, H).data; }
  catch { throw new Error('이미지 픽셀을 읽을 수 없습니다(CORS taint). 프록시/base64 경유로 로드하세요.'); }

  const colStep = Math.max(1, Math.floor(W / sampleCols));
  const rw = new Float32Array(H), ri = new Float32Array(H), rc = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0, w = 0, ink = 0, col = 0;
    const off = y * W * 4;
    for (let x = 0; x < W; x += colStep) {
      const i = off + x * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      n++;
      if (lum >= whiteThr) w++;
      else if (lum < inkLum && sat < inkSat) ink++;
      if (sat >= colorSat && lum < 245) col++;
    }
    rw[y] = w / n; ri[y] = ink / n; rc[y] = col / n;
  }
  const rawBands: Array<[number, number]> = [];
  let s = -1;
  for (let y = 0; y <= H; y++) {
    const blank = y < H && rw[y] >= blankFrac;
    if (blank) { if (s >= 0) { rawBands.push([s, y]); s = -1; } }
    else if (s < 0) s = y;
  }
  const classify = (a: number, b: number) => {
    const h = b - a; let c = 0, ink = 0;
    for (let y = a; y < b; y++) { c += rc[y]; ink += ri[y]; }
    c /= h; ink /= h;
    let t: 'PHOTO' | 'TEXT' | 'LINE' = 'PHOTO';
    if (h <= lineMaxH) t = 'LINE';
    else if (h <= textMaxH && c < textMaxColor && ink < textMaxInk) t = 'TEXT';
    return { a, b, t };
  };
  const classed = rawBands.map(([a, b]) => classify(a, b));
  const merged: Array<{ a: number; b: number; t: 'PHOTO' | 'TEXT' | 'LINE' }> = [];
  for (const band of classed) {
    const last = merged[merged.length - 1];
    if (last && last.t === 'PHOTO' && band.t === 'PHOTO' && band.a - last.b < mergeGap) last.b = band.b;
    else merged.push({ ...band });
  }
  const out: ClassifiedSegment[] = [];
  for (const band of merged) {
    const h = band.b - band.a;
    if (band.t === 'PHOTO' && h < minPhotoH) continue;
    const seg = document.createElement('canvas');
    seg.width = W; seg.height = h;
    seg.getContext('2d')!.drawImage(canvas, 0, band.a, W, h, 0, 0, W, h);
    out.push({ dataUrl: seg.toDataURL('image/jpeg', 0.9), y: band.a, height: h, type: band.t });
  }
  return out;
};

// 진단용: 조각 안 만들고 컷 위치/빈행 통계만 반환(튜닝·검증에 사용).
export const analyzeSplit = async (
  source: string | HTMLImageElement,
  opts: SplitOptions = {},
): Promise<{ W: number; H: number; cuts: number[]; segments: { y: number; height: number }[] }> => {
  const segs = await splitImageByWhitespace(source, opts);
  const img = typeof source === 'string' ? await loadImage(source) : source;
  return {
    W: img.naturalWidth || img.width,
    H: img.naturalHeight || img.height,
    cuts: segs.map((s) => s.y),
    segments: segs.map((s) => ({ y: s.y, height: s.height })),
  };
};
