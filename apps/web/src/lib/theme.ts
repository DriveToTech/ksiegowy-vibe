export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ksiegowy-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  let theme = 'light';
  try {
    const storedTheme = localStorage.getItem('${THEME_STORAGE_KEY}');
    theme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : 'light';
  } catch {}
  document.documentElement.dataset.theme = theme;
})();
`;
