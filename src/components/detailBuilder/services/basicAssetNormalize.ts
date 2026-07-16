// 기본형 Phase 2 자산 정규화 (2026-07-16) — 기본형 전용. 단순형/flowImageSplitter 무영향.
//   Step 2-1: 패키지 이미지의 "가장자리와 연결된 밝은 배경"만 flood-fill로 제거해 박스가 영역을
//             꽉 채우게 트림. 내부 흰색(디자인/글자)·투명·그림자는 보존.
//   ⚠️ 단순 "흰 픽셀 전부 제거"가 아니라 "가장자리 연결 배경만" 제거(=박스 안 흰 글자 보존).
//
//   근거(핑거위글 실측 패키지 밴드 800×431 · 2026-07-16):
//     가로 여백 과다(박스 x240~568) → 트림 후 366×431, 여백 54% 제거, 박스가 프레임을 채움.

export interface PackageNormalizeResult {
  dataUrl: string;                 // 트림된 이미지(신뢰도 낮으면 원본 그대로)
  trimmed: boolean;                // 실제로 트림했는지
  sourceSize: { w: number; h: number };
  contentBbox: { x0: number; y0: number; x1: number; y1: number } | null;
  padding: number;                 // 실제 적용된 padding(px, 짧은 변 기준)
  outputSize: { w: number; h: number };
  reason: string;                  // 디버그: 트림/보류 사유
}

const PKG = {
  BG_TOLERANCE: 18,     // 배경색과의 채널 최대차 허용치
  PAD_FRAC: 0.06,       // 콘텐츠 bbox에 더할 안전 padding 비율(짧은 변 기준)
  FF_MAX_DIM: 400,      // flood-fill 다운스케일 상한
  MIN_BBOX_FRAC: 0.04,  // 콘텐츠 bbox가 밴드 면적의 이 미만이면 비정상 → 트림 보류
  MIN_SIDE_FRAC: 0.12,  // 콘텐츠 폭·높이가 밴드의 이 미만이면 비정상 → 보류
  MIN_TRIM_GAIN: 0.03,  // 여백 제거가 이보다 작으면(이미 꽉 참) 굳이 트림 안 함
} as const;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('패키지 이미지 로드 실패'));
    img.src = src;
  });

// ── HERO 메인이미지 영역 정규화 (Step 3-b) ──
//   문제: 선정된 HERO 원본이 가로로 납작한 직사각형이면 메인 슬롯에서 배너처럼 약하게 보임.
//   해결: 외곽 여백 trim → 제품 bbox → "정사각형 우선(세로형 제품만 약세로 4:5~5:6)" 캔버스에
//         제품을 중앙·크게 재배치. 가로 배너 비율은 만들지 않음. 제품 비율 훼손/잘림 없음.
//   결과를 data.mainImage에 저장 → PreviewGodo HERO·썸네일 메인이 동일 자산 공유(여백으로 인한
//   썸네일 제품 축소 방지). ⚠️ HERO 후보 선정(selectHeroIndex)은 무변경 — 자산 가공만.
export interface HeroNormalizeResult {
  dataUrl: string; normalized: boolean;
  sourceSize: { w: number; h: number };
  productBbox: { x0: number; y0: number; x1: number; y1: number } | null;
  canvasRatio: string;   // '1:1' | '5:6' | '4:5'
  outputSize: { w: number; h: number };
  reason: string;
}
const HERO = {
  BG_TOLERANCE: 16,      // 배경 판정(제품/그림자 보존 위해 패키지보다 약간 관대)
  PRODUCT_FRAC: 0.86,    // 제품이 캔버스 제약 변에서 차지할 비율(나머지=안전 여백)
  TALL_TRIGGER: 1.15,    // 제품 h/w 가 이 이상이면 세로형 → 약세로 캔버스
  MAX_TALL_HW: 1.25,     // 캔버스 최대 세로비(4:5). 그 사이 5:6(1.2)
  BASE_W: 1000,          // 정규화 캔버스 기준 폭
  FF_MAX_DIM: 500,       // 여백 판정 다운스케일 상한
} as const;

