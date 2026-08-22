// 기본형(통이미지 baked) → 고도몰 섹션형 ProductData 조립 (2026-07-13 Claude 브레인판).
//   흐름: 통이미지 여백분할(밴드) → Claude 비전 1콜(읽기+슬롯배정+본문 섹션 지도) → Partial<ProductData> 조립.
//   결과를 loadTemporary({...prev,...data})로 주입하면 좌측 입력부+PreviewGodo까지 편집가능 상태.
//   ⚠️ 사진 보고 글 생성 금지(basicVisionReader 규칙). 상단 요약=고정 그릇, 본문=원본 섹션 그대로(가변).
//   2026-08-22 1차 패치: 본문을 Point 01·02·SIZE 고정 슬롯에 욱여넣지 않고
//     원본 섹션 배열(godoBodySections)로 옮긴다. 판정·조립 규칙은 basicBodyAssembly(순수)가 정본.
import type { ProductData } from '../types';
import { splitImageByWhitespace, extractProductImages } from './flowImageSplitter';
import { toProxyUrl } from './exportImagePrep';
import { readBasicLayout } from './basicVisionReader';
import { tagBasicBands, type BasicBandType, type TaggedBand } from './basicBandTagger';
import { normalizePackageImage, isBananamallPromoGif, normalizeHeroMainImage } from './basicAssetNormalize';
import { selectBasicSlots, assembleBasicBody, buildBasicSummaryInfo, type BasicBandRef } from './basicBodyAssembly';

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

