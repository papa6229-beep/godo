import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { EngineProvider } from '../types/engine';
import { getChatCompletion } from '../services/lmsConnector';
import { isUnanswered } from '../services/inquiryStatusContract';

export interface CSDraftResult {
  inquiryId: string;
  customerNameMasked: string;
  category: string;
  title: string;
  originalContent: string;
  cleanedContent: string;
  draftReply: string;
  modelId: string;
  latency: number;
  fallbackUsed: boolean;
  piiRemoved: boolean;
}

const CS_POLICY = `
# CS ANSWER GUIDE & PRIVACY POLICY

1. 기본 톤앤매너: 친근하면서도 전문적인 다크 테마 운영 콘솔 톤 유지.
2. 금지 단어: 불확실한 단정(확실합니다, 무조건 등), 반말체, 이모지 과다 사용 금지.
3. 개인정보 취급: 고객 이름 외 휴대폰 번호, 주소 등은 마스킹 처리(예: 010-****-1234).
4. 클레임 대처: 배송 지연 3일 이상 발생 시 무상 배송 쿠폰 지급 제안안 포함.
`;

const SYSTEM_PROMPT = `
당신은 쇼핑몰의 전문 CS 상담 AI 에이전트입니다.
제시된 CS 정책 가이드를 철저히 준수하여 고객 문의에 대한 정중하고 친절한 답변 초안을 한글로 작성해주세요.

[CS 정책 가이드]
${CS_POLICY}

[작성 규칙]
1. 답변은 반드시 4~6문장 이내로 작성하십시오.
2. 확인되지 않은 배송일이나 환불 가능 여부 등을 임의로 약속하거나 단정짓지 마십시오. (예: "내일 바로 배송됩니다", "100% 환불 가능합니다" 등 금지. 대신 "담당 부서 확인 후 안내드리겠습니다", "규정에 따라 확인 후 처리해 드리겠습니다" 등으로 표현)
3. 고객을 존중하는 정중한 경어체(합쇼체 또는 해요체)를 사용하십시오.
4. 이모지는 필요할 때만 1~2개 이내로 절제하여 사용하십시오.
`;

const FALLBACK_REPLIES: Record<string, string> = {
  '배송': '고객님, 안녕하세요. GODO AI 운영센터입니다. 문의하신 배송 사항에 대해 안내해 드립니다. 현재 운송장 등록 및 상세 이동 경로를 파악하고 있으며, 택배사 사정에 따라 배송이 다소 지연될 수 있습니다. 배송 지연이 3일 이상 이어질 경우 무료 배송 쿠폰을 지급해 드릴 예정입니다. 신속하게 확인하여 정상 배송 처리될 수 있도록 조치하겠습니다.',
  '교환/반품': '고객님, 이용에 불편을 드려 정말 죄송합니다. 제품 파손 등으로 인한 교환 및 반품 신청을 확인했습니다. 현재 신속한 환불 처리를 위해 담당 부서와 상품 상태를 대조 및 확인 중에 있습니다. 확인 과정이 끝나는 대로 신속하게 결제 수단별 환불 프로세스를 안내해 드리겠습니다.',
  '일반': '고객님, 안녕하세요. GODO AI 운영센터입니다. 남겨주신 문의글은 정상 접수되었으며 현재 담당 부서에서 상세 내용을 파악하고 있습니다. 규정에 어긋남 없이 신속하고 정확하게 확인하여 해결해 드리도록 하겠습니다. 잠시만 기다려주시면 추가 답변을 드리겠습니다.'
};

/**
 * PII 제거 및 감지 함수
 */
export function removePII(text: string): { cleaned: string; removed: boolean } {
  let cleaned = text;
  let removed = false;

  // 전화번호 정규식 (010-1234-5678, 02-123-4567, 01012345678 등)
  const phoneRegex = /(01[016789][-]?\d{3,4}[-]?\d{4})|(0[2-6][1-9][-]?\d{3,4}[-]?\d{4})/g;
  if (phoneRegex.test(cleaned)) {
    cleaned = cleaned.replace(phoneRegex, '[전화번호 마스킹]');
    removed = true;
  }

  // 이메일 정규식
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  if (emailRegex.test(cleaned)) {
    cleaned = cleaned.replace(emailRegex, '[이메일 마스킹]');
    removed = true;
  }

  // 이미 마스킹된 데이터가 존재하는지 여부도 검출
  if (text.includes('***-****-****') || text.includes('***') || text.includes('[전화번호 마스킹]') || text.includes('[이메일 마스킹]')) {
    removed = true;
  }

  return { cleaned, removed };
}

/**
 * CS 미답변 문의를 추출하고 LM Studio(또는 fallback)를 활용해 초안을 작성합니다.
 */
export async function generateCSDrafts(
  activeSnapshot: OperationsDataSnapshot,
  engineProviders: EngineProvider[]
): Promise<CSDraftResult[]> {
  // 1. 미답변 문의 최대 3건 추출 (C-4: 공통 계약, 한국어/영어 모두 인식·needs_human 제외)
  const targetInquiries = activeSnapshot.inquiries
    .filter(inq => isUnanswered(inq.status))
    .slice(0, 3);

  // 2. LM Studio 연결 설정 조회
  const lmsProvider = engineProviders.find(p => p.id === 'lms_gemma_4');
  const useRealLMS = lmsProvider && lmsProvider.status === 'connected' && lmsProvider.isEnabled;
  const endpoint = lmsProvider?.endpoint || 'http://localhost:1234/v1';
  const modelId = lmsProvider?.modelName || 'google/gemma-4-e4b';

  const results: CSDraftResult[] = [];

  for (const inq of targetInquiries) {
    const { cleaned, removed } = removePII(inq.content);
    
    let draftReply: string;
    let latency: number;
    let fallbackUsed = false;

    if (useRealLMS) {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `문의 제목: ${inq.title}\n문의 내용: ${cleaned}\n카테고리: ${inq.category}\n고객명: ${inq.customerNameMasked}\n\n이 문의에 대한 정중하고 친절한 CS 답변 초안을 4~6문장 이내로 작성해 주세요. 불확실한 배송일 및 환불 여부를 확답하지 마십시오.` }
      ];

      const completionResult = await getChatCompletion(messages, modelId, endpoint);

      if (completionResult.success && completionResult.content) {
        draftReply = completionResult.content.trim();
        latency = completionResult.latency || 0;
      } else {
        // 실제 API 호출이 실패한 경우
        fallbackUsed = true;
        const categoryKey = inq.category.includes('배송') ? '배송' : (inq.category.includes('교환') || inq.category.includes('반품') || inq.category.includes('환불') ? '교환/반품' : '일반');
        draftReply = FALLBACK_REPLIES[categoryKey] || FALLBACK_REPLIES['일반'];
        latency = 0;
      }
    } else {
      // LM Studio 연결이 활성화되지 않은 상태인 경우
      fallbackUsed = true;
      const categoryKey = inq.category.includes('배송') ? '배송' : (inq.category.includes('교환') || inq.category.includes('반품') || inq.category.includes('환불') ? '교환/반품' : '일반');
      draftReply = FALLBACK_REPLIES[categoryKey] || FALLBACK_REPLIES['일반'];
      latency = 0;
    }

    results.push({
      inquiryId: inq.id,
      customerNameMasked: inq.customerNameMasked,
      category: inq.category,
      title: inq.title,
      originalContent: inq.content,
      cleanedContent: cleaned,
      draftReply,
      modelId,
      latency,
      fallbackUsed,
      piiRemoved: removed
    });
  }

  return results;
}
