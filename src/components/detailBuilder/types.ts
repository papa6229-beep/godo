// types.ts

export interface SummaryInfo {
  feature: string;   // 특징
  type: string;      // 타입
  material: string;  // 재질
  size: string;      // 치수
  weight: string;    // 무게
  power: string;     // 전원타입
  maker: string;     // 제조사 / 브랜드
}

// [변환기/단순형] 이미지+캡션 블록 — 통이미지 자동분할 조각/개별이미지의 편집·재배치 단위.
export interface FlowBlock {
  id: string;
  image: string;      // dataURL(base64) 또는 CDN URL
  caption?: string;   // 이미지 아래 SEO 텍스트(원본 프리필 or AI 생성/수동)
  option?: string;    // 옵션형일 때 이 이미지가 속한 옵션(예: "01. 키타노 미나"). 없으면 미설정
}

export interface OptionItem {
  id: string;
  name: string;
  image: string | null;
  // Layout props (draggable)
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProductData {
  productNameKr: string;
  productNameEn: string;
  brandName: string;
  summaryInfo: SummaryInfo;
  themeColor: string;
  options: OptionItem[];

  // Images (Base64)
  mainImage: string | null;
  packageImage: string | null;
  featureImage: string | null;
  
  // POINT 1 Images
  point1Image1: string | null;
  point1Image2: string | null;
  point1Image3?: string | null; // [추가] 선택형 이미지 3

  // POINT 2 Images
  point2Image1: string | null;
  point2Image2: string | null;
  point2Image3?: string | null; // [추가] 선택형 이미지 3

  sizeImage: string | null;
  videoInsertImage: string | null; // [추가] 동영상 삽입 (이미지)
  thumbnailImage: string | null;

  // [추가] 워터마크 이미지
  watermarkImage?: string | null;
  // [추가] 워터마크 개별 설정 (키: 이미지 필드명)
  watermarkSettings?: Record<string, { x: number, y: number, width: number, height: number, show: boolean }>;

  // Toggle Flags
  isPackageImageEnabled?: boolean;
  isFeatureEnabled?: boolean; // [추가]
  isPoint1Enabled?: boolean;  // [추가]
  isPoint2Enabled?: boolean;  // [추가]
  isSizeEnabled?: boolean;    // [추가]
  
  // Layout Data
  packageLayout?: { x: number, y: number, width: number, height: number };
  thumbnailPackageLayout?: { x: number, y: number, width: number, height: number };

  // AI Generated Text
  aiSummary: string;
  aiFeatureDesc: string;
  featureTitle?: string; // [추가] 특징 섹션 타이틀

  // [고도몰] KEY FEATURE 핵심 특징 3블록 — title=직접입력(필수), desc=AI 생성 가능.
  // godo 레이아웃에서 aiSummary(히어로 3줄)를 대체하여 KEY FEATURE 우측 3항목으로 렌더.
  keyFeatures?: { title: string; desc: string }[];

  // [고도몰] 레이아웃 간격 수동 조절(data에 저장 → 임시저장/불러오기로 고정).
  // section=섹션 상하 여백, element=요소 간격(이미지↔텍스트), heading=제목↔내용 간격 (px)
  // ⚠️ 종류별 기본값(폴백)일 뿐 — 실제 조절은 아래 godoGaps(위치별 독립)로 저장됨.
  godoSpacing?: { section: number; element: number; heading: number };

  // [고도몰] 간격 위치별 독립 오버라이드. key=위치 id(예: preview-point1-head), value=px.
  // 같은 종류라도 위치마다 따로 저장 → 한 곳 드래그가 다른 곳에 영향 없음. 없으면 godoSpacing으로 폴백.
  godoGaps?: Record<string, number>;

  // [변환기/단순형(flow)] 메인몰 단순형 상세페이지 변환용. 섹션형(godo)과 무관, flow 모드에서만 사용.
  flowEyebrow?: string;         // 상품명 앞 [대괄호] 태그(예: "일본 직수입") — 브랜드 크기 소형 렌더
  flowHeaderText?: string;      // 상단 단순 텍스트(예쁘게 렌더)
  flowColumns?: 1 | 2;          // 원본 레이아웃 열 수(정사각컷 다수=2열, 세로 통이미지=1열). 이미지 크기로 판정.
  flowImages?: string[];        // [구모델] 통이미지 세로 스택. 신모델 flowBlocks로 대체(호환 위해 유지).
  // [신모델] 이미지+캡션 가변 블록 리스트 — 자동분할 조각·개별이미지의 단위.
  // caption = 각 이미지 아래 SEO 텍스트(나중에 AI가 채움). 순서 유지·재배치 가능.
  flowBlocks?: FlowBlock[];

  // [고도몰] KEY FEATURE 좌측 이미지 마우스 크기·위치(드래그/리사이즈)
  featureImageLayout?: { x: number; y: number; width: number; height: number };
  
  // POINT 1 Descriptions
  aiPoint1Desc: string;
  point1Title?: string; // [추가] Point 1 섹션 타이틀
  aiPoint1Desc2?: string; // [추가] 선택형 설명 2
  aiPoint1Desc3?: string; // [추가] 선택형 설명 3

  // POINT 2 Descriptions
  aiPoint2Desc: string;
  point2Title?: string; // [추가] Point 2 섹션 타이틀
  aiPoint2Desc2?: string; // [추가] 선택형 설명 2
  aiPoint2Desc3?: string; // [추가] 선택형 설명 3
}

// enum → const object(+union). GODO erasableSyntaxOnly에서 enum 금지 → 접근/타입 동일 유지.
export const ImageType = {
  MAIN: 'mainImage',
  PACKAGE: 'packageImage',
  FEATURE: 'featureImage',
  POINT1_1: 'point1Image1',
  POINT1_2: 'point1Image2',
  POINT1_3: 'point1Image3',
  POINT2_1: 'point2Image1',
  POINT2_2: 'point2Image2',
  POINT2_3: 'point2Image3',
  SIZE: 'sizeImage',
  VIDEO_INSERT: 'videoInsertImage',
  THUMBNAIL: 'thumbnailImage'
} as const;
export type ImageType = typeof ImageType[keyof typeof ImageType];