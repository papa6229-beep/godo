// @ts-nocheck — 메인몰(바나나몰) 상품정보 엑셀 1행 → 단순형 변환기 프리필 데이터.
// SheetJS(xlsx)는 지연 로딩(dynamic import) → 메인 번들 밖(코드 스플릿).
// 검증(2026-07-09): files/goodsm/{상품번호}/ = 진짜 제품 통이미지 · banana_img/conf = 공통배너(제외).

export interface ParsedMainMallProduct {
  productNo: string;
  productNameKr: string;    // 클렌징된 상품명
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
    productNameKr: cleanProductName(rawName),
    productNameRaw: rawName.trim(),
    brandName: String(r[COL.brand] || '').trim(),
    flowHeaderText: headerText,
    flowImages,
    thumbnailSource: String(r[COL.listImg] || '').trim(),
    excludedImages,
    rawImageCount: allUrls.length,
  };
};
