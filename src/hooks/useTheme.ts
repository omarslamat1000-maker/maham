import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'maham.theme';
const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function setTheme(t: Theme): void {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* التخزين غير متاح (وضع خاص) — تبقى السمة للجلسة الحالية */
  }
  listeners.forEach((l) => l());
}

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => 'light' as Theme,
  );
  const toggle = useCallback(() => setTheme(current() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle, setTheme };
}
