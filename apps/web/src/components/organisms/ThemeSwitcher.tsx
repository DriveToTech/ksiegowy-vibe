'use client';

import { useSyncExternalStore } from 'react';
import { isTheme, THEME_STORAGE_KEY, type Theme } from '../../lib/theme';
import { t } from '../../lib/translations';

const themeChangeEventName = 'ksiegowy-theme-change';

function subscribeToThemeChange(onStoreChange: () => void) {
  window.addEventListener(themeChangeEventName, onStoreChange);
  return () => window.removeEventListener(themeChangeEventName, onStoreChange);
}

function getBrowserTheme(): Theme {
  const activeTheme = document.documentElement.dataset.theme;
  return isTheme(activeTheme) ? activeTheme : 'light';
}

export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribeToThemeChange, getBrowserTheme, () => 'light');
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    const nextTheme: Theme = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Browser storage can be blocked; the in-memory theme still applies.
    }
    window.dispatchEvent(new Event(themeChangeEventName));
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-outline bg-chrome px-3 text-sm font-semibold text-foreground transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
      <span className="sr-only">{t.theme.label}</span>
    </button>
  );
}
