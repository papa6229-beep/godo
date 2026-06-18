// Secure Proxy 레벨의 1차 개인 식별 정보(PII) 마스킹/필터링 가드

// 이름 마스킹 (홍길동 -> 홍*동)
export const maskName = (name: string): string => {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= 2) {
    return trimmed.charAt(0) + '*';
  }
  return trimmed.charAt(0) + '*'.repeat(trimmed.length - 2) + trimmed.charAt(trimmed.length - 1);
};

// 휴대폰 번호 마스킹 (010-1234-5678 -> 010-****-5678)
export const maskPhone = (text: string): string => {
  if (!text) return '';
  return text.replace(/(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g, (_, p1, __, p3) => {
    return `${p1}-****-${p3}`;
  });
};

// 이메일 마스킹 (chulsoo@example.com -> ch****@example.com)
export const maskEmail = (text: string): string => {
  if (!text) return '';
  return text.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (_, p1, p2) => {
    if (p1.length <= 2) {
      return p1.charAt(0) + '*@' + p2;
    }
    return p1.substring(0, 2) + '*'.repeat(p1.length - 2) + '@' + p2;
  });
};

// 주소 마스킹 (시/도, 구/군만 남기고 이하 마스킹)
export const maskAddress = (address: string): string => {
  if (!address) return '';
  const parts = address.trim().split(/\s+/);
  if (parts.length > 2) {
    return parts.slice(0, 2).join(' ') + ' ****';
  }
  return '****';
};

// 단일 레코드 객체 단위의 PII 마스킹 처리 유틸
export const maskRecordPii = (
  record: Record<string, unknown>,
  counter: { count: number }
): Record<string, unknown> => {
  const masked = { ...record };

  // 1. 특정 필드 원본 삭제 및 마스킹 변환
  if (typeof masked.customerName === 'string') {
    masked.customerNameMasked = maskName(masked.customerName);
    delete masked.customerName; // 원본 이름 삭제
    counter.count++;
  }

  if (masked.customerPhone !== undefined) {
    delete masked.customerPhone; // 원본 번호 유출 완전 차단
    counter.count++;
  }

  if (masked.customerEmail !== undefined) {
    delete masked.customerEmail; // 원본 이메일 유출 완전 차단
    counter.count++;
  }

  if (masked.address !== undefined) {
    delete masked.address; // 원본 주소 유출 완전 차단
    counter.count++;
  }

  // 2. 텍스트 본문성 필드 내의 연락처/이메일 유형 스캔
  const textFields = ['content', 'title', 'memo'];
  textFields.forEach(field => {
    const val = masked[field];
    if (typeof val === 'string') {
      let cleaned = maskPhone(val);
      cleaned = maskEmail(cleaned);
      if (cleaned !== val) {
        masked[field] = cleaned;
        counter.count++;
      }
    }
  });

  return masked;
};

// 다중 레코드 일괄 마스킹 및 통계 산출
export const maskRecordsList = (
  records: Record<string, unknown>[]
): { maskedRecords: Record<string, unknown>[]; maskedCount: number } => {
  const counter = { count: 0 };
  const maskedRecords = records.map(r => maskRecordPii(r, counter));
  return {
    maskedRecords,
    maskedCount: counter.count
  };
};
