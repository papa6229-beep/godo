// ────────────────────────────────────────────────────────────────────────────
// Department Metric Contract — 전 부서 공통 "운영 대표 KPI" 정의 (Source of Truth 계층)
//
// 배경: 상품관리팀/마케팅팀/CS팀/총괄팀이 같은 운영 데이터를 보면서도 대표 KPI(매출·주문수)를
//   서로 다르게 계산해, 운영자가 "부서마다 숫자가 다르다"고 느꼈다. (Cross-Team Parity의 라벨 분리만으론 부족)
//
// 해결 원칙:
//   "부서별 분석 관점은 다를 수 있지만, 운영자가 같은 급으로 보는 대표 KPI는
//    하나의 source of truth에서 나와야 한다."
//
// 2층 구조:
//   (1) 공통 운영 KPI(Operational*) — 모든 부서 상단에서 같은 값. departmentDataSourceOfTruth snapshot에서 읽음.
//   (2) 부서별 분석 KPI — 부서 목적에 따라 다를 수 있음. 단 대표 운영 KPI처럼 보이면 안 됨(라벨/위치 분리).
//
// 대표 운영 매출/주문 기준은 revenueMetricContract의 net(유효 주문: 결제완료·미취소)을 채택한다.
//   이유: 운영 성과 대표값은 취소·미입금을 제외한 유효 주문 기준이 직관적이고 부서 공통으로 타당.
// ────────────────────────────────────────────────────────────────────────────

import { REVENUE_METRIC_LABELS } from './revenueMetricContract';
import type { RevenueMetricLabel } from './revenueMetricContract';

export type OperationalMetricKind =
  | 'operationalRevenue'
  | 'operationalOrderCount'
  | 'operationalAOV'
  | 'productLineRevenue'   // 상품관리팀 전용 분석값(대표 운영 매출 아님)
  | 'marketingNetRevenue'; // 마케팅팀 분석값(운영 대표 매출과 동일 기준)

export const OPERATIONAL_METRIC_LABELS: Record<OperationalMetricKind, RevenueMetricLabel> = {
  // 공통 대표 운영 KPI — 모든 부서 상단에서 같은 값(net 유효 주문 기준).
  operationalRevenue: {
    label: '운영매출',
    basis: '전 부서 공통 · 유효 주문(결제완료·미취소) 결제금액',
    description: '모든 부서가 같은 값으로 보는 대표 운영 매출. 유효 주문(결제완료·미취소)의 주문 총액 합(배송비 포함·할인 차감 후 결제금액). 환불은 반영하지 않는다. 부서별로 다르게 계산하지 않는다.',
    includes: '유효 주문(결제완료·미취소)의 주문 총액',
    excludes: '취소·반품·미입금 주문'
  },
  operationalOrderCount: {
    label: '운영 주문수',
    basis: '전 부서 공통 · 유효 주문 건수',
    description: '모든 부서가 같은 값으로 보는 대표 운영 주문수. 유효 주문(결제완료·미취소) 건수(orderCountValid).',
    includes: '유효 주문',
    excludes: '취소·반품·미입금 주문'
  },
  operationalAOV: {
    label: '운영 객단가',
    basis: '운영매출 ÷ 운영 주문수',
    description: 'operationalRevenue ÷ operationalOrderCount. denominator=operationalOrderCount(유효 주문수).',
    includes: '유효 주문',
    excludes: '취소·반품·미입금 주문'
  },
  // 부서별 분석값 — 대표 운영 KPI와 분리해서 보여준다.
  productLineRevenue: {
    label: '상품 라인 매출',
    basis: '상품관리 분석 전용 · 전체 주문 라인합(배송비 제외, 취소·가상 포함)',
    description: '상품관리팀 전용 분석값. 전체 주문(취소·미입금·가상 포함)의 상품 라인 금액 합(grossProductRevenue). 재고/상품 회전/판매흐름 분석용 — 대표 운영 매출이 아니다.',
    includes: '전체 주문 상품 라인 금액',
    excludes: '배송비'
  },
  marketingNetRevenue: {
    label: '유효 주문 순매출',
    basis: '마케팅 분석 · 유효 주문 기준(운영 대표 매출과 동일)',
    description: '마케팅팀 분석값. 유효 주문 순매출(netOrderRevenue) — 운영 대표 매출(operationalRevenue)과 같은 기준/같은 값.',
    includes: '유효 주문(결제완료·미취소)',
    excludes: '취소·반품·미입금 주문'
  }
};

// 운영 대표 매출/주문이 어떤 revenueMetricContract 기준에서 오는지 명시(거버넌스 추적용).
export const OPERATIONAL_REVENUE_SOURCE = REVENUE_METRIC_LABELS.netOrderRevenue;
export const OPERATIONAL_ORDER_SOURCE = REVENUE_METRIC_LABELS.orderCountValid;
