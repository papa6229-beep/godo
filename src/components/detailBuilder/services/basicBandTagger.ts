// 기본형 전용 밴드 태거 (2026-07-16) — P0: TEXT 밴드가 이미지 슬롯에 중복 배정되는 것을 차단.
//   철학: splitImageByWhitespace(공용, 수정금지)가 만든 밴드를 "소비만" 하는 후처리 태거.
//   신규 AI 호출 0 · 로컬 픽셀만 · 단순형/flowImageSplitter 무영향.
//
//   ⚠️ 기존 splitClassified의 TEXT 규칙은 'h ≤ 75px' 높이 게이트라, 여러 줄짜리(146px+) 문단
//      텍스트를 PHOTO로 오판한다(이게 중복 버그의 원인). 그래서 여기선 높이를 상한 조건으로
//      쓰지 않고, "가장 큰 연결요소 면적 + 작은 글자형 컴포넌트 수 + 채도 + 흰 배경 + 행 점유율"의
//      복합 신호로 고신뢰 TEXT만 확정한다.
//
//   임계값 근거(핑거위글 실제 상세 800×12272, 21밴드 실측 · 2026-07-16):
//     · 텍스트 문단(band1/4/6): largestCC 0.005~0.025, smallCC 18~87, color<0.10, maxRowDark<0.35
//     · 검은 제품컷(PHOTO 13개):  largestCC 0.15~0.49,  smallCC 0~7,   maxRowDark 0.34~0.69
//     · 제품+주석(MIXED band13):  largestCC 0.150,       smallCC 79
//     · 사이즈 도해(band11):      largestCC 0.127,       smallCC 31   → MIXED(제품 있음 → 이미지 사용가능)
//   → largestCC(가장 큰 연결요소 면적)가 TEXT↔제품컷을 완벽 분리하는 핵심 지표.

export type BasicBandType = 'PHOTO' | 'TEXT' | 'MIXED' | 'UNKNOWN';

export interface BasicBandMetrics {
  width: number;
  height: number;
  white: number;        // 밝은(≥232) 픽셀 비율
  color: number;        // 유채색(sat≥45 & lum<245) 픽셀 비율
  ink: number;          // 저채도 잉크(lum<115 & sat<40) 픽셀 비율
  meanSat: number;      // 평균 채도
  maxRowDark: number;   // 행별 어두운(lum<140) 픽셀 비율의 최대값(=한 행에서 피사체가 가로로 넓게 점유)
  largestCC: number;    // 가장 큰 연결요소가 밴드 면적에서 차지하는 비율
  smallCC: number;      // 작은(글자형) 연결요소 개수
  ncomp: number;        // 전체 연결요소 개수
  fg: number;           // 전경(비-흰 or 유채색) 픽셀 비율
}

export interface TaggedBand {
  dataUrl: string;
  type: BasicBandType;
  metrics: BasicBandMetrics;
  reason: string;       // 판정 근거(디버그 로그용)
}

// ── 판정 임계값(실측 고정, 상수화 — 향후 다른 샘플로 튜닝 시 여기만 수정) ──
export const TAGGER_THRESHOLDS = {
  // TEXT(고신뢰): 큰 피사체 없음 + 작은 글자 컴포넌트 다수 + 저채도 + 밝은 배경 + 넓게 점유한 행 없음
  TEXT_MAX_LARGEST_CC: 0.08,
  TEXT_MIN_SMALL_CC: 12,
  TEXT_MAX_COLOR: 0.10,
  TEXT_MIN_WHITE: 0.55,
  TEXT_MAX_ROW_DARK: 0.45,
  // 피사체 존재 신호
  SUBJECT_MIN_LARGEST_CC: 0.12,
  SUBJECT_MIN_ROW_DARK: 0.30,
  // MIXED: 피사체 + 글자 컴포넌트 다수 공존
  MIXED_MIN_SMALL_CC: 20,
  // PHOTO 보조: 유채색이 충분(컬러 제품/마케팅)
  PHOTO_MIN_COLOR: 0.15,
  // CC 분석용 다운스케일 상한
  CC_MAX_DIM: 200,
} as const;

