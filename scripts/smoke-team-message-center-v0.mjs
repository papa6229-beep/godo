#!/usr/bin/env node
/*
 * scripts/smoke-team-message-center-v0.mjs
 * 팀 간 소통 센터 — 사람 UI와 (미래) AI 에이전트가 공유하는 스토어/순수 함수 검증.
 *  1) 메시지 생성(사람/에이전트 actor 모두)
 *  2) 상태 전이(접수→진행→완료) + 이력 기록
 *  3) inbox/outbox/안읽음/미완료 카운트
 *  4) persist API(post/resolve/markInboxRead) — localStorage 목으로
 *  5) 첨부 용량 상한(대형 파일 base64 미보관, 메타만)
 *  6) 에이전트 자동 완료 경로(resolveTeamMessage를 에이전트 actor로)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// tmp 하위에서 .js 재귀 수집(교차 디렉토리 구조 보존 대응).
const walkJs = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walkJs(p) : (p.endsWith('.js') ? [p] : []);
});

const REPO = process.cwd();
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Team Message Center v0 smoke ===');

ok('types/teamMessage.ts 존재', has('src/types/teamMessage.ts'));
ok('services/teamMessageCenter.ts 존재', has('src/services/teamMessageCenter.ts'));

// localStorage 목(persist API 검증용) — 반드시 import 전에 설정.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-tmc-'));
let M = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'teamMessageCenter.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const p of walkJs(tmp)) {
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const centerJs = walkJs(tmp).find((p) => p.endsWith('teamMessageCenter.js'));
  M = await import(pathToFileURL(centerJs).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

ok('센터 런타임 로드', !!M?.postTeamMessage && !!M?.resolveTeamMessage && !!M?.inboxFor && !!M?.createTeamMessage);

if (M) {
  const NOW = '2026-07-03T00:00:00.000Z';
  const human = (teamId) => ({ kind: 'human', teamId, label: '운영자' });
  const agent = (teamId, agentId, label) => ({ kind: 'agent', teamId, label, agentId });

  // 1) 생성 — 사람(상품→CS 지원요청)
  const m1 = M.createTeamMessage({ from: human('product'), toTeam: 'cs', kind: 'support', title: '재고 문의 응대 지원', body: '품절 안내 문구 확인 부탁', attachments: [] }, NOW);
  ok('1. 생성: status=open·readByTo=false·created 이벤트', m1.status === 'open' && m1.readByTo === false && m1.events[0]?.type === 'created' && m1.toTeam === 'cs' && m1.from.teamId === 'product');
  ok('2. 제목 공백이면 "(제목 없음)"', M.createTeamMessage({ from: human('hq'), toTeam: 'product', kind: 'info', title: '   ', body: 'x' }, NOW).title === '(제목 없음)');

  // 2) 상태 전이 + 이력
  const m1b = M.setStatus(m1, 'in_progress', human('cs'), NOW);
  const m1c = M.setStatus(m1b, 'done', human('cs'), NOW);
  ok('3. 상태 전이 open→in_progress→done', m1b.status === 'in_progress' && m1c.status === 'done');
  ok('4. 상태 이력 누적(by 포함)', m1c.events.filter((e) => e.type === 'status').length === 2 && m1c.events.some((e) => e.status === 'done' && e.by.teamId === 'cs'));
  ok('5. 같은 상태로 전이는 무변경(이벤트 안 늘어남)', M.setStatus(m1c, 'done', human('cs'), NOW) === m1c);

  // 3) 열람
  const m1read = M.markRead(m1, human('cs'), NOW);
  ok('6. markRead: readByTo=true + read 이벤트', m1read.readByTo === true && m1read.events.some((e) => e.type === 'read'));
  ok('7. 이미 읽음이면 무변경', M.markRead(m1read, human('cs'), NOW) === m1read);

  // 4) inbox/outbox/카운트 (순수)
  const list = [
    M.createTeamMessage({ from: human('product'), toTeam: 'cs', kind: 'support', title: 'A', body: '' }, NOW),
    M.createTeamMessage({ from: human('hq'), toTeam: 'cs', kind: 'confirm', title: 'B', body: '' }, NOW),
    M.createTeamMessage({ from: human('cs'), toTeam: 'product', kind: 'info', title: 'C', body: '' }, NOW)
  ];
  ok('8. inboxFor(cs)=받은 2건', M.inboxFor(list, 'cs').length === 2);
  ok('9. outboxFor(cs)=보낸 1건', M.outboxFor(list, 'cs').length === 1);
  ok('10. unreadCountFor(cs)=2(미열람)', M.unreadCountFor(list, 'cs') === 2);
  const listRead = list.map((m) => (m.toTeam === 'cs' && m.title === 'A' ? M.markRead(m, human('cs'), NOW) : m));
  ok('11. 한 건 열람 후 unread=1', M.unreadCountFor(listRead, 'cs') === 1);
  const listDone = listRead.map((m) => (m.title === 'B' ? M.setStatus(m, 'done', human('cs'), NOW) : m));
  ok('12. openInboxCountFor(cs): 완료 1건 빼고 1건', M.openInboxCountFor(listDone, 'cs') === 1);

  // 5) 첨부 상한
  const big = 'd'.repeat(10);
  const over = M.createTeamMessage({ from: human('product'), toTeam: 'cs', kind: 'info', title: 'file', body: '', attachments: [{ name: 'big.csv', size: 2_000_000, mime: 'text/csv', dataUrl: `data:text/csv;base64,${big}` }] }, NOW);
  ok('13. 대형 첨부는 base64 미보관(omitted)·메타 유지', over.attachments[0].omitted === true && !over.attachments[0].dataUrl && over.attachments[0].name === 'big.csv');
  const small = M.createTeamMessage({ from: human('product'), toTeam: 'cs', kind: 'info', title: 'file', body: '', attachments: [{ name: 's.txt', size: 10, mime: 'text/plain', dataUrl: 'data:text/plain;base64,aaa' }] }, NOW);
  ok('14. 소형 첨부는 base64 보관', small.attachments[0].dataUrl?.startsWith('data:') && !small.attachments[0].omitted);

  // 6) persist API (localStorage 목) — 사람/에이전트 공용
  store.clear();
  const posted = M.postTeamMessage({ from: human('marketing'), toTeam: 'product', kind: 'support', title: '캠페인 상품 확인', body: '재고 여유 상품 알려줘' }, NOW);
  ok('15. postTeamMessage 저장 후 load로 조회됨', M.loadTeamMessages().some((m) => m.id === posted.id));
  ok('16. inbox(product)에 방금 발신 포함', M.inboxFor(M.loadTeamMessages(), 'product').some((m) => m.id === posted.id));

  // 에이전트 자동 완료 경로: 상품팀 AI 에이전트가 resolve
  const afterResolve = M.resolveTeamMessage(posted.id, 'done', agent('product', 'agent-prod-1', '상품 관리 AI'), NOW);
  const resolved = afterResolve.find((m) => m.id === posted.id);
  ok('17. 에이전트 actor로 자동 완료 저장', resolved.status === 'done' && resolved.events.some((e) => e.type === 'status' && e.by.kind === 'agent' && e.by.agentId === 'agent-prod-1'));
  ok('18. markInboxRead persist', M.markInboxRead(posted.id, human('product'), NOW).find((m) => m.id === posted.id).readByTo === true);

  // 에이전트가 발신하는 경로(자동 보고)도 동일 API
  const agentPost = M.postTeamMessage({ from: agent('cs', 'agent-cs-1', 'CS 상담 AI'), toTeam: 'hq', kind: 'info', title: '금일 문의 처리 완료 보고', body: '문의 12건 처리' }, NOW);
  ok('19. 에이전트 발신 메시지(from.kind=agent) 저장·조회', M.inboxFor(M.loadTeamMessages(), 'hq').some((m) => m.id === agentPost.id && m.from.kind === 'agent'));
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
