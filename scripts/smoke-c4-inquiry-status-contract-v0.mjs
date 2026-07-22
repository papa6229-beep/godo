#!/usr/bin/env node
/*
 * scripts/smoke-c4-inquiry-status-contract-v0.mjs
 * RC-1 C-4 문의 상태 정규화 계약 — RED→GREEN.
 *
 * 계약(사장 확정) canonical: unanswered / in_progress / on_hold / needs_human / answered / unknown
 *   미답변 = unanswered만 · 관리자확인필요 = needs_human만 · 답변완료 = answered만
 *   미처리(unresolved) = unanswered + in_progress + on_hold + needs_human + unknown
 *   unknown = 해석 못한 원시상태. answered/ok로 처리 금지, unanswered로 뭉개기 금지,
 *     별도 수량 + 원시값 근거 보존. 미처리·attention에는 포함.
 * 입력 경계 정규화(알려진 별칭만, 추측 매핑 금지, 대소문자·공백만 정리):
 *   unanswered/pending/open/미답변 → unanswered
 *   in_progress/processing/처리중 → in_progress
 *   hold/on_hold/보류 → on_hold
 *   needs_human → needs_human
 *   answered/resolved/closed/done/답변완료/처리완료 → answered
 *   그 외·빈 값·새 값 → unknown
 * 판정근거 보존: canonicalStatus · rawStatus · normalizationReason.
 *
 * 소비자는 원시 문자열 비교를 복붙하지 말고 공통 normalizeInquiryStatus/summarizeInquiryStatus 사용.
 * 현재 결함(값으로 재현): analytics 미답변('===unanswered' literal) vs CS 대시보드(정규식, needs_human 포함) 발산.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'c4-'));
const hasContract = existsSync(path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts'));
const hasProv = existsSync(path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts'));
const entries = [
  path.join(REPO, 'src', 'services', 'analyticsQueryEngine.ts'),
  path.join(REPO, 'src', 'services', 'csTeamDashboardFacts.ts'),
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  path.join(REPO, 'src', 'services', 'csDraftRuntime.ts'),
  ...(hasContract ? [path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts')] : []),
  ...(hasProv ? [path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts')] : [])
];
try {
  execFileSync(process.execPath, [tscBin, ...entries,
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const A = await import(pathToFileURL(path.join(tmp, 'analyticsQueryEngine.js')).href);
const CS = await import(pathToFileURL(path.join(tmp, 'csTeamDashboardFacts.js')).href);
const DS = await import(pathToFileURL(path.join(tmp, 'departmentDataSourceOfTruth.js')).href);
const CD = await import(pathToFileURL(path.join(tmp, 'csDraftRuntime.js')).href);
let IS = null;
if (hasContract && existsSync(path.join(tmp, 'inquiryStatusContract.js'))) {
  try { IS = await import(pathToFileURL(path.join(tmp, 'inquiryStatusContract.js')).href); } catch { IS = null; }
}
let PROV = null;
if (hasProv && existsSync(path.join(tmp, 'dataSourceProvenanceContract.js'))) {
  try { PROV = await import(pathToFileURL(path.join(tmp, 'dataSourceProvenanceContract.js')).href); } catch { PROV = null; }
}

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}`); c ? baseP++ : baseF++; };
const red = (n, c, cur) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? '' : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== C-4 문의 상태 정규화 계약 (RED→GREEN) ===');

// ── fixture: 모든 원시 상태 + 대소문자/공백 변형 + 빈 값/undefined/미지값 ──
const RAW = ['unanswered', '  Unanswered  ', 'pending', 'open', '미답변', 'in_progress', '처리중', 'hold', '보류', 'needs_human', 'answered', 'resolved', 'closed', 'done', '답변완료', '처리완료', '', undefined, 'ZZUNKNOWN'];
const inquiries = RAW.map((s, i) => ({ inquiryId: `Q${i}`, status: s, topic: 'delivery', urgency: 'low', createdAt: '2025-06-10' }));

// ── 계약(목표) 정의 — 테스트 내 순수(소비자 재구현 아님, 목표 기준) ──
const norm = (raw) => {
  if (raw === undefined || raw === null) return { c: 'unknown', reason: 'empty' };
  const s = String(raw).trim();
  if (s === '') return { c: 'unknown', reason: 'empty' };
  const l = s.toLowerCase();
  const alias = {
    unanswered: 'unanswered', pending: 'unanswered', open: 'unanswered', '미답변': 'unanswered',
    in_progress: 'in_progress', processing: 'in_progress', '처리중': 'in_progress',
    hold: 'on_hold', on_hold: 'on_hold', '보류': 'on_hold',
    needs_human: 'needs_human',
    answered: 'answered', resolved: 'answered', closed: 'answered', done: 'answered', '답변완료': 'answered', '처리완료': 'answered'
  };
  const c = alias[l] ?? alias[s]; // 영문은 lower, 한글은 원문
  return c ? { c, reason: 'known_alias' } : { c: 'unknown', reason: 'unrecognized' };
};
const canon = inquiries.map((q) => norm(q.status).c);
const cn = (x) => canon.filter((c) => c === x).length;
const cUnanswered = cn('unanswered'), cInprog = cn('in_progress'), cHold = cn('on_hold'), cNeeds = cn('needs_human'), cAnswered = cn('answered'), cUnknown = cn('unknown');
const cUnresolved = cUnanswered + cInprog + cHold + cNeeds + cUnknown; // 미처리
const total = inquiries.length;

// ── [BASE] 계약 목표값 정합 ──
base('B1. 합 = 19', cUnanswered + cInprog + cHold + cNeeds + cAnswered + cUnknown === total && total === 19);
base('B2. 미답변(unanswered)=5 · in_progress=2 · on_hold=2 · needs_human=1 · answered=6 · unknown=3', cUnanswered === 5 && cInprog === 2 && cHold === 2 && cNeeds === 1 && cAnswered === 6 && cUnknown === 3);
base('B3. 미처리=13(unanswered+in_progress+on_hold+needs_human+unknown) · unknown 미처리에 포함', cUnresolved === 13);
base('B4. needs_human은 미답변 아님(별도), unknown은 answered 아님', norm('needs_human').c === 'needs_human' && norm('needs_human').c !== 'unanswered' && norm('ZZUNKNOWN').c === 'unknown');
base('B5. 대소문자·공백 정리: "  Unanswered  " → unanswered', norm('  Unanswered  ').c === 'unanswered');
// idempotent: 이미 canonical인 값을 다시 넣어도 같은 canonical (계약 조건)
base('B6. idempotent: canonical 재입력 시 동일 canonical', ['unanswered', 'in_progress', 'on_hold', 'needs_human', 'answered', 'unknown'].every((c) => norm(c).c === c));

// ── [RED] 공통 계약 모듈 ──
red('R1. inquiryStatusContract 존재(normalize/summarize/판정)', !!IS && typeof IS.normalizeInquiryStatus === 'function' && typeof IS.summarizeInquiryStatus === 'function', IS ? 'export 일부 없음' : '모듈 없음');
if (IS && typeof IS.summarizeInquiryStatus === 'function') {
  const sum = IS.summarizeInquiryStatus(inquiries.map((q) => q.status));
  red('R2. summarizeInquiryStatus = 계약(미답변5·미처리13·needs1·answered6·unknown3·attention13)',
    sum.unanswered === 5 && sum.unresolved === 13 && sum.needsHuman === 1 && sum.answered === 6 && sum.unknown === 3 && sum.attention === 13, JSON.stringify(sum));
  const r1 = IS.normalizeInquiryStatus('  Unanswered  '), r2 = IS.normalizeInquiryStatus(''), r3 = IS.normalizeInquiryStatus('ZZUNKNOWN'), r4 = IS.normalizeInquiryStatus('needs_human');
  red('R3. normalize 근거 보존(canonicalStatus·rawStatus·normalizationReason) + unknown 분리',
    r1.canonicalStatus === 'unanswered' && r1.rawStatus === '  Unanswered  ' && r1.normalizationReason === 'known_alias' && r2.canonicalStatus === 'unknown' && r2.normalizationReason === 'empty' && r3.canonicalStatus === 'unknown' && r3.normalizationReason === 'unrecognized' && r4.canonicalStatus === 'needs_human',
    `r1=${r1.canonicalStatus}/${r1.normalizationReason} r3=${r3.normalizationReason}`);
} else { red('R2. summarize 계약 일치', false, '모듈 없음'); red('R3. normalize 근거 보존', false, '모듈 없음'); }

// ── 소비자 현재 값 ──
const ds = { orders: [], inquiries, reviews: [], source: { dataKind: 'synthetic' } };
const anRes = A.runAnalyticsQuery(ds, { metric: 'unansweredInquiryCount' });
const anUnanswered = anRes?.rows?.[0]?.value ?? anRes?.summary?.total ?? -1;
const csFacts = CS.buildCsDashboardFacts({ inquiries, reviews: [], orders: [] });
const csUnanswered = csFacts?.kpis?.unansweredCount ?? -1;
console.log(`  · analytics 미답변 = ${anUnanswered} (계약 ${cUnanswered}) · CS 대시보드 미답변 = ${csUnanswered} (계약 ${cUnanswered})`);

// ── [RED] 소비자 값이 공통 계약과 일치 ──
red('R4. analytics unansweredInquiryCount(라벨 미답변) = 계약 미답변 5 (literal 과소집계 해소)', anUnanswered === cUnanswered, anUnanswered);
red('R5. CS 대시보드 unansweredCount(라벨 미답변) = 계약 미답변 5 (needs_human 제외)', csUnanswered === cUnanswered, csUnanswered);
red('R6. analytics 미답변 = CS 미답변 (같은 라벨 = 같은 값)', anUnanswered === csUnanswered && anUnanswered === cUnanswered, `analytics=${anUnanswered}·CS=${csUnanswered}`);

// !isAnswered 스킴 대표: departmentDataSourceOfTruth (라벨 '미처리' → 기대값 13, 5 아님)
const snap = DS.buildDepartmentSourceOfTruthSnapshot({ orders: [], summary: null, universeAux: { inquiries, customers: [], reviews: [] }, stockImpact: [] }, {});
const cu = snap?.csUniverse ?? {};
console.log(`  · snapshot 미처리(unresolved) = ${cu.unresolvedInquiries} (계약 ${cUnresolved}) · unknown = ${cu.unknownInquiries}`);
base('B7. snapshot 미처리(unresolved) = 계약 미처리 13 (라벨=미처리이므로 13, 5 아님)', cu.unresolvedInquiries === cUnresolved);
red('R7. snapshot이 unknown 문의를 별도 분리 노출(unknownInquiries=3) — 미처리 총계와 구분', cu.unknownInquiries === cUnknown, `unknownInquiries=${cu.unknownInquiries}`);
// unknownSamples는 중복 제거·안전 진단값. fixture unknown 3건('', undefined, 'ZZUNKNOWN') → distinct 2건('(빈 값)', 'ZZUNKNOWN').
{
  const smp = IS?.summarizeInquiryStatus?.(inquiries.map((q) => q.status))?.unknownSamples;
  red('R8. unknown 원시값 근거(unknownSamples) 보존·중복제거(distinct 2: ZZUNKNOWN·빈값)',
    Array.isArray(smp) && smp.length === 2 && smp.includes('ZZUNKNOWN') && smp.some((s) => /빈 값/.test(s)),
    IS ? JSON.stringify(smp) : '모듈 없음');
}

// ── [BASE] csDraftRuntime 자동 초안 후보 = 미답변(unanswered)만 (C14: needs_human/in_progress/on_hold/unknown/answered 제외) ──
// rank 초과 시 selectCsDraftTargetInquiry가 '총 N건'을 반환 → 후보 정확히 5건 검증.
const overRank = CD.selectCsDraftTargetInquiry({ inquiries, intent: { isDraftRequest: true, targetHint: 'recent_unanswered', rank: 6 } });
console.log(`  · csDraftRuntime 초안 후보(recent_unanswered) reason = ${overRank.reason}`);
base('B8. csDraftRuntime 초안 후보 = 미답변 5건 (needs_human/in_progress/on_hold/unknown/answered 제외)',
  !overRank.inquiry && /총\s*5\s*건/.test(overRank.reason || ''));
const pick1 = CD.selectCsDraftTargetInquiry({ inquiries, intent: { isDraftRequest: true, targetHint: 'recent_unanswered' } });
base('B9. csDraftRuntime 선정 대상은 미답변으로 정규화됨 (needs_human 대상 아님)',
  !!IS && !!pick1.inquiry && IS.normalizeInquiryStatus(pick1.inquiry.status).canonicalStatus === 'unanswered');

// ── [BASE] 과거 저장값 hydration: 한국어·영어 모두 canonical + 원시 근거 보존 + idempotent ──
if (IS && typeof IS.normalizeInquiryRecord === 'function') {
  const ko = IS.normalizeInquiryRecord({ inquiryId: 'K', status: '미답변' });
  const en = IS.normalizeInquiryRecord({ inquiryId: 'E', status: 'unanswered' });
  const reNorm = IS.normalizeInquiryRecord(ko); // 이미 hydration된 레코드 재정규화 → 근거 보존
  base('B10. hydration 한/영 호환 + idempotent (canonical·rawStatus·normalizationReason 보존)',
    ko.canonicalStatus === 'unanswered' && ko.rawStatus === '미답변' && ko.normalizationReason === 'known_alias' &&
    en.canonicalStatus === 'unanswered' && en.rawStatus === 'unanswered' &&
    reNorm.canonicalStatus === 'unanswered' && reNorm.rawStatus === '미답변' && reNorm.normalizationReason === ko.normalizationReason);
} else {
  base('B10. hydration 한/영 호환 + idempotent', false);
}

// ── [BASE] 입력 경계 1회 정규화 + 저장→복원 회귀 (D-6) ──
// 경계: normalizeInquiryRecords로 1회 canonical화 → localStorage 직렬화(JSON) → 복원 → 재정규화(재호출)에도
//   canonicalStatus·rawStatus·normalizationReason이 손상 없이 보존되는지(idempotent hydration).
if (IS && typeof IS.normalizeInquiryRecords === 'function') {
  const raw = [{ id: 'A', status: '미답변' }, { id: 'B', status: 'unanswered' }, { id: 'C', status: 'needs_human' }, { id: 'D', status: 'ZZUNKNOWN' }, { id: 'E', status: '' }];
  const once = IS.normalizeInquiryRecords(raw);                        // 경계 1회 변환
  const restored = JSON.parse(JSON.stringify(once));                    // 저장→복원(localStorage 왕복)
  const twice = IS.normalizeInquiryRecords(restored);                  // 복원 후 재정규화(경계 재통과)
  const fieldsOk = once.every((r) => typeof r.canonicalStatus === 'string' && typeof r.rawStatus === 'string' && typeof r.normalizationReason === 'string');
  const rawPreserved = twice[0].rawStatus === '미답변' && twice[1].rawStatus === 'unanswered' && twice[3].rawStatus === 'ZZUNKNOWN' && twice[4].rawStatus === '';
  const canonPreserved = twice[0].canonicalStatus === 'unanswered' && twice[2].canonicalStatus === 'needs_human' && twice[3].canonicalStatus === 'unknown' && twice[4].canonicalStatus === 'unknown';
  const reasonPreserved = twice[0].normalizationReason === once[0].normalizationReason && twice[3].normalizationReason === 'unrecognized' && twice[4].normalizationReason === 'empty';
  const idempotent = JSON.stringify(once) === JSON.stringify(twice); // 재정규화가 값을 바꾸지 않음
  base('B11. 입력경계 1회 변환 + 저장→복원 후 canonical·rawStatus·reason 보존(idempotent)',
    fieldsOk && rawPreserved && canonPreserved && reasonPreserved && idempotent);
} else {
  base('B11. 입력경계 1회 변환 + 저장→복원 보존', false);
}

// ── [BASE] MOCK/spec 호환 표본 형태 재현(답변대기×2·답변완료×1) — '답변대기'=미답변 잠금 ──
//   ('답변대기'는 mockProxyData의 표본 상태값이며 실제 고도몰 Board_List 관측값이 아니다.)
{
  const mockRaw = ['답변대기', '답변대기', '답변완료'];
  const mockInq = mockRaw.map((s, i) => ({ inquiryId: `R${i}`, status: s, topic: 'delivery', urgency: 'low', createdAt: `2026-06-1${i}` }));
  const rs = IS?.summarizeInquiryStatus?.(mockRaw);
  const rec0 = IS?.normalizeInquiryRecord?.({ inquiryId: 'R0', status: '답변대기' });
  const draftOver = CD.selectCsDraftTargetInquiry({ inquiries: mockInq, intent: { isDraftRequest: true, targetHint: 'recent_unanswered', rank: 3 } });
  const draftPick = CD.selectCsDraftTargetInquiry({ inquiries: mockInq, intent: { isDraftRequest: true, targetHint: 'recent_unanswered' } });
  const roundtrip = IS ? IS.normalizeInquiryRecords(JSON.parse(JSON.stringify(IS.normalizeInquiryRecords(mockInq)))) : [];
  console.log(`  · MOCK/spec 표본 재현: 미답변 ${rs?.unanswered} · 미처리 ${rs?.unresolved} · unknown ${rs?.unknown} · 답변완료 ${rs?.answered} · 자동초안후보 ${mockRaw.filter((x) => IS?.isUnanswered(x)).length}`);
  base('B12. MOCK/spec 표본 형태(답변대기2·답변완료1): 미답변2·답변완료1·unknown0·미처리2',
    !!rs && rs.total === 3 && rs.unanswered === 2 && rs.answered === 1 && rs.unknown === 0 && rs.unresolved === 2);
  base('B13. 답변대기 record: canonicalStatus=unanswered · rawStatus=답변대기 · reason=known_alias 보존',
    !!rec0 && rec0.canonicalStatus === 'unanswered' && rec0.rawStatus === '답변대기' && rec0.normalizationReason === 'known_alias');
  base('B14. 답변대기 자동초안 후보 2건(총 2건) · 선정대상이 답변대기(미답변)',
    /총\s*2\s*건/.test(draftOver.reason || '') && !!draftPick.inquiry && IS.normalizeInquiryStatus(draftPick.inquiry.status).canonicalStatus === 'unanswered');
  base('B15. 저장→복원 후에도 답변대기→unanswered·rawStatus 보존',
    roundtrip.length === 3 && roundtrip[0].canonicalStatus === 'unanswered' && roundtrip[0].rawStatus === '답변대기' && roundtrip[0].normalizationReason === 'known_alias');
}

// ── [BASE] 출처 계약 × 문의 상태 계약 교차검증 (C-4 재개, A~D) ──
if (PROV && IS) {
  const rec = (arr) => IS.normalizeInquiryRecords(arr.map((s, i) => ({ inquiryId: `X${i}`, status: s })));
  // A. 실제 모드 inquiries 연동 실패 → 연결 안 됨 · mock 3건 미주입 · 미답변 0건/자동초안 0건으로 단언 금지
  const outA = PROV.resolveFetchOutcome({ requestedMode: 'real', serverSourceType: 'api_mock_fallback', errorMessage: 'Board_List 미매핑', mockRecords: [{ status: '답변대기' }, { status: '답변대기' }, { status: '답변대기' }] });
  const statA = PROV.toResourceStatus('inquiries', outA);
  base('XA. real 실패 → 연결 안 됨·mock 미주입(0)·상태정규화가 연결실패를 빈데이터로 안 바꿈',
    statA.status === 'unavailable' && statA.userLabel === '연결 안 됨' && statA.count === 0 && outA.records.length === 0);
  // B. 실제 성공 빈배열 → 실제 데이터 · 문의 실제 0건 · 실패문구 없음 · mock 대체 없음
  const outB = PROV.resolveFetchOutcome({ requestedMode: 'real', serverSourceType: 'api_proxy_real', serverRecords: [] });
  const sumB = IS.summarizeInquiryStatus([]);
  base('XB. real 성공 빈배열 → 실제 데이터·실제 0건·실패문구 없음·mock 없음',
    outB.kind === 'actual' && outB.count === 0 && !outB.errorMessage && sumB.total === 0 && sumB.unanswered === 0);
  // C. 명시적 시험 모드 MOCK fixture(답변대기2·답변완료1) → 미답변2·미처리2·unknown0·답변완료1·자동초안2·시험 데이터
  const outC = PROV.resolveFetchOutcome({ requestedMode: 'test', serverSourceType: 'api_mock_fallback', mockRecords: [{ status: '답변대기' }, { status: '답변대기' }, { status: '답변완료' }] });
  const rawC = outC.records.map((r) => r.status);
  const sumC = IS.summarizeInquiryStatus(rawC);
  const draftC = rawC.filter((s) => IS.isUnanswered(s)).length;
  base('XC. test 모드 mock(답변대기2·답변완료1) → 미답변2·미처리2·unknown0·답변완료1·자동초안2·시험 데이터',
    outC.userLabel === '시험 데이터' && sumC.unanswered === 2 && sumC.unresolved === 2 && sumC.unknown === 0 && sumC.answered === 1 && draftC === 2);
  // D. 알 수 없는 미래 상태 → unknown·answered로 안 셈·unresolved 포함·rawStatus/reason 보존·PII 미유입
  const rD = IS.normalizeInquiryStatus('FUTURE_STATE_xyz');
  const sumD = IS.summarizeInquiryStatus(['FUTURE_STATE_xyz', 'user@secret.com 010-1234-5678']);
  base('XD. 미래 미지상태 → unknown·answered 아님·unresolved 포함·raw/reason 보존',
    rD.canonicalStatus === 'unknown' && rD.rawStatus === 'FUTURE_STATE_xyz' && rD.normalizationReason === 'unrecognized' &&
    sumD.unknown === 2 && sumD.answered === 0 && sumD.unresolved === 2);
  base('XD-PII. unknownSamples에 PII(이메일·전화) 미유입',
    !sumD.unknownSamples.some((s) => /@|01[016789]-?\d{3,4}/.test(s)));
} else {
  base('XA~XD. 출처×상태 교차검증(계약 로드)', false);
}

console.log(`\n--- 요약 ---`);
console.log(`[BASE] ${baseP} pass / ${baseF} fail`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 계약 목표값 정합 실패 — 치명'); process.exit(2); }
if (redUnmet > 0) { console.log('\n● RED 상태 — GREEN에서 공통 계약으로 위 [RED] 전부 MET.'); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN 도달'); process.exit(0);
