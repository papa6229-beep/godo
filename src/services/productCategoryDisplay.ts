// ────────────────────────────────────────────────────────────────────────────
// Product Category Display Helpers — 대시보드/채팅 공유 (표시 정합성)
//
// 목적: 카테고리 코드 → 사용자 친화 표시명, 그리고 share percent 포맷/반올림을
//   대시보드(ProductTeamDashboard)와 상품팀 채팅이 "동일 helper"로 쓰게 한다.
//   → 채팅이 raw code(001/003)를 노출하거나, 대시보드와 소수 표시가 어긋나지 않게 한다.
//
// 원칙: 계산 기준은 바꾸지 않는다(표시/포맷만). display name은 표시용 라벨 맵(데이터 아님).
// ────────────────────────────────────────────────────────────────────────────

// 카테고리 코드 → 화면 표시명 (표시용 라벨 맵)
// TODO: 추후 고도몰 카테고리 READ 연동 시 실제 카테고리명으로 대체
export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  uncategorized: '미분류',
  '001': '생활가전',
  '003': '주방가전',
  '006': '공기·청정',
  '007': '계절가전',
  C1: '생활가전',
  C2: '주방가전',
  C3: '공기·청정'
};

export const categoryDisplayName = (code: string): string =>
  CATEGORY_DISPLAY_NAMES[code] || (code === 'uncategorized' || !code ? '미분류' : code);

// share(비중) 포맷 — 입력은 0~1 fraction. 대시보드 pctStr와 동일 반올림/표기.
export const formatSharePercent = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;
