// 기본형(통이미지 baked) → 고도몰 섹션형 ProductData 조립 (2026-07-13 Claude 브레인판).
//   흐름: 통이미지 여백분할(밴드) → Claude 비전 1콜(읽기+슬롯배정+라이트리라이트) → Partial<ProductData> 조립.
//   결과를 loadTemporary({...prev,...data})로 주입하면 좌측 입력부+PreviewGodo까지 편집가능 상태.
//   ⚠️ 사진 보고 글 생성 금지(basicVisionReader 규칙). godo 슬롯=고정 그릇, 기본형 밴드=재료.
import type { ProductData, SummaryInfo } from '../types';
import { splitImageByWhitespace, extractProductImages } from './flowImageSplitter';
import { toProxyUrl } from './exportImagePrep';
import { readBasicLayout } from './basicVisionReader';
import { tagBasicBands, dhashHamming, type BasicBandType, type TaggedBand } from './basicBandTagger';
import { normalizePackageImage, isBananamallPromoGif, normalizeHeroMainImage } from './basicAssetNormalize';

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
    const proxied = toProxyUrl(url);
    try {
      if ((await isBananamallPromoGif(url, proxied)).isPromo) {   // 바나나몰 홍보 GIF는 구조 배치 후보에서도 제외
        notes.push('바나나몰 홍보 GIF 제외(구조 배치).');
        continue;
      }
      const segs = await extractProductImages(proxied);
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

  // ── 기준선 계측(Phase2 Step1) — 단계별 wall time. 결과물엔 무영향(측정만). ──
  //    주의: whitespace_split_ms엔 이미지 다운로드+디코딩이 포함(splitImageByWhitespace 내부 loadImage).
  //          band_tagging_ms엔 밴드별 재디코딩 포함. 필요시 후속 단계에서 세분.
  const timings: Record<string, number> = {};
  const _t0 = performance.now();
  let _tPrev = _t0;
  const mark = (k: string): void => { const now = performance.now(); timings[k] = +(now - _tPrev).toFixed(1); _tPrev = now; };

  // ① 통이미지 여백분할 → 밴드(텍스트 밴드 포함: 스펙·설명 읽기용). 순서 유지.
  //    각 밴드가 온 원본 URL의 "바나나몰 홍보 GIF" 여부(promoFlags)를 병렬 추적 — 이미지 슬롯 전면 차단용.
  onProgress?.({ phase: '통이미지 분할' });
  const bands: string[] = [];
  const promoFlags: boolean[] = [];
  for (const url of input.detailImageUrls) {
    const proxied = toProxyUrl(url);
    let promo = false;
    try { promo = (await isBananamallPromoGif(url, proxied)).isPromo; } catch { promo = false; }
    try {
      const segs = await splitImageByWhitespace(proxied);
      for (const s of segs) { bands.push(s.dataUrl); promoFlags.push(promo); }
      if (promo) notes.push('바나나몰 홍보 GIF 감지 → 이미지 슬롯에서 제외(캡션 근거로도 미사용).');
    } catch {
      notes.push(`이미지 분할 실패(건너뜀): ${url.slice(0, 60)}…`);
    }
  }
  if (!bands.length) throw new Error('상세 통이미지에서 밴드를 추출하지 못했습니다. (이미지 URL/프록시 확인)');
  mark('whitespace_split_ms');

  // ①-b 밴드 타입 태깅(로컬 픽셀, AI 0콜) — TEXT 밴드를 이미지 슬롯에서 차단하기 위한 메타데이터.
  onProgress?.({ phase: '밴드 타입 분석' });
  const tagged: TaggedBand[] = await tagBasicBands(bands);
  const bandTypes: BasicBandType[] = tagged.map((t) => t.type);
  if (DEV) {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[기본형 태거] 밴드 ${tagged.length}장`);
    // eslint-disable-next-line no-console
    console.table(tagged.map((t, i) => ({
      idx: i, type: promoFlags[i] ? 'PROMO_GIF' : t.type, h: t.metrics.height,
      largestCC: +t.metrics.largestCC.toFixed(3), smallCC: t.metrics.smallCC,
      color: +t.metrics.color.toFixed(3), white: +t.metrics.white.toFixed(2),
      maxRowDark: +t.metrics.maxRowDark.toFixed(3), reason: promoFlags[i] ? '바나나몰 홍보 GIF' : t.reason,
    })));
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
  mark('band_tagging_ms');

  // ② Claude 비전 1콜: 밴드 읽기 + 슬롯 배정 + 라이트 리라이트 + 의미 줄바꿈. (타입 전달 = 프롬프트 가드)
  onProgress?.({ phase: `AI 읽기·배치 (밴드 ${bands.length}장)` });
  const r = await readBasicLayout(bands, {
    productNameKr: input.productNameKr,
    productNameEn: input.productNameEn,
    brandName: input.brandName,
    introText: input.introText,
  }, bandTypes, promoFlags);
  notes.push(...r.notes);
  mark('claude_request_ms');
  if (DEV) {
    // eslint-disable-next-line no-console
    console.log('[기본형 Claude응답] 요청 인덱스 → main:%o feature:%o size:%o package:%o | point1:%o point2:%o',
      r.mainIndex, r.featureIndex, r.sizeIndex, r.packageIndex,
      r.point1.blocks.map((b) => b.index), r.point2.blocks.map((b) => b.index));
  }

  // ③ 로컬 검증(Layer C): TEXT 밴드는 어떤 <img> 슬롯에도 못 들어간다. Claude가 실수해도 여기서 차단.
  //    (캡션/설명은 그대로 유지 — 라이브 HTML 설명은 살리고 "중복 텍스트 이미지"만 제거하는 게 목표.)
  onProgress?.({ phase: '슬롯 검증·조립·패키지 배치' });
  const at = (i: number): string | null => (i >= 0 && i < bands.length ? bands[i] : null);
  const typeAt = (i: number): BasicBandType | null => (i >= 0 && i < bandTypes.length ? bandTypes[i] : null);
  // 이미지 슬롯 차단 사유(허용이면 null): 바나나몰 홍보 GIF 또는 TEXT 밴드.
  const imageBlockReason = (i: number): string | null => {
    if (i < 0 || i >= bands.length) return 'out_of_range';
    if (promoFlags[i]) return 'bananamall_promo_gif';
    if (typeAt(i) === 'TEXT') return 'text_band_not_allowed_for_image_slot';
    return null;
  };
  type Decision = { role: string; requested: number; reqType: string; result: string; final: number; reason: string };
  const decisions: Decision[] = [];
  const usedImg = new Set<number>();

  // 단일 역할 슬롯(main/feature/size/package): 차단대상(TEXT/promo)이면 거부 → 빈 슬롯(잘못된 사진보다 빈 슬롯이 안전).
  const validateRole = (reqIndex: number, role: string): number => {
    if (reqIndex < 0 || reqIndex >= bands.length) {
      decisions.push({ role, requested: reqIndex, reqType: '-', result: 'none', final: -1, reason: '요청 없음/범위 밖' });
      return -1;
    }
    const t = typeAt(reqIndex)!;
    const block = imageBlockReason(reqIndex);
    if (block) {
      decisions.push({ role, requested: reqIndex, reqType: promoFlags[reqIndex] ? 'PROMO_GIF' : t, result: 'rejected→empty', final: -1, reason: block });
      return -1;
    }
    usedImg.add(reqIndex);
    decisions.push({ role, requested: reqIndex, reqType: t, result: 'accepted', final: reqIndex, reason: 'ok' });
    return reqIndex;
  };
  // feature/size/package 먼저 검증(HERO가 이들을 피하고 dHash 참조로 쓰기 위해). feature 선정 로직은 무변경.
  const featureIndexV = validateRole(r.featureIndex, 'feature');
  const sizeIndexV = validateRole(r.sizeIndex, 'size');
  const packageIndexV = validateRole(r.packageIndex, 'package');

  // ── Step 3: HERO = 깨끗한 제품 누끼컷 자동 선정 (요약정보 합성밴드/패키지/컬러배너 제외) ──
  //   Claude mainIndex를 clean 자격 검사 → 통과하면 존중, 실패하면 후보풀 최고점. feature와 다른 컷 선호.
  //   실측 임계(핑거위글): color>0.20=배너/합성, smallCC>10=baked텍스트, fill>0.62=박스(패키지),
  //   largestCC<0.12=제품작음, packageIndex/sizeIndex와 dHash≤10=중복 패키지/사이즈.
  const hashOf = (i: number): boolean[] => (i >= 0 && i < tagged.length ? tagged[i].metrics.dhash : []);
  const heroExcludeRefs = [packageIndexV, sizeIndexV].filter((x) => x >= 0);
  const heroEligible = (i: number): boolean => {
    if (i < 0 || i >= bands.length || usedImg.has(i) || promoFlags[i]) return false;   // 이미 feature/size/package로 예약된 것 제외
    if (typeAt(i) === 'TEXT') return false;
    const m = tagged[i].metrics;
    if (m.color > 0.20 || m.smallCC > 10 || m.largestCC < 0.12 || m.fillRatio > 0.62) return false;
    for (const ex of heroExcludeRefs) if (dhashHamming(hashOf(i), hashOf(ex)) <= 10) return false;  // 패키지/사이즈 중복컷
    return true;
  };
  const heroScore = (i: number): number => { const m = tagged[i].metrics; return m.largestCC * 2 - m.color - m.smallCC * 0.02 + Math.min(m.height, 700) / 2000; };
  const heroDupFeature = (i: number): boolean => featureIndexV >= 0 && dhashHamming(hashOf(i), hashOf(featureIndexV)) <= 10;
  const selectHeroIndex = (claudeMain: number): number => {
    const reqType = claudeMain >= 0 && claudeMain < bands.length ? (promoFlags[claudeMain] ? 'PROMO_GIF' : (typeAt(claudeMain) ?? '-')) : '-';
    const pool = bands.map((_, i) => i).filter(heroEligible);
    if (!pool.length) {
      decisions.push({ role: 'main', requested: claudeMain, reqType, result: 'no-clean→empty', final: -1, reason: '깨끗한 제품컷 후보 없음 → 수동 지정 필요' });
      return -1;
    }
    let chosen: number;
    if (heroEligible(claudeMain) && !heroDupFeature(claudeMain)) chosen = claudeMain;   // Claude 픽이 적격+feature와 다름 → 존중
    else chosen = [...pool].sort((a, b) => (heroDupFeature(a) !== heroDupFeature(b) ? (heroDupFeature(a) ? 1 : -1) : heroScore(b) - heroScore(a)))[0];
    usedImg.add(chosen);
    const cm = tagged[chosen].metrics;
    decisions.push({ role: 'main', requested: claudeMain, reqType, result: chosen === claudeMain ? 'accepted(clean)' : 'reselected(clean)', final: chosen, reason: `largestCC ${cm.largestCC.toFixed(3)}·color ${cm.color.toFixed(3)}·fill ${cm.fillRatio.toFixed(2)}·smallCC ${cm.smallCC}${heroDupFeature(chosen) ? ' (feature와 동일 — 단일후보)' : ''}` });
    return chosen;
  };
  const mainIndexV = selectHeroIndex(r.mainIndex);

  // Point 이미지: dedup-aware 2패스. Point 01+02 "전체"를 통틀어 동일/근접 사진 1회만·같은 밴드 인덱스 재사용 금지.
  //   패스1 = Claude 직접 픽(차단X·인덱스 미사용·전체 Point 근접중복X면 채택). ← 교차(01↔02) 중복도 금지.
  //   패스2 = 거부분만 ±1~2에서 [차단X·미사용·어떤 Point와도 근접중복X·PHOTO/MIXED] "유일" 후보로 대체, 애매/없으면 비움.
  const DUP_HAMMING = 10;                                 // dHash 해밍 ≤ 이 값이면 동일 사진(실측: 동일 0~3 vs 다른 27+)
  const hashAt = (i: number): boolean[] => tagged[i]?.metrics.dhash ?? [];
  const usedPointImgs: { idx: number; point: number }[] = [];   // 지금까지 Point에 배정된 이미지(중복판정용)
  const pointNum = (role: string): number => (role.startsWith('point1') ? 1 : 2);
  const dupWith = (i: number, scopePoint: number | null): boolean =>   // scopePoint=null이면 전체 Point 대상
    usedPointImgs.some((u) => (scopePoint === null || u.point === scopePoint)
      && (u.idx === i || dhashHamming(hashAt(i), hashAt(u.idx)) <= DUP_HAMMING));
  const reservePoint = (i: number, point: number): void => { usedImg.add(i); usedPointImgs.push({ idx: i, point }); };

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
  for (const s of pointSlots) {                          // 패스1(Claude 직접 픽)
    const pt = pointNum(s.role);
    if (s.reqIndex < 0 || s.reqIndex >= bands.length) { finalPoint[s.role] = -1; continue; }
    const t = typeAt(s.reqIndex)!;
    if (imageBlockReason(s.reqIndex)) { rejectedSlots.push(s); finalPoint[s.role] = -1; continue; }  // TEXT/promo
    if (usedImg.has(s.reqIndex)) {                        // 같은 밴드 인덱스 재사용 → 대체 시도
      rejectedSlots.push(s); finalPoint[s.role] = -1;
      decisions.push({ role: s.role, requested: s.reqIndex, reqType: t, result: 'rejected(reuse)', final: -1, reason: 'already_used_index → 대체 시도' });
      continue;
    }
    if (dupWith(s.reqIndex, null)) {                      // Point 01+02 전체에서 동일사진 → 대체 시도(교차 중복도 금지)
      rejectedSlots.push(s); finalPoint[s.role] = -1;
      decisions.push({ role: s.role, requested: s.reqIndex, reqType: t, result: 'rejected(dup)', final: -1, reason: 'Point 전체 동일사진(dHash) → 대체 시도' });
      continue;
    }
    reservePoint(s.reqIndex, pt);
    finalPoint[s.role] = s.reqIndex;
    decisions.push({ role: s.role, requested: s.reqIndex, reqType: t, result: 'accepted', final: s.reqIndex, reason: 'ok' });
  }
  for (const s of rejectedSlots) {                       // 패스2(보수적 대체 — 어떤 Point와도 중복없는 유일 후보만)
    const pt = pointNum(s.role);
    const cands: number[] = [];
    for (let d = 1; d <= 2; d++) for (const j of [s.reqIndex - d, s.reqIndex + d]) {
      if (j >= 0 && j < bands.length && !usedImg.has(j) && !imageBlockReason(j)) {
        const tj = typeAt(j);
        if ((tj === 'PHOTO' || tj === 'MIXED') && !dupWith(j, null)) cands.push(j);
      }
    }
    const rt = promoFlags[s.reqIndex] ? 'PROMO_GIF' : (typeAt(s.reqIndex) ?? 'TEXT');
    const uniq = [...new Set(cands)];
    if (uniq.length === 1) {
      reservePoint(uniq[0], pt);
      finalPoint[s.role] = uniq[0];
      decisions.push({ role: s.role, requested: s.reqIndex, reqType: rt, result: 'rejected→fallback', final: uniq[0], reason: `±2 유일·중복없는 ${typeAt(uniq[0])} 밴드 ${uniq[0]}` });
    } else {
      finalPoint[s.role] = -1;
      decisions.push({ role: s.role, requested: s.reqIndex, reqType: rt, result: 'rejected→empty', final: -1, reason: uniq.length ? `±2 후보 다수/모호(${uniq.join(',')}) → 비움` : '±2 유일·중복없는 후보 없음 → 비움' });
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
  mark('response_validation_ms');

  // ── Step 3-b: HERO 메인이미지 영역 정규화 — 선정된 밴드를 정사각 우선 캔버스에 제품 중앙·크게 재배치. ──
  //    canonical field data.mainImage에 저장 → PreviewGodo HERO·썸네일 메인이 동일 정규화 자산 공유.
  let mainImage = at(mainIndexV);
  if (mainImage) {
    const hero = await normalizeHeroMainImage(mainImage);
    if (hero.normalized) { mainImage = hero.dataUrl; notes.push(`HERO 정규화: ${hero.reason}`); }
    if (DEV) {
      // eslint-disable-next-line no-console
      console.log('[기본형 HERO] band %o | %s | ratio %s | bbox %o | %o→%o | %s',
        mainIndexV, hero.normalized ? 'NORMALIZED' : 'KEPT', hero.canvasRatio, hero.productBbox, hero.sourceSize, hero.outputSize, hero.reason);
    }
  }
  const featureImage = at(featureIndexV);
  const sizeImage = at(sizeIndexV);

  // ── Step 2-1: 패키지 여백 정규화 — 선택 로직은 그대로, 선택된 패키지 밴드의 가장자리 배경만 트림. ──
  //    PreviewGodo·썸네일이 공유하는 canonical field(packageImage)에 정규화 결과를 저장(별도 자산 X).
  let packageImage = at(packageIndexV);
  if (packageImage) {
    const pkg = await normalizePackageImage(packageImage);
    packageImage = pkg.dataUrl;   // 트림 보류 시 원본 그대로(내부 폴백)
    if (pkg.trimmed) notes.push(`패키지 여백 정규화: ${pkg.reason}`);
    if (DEV) {
      // eslint-disable-next-line no-console
      console.log('[기본형 패키지] band %o | %s | bbox %o | pad %o | %o→%o',
        packageIndexV, pkg.trimmed ? 'TRIMMED' : 'KEPT', pkg.contentBbox, pkg.padding, pkg.sourceSize, pkg.outputSize, pkg.reason);
    }
  }
  mark('package_normalization_ms');

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
    isPackageImageEnabled: !!packageImage,   // 제약6: 패키지 없으면 명시적 비활성(직전 상품 값 잔류 방지)

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

  // ── 기준선 계측 마감: 패키지 자동배치 계산 + 총합. (validation/package_normalization은 위에서 별도 마킹) ──
  mark('package_layout_ms');
  timings.total_conversion_ms = +(performance.now() - _t0).toFixed(1);
  if (DEV) {
    // eslint-disable-next-line no-console
    console.groupCollapsed('[기본형 성능] 단계별 처리시간(ms)');
    // eslint-disable-next-line no-console
    console.table(timings);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
  notes.push(`⏱ 총 ${timings.total_conversion_ms}ms (Claude ${timings.claude_request_ms ?? '-'}ms · 분할 ${timings.whitespace_split_ms ?? '-'}ms · 태깅 ${timings.band_tagging_ms ?? '-'}ms · 검증 ${timings.response_validation_ms ?? '-'}ms · 패키지 ${timings.package_normalization_ms ?? '-'}ms)`);

  return { data, notes, bandCount: bands.length };
};
