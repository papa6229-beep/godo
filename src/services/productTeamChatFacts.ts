// 상품관리팀 채팅 facts builder v0.7
//
// 원칙: 숫자 계산·기간 해석·필터링은 코드가 먼저 한다. Claude는 facts 안에서만 답한다.
// 입력은 상품관리팀 기준 데이터셋(RevenueResult: orders + summary + stockImpact).
// "현재 화면 기준" 질문은 dashboard view state가 채팅에 연결되어 있지 않으므로(대시보드
// 내부 state) 데이터셋 기준으로 답하되 그 사실을 guidance로 안내한다.

import type { RevenueResult } from './departmentDataService';

export interface ProductTeamFacts {
  intent: string;
  periodLabel?: string;
  facts: string[];
  answerGuidance: string;
}

const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

const MONTH_LABEL = (ym: string): string => {
  // 'YYYY-MM' → 'M월'
  const m = parseInt(ym.slice(5, 7), 10);
  return `${m}월`;
};

interface MonthAgg { ym: string; revenue: number; orders: number; units: number; }

function aggregateMonthly(revenue: RevenueResult): MonthAgg[] {
  const map = new Map<string, MonthAgg>();
  for (const o of revenue.orders) {
    const ym = (o.orderDate || '').slice(0, 7); // YYYY-MM
    if (!ym) continue;
    const cur = map.get(ym) || { ym, revenue: 0, orders: 0, units: 0 };
    cur.revenue += o.productRevenueByLines || 0;
    cur.orders += 1;
    cur.units += (o.lines || []).reduce((s, l) => s + (l.quantity || 0), 0);
    map.set(ym, cur);
  }
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

function aggregateCategory(revenue: RevenueResult): { label: string; revenue: number }[] {
  const map = new Map<string, number>();
  for (const o of revenue.orders) {
    for (const l of o.lines || []) {
      const key = l.categoryLabel || '미분류';
      map.set(key, (map.get(key) || 0) + (l.lineRevenue || 0));
    }
  }
  return [...map.entries()].map(([label, rev]) => ({ label, revenue: rev })).sort((a, b) => b.revenue - a.revenue);
}

function aggregateTopProducts(revenue: RevenueResult): { name: string; revenue: number; units: number }[] {
  const map = new Map<string, { name: string; revenue: number; units: number }>();
  for (const o of revenue.orders) {
    for (const l of o.lines || []) {
      const key = l.goodsName || l.goodsNo || '(이름 없음)';
      const cur = map.get(key) || { name: key, revenue: 0, units: 0 };
      cur.revenue += l.lineRevenue || 0;
      cur.units += l.quantity || 0;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

const dataSourceLabel = (revenue: RevenueResult): string => {
  const s = revenue.summary;
  if (s && s.syntheticOrderCount > 0 && s.realOrderCount > 0) return 'REAL 상품 + SYNTHETIC 매출/주문/재고';
  if (s && s.syntheticOrderCount > 0) return 'SYNTHETIC 매출/주문/재고';
  return 'REAL 상품 데이터';
};

// 데이터 한계(회원/세그먼트/유입 등) 질문 감지
const LIMIT_KEYWORDS = ['신규회원', '비회원', '기존회원', '충성고객', '회원', '연령', '재구매', '세그먼트', '유입', '성별', '나이'];

export function buildProductTeamChatFacts(
  userText: string,
  revenue: RevenueResult | null
): ProductTeamFacts | null {
  if (!revenue || !revenue.orders || revenue.orders.length === 0) return null;

  const t = norm(userText);
  const totalRevenue = revenue.summary?.productRevenueByLines
    ?? revenue.orders.reduce((s, o) => s + (o.productRevenueByLines || 0), 0);
  const srcLabel = dataSourceLabel(revenue);
  const baseFact = `데이터 기준: ${srcLabel}. 전체 기간 상품매출 ${won(totalRevenue)}.`;

  // 0) 데이터 한계 질문 (회원/세그먼트 등) — 없는 데이터는 없다고 안내
  if (LIMIT_KEYWORDS.some(k => t.includes(k))) {
    return {
      intent: 'data_limit',
      facts: [
        '사용자가 회원 유형/연령/재구매/세그먼트/유입 등을 질문했다.',
        '현재 상품관리팀 데이터에는 회원 유형·연령·재구매율·고객 세그먼트·유입 경로 정보가 없다.',
        '답변 가능한 범위: 상품, 매출, 주문, 판매수량, 가상 재고.',
        baseFact
      ],
      answerGuidance:
        '없는 데이터(회원/연령/재구매/세그먼트/유입)는 추측하지 말고 "현재 상품관리팀에 연결된 데이터에는 해당 정보가 아직 포함되어 있지 않습니다"라고 솔직히 안내하라. 상품/매출/주문/판매수량/가상 재고 기준으로만 답할 수 있다고 설명하라.'
    };
  }

  // 1) 현재 화면 기준 질문 (가장 먼저 — 명시적 "현재 화면" 표현이면 데이터셋 기본 기준보다 우선)
  if (t.includes('현재화면') || t.includes('지금화면') || t.includes('화면기준') || t.includes('지금선택') || t.includes('필터적용') || t.includes('선택된기간')) {
    return {
      intent: 'current_screen',
      facts: [
        '사용자가 "현재 화면 기준"을 질문했다.',
        '채팅은 대시보드의 현재 필터/기간 선택 상태를 직접 읽지 못한다(대시보드 내부 상태).',
        baseFact
      ],
      answerGuidance:
        '현재 화면의 필터 상태는 채팅에서 직접 읽을 수 없다고 솔직히 안내하라. 대신 전체 데이터셋 기준 값을 알려주고, 특정 월/카테고리를 말해주면 그 기준으로 계산해 답하겠다고 제안하라. 고도몰 관리자 확인을 권하지 마라.'
    };
  }

  // 2) 특정 월 질문
  const monthMatch = userText.match(/(\d{1,2})\s*월/);
  const isThisMonth = t.includes('이번달');
  if (monthMatch || isThisMonth) {
    const monthly = aggregateMonthly(revenue);
    let targetYm: string | undefined;
    let periodLabel: string;
    if (monthMatch) {
      const m = parseInt(monthMatch[1], 10);
      periodLabel = `${m}월`;
      targetYm = monthly.find(x => parseInt(x.ym.slice(5, 7), 10) === m)?.ym;
    } else {
      targetYm = monthly[monthly.length - 1]?.ym;
      periodLabel = targetYm ? `${MONTH_LABEL(targetYm)}(최신)` : '이번 달';
    }
    const agg = targetYm ? monthly.find(x => x.ym === targetYm) : undefined;
    if (!agg) {
      return {
        intent: 'monthly_revenue',
        periodLabel,
        facts: [
          `사용자는 ${periodLabel} 상품매출을 질문했다.`,
          `현재 데이터셋에 ${periodLabel} 데이터가 없다. (보유 월: ${monthly.map(x => MONTH_LABEL(x.ym)).join(', ') || '없음'})`,
          baseFact
        ],
        answerGuidance: `${periodLabel} 데이터가 없으면 "현재 상품관리팀 데이터에는 ${periodLabel} 매출 데이터가 없습니다"라고 안내하고, 보유한 월 목록을 알려줘라. 전체 값을 ${periodLabel} 값처럼 답하지 마라.`
      };
    }
    const pct = totalRevenue > 0 ? (agg.revenue / totalRevenue) * 100 : 0;
    return {
      intent: 'monthly_revenue',
      periodLabel,
      facts: [
        `사용자는 ${periodLabel} 상품매출을 질문했다.`,
        `${periodLabel} 상품매출: ${won(agg.revenue)} (주문 ${agg.orders}건, 판매수량 ${agg.units}개)`,
        `전체 기간 상품매출: ${won(totalRevenue)} → ${periodLabel}은 전체의 약 ${pct.toFixed(1)}%`,
        baseFact
      ],
      answerGuidance: `반드시 ${periodLabel} 값(${won(agg.revenue)})을 우선 답하라. 전체 매출을 ${periodLabel} 매출처럼 답하지 마라. 값이 있으므로 "고도몰 관리자에서 확인"하라고 하지 마라.`
    };
  }

  // 2) 월별 추이
  if (t.includes('월별') || t.includes('월간') || t.includes('추이')) {
    const monthly = aggregateMonthly(revenue);
    const lines = monthly.map(x => `${MONTH_LABEL(x.ym)}: ${won(x.revenue)} (주문 ${x.orders}건)`);
    const top = [...monthly].sort((a, b) => b.revenue - a.revenue)[0];
    const low = [...monthly].sort((a, b) => a.revenue - b.revenue)[0];
    return {
      intent: 'monthly_trend',
      facts: [
        '사용자는 월별 매출 추이를 질문했다.',
        ...lines,
        top ? `최고 매출 월: ${MONTH_LABEL(top.ym)} (${won(top.revenue)})` : '',
        low ? `최저 매출 월: ${MONTH_LABEL(low.ym)} (${won(low.revenue)})` : '',
        baseFact
      ].filter(Boolean),
      answerGuidance: '월별 리스트를 간결히 정리하고 최고/최저 월을 함께 짚어줘라. 제공된 값만 사용하라.'
    };
  }

  // 3) 카테고리 비중
  if (t.includes('카테고리') || t.includes('비중') || t.includes('구성')) {
    const cats = aggregateCategory(revenue);
    const lines = cats.map(c => {
      const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
      return `${c.label}: ${won(c.revenue)} (약 ${pct.toFixed(1)}%)`;
    });
    return {
      intent: 'category_share',
      facts: ['사용자는 카테고리별 매출 비중을 질문했다.', ...lines, baseFact],
      answerGuidance: '카테고리별 매출과 비중을 정리해 답하라. 제공된 값만 사용하라.'
    };
  }

  // 4) 상품별 매출 순위 (명시적 순위 표현만)
  if (t.includes('순위') || t.includes('랭킹') || t.includes('상위') || t.includes('top') || t.includes('베스트')) {
    const tops = aggregateTopProducts(revenue).slice(0, 8);
    const lines = tops.map((p, i) => `${i + 1}위 ${p.name}: ${won(p.revenue)} (판매 ${p.units}개)`);
    return {
      intent: 'top_products',
      facts: ['사용자는 상품별 매출 순위를 질문했다.', ...lines, baseFact],
      answerGuidance: '상품별 매출 순위를 정리해 답하라. 제공된 순위/값만 사용하라.'
    };
  }

  // 5) 재고 위험
  if (t.includes('재고') || t.includes('품절') || t.includes('위험')) {
    const risks = revenue.stockImpact
      .map(s => ({
        name: s.productName,
        stock: s.syntheticProjectedStock,
        sold: s.syntheticSoldQuantity,
        restored: s.syntheticRestoredQuantity,
        level: s.syntheticProjectedStock <= 0 ? 'danger' : s.syntheticProjectedStock <= 5 ? 'warning' : 'ok'
      }))
      .filter(r => r.level !== 'ok')
      .sort((a, b) => a.stock - b.stock);
    const lines = risks.slice(0, 12).map(r => `${r.name}: 가상 재고 ${r.stock}개 (${r.level === 'danger' ? '위험' : '주의'}, 판매 ${r.sold}/복구 ${r.restored})`);
    return {
      intent: 'stock_risk',
      facts: [
        '사용자는 재고 위험 상품을 질문했다.',
        risks.length === 0 ? '현재 가상 재고 기준 위험/주의 상품이 없다.' : `위험/주의 상품 ${risks.length}종.`,
        ...lines,
        baseFact
      ],
      answerGuidance: '가상 재고(stockImpact) 기준으로 위험/주의 상품을 정리하라. 실제 고도몰 재고가 아니라 synthetic 가상 재고 기준임을 한 번 밝혀라. 제공된 값만 사용하라.'
    };
  }

  // 7) 전체/총합 또는 일반 매출 질문
  if (t.includes('전체') || t.includes('총') || t.includes('누적') || t.includes('매출')) {
    const s = revenue.summary;
    return {
      intent: 'total_revenue',
      facts: [
        '사용자는 전체/일반 매출을 질문했다.',
        `전체 기간 상품매출: ${won(totalRevenue)}`,
        s ? `총 주문 ${s.orderCount}건(실 ${s.realOrderCount} + 가상 ${s.syntheticOrderCount}), 배송비 ${won(s.deliveryFeeTotal)}, 총주문금액 ${won(s.totalAmount)}` : '',
        baseFact
      ].filter(Boolean),
      answerGuidance: '전체 기간 기준임을 명확히 밝히고 값을 답하라. 특정 월을 원하면 말해달라고 덧붙여라. 고도몰 관리자 확인을 권하지 마라.'
    };
  }

  // 그 외 — 일반 컨텍스트만 제공
  return {
    intent: 'general',
    facts: [baseFact, '상품/매출/주문/판매수량/가상 재고 데이터를 참고해 답할 수 있다.'],
    answerGuidance: '제공된 상품관리팀 데이터 범위에서 답하라. 없는 값은 추측하지 말고 없다고 안내하라. 고도몰 관리자 확인을 권하지 마라.'
  };
}
