// @ts-nocheck — 메인몰(바나나몰) 상품정보 엑셀 1행 → 단순형 변환기 프리필 데이터.
// SheetJS(xlsx)는 지연 로딩(dynamic import) → 메인 번들 밖(코드 스플릿).
// 검증(2026-07-09): files/goodsm/{상품번호}/ = 진짜 제품 통이미지 · banana_img/conf = 공통배너(제외).

// 상세설명 HTML에서 순서대로 뽑은 [제품이미지 + 그 아래 텍스트] 페어.
// text 있음 = 닛포리형(HTML에 설명 타이핑) → 원본 텍스트를 캡션으로 프리필·리라이트.
// text 없음 = 트리니티형(baked, 통이미지에 글자 박힘) or 단순형(통이미지만).
export interface DetailBlock {
  image: string;   // 제품 이미지 URL(goodsm)
  text: string;    // 그 이미지 뒤 원본 설명 텍스트(옵션 태그 [01. …] 제거된 순수 설명)
  option: string;  // 옵션 태그(예: "01. 키타노 미나"). 옵션형이 아니면 ''
}

export interface ParsedMainMallProduct {
  productNo: string;
  productNameKr: string;    // 한글 핵심 상품명(조각 분해 후)
  productNameEn: string;    // 영문/일본어 상품명(괄호 제거)
  eyebrow: string;          // 상품명 앞 [대괄호] 태그(예: "일본 직수입")
  productNameRaw: string;   // 원본(검수 참고)
  brandName: string;
  flowHeaderText: string;   // 상단 텍스트(첫 제품이미지 앞 인트로 — 상품명 접두 제거)
  flowImages: string[];     // 진짜 제품 이미지 URL(순서 유지) = detailBlocks의 image들
  detailBlocks: DetailBlock[]; // [이미지+텍스트(+옵션)] 순서 페어(핵심)
  hasTypedText: boolean;    // HTML에 이미지별 설명 텍스트가 타이핑돼 있는가(닛포리형 판별)
  optionName: string;       // 엑셀 옵션1의 옵션명(예: "타입"). 없으면 ''
  optionValues: string[];   // 옵션 값 목록(예: ["01. 키타노 미나", …]). 없으면 []
  hasOptions: boolean;      // 옵션형인가(엑셀 옵션1 or 텍스트 [0N.] 태그 존재)
  thumbnailSource: string;  // 목록이미지 url(섬네일 소스)
  excludedImages: string[]; // 제외된 공통배너 등(검수용)
  rawImageCount: number;
}

// 엑셀 컬럼(0-based) — 68컬럼 표준 export
const COL = { no: 0, name: 2, option1: 13, brand: 16, listImg: 17, detail: 20 };

// 옵션1 컬럼 파싱: "타입=01. 키타노 미나,02. 미우라 사쿠라,03. 이마이 카호" → {name:'타입', values:[…]}
const parseOptionColumn = (raw: string): { name: string; values: string[] } => {
  const s = String(raw || '').trim();
  if (!s) return { name: '', values: [] };
  const eq = s.indexOf('=');
  const name = eq >= 0 ? s.slice(0, eq).trim() : '';
  const rest = eq >= 0 ? s.slice(eq + 1) : s;
  const values = rest.split(',').map((v) => v.trim()).filter(Boolean);
  return { name, values };
};

// 설명 텍스트 맨 앞 옵션 태그 [01. 키타노 미나] 감지·분리. (숫자로 시작하는 태그만 = eyebrow형 [일본 직수입]과 구분)
const OPTION_PREFIX_RE = /^\s*\[\s*(\d{1,2}\s*\.\s*[^\]]+?)\s*\]\s*/;
const splitOptionTag = (text: string): { option: string; body: string } => {
  const m = String(text || '').match(OPTION_PREFIX_RE);
  if (!m) return { option: '', body: String(text || '').trim() };
  return { option: m[1].replace(/\s+/g, ' ').trim(), body: text.slice(m[0].length).trim() };
};

const stripHtmlText = (html: string): string =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

