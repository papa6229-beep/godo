// 팀 자동 업무 정의 — 도메인 저장 경계.
//   Studio 에서 만든 업무 정의의 보관. 원시 배열 저장(saveAgentTasks)은 노출하지 않는다.
export { loadAgentTasks, subscribeAgentTasks, saveUpsertTask, saveRemoveTask, resetAgentTasks, newTaskId } from '../agentTaskStore';
