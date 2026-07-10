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