// 상품명 클렌징: 끝의 물류/벤더 코드 괄호 제거. 대분류 [..]·브랜드·본문은 보존(보수적 — 나머지는 사람 검수).
export const cleanProductName = (raw: string): string => {
  let s = String(raw || '').trim();
  s = s.replace(/\s*\((?:NPR|TJ|SWL|SNN|LVH|[A-Z]{2,4})\)\s*$/i, ''); // 끝 (NPR) 등 벤더코드
  s = s.replace(/\s*\([A-Za-z]{1,5}[-\d][\w./-]*\)\s*/g, ' ');        // (LT-2016/4571...) 바코드/코드
  return s.replace(/\s+/g, ' ').trim();
};

// 상품명 4조각 분해(사장님 확정 규격):
//   [일본 직수입] 모에 구멍 트리니티 (萌あなトリニティ) - 라이드재팬 (OH-3036)(NPR)
//   → eyebrow="일본 직수입" · nameKr="모에 구멍 트리니티" · nameEn="萌あなトリニティ"(괄호 제거) · brandInline="라이드재팬"
//   끝의 (코드)(약자)는 버림. 없는 조각은 빈 문자열(사람이 개별 입력창에서 보정).
// 코드 괄호 = 알려진 벤더약자(NPR 등) 또는 '숫자 포함' 코드(OH-3036·바코드). 하이픈이 숫자 앞뒤 어디 있어도 매칭.
// 순수 알파벳(ROMP·Moving 등)은 코드로 보지 않음 → 실제 영문/브랜드명 보호(모호하면 사람이 개별 입력창에서 보정).
const CODE_PAREN = /\s*\((?:NPR|TJ|SWL|SNN|LVH|[A-Za-z0-9./-]*\d[A-Za-z0-9./-]*)\)\s*$/;
export const parseProductName = (
  raw: string,
): { eyebrow: string; nameKr: string; nameEn: string; brandInline: string } => {
  let s = String(raw || '').trim();

  // 1) 맨 앞 [..] → eyebrow
  let eyebrow = '';
  const eb = s.match(/^\s*\[([^\]]+)\]\s*/);
  if (eb) { eyebrow = eb[1].trim(); s = s.slice(eb[0].length).trim(); }

  // 2) 끝의 코드 괄호 반복 제거: (OH-3036)(NPR) …
  let prev = '';
  while (s !== prev) { prev = s; s = s.replace(CODE_PAREN, '').trim(); }

  // 3) 끝의 '- 브랜드'(양옆 공백 있는 하이픈만 — 한글 중간 하이픈 오탐 방지)
  let brandInline = '';
  const bm = s.match(/\s[-–—]\s+([^\s()[\]][^()[\]]*?)\s*$/);
  if (bm) { brandInline = bm[1].trim(); s = s.slice(0, bm.index).trim(); }

  // 4) 끝의 (영문/일본어명) → 괄호 제거
  let nameEn = '';
  const nm = s.match(/\(([^()]+)\)\s*$/);
  if (nm) { nameEn = nm[1].trim(); s = s.slice(0, nm.index).trim(); }

  const nameKr = s.replace(/\s+/g, ' ').trim();
  return { eyebrow, nameKr, nameEn, brandInline };
};

// 상세이미지 분류 — 실제 상품 상세이미지를 files/goodsm 한 경로로만 인정하던 것을 일반화(2026-07-20).
//   구형 상품은 상세자료가 files/goodsm 밖(banana_img/product_image 등)에 있어 통째로 누락됐다(시엑스: 10타입 중 7개 소실).
//   판정은 "상품번호 포함 = 무조건 제품" 같은 단일조건이 아니라 여러 신호를 함께 쓴다:
//     ① 깨진 URL(중복 확장자 .jpgx.jpg 등) → 제외
//     ② 여러 상품이 공유하는 공통 장식/배너 영역(conf·k 디렉터리, 알려진 공용배너 파일명) → 제외
//     ③ 상품 소유 저장소(files/goodsm/ · 구형 product_image/ · URL에 상품번호 포함) → 제품
//     ④ 그 외 알 수 없는 경로 = 상세 본문 <img>이므로 "모른다"는 이유로 조용히 버리지 않고 후보로 유지(제품 취급)
//   근거(실측 9샘플): 장식은 예외없이 /banana_img/conf/·/banana_img/k/(sulmung·mooeja·saunpum·kimtop=공유배너),
//     제품은 files/goodsm/{no}/ 또는 banana_img/product_image/man/{no}_detail_*(구형·상품별). 기존 8샘플 수집결과 불변.

