// 기본형(통이미지 baked) → 고도몰 섹션형 ProductData 조립 (2026-07-13 Claude 브레인판).
//   흐름: 통이미지 여백분할(밴드) → Claude 비전 1콜(읽기+슬롯배정+본문 섹션 지도) → Partial<ProductData> 조립.
//   결과를 loadTemporary({...prev,...data})로 주입하면 좌측 입력부+PreviewGodo까지 편집가능 상태.
//   ⚠️ 사진 보고 글 생성 금지(basicVisionReader 규칙). 상단 요약=고정 그릇, 본문=원본 자료 그대로.
//   2026-08-22 1차 패치: 본문을 Point 01·02·SIZE 고정 슬롯에 욱여넣지 않고 원본 배열(godoBodySections)로 옮겼다.
//   2026-08-24 2차(구조 패치): 본문 = **원본 상세이미지 파일 그대로**. 분할·태거·장부를 본문에 쓰지 않는다.
//     분할·태거·AI 1콜은 요약/스펙/패키지 판정용으로만 남는다.
//   2026-08-24 3차: AI 1콜이 **위치 세 가지(bodyStartIndex·mainIndex·featureIndex)**를 더 고른다.
//     · 본문 = 원본 파일 그대로이되 **원본 메인섹션은 제외**한다 — 경계가 걸친 파일 하나만 y 에서 한 번 자른다.
//     · 메인·KEY FEATURE 자동선정 재활성화(AUTO_HERO_SLOTS=true). AI 가 고르고 코드는
//       범위·홍보 GIF·자산 존재·중복만 확인한다(픽셀 임계값 되탈락 없음).
//     · 본문의 섹션 수·제목·순서·tail 은 여전히 아무도 판단하지 않는다. 밴드 재조립 0건.
//   2026-08-24 1차 본문 보존 패치(구조 패치): 본문은 **AI 판단을 전혀 쓰지 않는다.**
//     장부(normalizeBandLedger)와 섹션 조립(assembleBodyFromLedger)의 role·kind·sectionStart 결과가
//     본문의 포함·제외·순서·섹션 수를 정하던 것을 끊고, 원본 밴드를 순서대로 그대로 싣는다
//     (제외는 바나나몰 홍보 GIF 하나뿐). AI 읽기는 **상단 요약·슬롯 선정용으로만** 남는다.
//     조립 코드는 삭제하지 않고 리디자인 단계 참고 자산으로 보존한다.
import type { ProductData } from '../types';
import { splitImageByWhitespace } from './flowImageSplitter';
import { toProxyUrl } from './exportImagePrep';
import { readBasicLayout } from './basicVisionReader';
import { tagBasicBands, type BasicBandType, type TaggedBand } from './basicBandTagger';
import { normalizePackageImage, isBananamallPromoGif, normalizeHeroMainImage } from './basicAssetNormalize';
import {
  selectBasicSlots, normalizeBandLedger, assembleBodyFromSourceImages, buildBasicSummaryInfo,
  planBodyBoundary, applyBodyBoundary, BODY_BOUNDARY_FALLBACK_NOTE,
  type BasicBandRef, type BasicSourceImage, type BasicBandOrigin,
} from './basicBodyAssembly';

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

// 메인·KEY FEATURE 자동선정 스위치 — 2026-08-24 3차 지시로 **전 상품 공통 ON**.
//   새 계약: AI 가 고르고 코드는 범위·홍보 GIF·자산 존재·중복만 확인한다(selectBasicSlots).
//   예전처럼 픽셀 임계값·후보 재점수가 AI 선택을 다시 막는 이중 판단 구조는 복구하지 않는다.
//   타입을 boolean 으로 고정해 두 갈래가 모두 컴파일된다(끌 때 이 값만 바꾼다).
const AUTO_HERO_SLOTS: boolean = true;

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