const SAMPLE_COLS = 64;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('밴드 이미지 로드 실패'));
    img.src = src;
  });

// 밴드 1장의 픽셀 지표 계산(행 스캔 + 연결요소). 실패 시 UNKNOWN 안전값.
const computeMetrics = (img: HTMLImageElement): BasicBandMetrics | null => {
  if (typeof document === 'undefined') return null;
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return null;

  // ── 행 스캔(원본 해상도, 열 샘플링) ── white/color/ink/maxRowDark/meanSat
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, W, H).data; } catch { return null; }

  const colStep = Math.max(1, Math.floor(W / SAMPLE_COLS));
  let nAll = 0, white = 0, color = 0, ink = 0, satSum = 0;
  let maxRowDark = 0;
  for (let y = 0; y < H; y++) {
    const off = y * W * 4;
    let rowN = 0, rowDark = 0;
    for (let x = 0; x < W; x += colStep) {
      const i = off + x * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      nAll++; rowN++;
      satSum += sat;
      if (lum >= 232) white++;
      else if (lum < 115 && sat < 40) ink++;
      if (sat >= 45 && lum < 245) color++;
      if (lum < 140) rowDark++;
    }
    if (rowN > 0) { const rd = rowDark / rowN; if (rd > maxRowDark) maxRowDark = rd; }
  }
  const whiteR = nAll ? white / nAll : 0;
  const colorR = nAll ? color / nAll : 0;
  const inkR = nAll ? ink / nAll : 0;
  const meanSat = nAll ? satSum / nAll : 0;

  // ── 연결요소(다운스케일 마스크 + BFS 4-이웃) ── largestCC/smallCC
  const scale = Math.min(1, TAGGER_THRESHOLDS.CC_MAX_DIM / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * scale));
  const th = Math.max(1, Math.round(H * scale));
  const cc = { largest: 0, small: 0, ncomp: 0, fg: 0 };
  const sc = document.createElement('canvas');
  sc.width = tw; sc.height = th;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  if (sctx) {
    sctx.drawImage(img, 0, 0, tw, th);
    let sdata: Uint8ClampedArray | null = null;
    try { sdata = sctx.getImageData(0, 0, tw, th).data; } catch { sdata = null; }
    if (sdata) {
      const area = tw * th;
      const fg = new Uint8Array(area);
      let fgCount = 0;
      for (let p = 0; p < area; p++) {
        const i = p * 4;
        const r = sdata[i], g = sdata[i + 1], b = sdata[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        // 전경 = 흰색보다 어두움 OR 유채색
        if (lum < 200 || (sat >= 45 && lum < 245)) { fg[p] = 1; fgCount++; }
      }
      cc.fg = area ? fgCount / area : 0;
      const seen = new Uint8Array(area);
      const stack = new Int32Array(area);
      const sizes: number[] = [];
      let largest = 0;
      for (let p0 = 0; p0 < area; p0++) {
        if (!fg[p0] || seen[p0]) continue;
        let sp = 0; stack[sp++] = p0; seen[p0] = 1; let cnt = 0;
        while (sp > 0) {
          const p = stack[--sp]; cnt++;
          const x = p % tw, y = (p - x) / tw;
          if (x + 1 < tw) { const q = p + 1; if (fg[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } }
          if (x - 1 >= 0) { const q = p - 1; if (fg[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } }
          if (y + 1 < th) { const q = p + tw; if (fg[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } }
          if (y - 1 >= 0) { const q = p - tw; if (fg[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } }
        }
        sizes.push(cnt);
        if (cnt > largest) largest = cnt;
      }
      cc.ncomp = sizes.length;
      cc.largest = area ? largest / area : 0;
      const smallCap = Math.max(6, largest * 0.15);
      cc.small = sizes.filter((v) => v >= 3 && v <= smallCap).length;
    }
  }

  return {
    width: W, height: H,
    white: whiteR, color: colorR, ink: inkR, meanSat,
    maxRowDark, largestCC: cc.largest, smallCC: cc.small, ncomp: cc.ncomp, fg: cc.fg,
  };
};

// 지표 → 타입. TEXT는 고신뢰일 때만(애매하면 MIXED/UNKNOWN). 제품컷을 TEXT로 오판하지 않는 게 최우선.
export const classifyBand = (m: BasicBandMetrics): { type: BasicBandType; reason: string } => {
  const T = TAGGER_THRESHOLDS;
  const isText =
    m.largestCC < T.TEXT_MAX_LARGEST_CC &&
    m.smallCC >= T.TEXT_MIN_SMALL_CC &&
    m.color < T.TEXT_MAX_COLOR &&
    m.white >= T.TEXT_MIN_WHITE &&
    m.maxRowDark < T.TEXT_MAX_ROW_DARK;
  if (isText) {
    return { type: 'TEXT', reason: `largestCC ${m.largestCC.toFixed(3)}<${T.TEXT_MAX_LARGEST_CC} · smallCC ${m.smallCC}≥${T.TEXT_MIN_SMALL_CC} · color ${m.color.toFixed(3)}<${T.TEXT_MAX_COLOR} · maxRowDark ${m.maxRowDark.toFixed(3)}<${T.TEXT_MAX_ROW_DARK}` };
  }
  const subject = m.largestCC >= T.SUBJECT_MIN_LARGEST_CC || m.maxRowDark >= T.SUBJECT_MIN_ROW_DARK;
  if (subject && m.smallCC >= T.MIXED_MIN_SMALL_CC) {
    return { type: 'MIXED', reason: `subject(largestCC ${m.largestCC.toFixed(3)} / maxRowDark ${m.maxRowDark.toFixed(3)}) + smallCC ${m.smallCC}≥${T.MIXED_MIN_SMALL_CC}` };
  }
  if (subject || m.color >= T.PHOTO_MIN_COLOR) {
    return { type: 'PHOTO', reason: subject ? `subject(largestCC ${m.largestCC.toFixed(3)} / maxRowDark ${m.maxRowDark.toFixed(3)})` : `color ${m.color.toFixed(3)}≥${T.PHOTO_MIN_COLOR}` };
  }
  return { type: 'UNKNOWN', reason: `약한 신호(largestCC ${m.largestCC.toFixed(3)} · smallCC ${m.smallCC} · color ${m.color.toFixed(3)})` };
};

/**
 * 기본형 밴드(data URL, 위→아래 순서) → 타입 태깅 결과.
 * 지표 계산 실패한 밴드는 UNKNOWN(안전: 이미지 슬롯에서 최후순위, 강제차단 아님).
 */
export const tagBasicBands = async (dataUrls: string[]): Promise<TaggedBand[]> => {
  const out: TaggedBand[] = [];
  for (const url of dataUrls) {
    let metrics: BasicBandMetrics | null = null;
    try {
      const img = await loadImage(url);
      metrics = computeMetrics(img);
    } catch { metrics = null; }
    if (!metrics) {
      out.push({
        dataUrl: url, type: 'UNKNOWN',
        metrics: { width: 0, height: 0, white: 0, color: 0, ink: 0, meanSat: 0, maxRowDark: 0, largestCC: 0, smallCC: 0, ncomp: 0, fg: 0 },
        reason: '지표 계산 실패(로드/픽셀 접근 불가) → UNKNOWN',
      });
      continue;
    }
    const { type, reason } = classifyBand(metrics);
    out.push({ dataUrl: url, type, metrics, reason });
  }
  return out;
};
