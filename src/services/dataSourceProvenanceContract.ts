// ────────────────────────────────────────────────────────────────────────────
// Data Source Provenance Contract — 자료 "신분증" 단일 정의(Single Source of Truth)
//
// 배경: 시스템이 자료의 신분을 잘못 붙였다.
//   - mode:real 이면 실제라고 부름(그러나 sourceType=api_mock_fallback이면 실제 아님)
//   - 실제 API 0건과 "연결 안 됨"을 구분 못 함 → 0건을 시험자료로 대체
//   - 실제 상품 + 가상 운영자료 결합 결과를 전체 REAL로 표시
//   - 문의3·리뷰3 mock fixture를 실제 문의로 집계
//
// 계약(사장 확정):
//   내부 분류(4): actual / simulation / fixture / unavailable
//   사용자 표기(3): '실제 데이터' / '시험 데이터' / '연결 안 됨'  (내부 기술문구 미노출)
//
//   판별 기준은 mode/버튼이름/배열크기/화면이름이 아니라
//   ① 반환된 sourceType(정본) + ② 입력 경계에서 명시한 datasetKind 다.
//   sourceType만으로 simulation(2년치 가상 운영)과 fixture(mock/demo 소형 표본)를 구분할 수 없으므로
//   입력 경계에서 datasetKind를 명시적으로 붙인다(추측 금지).
// ────────────────────────────────────────────────────────────────────────────

/** 내부 4분류. */
export type ProvenanceKind = 'actual' | 'simulation' | 'fixture' | 'unavailable';
/** 사용자에게 보이는 표기 3종(내부 기술문구 노출 금지). */
export type ProvenanceUserLabel = '실제 데이터' | '시험 데이터' | '연결 안 됨';
/** 입력 경계에서 명시하는 dataset 종류. simulation vs fixture 구분의 정본. */
export type DatasetKind = 'live' | 'simulation' | 'fixture' | 'unknown';

/** 리소스 1건의 출처 입력(resolveResource/RevenueResult 등 반환 형태와 호환). */
export interface ResourceProvenanceInput {
  /** 반환된 sourceType(정본). api_proxy_real / api_proxy_sandbox / api_mock_fallback / synthetic_test / real_godomall 등. */
  sourceType?: string;
  /** ResolvedResource는 필드명이 source 다 — 호환 위해 함께 받는다. */
  source?: string;
  /** 입력 경계에서 명시한 dataset 종류(simulation/fixture 구분 정본). */
  datasetKind?: DatasetKind;
  /** 레코드 수(빈 배열=0건과 연결실패 구분에 사용). */
  count?: number;
  records?: unknown[];
  /** 연결 실패·미구현 사유(있으면 unavailable). */
  errorMessage?: string;
  /** 사용자가 무엇을 요청했는가. 'real'(실제 자료) | 'test'(시험 모드). 미지정은 real처럼 보수적으로 취급. */
  requested?: 'real' | 'test';
  /** 라벨용 식별자(선택). */
  resourceName?: string;
}

export interface ResourceProvenance {
  kind: ProvenanceKind;
  userLabel: ProvenanceUserLabel;
  count: number;
  reason: string;
  resourceName?: string;
}

export interface ScreenProvenance {
  kind: ProvenanceKind;
  userLabel: ProvenanceUserLabel;
  /** 리소스별 판정(화면 전체 판정과 분리해 보존). */
  resources: ResourceProvenance[];
  reason: string;
}

const USER_LABEL: Record<ProvenanceKind, ProvenanceUserLabel> = {
  actual: '실제 데이터',
  simulation: '시험 데이터',
  fixture: '시험 데이터',
  unavailable: '연결 안 됨'
};

/** 내부 분류 → 사용자 표기. 항상 3종만. 내부 기술문구를 절대 반환하지 않는다. */
export const userLabelOf = (kind: ProvenanceKind): ProvenanceUserLabel => USER_LABEL[kind];

const hasError = (e?: string): boolean => typeof e === 'string' && e.trim() !== '';

