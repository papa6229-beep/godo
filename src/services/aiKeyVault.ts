// AI Key Vault v0 — cloud provider 연결 키/모델을 현재 브라우저에 저장
//
// v0 설계: 운영자가 GODO 화면에서 직접 연결 키를 붙여넣어 쉽게 쓰도록 localStorage에 저장한다.
// 안전장치(조용히):
//   - 화면에는 원문 대신 마스킹(sk-•••••1234)만 표시한다.
//   - 이 모듈은 key를 console.log 하지 않는다.
//   - 실제 key 값은 코드에 하드코딩하지 않는다.
// (실제 cloud 호출은 서버 route가 요청 단위로만 사용하고 저장하지 않는다.)

const KEYS_STORAGE = 'godo_ai_provider_keys_v0';
const MODELS_STORAGE = 'godo_ai_provider_models_v0';

type StringMap = Record<string, string>;

const safeParse = (raw: string | null): StringMap => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StringMap) : {};
  } catch {
    return {};
  }
};

const readMap = (storageKey: string): StringMap => {
  if (typeof window === 'undefined') return {};
  try {
    return safeParse(window.localStorage.getItem(storageKey));
  } catch {
    return {};
  }
};

const writeMap = (storageKey: string, map: StringMap): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // 저장 실패(용량/프라이빗 모드 등)는 조용히 무시한다.
  }
};

// --- 연결 키 ---
export function saveProviderKey(providerId: string, apiKey: string): void {
  const map = readMap(KEYS_STORAGE);
  map[providerId] = apiKey;
  writeMap(KEYS_STORAGE, map);
}

export function getProviderKey(providerId: string): string | null {
  const map = readMap(KEYS_STORAGE);
  return map[providerId] || null;
}

export function deleteProviderKey(providerId: string): void {
  const map = readMap(KEYS_STORAGE);
  if (providerId in map) {
    delete map[providerId];
    writeMap(KEYS_STORAGE, map);
  }
}

export function hasProviderKey(providerId: string): boolean {
  return !!getProviderKey(providerId);
}

// 원문을 그대로 보여주지 않기 위한 마스킹. 앞 3글자 + ••• + 뒤 4글자.
export function maskProviderKey(apiKey: string): string {
  if (!apiKey) return '';
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return '••••••••';
  const head = trimmed.slice(0, 3);
  const tail = trimmed.slice(-4);
  return `${head}•••••${tail}`;
}

// --- 사용할 모델 ---
export function saveProviderModel(providerId: string, modelId: string): void {
  const map = readMap(MODELS_STORAGE);
  map[providerId] = modelId;
  writeMap(MODELS_STORAGE, map);
}

export function getProviderModel(providerId: string): string | null {
  const map = readMap(MODELS_STORAGE);
  return map[providerId] || null;
}
