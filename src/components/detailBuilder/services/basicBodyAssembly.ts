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
  /**
   * 원본 보존 본문인가(2026-08-24 패치). true 면 화면은 이 섹션에
   * Point 제목·섹션 제목·구분선·항목 간격·이미지 테두리를 **만들지 않고** 원본 자료만 순서대로 잇는다.
   */
  preserved?: boolean;
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
 *   · 패키지는 AI 지목을 검증만 한다(차단 대상·자산 종류 불일치면 빈 슬롯 — 기존 계약 그대로).
 *   · 메인/Key Feature 는 **AI 가 고른 인덱스를 그대로 쓴다.** 코드는 범위·홍보 GIF·자산 존재만 확인하고
 *     KEY FEATURE 가 메인과 같은 인덱스일 때만 비운다. 픽셀 임계값·후보 재점수로 되탈락시키지 않는다.
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

  // ── 메인·KEY FEATURE : **AI 가 고르고 코드는 기계적 확인만** (2026-08-24 3차 지시) ──────────
  //   왜 바꿨나: 예전에는 AI 가 고른 뒤 cleanEligible(색·글자·연결요소·채움비 임계값)이 다시 탈락시키고
  //     후보풀에서 재점수로 다시 골랐다 — 판단 주체가 둘이라 "AI 는 맞게 골랐는데 화면은 빈칸"이 났다.
  //   이제 허용되는 확인은 세 가지뿐이다: ① 인덱스가 범위 안인가 ② 홍보 GIF 가 아닌가 ③ 자산이 있는가.
  //     (+ KEY FEATURE 는 메인과 같은 인덱스면 비운다 — 같은 사진이 두 자리에 들어가지 않게.)
  //   픽셀 임계값(CLEAN_CUT_THRESHOLDS)·dHash 중복·자산 종류(asset)로 되탈락시키지 않는다.
  const validateHero = (requested: number, role: string, avoidIndex: number): number => {
    if (!inRange(requested, n)) {
      decisions.push({ role, requested, result: 'none', final: -1, reason: 'out_of_range' });
      if (Number.isInteger(requested) && requested >= 0) {
        notes.push(role === 'main'
          ? '메인 이미지 지목이 밴드 범위 밖 — 빈 슬롯(수동 지정 필요).'
          : 'KEY FEATURE 지목이 밴드 범위 밖 — 빈 슬롯(수동 지정 필요).');
      }
      return -1;
    }
    if (bands[requested].promo) {
      decisions.push({ role, requested, result: 'rejected→empty', final: -1, reason: 'bananamall_promo_gif' });
      notes.push(`${role === 'main' ? '메인' : 'KEY FEATURE'} 지목이 바나나몰 홍보 GIF — 빈 슬롯.`);
      return -1;
    }
    if (!bands[requested].src) {
      decisions.push({ role, requested, result: 'rejected→empty', final: -1, reason: 'asset_missing' });
      notes.push(`${role === 'main' ? '메인' : 'KEY FEATURE'} 이미지 자산이 없어 비웠습니다.`);
      return -1;
    }
    if (avoidIndex >= 0 && requested === avoidIndex) {
      decisions.push({ role, requested, result: 'rejected→empty', final: -1, reason: 'same_as_main' });
      notes.push('KEY FEATURE 가 메인과 같은 이미지라 비웠습니다 — 수동 지정 필요.');
      return -1;
    }
    used.add(requested);
    decisions.push({ role, requested, result: 'accepted', final: requested, reason: 'AI 선택 그대로(기계 확인 통과)' });
    return requested;
  };

  // 패키지 먼저(기존 계약 그대로: package_box 만 허용), 그다음 메인 → KEY FEATURE.
  const packageIndex = validateRole(req.packageIndex, 'package', ['package_box']);
  const mainIndex = validateHero(req.mainIndex, 'main', -1);
  const featureIndex = validateHero(req.featureIndex, 'feature', mainIndex);

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