/**
 * 리소스 1건의 신분 판정. mode/버튼/배열크기/화면이름으로 추측하지 않는다.
 * 우선순위:
 *   1) 연결 실패·미구현·자동대체(errorMessage 또는 api_mock_fallback):
 *      - 실제(real/미지정) 요청이면 unavailable('연결 안 됨'). 자동 대체된 mock을 데이터로 제시 금지. [규칙 C·A, GREEN3]
 *      - 시험(test) 요청이면 fixture 허용(아래로 진행).
 *   2) 명시적 datasetKind (fixture/simulation)         [경계에서 붙인 정본]
 *   3) sourceType(정본): api_mock_fallback→fixture, synthetic_*→simulation,
 *      api_proxy_real/sandbox·real_godomall→actual [규칙 B: 빈배열이어도 actual], demo/mock→fixture
 *   4) 알 수 없으면 unavailable(추측 금지)              [규칙 J]
 */
export function classifyResource(input: ResourceProvenanceInput): ResourceProvenance {
  const count = typeof input.count === 'number' ? input.count : (input.records?.length ?? 0);
  const st = (input.sourceType ?? input.source ?? '').trim();
  const dk = input.datasetKind;
  const req = input.requested; // 'real' | 'test' | undefined
  const mk = (kind: ProvenanceKind, reason: string): ResourceProvenance => ({
    kind, userLabel: userLabelOf(kind), count, reason, ...(input.resourceName ? { resourceName: input.resourceName } : {})
  });

  // 1) 연결 실패·미구현·자동대체. 실제(또는 미지정) 요청이면 mock을 데이터로 제시하지 않고 연결 안 됨.
  const fallbackOrError = hasError(input.errorMessage) || st === 'api_mock_fallback' || st === 'unavailable';
  if (fallbackOrError && req !== 'test') {
    return mk('unavailable', '실제 요청인데 실패/미구현/자동대체(mock) — 연결 안 됨(mock 미집계)');
  }
  // 판별 불가(sourceType·datasetKind 둘 다 없음)
  if (st === '' && !dk) return mk('unavailable', '판별 불가(sourceType·datasetKind 없음)');
  // 2) 경계에서 명시한 datasetKind (정본)
  if (dk === 'fixture') return mk('fixture', 'datasetKind=fixture');
  if (dk === 'simulation') return mk('simulation', 'datasetKind=simulation');
  // 3) sourceType 정본
  if (st === 'api_mock_fallback') return mk('fixture', 'sourceType=api_mock_fallback (시험 모드에서 fixture)');
  if (st === 'synthetic_test' || st === 'synthetic') return mk('simulation', 'sourceType=synthetic');
  if (st === 'api_proxy_real' || st === 'api_proxy_sandbox' || st === 'real_godomall') return mk('actual', `sourceType=${st}`);
  // 사용자가 직접 올린 실제 자료(CSV/JSON/수기)는 실제 데이터로 본다(시험·가상 아님).
  if (st === 'csv' || st === 'json' || st === 'manual') return mk('actual', `sourceType=${st} (사용자 업로드)`);
  if (st === 'demo' || st === 'mock' || st === 'api_mock') return mk('fixture', `sourceType=${st}`);
  // datasetKind=live 인데 sourceType 미상 → live 신뢰(경계가 실제라 명시)
  if (dk === 'live') return mk('actual', 'datasetKind=live');
  // 4) 추측 금지
  return mk('unavailable', `판별 불가(sourceType=${st || '없음'})`);
}

/**
 * 화면 전체 판정(리소스별과 분리). [규칙 D·E·G]
 *   - 모든 리소스가 actual일 때만 화면 actual('실제 데이터').
 *   - 하나라도 unavailable이면 화면 unavailable('연결 안 됨') — 일부만 실제라고 전체 REAL 금지.
 *   - 그 외(simulation/fixture 혼재, 실제상품+가상운영 결합)는 화면 simulation('시험 데이터').
 */
