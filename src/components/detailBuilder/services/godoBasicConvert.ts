// 기본형(통이미지 baked) → 고도몰 섹션형 ProductData 조립 (2026-07-13 Claude 브레인판).
//   흐름: 통이미지 여백분할(밴드) → Claude 비전 1콜(읽기+슬롯배정+라이트리라이트) → Partial<ProductData> 조립.
//   결과를 loadTemporary({...prev,...data})로 주입하면 좌측 입력부+PreviewGodo까지 편집가능 상태.
//   ⚠️ 사진 보고 글 생성 금지(basicVisionReader 규칙). godo 슬롯=고정 그릇, 기본형 밴드=재료.
import type { ProductData, SummaryInfo } from '../types';
import { splitImageByWhitespace } from './flowImageSplitter';
import { toProxyUrl } from './exportImagePrep';
import { readBasicLayout } from './basicVisionReader';

export interface BasicConvertInput {
  productNameKr: string;
  productNameEn?: string;
  brandName?: string;
  themeColor?: string;
  introText?: string;
  detailImageUrls: string[];  // goodsm 통이미지 URL(들) — 상세HTML 순서(위→아래)
}
export interface BasicConvertResult {
  data: Partial<ProductData>;
  notes: string[];
  bandCount: number;
}
export interface BasicProgress { phase: string }

// ── 패키지 자동 배치(수동 이동 불필요): 히어로 제품 bbox를 canvas로 읽어 우하단 안 가리는 위치 계산 ──
//    base64(분할 밴드)면 OK, CORS taint 시 null(폴백=기본 위치).
const computePackageLayout = (
  mainImageSrc: string, heroWidth = 700, pkgWidth = 196,
): Promise<{ x: number; y: number; width: number; height: number } | null> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined' || !mainImageSrc) return resolve(null);
    const pkgH = Math.round(pkgWidth * 1.16);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const iw = img.naturalWidth, ih = img.naturalHeight;
        if (!iw || !ih) return resolve(null);
        const aw = 200, ah = Math.max(1, Math.round((ih * aw) / iw));
        const c = document.createElement('canvas'); c.width = aw; c.height = ah;
        const ctx = c.getContext('2d'); if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, aw, ah);
        let px: Uint8ClampedArray;
        try { px = ctx.getImageData(0, 0, aw, ah).data; } catch { return resolve(null); }
        const mainH = Math.round((ih * heroWidth) / iw);
        const xDisp = heroWidth - pkgWidth - 6;
        const c0 = Math.max(0, Math.floor((xDisp / heroWidth) * aw));
        const c1 = Math.min(aw, Math.ceil(((xDisp + pkgWidth) / heroWidth) * aw));
        let prodBottomRow = -1;
        for (let y = ah - 1; y >= 0 && prodBottomRow < 0; y--) {
          for (let x = c0; x < c1; x++) {
            const i = (y * aw + x) * 4;
            if (px[i + 3] > 10 && Math.min(px[i], px[i + 1], px[i + 2]) < 245) { prodBottomRow = y; break; }
          }
        }
        const prodBottomDisp = prodBottomRow >= 0 ? Math.round((prodBottomRow / ah) * mainH) : 0;
        const straddleY = Math.round(mainH - pkgH * 0.5);
        const y = Math.max(8, Math.max(prodBottomDisp + 6, straddleY));
        resolve({ x: xDisp, y, width: pkgWidth, height: pkgH });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = mainImageSrc;
  });

/**
 * 기본형 재료(엑셀 메타 + 통이미지 URL) → 고도몰 섹션형 Partial<ProductData>.
 * onProgress로 단계 표시. 실패는 throw(상위 UI가 메시지 표시).
 */
