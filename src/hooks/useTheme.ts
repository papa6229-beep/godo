import { useState, useEffect } from 'react';

export type GodoTheme = 'dark' | 'light';

// v2: 프로젝트 기본 테마를 light로 전환하면서 키를 갱신한다.
// (과거 v1 키에 저장돼 있던 dark 기본값을 무시하고 라이트 기준으로 리셋)
const STORAGE_KEY = 'godo.ui.theme.v2';

export function useTheme() {
  const [theme, setTheme] = useState<GodoTheme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as GodoTheme | null;
      // 명시적으로 dark를 고른 경우만 dark, 그 외(미설정 포함)는 light 기본.
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return { theme, setTheme, toggleTheme };
}