/**
 * 원본 상세이미지 파일 한 장을 `y` 부터 아래 끝까지 **딱 한 번** 잘라 낸다.
 *   이 파일에서 픽셀을 자르는 곳은 여기 한 곳뿐이다(본문을 밴드로 다시 쪼개지 않는다).
 *   실패(로드 실패·CORS taint·y 가 이미지 밖)면 null → 호출부가 원본 전체 보존으로 되돌린다.
 */
const cropSourceFromY = (src: string, y: number): Promise<string | null> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined' || !src || y <= 0) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h || y >= h) return resolve(null);
        const c = document.createElement('canvas');
        c.width = w; c.height = h - y;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, y, w, h - y, 0, 0, w, h - y);
        resolve(c.toDataURL('image/jpeg', 0.92));
      } catch { resolve(null); }
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
 * 원본 상세이미지 URL 목록 → 본문에 그대로 실을 파일 목록(순서 유지).
 *   자르지 않는다. 제외는 바나나몰 홍보 GIF 하나뿐이고 판정은 기존 isBananamallPromoGif 그대로다.
 *   src 는 same-origin 프록시 — 원본 바이트 그대로 스트리밍이라 GIF 애니메이션도 유지된다.
 */
const collectSourceImages = async (
  urls: string[], notes: string[],
): Promise<BasicSourceImage[]> => {
  const out: BasicSourceImage[] = [];
  for (const url of urls) {
    const proxied = toProxyUrl(url);
    let promo = false;
    try { promo = (await isBananamallPromoGif(url, proxied)).isPromo; } catch { promo = false; }
    if (promo) notes.push(`바나나몰 홍보 GIF 제외: ${url.slice(0, 60)}…`);
    out.push({ src: proxied, isGif: IS_GIF_URL.test(url), promo });
  }
  return out;
};

/**
 * ① 구조 변환 (AI 없음, 즉시, 키 불필요) — 단순형처럼 "일단 작동".
 *   본문 = 원본 상세이미지 파일 그대로(자르지 않는다). 상품명·브랜드는 엑셀에서.
 *   메인·KEY FEATURE 와 본문 시작 경계는 AI 읽기 단계에서 정한다(여기서는 빈 슬롯 + 원본 전량).
 */