export function classifyScreen(inputs: ResourceProvenanceInput[]): ScreenProvenance {
  const resources = (inputs ?? []).map(classifyResource);
  if (resources.length === 0) {
    return { kind: 'unavailable', userLabel: userLabelOf('unavailable'), resources, reason: '리소스 없음' };
  }
  const anyUnavailable = resources.some((r) => r.kind === 'unavailable');
  const allActual = resources.every((r) => r.kind === 'actual');
  let kind: ProvenanceKind;
  let reason: string;
  if (allActual) { kind = 'actual'; reason = '모든 리소스 actual'; }
  else if (anyUnavailable) { kind = 'unavailable'; reason = '일부 리소스 연결 안 됨(전체 actual 금지)'; }
  else { kind = 'simulation'; reason = '실제+가상/시험 혼재 → 전체 시험 데이터'; }
  return { kind, userLabel: userLabelOf(kind), resources, reason };
}

/** 실제 자료 요청 시 빈 배열이 "실제 0건"인지(actual) 판정. [규칙 B] */
export const isActualEmpty = (input: ResourceProvenanceInput): boolean => {
  const p = classifyResource(input);
  return p.kind === 'actual' && p.count === 0;
};

// ── GREEN3: 자동 바꿔치기 차단 ────────────────────────────────────────────────

export interface FetchOutcomeInput {
  /** 사용자가 무엇을 요청했나. 'real'(실제 자료) | 'test'(시험 모드). 미지정은 real처럼 보수적. */
  requestedMode?: 'real' | 'test';
  /** 서버/네트워크가 반환한 sourceType(정본). api_proxy_real / api_mock_fallback 등. */
  serverSourceType?: string;
  /** 서버가 반환한 실제 레코드(성공 시). */
  serverRecords?: unknown[];
  /** 연결 실패·미구현 사유. */
  errorMessage?: string;
  /** 네트워크 자체 실패(fetch throw) 여부. */
  networkFailed?: boolean;
  /** 로컬 mock 레코드(자동 대체 후보). real 모드에서는 주입 금지. */
  mockRecords?: unknown[];
}

export interface FetchOutcome {
  /** 실제로 소비자·통계에 넣을 레코드. real 모드 실패 시 [](주입 차단). */
  records: unknown[];
  count: number;
  kind: ProvenanceKind;
  userLabel: ProvenanceUserLabel;
  /** 자동 대체(mock 주입)를 막았는지. */
  substitutionBlocked: boolean;
  sourceType: string;
  errorMessage?: string;
  reason: string;
}

/**
 * 실제/시험 요청에 따라 fetch 결과의 신분과 "무엇을 실제로 넣을지"를 결정한다. [GREEN3]
 *   - test 모드: mock/서버 레코드를 fixture로 표시하고 사용(시험 데이터). fixture 승격 없음.
 *   - real 모드 + 실패/미구현/자동대체(api_mock_fallback): mock을 주입하지 않고(records=[])
 *     unavailable('연결 안 됨')로 표시. 운영 통계에 mock 건수 미투입. [규칙 A·C]
 *   - real 모드 + 성공(빈 배열 포함): 그대로 actual. 빈 배열=실제 0건. [규칙 B]
 */
export function resolveFetchOutcome(input: FetchOutcomeInput): FetchOutcome {
  const req = input.requestedMode ?? 'real';
  const st = (input.serverSourceType ?? '').trim();
  const failedOrFellBack = hasError(input.errorMessage) || input.networkFailed === true || st === 'api_mock_fallback' || st === 'unavailable';

  if (req === 'test') {
    const records = (input.mockRecords ?? input.serverRecords ?? []) as unknown[];
    return {
      records, count: records.length, kind: 'fixture', userLabel: userLabelOf('fixture'),
      substitutionBlocked: false, sourceType: st || 'fixture', reason: '시험 모드 — fixture 사용(시험 데이터)'
    };
  }
  // real 모드
  if (failedOrFellBack) {
    return {
      records: [], count: 0, kind: 'unavailable', userLabel: userLabelOf('unavailable'),
      substitutionBlocked: true, sourceType: st || 'unavailable',
      errorMessage: input.errorMessage ?? 'connection unavailable',
      reason: '실제 요청 실패/미구현 — mock 자동 대체 차단(연결 안 됨)'
    };
  }
  const records = (input.serverRecords ?? []) as unknown[];
  const p = classifyResource({ sourceType: st, count: records.length, requested: 'real' });
  return {
    records, count: records.length, kind: p.kind, userLabel: p.userLabel,
    substitutionBlocked: false, sourceType: st || 'unknown', reason: `실제 응답 — ${p.reason}`
  };
}

