/**
 * 고객 이름 마스킹
 * - 3글자: 홍길동 -> 홍*동
 * - 2글자: 김철 -> 김*
 * - 4글자 이상: 남궁길동 -> 남궁**동
 * - 영문: John Doe -> J*** D**
 */
export const maskName = (name: string): string => {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  
  // 영문인지 체크 (공백이나 영문 위주)
  if (/^[a-zA-Z\s]+$/.test(trimmed)) {
    return trimmed.split(' ').map(part => {
      if (part.length <= 1) return part;
      return part[0] + '*'.repeat(part.length - 1);
    }).join(' ');
  }

  // 한글 등 일반 이름
  if (trimmed.length === 2) {
    return trimmed[0] + '*';
  }
  
  return trimmed[0] + '*'.repeat(trimmed.length - 2) + trimmed[trimmed.length - 1];
};

/**
 * 전화번호 마스킹
 * 010-1234-5678 -> ***-****-**** 또는 010-****-5678 등의 표준 마스킹
 * 규칙 예시에 따라 010-1234-5678 -> ***-****-**** 로 완벽 처리 (또는 중간/끝 마스킹)
 * 규칙 예시: 010-1234-5678 -> ***-****-****
 */
export const maskPhone = (phone: string): string => {
  if (!phone) return '';
  const cleaned = phone.replace(/[^0-9-]/g, '').trim();
  if (!cleaned) return '***-****-****';
  
  // 일반적인 휴대폰 형식인 경우 대입 마스킹
  // 또는 간단하게 모든 숫자를 *로 바꾸거나 규칙에 맞춘다.
  return cleaned.replace(/\d/g, '*');
};

/**
 * 이메일 마스킹
 * abc@test.com -> ab***@test.com
 * 규칙 예시: abc@test.com -> ab***@test.com (앞의 두 글자만 남기고 마스킹)
 */
export const maskEmail = (email: string): string => {
  if (!email) return '';
  const trimmed = email.trim();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return '***@****.***';
  
  const local = parts[0];
  const domain = parts[1];
  
  if (local.length <= 2) {
    return local + '***@' + domain;
  }
  
  return local.substring(0, 2) + '*'.repeat(local.length - 2) + '@' + domain;
};

/**
 * 주소 마스킹
 * 서울시 강남구 역삼동 123-45 -> 서울시 강남구 역삼동 ***
 */
export const maskAddress = (address: string): string => {
  if (!address) return '';
  const trimmed = address.trim();
  
  // 공백 기준 분할 후 뒤쪽 상세 주소 및 번지 마스킹
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 2) {
    return trimmed.substring(0, Math.floor(trimmed.length / 2)) + ' ***';
  }
  
  // 마지막 2개 토큰은 마스킹 처리
  const head = parts.slice(0, parts.length - 2).join(' ');
  return head + ' *** ***';
};

/**
 * 텍스트 내부의 개인정보 패턴을 정밀하게 탐지하여 일괄 마스킹 (Activity Log 출력용)
 */
export const maskTextAll = (text: string): string => {
  if (!text) return '';
  let result = text;
  
  // 1. 이메일 탐지 및 마스킹
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  result = result.replace(emailRegex, (match) => maskEmail(match));
  
  // 2. 전화번호 탐지 및 마스킹 (010-XXXX-XXXX, 02-XXX-XXXX 등)
  const phoneRegex = /(010|02|031|032|033|041|042|043|051|052|053|054|055|061|062|063|064)-\d{3,4}-\d{4}/g;
  result = result.replace(phoneRegex, (match) => maskPhone(match));
  
  return result;
};
