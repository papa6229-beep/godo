// @ts-nocheck — 이식된 상세페이지 생성기(벤더 코드): GODO 엄격 TS/lint 면제. 로직 수정 최소화.
import type { ProductData } from './types';

// 기본 테마 컬러 (로즈 레드)
export const DEFAULT_THEME_COLOR = '#E11D48';

export const INITIAL_PRODUCT_DATA: ProductData = {
  productNameKr: '',
  productNameEn: '',
  brandName: '', // ✅ 제조사명 필드 (복구됨)
  summaryInfo: {
    feature: '',
    type: '',
    material: '',
    size: '',
    weight: '',
    power: '',
    maker: '',
  },
  themeColor: DEFAULT_THEME_COLOR,
  
  options: [], // 옵션 리스트

  mainImage: null,
  packageImage: null,
  featureImage: null,
  
  point1Image1: null,
  aiPoint1Desc: '',
  point1Image2: null,
  aiPoint1Desc2: '',
  point1Image3: null, 
  aiPoint1Desc3: '',
  
  point2Image1: null,
  aiPoint2Desc: '',
  point2Image2: null,
  aiPoint2Desc2: '',
  point2Image3: null,
  aiPoint2Desc3: '',
  
  sizeImage: null,
  videoInsertImage: null, // [추가]
  thumbnailImage: null,
  watermarkImage: null,
  watermarkSettings: {},

  isPackageImageEnabled: false,

  // [Remote] 섹션 활성화 여부 (기본값 true)
  isFeatureEnabled: true,
  isPoint1Enabled: true,
  isPoint2Enabled: true,
  isSizeEnabled: true,
  
  aiSummary: '',
  aiFeatureDesc: '',
  featureTitle: '',
  point1Title: '',
  point2Title: '',

  // [고도몰] KEY FEATURE 3블록 초기값
  keyFeatures: [
    { title: '', desc: '' },
    { title: '', desc: '' },
    { title: '', desc: '' },
  ],
};

// ✅ 컬러 프리셋 30종 (label 속성 추가로 에러 해결)
export const COLOR_PRESETS = [
  // [1] 모노톤 & 베이직
  { type: 'solid', value: '#000000', label: '시크 블랙' },
  { type: 'solid', value: '#334155', label: '슬레이트' },
  { type: 'solid', value: '#64748b', label: '쿨 그레이' },
  { type: 'solid', value: '#ffffff', label: '퓨어 화이트' },

  // [2] 시그니처 (레드/옐로우)
  { type: 'solid', value: '#e11d48', label: '로즈 레드' },
  { type: 'solid', value: '#ef4444', label: '비비드 레드' },
  { type: 'solid', value: '#dc2626', label: '딥 레드' },
  { type: 'solid', value: '#facc15', label: '바나나 옐로우' },
  { type: 'solid', value: '#f59e0b', label: '앰버 골드' },

  // [3] 무드별 컬러 (핑크/퍼플/블루)
  { type: 'solid', value: '#f472b6', label: '핫 핑크' },
  { type: 'solid', value: '#db2777', label: '마젠타' },
  { type: 'solid', value: '#c084fc', label: '라벤더' },
  { type: 'solid', value: '#7c3aed', label: '로얄 퍼플' },
  { type: 'solid', value: '#3b82f6', label: '테크 블루' },
  { type: 'solid', value: '#0ea5e9', label: '스카이 블루' },
  { type: 'solid', value: '#10b981', label: '민트 그린' },
  { type: 'solid', value: '#059669', label: '포레스트' },

  // [4] 고급스러운 그라데이션
  { type: 'gradient', value: 'linear-gradient(135deg, #facc15 0%, #f59e0b 100%)', label: '골드 그라데이션' },
  { type: 'gradient', value: 'linear-gradient(135deg, #fecaca 0%, #ef4444 100%)', label: '레드 페이드' },
  { type: 'gradient', value: 'linear-gradient(135deg, #e9d5ff 0%, #a855f7 100%)', label: '퍼플 헤이즈' },
  { type: 'gradient', value: 'linear-gradient(135deg, #bfdbfe 0%, #3b82f6 100%)', label: '오션 블루' },
  { type: 'gradient', value: 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)', label: '네이처 그린' },
  { type: 'gradient', value: 'linear-gradient(135deg, #000000 0%, #434343 100%)', label: '메탈릭 블랙' },
  { type: 'gradient', value: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)', label: '피치 캔디' },
  { type: 'gradient', value: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', label: '유니콘 드림' },
  { type: 'gradient', value: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)', label: '아쿠아 스플래시' },
  { type: 'gradient', value: 'linear-gradient(120deg, #f6d365 0%, #fda085 100%)', label: '선셋 오렌지' },
];

export const THUMBNAIL_PRESETS = [
  { width: 202, height: 202, label: '202' },
  { width: 400, height: 400, label: '400' },
  { width: 500, height: 500, label: '500' },
  { width: 274, height: 411, label: '274x411', hidePackage: true }
];