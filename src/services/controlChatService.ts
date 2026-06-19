import { getChatCompletion, getModels } from './lmsConnector';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import type { 
  ControlChatMessage, 
  ControlChatIntent, 
  ActionPlan,
  AgentDelegationResult
} from '../types/controlChat';

const DEFAULT_MODEL = 'google/gemma-4-e4b';
const DEFAULT_ENDPOINT = 'http://localhost:1234/v1';

/**
 * 룰 기반 1차 의도(Intent) 분석 및 분류
 */
function classifyIntent(text: string): ControlChatIntent {
  const normalized = text.toLowerCase().replace(/\s+/g, '');

  // 1. 운영 시작 (start_operation)
  if (
    normalized.includes('운영시작') ||
    normalized.includes('시뮬레이션시작') ||
    normalized.includes('작업시작') ||
    normalized.includes('startoperation')
  ) {
    return 'start_operation';
  }

  // 2. 승인 명령 (approval_command)
  if (
    normalized.includes('승인해') ||
    normalized.includes('승인완료') ||
    normalized.includes('거절해') ||
    normalized.includes('반려해') ||
    normalized.includes('통과시켜') ||
    normalized.includes('적용해') ||
    normalized.includes('진행해')
  ) {
    return 'approval_command';
  }

  // 3. 설정 변경 요청 (settings_change_request)
  if (
    normalized.includes('이름바꿔') ||
    normalized.includes('이름변경') ||
    normalized.includes('이름을바') ||
    normalized.includes('설정변경') ||
    normalized.includes('권한변경')
  ) {
    return 'settings_change_request';
  }

  // 4. 에이전트 호출/위임 (agent_delegation_request)
  if (
    normalized.includes('ai한테물어') ||
    normalized.includes('ai에게물어') ||
    normalized.includes('ai의견') ||
    normalized.includes('에이전트의견') ||
    normalized.includes('에이전트한테') ||
    normalized.includes('에이전트에게')
  ) {
    return 'agent_delegation_request';
  }

  // 5. 민감/위험 작업 (sensitive_action_request / confirmed_action_request)
  // 쿠폰 발급, 가격 인하, 환불 처리, 답변 등록 등
  if (
    normalized.includes('쿠폰발급') ||
    normalized.includes('쿠폰발행') ||
    normalized.includes('가격내려') ||
    normalized.includes('가격변경') ||
    normalized.includes('가격수정') ||
    normalized.includes('환불처리') ||
    normalized.includes('환불승인') ||
    normalized.includes('답변등록') ||
    normalized.includes('답글등록') ||
    normalized.includes('문자발송') ||
    normalized.includes('메일발송') ||
    normalized.includes('이메일발송') ||
    (normalized.includes('쿠폰') && normalized.includes('발급')) ||
    (normalized.includes('가격') && (normalized.includes('인하') || normalized.includes('조정') || normalized.includes('변경'))) ||
    (normalized.includes('답변') && normalized.includes('등록'))
  ) {
    // 이미 조건이 충분하고 확정 동사가 있는지는 세부 분석에서 구별
    if (
      normalized.includes('오늘부터') || 
      normalized.includes('7일') || 
      (normalized.includes('원') && normalized.includes('할인')) ||
      (normalized.includes('%') && normalized.includes('할인'))
    ) {
      return 'confirmed_action_request';
    }
    return 'sensitive_action_request';
  }

  // 6. 승인/결재 질문 (operation_question / approval_command 하위 호환)
  if (
    normalized.includes('승인대기') ||
    normalized.includes('승인큐') ||
    normalized.includes('승인해야할')
  ) {
    return 'operation_question';
  }

  // 7. 일반 운영 수치 질문 (operation_question)
  if (
    normalized.includes('주문몇건') ||
    normalized.includes('문의몇건') ||
    normalized.includes('리뷰몇건') ||
    normalized.includes('재고위험') ||
    normalized.includes('운영현황') ||
    normalized.includes('오늘매출') ||
    normalized.includes('전환율') ||
    normalized.includes('현황') ||
    normalized.includes('주문확인') ||
    normalized.includes('문의확인') ||
    normalized.includes('리뷰확인') ||
    normalized.includes('작업기록') ||
    normalized.includes('이력')
  ) {
    return 'operation_question';
  }

  // 8. 일반 대화 (small_talk)
  if (
    normalized.includes('안녕') ||
    normalized.includes('반가워') ||
    normalized.includes('누구야') ||
    normalized.includes('뭐할수') ||
    normalized.includes('뭐해') ||
    normalized.includes('오늘뭐') ||
    normalized.includes('자기소개') ||
    normalized.includes('추석') ||
    normalized.includes('명절')
  ) {
    return 'small_talk';
  }

  return 'unknown';
}

