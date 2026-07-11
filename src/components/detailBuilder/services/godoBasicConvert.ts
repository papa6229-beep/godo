// 기본형(타입1 섹션형) → 고도몰 섹션형 ProductData 조립 코어.
//   PoC(test/_gen_poc2.py)에서 실증된 흐름의 앱 이식: 이미지↔문구 의미 매칭 + 의미 줄바꿈 + 슬롯 조립.
//   철학([[converter-philosophy-testcase-not-deliverable]]): 고도몰 슬롯=고정 그릇, 기본형=재료. 내용으로 판단.
//   ⚠️ 아직 미배선(다음: 헤딩감지·밴드추출 프론트가 BasicSource를 만들어 이 함수 호출 → builder_temp_save 주입).
import type { ProductData, SummaryInfo } from '../types';
import { matchImagesToSlots, lineBreakForLayout, classifyImageRolesBatch } from './flowCaptionService';
import type { BandRole } from './flowCaptionService';

// 기본형에서 추출된 '재료'. 고도몰 슬롯 그릇에 채울 원자재.
export interface BasicPointSource {
  title?: string;      // Point 섹션 소제목(있으면)
  texts: string[];     // 원본 설명 문구(의도 고정) — 슬롯 순서
  images: string[];    // 후보 이미지(순서 불신 — 내용으로 매칭)
}
export interface BasicSource {
  productNameKr: string;
  productNameEn?: string;
  brandName?: string;
  themeColor?: string;
  spec?: Partial<SummaryInfo>;                    // 스펙(있으면). size는 규칙상 '상세페이지 참조'로 강제
  keyFeatures?: { title: string; desc: string }[];// 메인특징 3(있으면)
  mainImage?: string | null;                      // 메인이미지(깨끗한 누끼)
  featureImage?: string | null;                   // KEY FEATURE 이미지
  point1?: BasicPointSource;
  point2?: BasicPointSource;
  sizeImage?: string | null;
  packageImage?: string | null;
}

export interface BasicConvertResult {
  data: Partial<ProductData>;
  notes: string[]; // 변환 로그/이슈(옵션 다수·슬롯 초과 등 향후 확장)
}

// ── 역할 분류 결과 → BasicSource 조립(구조 배치). 텍스트는 별도(typed=엑셀, baked=캡션생성). ──
//    규칙: MAIN[0]=메인, MAIN[1](없으면 ACCESSORY[0])=KEY FEATURE, PACKAGE=패키지, SIZE=사이즈,
//    나머지 제품/부속/조작/케이블 컷=Point 후보(원본 순서 유지 → 상→하 섹션 흐름 보존). HEADING/OTHER 버림.
export interface AssembleMeta {
  productNameKr: string;
  productNameEn?: string;
  brandName?: string;
  themeColor?: string;
  spec?: Partial<SummaryInfo>;
  keyFeatures?: { title: string; desc: string }[];
  point1Texts?: string[]; // typed 소스면 엑셀 원문, baked면 생략(캡션 생성 단계에서 채움)
  point2Texts?: string[];
  point1Title?: string;
  point2Title?: string;
}
export const assembleBasicSource = (
  images: string[], roles: BandRole[], meta: AssembleMeta,
): { source: BasicSource; notes: string[] } => {
  const notes: string[] = [];
  const used = new Set<number>();
  const takeFirst = (r: BandRole): number => {
    for (let i = 0; i < roles.length; i++) if (roles[i] === r && !used.has(i)) { used.add(i); return i; }
    return -1;
  };
  const mainIdx = takeFirst('MAIN');
  let featIdx = takeFirst('MAIN');            // 두 번째 깨끗한 누끼 = KEY FEATURE
  if (featIdx < 0) featIdx = takeFirst('ACCESSORY'); // 없으면 부속컷으로 폴백
  const sizeIdx = takeFirst('SIZE');
  const pkgIdx = takeFirst('PACKAGE');
  // Point 후보: 남은 제품/부속/조작/케이블 컷을 원본 순서로(상→하 섹션 흐름 = point1 먼저)
  const pointIdx: number[] = [];
  for (let i = 0; i < roles.length; i++) {
    if (!used.has(i) && (['ACCESSORY', 'CONTROL', 'CABLE', 'MAIN'] as BandRole[]).includes(roles[i])) {
      pointIdx.push(i); used.add(i);
    }
  }
  const p1imgs = pointIdx.slice(0, 3).map((i) => images[i]);
  const p2imgs = pointIdx.slice(3, 6).map((i) => images[i]);
  if (pointIdx.length > 6) notes.push(`Point 후보 ${pointIdx.length}컷(>6) — 슬롯 초과분은 세로 합치기/영역 추가 판단 필요(향후).`);
  if (mainIdx < 0) notes.push('MAIN(깨끗한 누끼) 후보 없음 — 메인이미지 수동 지정 필요.');

  const source: BasicSource = {
    productNameKr: meta.productNameKr,
    productNameEn: meta.productNameEn,
    brandName: meta.brandName,
    themeColor: meta.themeColor,
    spec: meta.spec,
    keyFeatures: meta.keyFeatures,
    mainImage: mainIdx >= 0 ? images[mainIdx] : null,
    featureImage: featIdx >= 0 ? images[featIdx] : null,
    sizeImage: sizeIdx >= 0 ? images[sizeIdx] : null,
    packageImage: pkgIdx >= 0 ? images[pkgIdx] : null,
    point1: { title: meta.point1Title, texts: meta.point1Texts ?? [], images: p1imgs },
    point2: { title: meta.point2Title, texts: meta.point2Texts ?? [], images: p2imgs },
  };
  return { source, notes };
};

