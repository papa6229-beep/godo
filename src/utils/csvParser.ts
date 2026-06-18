/**
 * 간단한 RFC-4180 준수 CSV 행 파서
 * 큰따옴표로 감싸진 필드 및 줄바꿈을 안전하게 파싱합니다.
 */
export const parseCSVToRows = (text: string): string[][] => {
  const result: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let inQuotes = false;
  
  if (!text) return [];
  
  // 개행 문자 규격화 (\r\n -> \n)
  const normalizedText = text.replace(/\r\n/g, '\n');
  
  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText[i];
    const nextChar = normalizedText[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // 이중 따옴표는 따옴표 하나로 에스케이프 처리
          currentVal += '"';
          i++; // 다음 따옴표 건너뛰기
        } else {
          // 감싸는 따옴표 종료
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\n') {
        row.push(currentVal.trim());
        result.push(row);
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  
  // 마지막 필드 잔여 처리
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    result.push(row);
  }
  
  // 빈 행 필터링
  return result.filter(r => r.length > 0 && r.some(cell => cell !== ''));
};

/**
 * 첫 번째 행을 헤더로 삼아 객체 배열로 변환하는 파서 함수
 */
export const parseCSVToObjectArray = (text: string): Record<string, string>[] => {
  const rows = parseCSVToRows(text);
  if (rows.length <= 1) return [];
  
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);
  
  return dataRows.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] !== undefined ? row[index] : '';
    });
    return obj;
  });
};
