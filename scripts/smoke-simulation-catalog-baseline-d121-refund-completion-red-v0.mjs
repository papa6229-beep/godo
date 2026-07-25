#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d121-refund-completion-red-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1.2.1 — 환불 완료 근거·S29 (RED → GREEN B 해소 확인)
 *
 * ⚠️ 이 파일은 D-1.2.1 RED 진단(커밋 5f125cc)이었다. D-1.2.1 GREEN B 로 결함이 해소되어,
 *    각 [RED] fail-closed 기준이 이제 MET 임을 확인한다(exit 0). 원본 RED 결함 재현 증거는
 *    git 5f125cc 와 docs/DIAG_SIMCATALOG_D121_REFUND_COMPLETION_S29_2026-07-25.md 에 보존된다.
 *
 * 두 질문의 해소:
 *   (1) handleCompleteFl='y' 는 "처리완료"일 뿐 → 금전 환불완료로 단정하지 않음(명시 r3 만 완료).
 *   (2) S29 는 파일명 감시 → "계산 의미·기준값 회귀검사"로 대체(값-잠금).
 *
 * [FACT] = 해소 후 실제 판정 · [RED ] = fail-closed 기준(이제 MET).
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
console.log('=== SIMULATION-CATALOG-BASELINE-01 D-1.2.1 — 환불 완료 근거·S29 (RED→GREEN 해소) ===');

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd121r-'));
execFileSync(process.execPath, [TSC, path.join(REPO, 'src', 'services', 'claimEventContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) { const p = path.join(outSrc, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`))); }
const CE = await import(pathToFileURL(path.join(outSrc, 'claimEventContract.js')).href);
const C = (ev, ctx) => CE.classifyClaimEvent(ev, ctx || { paid: true });

console.log('');
console.log('  --- [FACT] 해소 후 실제 판정 ---');
const cCancel = C({ hasClaim: true, handleModes: ['c'], rawStatuses: ['c4'], handleCompleteFl: 'y', handleDt: '2026-07-01 10:00:00', requestedRefundAmount: 5000 });
F('F1. c4 + handleCompleteFl=y → 취소, refundStatus=unknown(환불완료 아님), completed 0',
  cCancel.refundStatus === 'unknown' && cCancel.completedRefundAmount === 0, `refundStatus=${cCancel.refundStatus} completed=${cCancel.completedRefundAmount}`);
F('F2. handleDt(처리완료일자)를 refundedAt 으로 쓰지 않음(비움)', !cCancel.refundedAt, `refundedAt=${cCancel.refundedAt ?? '없음'}`);
const r3 = C({ hasClaim: true, handleModes: ['r'], rawStatuses: ['r3'], requestedRefundAmount: 10000 });
F('F3. r3(환불완료 상태코드) → completed(명시 근거만 완료 인정)', r3.refundStatus === 'completed' && r3.completedRefundAmount === 10000, `r3=${r3.refundStatus}`);
const bReturn = C({ hasClaim: true, handleModes: ['b'], rawStatuses: ['b4'], handleCompleteFl: 'y', requestedRefundAmount: 8000 });
F('F4. b4 회수완료 + handleCompleteFl=y → 반품 pending(완료 아님)', bReturn.refundStatus === 'pending', `refundStatus=${bReturn.refundStatus}`);
const withTime = C({ hasClaim: true, handleModes: ['r'], rawStatuses: ['r3'], refundCompletedAt: '2026-07-03 12:00:00', requestedRefundAmount: 4000 });
F('F5. 확인된 환불완료시각(refundCompletedAt) 있을 때만 refundedAt 기록', withTime.refundedAt === '2026-07-03 12:00:00', `refundedAt=${withTime.refundedAt}`);

console.log('');
console.log('  --- [RED] fail-closed 기준 (이제 MET) ---');
R('R1. handleCompleteFl=y 단독(비-r3)은 금융 환불 완료로 단정하지 않는다', cCancel.refundStatus !== 'completed', `refundStatus=${cCancel.refundStatus}`);
R('R2. handleDt 를 환불완료일 근거 없이 refundedAt 으로 쓰지 않는다', !cCancel.refundedAt, `refundedAt=${cCancel.refundedAt ?? '없음'}`);
R('R3. 금융 환불 완료 명시 근거 없으면 completedRefundAmount 미집계(unknown 보존)', cCancel.completedRefundAmount === 0 && cCancel.refundStatus === 'unknown', `completed=${cCancel.completedRefundAmount} status=${cCancel.refundStatus}`);

console.log('');
console.log('  --- [RED] S29 값·의미 가드 전환 (이제 MET) ---');
let s29pass = false;
try { execFileSync(process.execPath, [path.join(REPO, 'scripts', 'smoke-rc2-d131-stop-request-collab-testrun-red-v0.mjs')], { cwd: REPO, stdio: 'pipe' }); s29pass = true; } catch { s29pass = false; }
R('R4. S29 가 계산 의미·기준값 값-잠금으로 통과(파일명 감시 아님)', s29pass, s29pass ? 'RC-2 전부 충족' : 'S29 실패');
let vlPass = false;
try { execFileSync(process.execPath, [path.join(REPO, 'scripts', 'smoke-simulation-catalog-baseline-d121-value-lock-green-v0.mjs')], { cwd: REPO, stdio: 'pipe' }); vlPass = true; } catch { vlPass = false; }
R('R5. 값-잠금 스모크(무보호였던 배송매출·gross·완료환불 포함) 통과', vlPass, vlPass ? '값-잠금 pass' : '값-잠금 실패');

console.log('');
console.log(`[FACT] ${fact} pass / ${factf} fail   [RED ] ${red} met / ${redx} unmet`);
rmSync(outSrc, { recursive: true, force: true });
if (factf > 0) { console.log('\n✗ 관찰 불일치'); process.exit(1); }
if (redx > 0) { console.log(`\n✗ ${redx}건 미충족`); process.exit(1); }
console.log('\n✓ D-1.2.1 해소 확인 — 환불완료 fail-closed · S29 값·의미 가드 전환(GREEN B).');