// 여백분할 최소 조각 높이(기본형 AI 읽기 전용). 공용 기본값 48은 짧은 텍스트 줄(무게 pill·버튼 라벨·
//   한 줄 주석)을 노이즈로 버려 본문에서 사라지게 한다 → 20으로 낮춰 읽을 수 있게 한다.
//   구분선(6~10px)은 여전히 걸러진다. 근거: 핑거위글 800×12272 실측(21 → 27밴드, 2026-08-22).
const BASIC_MIN_SEG_PX = 20;
const IS_GIF_URL = /\.gif(\?|#|$)/i;

// GIF 첫 프레임만 정지 이미지로 굽는다(AI 전송용). 원본 GIF는 그대로 본문에 남는다.
const rasterizeFirstFrame = (src: string, maxPx = 760, quality = 0.85): Promise<string | null> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined' || !src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) return resolve(null);
        const scale = Math.min(1, maxPx / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch { resolve(null); }   // CORS taint 등 → 일반 분할 경로로 폴백
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

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
  //   치수 고정('상세페이지 참조')·제조사 우선순위는 조립 모듈이 정본(여기서 따로 만들지 않는다).
  const summaryInfo = buildBasicSummaryInfo({}, { brandName: input.brandName });
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
  //    본문 기능 GIF는 자르지 않고 원본을 통째 보존한다(정지 JPG 변환 금지) — AI에는 첫 프레임만 보낸다.
  onProgress?.({ phase: '통이미지 분할' });
  const bands: string[] = [];        // AI 전송용 정지 이미지(밴드와 1:1)
  const bandSrc: string[] = [];      // 화면·본문에 실제로 쓰는 자산(GIF는 원본 URL)
  const bandIsGif: boolean[] = [];
  const promoFlags: boolean[] = [];
  for (const url of input.detailImageUrls) {
    const proxied = toProxyUrl(url);
    let promo = false;
    try { promo = (await isBananamallPromoGif(url, proxied)).isPromo; } catch { promo = false; }
    if (!promo && IS_GIF_URL.test(url)) {
      const still = await rasterizeFirstFrame(proxied);
      if (still) {
        bands.push(still); bandSrc.push(url); bandIsGif.push(true); promoFlags.push(false);
        notes.push('본문 GIF 원본 보존(정지 이미지로 바꾸지 않음).');
        continue;
      }
      notes.push(`GIF 첫 프레임을 읽지 못해 일반 분할로 처리: ${url.slice(0, 60)}…`);
    }
    try {
      // minSegPx 20: 기본값 48은 "무게 pill·버튼 라벨·한 줄 주석" 같은 짧은 텍스트 줄을 통째로 버린다
      //   (핑거위글 실측 2026-08-22: 21밴드 → 27밴드, 회복 6건). 공용 분할 함수는 수정하지 않고 옵션만 준다.
      const segs = await splitImageByWhitespace(proxied, { minSegPx: BASIC_MIN_SEG_PX });
      for (const s of segs) { bands.push(s.dataUrl); bandSrc.push(s.dataUrl); bandIsGif.push(false); promoFlags.push(promo); }
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
    console.log('[기본형 Claude응답] 요청 인덱스 → main:%o feature:%o package:%o | 요약원본:%o | 본문 섹션:%o',
      r.mainIndex, r.featureIndex, r.packageIndex, r.summarySourceIndexes,
      r.sections.map((s) => `${s.number || '-'} ${s.title || ''}(${(s.items || []).length})`));
  }

  // ③ 로컬 검증(Layer C) + 본문 조립 — 판정 규칙은 basicBodyAssembly(순수)가 정본이다.
  //    Claude 응답을 그대로 믿지 않는다: 홍보 GIF·TEXT 밴드·요약 원본·중복은 여기서 막는다.
  onProgress?.({ phase: '슬롯 검증·본문 조립·패키지 배치' });
  const bandRefs: BasicBandRef[] = bands.map((_, i) => ({
    src: bandSrc[i],
    type: bandTypes[i] ?? 'UNKNOWN',
    promo: !!promoFlags[i],
    isGif: !!bandIsGif[i],
    metrics: tagged[i]?.metrics,
  }));
  const at = (i: number): string | null => (i >= 0 && i < bandRefs.length ? bandRefs[i].src : null);

  // 상단 요약 슬롯(메인·Key Feature·패키지) — 깨끗한 제품 단독컷 자격을 로컬에서 다시 검사한다.
  const slots = selectBasicSlots(
    {
      mainIndex: r.mainIndex, featureIndex: r.featureIndex, packageIndex: r.packageIndex,
      summarySourceIndexes: r.summarySourceIndexes, mainIsSoloProductCut: r.mainIsSoloProductCut,
    },
    bandRefs,
  );
  notes.push(...slots.notes);
  const mainIndexV = slots.mainIndex;
  const featureIndexV = slots.featureIndex;
  const packageIndexV = slots.packageIndex;

  // 본문: 원본 섹션 개수·순서·항목 순서 그대로(고정 Point 01·02·SIZE 슬롯에 압축하지 않는다).
  const bodyOut = assembleBasicBody(r.sections, bandRefs, { reserved: slots.reserved });
  notes.push(...bodyOut.notes);

  if (DEV) {
    // eslint-disable-next-line no-console
    console.groupCollapsed('[기본형 검증] 상단 슬롯 결정');
    // eslint-disable-next-line no-console
    console.table(slots.decisions);
    // eslint-disable-next-line no-console
    console.groupEnd();
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[기본형 본문] 섹션 ${bodyOut.sections.length}개 · 항목 ${bodyOut.sections.reduce((n, sec) => n + sec.items.length, 0)}개`);
    // eslint-disable-next-line no-console
    console.table(bodyOut.decisions);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
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

  // 치수 고정('상세페이지 참조')·제조사 우선순위는 조립 모듈이 정본.
  const summaryInfo = buildBasicSummaryInfo(r.summary, { brandName: input.brandName });

  const data: Partial<ProductData> = {
    // 상품명 정본 = 엑셀(파서) 값. AI 판독은 엑셀 값이 없을 때만 보조로 쓴다
    //   (이미지에서 읽은 이름이 원본 상품명을 덮어써 브랜드·영문명이 흔들리지 않게 한다).
    productNameKr: input.productNameKr || r.productNameKr,
    productNameEn: input.productNameEn || r.productNameEn || '',
    brandName: input.brandName || '',
    ...(input.themeColor ? { themeColor: input.themeColor } : {}),
    summaryInfo,
    ...(r.keyFeatures.length === 3 ? { keyFeatures: r.keyFeatures } : {}),
    mainImage,
    featureImage,
    packageImage,
    isPackageImageEnabled: !!packageImage,   // 제약6: 패키지 없으면 명시적 비활성(직전 상품 값 잔류 방지)

    // 본문 정본 — 원본 섹션 배열. PreviewGodo가 이 순서대로 반복 렌더한다.
    godoBodySections: bodyOut.sections,

    // 고정 Point 01·02·SIZE 슬롯은 이 경로에서 더 쓰지 않는다(본문이 원본 순서를 그대로 담는다).
    //   ①구조 배치 결과나 직전 상품 값이 남아 같은 자료가 두 번 보이지 않도록 명시적으로 비운다.
    sizeImage: null,
    point1Title: '', aiPoint1Desc: '', aiPoint1Desc2: '', aiPoint1Desc3: '',
    point1Image1: null, point1Image2: null, point1Image3: null,
    point2Title: '', aiPoint2Desc: '', aiPoint2Desc2: '', aiPoint2Desc3: '',
    point2Image1: null, point2Image2: null, point2Image3: null,
  };

  if (mainImage && packageImage) {
    const layout = await computePackageLayout(mainImage);
    if (layout) data.packageLayout = layout;
    else notes.push('패키지 자동배치 계산 실패 — 기본 위치 사용(필요시 수동 조정).');
  }
  if (r.keyFeatures.length !== 3) notes.push(`keyFeatures ${r.keyFeatures.length}개(3 아님) — 메인특징 수동 보완 필요.`);
  notes.push(`본문 ${bodyOut.sections.length}개 섹션 인식 — ${bodyOut.sections.map((s) => `${s.number || '·'} ${s.title || ''}(${s.items.length})`).join(' / ') || '없음'}`);

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
