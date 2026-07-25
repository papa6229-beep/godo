import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendErrorResponse } from '../_shared/proxyResponse.js';

// GET /api/godomall/orders-admin — SEC-ORDERS-ADMIN-01: fail-closed 비활성화.
//
// 배경: 이 라우트는 원본 주문자 PII(이름·전화·주소)를 반환하도록 설계됐으나, 서버 인증·권한
//   기반이 없어 무인증 GET 으로 원문 PII 를 노출한다(AUDIT-01 F-1 Critical). 현재 런타임 소비자도
//   0이다(fetchAdminOrders 미배선). 따라서 마스킹 중복 API 로 유지하지 않고 fail-closed 비활성화한다.
//   - GET → 정적 403(ADMIN_ACCESS_DISABLED). records/count·PII·하부 오류 문자열을 반환하지 않는다.
//   - GET 외 메서드 → 기존 405 유지.
//   장기 원본 PII 접근은 AUTH-FOUNDATION(서버 로그인·세션·역할) 도입 후 별도 작업으로 재개한다.
//   (가짜 인증·임의 헤더·하드코딩 토큰·브라우저 sessionRole 을 인증으로 쓰지 않는다.)
export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  // fail-closed: 서버 인증 도입 전까지 원본 주문 PII 반환을 비활성화한다.
  return sendErrorResponse(
    res,
    'ADMIN_ACCESS_DISABLED',
    '관리자 주문 조회(원본 고객정보)는 서버 인증 도입 전까지 비활성화되어 있습니다.',
    403
  );
}
