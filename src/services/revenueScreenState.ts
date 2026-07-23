// ────────────────────────────────────────────────────────────────────────────
// DATA-SOURCE-SERVER-01 (GREEN F) — 매출/시뮬레이션 응답 → **화면 데이터 상태** 단일 판정
//
// 배경: 서버는 실제 주문 slice 와 시뮬레이션 slice 의 상태를 **따로** 보고한다.
//   realOrdersStatus: 'success' | 'unavailable' | 'fixture'
//   syntheticStatus:  'not_requested' | 'success' | 'unavailable'
// 그런데 최상위 sourceType 은 **실제 주문 slice** 기준이라, 실제 주문만 실패하고
// 2년치 시뮬레이션이 정상일 때도 'unavailable' 이 된다(정직한 값이므로 바꾸지 않는다).
//
// 소비자가 최상위 source 하나만 보고 화면을 숨기면, 멀쩡한 시험 통계·그래프·CS 시험자료까지
// "연결 안 됨"으로 사라진다. 그래서 화면 판정은 **두 slice 를 함께 보고** 여기서 한 번만 내린다.
// 소비자마다 조건을 복붙하지 않는다.
//
// 판정 규칙(사장 확정):
//   실제 주문 성공 + 시뮬레이션 있음        → 시험 데이터
//   실제 주문 실패 + 시뮬레이션 성공        → 시험 데이터 유지 + "실제 주문 연결 안 됨" 별도 안내
//   실제 주문 실패 + 시뮬레이션도 불가      → 연결 안 됨
//   실제 성공 빈배열 + 시뮬레이션 없음      → 실제 데이터 0건
//   명시적 mock fixture                     → 시험 데이터
// ────────────────────────────────────────────────────────────────────────────

import type { ProvenanceKind, ProvenanceUserLabel } from './dataSourceProvenanceContract';
import { userLabelOf } from './dataSourceProvenanceContract';

export type RealOrdersStatus = 'success' | 'unavailable' | 'fixture';
export type SyntheticStatus = 'not_requested' | 'success' | 'unavailable';

/** 판정에 필요한 최소 입력(RevenueResult 의 부분집합 — 테스트하기 쉽게 좁게 받는다). */
export interface RevenueScreenStateInput {
  /** 서버 응답을 받지 못했으면 false. */
  loaded?: boolean;
  realOrdersStatus?: RealOrdersStatus;
  syntheticStatus?: SyntheticStatus;
  /** 시뮬레이션 주문 수(요약 기준). 0이면 시뮬레이션 없음. */
  syntheticOrderCount?: number;
  /** 요약이 없으면(계산 불가) 데이터로 쓸 수 없다. */
  hasSummary?: boolean;
  realOrdersErrorMessage?: string;
  syntheticErrorMessage?: string;
}

export interface RevenueScreenState {
  kind: ProvenanceKind;
  userLabel: ProvenanceUserLabel;
  /** 화면이 데이터를 그려도 되는가. false 면 빈 상태 안내. */
  usable: boolean;
  /** 시뮬레이션이 화면에 실제로 들어가 있는가(배지 문구용). */
  hasSimulation: boolean;
  /** 실제 주문 연결이 안 된 경우의 별도 안내(시험 데이터는 계속 보여주면서 함께 표시). */
  realOrdersNotice?: string;
  reason: string;
}

const REAL_ORDERS_NOTICE = '실제 주문 연결 안 됨 — 아래 수치는 시험 데이터입니다.';

/**
 * 화면 데이터 상태 판정. 순수 함수 — 입력만으로 결정된다.
 * 서버 최상위 sourceType 은 **참고하지 않는다**(실제 주문 slice 기준이라 시뮬레이션을 가린다).
 */
export function resolveRevenueScreenState(input: RevenueScreenStateInput | null | undefined): RevenueScreenState {
  const mk = (
    kind: ProvenanceKind,
    usable: boolean,
    reason: string,
    extra: { hasSimulation?: boolean; realOrdersNotice?: string } = {}
  ): RevenueScreenState => ({
    kind,
    userLabel: userLabelOf(kind),
    usable,
    hasSimulation: extra.hasSimulation ?? false,
    ...(extra.realOrdersNotice ? { realOrdersNotice: extra.realOrdersNotice } : {}),
    reason
  });

  if (!input || input.loaded === false) return mk('unavailable', false, '응답 없음');

  const realStatus = input.realOrdersStatus;
  const synthStatus = input.syntheticStatus;
  const hasSummary = input.hasSummary !== false;
  // 시뮬레이션이 "화면에 실제로 들어가 있는가": 상태가 success 이고 건수가 0보다 큰 경우.
  const hasSimulation = synthStatus === 'success' && (input.syntheticOrderCount ?? 0) > 0;

  // 명시적 시험 fixture — 사용자가 시험 모드를 골랐다.
  if (realStatus === 'fixture') {
    return mk('fixture', hasSummary, '명시적 시험 모드(fixture)', { hasSimulation });
  }

  // 실제 주문 연결 실패
  if (realStatus === 'unavailable') {
    if (hasSimulation && hasSummary) {
      // 시뮬레이션은 살아 있다 → 시험 데이터로 계속 쓰되, 실제 주문 실패는 별도로 알린다.
      return mk('simulation', true, '실제 주문 연결 안 됨 · 시뮬레이션 유지', {
        hasSimulation: true,
        realOrdersNotice: input.realOrdersErrorMessage ? REAL_ORDERS_NOTICE : REAL_ORDERS_NOTICE
      });
    }
    return mk('unavailable', false, '실제 주문 연결 안 됨 · 시뮬레이션도 불가');
  }

  // 실제 주문 성공
  if (realStatus === 'success') {
    if (!hasSummary) return mk('unavailable', false, '요약 계산 불가');
    if (hasSimulation) return mk('simulation', true, '실제 + 시뮬레이션 혼재', { hasSimulation: true });
    return mk('actual', true, '실제 데이터(0건 포함)');
  }

  // 상태 미상(구버전 응답 등) → 추측하지 않는다.
  return mk('unavailable', false, '판별 불가(slice 상태 없음)');
}