/**
 * Gemma 프롬프트에 넣을 컨텍스트 텍스트 생성
 */
function buildSystemPrompt(
  activeOperationsData: OperationsDataSnapshot,
  tasks: OperationTask[],
  approvalQueue: ApprovalItem[]
): string {
  const ordersCount = activeOperationsData.orders.length;
  const pendingInquiriesCount = activeOperationsData.inquiries.filter(i => i.status !== '답변완료').length;
  const reviewsCount = activeOperationsData.reviews.length;
  const lowStockCount = activeOperationsData.inventory.filter(i => i.status !== 'ok').length;
  const pendingApprovalsCount = approvalQueue.filter(a => a.status === 'waiting').length;
  const pendingTasksCount = tasks.filter(t => t.status === 'running' || t.status === 'pending').length;

  const contextText = `현재 쇼핑몰 운영 현황:
- 오늘 주문: ${ordersCount}건
- 미답변 문의: ${pendingInquiriesCount}건
- 리뷰 등록: ${reviewsCount}건
- 재고 위험 상품: ${lowStockCount}건
- 진행 중인 작업: ${pendingTasksCount}건
- 승인 대기 중인 작업: ${pendingApprovalsCount}건`;

  return `너는 GODO AI OS의 운영 보조 AI다.
사용자는 쇼핑몰 운영자다.
반드시 쉽고 짧은 한국어(구어체, 존댓말, ~요 체)로 친절하게 답한다.
개발자 용어(API, Route, Hybrid, Local, Model, PII, Latency, Fallback, Mock 등)는 일반 운영자가 이해하기 어려우므로 절대 쓰지 않는다.
실행 권한이 필요한 작업(가격 변경, 환불 처리, 쿠폰 발급, 고객 답변 직접 등록 등)은 AI가 임의로 직접 실행할 수 없다.
"쿠폰을 발급했습니다" 또는 "가격을 수정했습니다" 처럼 직접 처리했다고 거짓말하거나 말하지 않는다.
대신 "고객 답변 등록, 쿠폰 발급, 가격 변경, 환불, 상품 수정 등은 실제 고객과 쇼핑몰 매출에 영향을 미치므로 반드시 운영자님의 최종 승인이 필요합니다. AI가 초안이나 제안서를 만들 수 있으니 확인 후 승인해 주세요"라고 쉽고 안전하게 안내한다.
현재 단계에서는 실제 고도몰에 자동 등록되거나 발송되지 않는다는 점을 알린다.

${contextText}

응답은 친절하고, 3문장 이내로 짧고 명확하게 작성하며, 다음으로 무엇을 해야 하는지 구체적인 다음 행동 제안을 포함해야 한다.`;
}

/**
 * 4단계 권한 모델 기반 Operational Control Chat 서비스 메인 인터페이스
 */
