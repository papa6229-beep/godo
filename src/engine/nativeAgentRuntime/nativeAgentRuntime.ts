import { planJobs } from './jobPlanner';
import { executeAgentJob } from './agentExecutor';
import { aggregateTeamResults } from './teamLeadAggregator';
import { processHandoffs } from './handoffEngine';
import { orchestrateManager, type ManagerOrchestrationResult } from './managerOrchestrator';
import { defaultNativeAgents } from '../../data/defaultNativeAgentRuntime';
import type { NativeAgentRun, AgentResult, AgentArtifact, NativeAgentDefinition } from './types';
import type { OperationsDataSnapshot } from '../../types/dataConnector';
import type { EngineProvider } from '../../types/engine';

export interface NativeAgentRunOutput {
  run: NativeAgentRun;
  orchestration: ManagerOrchestrationResult;
  activityLogs: string[];
}

export async function runNativeAgentOperation(
  objective: string,
  activeSnapshot: OperationsDataSnapshot,
  engineProviders: EngineProvider[],
  customAgents?: NativeAgentDefinition[]
): Promise<NativeAgentRunOutput> {
  const runId = `run-${Date.now()}`;
  const startTime = new Date().toISOString();
  const agents = customAgents || defaultNativeAgents;

  // 1단계: jobPlanner - 부서원 에이전트 작업 리스트 기획
  const plannedJobs = planJobs(runId, objective, agents);
  const runningJobs = plannedJobs.map(job => ({
    ...job,
    status: 'running' as const,
    startedAt: startTime
  }));

  // 2단계: agentExecutor - 부서원 에이전트 병렬(async) 실행
  const executionPromises = runningJobs.map(async (job) => {
    try {
      const result = await executeAgentJob(job, activeSnapshot, engineProviders);
      const completedJob = {
        ...job,
        status: 'completed' as const,
        completedAt: new Date().toISOString()
      };
      return { job: completedJob, result, success: true };
    } catch (err: unknown) {
      const failedJob = {
        ...job,
        status: 'failed' as const,
        completedAt: new Date().toISOString()
      };
      // Fallback Result 생성
      const failedResult: AgentResult = {
        id: `res-fail-${job.assignedAgentId}-${runId}`,
        runId,
        jobId: job.id,
        agentId: job.assignedAgentId,
        departmentId: job.departmentId,
        status: 'failed',
        summary: `에이전트 실행 실패: ${err instanceof Error ? err.message : String(err)}`,
        findings: ['오류로 인해 내부 로직을 수행할 수 없습니다.'],
        recommendations: ['시스템 리로드 및 에이전트 상태 점검이 요망됩니다.'],
        handoffTargets: [],
        artifacts: [],
        riskFlags: ['에이전트_오류'],
        approvalRequired: false,
        createdAt: new Date().toISOString()
      };
      return { job: failedJob, result: failedResult, success: false };
    }
  });

  const executedData = await Promise.all(executionPromises);
  const finalJobs = executedData.map(d => d.job);
  const memberResults = executedData.map(d => d.result);

  // 3단계: teamLeadAggregator - 부서장 에이전트의 팀원 결과 종합 및 총괄 보고서 생성
  const teamLeadResults: AgentResult[] = [];
  
  const productMembers = memberResults.filter(r => r.departmentId === 'product');
  const productLead = agents.find(a => a.departmentId === 'product' && a.role === 'team_lead');
  if (productLead) {
    const aggResult = aggregateTeamResults(runId, 'product', productMembers, productLead.id);
    teamLeadResults.push(aggResult);
  }

  const csMembers = memberResults.filter(r => r.departmentId === 'cs');
  const csLead = agents.find(a => a.departmentId === 'cs' && a.role === 'team_lead');
  if (csLead) {
    const aggResult = aggregateTeamResults(runId, 'cs', csMembers, csLead.id);
    teamLeadResults.push(aggResult);
  }

  const marketingMembers = memberResults.filter(r => r.departmentId === 'marketing');
  const marketingLead = agents.find(a => a.departmentId === 'marketing' && a.role === 'team_lead');
  if (marketingLead) {
    const aggResult = aggregateTeamResults(runId, 'marketing', marketingMembers, marketingLead.id);
    teamLeadResults.push(aggResult);
  }

  // 4단계: handoffEngine - 부서 간 Handoff 조율 및 마케팅 전략 보정
  // 요약된 결과를 포함해 전체 멤버 + 팀장 결과 리스트 취합
  const allCurrentResults = [...memberResults, ...teamLeadResults];
  const handoffOutput = processHandoffs(runId, allCurrentResults);

  // 보정된 마케팅 결과 반영
  const finalResults = handoffOutput.adjustedResults;

  // 팀원들 결과물에서 생성된 아티팩트도 취합
  const allArtifacts: AgentArtifact[] = [];
  finalResults.forEach(r => {
    allArtifacts.push(...r.artifacts);
  });

  const orchestrationResult = orchestrateManager(runId, finalResults, handoffOutput.handoffs);

  // 6단계: NativeAgentRun 객체 완성
  const run: NativeAgentRun = {
    id: runId,
    status: 'completed',
    startedAt: startTime,
    completedAt: new Date().toISOString(),
    objective,
    jobs: finalJobs,
    results: finalResults,
    artifacts: allArtifacts,
    handoffs: handoffOutput.handoffs,
    managerBriefing: orchestrationResult.briefingText
  };

  // Activity Log에 출력할 초기 셋업 로깅
  const initialLogs = [
    `[Native Agent Runtime v1] 작업 오케스트레이션 시작: "${objective}"`,
    `총괄 매니저 AI가 부서별 AgentJob(${plannedJobs.length}건) 생성을 전파했습니다.`
  ];

  plannedJobs.forEach(j => {
    const agent = agents.find(a => a.id === j.assignedAgentId);
    initialLogs.push(`- [작업 배정] ${agent ? agent.name : j.assignedAgentId}에게 [${j.title}] 업무가 할당되었습니다.`);
  });

  // 에이전트 완료 로그
  memberResults.forEach(r => {
    const agent = agents.find(a => a.id === r.agentId);
    initialLogs.push(`- [완료] ${agent ? agent.name : r.agentId}가 작업을 마쳤습니다. (발견 건수: ${r.findings.length}개)`);
  });

  // 팀장 보고 완료 로그
  teamLeadResults.forEach(r => {
    const agent = agents.find(a => a.id === r.agentId);
    initialLogs.push(`- [부서 요약 완료] ${agent ? agent.name : r.agentId}가 팀원 성과를 취합하여 총괄 보고서를 작성했습니다.`);
  });

  const finalActivityLogs = [
    ...initialLogs,
    ...handoffOutput.activityLogs,
    `총괄 매니저 AI가 협업 성과 요약을 바탕으로 최종 운영 브리핑을 완성했습니다.`
  ];

  return {
    run,
    orchestration: orchestrationResult,
    activityLogs: finalActivityLogs
  };
}
