// CS 업무 상태 — 도메인 저장 경계.
//   답변 초안·검수 대기실·완료 처리의 로컬 상태. 스키마 버전 관리는 어댑터가 한다.
export { loadCsPersistedState, saveCsPersistedState, clearCsPersistedState, createEmptyCsPersistedState } from '../csLocalStatePersistence';
export type { CsPersistedStateV0, CsCustomerManagementPersist } from '../csLocalStatePersistence';