// 편의: 이미지 배열만으로 역할분류→조립까지 한 번에(추출 지능 end-to-end 앞단).
export const imagesToBasicSource = async (
  images: string[], meta: AssembleMeta,
): Promise<{ source: BasicSource; roles: BandRole[]; notes: string[] }> => {
  const roles = await classifyImageRolesBatch(images);
  const { source, notes } = assembleBasicSource(images, roles, meta);
  return { source, roles, notes };
};

// 슬롯 k(=텍스트 인덱스)에 배정된 이미지. assign[k] = 이미지 인덱스(-1/범위밖이면 null).
const pick = (images: string[], assign: number[], k: number): string | null => {
  const ci = assign[k];
  return ci != null && ci >= 0 && ci < images.length ? images[ci] : null;
};

// ── 패키지 자동 배치(수동 이동 불필요): 메인이미지 제품 bbox를 canvas로 읽어 제품/텍스트 안 가리는 우하단에 배치 ──
//    PoC(test/_gen_poc2.py compute_package_layout)의 브라우저 이식. 히어로 좌표(폭 700) 기준.
//    ⚠️ CORS: base64(추출 이미지)면 OK, CDN URL은 taint 시 null 반환(폴백=기본 위치). 원격은 프록시 URL 권장.
export const computePackageLayout = (
  mainImageSrc: string,
  opts: { heroWidth?: number; pkgWidth?: number } = {},
): Promise<{ x: number; y: number; width: number; height: number } | null> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined' || !mainImageSrc) return resolve(null);
    const heroW = opts.heroWidth ?? 700;
    const pkgW = opts.pkgWidth ?? 196;
    const pkgH = Math.round(pkgW * 1.16);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const iw = img.naturalWidth, ih = img.naturalHeight;
        if (!iw || !ih) return resolve(null);
        const aw = 200, ah = Math.max(1, Math.round((ih * aw) / iw)); // 분석용 축소
        const c = document.createElement('canvas'); c.width = aw; c.height = ah;
        const ctx = c.getContext('2d'); if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, aw, ah);
        let px: Uint8ClampedArray;
        try { px = ctx.getImageData(0, 0, aw, ah).data; } catch { return resolve(null); } // taint → 폴백
        const mainH = Math.round((ih * heroW) / iw);
        const xDisp = heroW - pkgW - 6;                       // 우측 정렬(텍스트는 좌측이라 안전)
        const c0 = Math.max(0, Math.floor((xDisp / heroW) * aw));
        const c1 = Math.min(aw, Math.ceil(((xDisp + pkgW) / heroW) * aw));
        let prodBottomRow = -1;                                // 패키지 컬럼 내 제품(비-흰) 최하단
        for (let y = ah - 1; y >= 0 && prodBottomRow < 0; y--) {
          for (let x = c0; x < c1; x++) {
            const i = (y * aw + x) * 4;
            if (px[i + 3] > 10 && Math.min(px[i], px[i + 1], px[i + 2]) < 245) { prodBottomRow = y; break; }
          }
        }
        const prodBottomDisp = prodBottomRow >= 0 ? Math.round((prodBottomRow / ah) * mainH) : 0;
        const straddleY = Math.round(mainH - pkgH * 0.5);      // 하단 모서리에 반쯤 걸침(컨셉)
        const y = Math.max(8, Math.max(prodBottomDisp + 6, straddleY)); // 제품 아래로 내리되 최소 모서리 걸침
        resolve({ x: xDisp, y, width: pkgW, height: pkgH });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = mainImageSrc;
  });

