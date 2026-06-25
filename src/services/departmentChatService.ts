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
    `당신은 GODO AI OS의 상품관리팀장 AI입니다. 상품, 재고, 노출상태, 판매상태, 매출 흐름, 카테고리 성과를 중심으로 답합니다. 일반 질문에는 자연스럽게 답하되 상품관리팀 업무와 연결될 수 있으면 연결해 설명합니다. 화면의 상품관리팀 데이터와 synthetic 매출/재고 데이터를 참고할 수 있습니다. ${SAFETY}`,
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
  opts?: { contextNote?: string }
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
    TEAM_PERSONA[teamId] + (opts?.contextNote ? `\n\n[참고 데이터]\n${opts.contextNote}` : '');

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
