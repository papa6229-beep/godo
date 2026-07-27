// 활동 원장 — 도메인 저장 경계.
//   "누가·언제·무엇을 했는가"의 기록. 화면은 이 facade 만 쓴다.
//   원시 저장 연산(saveActivity)은 노출하지 않는다 — 기록은 logActivity 로만 남긴다.
export { loadActivity, subscribeActivity, activityForTeam, activitySince, teamSummary, allTeamsSummary, logActivity } from '../activityLedger';
export type { LogActivityInput } from '../activityLedger';
