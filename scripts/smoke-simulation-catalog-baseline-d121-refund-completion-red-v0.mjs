#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d121-refund-completion-red-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1.2.1 — 환불 완료 근거·S29 보호력 (RED 진단)
 *
 * 제품 소스 수정 없음. 현재 claimEventContract 분류기를 조합 fixture로 직접 실행하고,
 * S29 를 재현한다. 두 핵심 질문을 진단한다:
 *   (1) handleCompleteFl='y' 가 "처리 완료"인가 "실제 금전 환불 완료"인가 — 현재는 후자로 단정.
 *   (2) S29 가 계산식 의미 가드인가 파일명 가드인가 — 커밋 기반 파일 트리wire(의미 미검증).
 *
 * 업무 기준(fail-closed): 취소 완료 ≠ 환불 완료 · 반품 접수/회수완료(b4) ≠ 환불 완료 ·
 *   실제 돈 반환의 "명시적 근거"가 있어야만 완료 집계 · handleCompleteFl/handleDt 의 금융 의미가
 *   저장소 근거로 확정되지 않으면 처리완료로 취급하고 환불완료는 fail-closed · unknown ≠ 0.
 *
 * [FACT] = 현재 실제 판정(관찰) · [RED ] = fail-closed 기준(현재 미충족). GREEN 미구현이라 exit 1.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
