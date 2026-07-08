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
  godoSpacing?: { section: number; element: number; heading: number };

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