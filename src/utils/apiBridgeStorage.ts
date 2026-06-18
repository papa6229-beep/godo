import type { ApiBridgeMode, ApiBridgeProvider, ApiSyncJob, ApiBridgeLog, ApiResourceType } from '../types/apiBridge';

// 로컬스토리지 키 정의
const KEYS = {
  MODE: 'godo.apiBridge.mode',
  PROVIDERS: 'godo.apiBridge.providers',
  SYNC_JOBS: 'godo.apiBridge.syncJobs',
  LOGS: 'godo.apiBridge.logs',
  LAST_SYNC_AT: 'godo.apiBridge.lastSyncAt'
};

// 기본 공급자(Provider) 데이터
const DEFAULT_PROVIDERS: ApiBridgeProvider[] = [
  {
    id: 'godomall',
    name: 'Godomall API',
    mode: 'mock',
    status: 'ready',
    description: '고도몰 쇼핑몰 주문, CS, 리뷰, 재고 및 매출 정보 연동 커넥터',
    baseUrlLabel: 'Hidden (Server-side Only)',
    lastSyncAt: undefined,
    healthScore: 98,
    permissions: {
      orders: 'read_only',
      inquiries: 'draft_only',
      reviews: 'draft_only',
      inventory: 'read_only',
      sales: 'read_only',
      products: 'approval_required'
    }
  }
];

// 기본 안전/보안 로그 데이터
const createInitialLogs = (): ApiBridgeLog[] => [
  {
    id: 'log-init-1',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    level: 'safety',
    message: 'API Key is not stored in browser localStorage. (보안 정책 적용)'
  },
  {
    id: 'log-init-2',
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'GODO API Bridge MVP initialized in Mock Mode.'
  }
];

export interface ApiBridgeState {
  mode: ApiBridgeMode;
  providers: ApiBridgeProvider[];
  syncJobs: ApiSyncJob[];
  logs: ApiBridgeLog[];
  lastSyncAt: string | null;
}

// 상태 로드
export const loadApiBridgeState = (): ApiBridgeState => {
  if (typeof window === 'undefined') {
    return {
      mode: 'mock',
      providers: DEFAULT_PROVIDERS,
      syncJobs: [],
      logs: [],
      lastSyncAt: null
    };
  }

  const mode = (localStorage.getItem(KEYS.MODE) as ApiBridgeMode) || 'mock';
  
  let providers = DEFAULT_PROVIDERS;
  const providersStr = localStorage.getItem(KEYS.PROVIDERS);
  if (providersStr) {
    try {
      providers = JSON.parse(providersStr);
    } catch {
      providers = DEFAULT_PROVIDERS;
    }
  }

  let syncJobs: ApiSyncJob[] = [];
  const syncJobsStr = localStorage.getItem(KEYS.SYNC_JOBS);
  if (syncJobsStr) {
    try {
      syncJobs = JSON.parse(syncJobsStr);
    } catch {
      syncJobs = [];
    }
  }

  let logs = createInitialLogs();
  const logsStr = localStorage.getItem(KEYS.LOGS);
  if (logsStr) {
    try {
      logs = JSON.parse(logsStr);
    } catch {
      logs = createInitialLogs();
    }
  }

  const lastSyncAt = localStorage.getItem(KEYS.LAST_SYNC_AT);

  return {
    mode,
    providers,
    syncJobs,
    logs,
    lastSyncAt
  };
};

// 상태 저장
export const saveApiBridgeState = (state: Partial<ApiBridgeState>) => {
  if (typeof window === 'undefined') return;

  if (state.mode !== undefined) {
    localStorage.setItem(KEYS.MODE, state.mode);
  }
  if (state.providers !== undefined) {
    localStorage.setItem(KEYS.PROVIDERS, JSON.stringify(state.providers));
  }
  if (state.syncJobs !== undefined) {
    localStorage.setItem(KEYS.SYNC_JOBS, JSON.stringify(state.syncJobs));
  }
  if (state.logs !== undefined) {
    localStorage.setItem(KEYS.LOGS, JSON.stringify(state.logs));
  }
  if (state.lastSyncAt !== undefined) {
    if (state.lastSyncAt) {
      localStorage.setItem(KEYS.LAST_SYNC_AT, state.lastSyncAt);
    } else {
      localStorage.removeItem(KEYS.LAST_SYNC_AT);
    }
  }
};

// 로그 추가
export const appendApiBridgeLog = (message: string, level: 'info' | 'warning' | 'error' | 'safety', resourceType?: ApiResourceType) => {
  const state = loadApiBridgeState();
  const newLog: ApiBridgeLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    resourceType
  };
  const updatedLogs = [newLog, ...state.logs].slice(0, 100); // 최대 100개 보존
  saveApiBridgeState({ logs: updatedLogs });
  return updatedLogs;
};

// 동기화 작업 이력 추가
export const appendApiSyncJob = (job: Omit<ApiSyncJob, 'id' | 'requestedAt'>): ApiSyncJob => {
  const state = loadApiBridgeState();
  const newJob: ApiSyncJob = {
    ...job,
    id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    requestedAt: new Date().toISOString()
  };
  const updatedJobs = [newJob, ...state.syncJobs].slice(0, 50); // 최대 50개 보존
  saveApiBridgeState({ syncJobs: updatedJobs });
  return newJob;
};

// API Bridge 리셋 (Demo 리셋 연동용)
export const resetApiBridgeState = () => {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(KEYS.MODE);
  localStorage.removeItem(KEYS.PROVIDERS);
  localStorage.removeItem(KEYS.SYNC_JOBS);
  localStorage.removeItem(KEYS.LOGS);
  localStorage.removeItem(KEYS.LAST_SYNC_AT);
  
  // 초기 상태 로드하여 즉시 세팅
  const freshState = {
    mode: 'mock' as ApiBridgeMode,
    providers: DEFAULT_PROVIDERS,
    syncJobs: [],
    logs: createInitialLogs(),
    lastSyncAt: null as string | null
  };
  saveApiBridgeState(freshState);
  return freshState;
};