// ── 본문 정본 : 원본 상세이미지 파일 그대로 (2026-08-24 2차 패치) ──────
/** 본문에 그대로 실을 원본 상세이미지 파일 1개. */
export interface BasicSourceImage {
  src: string;      // 화면에 그대로 넣는 주소(same-origin 프록시) — 바꿔 실지 않는다
  isGif: boolean;
  promo: boolean;   // 바나나몰 홍보 GIF(파란 테두리·도메인) — 유일한 제외 대상
}

// ── 본문 시작 경계 : AI 밴드 번호 → 원본 파일·y (2026-08-24 3차 패치) ──────────
//   AI 는 "몇 번 밴드부터 본문인가"(bodyStartIndex) 하나만 답한다. 좌표를 묻지 않는다.
//   코드는 그 밴드가 **어느 원본 파일의 몇 px 에서 시작했는지**를 분할 단계 기록에서 찾아
//   원본을 딱 한 번 자를 위치로 바꾼다. 새 이미지 분석기·좌표 추측 규칙은 만들지 않는다.

/** 밴드 1장의 출처. `y` 는 splitImageByWhitespace 가 이미 돌려준 값 그대로다. */
export interface BasicBandOrigin {
  sourceIndex: number;   // 몇 번째 원본 상세이미지 파일에서 왔는가
  y: number;             // 그 원본 파일 안에서 시작한 y(px)
  isGif: boolean;        // 원본 파일이 GIF 인가
  promo: boolean;        // 바나나몰 홍보 GIF 인가
}

/** 본문 시작 경계 계획. `applied=false` 면 아무 것도 자르지 않고 원본 전체를 보존한다. */
export interface BodyBoundaryPlan {
  applied: boolean;
  sourceIndex: number;   // 본문이 시작되는 원본 파일(applied=false 면 -1)
  cropY: number;         // 그 파일에서 잘라낼 시작 y(0 이면 자르지 않는다)
  reason: string;
  notes: string[];
  decisions: BodyDecision[];
}

/** 경계를 적용하지 못했을 때 남기는 유일한 안내 문구(지시서 고정 문구 — 바꾸지 않는다). */
export const BODY_BOUNDARY_FALLBACK_NOTE = '본문 시작 경계를 적용하지 못해 원본 전체를 보존했습니다 — 손검수 필요.';

/**
 * AI 가 고른 본문 시작 밴드 번호 → 원본 파일 인덱스 + 자를 y.
 *   범위 밖·출처 미상·좌표 없음은 **실패**로 처리하고 원본 전체를 보존한다(본문을 지우지 않는다).
 *   GIF 원본은 자르면 움짤이 깨지므로 자르지 않고 그 파일을 통째로 남긴다(cropY=0).
 */
export const planBodyBoundary = (
  bodyStartIndex: number,
  origins: BasicBandOrigin[],
  sourceCount: number,
): BodyBoundaryPlan => {
  const notes: string[] = [];
  const decisions: BodyDecision[] = [];
  const fail = (reason: string): BodyBoundaryPlan => {
    notes.push(BODY_BOUNDARY_FALLBACK_NOTE);
    decisions.push({ section: 'boundary', requested: bodyStartIndex, result: 'not_applied', reason });
    return { applied: false, sourceIndex: -1, cropY: 0, reason, notes, decisions };
  };

  if (!Number.isInteger(bodyStartIndex) || bodyStartIndex < 0) return fail('out_of_range');
  if (bodyStartIndex >= origins.length) return fail('out_of_range');
  const o = origins[bodyStartIndex];
  if (!o) return fail('origin_missing');
  if (!Number.isInteger(o.sourceIndex) || o.sourceIndex < 0 || o.sourceIndex >= sourceCount) return fail('source_not_found');
  if (!Number.isFinite(o.y) || o.y < 0) return fail('origin_y_missing');

  const cropY = o.isGif ? 0 : Math.round(o.y);
  if (o.isGif && o.y > 0) notes.push('본문 시작이 GIF 파일 중간이라 그 GIF 는 자르지 않고 통째로 유지합니다.');
  decisions.push({ section: 'boundary', requested: bodyStartIndex, result: 'applied', reason: `source ${o.sourceIndex} · y ${cropY}` });
  return { applied: true, sourceIndex: o.sourceIndex, cropY, reason: 'ok', notes, decisions };
};