// 깨진 이미지: 확장자가 중복돼 실제로 안 열리는 URL(예: ...saunpumnonex.jpgx.jpg)
const isBrokenImageUrl = (u: string): boolean => /\.(?:jpe?g|png|gif)x\.(?:jpe?g|png|gif)/i.test(u);
// 공통 장식/배너: 여러 상품이 공유하는 배너·설명 이미지(상품별이 아님 → 상세에서 제외).
//   conf/=공통 설명배너(sulmung·mooeja·saunpum 등), k/=공통 상단배너(kimtop). 디렉터리 신호 + 공용배너 파일명 보조.
const isCommonDecoration = (u: string): boolean =>
  /\/banana_img\/(?:conf|k)\//i.test(u) || /\/(?:sulmung|mooeja|saunpum|kimtop)\w*\.(?:jpe?g|png|gif)(?:[?#]|$)/i.test(u);
// 상품 소유 저장소로 확실한 경로(상품번호는 디지털만이라 정규식 이스케이프 불필요).
const isOwnedProductPath = (u: string, productNo: string): boolean =>
  /\/files\/goodsm\//i.test(u) ||                 // 신형 표준 경로
  /\/banana_img\/product_image\//i.test(u) ||     // 구형 상품 상세 경로
  (!!productNo && new RegExp(`(?:^|[^0-9])${productNo}(?:[^0-9]|$)`).test(u)); // URL에 상품번호
