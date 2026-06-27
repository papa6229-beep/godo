#!/usr/bin/env node
/*
 * scripts/smoke-cs-local-state-persistence.mjs
 * CS Local State Persistence v0 검증.
 *  - csLocalStatePersistence(순수+localStorage shim): save/load/clear/sanitize/schema/broken-json.
 *  - 컴포넌트 소스: 영속 연결/초기화 버튼/WRITE 없음.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const TSX = read('src/components/CsTeamDashboard.tsx');

// localStorage shim BEFORE importing the module (module reads window at call time).
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
  }
};

const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-cspersist-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'csLocalStatePersistence.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const P = await import(pathToFileURL(path.join(tmp, 'csLocalStatePersistence.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Local State Persistence smoke ===');

ok('1+2. service + storage key', typeof P.saveCsPersistedState === 'function' && P.CS_STATE_STORAGE_KEY === 'godo_ai_os.cs_state.v0');
const empty = P.createEmptyCsPersistedState();
ok('3+4. schemaVersion + empty state', empty.schemaVersion === 0 && Array.isArray(empty.completedWorkItems) && Array.isArray(empty.approvalItems) && !!empty.customerManagement);

const state = {
  completedWorkItems: [{ id: 'cw1', originalId: 'q1', sourceType: 'inquiry', title: '결제 문의', answerText: '답변', assignee: 'CS팀장', completedAt: '2026-06-27 12:00:00', completionMethod: 'manual_reply', completionStatus: 'completed_local', stage: '처리 완료', writeStatus: 'not_connected' }],
  approvalItems: [{ id: 'caq1', source: 'cs', sourceType: 'review_reply', status: 'approved_local', title: '리뷰', answerText: '감사합니다', target: { originalId: 'rv1' }, context: {}, writeTarget: { platform: 'godomall', targetType: 'review_reply', targetId: 'rv1' }, writeStatus: 'not_connected', rejectReason: undefined, createdAt: '2026-06-27 12:00:00' }],
  assigneeByItem: { q1: 'CS팀장' },
  memoByItem: { q1: '내부 메모' },
  customerManagement: { memoByCustomerId: { cust_1: '주의 고객' }, cautionByCustomerId: { cust_1: true }, blacklistCandidateByCustomerId: { cust_1: false } }
};
P.saveCsPersistedState(state);
const loaded = P.loadCsPersistedState();
ok('5. completedWorkItems 저장/로드', loaded.completedWorkItems.length === 1 && loaded.completedWorkItems[0].answerText === '답변');
ok('6. approvalItems 저장/로드', loaded.approvalItems.length === 1 && loaded.approvalItems[0].status === 'approved_local');
ok('7. assigneeByItem 저장/로드', loaded.assigneeByItem.q1 === 'CS팀장');
ok('8. memoByItem 저장/로드', loaded.memoByItem.q1 === '내부 메모');
ok('9. customer memoByCustomerId', loaded.customerManagement.memoByCustomerId.cust_1 === '주의 고객');
ok('10. cautionByCustomerId', loaded.customerManagement.cautionByCustomerId.cust_1 === true);
ok('11. blacklistCandidateByCustomerId', loaded.customerManagement.blacklistCandidateByCustomerId.cust_1 === false);
ok('   savedAt 기록됨', typeof loaded.savedAt === 'string' && loaded.savedAt.length > 0);

// broken JSON
store.set(P.CS_STATE_STORAGE_KEY, '{ this is not json ');
ok('12. 깨진 JSON → null(앱 안 깨짐)', P.loadCsPersistedState() === null);

// schema mismatch
store.set(P.CS_STATE_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, completedWorkItems: [] }));
ok('13. schemaVersion 불일치 → null(무시)', P.loadCsPersistedState() === null && P.sanitizeCsPersistedState({ schemaVersion: 1 }) === null);

// no window/localStorage → no crash
const savedWindow = globalThis.window;
delete globalThis.window;
ok('14. window/localStorage 없는 환경 안전', P.loadCsPersistedState() === null && (P.saveCsPersistedState(state), true));
globalThis.window = savedWindow;

// clear
P.saveCsPersistedState(state);
P.clearCsPersistedState();
ok('15. clear가 key 제거', !store.has(P.CS_STATE_STORAGE_KEY) && P.loadCsPersistedState() === null);

// 16/17 복원 후 미처리 제외 / 배지 반영 가능 — 저장된 originalId/status가 보존됨
P.saveCsPersistedState(state);
const l2 = P.loadCsPersistedState();
ok('16. completed originalId 보존(미처리 제외 가능)', l2.completedWorkItems[0].originalId === 'q1');
ok('17. approval status 보존(배지 반영 가능)', l2.approvalItems[0].status === 'approved_local' && l2.approvalItems[0].target.originalId === 'rv1');

// 18. customer 기본 PII를 persisted state에 복제 저장하지 않음(서비스가 PII record를 만들지 않음)
//     → 저장 payload엔 운영자 상태(memo/toggle)만; phone/email/address 키 없음
const rawSaved = store.get(P.CS_STATE_STORAGE_KEY);
ok('18. 고객 기본 PII 복제 저장 안 함', !/phone|email|address|010-0000|@example/i.test(rawSaved));

// 컴포넌트 소스
ok('19. 실제 WRITE/네트워크 호출 없음', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX));
ok('   영속 연결(load/save/clear + useEffect)', /loadCsPersistedState/.test(TSX) && /saveCsPersistedState/.test(TSX) && /clearCsPersistedState/.test(TSX) && /useEffect/.test(TSX));
ok('   CS 로컬 상태 초기화 버튼', /CS 로컬 상태 초기화/.test(TSX) && /handleClearLocal/.test(TSX));

console.log('\n--- loaded sample ---');
console.log(JSON.stringify({ completed: l2.completedWorkItems.length, approvals: l2.approvalItems.length, assignee: l2.assigneeByItem, custCaution: l2.customerManagement.cautionByCustomerId }));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
