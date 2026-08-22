// 기본형(통이미지 baked) 본문 — 원본 섹션을 "가변 배열"로 조립하는 순수 로직.
//
// 왜 필요한가(2026-08-22 1차 패치): 원본 본문은 섹션 수와 내부 구성이 상품마다 다른데,
//   출력은 `Point 01 · Point 02 · 하단 SIZE` 고정 슬롯이었다. 그래서 원본 4섹션이
//   2섹션으로 압축되고, 사이즈 섹션이 원본 위치가 아닌 최하단에 생겼다.
//   → 상단 요약(HERO·스펙·KEY FEATURE·패키지) 디자인은 그대로 두고, 본문만 가변 배열로 바꾼다.
//
// 이 파일의 규율
//   · DOM·네트워크·AI 호출 없음 → Node 에서 그대로 실행 검사할 수 있다(기본형 검사 공백 B-2 완화).
//   · AI 에게 픽셀 좌표를 묻지 않는다. AI 는 "어느 밴드가 어느 섹션의 몇 번째 항목인가"라는
//     의미 지도만 준다. 자르기·정규화·렌더는 기존 로컬 경로가 계속 담당한다.
//   · AI 응답을 그대로 믿지 않는다(Layer C). 홍보 GIF·TEXT 밴드·요약 원본·중복은 여기서 막는다.
//   · 애매하면 자르거나 지우지 않는다 — 복합 이미지로 통째 보존하고 손검수 사유를 남긴다.

export type BasicBandType = 'PHOTO' | 'TEXT' | 'MIXED' | 'UNKNOWN';

/** 밴드 1장의 선정·조립용 픽셀 지표(태거 `BasicBandMetrics` 의 부분집합). */
export interface BasicSlotMetrics {
  color: number;       // 유채색 비율 — 높으면 컬러 배경/합성 배너
  smallCC: number;     // 글자형 작은 연결요소 수 — 높으면 이미지에 글자가 박혀 있다
  largestCC: number;   // 가장 큰 연결요소 면적비 — 낮으면 제품이 없다/작다
  fillRatio: number;   // 전경이 자기 bbox 를 채우는 비율 — 높으면 사각 박스(패키지)
  height: number;
  dhash: boolean[];    // 같은 컷 판별용 64bit
}

/** 조립에 필요한 밴드 1장의 사실. `src` 는 렌더에 그대로 쓰는 자산이다. */
export interface BasicBandRef {
  src: string;             // 분할 밴드(dataURL) 또는 원본 GIF URL
  type: BasicBandType;
  promo: boolean;          // 바나나몰 홍보 GIF(파란 테두리·로고) — 어떤 슬롯에도 쓰지 않는다
  isGif?: boolean;         // 원본이 GIF → 정지 이미지로 바꾸지 않는다
  metrics?: BasicSlotMetrics;
}

// ── AI(Claude 1콜)가 돌려주는 "밴드 장부" — 픽셀 좌표 없음 ────────────────────
//   섹션 배열을 AI 가 자유 조립하던 계약을 버리고, 각 밴드를 정확히 한 번 기재하는 장부로 바꿨다
//   (2026-08-22 3사례 교정). 섹션은 코드가 장부를 원본 인덱스 순서로 훑어 만든다 → 재배열·병합·분실 불가.
export type BandRole = 'summary' | 'body' | 'tail' | 'exclude';
export type BandKind = 'text' | 'media' | 'composite';
export type BandAsset = 'product_cut' | 'package_box' | 'components' | 'usage' | 'diagram' | 'other';
export interface AiBandEntry {
  index: number;            // 원본 밴드 인덱스
  role?: BandRole;          // 위치 역할
  kind?: BandKind;          // 표현 종류
  asset?: BandAsset;        // 자산 종류(상단 슬롯 자격 검증에 쓴다)
  sectionStart?: boolean;   // 새 설명 섹션 시작
  sectionTitle?: string;    // 원본 섹션 제목(있을 때만)
  text?: string;            // 직접 타이핑할 독립 설명문(kind=text)
  reviewNote?: string;      // 복합 이미지 손검수 사유
}
export interface BasicSlotRequest {
  mainIndex: number;
  featureIndex: number;
  packageIndex: number;
  ledger?: NormalizedBandEntry[];    // 자산 종류로 슬롯 자격을 검증하기 위한 장부(없으면 종전대로)
  /**
   * 메인으로 고른 컷이 "흰 배경 + 제품 단독"인가(AI 판단).
   * false = 손·사람·소품·글자 등이 섞였지만 더 나은 후보가 없어 그대로 쓴 경우 → 손검수 안내를 남긴다.
   * (변환을 실패시키거나 빈칸으로 만들지 않는다.)
   */
  mainIsSoloProductCut?: boolean;
}