let fact = 0, factf = 0, red = 0, redx = 0;
const F = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [FACT] ${n}${d ? `  — ${d}` : ''}`); ok ? fact++ : factf++; };
const R = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${d ? `  — ${d}` : ''}`); ok ? red++ : redx++; };
console.log('=== SIMULATION-CATALOG-BASELINE-01 D-1.2.1 — 환불 완료 근거·S29 (RED 진단) ===');

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd121r-'));
execFileSync(process.execPath, [TSC, path.join(REPO, 'src', 'services', 'claimEventContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) { const p = path.join(outSrc, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`))); }
const CE = await import(pathToFileURL(path.join(outSrc, 'claimEventContract.js')).href);
const C = (ev, ctx) => CE.classifyClaimEvent(ev, ctx || { paid: true });

console.log('');
console.log('  --- [FACT] 현재 분류기 실제 판정(조합) ---');
const cCancel = C({ hasClaim: true, handleModes: ['c'], rawStatuses: ['c4'], handleCompleteFl: 'y', handleDt: '2026-07-01 10:00:00', requestedRefundAmount: 5000 });
F('F1. c4 + handleCompleteFl=y → 취소가 refundStatus=completed 로 단정(완료금액 합산)',
  cCancel.refundStatus === 'completed' && cCancel.completedRefundAmount === 5000, `refundStatus=${cCancel.refundStatus} completed=${cCancel.completedRefundAmount}`);
F('F2. handleDt(처리완료일자)가 refundedAt(환불완료일)으로 표기됨',
  cCancel.refundedAt === '2026-07-01 10:00:00', `refundedAt=${cCancel.refundedAt}`);
const bReturn = C({ hasClaim: true, handleModes: ['b'], rawStatuses: ['b4'], handleCompleteFl: 'y', requestedRefundAmount: 8000 });
F('F3. b4 회수완료 + handleCompleteFl=y (r3 없음) → 반품 pending(완료 아님) [현행 옳음·보존]',
  bReturn.refundStatus === 'pending' && bReturn.completedRefundAmount === 0, `refundStatus=${bReturn.refundStatus}`);
const r3 = C({ hasClaim: true, handleModes: ['r'], rawStatuses: ['r3'], requestedRefundAmount: 10000 });
const r1 = C({ hasClaim: true, handleModes: ['r'], rawStatuses: ['r1'], requestedRefundAmount: 9000 });
F('F4. r3 환불완료 → completed · r1 환불접수 → unknown(완료 아님)',
  r3.refundStatus === 'completed' && r1.refundStatus === 'unknown', `r3=${r3.refundStatus} r1=${r1.refundStatus}`);
const cHandleDtOnly = C({ hasClaim: true, handleModes: ['c'], rawStatuses: ['c4'], handleDt: '2026-07-01 10:00:00', requestedRefundAmount: 6000 });
F('F5. cancel + handleDt만(completeFl·r3 없음) → unknown, completed 0, refundedAt 없음 [현행 옳음]',
  cHandleDtOnly.refundStatus === 'unknown' && cHandleDtOnly.completedRefundAmount === 0 && !cHandleDtOnly.refundedAt, `refundStatus=${cHandleDtOnly.refundStatus} refundedAt=${cHandleDtOnly.refundedAt ?? '없음'}`);
const partial = C({ hasClaim: true, handleModes: ['r'], rawStatuses: ['r1'], requestedRefundAmount: 3000 });
F('F6. 부분환불 금액有·완료근거無 → unknown(0으로 완료 단정 안 함)',
  partial.refundStatus === 'unknown' && partial.completedRefundAmount === 0, `refundStatus=${partial.refundStatus}`);

console.log('');
console.log('  --- [RED] fail-closed 기준 (현재 미충족) ---');
R('R1. handleCompleteFl=y 단독(비-r3)은 금융 환불 완료로 단정하지 않아야 한다(처리완료→unknown/pending)',
  cCancel.refundStatus !== 'completed', `현재 c4+completeFl=y refundStatus=${cCancel.refundStatus} (기대: completed 아님)`);
R('R2. handleDt(처리완료일자)를 환불완료일 근거 없이 refundedAt 으로 쓰지 않아야 한다',
  !cCancel.refundedAt, `현재 refundedAt=${cCancel.refundedAt} (기대: 없음)`);
R('R3. 금융 환불 완료 명시 근거 없으면 completedRefundAmount 미집계(unknown 보존)',
  cCancel.completedRefundAmount === 0, `현재 completedRefundAmount=${cCancel.completedRefundAmount} (기대 0=미집계)`);

console.log('');
console.log('  --- [FACT] S29 재현(파일 트리wire·의미 미검증) ---');
let s29fail = false, s29line = '';
try { execFileSync(process.execPath, [path.join(REPO, 'scripts', 'smoke-rc2-d131-stop-request-collab-testrun-red-v0.mjs')], { cwd: REPO, stdio: 'pipe' }); }
catch (e) { s29fail = true; s29line = String(e.stdout || '').split('\n').filter((l) => /S29/.test(l)).pop() || ''; }
F('F7. RC-2 S29 현재 실패(계산 인접 파일 커밋 변경 감지) 재현', s29fail, s29line.trim().slice(0, 80));
const changed = execFileSync('git', ['diff', '--name-only', 'd4334f38bee1125553e26b392ccf30420ea58c23', 'HEAD'], { cwd: REPO }).toString().split('\n').filter(Boolean);
const s29hits = changed.filter((f) => /departmentDataService|godomallRevenue|godomallMapper|inquiryStatusContract|commerceDataQueryEngine/.test(f));
F('F8. S29 감지 파일 = departmentDataService·godomallRevenue (D-1.2 claim 작업, 계산식 아님)',
  s29hits.length === 2 && s29hits.some((f) => /departmentDataService/.test(f)) && s29hits.some((f) => /godomallRevenue/.test(f)), s29hits.join(', '));

console.log('');
console.log(`[FACT] ${fact} pass / ${factf} fail   [RED ] ${red} met / ${redx} unmet`);
rmSync(outSrc, { recursive: true, force: true });
if (factf > 0) { console.log('\n✗ 관찰 불일치'); process.exit(1); }
if (redx > 0) { console.log(`\n✗ RED — 환불 완료 근거 fail-closed ${redx}건 미충족(GREEN B 대기).`); process.exit(1); }
console.log('\n✓ (예상외) 전 기준 충족');
