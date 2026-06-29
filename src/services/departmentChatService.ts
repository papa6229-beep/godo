// 부서 업무 관장 — 팀별 AI 팀장 채팅 v0
//
// 선택된 팀의 lead agent → brain(기본 AI 따라가기, 현재 Claude) → chatWithProvider.
// 팀별 페르소나(상품/CS/마케팅/총괄)로 시스템 프롬프트를 구성한다.
// 실제 고도몰 write/발송/캠페인 실행은 하지 않는다(초안·정리·분석까지만).

import type { DeptTeamId } from './departmentChatMemory';
import { resolveAgentBrain, isBrainConnected, providerLabel } from './aiBrainSettings';
import { chatWithProvider } from './aiProviderAdapter';

// 팀 → lead agent id (legacy Agent id 기준: manager/product/cs/marketing)
const TEAM_AGENT: Record<DeptTeamId, string> = {
  hq: 'manager',
  product: 'product',
  cs: 'cs',
  marketing: 'marketing'
};

const SAFETY = '실제 외부 실행(고객 답변 발송, 상품 수정, 캠페인 실행, 외부 게시, 고도몰 쓰기)은 하지 않습니다. 그런 작업이 필요하면 "이 작업은 실행 전 승인이 필요합니다. 우선 초안으로 정리해드릴게요"라고 안내하고 초안·정리·분석까지만 제공합니다. 한국어 존댓말로 자연스럽게 답합니다.';

const TEAM_PERSONA: Record<DeptTeamId, string> = {
  product:
    `당신은 GODO AI OS의 상품관리팀장 AI입니다. 상품·매출·재고·카테고리·상품순위 질문에는 아래 [참고 데이터]의 facts를 최우선으로 사용해 답합니다(숫자를 임의로 추측하지 마세요).\n` +
    `- 상품관리팀 채팅의 기본 기준은 현재 화면이 아니라 상품관리팀에 연결된 기준 데이터셋입니다.\n` +
    `- 사용자가 특정 월/기간을 물으면 반드시 해당 기간 값만 우선 답하세요. 전체 매출은 사용자가 전체/총합/누적을 물었을 때만 답하세요.\n` +
    `- facts에 값이 있으면 "고도몰 관리자에서 직접 확인/조회"하라고 하지 마세요. 값이 없으면 "현재 GODO 상품관리팀 데이터에는 해당 값이 없습니다"라고 말하세요. GODO 밖 관리자 화면 확인을 기본 안내로 쓰지 마세요.\n` +
    `- 없는 데이터(회원/연령/재구매/세그먼트/유입 등)는 추측하지 말고 없다고 솔직히 안내하세요.\n` +
    `${SAFETY}`,
  cs:
    `당신은 GODO AI OS의 CS팀장 AI입니다. 고객 문의, 리뷰, 배송 이슈, 답변 대기, 주의 필요 항목을 중심으로 답합니다. 현재 CS 데이터는 아직 연결 전(placeholder)일 수 있으니, 그럴 경우 그 사실을 숨기지 말고 안내한 뒤 답변 초안·분류 기준·처리 방식을 제안합니다. 실제 고객 답변 발송은 하지 않고 초안 작성·정리까지만 합니다. ${SAFETY}`,
  marketing:
    `당신은 GODO AI OS의 마케팅팀장 AI입니다. 매출 흐름, 상품 성과, 캠페인 후보, 콘텐츠 아이디어, 쿠폰/프로모션 전략을 중심으로 답합니다. 상품관리팀 매출/상품 성과를 참고해 캠페인 아이디어를 제안할 수 있습니다. 실제 게시/발송/캠페인 실행은 하지 않고 기획안·초안까지만 합니다. ${SAFETY}`,
  hq:
    `당신은 GODO AI OS의 총괄팀 AI입니다. 부서별 업무 상태, 승인 대기, 오늘 할 일, 팀 간 전달 흐름을 조율합니다. 부서 업무 관장 화면에 맞춰 실무적인 업무 지시와 정리를 수행합니다. ${SAFETY}`
};

export interface TeamChatResult {
  ok: boolean;
  text: string;
}

export async function chatWithTeam(
  teamId: DeptTeamId,
  userText: string,
  opts?: { contextNote?: string; answerGuidance?: string }
): Promise<TeamChatResult> {
  const agentId = TEAM_AGENT[teamId];
  const brain = resolveAgentBrain(agentId);

  if (!isBrainConnected(brain.providerId)) {
    const label = brain.label || providerLabel(brain.providerId);
    return {
      ok: false,
      text: `현재 기본 AI ${label} 연결 키가 필요합니다. 관리자 설정 → AI Providers에서 ${label}를 연결해 주세요.`
    };
  }

  const systemPrompt =
    TEAM_PERSONA[teamId] +
    (opts?.contextNote ? `\n\n[참고 데이터]\n${opts.contextNote}` : '') +
    (opts?.answerGuidance ? `\n\n[답변 지침]\n${opts.answerGuidance}` : '');

  const result = await chatWithProvider({
    providerId: brain.providerId,
    modelIdOverride: brain.modelId || undefined,
    purpose: 'agent_run',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText }
    ]
  });

  if (result.ok && result.content) {
    return { ok: true, text: result.content.trim() };
  }
  return { ok: false, text: 'AI 응답에 실패했습니다. 연결 키와 사용할 모델을 확인해 주세요.' };
}

// Marketing LLM Planner Adapter용 LLM 호출부(주입형). 분석 "계획 JSON"만 받는다(숫자 생성 금지).
//   - 브레인 미연결 시 throw → adapter가 deterministic planner로 안전 fallback.
//   - 신규 API route/네트워크 추가 없음(기존 chatWithProvider 재사용).
export async function callMarketingPlannerLlm(prompt: string): Promise<string> {
  const brain = resolveAgentBrain(TEAM_AGENT.marketing);
  if (!isBrainConnected(brain.providerId)) throw new Error('marketing planner LLM: brain not connected');
  const result = await chatWithProvider({
    providerId: brain.providerId,
    modelIdOverride: brain.modelId || undefined,
    purpose: 'agent_run',
    messages: [
      { role: 'system', content: '너는 GODO 마케팅 분석 플래너다. 오직 분석 계획 JSON 하나만 출력한다. 매출/주문수/객단가/전환율 등 숫자 결과는 절대 만들지 않는다.' },
      { role: 'user', content: prompt }
    ]
  });
  if (!result.ok || !result.content) throw new Error('marketing planner LLM: empty response');
  return result.content;
}