// ── 화면이 렌더하는 본문 정본 ────────────────────────────────────────────────
export type BasicMediaType = 'image' | 'gif';
export interface BasicBodyTextItem { kind: 'text'; text: string }
export interface BasicBodyMediaItem {
  kind: 'media';
  src: string;
  mediaType: BasicMediaType;
  composite: boolean;      // 제품과 설명·수치·표식이 한 시각 구성으로 묶인 이미지
  reviewNote?: string;     // 분리 애매 등 손검수 사유(있을 때만)
}
export type BasicBodyItem = BasicBodyTextItem | BasicBodyMediaItem;
export interface BasicBodySection {
  id: string;
  number: string;          // 원본 번호("01"…). 없을 수 있다 — 화면 주 번호는 배열 순서(bodyPointLabel)
  title: string;           // 원본 섹션 제목. 없을 수 있다
  items: BasicBodyItem[];  // 원본 위→아래 순서
  /** 이 섹션 안에서 "설명 없는 제품컷 나열부(tail)"가 시작되는 항목 위치. 없으면 undefined. */
  tailStart?: number;
}

/** dHash 해밍 ≤ 이 값이면 같은 컷(실측: 동일 0~3 vs 다른 27+). */
export const BODY_DUP_HAMMING = 10;

/** HERO/Key Feature 자격 임계 — 핑거위글 21밴드 실측 고정(2026-07-16). 근거 없이 바꾸지 않는다. */
export const CLEAN_CUT_THRESHOLDS = {
  MAX_COLOR: 0.20,        // 초과 = 컬러 배너/합성 배경(분홍 요약 메인 등)
  MAX_SMALL_CC: 10,       // 초과 = 글자가 박힌 컷
  MIN_LARGEST_CC: 0.12,   // 미만 = 제품이 없거나 너무 작음
  MAX_FILL_RATIO: 0.62,   // 초과 = 사각 박스형(패키지)
} as const;

