import type { OperationsDataSnapshot } from '../../types/dataConnector';
import type { NativeAgentDefinition } from './types';
import { defaultOperationsData } from '../../data/defaultOperationsData';
import { defaultNativeAgents } from '../../data/defaultNativeAgentRuntime';

export type ValidationScenarioType = 'normal' | 'low_stock' | 'cs_negative' | 'disabled_marketing';

export interface ScenarioResult {
  snapshot: OperationsDataSnapshot;
  agents: NativeAgentDefinition[];
  description: string;
}

export function getScenarioData(scenario: ValidationScenarioType): ScenarioResult {
  const baseSnapshot = JSON.parse(JSON.stringify(defaultOperationsData)) as OperationsDataSnapshot;
  const baseAgents = JSON.parse(JSON.stringify(defaultNativeAgents)) as NativeAgentDefinition[];

  switch (scenario) {
    case 'normal':
      // 1. 모든 재고 품목을 안전재고 이상으로 셋팅
      baseSnapshot.inventory = baseSnapshot.inventory.map(item => ({
        ...item,
        stock: item.safetyStock + 10,
        status: 'ok',
        riskFlags: []
      }));
      // 2. 미답변 문의 모두 제거
      baseSnapshot.inquiries = baseSnapshot.inquiries.map(inq => ({
        ...inq,
        status: '답변완료',
        riskFlags: []
      }));
      // 3. 부정 리뷰 평점 복구
      baseSnapshot.reviews = baseSnapshot.reviews.map(rev => ({
        ...rev,
        rating: 5,
        sentiment: 'positive',
        needsReply: false,
        riskFlags: []
      }));

      return {
        snapshot: baseSnapshot,
        agents: baseAgents,
        description: '정상 운영 상태: 재고 수량 양호, 고객 미답변 문의 없음, 평점 5점 만족 여론 형성'
      };

    case 'low_stock':
      // 1. 특정 마케팅 캠페인 후보인 '시그니처 바디 핏 기프트 세트'의 재고를 안전재고 이하로 조작
      // 그리고 다른 상품들은 모두 안전 재고 이상으로 설정해 변별력 확보
      baseSnapshot.inventory = baseSnapshot.inventory.map(item => {
        if (item.productName.includes('시그니처 바디 핏 기프트 세트') || item.productName.includes('마사지 오일')) {
          return {
            ...item,
            stock: 1,
            safetyStock: 10,
            status: 'danger',
            riskFlags: ['low_stock', 'below_safety_stock']
          };
        }
        return {
          ...item,
          stock: item.safetyStock + 10,
          status: 'ok',
          riskFlags: []
        };
      });
      // CS 리스크는 초기화
      baseSnapshot.inquiries = baseSnapshot.inquiries.map(inq => ({ ...inq, status: '답변완료', riskFlags: [] }));
      baseSnapshot.reviews = baseSnapshot.reviews.map(rev => ({ ...rev, rating: 5, sentiment: 'positive', needsReply: false, riskFlags: [] }));

      return {
        snapshot: baseSnapshot,
        agents: baseAgents,
        description: '재고 부족 시나리오: 시그니처 바디 핏 및 마사지 오일 재고 고갈 위험 ➔ 마케팅팀의 관련 캠페인 자동 배제 검증'
      };

    case 'cs_negative':
      // 1. 재고 데이터는 정상화
      baseSnapshot.inventory = baseSnapshot.inventory.map(item => ({
        ...item,
        stock: item.safetyStock + 10,
        status: 'ok',
        riskFlags: []
      }));
      // 2. CS 문의 미답변 처리
      baseSnapshot.inquiries = baseSnapshot.inquiries.map(inq => ({ ...inq, status: '답변완료', riskFlags: [] }));
      // 3. '센서티브 힐링 마사지 오일'에 대해 1점짜리 크리티컬 트러블 리뷰 추가
      baseSnapshot.reviews = [
        {
          id: 'rev-trouble-100',
          reviewDate: new Date().toISOString().split('T')[0],
          productName: '센서티브 힐링 마사지 오일 (100ml)',
          rating: 1,
          content: '피부에 붉은 반점이 일어나고 가려워요. 제품 마개 쪽에 오일 누액 누수 흔적도 있고 포장이 부실합니다. 환불해주시거나 피해보상 해주세요.',
          sentiment: 'negative',
          needsReply: true,
          riskFlags: ['low_rating', 'negative_review', 'trouble_complaint', 'needs_reply']
        }
      ];

      return {
        snapshot: baseSnapshot,
        agents: baseAgents,
        description: 'CS 부정 이슈 시나리오: 마사지 오일 피부 트러블 민원 접수 ➔ 마케팅팀의 마사지 오일 캠페인 보류 및 카피 경고 반영 검증'
      };

    case 'disabled_marketing': {
      // 데이터는 정상적이나 마케팅 부서를 disabled
      const modifiedAgents = baseAgents.map(agent => {
        if (agent.departmentId === 'marketing') {
          return {
            ...agent,
            enabled: false
          };
        }
        return agent;
      });

      return {
        snapshot: baseSnapshot,
        agents: modifiedAgents,
        description: '마케팅팀 비활성화 시나리오: 마케팅 에이전트(3인) 전체 disabled ➔ 마케팅 부서 관련 AgentJob/Result 생성 생략 검증'
      };
    }

    default:
      return {
        snapshot: baseSnapshot,
        agents: baseAgents,
        description: '기본 데모 상태'
      };
  }
}
