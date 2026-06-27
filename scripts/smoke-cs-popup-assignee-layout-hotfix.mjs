#!/usr/bin/env node
/*
 * scripts/smoke-cs-popup-assignee-layout-hotfix.mjs
 * CS Popup Assignee & Layout Hotfix v0 검증.
 *  - HandoffDetailModal 디스크 오타 없음
 *  - 미처리 담당직원 입력/local state, 처리완료 담당직원(미기록) fallback
 *  - 팝업 좌측 더 좁게/우측 더 넓게(.wide), 고객관리 제외, WRITE 없음
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const TSX = read('src/components/CsTeamDashboard.tsx');
const CSS = read('src/components/CsTeamDashboard.css');
const HD_TSX = read('src/components/HandoffDetailModal.tsx');
const HD_CSS = read('src/components/HandoffDetailModal.css');

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Popup Assignee & Layout Hotfix smoke ===');

// Problems 9 — 디스크 파일 정상
ok('1. HandoffDetailModal.tsx에 i1mport 없음(디스크 정상)', !/i1mport/.test(HD_TSX) && /^import React from 'react';/m.test(HD_TSX));
ok('2. HandoffDetailModal.css 첫 규칙 정상(깨진 문법 없음)', /^\.handoff-detail-overlay\s*\{/m.test(HD_CSS) && !/i1mport|^\s*i1\b/m.test(HD_CSS));

// 담당직원 필드(미처리 상세 처리 상태/메모)
ok('3. 처리 상태/메모 섹션에 담당직원 라벨', /처리 상태 \/ 메모/.test(TSX) && /<label className="cs-pop-memo-label">담당직원<\/label>/.test(TSX));
ok('4. 담당직원 placeholder/기본 옵션 존재', /담당직원 이름을 입력하세요/.test(TSX) && /CS팀장/.test(TSX));
ok('5. 담당직원 local state 구조(assigneeByItem)', /assigneeByItem/.test(TSX) && /setAssigneeByItem/.test(TSX));

// 처리완료 담당직원
ok('6. 처리완료 상세에 담당직원 표시', /담당직원/.test(TSX) && /handledBy \|\| '미기록'/.test(TSX));
ok('7. 담당직원 없으면 "미기록" fallback', /handledBy \|\| '미기록'/.test(TSX));

// 처리 이력에 담당직원
ok('8. 처리 이력/기록에 담당직원 표시', /현재 담당직원: /.test(TSX));

// 레이아웃 비율(이전 1fr/1.25fr → .wide 0.85fr/1.35fr)
ok('9. 좌측 비율 축소(.wide 좌측 0.85fr)', /\.cs-pop-body\.wide\s*{[^}]*minmax\(0,\s*0\.85fr\)/.test(CSS));
ok('10. 우측 비율 확대(.wide 우측 1.35fr)', /\.cs-pop-body\.wide\s*{[^}]*minmax\(420px,\s*1\.35fr\)/.test(CSS));
const wideCount = (TSX.match(/className="cs-pop-body wide"/g) || []).length;
const custCount = (TSX.match(/className="cs-pop-body cs-pop-body-cust"/g) || []).length;
ok('11~13. 미처리/처리완료/AI함 3개 팝업에 .wide 적용', wideCount === 2 /* CsItemPopup(미처리·AI함 공유) + CsResolvedPopup */);
ok('14. 고객관리 팝업은 .wide 아님(전용 cs-pop-body-cust) + 구조 불변', custCount === 1 && /CsCustomerProfilePopup/.test(TSX) && /블랙리스트 후보/.test(TSX));

// 안전
ok('15. 실제 WRITE/네트워크 호출 없음', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX));
ok('16. 직원 등록/직원 DB 기능 미추가', !/직원 등록|employeeDb|staffRegistr|registerEmployee/i.test(TSX));
ok('17. 좌측 카드 추가 컴팩트(padding 6px 8px)', /\.cs-pop-item\s*{[^}]*padding:\s*6px 8px/.test(CSS));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
