// ────────────────────────────────────────────────────────────────────────────
// Marketing Analysis Narrative v0 — MarketingAnalysisResult를 사람이 읽는 답변으로.
//
// deterministic(LLM 없이도 동작). 좁은 질문은 좁게 답한다(broad 관찰 미부착).
// Claude 연결 시 이 텍스트를 해석/제안으로 개선할 수 있으나, 숫자는 result에서만 온다.
// ────────────────────────────────────────────────────────────────────────────

import type { MarketingAnalysisResult, MarketingAnalysisRow } from './marketingAnalysisExecutor';

const CAVEAT = '방문자·광고비 등 외부 데이터가 없어 원인은 단정하지 않습니다(관찰값).';

function fmt(row: MarketingAnalysisRow, metric: string): string {
  const v = row.value;
  return metric === 'orderCount' ? `${v.toLocaleString()}건` : metric === 'quantity' ? `${v.toLocaleString()}개` : `${v.toLocaleString()}원`;
}

export function buildMarketingAnalysisNarrative(result: MarketingAnalysisResult): { reply: string; bullets: string[]; caveats: string[] } {
  const metric = result.plan.metric;

  if (result.unsupported) {
    const reason = result.unsupportedReason ?? '현재 고도몰 주문·상품 데이터로는 산출할 수 없는 지표입니다.';
    const reply = [
      `요청하신 분석은 현재 지원 범위 밖입니다.`,
      `- ${reason}`,
      `- 현재 지원: 매출 / 주문수 / 객단가 / 판매수량의 기간·연도·세그먼트(쿠폰·첫재구매·회원그룹·채널) 비교.`,
      `- 외부 데이터(방문/광고/ROAS 등)는 연결 후 확장됩니다.`
    ].join('\n');
    return { reply, bullets: [reason], caveats: [] };
  }

  if (!result.available || result.rows.length === 0) {
    const reply = [`${result.title || '분석'}: 해당 기간/조건에 집계할 유효 주문이 없습니다.`, `- 기간을 넓히거나 다른 조건으로 다시 질문해 주세요.`].join('\n');
    return { reply, bullets: [], caveats: [CAVEAT] };
  }

  const lines: string[] = [result.title, ''];
  const bullets: string[] = [];
  for (const r of result.rows) {
    const extra = metric !== 'orderCount' && metric !== 'quantity' ? ` (주문 ${r.orderCount.toLocaleString()}건)` : '';
    const line = `${r.label} ${result.metricLabel}: ${fmt(r, metric)}${extra}`;
    lines.push(`- ${line}`); bullets.push(line);
  }
  if (result.diff && result.rows.length >= 2) {
    const d = result.diff;
    const diffStr = metric === 'orderCount' ? `${Math.abs(d.absolute).toLocaleString()}건` : metric === 'quantity' ? `${Math.abs(d.absolute).toLocaleString()}개` : `${Math.abs(d.absolute).toLocaleString()}원`;
    lines.push('', `- 차이: ${diffStr} (${d.absolute >= 0 ? '+' : '-'}${Math.abs(d.percent)}%)`);
    // 비교 대상은 diff가 명시한 두 그룹을 쓴다(배열 첫 행·마지막 행에 의존하지 않는다).
    //   행 정렬이 바뀌어도 "미분류가 첫구매보다…" 같은 잘못된 설명이 생기지 않는다.
    const fromLabel = d.fromLabel ?? result.rows[0].label;
    const toLabel = d.toLabel ?? result.rows[result.rows.length - 1].label;
    lines.push(`- 해석: ${toLabel} 항목이 ${fromLabel}보다 ${d.direction === 'up' ? '높' : d.direction === 'down' ? '낮' : '비슷하'}게 나타납니다.`);
    if (metric === 'averageOrderValue') lines.push(`- 객단가는 기간 전체 매출 ÷ 주문수 기준입니다(월별 단순 평균 아님).`);
  }
  lines.push('', `- ${CAVEAT}`);
  return { reply: lines.join('\n'), bullets, caveats: [CAVEAT] };
}