export const buildBasicStructure = async (
  input: BasicConvertInput,
  onProgress?: (p: BasicProgress) => void,
): Promise<BasicConvertResult> => {
  const notes: string[] = [];
  onProgress?.({ phase: '원본 상세이미지 확인' });
  const sources = await collectSourceImages(input.detailImageUrls, notes);
  const bodyOut = assembleBodyFromSourceImages(sources);
  notes.push(...bodyOut.notes);
  if (!bodyOut.sections.length) throw new Error('본문에 실을 원본 상세이미지가 없습니다. (이미지 URL/프록시 확인)');

  //   치수 고정('상세페이지 참조')·제조사 우선순위는 조립 모듈이 정본(여기서 따로 만들지 않는다).
  const summaryInfo = buildBasicSummaryInfo({}, { brandName: input.brandName });
  const data: Partial<ProductData> = {
    productNameKr: input.productNameKr,
    productNameEn: input.productNameEn || '',
    brandName: input.brandName || '',
    ...(input.themeColor ? { themeColor: input.themeColor } : {}),
    summaryInfo,
    // 본문 정본 — 원본 파일을 원래 순서 그대로.
    godoBodySections: bodyOut.sections,
    // 메인·KEY FEATURE 는 AI 읽기 단계에서 정한다 — 구조 단계(AI 0콜)에서는 빈 슬롯이다.
    mainImage: null,
    featureImage: null,
    // 고정 Point 01·02·SIZE 슬롯은 쓰지 않는다(본문이 원본 파일을 그대로 담는다).
    sizeImage: null,
    point1Title: '', point1Image1: null, point1Image2: null, point1Image3: null,
    point2Title: '', point2Image1: null, point2Image2: null, point2Image3: null,
    aiPoint1Desc: '', aiPoint1Desc2: '', aiPoint1Desc3: '',
    aiPoint2Desc: '', aiPoint2Desc2: '', aiPoint2Desc3: '',
  };
  notes.push('구조만 배치됨 — 문구·스펙은 비어 있습니다. 🤖 AI로 읽기로 채우세요.');
  return { data, notes, bandCount: bodyOut.sections[0].items.length };
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
  // 본문 정본: 원본 파일 목록(자르지 않는다). 아래 분할 결과는 본문에 쓰지 않는다.
  onProgress?.({ phase: '원본 상세이미지 확인' });
  const sources = await collectSourceImages(input.detailImageUrls, notes);

  onProgress?.({ phase: '통이미지 분할(요약·스펙·패키지 판정용)' });
  const bands: string[] = [];        // AI 전송용 정지 이미지(밴드와 1:1)
  const bandSrc: string[] = [];      // 화면·본문에 실제로 쓰는 자산(GIF는 원본 URL)
  const bandIsGif: boolean[] = [];
  const promoFlags: boolean[] = [];
  // 밴드 출처 장부 — "이 밴드는 몇 번째 원본 파일의 y 몇 px 에서 시작했나". 좌표는 분할기가 준 값 그대로다.
  //   본문 시작 경계(bodyStartIndex)를 원본 파일 한 번 자르기로 되돌리는 데만 쓴다.
  const origins: BasicBandOrigin[] = [];
  for (const [sourceIndex, url] of input.detailImageUrls.entries()) {
    const proxied = toProxyUrl(url);
    const srcIsGif = IS_GIF_URL.test(url);
    let promo = false;
    try { promo = (await isBananamallPromoGif(url, proxied)).isPromo; } catch { promo = false; }
    if (!promo && srcIsGif) {
      const still = await rasterizeFirstFrame(proxied);
      if (still) {
        bands.push(still); bandSrc.push(url); bandIsGif.push(true); promoFlags.push(false);
        origins.push({ sourceIndex, y: 0, isGif: true, promo: false });
        notes.push('본문 GIF 원본 보존(정지 이미지로 바꾸지 않음).');
        continue;
      }
      notes.push(`GIF 첫 프레임을 읽지 못해 일반 분할로 처리: ${url.slice(0, 60)}…`);
    }
    try {
      // minSegPx 20: 기본값 48은 "무게 pill·버튼 라벨·한 줄 주석" 같은 짧은 텍스트 줄을 통째로 버린다
      //   (핑거위글 실측 2026-08-22: 21밴드 → 27밴드, 회복 6건). 공용 분할 함수는 수정하지 않고 옵션만 준다.
      const segs = await splitImageByWhitespace(proxied, { minSegPx: BASIC_MIN_SEG_PX });
      for (const s of segs) {
        bands.push(s.dataUrl); bandSrc.push(s.dataUrl); bandIsGif.push(false); promoFlags.push(promo);
        origins.push({ sourceIndex, y: s.y, isGif: srcIsGif, promo });
      }
      if (promo) notes.push('바나나몰 홍보 GIF → 판정 근거에서도 제외.');
    } catch {
      notes.push(`판정용 분할 실패(본문 출력에는 영향 없음): ${url.slice(0, 60)}…`);
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
      r.mainIndex, r.featureIndex, r.packageIndex,
      r.bands.filter((b) => b.role === 'summary').map((b) => b.index),
      r.bands.map((b) => `${b.index}:${b.role || '-'}/${b.kind || '-'}/${b.asset || '-'}${b.sectionStart ? '★' : ''}`));
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

  // 밴드 장부 정규화 — 밴드 하나당 한 줄·원본 순서 강제. 누락·중복은 인덱스와 함께 notes 로 남는다.
  const ledgerOut = normalizeBandLedger(r.bands, bandRefs);
  notes.push(...ledgerOut.notes);

  // 상단 요약 슬롯(메인·Key Feature·패키지) — 장부의 자산 종류 + 기존 픽셀 자격으로 검증한다.
  const slots = selectBasicSlots(
    {
      mainIndex: r.mainIndex, featureIndex: r.featureIndex, packageIndex: r.packageIndex,
      ledger: ledgerOut.ledger, mainIsSoloProductCut: r.mainIsSoloProductCut,
    },
    bandRefs,
  );
  notes.push(...slots.notes);
  const mainIndexV = slots.mainIndex;
  const featureIndexV = slots.featureIndex;
  const packageIndexV = slots.packageIndex;

  // ── 진단 전용 3줄 (2026-08-24) — "왜 빈칸인가"를 화면에서 그대로 읽기 위한 기록이다. ──
  //   · 판정에 되먹이지 않는다: 아래 코드는 notes 에만 쓰고, 어떤 선택값도 다시 계산하거나 덮지 않는다.
  //   · DEV 콘솔이 아니라 notes 에 넣는다 — DEV 블록은 `vite build` 에서 통째로 사라져 Preview 에 없다.
  //   · 임계값을 여기서 다시 적지 않고 조립 모듈 상수를 그대로 읽는다(수치 이중 관리 금지).
  // ── 본문 시작 경계 (2026-08-24 3차) — AI 가 고른 밴드 하나를 원본 파일·y 로 되돌린다. ──
  //   AI 가 정하는 것: bodyStartIndex 하나. 코드가 정하는 것: 어느 파일을 빼고 어디를 한 번 자를지.
  //   실패하면 원본 전체를 그대로 보존한다(본문을 지우지 않는다).
  const plan = planBodyBoundary(r.bodyStartIndex, origins, sources.length);
  notes.push(...plan.notes);
  const bounded = applyBodyBoundary(sources, plan);
  notes.push(...bounded.notes);
  let bodySources: BasicSourceImage[] = bounded.sources;
  const cutAt = bounded.sources.findIndex((s) => s.cropFromY > 0);
  if (cutAt >= 0) {
    const cut = await cropSourceFromY(bounded.sources[cutAt].src, bounded.sources[cutAt].cropFromY);
    if (cut) bodySources = bounded.sources.map((s, i) => (i === cutAt ? { ...s, src: cut } : s));
    else { bodySources = sources; notes.push(BODY_BOUNDARY_FALLBACK_NOTE); }   // 자르지 못하면 전량 보존
  }

  notes.push(`[진단] AI 지목 main=${r.mainIndex} feature=${r.featureIndex} package=${r.packageIndex}`
    + ` bodyStart=${r.bodyStartIndex}`
    + ` → 자동선정 main=${mainIndexV} feature=${featureIndexV} package=${packageIndexV}`
    + ` · 본문시작 파일=${plan.sourceIndex}(y=${plan.cropY}, ${plan.applied ? '적용' : `미적용:${plan.reason}`})`);
  const slotLine = (role: string): string => {
    const ds = slots.decisions.filter((d) => d.role === role);
    if (!ds.length) return `${role}: 결정기록 없음`;
    return ds.map((d) => `${role}: ${d.result}(요청 ${d.requested}→최종 ${d.final}) ${d.reason}`).join(' / ');
  };
  notes.push(`[진단] ${slotLine('main')} || ${slotLine('feature')} || ${slotLine('package')}`);
  // 밴드별 기계 확인 결과 — 픽셀 임계값이 아니라 **범위·홍보 GIF·자산 존재**만 본다(새 계약).
  //   출처(파일·y)를 함께 적어 "본문 시작이 왜 저 파일 저 위치인가"를 화면에서 그대로 읽게 한다.
  notes.push(`[진단] 밴드별 기계 확인 — ${bandRefs
    .map((b, i) => `${i}:${origins[i] ? `f${origins[i].sourceIndex}@${origins[i].y}` : 'f?'}/${b.promo ? 'promo' : (b.src ? 'ok' : '자산없음')}`)
    .join(' · ')}`);

  // 본문: 원본 상세이미지 **파일**을 원래 순서 그대로(경계 파일만 한 번 잘린다).
  //   밴드·태거·장부·AI 의 본문 판단(섹션 수·제목·순서)은 전혀 보지 않는다.
  const bodyOut = assembleBodyFromSourceImages(bodySources);
  notes.push(...bodyOut.notes);

  if (DEV) {
    // eslint-disable-next-line no-console
    console.groupCollapsed('[기본형 검증] 상단 슬롯 결정');
    // eslint-disable-next-line no-console
    console.table(slots.decisions);
    // eslint-disable-next-line no-console
    console.groupEnd();
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[기본형 본문·원본파일] 항목 ${bodyOut.sections.reduce((n, sec) => n + sec.items.length, 0)}개 / 원본 파일 ${sources.length}장`);
    // eslint-disable-next-line no-console
    console.table(bodyOut.decisions);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
  mark('response_validation_ms');

  // ── 메인·KEY FEATURE (AUTO_HERO_SLOTS=true → AI 선택 + 기계 확인만) ──────────
  //    HERO 정규화(여백 정리)는 선정 뒤의 기계 처리라 그대로 유지한다.
  let mainImage: string | null = AUTO_HERO_SLOTS ? at(mainIndexV) : null;
  if (AUTO_HERO_SLOTS && mainImage) {
    const hero = await normalizeHeroMainImage(mainImage);
    if (hero.normalized) { mainImage = hero.dataUrl; notes.push(`HERO 정규화: ${hero.reason}`); }
    if (DEV) {
      // eslint-disable-next-line no-console
      console.log('[기본형 HERO] band %o | %s | ratio %s | bbox %o | %o→%o | %s',
        mainIndexV, hero.normalized ? 'NORMALIZED' : 'KEPT', hero.canvasRatio, hero.productBbox, hero.sourceSize, hero.outputSize, hero.reason);
    }
  }
  const featureImage: string | null = AUTO_HERO_SLOTS ? at(featureIndexV) : null;

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

    // 본문 정본 — 원본 자료를 원래 순서 그대로 담은 보존 배열. PreviewGodo가 제목·구분선 없이 이어 붙인다.
    godoBodySections: bodyOut.sections,

    // 고정 Point 01·02·SIZE 슬롯은 이 경로에서 더 쓰지 않는다(본문이 원본 순서를 그대로 담는다).
    //   ①구조 배치 결과나 직전 상품 값이 남아 같은 자료가 두 번 보이지 않도록 명시적으로 비운다.
    sizeImage: null,
    point1Title: '', aiPoint1Desc: '', aiPoint1Desc2: '', aiPoint1Desc3: '',
    point1Image1: null, point1Image2: null, point1Image3: null,
    point2Title: '', aiPoint2Desc: '', aiPoint2Desc2: '', aiPoint2Desc3: '',
    point2Image1: null, point2Image2: null, point2Image3: null,
  };

  // 패키지 자동배치는 히어로 제품 bbox 를 읽어 계산한다 → 메인이 비면 계산할 수 없어 기본 위치를 쓴다.
  //   (패키지 선정·여백 정규화·활성 플래그는 무변경이다.)
  if (mainImage && packageImage) {
    const layout = await computePackageLayout(mainImage);
    if (layout) data.packageLayout = layout;
    else notes.push('패키지 자동배치 계산 실패 — 기본 위치 사용(필요시 수동 조정).');
  } else if (packageImage) {
    notes.push('패키지는 기본 위치에 배치됩니다 — 메인 이미지를 지정하면 자동배치가 계산됩니다.');
  }
  if (r.keyFeatures.length !== 3) notes.push(`keyFeatures ${r.keyFeatures.length}개(3 아님) — 메인특징 수동 보완 필요.`);
  notes.push(`본문 원본 보존 — 원본 파일 ${sources.length}장 중 ${bodyOut.sections.reduce((n, s) => n + s.items.length, 0)}건을 원래 순서 그대로 출력`
    + `(제외는 원본 메인섹션 파일과 바나나몰 홍보 GIF뿐이고, 경계 파일만 한 번 잘립니다).`);

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