// 최종: 제품 상세이미지 후보인가. 장식/깨짐이면 제외, 소유경로면 제품, 그 외 알 수 없는 경로는 후보로 유지.
const isProductImage = (u: string, productNo: string): boolean => {
  if (isBrokenImageUrl(u)) return false;
  if (isCommonDecoration(u)) return false;
  if (isOwnedProductPath(u, productNo)) return true;
  return true; // 알 수 없는 경로 = 상세 본문 <img> → 조용히 버리지 않음(장식만 위에서 걸러짐)
};
const IMG_RE = /(?:src|href)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif))["']/gi;
const IMG_TAG_RE = /<img[^>]*?(?:src|href)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif))["'][^>]*>/gi;

// 상세설명 HTML을 '순서대로' 토큰화 → [제품이미지 + 바로 뒤 텍스트] 페어로 만든다.
//   - intro = 첫 제품이미지 앞의 텍스트(상단 문구)
//   - 각 제품이미지의 text = 그 이미지 다음~다음 제품이미지 전까지의 텍스트(닛포리형 설명)
//   - 공통배너(goodsm 아님)는 이미지에서 제외하되, 그 주변 텍스트는 인접 규칙대로 흡수
const parseDetailStructure = (
  html: string,
  productNo: string,
): { intro: string; blocks: DetailBlock[]; excludedImages: string[] } => {
  const tokens: Array<{ type: 'img'; url: string } | { type: 'text'; text: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  IMG_TAG_RE.lastIndex = 0;
  while ((m = IMG_TAG_RE.exec(html))) {
    const before = stripHtmlText(html.slice(last, m.index));
    if (before) tokens.push({ type: 'text', text: before });
    tokens.push({ type: 'img', url: m[1] });
    last = IMG_TAG_RE.lastIndex;
  }
  const tail = stripHtmlText(html.slice(last));
  if (tail) tokens.push({ type: 'text', text: tail });

  const excludedImages: string[] = [];
  const seen = new Set<string>();
  const prodIdx: number[] = [];
  tokens.forEach((t, i) => {
    if (t.type === 'img') {
      if (isProductImage(t.url, productNo)) {
        if (!seen.has(t.url)) { seen.add(t.url); prodIdx.push(i); }
      } else if (!excludedImages.includes(t.url)) {
        excludedImages.push(t.url);
      }
    }
  });

  const first = prodIdx.length ? prodIdx[0] : tokens.length;
  const introParts: string[] = [];
  for (let i = 0; i < first; i++) { const t = tokens[i]; if (t.type === 'text') introParts.push(t.text); }

  const blocks: DetailBlock[] = [];
  let lastOption = '';
  for (let k = 0; k < prodIdx.length; k++) {
    const s = prodIdx[k];
    const e = k + 1 < prodIdx.length ? prodIdx[k + 1] : tokens.length;
    const parts: string[] = [];
    for (let i = s + 1; i < e; i++) { const t = tokens[i]; if (t.type === 'text') parts.push(t.text); }
    const { option, body } = splitOptionTag(parts.join(' ').trim());
    // 옵션 태그는 보통 각 옵션 그룹의 '첫 이미지'에만 붙고 나머지는 태그 없이 순차 배치됨.
    // → 태그가 없으면 '직전 옵션'을 계속 상속(다음 옵션 태그가 나올 때까지 같은 옵션).
    //   (첫 옵션 태그 이전 이미지들은 lastOption='' 이라 옵션 없음으로 남음)
    const opt = option || lastOption;
    if (option) lastOption = option;
    blocks.push({ image: (tokens[s] as { url: string }).url, text: body, option: opt });
  }
  return { intro: introParts.join(' ').trim(), blocks, excludedImages };
};

export const parseMainMallArrayBuffer = async (buf: ArrayBuffer): Promise<ParsedMainMallProduct | null> => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as any[][];
  if (!rows || rows.length < 2) return null;
  const r = rows[1];

  const productNo = String(r[COL.no] || '').trim();
  const detail = String(r[COL.detail] || '');
  const rawName = String(r[COL.name] || '');
  const parsedName = parseProductName(rawName);

  // 상세설명 HTML을 순서대로 구조화(이미지↔텍스트 페어링 + 옵션 태그 분리). 상품번호 = 구형 경로 상세이미지 식별 신호.
  const { intro, blocks, excludedImages } = parseDetailStructure(detail, productNo);
  const flowImages = blocks.map((b) => b.image);
  const hasTypedText = blocks.some((b) => (b.text || '').length > 0);
  const rawImageCount = [...detail.matchAll(IMG_RE)].length;

  // 옵션: 엑셀 옵션1 컬럼 우선, 없으면 상세 텍스트의 [0N.] 태그에서 수집(순서 유지).
  const opt = parseOptionColumn(String(r[COL.option1] || ''));
  const tagValues: string[] = [];
  blocks.forEach((b) => { if (b.option && !tagValues.includes(b.option)) tagValues.push(b.option); });
  const optionValues = opt.values.length ? opt.values : tagValues;
  const hasOptions = optionValues.length > 0 || blocks.some((b) => b.option);

  // 상단 텍스트 = intro - 맨 앞 상품명 중복(최장공통접두 제거 → 벤더코드 불일치에도 견고)
  let headerText = intro;
  const nameText = stripHtmlText(rawName);
  if (nameText) {
    let lcp = 0;
    const max = Math.min(headerText.length, nameText.length);
    while (lcp < max && headerText[lcp] === nameText[lcp]) lcp++;
    if (lcp >= 8) headerText = headerText.slice(lcp).replace(/^[\s\-·|)]+/, '').trim(); // 앞 구두점 정리
  }

  return {
    productNo,
    productNameKr: parsedName.nameKr || cleanProductName(rawName),
    productNameEn: parsedName.nameEn,
    eyebrow: parsedName.eyebrow,
    productNameRaw: rawName.trim(),
    // 브랜드는 전용 컬럼(col16)이 1순위, 없으면 상품명 끝 '- 브랜드' 사용
    brandName: String(r[COL.brand] || '').trim() || parsedName.brandInline,
    flowHeaderText: headerText,
    flowImages,
    detailBlocks: blocks,
    hasTypedText,
    optionName: opt.name,
    optionValues,
    hasOptions,
    thumbnailSource: String(r[COL.listImg] || '').trim(),
    excludedImages,
    rawImageCount,
  };
};