/** 두 dHash 의 해밍 거리. 길이가 다르면 비교 불가 = 최대치(64). */
export const dhashHamming = (a: boolean[], b: boolean[]): number => {
  if (!a?.length || !b?.length || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
};

/** 같은 사진인가(다른 밴드에 실린 동일 컷). */
export const isSameCut = (a?: BasicSlotMetrics, b?: BasicSlotMetrics): boolean =>
  !!a && !!b && dhashHamming(a.dhash, b.dhash) <= BODY_DUP_HAMMING;

export interface SlotDecision { role: string; requested: number; result: string; final: number; reason: string }
export interface BasicSlotResult {
  mainIndex: number;
  featureIndex: number;
  packageIndex: number;
  reserved: Set<number>;      // 본문에 다시 쓰지 않을 밴드(요약 원본 + 패키지)
  decisions: SlotDecision[];
  notes: string[];
}

const inRange = (i: number, n: number): boolean => Number.isInteger(i) && i >= 0 && i < n;

/**
 * 상단 요약 슬롯(메인 · Key Feature · 패키지) 선정 + 본문 재사용 금지 목록.
 *   · 패키지는 AI 지목을 검증만 한다(차단 대상이면 빈 슬롯 — 잘못된 사진보다 빈 슬롯이 안전).
 *   · 메인/Key Feature 는 "흰 배경의 깨끗한 제품 단독 컷" 자격을 로컬에서 다시 검사한다.
 *     AI 픽이 자격을 통과하면 존중하고, 아니면 후보풀에서 재선정한다. 둘은 서로 다른 컷이어야 한다.
 */
export const selectBasicSlots = (req: BasicSlotRequest, bands: BasicBandRef[]): BasicSlotResult => {
  const decisions: SlotDecision[] = [];
  const notes: string[] = [];
  const used = new Set<number>();
  const n = bands.length;

  const blockReason = (i: number): string | null => {
    if (!inRange(i, n)) return 'out_of_range';
    if (bands[i].promo) return 'bananamall_promo_gif';
    if (bands[i].type === 'TEXT') return 'text_band_not_allowed_for_image_slot';
    return null;
  };

  // 장부의 자산 종류로 "긍정 자격"을 확인한다(장부가 없으면 종전대로 통과).
  //   패키지 슬롯은 package_box 만 허용 — 구성품(파우치·케이블) 사진을 패키지로 쓰지 않는다.
  const assetOf = (i: number): BandAsset | undefined => req.ledger?.find((e) => e.index === i)?.asset;
  const assetAllows = (i: number, allowed: BandAsset[]): boolean => {
    const a = assetOf(i);
    return a === undefined ? true : allowed.includes(a);
  };

  // 단일 역할(패키지): 차단 대상이거나 자산 종류가 맞지 않으면 거부 → 빈 슬롯.
  const validateRole = (requested: number, role: string, allowed: BandAsset[]): number => {
    const block = blockReason(requested);
    if (block) {
      decisions.push({ role, requested, result: inRange(requested, n) ? 'rejected→empty' : 'none', final: -1, reason: block });
      return -1;
    }
    if (!assetAllows(requested, allowed)) {
      decisions.push({ role, requested, result: 'rejected→empty', final: -1, reason: `asset_not_allowed(${assetOf(requested)})` });
      notes.push(role === 'package'
        ? '패키지 박스 사진이 없어 패키지 영역을 비웠습니다(구성품 사진은 패키지로 쓰지 않습니다).'
        : `${role} 자산 종류가 맞지 않아 비웠습니다.`);
      return -1;
    }
    used.add(requested);
    decisions.push({ role, requested, result: 'accepted', final: requested, reason: 'ok' });
    return requested;
  };

  const metricsOf = (i: number): BasicSlotMetrics | undefined => (inRange(i, n) ? bands[i].metrics : undefined);
  const cleanEligible = (i: number, avoid: number[]): boolean => {
    if (blockReason(i) || used.has(i)) return false;
    if (!assetAllows(i, ['product_cut'])) return false;   // 메인·KEY FEATURE 는 제품컷만
    const m = metricsOf(i);
    if (!m) return false;
    const t = CLEAN_CUT_THRESHOLDS;
    if (m.color > t.MAX_COLOR || m.smallCC > t.MAX_SMALL_CC) return false;
    if (m.largestCC < t.MIN_LARGEST_CC || m.fillRatio > t.MAX_FILL_RATIO) return false;
    for (const ex of avoid) if (ex >= 0 && isSameCut(m, metricsOf(ex))) return false;
    return true;
  };
  const cleanScore = (i: number): number => {
    const m = metricsOf(i);
    if (!m) return -999;
    return m.largestCC * 2 - m.color - m.smallCC * 0.02 + Math.min(m.height, 700) / 2000;
  };
  const selectClean = (requested: number, role: string, avoid: number[]): number => {
    if (cleanEligible(requested, avoid)) {
      used.add(requested);
      decisions.push({ role, requested, result: 'accepted(clean)', final: requested, reason: 'AI 픽이 자격 통과' });
      return requested;
    }
    const pool = bands.map((_, i) => i).filter((i) => cleanEligible(i, avoid));
    if (!pool.length) {
      decisions.push({ role, requested, result: 'no-clean→empty', final: -1, reason: '깨끗한 제품컷 후보 없음 → 수동 지정 필요' });
      notes.push(role === 'main' ? '메인 이미지 후보 없음 — 수동 지정 필요.' : 'KEY FEATURE 이미지 후보 없음 — 수동 지정 필요.');
      return -1;
    }
    const chosen = [...pool].sort((a, b) => cleanScore(b) - cleanScore(a))[0];
    used.add(chosen);
    const m = metricsOf(chosen)!;
    decisions.push({
      role, requested, result: 'reselected(clean)', final: chosen,
      reason: `largestCC ${m.largestCC.toFixed(3)}·color ${m.color.toFixed(3)}·fill ${m.fillRatio.toFixed(2)}·smallCC ${m.smallCC}`,
    });
    return chosen;
  };

  // 패키지 먼저(메인/피처가 패키지와 같은 컷을 피할 수 있게), 그다음 메인 → 피처.
  const packageIndex = validateRole(req.packageIndex, 'package', ['package_box']);
  const mainIndex = selectClean(req.mainIndex, 'main', [packageIndex]);
  const featureIndex = selectClean(req.featureIndex, 'feature', [packageIndex, mainIndex]);

  // 본문 재사용 금지: 장부에서 summary 로 표시된 원본 요약 영역 + 상단에 쓴 패키지 자산.
  const reserved = new Set<number>();
  for (const e of req.ledger ?? []) if (e.role === 'summary' && inRange(e.index, n)) reserved.add(e.index);
  if (packageIndex >= 0) reserved.add(packageIndex);
  if (req.ledger && !req.ledger.some((e) => e.role === 'summary')) {
    notes.push('요약정보 원본 밴드 표시 없음 — 본문 중복 여부를 눈으로 확인하세요.');
  }
  // 제품 단독 컷이 부족해 손·사람·소품이 섞인 컷을 메인으로 쓴 경우: 변환은 계속하고 검수 신호만 남긴다.
  if (mainIndex >= 0 && req.mainIsSoloProductCut === false) notes.push('메인 이미지에 제품 외 요소 포함 — 손검수 필요.');

  return { mainIndex, featureIndex, packageIndex, reserved, decisions, notes };
};

export interface BodyDecision { section: string; requested: number; result: string; reason: string }
export interface BasicBodyResult { sections: BasicBodySection[]; notes: string[]; decisions: BodyDecision[] }
export interface AssembleOptions { reserved?: Set<number> }

// ── 밴드 장부 정규화 ─────────────────────────────────────────────────────────
export interface NormalizedBandEntry {
  index: number;
  role: BandRole;
  kind: BandKind;
  asset: BandAsset;
  sectionStart: boolean;
  sectionTitle: string;
  text: string;
  reviewNote: string;
}
export interface LedgerResult { ledger: NormalizedBandEntry[]; notes: string[]; decisions: BodyDecision[] }

const ROLES: BandRole[] = ['summary', 'body', 'tail', 'exclude'];
const KINDS: BandKind[] = ['text', 'media', 'composite'];
const ASSETS: BandAsset[] = ['product_cut', 'package_box', 'components', 'usage', 'diagram', 'other'];

/**
 * AI 장부를 "밴드 하나당 정확히 한 줄, 원본 인덱스 순서" 로 정규화한다.
 *   · 로컬이 이미 판정한 홍보 GIF 는 AI 판단과 무관하게 exclude.
 *   · 중복 기재는 첫 줄만 채택하고, 누락 밴드는 보수적 기본값으로 채운다 — 둘 다 정확한 인덱스로 notes 에 남긴다.
 *   · 순서는 AI 가 어떻게 적어 보내든 원본 인덱스 순으로 강제한다(재배열 불가).
 */
export const normalizeBandLedger = (aiBands: AiBandEntry[], bands: BasicBandRef[]): LedgerResult => {
  const notes: string[] = [];
  const decisions: BodyDecision[] = [];
  const n = bands.length;
  const byIndex = new Map<number, AiBandEntry>();
  const duplicated: number[] = [];
  const outOfRange: number[] = [];

  for (const raw of Array.isArray(aiBands) ? aiBands : []) {
    const idx = typeof raw?.index === 'number' ? raw.index : Number.parseInt(String(raw?.index), 10);
    if (!inRange(idx, n)) { if (Number.isFinite(idx)) outOfRange.push(idx); continue; }
    if (byIndex.has(idx)) { duplicated.push(idx); continue; }   // 먼저 온 줄만 채택
    byIndex.set(idx, raw);
  }

  const missing: number[] = [];
  const ledger: NormalizedBandEntry[] = [];
  for (let i = 0; i < n; i++) {
    const raw = byIndex.get(i);
    if (!raw) missing.push(i);
    const promo = bands[i].promo;
    const isTextBand = bands[i].type === 'TEXT';
    const role: BandRole = promo ? 'exclude'
      : (ROLES.includes(raw?.role as BandRole) ? (raw!.role as BandRole) : (raw ? 'body' : 'exclude'));
    let kind: BandKind = KINDS.includes(raw?.kind as BandKind) ? (raw!.kind as BandKind) : (isTextBand ? 'text' : 'media');
    // 글자만 있는 밴드를 이미지로 싣지 않는다(중복 출력 방지) — 로컬 최종 판정.
    if (isTextBand && kind !== 'text') {
      decisions.push({ section: '-', requested: i, result: 'coerced', reason: 'text_band_forced_to_text' });
      kind = 'text';
    }
    if (bands[i].type === 'MIXED' && kind === 'media') kind = 'composite';
    ledger.push({
      index: i,
      role,
      kind,
      asset: ASSETS.includes(raw?.asset as BandAsset) ? (raw!.asset as BandAsset) : 'other',
      sectionStart: raw?.sectionStart === true,
      sectionTitle: (raw?.sectionTitle ?? '').toString().trim(),
      text: (raw?.text ?? '').toString().trim(),
      reviewNote: (raw?.reviewNote ?? '').toString().trim(),
    });
  }

  if (missing.length) notes.push(`판독 장부에 빠진 밴드 ${missing.length}건(인덱스 ${missing.join(', ')}) — 본문에서 제외했습니다. 손검수 필요.`);
  if (duplicated.length) notes.push(`판독 장부에 두 번 기재된 밴드 ${duplicated.length}건(인덱스 ${[...new Set(duplicated)].join(', ')}) — 첫 기재만 사용했습니다. 손검수 필요.`);
  if (outOfRange.length) notes.push(`판독 장부의 범위 밖 인덱스 ${[...new Set(outOfRange)].join(', ')} — 무시했습니다.`);
  return { ledger, notes, decisions };
};

/**
 * 장부 → 화면 렌더용 본문 섹션 배열. 코드가 원본 인덱스 순서로 한 번 훑으며 조립한다.
 *   · body 밴드의 sectionStart 에서 새 섹션을 연다(원본 번호가 없어도 열린다).
 *   · tail 밴드(설명 없는 제품컷 나열부)는 마지막 섹션 뒤에 이어 붙이고 tailStart 로 구분 위치를 남긴다.
 *   · summary/exclude 는 본문에 넣지 않는다. AI 가 순서를 바꿀 수 없다(장부 순회가 곧 원본 순서).
 */
export const assembleBodyFromLedger = (
  ledger: NormalizedBandEntry[],
  bands: BasicBandRef[],
  opts: AssembleOptions = {},
): BasicBodyResult => {
  const reserved = opts.reserved ?? new Set<number>();
  const decisions: BodyDecision[] = [];
  const notes: string[] = [];
  const sections: BasicBodySection[] = [];
  const usedMedia = new Set<number>();
  const n = bands.length;

  const dropReason = (i: number): string | null => {
    if (!inRange(i, n)) return 'out_of_range';
    if (bands[i].promo) return 'bananamall_promo_gif';
    if (reserved.has(i)) return 'reserved_for_summary_or_package';
    if (usedMedia.has(i)) return 'duplicate_in_body';
    for (const r of reserved) if (isSameCut(bands[i].metrics, bands[r]?.metrics)) return 'duplicate_of_reserved_cut';
    return null;
  };
  const openSection = (title: string): BasicBodySection => {
    const sec: BasicBodySection = { id: `godo-body-${sections.length + 1}`, number: '', title, items: [] };
    sections.push(sec);
    return sec;
  };
  const current = (): BasicBodySection => (sections.length ? sections[sections.length - 1] : openSection(''));

  let tailOpened = false;
  for (const e of [...ledger].sort((a, b) => a.index - b.index)) {
    if (e.role === 'summary' || e.role === 'exclude') continue;

    if (e.role === 'body' && e.sectionStart) openSection(e.sectionTitle);
    const sec = current();
    if (e.role === 'body' && !e.sectionStart && e.sectionTitle && !sec.title) sec.title = e.sectionTitle;

    if (e.kind === 'text') {
      if (e.text) { sec.items.push({ kind: 'text', text: e.text }); decisions.push({ section: sec.title || sec.id, requested: e.index, result: 'kept', reason: 'text' }); }
      else decisions.push({ section: sec.title || sec.id, requested: e.index, result: 'dropped', reason: 'empty_text' });
      continue;
    }
    const reason = dropReason(e.index);
    if (reason) { decisions.push({ section: sec.title || sec.id, requested: e.index, result: 'dropped', reason }); continue; }
    // 설명 없는 제품컷 나열부(tail) 는 앞 설명 섹션과 한 번만 구분한다.
    if (e.role === 'tail' && !tailOpened) { sec.tailStart = sec.items.length; tailOpened = true; }
    usedMedia.add(e.index);
    sec.items.push({
      kind: 'media',
      src: bands[e.index].src,
      mediaType: bands[e.index].isGif ? 'gif' : 'image',
      composite: e.kind === 'composite',
      ...(e.reviewNote ? { reviewNote: e.reviewNote } : {}),
    });
    decisions.push({ section: sec.title || sec.id, requested: e.index, result: 'kept', reason: `${e.role}/${e.kind}` });
  }

  for (const sec of sections) if (!sec.items.length) notes.push(`본문 ${sec.title || sec.id} 섹션에 남은 자료가 없습니다 — 손검수 필요.`);
  if (!sections.length) notes.push('AI 가 본문 섹션을 인식하지 못했습니다 — 손검수 필요.');
  const dropped = decisions.filter((d) => d.result === 'dropped').length;
  if (dropped) notes.push(`본문에서 ${dropped}건 제외(요약 원본·홍보 GIF·중복·빈 설명).`);

  return { sections, notes, decisions };
};

export interface BasicSummaryFields {
  feature?: string; type?: string; material?: string; weight?: string; power?: string; maker?: string;
}
export interface BasicSummaryOut {
  feature: string; type: string; material: string; size: string; weight: string; power: string; maker: string;
}

/**
 * 고정 스펙 5개 조립. 치수는 항상 `상세페이지 참조` 다 —
 * 옵션마다 치수가 달라 원본을 그대로 옮길 수 없다는 요구자료 규정(사장님 확정).
 * 나머지는 AI 가 원본에서 읽은 값만 쓴다(없으면 빈 값 — 지어내지 않는다).
 */
export const buildBasicSummaryInfo = (
  summary: BasicSummaryFields | undefined,
  ctx: { brandName?: string } = {},
): BasicSummaryOut => {
  const s = summary ?? {};
  return {
    feature: s.feature ?? '',
    type: s.type ?? '',
    material: s.material ?? '',
    size: '상세페이지 참조',
    weight: s.weight ?? '',
    power: s.power ?? '',
    maker: ctx.brandName || s.maker || '',
  };
};

/** 동적 본문이 있으면 그것이 본문 정본이다(고정 Point 01·02·SIZE 렌더를 함께 쓰지 않는다). */
export const hasDynamicBody = (data?: { godoBodySections?: BasicBodySection[] } | null): boolean =>
  !!data && Array.isArray(data.godoBodySections) && data.godoBodySections.length > 0;

// ── 렌더 규칙(순수 판정 — 화면은 이 결과만 쓴다) ─────────────────────────────

/**
 * 본문 섹션의 화면 제목 — 배열 순서로 고정한다("Point 01", "Point 02" …).
 * 원본 번호(sec.number)는 상품마다 없거나 형식이 달라 주 번호로 쓰지 않는다(원본 제목은 보조 제목으로 남는다).
 */
export const bodyPointLabel = (index: number): string => `Point ${String(index + 1).padStart(2, '0')}`;

/**
 * 원본의 "사이즈" 섹션인가. 상품마다 번호는 달라도 제목은 사이즈/SIZE 로 적힌다.
 * 이 섹션에서만 무게 표시를 알약(pill)로, 도해 이미지를 무테로 렌더한다(다른 섹션 무영향).
 */
export const isSizeSection = (sec?: { title?: string } | null): boolean =>
  /사이즈|size/i.test((sec?.title ?? '').trim());

/**
 * "무게 : 약 97g" 처럼 무게 값만 담긴 짧은 한 줄인가(알약 렌더 대상).
 * 주석 문장("*위 사이즈와 무게는 …")은 대상이 아니다 — 별표로 시작하거나 길면 제외한다.
 */
export const isWeightLine = (text?: string): boolean => {
  const t = (text ?? '').trim();
  if (!t || t.startsWith('*') || t.length > 24) return false;
  return /무게|weight/i.test(t) && /\d/.test(t);
};

/**
 * "마지막 본문 섹션에서 · 마지막 설명문 뒤에 · 미디어가 2장 이상 연속" 되는 나열부의 시작 위치. 없으면 -1.
 * 중간 섹션(02 처럼 설명에 소속된 연속 이미지)은 대상이 아니다 — `isLastSection` 이 그 경계다.
 */
export const trailingMediaRunStart = (
  sec?: { items?: BasicBodyItem[] } | null,
  isLastSection = false,
): number => {
  if (!isLastSection) return -1;
  const items = sec?.items ?? [];
  let lastText = -1;
  for (let i = 0; i < items.length; i++) if (items[i].kind === 'text') lastText = i;
  if (lastText < 0) return -1;                       // 설명이 하나도 없으면 나열부를 가를 기준이 없다
  const start = lastText + 1;
  const run = items.length - start;
  return run >= 2 ? start : -1;
};