export async function processControlChat(
  userMessage: string,
  activeOperationsData: OperationsDataSnapshot,
  tasks: OperationTask[],
  approvalQueue: ApprovalItem[]
): Promise<Partial<ControlChatMessage>> {
  const intent = classifyIntent(userMessage);
  const normalized = userMessage.toLowerCase().replace(/\s+/g, '');
  const currentTimeString = new Date().toLocaleTimeString('ko-KR', { hour12: false });

  // ==========================================
  // LEVEL 1 & 2 & 3: Gemma 호출 없이 즉시 처리 (성능 향상)
  // ==========================================

  // LEVEL 2: 운영 시작
  if (intent === 'start_operation') {
    return {
      role: 'assistant',
      content: '좋습니다. 오늘의 쇼핑몰 운영 점검을 시작하겠습니다! 실시간으로 주문, 문의, 리뷰, 재고를 파악하여 우측 오늘의 할 일 보드와 승인 대기 대기열에 결과를 채워 넣겠습니다.',
      intent,
      actionTriggered: {
        type: 'start_operation'
      },
      createdAt: currentTimeString
    };
  }

  // LEVEL 3: 승인 처리 명령
  if (intent === 'approval_command') {
    const pendingWaiting = approvalQueue.filter(a => a.status === 'waiting');
    
    if (pendingWaiting.length === 0) {
      return {
        role: 'assistant',
        content: '좋습니다. 현재 승인 대기 중인 작업이 없습니다. 오늘 처리된 작업들은 우측의 작업 기록 탭에서 안전하게 보관 중입니다.',
        intent,
        createdAt: currentTimeString
      };
    }

    const isReject = normalized.includes('거절') || normalized.includes('반려') || normalized.includes('취소');

    if (isReject) {
      if (normalized.includes('전부') || normalized.includes('모두') || normalized.includes('둘다')) {
        const namesList = pendingWaiting.map(a => a.title).join(', ');
        return {
          role: 'assistant',
          content: `반려(거절) 처리를 완료했습니다. 대기 중이던 [${namesList}] 등 총 ${pendingWaiting.length}건의 작업이 반려되었습니다.`,
          intent,
          actionTriggered: {
            type: 'reject_all'
          },
          createdAt: currentTimeString
        };
      }

      if (normalized.includes('리뷰')) {
        const reviewItem = pendingWaiting.find(a => a.title.includes('리뷰') || a.id.includes('review'));
        if (reviewItem) {
          return {
            role: 'assistant',
            content: `리뷰 답글 초안 작업을 반려 처리했습니다.`,
            intent,
            actionTriggered: {
              type: 'reject_item',
              targetId: reviewItem.id
            },
            createdAt: currentTimeString
          };
        }
      }

      if (normalized.includes('cs') || normalized.includes('답변') || normalized.includes('문의')) {
        const csItem = pendingWaiting.find(a => a.title.includes('CS') || a.title.includes('문의') || a.id.includes('inquiry'));
        if (csItem) {
          return {
            role: 'assistant',
            content: `CS 고객 문의 답변 초안 작업을 반려 처리했습니다.`,
            intent,
            actionTriggered: {
              type: 'reject_item',
              targetId: csItem.id
            },
            createdAt: currentTimeString
          };
        }
      }
    }

    // 전체 승인 요청 여부 판단
    if (normalized.includes('전부') || normalized.includes('모두') || normalized.includes('둘다') || normalized.includes('다승인')) {
      const namesList = pendingWaiting.map(a => a.title).join(', ');
      return {
        role: 'assistant',
        content: `승인 처리를 완료했습니다. 대기 중이던 [${namesList}] 등 총 ${pendingWaiting.length}건의 작업이 승인 처리되었습니다. (현재 단계에서는 실제 쇼핑몰에 자동 발송/등록되지 않으며 내부 기록용으로만 승인 완료 처리됩니다.)`,
        intent,
        actionTriggered: {
          type: 'approve_all'
        },
        createdAt: currentTimeString
      };
    }

    // 특정 항목 승인 요청 여부 판단
    if (normalized.includes('리뷰')) {
      const reviewItem = pendingWaiting.find(a => a.title.includes('리뷰') || a.id.includes('review'));
      if (reviewItem) {
        return {
          role: 'assistant',
          content: `리뷰 답글 초안 작업을 승인 처리했습니다. 해당 리뷰 답변은 내부 승인 완료로 기록되었습니다.`,
          intent,
          actionTriggered: {
            type: 'approve_item',
            targetId: reviewItem.id
          },
          createdAt: currentTimeString
        };
      }
    }

    if (normalized.includes('cs') || normalized.includes('답변') || normalized.includes('문의')) {
      const csItem = pendingWaiting.find(a => a.title.includes('CS') || a.title.includes('문의') || a.id.includes('inquiry'));
      if (csItem) {
        return {
          role: 'assistant',
          content: `CS 고객 문의 답변 초안 작업을 승인 처리했습니다. 해당 답변은 내부 승인 완료로 기록되었습니다.`,
          intent,
          actionTriggered: {
            type: 'approve_item',
            targetId: csItem.id
          },
          createdAt: currentTimeString
        };
      }
    }

    if (normalized.includes('캠페인') || normalized.includes('마케팅') || normalized.includes('제안')) {
      const marketingItem = pendingWaiting.find(a => a.title.includes('캠페인') || a.title.includes('제안') || a.id.includes('marketing'));
      if (marketingItem) {
        return {
          role: 'assistant',
          content: `재구매 캠페인 제안 작업을 승인 처리했습니다. 캠페인이 내부 승인 완료로 기록되었습니다.`,
          intent,
          actionTriggered: {
            type: 'approve_item',
            targetId: marketingItem.id
          },
          createdAt: currentTimeString
        };
      }
    }

    // 매칭되는 대상을 특정하지 못했을 때 질문
    const listString = pendingWaiting.map((a, i) => `${i + 1}. ${a.title}`).join(', ');
    return {
      role: 'assistant',
      content: `현재 승인 대기 중인 작업이 ${pendingWaiting.length}건 있습니다 (${listString}). 모두 승인하시겠습니까, 아니면 특정 항목만 지정해 승인하시겠습니까?`,
      intent,
      createdAt: currentTimeString
    };
  }

  // LEVEL 2: 설정 변경 요청 (예: 마케팅 AI 표시명 변경 등)
  if (intent === 'settings_change_request') {
    // "마케팅 AI 직원 이름을 김철수 마케팅으로 바꿔줘"
    let targetAgentId = '';
    let newName = '';

    if (normalized.includes('마케팅') || normalized.includes('marketing')) {
      targetAgentId = 'marketing_agent';
    } else if (normalized.includes('cs') || normalized.includes('상담') || normalized.includes('inquiry')) {
      targetAgentId = 'cs_agent';
    } else if (normalized.includes('리뷰') || normalized.includes('review')) {
      targetAgentId = 'review_agent';
    } else if (normalized.includes('재고') || normalized.includes('inventory')) {
      targetAgentId = 'inventory_agent';
    }

    // 이름 추출 시도 ("이름을 [이름]으로", "[이름]으로바꿔줘")
    const match = userMessage.match(/이름(?:을)?\s*['"“]?([^'"”\s]+)['"”]?\s*(?:으)?로/);
    if (match && match[1]) {
      newName = match[1];
    } else {
      const matchAlt = userMessage.match(/['"“]?([^'"”\s]+)['"”]?\s*(?:으)?로\s*(?:이름)?\s*바꿔/);
      if (matchAlt && matchAlt[1]) {
        newName = matchAlt[1];
      }
    }

    if (targetAgentId && newName) {
      const agentLabel = targetAgentId === 'marketing_agent' ? '마케팅 AI' : 
                          targetAgentId === 'cs_agent' ? 'CS 상담 AI' : 
                          targetAgentId === 'review_agent' ? '리뷰 AI' : '재고 AI';

      return {
        role: 'assistant',
        content: `좋습니다. ${agentLabel}의 표시 이름을 "${newName}"(으)로 변경 요청하셨습니다. 현재 화면에서 실제 반영을 실행합니다.`,
        intent,
        actionTriggered: {
          type: 'update_agent_name',
          targetId: targetAgentId,
          payload: { newName }
        },
        createdAt: currentTimeString
      };
    }

    return {
      role: 'assistant',
      content: '어떤 AI 직원의 이름을 어떤 이름으로 변경할지 명확히 지정해 주세요. 예: "마케팅 AI 이름을 김철수 마케팅으로 바꿔줘."',
      intent,
      createdAt: currentTimeString
    };
  }

  // LEVEL 1: 간단한 조회용 운영 수치 질문 응답 (Gemma 호출 안함)
  if (intent === 'operation_question') {
    const ordersCount = activeOperationsData.orders.length;
    const pendingInquiries = activeOperationsData.inquiries.filter(i => i.status !== '답변완료');
    const pendingApprovalsCount = approvalQueue.filter(a => a.status === 'waiting').length;
    const lowStockCount = activeOperationsData.inventory.filter(i => i.status !== 'ok').length;

    if (normalized.includes('주문') && (normalized.includes('몇건') || normalized.includes('확인'))) {
      return {
        role: 'assistant',
        content: `오늘 들어온 신규 주문은 총 ${ordersCount}건입니다. 이 중 송장번호가 없는 주문이 일부 있으니 우측 대시보드나 상세 보기에서 확인해 주세요.`,
        intent,
        createdAt: currentTimeString
      };
    }
    if (normalized.includes('문의') && (normalized.includes('몇건') || normalized.includes('미답변'))) {
      return {
        role: 'assistant',
        content: `답변을 대기 중인 고객 문의는 총 ${pendingInquiries.length}건입니다. 교환/환불 요청이 포함되어 있어 먼저 처리가 권장됩니다.`,
        intent,
        createdAt: currentTimeString
      };
    }
    if (normalized.includes('재고') || normalized.includes('품절')) {
      return {
        role: 'assistant',
        content: `현재 안전재고 수량보다 적은 품절 위험 상품은 총 ${lowStockCount}건입니다. 특히 마사지 오일의 재고 상태 점검이 시급합니다.`,
        intent,
        createdAt: currentTimeString
      };
    }
    if (normalized.includes('승인') || normalized.includes('대기')) {
      return {
        role: 'assistant',
        content: `현재 운영자의 확인을 기다리는 승인 대기 작업은 총 ${pendingApprovalsCount}건입니다. 우측의 승인 대기(Approval Queue) 리스트를 확인해 주세요.`,
        intent,
        createdAt: currentTimeString
      };
    }
    if (normalized.includes('작업기록') || normalized.includes('이력') || normalized.includes('로그')) {
      return {
        role: 'assistant',
        content: '오늘 실행된 에이전트 활동 이력과 운영자 승인 로그는 우측 상단의 [작업 기록] 탭에서 타임라인 형태로 한눈에 열람하실 수 있습니다.',
        intent,
        createdAt: currentTimeString
      };
    }
  }

  // ==========================================
  // LEVEL 4: 민감한 외부 변경 및 비용 관련 액션 제어 (Action Plan 수집)
  // ==========================================
  if (intent === 'sensitive_action_request' || intent === 'confirmed_action_request') {
    // 액션 타입 감지
    let actionType: ActionPlan['actionType'] = 'coupon_issue';
    let title = '쿠폰 발급 계획';
    
    if (normalized.includes('가격') || normalized.includes('내려') || normalized.includes('인하')) {
      actionType = 'price_update';
      title = '상품 가격 조정 계획';
    } else if (normalized.includes('환불')) {
      actionType = 'refund_process';
      title = '환불 처리 계획';
    } else if (normalized.includes('답변') || normalized.includes('등록') || normalized.includes('답글')) {
      actionType = 'reply_post';
      title = '고객 답변 등록 계획';
    }

    // 자연어 텍스트 필드 분석
    const collectedFields: Record<string, unknown> = {};
    const missingFields: string[] = [];

    if (actionType === 'coupon_issue') {
      const requiredFields = ['targetCustomerSegment', 'discountType', 'discountValue', 'startDate', 'endDate'];
      
      // 대상 고객 세그먼트
      if (normalized.includes('리페어') || normalized.includes('크림구매')) {
        collectedFields.targetCustomerSegment = '리페어 크림 구매 고객군';
      } else if (normalized.includes('신규')) {
        collectedFields.targetCustomerSegment = '신규 회원 고객군';
      }

      // 할인 유형 및 수치
      if (normalized.includes('%')) {
        collectedFields.discountType = 'percent';
        const valMatch = userMessage.match(/(\d+)\s*%/);
        if (valMatch) collectedFields.discountValue = parseInt(valMatch[1], 10);
      } else if (normalized.includes('원')) {
        collectedFields.discountType = 'fixed';
        const valMatch = userMessage.match(/(\d+)\s*원/);
        if (valMatch) collectedFields.discountValue = parseInt(valMatch[1], 10);
      }

      // 날짜 조건
      if (normalized.includes('오늘') || normalized.includes('지금부터')) {
        collectedFields.startDate = '오늘';
      }
      const daysMatch = userMessage.match(/(\d+)\s*일간/);
      if (daysMatch) {
        collectedFields.endDate = `${daysMatch[1]}일 후`;
      }

      // 최소 주문금액
      const minAmountMatch = userMessage.match(/(\d+)\s*만\s*원\s*(?:이상)?/);
      if (minAmountMatch) {
        collectedFields.minimumOrderAmount = parseInt(minAmountMatch[1], 10) * 10000;
      }

      // 누락 정보 계산
      requiredFields.forEach(f => {
        if (collectedFields[f] === undefined) missingFields.push(f);
      });

      const actionPlan: ActionPlan = {
        id: `plan-${Date.now()}`,
        actionType,
        title,
        riskLevel: 'high',
        requiredFields,
        collectedFields,
        missingFields,
        executionStatus: missingFields.length > 0 ? 'missing_required_fields' : 'api_not_connected',
        confirmationRequired: true,
        confirmedByOperator: intent === 'confirmed_action_request',
        createdAt: currentTimeString
      };

      if (missingFields.length > 0) {
        const KoreanFieldMap: Record<string, string> = {
          targetCustomerSegment: '대상 고객군',
          discountType: '할인 방식(정률/정액)',
          discountValue: '할인 비율/금액',
          startDate: '쿠폰 시작일',
          endDate: '쿠폰 종료일'
        };
        const missingKorean = missingFields.map(f => KoreanFieldMap[f] || f).join(', ');
        return {
          role: 'assistant',
          content: `쿠폰 발급을 실행하기 위해 필수 조건 중 [${missingKorean}] 정보가 부족합니다. 대상을 구체적으로 알려주시면 안전하게 진행하겠습니다. (예: "오늘부터 7일간 리페어 크림 구매 고객에게 발급해줘")`,
          intent,
          actionPlan,
          createdAt: currentTimeString
        };
      }

      // 조건 충족 시
      return {
        role: 'assistant',
        content: `요청하신 쿠폰 발급의 모든 실행 조건(대상: ${collectedFields.targetCustomerSegment}, 혜택: ${collectedFields.discountValue}${collectedFields.discountType === 'percent' ? '%' : '원'} 할인, 기간: ${collectedFields.startDate} ~ ${collectedFields.endDate})이 충분히 확인되었습니다. 하지만 현재 고도몰 API가 연동되지 않아 실제 쿠폰 발급 처리는 보류되었으며, 실행 요청 이력으로 안전하게 기록했습니다.`,
        intent,
        actionPlan,
        createdAt: currentTimeString
      };
    }

    if (actionType === 'price_update') {
      const requiredFields = ['productId', 'newPrice'];
      
      if (normalized.includes('리페어크림') || normalized.includes('리페어')) {
        collectedFields.productId = 'repair_cream_100ml';
      } else if (normalized.includes('오일') || normalized.includes('마사지')) {
        collectedFields.productId = 'massage_oil_100ml';
      }

      const priceMatch = userMessage.match(/(\d+)\s*(?:만)?\s*원/);
      if (priceMatch) {
        let price = parseInt(priceMatch[1], 10);
        if (userMessage.includes('만원')) price *= 10000;
        collectedFields.newPrice = price;
      }

      requiredFields.forEach(f => {
        if (collectedFields[f] === undefined) missingFields.push(f);
      });

      const actionPlan: ActionPlan = {
        id: `plan-${Date.now()}`,
        actionType,
        title,
        riskLevel: 'high',
        requiredFields,
        collectedFields,
        missingFields,
        executionStatus: missingFields.length > 0 ? 'missing_required_fields' : 'api_not_connected',
        confirmationRequired: true,
        confirmedByOperator: intent === 'confirmed_action_request',
        createdAt: currentTimeString
      };

      if (missingFields.length > 0) {
        return {
          role: 'assistant',
          content: '가격 변경을 진행하기 위해 어떤 상품의 가격을 얼마로 변경할지 정확히 입력해 주세요. 예: "리페어 크림 가격을 24000원으로 변경해줘."',
          intent,
          actionPlan,
          createdAt: currentTimeString
        };
      }

      return {
        role: 'assistant',
        content: `가격을 ${(collectedFields.newPrice as number).toLocaleString()}원으로 변경하려는 요청의 조건이 확인되었습니다. 다만, 실제 가격 수정을 위한 고도몰 write API가 미연동 상태이므로 상품 가격은 변경되지 않고 실행 요청 기록으로 저장되었습니다.`,
        intent,
        actionPlan,
        createdAt: currentTimeString
      };
    }

    if (actionType === 'reply_post') {
      const requiredFields = ['targetId', 'replyText'];
      
      const numMatch = userMessage.match(/(\d+)\s*번/);
      if (numMatch) {
        collectedFields.targetId = `inq-${numMatch[1]}`;
      }
      
      if (normalized.includes('등록해') || normalized.includes('등록해줘')) {
        collectedFields.replyText = '답변 초안 승인 완료 처리';
      }

      requiredFields.forEach(f => {
        if (collectedFields[f] === undefined) missingFields.push(f);
      });

      const actionPlan: ActionPlan = {
        id: `plan-${Date.now()}`,
        actionType,
        title,
        riskLevel: 'medium',
        requiredFields,
        collectedFields,
        missingFields,
        executionStatus: missingFields.length > 0 ? 'missing_required_fields' : 'api_not_connected',
        confirmationRequired: true,
        confirmedByOperator: intent === 'confirmed_action_request',
        createdAt: currentTimeString
      };

      if (missingFields.length > 0) {
        return {
          role: 'assistant',
          content: '고객 답변을 등록하기 위해 답변을 달고자 하는 문의번호나 리뷰 번호, 등록할 내용을 명확히 알려주세요.',
          intent,
          actionPlan,
          createdAt: currentTimeString
        };
      }

      return {
        role: 'assistant',
        content: `고객 문의 답변 등록에 필요한 항목이 확인되었습니다. 현재 고도몰 API 미연동으로 실제 고객 답변은 등록되지 않았으며 내부 실행 요청서로 저장되었습니다.`,
        intent,
        actionPlan,
        createdAt: currentTimeString
      };
    }
  }

  // ==========================================
  // Agent Delegation (에이전트에게 업무 지시 및 위임 결과 반환)
  // ==========================================
  if (intent === 'agent_delegation_request') {
    let targetAgentId = 'manager_agent';
    let agentLabel = '총괄 매니저 AI';
    let opinion = '';

    if (normalized.includes('마케팅') || normalized.includes('marketing')) {
      targetAgentId = 'marketing_agent';
      agentLabel = '마케팅 AI';
      opinion = '마케팅 AI 의견: 최근 리페어 크림의 매출과 긍정 리뷰 비율이 상승세에 있습니다. 7일간 유효한 20% 특별 재구매 쿠폰 발행 캠페인을 진행하면 매출 상승 효과를 극대화할 수 있을 것으로 판단합니다. 원하시면 오늘의 할 일에 작업 후보로 등록해 드리겠습니다.';
    } else if (normalized.includes('cs') || normalized.includes('상담') || normalized.includes('inquiry')) {
      targetAgentId = 'cs_agent';
      agentLabel = 'CS 상담 AI';
      opinion = 'CS 상담 AI 의견: 오늘 배송 파손 및 누액 환불 클레임이 누적 2건 발생했습니다. 파손 건은 즉시 환불 초안을 작성하여 승인을 획득하는 것이 브랜드 신뢰도 회복에 시급한 최우선 과제라고 판단합니다.';
    } else if (normalized.includes('리뷰') || normalized.includes('review')) {
      targetAgentId = 'review_agent';
      agentLabel = '리뷰 AI';
      opinion = '리뷰 AI 의견: 별점 2점 이하의 패키지 포장 훼손 불만이 평소 대비 1건 증가했습니다. 사과와 후속 포장 점검을 약속하는 정밀 답변 초안을 승인 큐에 적재해 두었으니 확인을 부탁드립니다.';
    } else if (normalized.includes('재고') || normalized.includes('inventory')) {
      targetAgentId = 'inventory_agent';
      agentLabel = '재고 AI';
      opinion = '재고 감시 AI 의견: 센서티브 마사지 오일 라벤더향의 실재고가 1개로 품절 임박 경고 상태입니다. 안전 재고 수량 5개 미만이므로 조속한 추가 발주 승인 혹은 매입 수량 입고 검토가 요망됩니다.';
    }

    const delegationResult: AgentDelegationResult = {
      id: `del-${Date.now()}`,
      requestId: `req-${Date.now()}`,
      agentId: targetAgentId,
      status: 'completed',
      summary: opinion,
      createdAt: currentTimeString
    };

    return {
      role: 'assistant',
      content: `[${agentLabel}]에게 상황 확인을 요청하여 다음과 같은 분석 결과를 받았습니다.\n\n"${opinion}"\n\n추가 지시사항이 있으시면 언제든지 편하게 말씀해 주세요.`,
      intent,
      delegationResult,
      createdAt: currentTimeString
    };
  }

  // ==========================================
  // Gemma 로컬 LLM 호출 (일상 대화, 복잡한 질문 요약 등)
  // ==========================================
  try {
    const modelsResult = await getModels(DEFAULT_ENDPOINT);
    const activeModel = (modelsResult.success && modelsResult.data && modelsResult.data.length > 0)
      ? modelsResult.data[0].id
      : DEFAULT_MODEL;

    const systemPrompt = buildSystemPrompt(activeOperationsData, tasks, approvalQueue);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    const response = await getChatCompletion(messages, activeModel, DEFAULT_ENDPOINT);

    if (response.success && response.content) {
      return {
        role: 'assistant',
        content: response.content.trim(),
        intent,
        createdAt: currentTimeString
      };
    } else {
      throw new Error(response.error || '응답 본문이 비어있습니다.');
    }
  } catch {
    // Gemma 연결 오류 시 운영자 맞춤 Fallback 응답
    if (intent === 'small_talk') {
      return {
        role: 'assistant',
        content: '안녕하세요! 무엇이든 물어보세요. 쇼핑몰의 오늘 주문 현황, 미답변 문의, 승인할 일 등을 바로 돕겠습니다.',
        intent,
        createdAt: currentTimeString
      };
    }
    return {
      role: 'assistant',
      content: '로컬 AI가 잠시 응답하지 않습니다. LM Studio가 켜져 있는지 확인해 주세요.',
      intent,
      createdAt: currentTimeString
    };
  }
}