// Point 재료 → 이미지↔문구 매칭(내용 기반). 반환: { assign, texts }.
//   skipMatch=true(baked: 캡션이 이미지에서 생성돼 이미 정렬됨) → 재매칭 생략(순서 유지).
const matchPoint = async (p: BasicPointSource | undefined, skipMatch: boolean): Promise<{ assign: number[]; texts: string[]; images: string[] }> => {
  const texts = p?.texts ?? [];
  const images = p?.images ?? [];
  if (skipMatch || !texts.length || !images.length) {
    return { assign: texts.map((_, i) => (i < images.length ? i : -1)), texts, images };
  }
  const assign = await matchImagesToSlots(images, texts); // VLM 관찰→Gemma 판정(하드코딩 순서 불신)
  return { assign, texts, images };
};

/**
 * 기본형 재료 → 고도몰 섹션형 ProductData(Partial) 조립.
 * builder_temp_save(loadTemporary의 {...prev,...parsed})로 주입하면 좌측 입력부까지 채워진 편집 가능 상태가 됨.
 */
export const convertBasicToGodo = async (
  src: BasicSource,
  opts: { skipImageMatch?: boolean } = {},
): Promise<BasicConvertResult> => {
  const notes: string[] = [];

  // 스펙: 고도몰 7칸 기준. 사이즈는 규칙상 항상 '상세페이지 참조'(옵션별 치수 다양·픽셀OCR 부정확).
  const summaryInfo: SummaryInfo = {
    feature: src.spec?.feature ?? '',
    type: src.spec?.type ?? '',
    material: src.spec?.material ?? '',
    size: '상세페이지 참조',
    weight: src.spec?.weight ?? '',
    power: src.spec?.power ?? '',
    maker: src.brandName ?? src.spec?.maker ?? '',
  };

  // ① 이미지↔문구 의미 매칭(Point01/02). baked(캡션 이미지생성)면 이미 정렬 → skipImageMatch.
  const m1 = await matchPoint(src.point1, !!opts.skipImageMatch);
  const m2 = await matchPoint(src.point2, !!opts.skipImageMatch);

  // ② 의미 단위 줄바꿈: 상품명 + 모든 Point 설명을 한 번에(글자 불변·\n만)
  const allCaps = [...m1.texts, ...m2.texts];
  const lb = await lineBreakForLayout(src.productNameKr, allCaps);
  const nameKr = lb.name;
  const cap1 = lb.captions.slice(0, m1.texts.length);
  const cap2 = lb.captions.slice(m1.texts.length);

  const data: Partial<ProductData> = {
    productNameKr: nameKr,
    productNameEn: src.productNameEn ?? '',
    brandName: src.brandName ?? '',
    ...(src.themeColor ? { themeColor: src.themeColor } : {}),
    summaryInfo,
    ...(src.keyFeatures && src.keyFeatures.length === 3 ? { keyFeatures: src.keyFeatures } : {}),
    mainImage: src.mainImage ?? null,
    featureImage: src.featureImage ?? null,
    sizeImage: src.sizeImage ?? null,
    packageImage: src.packageImage ?? null,
    // 패키지 컷이 있으면 표시 활성화(INITIAL은 false라 안 켜면 오버레이가 안 뜸)
    ...(src.packageImage ? { isPackageImageEnabled: true } : {}),

    point1Title: src.point1?.title ?? '',
    aiPoint1Desc: cap1[0] ?? '',
    aiPoint1Desc2: cap1[1] ?? '',
    aiPoint1Desc3: cap1[2] ?? '',
    point1Image1: pick(m1.images, m1.assign, 0),
    point1Image2: pick(m1.images, m1.assign, 1),
    point1Image3: pick(m1.images, m1.assign, 2),

    point2Title: src.point2?.title ?? '',
    aiPoint2Desc: cap2[0] ?? '',
    aiPoint2Desc2: cap2[1] ?? '',
    aiPoint2Desc3: cap2[2] ?? '',
    point2Image1: pick(m2.images, m2.assign, 0),
    point2Image2: pick(m2.images, m2.assign, 1),
    point2Image3: pick(m2.images, m2.assign, 2),
  };

  // 패키지 자동 배치: 메인+패키지 있으면 제품 안 가리는 위치를 계산해 packageLayout 설정(수동 이동 불필요).
  if (src.mainImage && src.packageImage) {
    const layout = await computePackageLayout(src.mainImage);
    if (layout) data.packageLayout = layout;
    else notes.push('패키지 자동배치 계산 실패(CORS/taint 가능) — 기본 위치 사용, 필요시 수동 조정.');
  }

  if (src.point1 && (src.point1.images.length > 3 || src.point1.texts.length > 3)) {
    notes.push('Point01 재료가 3슬롯 초과 — 영역 추가 또는 이미지 세로 합치기 판단 필요(향후 변수 대응).');
  }
  if (src.point2 && (src.point2.images.length > 3 || src.point2.texts.length > 3)) {
    notes.push('Point02 재료가 3슬롯 초과 — 영역 추가 또는 이미지 세로 합치기 판단 필요(향후 변수 대응).');
  }

  return { data, notes };
};

