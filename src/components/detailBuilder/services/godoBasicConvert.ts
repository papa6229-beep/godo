// 기본형(통이미지 baked) → 고도몰 섹션형 ProductData 조립 (2026-07-13 Claude 브레인판).
//   흐름: 통이미지 여백분할(밴드) → Claude 비전 1콜(읽기+슬롯배정+라이트리라이트) → Partial<ProductData> 조립.
//   결과를 loadTemporary({...prev,...data})로 주입하면 좌측 입력부+PreviewGodo까지 편집가능 상태.
//   ⚠️ 사진 보고 글 생성 금지(basicVisionReader 규칙). godo 슬롯=고정 그릇, 기본형 밴드=재료.
import type { ProductData, SummaryInfo } from '../types';
import { splitImageByWhitespace, extractProductImages } from './flowImageSplitter';
import { toProxyUrl } from './exportImagePrep';
import { readBasicLayout } from './basicVisionReader';
import { tagBasicBands, type BasicBandType, type TaggedBand } from './basicBandTagger';

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

const DEV = import.meta.env.DEV;   // 개발 모드에서만 밴드/검증 디버그 로그 출력

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
 * ① 구조 변환 (AI 없음, 즉시, 키 불필요) — 단순형처럼 "일단 작동".
 *   통이미지 → 제품 컷(extractProductImages, 비-AI 픽셀분류) → godo 이미지 슬롯에 순서대로 배치.
 *   상품명·브랜드는 엑셀에서. 문구·스펙·핵심특징은 비움(그다음 AI 읽기 단계에서 채움).
 */
export const buildBasicStructure = async (
  input: BasicConvertInput,
  onProgress?: (p: BasicProgress) => void,
): Promise<BasicConvertResult> => {
  const notes: string[] = [];
  onProgress?.({ phase: '통이미지 분할(제품 컷)' });
  const cuts: string[] = [];
  for (const url of input.detailImageUrls) {
    try {
      const segs = await extractProductImages(toProxyUrl(url));
      for (const s of segs) cuts.push(s.dataUrl);
    } catch {
      notes.push(`이미지 분할 실패(건너뜀): ${url.slice(0, 50)}…`);
    }
  }
  if (!cuts.length) throw new Error('상세 통이미지에서 제품 컷을 추출하지 못했습니다. (이미지 URL/프록시 확인)');

  const at = (i: number): string | null => (i >= 0 && i < cuts.length ? cuts[i] : null);
  const summaryInfo: SummaryInfo = {
    feature: '', type: '', material: '', size: '상세페이지 참조', weight: '', power: '',
    maker: input.brandName || '',
  };
  const data: Partial<ProductData> = {
    productNameKr: input.productNameKr,
    productNameEn: input.productNameEn || '',
    brandName: input.brandName || '',
    ...(input.themeColor ? { themeColor: input.themeColor } : {}),
    summaryInfo,
    // 순서대로 배치(비-AI): 0=메인 1=피처 2~4=Point01 5~7=Point02. AI 읽기 단계에서 재배치·문구.
    mainImage: at(0),
    featureImage: at(1),
    point1Title: '', point1Image1: at(2), point1Image2: at(3), point1Image3: at(4),
    point2Title: '', point2Image1: at(5), point2Image2: at(6), point2Image3: at(7),
    aiPoint1Desc: '', aiPoint1Desc2: '', aiPoint1Desc3: '',
    aiPoint2Desc: '', aiPoint2Desc2: '', aiPoint2Desc3: '',
  };
  if (cuts.length > 8) notes.push(`제품 컷 ${cuts.length}개 중 8개만 슬롯 배치(나머지는 AI 읽기에서 재배치).`);
  notes.push('구조만 배치됨 — 문구·스펙은 비어 있습니다. 🤖 AI로 읽기로 채우세요.');
  return { data, notes, bandCount: cuts.length };
};

/**
 * ② AI 읽기 (Claude) — 통이미지 밴드를 Claude가 읽어 문구·스펙·핵심특징 채우고 슬롯 재배치.
 *   실패해도 ①구조 결과는 그대로 남는다(별도 호출).
 */
