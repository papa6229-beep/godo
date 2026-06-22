import { useState, useEffect } from 'react';

export type GodoTheme = 'dark' | 'light';

const STORAGE_KEY = 'godo.ui.theme';

export function useTheme() {
  const [theme, setTheme] = useState<GodoTheme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as GodoTheme | null;
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
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
