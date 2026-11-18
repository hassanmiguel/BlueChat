import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { readPrefs } from '../services/localProfile';

const PREFS_EVENT = 'bluechat:backdrop-prefs';

/** Call this from settings when the background blur/darken sliders move. */
export const publishBackdropPrefs = (patch: { bannerBlur?: number; bannerDarken?: number }) => {
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: patch }));
};

/** Renders the saved background behind the whole app, dimmed and blurred. */
export default function AppBackdrop() {
  const banner = useAuthStore((s) => s.user?.banner);
  const userId = useAuthStore((s) => s.user?.id);
  const [blur, setBlur] = useState(() => readPrefs().bannerBlur);
  const [darken, setDarken] = useState(() => readPrefs().bannerDarken);

  useEffect(() => {
    const prefs = readPrefs();
    setBlur(prefs.bannerBlur);
    setDarken(prefs.bannerDarken);
  }, [userId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const patch = (event as CustomEvent<{ bannerBlur?: number; bannerDarken?: number }>).detail;
      if (patch?.bannerBlur !== undefined) setBlur(patch.bannerBlur);
      if (patch?.bannerDarken !== undefined) setDarken(patch.bannerDarken);
    };
    window.addEventListener(PREFS_EVENT, handler);
    return () => window.removeEventListener(PREFS_EVENT, handler);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      {banner ? (
        <>
          <div
            className="absolute -inset-8 bg-cover bg-center"
            style={{
              backgroundImage: `url("${banner}")`,
              filter: `blur(${blur}px) saturate(1.15)`,
              transform: 'scale(1.04)',
            }}
          />
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(10, 14, 28, ${darken / 100})` }} />
        </>
      ) : (
        <div className="absolute inset-0 bg-dc-channel" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />
    </div>
  );
}
