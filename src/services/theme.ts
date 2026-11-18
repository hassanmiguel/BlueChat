import { readPrefs } from './localProfile';

export const PREFS_CHANGED_EVENT = 'bluechat:prefs-changed';

const SYSTEM_QUERY = '(prefers-color-scheme: light)';

const resolveTheme = (): 'light' | 'dark' => {
  const choice = readPrefs().theme;
  if (choice === 'system') return window.matchMedia(SYSTEM_QUERY).matches ? 'light' : 'dark';
  return choice;
};

export const applyTheme = (): void => {
  const root = document.documentElement;
  const { accent } = readPrefs();
  root.dataset.theme = resolveTheme();
  root.style.setProperty('--dc-accent', accent);
  root.style.setProperty('--dc-brand-hover', `color-mix(in srgb, ${accent} 82%, #000)`);
};

export const watchTheme = (): (() => void) => {
  applyTheme();
  const query = window.matchMedia(SYSTEM_QUERY);
  const onChange = () => {
    if (readPrefs().theme === 'system') applyTheme();
  };
  query.addEventListener?.('change', onChange);
  window.addEventListener(PREFS_CHANGED_EVENT, onChange);
  return () => {
    query.removeEventListener?.('change', onChange);
    window.removeEventListener(PREFS_CHANGED_EVENT, onChange);
  };
};