/** 경계를 적용한 뒤 본문에 실을 원본 파일 목록. `cropFromY>0` 인 항목은 **정확히 하나**뿐이다. */
export interface PlannedBodySource extends BasicSourceImage { cropFromY: number }

/**
 * 계획대로 원본 파일 목록을 줄인다(자르기 자체는 하지 않는다 — 픽셀 처리는 호출부 한 곳).
 *   · 본문 시작 파일보다 앞의 파일: 제외(원본 메인섹션)
 *   · 본문 시작 파일: cropFromY 표시(0 이면 통째로)
 *   · 그 뒤 파일: 자르지 않고 원래 순서 그대로
 */
export const applyBodyBoundary = (
  sources: BasicSourceImage[],
  plan: BodyBoundaryPlan,
): { sources: PlannedBodySource[]; notes: string[]; decisions: BodyDecision[] } => {
  const notes: string[] = [];
  const decisions: BodyDecision[] = [];
  if (!plan.applied) {
    return { sources: sources.map((s) => ({ ...s, cropFromY: 0 })), notes, decisions };
  }
  const out: PlannedBodySource[] = [];
  sources.forEach((s, i) => {
    if (i < plan.sourceIndex) {
      decisions.push({ section: 'boundary', requested: i, result: 'dropped', reason: 'before_body_start' });
      return;
    }
    const cropFromY = i === plan.sourceIndex ? plan.cropY : 0;
    decisions.push({
      section: 'boundary', requested: i,
      result: cropFromY > 0 ? 'cropped' : 'kept',
      reason: cropFromY > 0 ? `y>=${cropFromY}` : 'source_file_preserved',
    });
    out.push({ ...s, cropFromY });
  });
  const dropped = sources.length - out.length;
  if (dropped > 0) notes.push(`원본 메인섹션에 해당하는 원본 파일 ${dropped}장을 본문에서 제외했습니다.`);
  if (plan.cropY > 0) notes.push(`본문 시작 파일을 y=${plan.cropY}px 에서 한 번만 잘라 본문에 싣습니다.`);
  return { sources: out, notes, decisions };
};

/**
 * 본문 = 원본 상세이미지 **파일을 원래 순서 그대로** 한 장씩.
 *
 * 왜 바꿨나(2026-08-24 2차): 밴드 단위 보존(assembleBodyPreserved)는 원본 한 장을
 *   여백 기준으로 잘게 썰어 실었다 — 원본에 없던 이음선이 생길 수 있고,
 *   얇은 조각(minSegPx 20 미만)은 분할 단계에서 아예 사라졌다. → 본문은 이제 자르지 않는다.
 *
 * 규율: 분할·태거·밴드 장부·AI 본문 판단을 전혀 보지 않는다(인자로 받지도 않는다).
 *   자르기·마스킹·OCR·텍스트 재입력·제목·번호·구분선 생성 **0건**. 파일 1장 = 항목 1개.
 */