export const convertBasicFromSource = async (
  input: BasicConvertInput,
  onProgress?: (p: BasicProgress) => void,
): Promise<BasicConvertResult> => {
  const notes: string[] = [];

  // ① 통이미지 여백분할 → 밴드(텍스트 밴드 포함: 스펙·설명 읽기용). 순서 유지.
  onProgress?.({ phase: '통이미지 분할' });
  const bands: string[] = [];
  for (const url of input.detailImageUrls) {
    try {
      const segs = await splitImageByWhitespace(toProxyUrl(url));
      for (const s of segs) bands.push(s.dataUrl);
    } catch {
      notes.push(`이미지 분할 실패(건너뜀): ${url.slice(0, 60)}…`);
    }
  }
  if (!bands.length) throw new Error('상세 통이미지에서 밴드를 추출하지 못했습니다. (이미지 URL/프록시 확인)');

  // ② Claude 비전 1콜: 밴드 읽기 + 슬롯 배정 + 라이트 리라이트 + 의미 줄바꿈.
  onProgress?.({ phase: `AI 읽기·배치 (밴드 ${bands.length}장)` });
  const r = await readBasicLayout(bands, {
    productNameKr: input.productNameKr,
    productNameEn: input.productNameEn,
    brandName: input.brandName,
    introText: input.introText,
  });
  notes.push(...r.notes);

  // ③ 조립.
  onProgress?.({ phase: '슬롯 조립·패키지 배치' });
  const at = (i: number): string | null => (i >= 0 && i < bands.length ? bands[i] : null);
  const mainImage = at(r.mainIndex);
  const featureImage = at(r.featureIndex);
  const sizeImage = at(r.sizeIndex);
  const packageImage = at(r.packageIndex);

  const summaryInfo: SummaryInfo = {
    feature: r.summary.feature ?? '',
    type: r.summary.type ?? '',
    material: r.summary.material ?? '',
    size: '상세페이지 참조',                          // 규칙: 옵션별 치수 다양·픽셀 부정확 → 고정
    weight: r.summary.weight ?? '',
    power: r.summary.power ?? '',
    maker: input.brandName || r.summary.maker || '',
  };

  const p1 = r.point1.blocks;
  const p2 = r.point2.blocks;
  const data: Partial<ProductData> = {
    productNameKr: r.productNameKr || input.productNameKr,
    productNameEn: r.productNameEn || input.productNameEn || '',
    brandName: input.brandName || '',
    ...(input.themeColor ? { themeColor: input.themeColor } : {}),
    summaryInfo,
    ...(r.keyFeatures.length === 3 ? { keyFeatures: r.keyFeatures } : {}),
    mainImage,
    featureImage,
    sizeImage,
    packageImage,
    ...(packageImage ? { isPackageImageEnabled: true } : {}),

    point1Title: r.point1.title || '',
    aiPoint1Desc: p1[0]?.caption ?? '',
    aiPoint1Desc2: p1[1]?.caption ?? '',
    aiPoint1Desc3: p1[2]?.caption ?? '',
    point1Image1: at(p1[0]?.index ?? -1),
    point1Image2: at(p1[1]?.index ?? -1),
    point1Image3: at(p1[2]?.index ?? -1),

    point2Title: r.point2.title || '',
    aiPoint2Desc: p2[0]?.caption ?? '',
    aiPoint2Desc2: p2[1]?.caption ?? '',
    aiPoint2Desc3: p2[2]?.caption ?? '',
    point2Image1: at(p2[0]?.index ?? -1),
    point2Image2: at(p2[1]?.index ?? -1),
    point2Image3: at(p2[2]?.index ?? -1),
  };

  if (mainImage && packageImage) {
    const layout = await computePackageLayout(mainImage);
    if (layout) data.packageLayout = layout;
    else notes.push('패키지 자동배치 계산 실패 — 기본 위치 사용(필요시 수동 조정).');
  }
  if (r.keyFeatures.length !== 3) notes.push(`keyFeatures ${r.keyFeatures.length}개(3 아님) — 메인특징 수동 보완 필요.`);
  if (!mainImage) notes.push('메인 이미지 후보 없음 — 수동 지정 필요.');

  return { data, notes, bandCount: bands.length };
};
