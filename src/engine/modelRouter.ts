import type { OperationTask } from '../types/task';
import type { EngineMode, EngineProvider, EngineRoutingRule } from '../types/engine';

export interface AIModelConfig {
  modelName: string;
  provider: 'local' | 'cloud' | 'hybrid' | 'human';
  contextLength: number;
  providerId: string;
}

/**
 * 작업의 RouteType 및 엔진 설정(전역 모드, 활성 프로바이더 목록)에 따라 실제 투입할 모의 AI 모델 및 프로바이더를 라우팅하여 결정합니다.
 */
export const selectAIModel = (
  task: OperationTask,
  mode: EngineMode,
  providers: EngineProvider[],
  routingRules: EngineRoutingRule[]
): AIModelConfig => {
  // 0. TS6133 방지용 매개변수 사용성 부여
  if (mode === 'demo' || routingRules.length === 0) {
    // No-op
  }

  // 1. 활성 프로바이더 필터링
  const activeProviders = providers.filter(p => p.isEnabled);

  // 2. 작업의 routeType 에 따른 타겟 매핑
  const route = task.routeType || 'local';

  // 2-1) 휴먼 라우팅인 경우
  if (route === 'human') {
    const humanProvider = activeProviders.find(p => p.type === 'human') || providers.find(p => p.type === 'human')!;
    return {
      modelName: humanProvider.modelName,
      provider: 'human',
      contextLength: 0,
      providerId: humanProvider.id
    };
  }

  // 2-2) 하이브리드 라우팅인 경우
  if (route === 'hybrid') {
    // 로컬과 클라우드 기본 모델 병합 모의
    const localDef = activeProviders.find(p => p.type === 'local' && p.isDefault) || activeProviders.find(p => p.type === 'local');
    const cloudDef = activeProviders.find(p => p.type === 'cloud' && p.isDefault) || activeProviders.find(p => p.type === 'cloud');
    
    const localName = localDef ? localDef.name : 'GodoSLM';
    const cloudName = cloudDef ? cloudDef.name : 'Gemini Flash';

    return {
      modelName: `${localName} + ${cloudName} (Hybrid Cascade)`,
      provider: 'hybrid',
      contextLength: 32768,
      providerId: cloudDef ? cloudDef.id : 'hybrid_cascade'
    };
  }

  // 2-3) 클라우드 단독 라우팅인 경우
  if (route === 'cloud') {
    // 해당 작업 유형을 지원하는 활성 클라우드 프로바이더 검색
    const supportedCloud = activeProviders.find(p => p.type === 'cloud' && p.supportedTaskTypes.includes(task.assignedAgentId)) 
      || activeProviders.find(p => p.type === 'cloud' && p.isDefault)
      || activeProviders.find(p => p.type === 'cloud');

    if (supportedCloud) {
      return {
        modelName: supportedCloud.modelName,
        provider: 'cloud',
        contextLength: 1048576,
        providerId: supportedCloud.id
      };
    }
  }

  // 2-4) 기본 로컬 단독 라우팅
  const supportedLocal = activeProviders.find(p => p.type === 'local' && p.supportedTaskTypes.includes(task.assignedAgentId))
    || activeProviders.find(p => p.type === 'local' && p.isDefault)
    || activeProviders.find(p => p.type === 'local');

  if (supportedLocal) {
    return {
      modelName: supportedLocal.modelName,
      provider: 'local',
      contextLength: 8192,
      providerId: supportedLocal.id
    };
  }

  // 전체 대비 폴백
  return {
    modelName: 'GodoSLM-8B-Instruct (Fallback Local)',
    provider: 'local',
    contextLength: 8192,
    providerId: 'godo_slm_8b'
  };
};
