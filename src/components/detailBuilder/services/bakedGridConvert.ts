// @ts-nocheck — baked 통이미지(격자 포함)를 결정론으로 재구성: 색-무관 테두리 제거 + 셀 컷 + 마케팅 보존.
//   AI 없음. 기존 simple2(bakedCropReader)/OPTION_PRESERVE/simple1 raw 무접촉.
//   EditorFlow에서 "격자 있는 baked(=simple1 행) 상품"만 이 길로. 격자 없으면 null → 호출측이 simple1 유지.
//   규칙(큰 줄기 응용): 맨 아래 격자 = 상세영역(셀 단위 잘라 테두리 제거) · 그 위 = 마케팅 통짜 보존 · 아래 여백 = 보존.
//   테두리는 색 불문(금·회·주황·빨강) 제거 — "테두리면 지운다"는 결정론 픽셀 처리.
import { toProxyUrl } from './exportImagePrep';

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('load')); im.src = src; });

// ── 색-무관 배경/잉크 ──
const isBg = (r, g, b) => { const lum = 0.299 * r + 0.587 * g + 0.114 * b, sat = Math.max(r, g, b) - Math.min(r, g, b); return lum >= 238 && sat <= 18; };

// 축소본에서 기하 분석(속도) → 원본 좌표로 스케일백.
const analyzeGrid = (im) => {
  const W0 = im.naturalWidth, H0 = im.naturalHeight;
  const s = Math.min(1, 1500 / Math.max(W0, H0));
  const W = Math.max(1, Math.round(W0 * s)), H = Math.max(1, Math.round(H0 * s));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return null;
  ctx.drawImage(im, 0, 0, W, H);
  let data; try { data = ctx.getImageData(0, 0, W, H).data; } catch { return null; }
  const ink = (x, y) => { const i = (y * W + x) * 4; return !isBg(data[i], data[i + 1], data[i + 2]); };
  const rowCov = new Float32Array(H);
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (ink(x, y)) n++; rowCov[y] = n / W; }
  const thinLines = (cov, len, thresh, maxThick) => { const out = []; let st = -1; for (let i = 0; i <= len; i++) { const v = i < len ? cov[i] : 0; if (v >= thresh) { if (st < 0) st = i; } else { if (st >= 0) { if (i - st <= maxThick) out.push((st + i - 1) >> 1); st = -1; } } } return out; };
  const hlines = thinLines(rowCov, H, 0.5, 10);
  // 규칙적 간격 가로선 묶음 = 격자 밴드(여러 개)
  const bands = [];
  if (hlines.length >= 3) {
    const gaps = []; for (let i = 0; i < hlines.length - 1; i++) gaps.push(hlines[i + 1] - hlines[i]);
    let i = 0;
    while (i < gaps.length) { let base = gaps[i], j = i; while (j < gaps.length && base > 0 && Math.abs(gaps[j] - base) / base <= 0.3) { base = base * 0.6 + gaps[j] * 0.4; j++; } if ((j - i) + 1 >= 3) { bands.push([hlines[i], hlines[j]]); i = j; } else i++; }
  }
  const inv = 1 / s;
  const grids = [];
  for (const [y0, y1] of bands) {
    const hh = Math.max(1, y1 - y0);
    const colCov = new Float32Array(W);
    for (let x = 0; x < W; x++) { let n = 0; for (let y = y0; y < y1; y++) if (ink(x, y)) n++; colCov[x] = n / hh; }
    const vl = thinLines(colCov, W, 0.42, 14);
    const gh = hlines.filter((cc) => cc >= y0 - 2 && cc <= y1 + 2);
    const cells = [];
    for (let ri = 0; ri < gh.length - 1; ri++) for (let ci = 0; ci < Math.max(0, vl.length - 1); ci++) {
      const x0 = vl[ci], x1 = vl[ci + 1];
      if (x1 - x0 > W * 0.15 && gh[ri + 1] - gh[ri] > 36) cells.push([Math.round(x0 * inv), Math.round(gh[ri] * inv), Math.round(x1 * inv), Math.round(gh[ri + 1] * inv)]);
    }
    if (cells.length >= 2) grids.push({ y0: Math.round(y0 * inv), y1: Math.round(y1 * inv), cols: Math.max(1, vl.length - 1), cells });
  }
  return { W: W0, H: H0, grids };
};

