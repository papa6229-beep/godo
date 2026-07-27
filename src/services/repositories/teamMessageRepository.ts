// 팀 간 소통 — 도메인 저장 경계.
//   지원/확인 요청과 완료 처리. 사람 UI 와 에이전트 런타임이 같은 연산을 쓴다.
//   원시 저장 연산(saveTeamMessages)은 노출하지 않는다.
export {
  loadTeamMessages, subscribeTeamMessages,
  inboxFor, outboxFor, unreadCountFor, openInboxCountFor,
  postTeamMessage, resolveTeamMessage, markInboxRead, markRead, setStatus
} from '../teamMessageCenter';
export type { CreateTeamMessageInput } from '../teamMessageCenter';