// ── 오케스트레이터: 이미지 배열 → (역할분류 → 조립 → baked면 캡션생성 → 변환·매칭·줄바꿈·패키지배치) 한 번에 ──
//    UI(Editor)가 이 함수만 부르면 됨. onProgress로 단계 진행 표시.
export interface RunProgress { phase: string }
export const runBasicConversion = async (
  images: string[],
  meta: AssembleMeta,
  onProgress?: (p: RunProgress) => void,
): Promise<BasicConvertResult & { roles: BandRole[] }> => {
  // 속도 우선(1000+ 상품): 역할분류는 이미지마다가 아니라 '한 번에 묶어서' 1콜.
  onProgress?.({ phase: '이미지 자리 잡기(한 번에)' });
  const roles = await classifyImageRolesBatch(images);
  const { source, notes: aNotes } = assembleBasicSource(images, roles, meta);
  const notes = [...aNotes];

  // ⚠️ 느린 '사진 보고 글 새로 짓기'는 하지 않는다(1개당 수 분 → 불가). 원칙: 있는 글 살짝 변주 / 없으면 눈검수.
  //   - 텍스트가 주어지면(엑셀 원본) 이미지와 이미 짝이라 순서 유지(skipImageMatch). 라이트 리라이트는 별도 단계에서.
  //   - 텍스트가 없으면(baked, 글이 그림에 박힘) Point 설명은 비워두고 대시보드 눈검수에서 채운다.
  const hasPointText = ((meta.point1Texts?.length || 0) + (meta.point2Texts?.length || 0)) > 0;
  const pointImgCount = (source.point1?.images.length || 0) + (source.point2?.images.length || 0);
  if (!hasPointText && pointImgCount > 0) {
    notes.push('원본 설명 텍스트 없음(baked) — Point 설명은 비움(대시보드 눈검수에서 채움). 느린 자동생성 안 함.');
  }

  onProgress?.({ phase: '슬롯 조립·줄바꿈·패키지 배치' });
  // 엑셀 원본 텍스트는 이미지와 짝(순서 정렬)이므로 재매칭 불필요 → skipImageMatch로 속도 확보.
  const res = await convertBasicToGodo(source, { skipImageMatch: true });
  return { data: res.data, roles, notes: [...notes, ...res.notes] };
};