export const normalizeHeroMainImage = async (src: string): Promise<HeroNormalizeResult> => {
  const fail = (reason: string, w = 0, h = 0): HeroNormalizeResult => ({
    dataUrl: src, normalized: false, sourceSize: { w, h }, productBbox: null, canvasRatio: '1:1', outputSize: { w, h }, reason,
  });
  if (typeof document === 'undefined' || !src) return fail('환경/소스 없음');
  let img: HTMLImageElement;
  try { img = await loadImage(src); } catch { return fail('이미지 로드 실패'); }
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  if (!W || !H) return fail('크기 0');

  // 1) 외곽 밝은 배경 flood-fill trim → 제품 content bbox
  const scale = Math.min(1, HERO.FF_MAX_DIM / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * scale)), th = Math.max(1, Math.round(H * scale));
  const sc = document.createElement('canvas'); sc.width = tw; sc.height = th;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  if (!sctx) return fail('canvas 없음', W, H);
  sctx.drawImage(img, 0, 0, tw, th);
  let d: Uint8ClampedArray;
  try { d = sctx.getImageData(0, 0, tw, th).data; } catch { return fail('픽셀 접근 불가(CORS)', W, H); }
  const corner = (x: number, y: number): [number, number, number] => { const i = (y * tw + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const cs = [corner(0, 0), corner(tw - 1, 0), corner(0, th - 1), corner(tw - 1, th - 1)];
  const bg = [0, 1, 2].map((c) => median4(cs.map((v) => v[c]))) as [number, number, number];
  const area = tw * th;
  const isBg = new Uint8Array(area);
  for (let p = 0; p < area; p++) { const i = p * 4; if (Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) <= HERO.BG_TOLERANCE) isBg[p] = 1; }
  const seen = new Uint8Array(area); const stack = new Int32Array(area); let sp = 0;
  const push = (p: number) => { if (isBg[p] && !seen[p]) { seen[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < tw; x++) { push(x); push((th - 1) * tw + x); }
  for (let y = 0; y < th; y++) { push(y * tw); push(y * tw + tw - 1); }
  while (sp > 0) { const p = stack[--sp]; const x = p % tw; const y = (p - x) / tw; if (x + 1 < tw) push(p + 1); if (x - 1 >= 0) push(p - 1); if (y + 1 < th) push(p + tw); if (y - 1 >= 0) push(p - tw); }
  let x0 = tw, y0 = th, x1 = -1, y1 = -1;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (!seen[y * tw + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return fail('제품 콘텐츠 없음', W, H);
  const inv = 1 / scale;
  const fx0 = Math.floor(x0 * inv), fy0 = Math.floor(y0 * inv), fx1 = Math.min(W, Math.ceil((x1 + 1) * inv)), fy1 = Math.min(H, Math.ceil((y1 + 1) * inv));
  const pw = fx1 - fx0, ph = fy1 - fy0;
  if (pw < 4 || ph < 4) return fail('제품 bbox 비정상', W, H);

  // 2) 캔버스 비율 결정 — 정사각 우선, 세로형 제품만 약세로(5:6~4:5). 가로 배너 금지.
  let ratioHW = 1.0; let ratioLabel = '1:1';
  if (ph > pw * HERO.TALL_TRIGGER) {
    ratioHW = ph / pw >= 1.4 ? HERO.MAX_TALL_HW : 1.2;
    ratioLabel = ratioHW === HERO.MAX_TALL_HW ? '4:5' : '5:6';
  }
  const canvasW = HERO.BASE_W, canvasH = Math.round(canvasW * ratioHW);

  // 3) 제품을 제약 변의 PRODUCT_FRAC까지 확대(비율 유지) 후 중앙 배치
  const s2 = Math.min((canvasW * HERO.PRODUCT_FRAC) / pw, (canvasH * HERO.PRODUCT_FRAC) / ph);
  const drawW = Math.round(pw * s2), drawH = Math.round(ph * s2);
  const dx = Math.round((canvasW - drawW) / 2), dy = Math.round((canvasH - drawH) / 2);
  const out = document.createElement('canvas'); out.width = canvasW; out.height = canvasH;
  const octx = out.getContext('2d');
  if (!octx) return fail('출력 canvas 없음', W, H);
  octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, canvasW, canvasH);
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  octx.drawImage(img, fx0, fy0, pw, ph, dx, dy, drawW, drawH);
  let dataUrl: string;
  try { dataUrl = out.toDataURL('image/jpeg', 0.92); } catch { return fail('toDataURL 실패', W, H); }
  return {
    dataUrl, normalized: true, sourceSize: { w: W, h: H },
    productBbox: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 }, canvasRatio: ratioLabel,
    outputSize: { w: canvasW, h: canvasH },
    reason: `${W}x${H}(제품 ${pw}x${ph}) → ${ratioLabel} 캔버스 ${canvasW}x${canvasH}, 제품 중앙 ${drawW}x${drawH}`,
  };
};

// ── 바나나몰 자체 홍보 GIF 판정 (Step 2-2) ──
//   개요.xlsx 규칙: "GIF 가로형·파란 외곽테두리(바나나몰) 움짤은 안 씀". 업체 제공 GIF는 유지.
//   복합 조건(하드코딩 없음): 확장자 .gif AND 가로형 AND 4변 파란 프레임 비율 기준 이상.
//   실측(1667813619_1.gif 800×450): 4변 blueFrac 0.86~0.95 / 내부 0.05 → 매우 견고.
//   ⚠️ OCR·신규 AI 없음. 밴드는 split에서 JPEG로 변해 mime 소실 → "원본 URL 확장자"로 판정.
export interface PromoGifResult { isPromo: boolean; reason: string; edgeBlue: [number, number, number, number] }
// 임계 근거(1667813619_1.gif 실측, 네이티브 800×450·엣지7px): 4변 파랑 0.75~0.83.
//   제품/패키지 밴드 대조군(cb14/25/03/24): 4변 0.00. → 분리 폭 압도적, 임계 0.50 안전.
//   ⚠️ 다운스케일이 얇은 파란 프레임을 희석시킴 → MAX_DIM 크게(네이티브 유지) + 얇은 엣지 필수.
const PROMO = {
  MIN_ASPECT: 1.2,      // width/height 이 이상이면 가로형
  EDGE_PX_FRAC: 0.015,  // 가장자리 두께 = 짧은 변의 이 비율(최소 4px) — 두꺼우면 내부가 섞여 희석됨
  BLUE_EDGE_FRAC: 0.50, // 한 변이 '파란 프레임'이려면 파랑 픽셀 비율 이 이상(gif 0.75 vs 대조군 0.00)
  MAX_DIM: 1000,        // 판정용 상한(대부분 홍보 gif 네이티브 유지 → 프레임 희석 방지)
} as const;
const isBlue = (r: number, g: number, b: number): boolean => (b - r) > 30 && (b - g) > 20 && b > 90;

export const isBananamallPromoGif = async (sourceUrl: string, loadUrl: string): Promise<PromoGifResult> => {
  const no = (reason: string): PromoGifResult => ({ isPromo: false, reason, edgeBlue: [0, 0, 0, 0] });
  if (!/\.gif(\?|#|$)/i.test(sourceUrl || '')) return no('gif 아님');       // 확장자 게이트(비-gif는 로드 안 함)
  if (typeof document === 'undefined') return no('환경 없음');
  let img: HTMLImageElement;
  try { img = await loadImage(loadUrl); } catch { return no('로드 실패'); }
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  if (!W || !H) return no('크기 0');
  if (W < H * PROMO.MIN_ASPECT) return no(`세로/정방형(${W}x${H}) → 가로형 아님`);

  const scale = Math.min(1, PROMO.MAX_DIM / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * scale)), th = Math.max(1, Math.round(H * scale));
  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return no('canvas 없음');
  ctx.drawImage(img, 0, 0, tw, th);
  let d: Uint8ClampedArray;
  try { d = ctx.getImageData(0, 0, tw, th).data; } catch { return no('픽셀 접근 불가(CORS)'); }

  const t = Math.max(4, Math.round(Math.min(tw, th) * PROMO.EDGE_PX_FRAC));
  const blueFrac = (xs: () => Iterable<[number, number]>): number => {
    let n = 0, blue = 0;
    for (const [x, y] of xs()) { const i = (y * tw + x) * 4; n++; if (isBlue(d[i], d[i + 1], d[i + 2])) blue++; }
    return n ? blue / n : 0;
  };
  const top = blueFrac(function* () { for (let y = 0; y < t; y++) for (let x = 0; x < tw; x++) yield [x, y]; });
  const bot = blueFrac(function* () { for (let y = th - t; y < th; y++) for (let x = 0; x < tw; x++) yield [x, y]; });
  const lft = blueFrac(function* () { for (let x = 0; x < t; x++) for (let y = 0; y < th; y++) yield [x, y]; });
  const rgt = blueFrac(function* () { for (let x = tw - t; x < tw; x++) for (let y = 0; y < th; y++) yield [x, y]; });
  const edgeBlue: [number, number, number, number] = [+top.toFixed(2), +bot.toFixed(2), +lft.toFixed(2), +rgt.toFixed(2)];
  const allBlue = top >= PROMO.BLUE_EDGE_FRAC && bot >= PROMO.BLUE_EDGE_FRAC && lft >= PROMO.BLUE_EDGE_FRAC && rgt >= PROMO.BLUE_EDGE_FRAC;
  if (!allBlue) return { isPromo: false, reason: `파란 프레임 아님(4변 ${edgeBlue.join('/')})`, edgeBlue };
  return { isPromo: true, reason: `바나나몰 홍보 GIF(가로형 ${W}x${H} · 4변 파랑 ${edgeBlue.join('/')})`, edgeBlue };
};

const median4 = (vals: number[]): number => {
  const s = [...vals].sort((a, b) => a - b);
  return (s[1] + s[2]) / 2;
};

/**
 * 패키지 밴드(data URL) → 가장자리 배경 트림 결과. 신뢰도 낮으면 원본 유지(원본종횡비/모서리 보존).
 * 로컬 canvas만 사용. 실패 시 원본 그대로 반환(안전).
 */
export const normalizePackageImage = async (src: string): Promise<PackageNormalizeResult> => {
  const fail = (reason: string, w = 0, h = 0): PackageNormalizeResult => ({
    dataUrl: src, trimmed: false, sourceSize: { w, h }, contentBbox: null, padding: 0,
    outputSize: { w, h }, reason,
  });
  if (typeof document === 'undefined' || !src) return fail('환경/소스 없음');

  let img: HTMLImageElement;
  try { img = await loadImage(src); } catch { return fail('이미지 로드 실패'); }
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return fail('크기 0');

  // 다운스케일 마스크 추출
  const scale = Math.min(1, PKG.FF_MAX_DIM / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * scale));
  const th = Math.max(1, Math.round(H * scale));
  const sc = document.createElement('canvas');
  sc.width = tw; sc.height = th;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  if (!sctx) return fail('canvas 컨텍스트 없음', W, H);
  sctx.drawImage(img, 0, 0, tw, th);
  let d: Uint8ClampedArray;
  try { d = sctx.getImageData(0, 0, tw, th).data; } catch { return fail('픽셀 접근 불가(CORS)', W, H); }

  // 배경색 = 네 모서리 채널별 중앙값
  const corner = (x: number, y: number): [number, number, number] => {
    const i = (y * tw + x) * 4; return [d[i], d[i + 1], d[i + 2]];
  };
  const cs = [corner(0, 0), corner(tw - 1, 0), corner(0, th - 1), corner(tw - 1, th - 1)];
  const bg = [0, 1, 2].map((c) => median4(cs.map((v) => v[c]))) as [number, number, number];

  const area = tw * th;
  const isBg = new Uint8Array(area);
  for (let p = 0; p < area; p++) {
    const i = p * 4;
    const diff = Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
    if (diff <= PKG.BG_TOLERANCE) isBg[p] = 1;
  }
  // 가장자리에서 flood-fill → 가장자리 연결 배경만 방문
  const seen = new Uint8Array(area);
  const stack = new Int32Array(area);
  let sp = 0;
  const pushIfBg = (p: number) => { if (isBg[p] && !seen[p]) { seen[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < tw; x++) { pushIfBg(x); pushIfBg((th - 1) * tw + x); }
  for (let y = 0; y < th; y++) { pushIfBg(y * tw); pushIfBg(y * tw + (tw - 1)); }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % tw, y = (p - x) / tw;
    if (x + 1 < tw) pushIfBg(p + 1);
    if (x - 1 >= 0) pushIfBg(p - 1);
    if (y + 1 < th) pushIfBg(p + tw);
    if (y - 1 >= 0) pushIfBg(p - tw);
  }
  // 콘텐츠 = 가장자리 연결 배경이 아닌 픽셀(내부 흰색 포함) → bbox
  let x0 = tw, y0 = th, x1 = -1, y1 = -1;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      if (!seen[y * tw + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return fail('콘텐츠 없음(전부 배경)', W, H);

  // 다운스케일 bbox → 원본 좌표
  const inv = 1 / scale;
  const fx0 = Math.floor(x0 * inv), fy0 = Math.floor(y0 * inv);
  const fx1 = Math.min(W, Math.ceil((x1 + 1) * inv)), fy1 = Math.min(H, Math.ceil((y1 + 1) * inv));
  const bw = fx1 - fx0, bh = fy1 - fy0;

  // 신뢰도/비정상 검사 — 보류 시 원본 유지
  const bboxFrac = (bw * bh) / (W * H);
  if (bboxFrac < PKG.MIN_BBOX_FRAC || bw < W * PKG.MIN_SIDE_FRAC || bh < H * PKG.MIN_SIDE_FRAC) {
    return { ...fail(`콘텐츠 bbox 비정상(frac ${bboxFrac.toFixed(3)}, ${bw}x${bh}) → 트림 보류`, W, H), contentBbox: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 } };
  }
  const trimGain = 1 - bboxFrac;
  if (trimGain < PKG.MIN_TRIM_GAIN) {
    return { ...fail(`여백 미미(gain ${(trimGain * 100).toFixed(0)}%) → 이미 꽉 참, 원본 유지`, W, H), contentBbox: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 } };
  }

  // 안전 padding(짧은 변 기준) 후 크롭
  const pad = Math.round(Math.min(bw, bh) * PKG.PAD_FRAC);
  const cx0 = Math.max(0, fx0 - pad), cy0 = Math.max(0, fy0 - pad);
  const cx1 = Math.min(W, fx1 + pad), cy1 = Math.min(H, fy1 + pad);
  const cw = cx1 - cx0, ch = cy1 - cy0;

  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  const octx = out.getContext('2d');
  if (!octx) return { ...fail('출력 canvas 없음', W, H), contentBbox: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 } };
  octx.drawImage(img, cx0, cy0, cw, ch, 0, 0, cw, ch);
  let dataUrl: string;
  try { dataUrl = out.toDataURL('image/jpeg', 0.92); } catch { return { ...fail('toDataURL 실패', W, H), contentBbox: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 } }; }

  return {
    dataUrl, trimmed: true, sourceSize: { w: W, h: H },
    contentBbox: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 }, padding: pad,
    outputSize: { w: cw, h: ch },
    reason: `여백 ${(trimGain * 100).toFixed(0)}% 제거(${W}x${H}→${cw}x${ch}, pad ${pad}px)`,
  };
};