export const convertBasicWithAI = async (
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

  // ①-b 밴드 타입 태깅(로컬 픽셀, AI 0콜) — TEXT 밴드를 이미지 슬롯에서 차단하기 위한 메타데이터.
  onProgress?.({ phase: '밴드 타입 분석' });
  const tagged: TaggedBand[] = await tagBasicBands(bands);
  const bandTypes: BasicBandType[] = tagged.map((t) => t.type);
  if (DEV) {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[기본형 태거] 밴드 ${tagged.length}장`);
    // eslint-disable-next-line no-console
    console.table(tagged.map((t, i) => ({
      idx: i, type: t.type, h: t.metrics.height,
      largestCC: +t.metrics.largestCC.toFixed(3), smallCC: t.metrics.smallCC,
      color: +t.metrics.color.toFixed(3), white: +t.metrics.white.toFixed(2),
      maxRowDark: +t.metrics.maxRowDark.toFixed(3), reason: t.reason,
    })));
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  // ② Claude 비전 1콜: 밴드 읽기 + 슬롯 배정 + 라이트 리라이트 + 의미 줄바꿈. (타입 전달 = 프롬프트 가드)
  onProgress?.({ phase: `AI 읽기·배치 (밴드 ${bands.length}장)` });
  const r = await readBasicLayout(bands, {
    productNameKr: input.productNameKr,
    productNameEn: input.productNameEn,
    brandName: input.brandName,
    introText: input.introText,
  }, bandTypes);
  notes.push(...r.notes);

  // ③ 로컬 검증(Layer C): TEXT 밴드는 어떤 <img> 슬롯에도 못 들어간다. Claude가 실수해도 여기서 차단.
  //    (캡션/설명은 그대로 유지 — 라이브 HTML 설명은 살리고 "중복 텍스트 이미지"만 제거하는 게 목표.)
  onProgress?.({ phase: '슬롯 검증·조립·패키지 배치' });
  const at = (i: number): string | null => (i >= 0 && i < bands.length ? bands[i] : null);
  const typeAt = (i: number): BasicBandType | null => (i >= 0 && i < bandTypes.length ? bandTypes[i] : null);
  type Decision = { role: string; requested: number; reqType: string; result: string; final: number; reason: string };
  const decisions: Decision[] = [];
  const usedImg = new Set<number>();

  // 단일 역할 슬롯(main/feature/size/package): TEXT면 거부 → 빈 슬롯(잘못된 사진보다 빈 슬롯이 안전).
  const validateRole = (reqIndex: number, role: string): number => {
    if (reqIndex < 0 || reqIndex >= bands.length) {
      decisions.push({ role, requested: reqIndex, reqType: '-', result: 'none', final: -1, reason: '요청 없음/범위 밖' });
      return -1;
    }
    const t = typeAt(reqIndex)!;
    if (t === 'TEXT') {
      decisions.push({ role, requested: reqIndex, reqType: t, result: 'rejected→empty', final: -1, reason: 'text_band_not_allowed_for_image_slot' });
      return -1;
    }
    usedImg.add(reqIndex);
    decisions.push({ role, requested: reqIndex, reqType: t, result: 'accepted', final: reqIndex, reason: 'ok' });
    return reqIndex;
  };
  const mainIndexV = validateRole(r.mainIndex, 'main');
  const featureIndexV = validateRole(r.featureIndex, 'feature');
  const sizeIndexV = validateRole(r.sizeIndex, 'size');
  const packageIndexV = validateRole(r.packageIndex, 'package');

  // Point 이미지: 2패스. 패스1 = 유효(비-TEXT) 인덱스 예약 → 패스2 = 거부분만 ±1~2 "유일한" 미사용 PHOTO/MIXED로 보수 대체.
  const p1 = r.point1.blocks;
  const p2 = r.point2.blocks;
  const pointSlots = [
    { role: 'point1-1', reqIndex: p1[0]?.index ?? -1 },
    { role: 'point1-2', reqIndex: p1[1]?.index ?? -1 },
    { role: 'point1-3', reqIndex: p1[2]?.index ?? -1 },
    { role: 'point2-1', reqIndex: p2[0]?.index ?? -1 },
    { role: 'point2-2', reqIndex: p2[1]?.index ?? -1 },
    { role: 'point2-3', reqIndex: p2[2]?.index ?? -1 },
  ];
  const finalPoint: Record<string, number> = {};
  const rejectedSlots: { role: string; reqIndex: number }[] = [];
  for (const s of pointSlots) {                          // 패스1
    if (s.reqIndex < 0 || s.reqIndex >= bands.length) { finalPoint[s.role] = -1; continue; }
    const t = typeAt(s.reqIndex)!;
    if (t === 'TEXT') { rejectedSlots.push(s); finalPoint[s.role] = -1; continue; }
    usedImg.add(s.reqIndex);
    finalPoint[s.role] = s.reqIndex;
    decisions.push({ role: s.role, requested: s.reqIndex, reqType: t, result: 'accepted', final: s.reqIndex, reason: 'ok' });
  }
  for (const s of rejectedSlots) {                       // 패스2(보수적 대체)
    const cands = new Set<number>();
    for (let d = 1; d <= 2; d++) for (const j of [s.reqIndex - d, s.reqIndex + d]) {
      if (j >= 0 && j < bands.length && !usedImg.has(j)) {
        const tj = typeAt(j);
        if (tj === 'PHOTO' || tj === 'MIXED') cands.add(j);
      }
    }
    const uniq = [...cands];
    if (uniq.length === 1) {
      usedImg.add(uniq[0]);
      finalPoint[s.role] = uniq[0];
      decisions.push({ role: s.role, requested: s.reqIndex, reqType: 'TEXT', result: 'rejected→fallback', final: uniq[0], reason: `±2 유일 ${typeAt(uniq[0])} 밴드 ${uniq[0]}` });
    } else {
      finalPoint[s.role] = -1;
      decisions.push({ role: s.role, requested: s.reqIndex, reqType: 'TEXT', result: 'rejected→empty', final: -1, reason: uniq.length ? `±2 후보 다수(${uniq.join(',')}) → 모호 → 비움` : '±2 후보 없음 → 비움' });
    }
  }

  if (DEV) {
    // eslint-disable-next-line no-console
    console.groupCollapsed('[기본형 검증] 이미지 슬롯 결정');
    // eslint-disable-next-line no-console
    console.table(decisions);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
  const rejectedCount = decisions.filter((d) => d.result.startsWith('rejected')).length;
  if (rejectedCount) notes.push(`TEXT 밴드 ${rejectedCount}건을 이미지 슬롯에서 차단(설명 중복 방지).`);

  const mainImage = at(mainIndexV);
  const featureImage = at(featureIndexV);
  const sizeImage = at(sizeIndexV);
  const packageImage = at(packageIndexV);

  const summaryInfo: SummaryInfo = {
    feature: r.summary.feature ?? '',
    type: r.summary.type ?? '',
    material: r.summary.material ?? '',
    size: '상세페이지 참조',                          // 규칙: 옵션별 치수 다양·픽셀 부정확 → 고정
    weight: r.summary.weight ?? '',
    power: r.summary.power ?? '',
    maker: input.brandName || r.summary.maker || '',
  };

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
    point1Image1: at(finalPoint['point1-1']),
    point1Image2: at(finalPoint['point1-2']),
    point1Image3: at(finalPoint['point1-3']),

    point2Title: r.point2.title || '',
    aiPoint2Desc: p2[0]?.caption ?? '',
    aiPoint2Desc2: p2[1]?.caption ?? '',
    aiPoint2Desc3: p2[2]?.caption ?? '',
    point2Image1: at(finalPoint['point2-1']),
    point2Image2: at(finalPoint['point2-2']),
    point2Image3: at(finalPoint['point2-3']),
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