// 셀 crop + 색-무관 deframe(가장자리 연결 비배경을 셀변 6% 이내에서만 흰색화, 두꺼우면 정지=제품보호). 코어 보존율 반환.
const cropDeframe = (im, x, y, w, h, deframe) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return null;
  ctx.drawImage(im, x, y, w, h, 0, 0, w, h);
  let core = 1;
  if (deframe) {
    try {
      const id = ctx.getImageData(0, 0, w, h), d = id.data;
      const at = (px, py) => { const i = (py * w + px) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      const coreInk = () => { let n = 0; for (let py = (h * 0.2) | 0; py < h * 0.8; py++) for (let px = (w * 0.2) | 0; px < w * 0.8; px++) { const [r, g, b] = at(px, py); if (!isBg(r, g, b)) n++; } return n; };
      const before = coreInk();
      const MAXB = Math.max(3, Math.floor(Math.min(w, h) * 0.06));
      const white = (px, py) => { const i = (py * w + px) * 4; d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; };
      for (let py = 0; py < h; py++) { for (let k = 0; k < MAXB; k++) { const [r, g, b] = at(k, py); if (isBg(r, g, b)) break; white(k, py); } for (let k = 0; k < MAXB; k++) { const [r, g, b] = at(w - 1 - k, py); if (isBg(r, g, b)) break; white(w - 1 - k, py); } }
      for (let px = 0; px < w; px++) { for (let k = 0; k < MAXB; k++) { const [r, g, b] = at(px, k); if (isBg(r, g, b)) break; white(px, k); } for (let k = 0; k < MAXB; k++) { const [r, g, b] = at(px, h - 1 - k); if (isBg(r, g, b)) break; white(px, h - 1 - k); } }
      ctx.putImageData(id, 0, 0);
      const after = coreInk(); core = before ? after / before : 1;
    } catch { core = 0; }
  }
  try { return { url: c.toDataURL('image/jpeg', 0.9), core }; } catch { return null; }
};

let _seq = 0;
const bid = () => `bg_${(_seq++).toString(36)}`;

export interface BakedGridResult { flowBlocks: any[]; columns: 1 | 2; notes: string[] }

// 격자 있는 baked 통이미지 → flowBlocks. 격자 없으면 null(호출측이 simple1 유지).
export const convertBakedGrid = async (imageUrls: string[]): Promise<BakedGridResult | null> => {
  const blocks: any[] = []; const notes: string[] = []; let anyTwoCol = false; let anyGrid = false;
  for (const url of imageUrls) {
    const im = await loadImage(toProxyUrl(url));
    const geo = analyzeGrid(im); if (!geo) { blocks.push({ id: bid(), image: url, preserved: true }); continue; }
    const H = geo.H, W = geo.W;
    if (!geo.grids.length) { blocks.push({ id: bid(), image: url, preserved: true }); continue; } // 이 이미지엔 격자 없음 → 통짜
    anyGrid = true;
    // 규칙: 맨 아래 격자 = 상세영역. 그 위 = 마케팅 보존.
    const detail = geo.grids[geo.grids.length - 1];
    if (detail.y0 > 20) { const r = cropDeframe(im, 0, 0, W, detail.y0, false); if (r) blocks.push({ id: bid(), image: r.url, marketing: true }); }
    if (detail.cols >= 2) anyTwoCol = true;
    const cells = [...detail.cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x0, y0, x1, y1] of cells) {
      const r = cropDeframe(im, x0, y0, x1 - x0, y1 - y0, true);
      if (!r) continue;
      // 안전게이트: deframe이 제품 코어를 5% 넘게 깎으면 원본 유지(제품 보호)
      let u = r.url; if (r.core < 0.95) { const s = cropDeframe(im, x0, y0, x1 - x0, y1 - y0, false); if (s) { u = s.url; notes.push('셀 deframe 위험 → 원본 유지'); } }
      blocks.push({ id: bid(), image: u, caption: '' });
    }
    if (detail.y1 < H - 20) { const r = cropDeframe(im, 0, detail.y1, W, H - detail.y1, false); if (r) blocks.push({ id: bid(), image: r.url, preserved: true }); }
    notes.push(`격자 상세 ${detail.cells.length}셀(${detail.cols}열) 분리 + 상단 마케팅 보존`);
  }
  if (!anyGrid) return null;
  return { flowBlocks: blocks, columns: anyTwoCol ? 2 : 1, notes };
};