export const assembleBodyFromSourceImages = (sources: BasicSourceImage[]): BasicBodyResult => {
  const decisions: BodyDecision[] = [];
  const notes: string[] = [];
  const items: BasicBodyItem[] = [];
  let promoDropped = 0;

  sources.forEach((f, i) => {
    if (f.promo) {                    // 기존 isBananamallPromoGif 판정 결과 그대로
      promoDropped += 1;
      decisions.push({ section: 'body', requested: i, result: 'dropped', reason: 'bananamall_promo_gif' });
      return;
    }
    items.push({ kind: 'media', src: f.src, mediaType: f.isGif ? 'gif' : 'image', composite: false });
    decisions.push({ section: 'body', requested: i, result: 'kept', reason: 'source_file_preserved' });
  });

  if (promoDropped) notes.push(`바나나몰 홍보 GIF ${promoDropped}건만 본문에서 제외했습니다.`);
  if (!items.length) {
    notes.push('본문에 남은 원본 이미지가 없습니다 — 손검수 필요.');
    return { sections: [], notes, decisions };   // 빈 섹션을 만들지 않는다
  }
  notes.push(`본문 원본 파일 ${items.length}장을 자르지 않고 원래 순서 그대로 출력합니다.`);
  return {
    sections: [{ id: 'godo-body-source', number: '', title: '', items, preserved: true }],
    notes,
    decisions,
  };
};

// ── (보존 자산) 밴드 단위 본문 보존 — **더 이상 제품 본문 경로가 아니다** ─────
/**
 * 본문 = 원본 밴드를 **원래 순서 그대로**. AI 장부(role·kind·sectionStart)를 보지 않는다.
 *
 * 왜 바꿨나: 장부 기반 조립은 AI 판단에 따라 원본 자료가 본문에서 사라지거나
 *   (요약 원본·중복·빈 설명 판정) 빈 Point 섹션이 생겼다 — 프리티·글랜스 실사용에서 관측된 결함.
 *   → 본문은 이제 아무 것도 판단하지 않는다. 제외는 **로컬이 이미 확정한 바나나몰 홍보 GIF** 하나뿐이다.
 *
 * 규율: 자르기·마스킹·OCR·텍스트 재입력·제목/번호/구분선 생성 **0건**. 밴드 1장 = 항목 1개.
 *   상단 슬롯(메인·KEY FEATURE·패키지)으로 뽑힌 밴드도 본문에서 빼지 않는다 — **본문 보존이 우선**이다.
 *   `assembleBodyFromLedger`·`normalizeBandLedger` 는 지우지 않고 남긴다(리디자인 단계 참고 자산).
 */
export const assembleBodyPreserved = (bands: BasicBandRef[]): BasicBodyResult => {
  const decisions: BodyDecision[] = [];
  const notes: string[] = [];
  const items: BasicBodyItem[] = [];
  let promoDropped = 0;

  bands.forEach((b, i) => {
    if (b.promo) {                      // 파란 테두리 + 바나나몰 도메인 홍보 GIF (기존 판별 그대로)
      promoDropped += 1;
      decisions.push({ section: 'body', requested: i, result: 'dropped', reason: 'bananamall_promo_gif' });
      return;
    }
    items.push({
      kind: 'media',
      src: b.src,                       // GIF 는 원본 URL, 그 외는 분할 밴드 자산 — 바꾸지 않는다
      mediaType: b.isGif ? 'gif' : 'image',
      composite: false,                 // 복합 여부는 AI 판단이었다 — 보존 경로에서는 쓰지 않는다
    });
    decisions.push({ section: 'body', requested: i, result: 'kept', reason: 'preserved' });
  });

  if (promoDropped) notes.push(`바나나몰 홍보 GIF ${promoDropped}건만 본문에서 제외했습니다.`);
  if (!items.length) {
    notes.push('본문에 남은 원본 자료가 없습니다 — 손검수 필요.');
    return { sections: [], notes, decisions };   // 빈 섹션을 만들지 않는다
  }
  notes.push(`본문 원본 보존 ${items.length}건 — 원본 순서 그대로(제목·번호·구분선 생성 0건).`);
  return {
    sections: [{ id: 'godo-body-preserved', number: '', title: '', items, preserved: true }],
    notes,
    decisions,
  };
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
