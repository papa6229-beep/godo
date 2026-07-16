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