// ── 리소스별 상태 레코드 + 화면 집계 (Data Center / Sync History 용) ───────────

export type ResourceStatus = 'success' | 'unavailable';

export interface ResourceStatusRecord {
  resource: string;
  status: ResourceStatus;        // success(실제·시험 성공) | unavailable(연결 안 됨)
  provenance: ProvenanceKind;    // actual | simulation | fixture | unavailable
  userLabel: ProvenanceUserLabel;// 실제 데이터 | 시험 데이터 | 연결 안 됨
  count: number;                 // 실제로 적재된 레코드 수(차단 시 0)
  substitutionBlocked: boolean;
  errorMessage?: string;
  syncedAt?: string;
}

/**
 * fetch 결과 → 리소스별 상태 레코드. **배열 길이로 상태를 재판정하지 않는다.**
 *   status: unavailable ↔ 연결 안 됨(실패/미구현/차단). success ↔ 실제/시험 성공(빈 배열이어도 성공).
 */
export function toResourceStatus(resource: string, outcome: FetchOutcome, syncedAt?: string): ResourceStatusRecord {
  const status: ResourceStatus = (outcome.substitutionBlocked || outcome.kind === 'unavailable') ? 'unavailable' : 'success';
  return {
    resource,
    status,
    provenance: outcome.kind,
    userLabel: outcome.userLabel,
    count: outcome.count,
    substitutionBlocked: outcome.substitutionBlocked,
    ...(outcome.errorMessage ? { errorMessage: outcome.errorMessage } : {}),
    ...(syncedAt ? { syncedAt } : {})
  };
}

export interface ScreenStatus {
  kind: ProvenanceKind;
  userLabel: ProvenanceUserLabel;
  anyUnavailable: boolean;
  note: string; // 사용자 안내(예: '일부 리소스 연결 안 됨')
  resources: ResourceStatusRecord[];
}

/**
 * 리소스별 상태 → 화면 전체 상태(리소스별과 분리 보존). [규칙 D·E·G]
 *   전부 actual → 실제 데이터 · 하나라도 unavailable → 연결 안 됨(일부 안내) · 그 외 혼재 → 시험 데이터.
 *   개별 리소스의 실제 데이터/연결 안 됨 상태는 records에 그대로 보존한다.
 */
export function summarizeScreenStatus(records: ResourceStatusRecord[]): ScreenStatus {
  if (!records.length) {
    return { kind: 'unavailable', userLabel: userLabelOf('unavailable'), anyUnavailable: true, note: '연동된 리소스 없음', resources: [] };
  }
  const anyUnavailable = records.some((r) => r.status === 'unavailable');
  const allActual = records.every((r) => r.provenance === 'actual');
  let kind: ProvenanceKind;
  let note: string;
  if (allActual) { kind = 'actual'; note = '모든 리소스 실제 데이터'; }
  else if (anyUnavailable) {
    kind = 'unavailable';
    const bad = records.filter((r) => r.status === 'unavailable').map((r) => r.resource);
    note = `일부 리소스 연결 안 됨: ${bad.join(', ')}`;
  } else { kind = 'simulation'; note = '시험 데이터 포함'; }
  return { kind, userLabel: userLabelOf(kind), anyUnavailable, note, resources: records };
}
