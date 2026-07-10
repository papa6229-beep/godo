// @ts-nocheck — 메인몰(바나나몰) 상품정보 엑셀 1행 → 단순형 변환기 프리필 데이터.
// SheetJS(xlsx)는 지연 로딩(dynamic import) → 메인 번들 밖(코드 스플릿).
// 검증(2026-07-09): files/goodsm/{상품번호}/ = 진짜 제품 통이미지 · banana_img/conf = 공통배너(제외).

export interface ParsedMainMallProduct {
  productNo: string;
  productNameKr: string;    // 한글 핵심 상품명(조각 분해 후)
  productNameEn: string;    // 영문/일본어 상품명(괄호 제거)
  eyebrow: string;          // 상품명 앞 [대괄호] 태그(예: "일본 직수입")
  productNameRaw: string;   // 원본(검수 참고)
  brandName: string;
  flowHeaderText: string;   // 상세설명 태그제거 텍스트(상단 문구)
  flowImages: string[];     // 진짜 제품 통이미지 URL(순서 유지)
  thumbnailSource: string;  // 목록이미지 url(섬네일 소스)
  excludedImages: string[]; // 제외된 공통배너 등(검수용)
  rawImageCount: number;
}

// 엑셀 컬럼(0-based) — 68컬럼 표준 export
const COL = { no: 0, name: 2, brand: 16, listImg: 17, detail: 20 };

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

// files/goodsm/{상품번호}/ = 제품 통이미지. 깨진 URL(...jpgx.jpg) 방어.
const isProductImage = (u: string): boolean => /\/files\/goodsm\//i.test(u) && !/\.jpgx\.jpg/i.test(u);
const IMG_RE = /(?:src|href)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif))["']/gi;

export const parseMainMallArrayBuffer = async (buf: ArrayBuffer): Promise<ParsedMainMallProduct | null> => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as any[][];
  if (!rows || rows.length < 2) return null;
  const r = rows[1];

  const detail = String(r[COL.detail] || '');
  const rawName = String(r[COL.name] || '');
  const parsedName = parseProductName(rawName);

  const allUrls = [...detail.matchAll(IMG_RE)].map((m) => m[1]);
  // 중복 URL 제거(순서 유지)
  const seen = new Set<string>();
  const uniq = allUrls.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
  const flowImages = uniq.filter(isProductImage);
  const excludedImages = uniq.filter((u) => !isProductImage(u));

  // 헤더텍스트 = 상세설명 텍스트 - 맨 앞 상품명 중복(최장공통접두 제거 → 벤더코드 불일치에도 견고)
  let headerText = stripHtmlText(detail);
  const nameText = stripHtmlText(rawName);
  if (nameText) {
    let lcp = 0;
    const max = Math.min(headerText.length, nameText.length);
    while (lcp < max && headerText[lcp] === nameText[lcp]) lcp++;
    if (lcp >= 8) headerText = headerText.slice(lcp).replace(/^[\s\-·|)]+/, '').trim(); // 앞 구두점 정리
  }

  return {
    productNo: String(r[COL.no] || '').trim(),
    productNameKr: parsedName.nameKr || cleanProductName(rawName),
    productNameEn: parsedName.nameEn,
    eyebrow: parsedName.eyebrow,
    productNameRaw: rawName.trim(),
    // 브랜드는 전용 컬럼(col16)이 1순위, 없으면 상품명 끝 '- 브랜드' 사용
    brandName: String(r[COL.brand] || '').trim() || parsedName.brandInline,
    flowHeaderText: headerText,
    flowImages,
    thumbnailSource: String(r[COL.listImg] || '').trim(),
    excludedImages,
    rawImageCount: allUrls.length,
  };
};
