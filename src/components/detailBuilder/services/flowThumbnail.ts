// @ts-nocheck — 섬네일: ①원본(메인몰) 섬네일과 닮은 상세컷 매칭(유사도, VLM 없이) ②크기 정규화(bbox+fit).
// 원리: 원본 섬네일 = 사람이 고른 대표(패키지/제품). 그와 가장 닮은 '브랜딩 없는 상세컷'을 골라
//   제품 경계(bbox)만 잘라 표준 정사각 프레임에 일정 여백으로 앉힘 → 모든 섬네일에서 제품 크기 균일.

// 이미지 서명(32x32 그레이스케일, 밝기 정규화) — 대략적 구도 비교용. CDN은 프록시 URL로 넘겨야 taint 회피.
const SIG_N = 32;
export const imageSignature = (src: string): Promise<Float32Array | null> =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = SIG_N; c.height = SIG_N;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return res(null);
      ctx.drawImage(img, 0, 0, SIG_N, SIG_N); // 정사각으로 눌러 구도만 남김
      let data: Uint8ClampedArray;
      try { data = ctx.getImageData(0, 0, SIG_N, SIG_N).data; } catch { return res(null); }
      const sig = new Float32Array(SIG_N * SIG_N);
      let mean = 0;
      for (let i = 0; i < sig.length; i++) {
        const j = i * 4;
        const g = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;
        sig[i] = g; mean += g;
      }
      mean /= sig.length;
      for (let i = 0; i < sig.length; i++) sig[i] -= mean; // 밝기 불변
      res(sig);
    };
    img.onerror = () => res(null);
    img.src = src;
  });

// 두 서명의 거리(작을수록 닮음). 정규화된 SSD.
export const signatureDistance = (a: Float32Array, b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s / a.length;
};

// 크기 정규화: 제품 경계(흰 배경 제외 bbox)를 잘라 표준 정사각 흰 프레임에 여백 두고 fit.
// 배경 있는 제품은 bbox=전체라 프레임을 꽉 채우고, 흰배경 누끼컷은 제품만 잘려 균일 크기가 된다.
export const normalizeThumbnail = (
  src: string,
  opts: { size?: number; margin?: number; whiteThr?: number } = {},
): Promise<string | null> =>
  new Promise((res) => {
    const size = opts.size ?? 800;
    const margin = opts.margin ?? 0.1;
    const whiteThr = opts.whiteThr ?? 242;
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight;
      if (!W || !H) return res(null);
      const s = Math.min(1, 1000 / Math.max(W, H));
      const cw = Math.max(1, Math.round(W * s)), ch = Math.max(1, Math.round(H * s));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return res(null);
      ctx.drawImage(img, 0, 0, cw, ch);
      let data: Uint8ClampedArray;
      try { data = ctx.getImageData(0, 0, cw, ch).data; } catch { return res(null); }
      // 제품(비-흰) 경계 bbox
      let minX = cw, minY = ch, maxX = -1, maxY = -1;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const i = (y * cw + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum < whiteThr) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
      }
      if (maxX < 0) { minX = 0; minY = 0; maxX = cw - 1; maxY = ch - 1; } // 전부 흰색이면 전체
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const out = document.createElement('canvas'); out.width = size; out.height = size;
      const octx = out.getContext('2d');
      if (!octx) return res(null);
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, size, size);
      const avail = size * (1 - 2 * margin);
      const scale = Math.min(avail / bw, avail / bh);
      const dw = bw * scale, dh = bh * scale;
      octx.drawImage(c, minX, minY, bw, bh, (size - dw) / 2, (size - dh) / 2, dw, dh);
      try { res(out.toDataURL('image/jpeg', 0.92)); } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = src;
  });
