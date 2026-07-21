// ────────────────────────────────────────────────────────────────────────────
// Marketing First/Repeat Display — 첫구매·재구매·미분류 표시 모델 (순수 함수)
//
// 배경(RC-1 C-8 / D-1): 계산은 고쳤는데 화면 전달 과정에서 미분류가 다시 사라지는
//   문제가 있었다. 표시 계산이 대시보드 TSX 안에 있어 실제 반환값 검증이 어려웠다.
//   → C-8 관련 표시 계산만 여기로 옮기고, 컴포넌트는 **이 반환값을 그대로 렌더링**한다.
//     (테스트용 복제 구현을 따로 두지 않는다. 이중 구현 금지)
//
// 계약
//   · first/repeat/unknown 3분류. unknown은 고객 유형이 아니라
//     '첫구매 여부 정보가 없는 주문'(데이터 품질 상태)이다.
//   · 매출 비중 분모는 전체(totalRevenue) — first+repeat만 쓰지 않는다.
//   · unknown이 0건이면 막대·셀·안내를 만들지 않는다(showUnknown=false).
// ────────────────────────────────────────────────────────────────────────────

import type { MarketingAnalysisFacts } from './marketingAnalysisFacts';

type Summary = MarketingAnalysisFacts['summary'];

export interface FirstRepeatBar {
  label: string;
  value: number;
  display: string;
  group: 'rev' | 'cnt' | 'aov';
}

export interface FirstRepeatCardModel {
  showUnknown: boolean;
  firstAov: number;
  repeatAov: number;
  unknownAov: number;
  firstRevenueShare: number;
  repeatRevenueShare: number;
  unknownRevenueShare: number;
  unknownOrderCount: number;
  unknownRevenue: number;
  /** 미분류가 있을 때만 채워진다. 없으면 빈 문자열 */
  unknownNote: string;
}

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const cnt = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}건`;
const pct = (part: number, total: number): number => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

/** 미분류를 표시해야 하는가. 라벨이 아니라 건수로 판단한다. */
export const shouldShowUnknownFirstPurchase = (s: Summary): boolean => s.unknownFirstPurchaseOrderCount > 0;

/** firstRepeat focus view 막대 */
export const buildFirstRepeatBars = (s: Summary): FirstRepeatBar[] => {
  const bars: FirstRepeatBar[] = [
    { label: '첫구매 매출', value: s.firstPurchaseRevenue, display: won(s.firstPurchaseRevenue), group: 'rev' },
    { label: '재구매 매출', value: s.repeatPurchaseRevenue, display: won(s.repeatPurchaseRevenue), group: 'rev' },
    { label: '첫구매 주문수', value: s.firstPurchaseOrderCount, display: cnt(s.firstPurchaseOrderCount), group: 'cnt' },
    { label: '재구매 주문수', value: s.repeatPurchaseOrderCount, display: cnt(s.repeatPurchaseOrderCount), group: 'cnt' }
  ];
  if (!shouldShowUnknownFirstPurchase(s)) return bars;
  return [
    ...bars,
    { label: '미분류(첫구매 여부 없음) 매출', value: s.unknownFirstPurchaseRevenue, display: won(s.unknownFirstPurchaseRevenue), group: 'rev' },
    { label: '미분류(첫구매 여부 없음) 주문수', value: s.unknownFirstPurchaseOrderCount, display: cnt(s.unknownFirstPurchaseOrderCount), group: 'cnt' }
  ];
};

/** firstRepeat focus view 비교 문구 */
export const buildFirstRepeatComparisonText = (s: Summary): string => {
  const base = `첫구매 ${won(s.firstPurchaseRevenue)} vs 재구매 ${won(s.repeatPurchaseRevenue)}`;
  if (!shouldShowUnknownFirstPurchase(s)) return base;
  return `${base} · 미분류(첫구매 여부 없음) ${won(s.unknownFirstPurchaseRevenue)}·${cnt(s.unknownFirstPurchaseOrderCount)}`;
};

/** 객단가 focus view의 첫구매/재구매/미분류 막대 */
export const buildFirstRepeatAovBars = (s: Summary): FirstRepeatBar[] => {
  const bars: FirstRepeatBar[] = [
    { label: '첫구매 객단가', value: s.firstPurchaseAverageOrderValue, display: won(s.firstPurchaseAverageOrderValue), group: 'aov' },
    { label: '재구매 객단가', value: s.repeatPurchaseAverageOrderValue, display: won(s.repeatPurchaseAverageOrderValue), group: 'aov' }
  ];
  if (!shouldShowUnknownFirstPurchase(s)) return bars;
  return [...bars, {
    label: '미분류(첫구매 여부 없음) 객단가',
    value: s.unknownFirstPurchaseAverageOrderValue,
    display: won(s.unknownFirstPurchaseAverageOrderValue),
    group: 'aov'
  }];
};

/** 객단가 focus view 비교 문구 */
export const buildFirstRepeatAovComparisonText = (s: Summary): string => {
  const base = `첫구매 ${won(s.firstPurchaseAverageOrderValue)} vs 재구매 ${won(s.repeatPurchaseAverageOrderValue)}`;
  if (!shouldShowUnknownFirstPurchase(s)) return base;
  return `${base} · 미분류(첫구매 여부 없음) ${won(s.unknownFirstPurchaseAverageOrderValue)}`;
};

/** 하단 first/repeat 카드 표시 모델 */
export const buildFirstRepeatCardModel = (s: Summary): FirstRepeatCardModel => {
  const showUnknown = shouldShowUnknownFirstPurchase(s);
  return {
    showUnknown,
    firstAov: s.firstPurchaseAverageOrderValue,
    repeatAov: s.repeatPurchaseAverageOrderValue,
    unknownAov: s.unknownFirstPurchaseAverageOrderValue,
    // 분모는 전체 매출. first+repeat만 쓰면 비중 합계가 100%를 넘거나 미분류가 사라진다.
    firstRevenueShare: pct(s.firstPurchaseRevenue, s.totalRevenue),
    repeatRevenueShare: pct(s.repeatPurchaseRevenue, s.totalRevenue),
    unknownRevenueShare: pct(s.unknownFirstPurchaseRevenue, s.totalRevenue),
    unknownOrderCount: s.unknownFirstPurchaseOrderCount,
    unknownRevenue: s.unknownFirstPurchaseRevenue,
    unknownNote: showUnknown
      ? `첫구매 여부 미분류 주문 ${cnt(s.unknownFirstPurchaseOrderCount)}·${won(s.unknownFirstPurchaseRevenue)}은 전체 실적에는 포함되지만 첫구매·재구매 두 그룹에는 포함되지 않습니다.`
      : ''
  };
};
