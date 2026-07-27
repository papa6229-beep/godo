// 대화 기록 — 도메인 저장 경계.
//   팀별 대화(dept)와 총괄 대화(hq)는 서로 다른 저장소를 쓴다. 그 사실을 여기서 감춘다.
export { loadDeptChatLog, saveDeptChatLog } from '../departmentChatMemory';
export type { DeptChatMessage, DeptChatLog } from '../departmentChatMemory';
export { loadHqMessages, saveHqMessages, clearHqMessages, buildWelcomeMessage } from '../hqChatMemory';
