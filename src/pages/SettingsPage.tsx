import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  User, Eye, Palette, ShieldCheck, Menu, X, Upload, Search, RotateCcw, Monitor,
  Smartphone, Laptop, Check, Camera, Bell, KeyRound, QrCode, LogOut,
  Globe2, Info, MessageSquare, Sparkles, Volume2, Play, Mic, Video,
} from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';
import { readPrefs, writeMedia, writePrefs, type SoundEvent } from '../services/localProfile';
import {
  clearSoundCache,
  getSoundCatalog,
  previewSound,
  SOUND_OFF,
  type CatalogSound,
} from '../services/soundService';
import {
  getMediaEnvironmentNote,
  getMediaPermissionState,
  requestMediaAccess,
  stopMediaTracks,
  watchMediaPermission,
  type MediaAccessKind,
  type MediaKind,
  type MediaPermissionView,
} from '../services/mediaPermission';
import { publishBackdropPrefs } from '../components/AppBackdrop';
import './settings.css';

type Tab = 'profile' | 'privacy' | 'appearance' | 'notifications' | 'sounds' | 'voice' | 'language' | 'security' | 'about';
type ThemeMode = 'light' | 'dark' | 'system';
type Density = 'comfortable' | 'compact' | 'spacious';
type Media = { url: string; name: string; size: number; type: string } | null;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const ACCENTS = ['#3A86FF', '#00F5D4', '#7B61FF', '#FF4D9D', '#FFB84D', '#3AE5A1'];

const EVENT_SOUNDS: { id: SoundEvent; label: string; detail: string; icon: typeof Bell }[] = [
  { id: 'notification', label: 'New notification', detail: 'Mentions, DMs and activity', icon: Bell },
  { id: 'messageSent', label: 'Message sent', detail: 'When you send a message', icon: MessageSquare },
  { id: 'calling', label: 'Incoming call', detail: 'Rings while somebody is calling', icon: Volume2 },
  { id: 'login', label: 'Sign in', detail: 'When you log into blueChat', icon: KeyRound },
];

const MEDIA_LABELS: Record<MediaKind, string> = {
  microphone: 'Microphone',
  camera: 'Camera',
};

const PERMISSION_COPY: Record<MediaPermissionView, { label: string; hint: string }> = {
  granted: { label: 'Allowed', hint: 'Ready for calls.' },
  denied: { label: 'Blocked', hint: 'Allow it from the site icon in your browser, then try again.' },
  prompt: { label: 'Not asked yet', hint: 'Click Allow to open the browser permission prompt.' },
  unknown: { label: 'Not checked', hint: 'Click Allow to check this device.' },
  insecure: { label: 'Needs HTTPS', hint: 'Open blueChat over HTTPS or localhost.' },
  unsupported: { label: 'Unsupported', hint: 'This browser cannot share this device.' },
};

const NAV: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'privacy', label: 'Privacy', icon: Eye },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'sounds', label: 'Sounds', icon: Volume2 },
  { id: 'voice', label: 'Voice & Video', icon: Mic },
  { id: 'language', label: 'Language', icon: Globe2 },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'about', label: 'About', icon: Info },
];

const formatSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
  reader.readAsDataURL(file);
});

const validateFile = (file: File): string | null => {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const isImage = IMAGE_TYPES.includes(file.type) || ext === 'gif';
  const isVideo = VIDEO_TYPES.includes(file.type) || ['mp4', 'webm'].includes(ext || '');
  if (!isImage && !isVideo) return 'Use a JPG, PNG, WebP, GIF, MP4 or WebM file.';
  if ((file.type === 'image/gif' || ext === 'gif') && file.size > 5 * 1024 * 1024) return 'GIFs need to be under 5 MB.';
  if (isVideo && file.size > 25 * 1024 * 1024) return 'Videos need to be under 25 MB.';
  if (isImage && !isVideo && file.size > 10 * 1024 * 1024) return 'Images need to be under 10 MB.';
  return null;
};

const MediaView = ({ media, className }: { media: Media; className?: string }) => {
  if (!media) return null;
  if (media.type.startsWith('video/')) return <video src={media.url} className={className} autoPlay loop muted playsInline />;
  return <img src={media.url} className={className} alt={media.name || 'preview'} />;
};

function Card({ title, intro, children, className = '' }: { title: string; intro?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="card-head">
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`switch${checked ? ' on' : ''}`}>
      <span />
    </button>
  );
}

function PermissionRow({
  kind,
  state,
  busy,
  onAllow,
}: {
  kind: MediaKind;
  state: MediaPermissionView;
  busy: boolean;
  onAllow: () => void;
}) {
  const Icon = kind === 'microphone' ? Mic : Video;
  const copy = PERMISSION_COPY[state];
  const tone = ['granted', 'denied', 'insecure', 'unsupported'].includes(state) ? state : 'prompt';
  return (
    <div className="setting-row bordered media-row">
      <span className="with-icon"><Icon size={16} /> {MEDIA_LABELS[kind]}<small>{copy.hint}</small></span>
      <div className="media-row-actions">
        <span className={`permission-pill ${tone}`}>
          {state === 'granted' && <Check size={11} />}
          {copy.label}
        </span>
        <button type="button" className="button subtle" onClick={onAllow} disabled={busy}>
          {busy ? 'Asking...' : state === 'granted' ? 'Test again' : 'Allow'}
        </button>
      </div>
    </div>
  );
}

function Qr() {
  const cells = Array.from({ length: 81 }, (_, i) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const corner = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
    return corner ? (r + c) % 2 === 0 : (r * 7 + c * 3 + i) % 3 !== 0;
  });
  return <div className="qr" aria-label="Authenticator QR placeholder">{cells.map((filled, i) => <span key={i} className={filled ? 'on' : ''} />)}</div>;
}

export default function SettingsPage() {
  const close = useUIStore((s) => s.toggleUserSettings);
  const notify = useUIStore((s) => s.addNotification);
  const setStoreTheme = useUIStore((s) => s.setTheme);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  const [tab, setTab] = useState<Tab>('profile');
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readPrefs().theme);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const [accent, setAccent] = useState(() => readPrefs().accent);
  const [density, setDensity] = useState<Density>(() => readPrefs().density);

  const [avatar, setAvatar] = useState<Media>(() => user?.avatar ? { url: user.avatar, name: 'avatar', size: 0, type: 'image/jpeg' } : null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [banner, setBanner] = useState<Media>(() => user?.banner ? { url: user.banner, name: 'background', size: 0, type: 'image/jpeg' } : null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerDirty, setBannerDirty] = useState(false);
  const [blur, setBlur] = useState(() => readPrefs().bannerBlur);
  const [darken, setDarken] = useState(() => readPrefs().bannerDarken);
  const [notifPrefs, setNotifPrefs] = useState(() => readPrefs().notifications);
  const [soundCatalog, setSoundCatalog] = useState<CatalogSound[]>([]);
  const [soundChoices, setSoundChoices] = useState(() => readPrefs().soundChoices);
  const [soundLoading, setSoundLoading] = useState(false);
  const [mediaStatus, setMediaStatus] = useState<Record<MediaKind, MediaPermissionView>>({
    microphone: 'unknown',
    camera: 'unknown',
  });
  const [mediaBusy, setMediaBusy] = useState<MediaAccessKind | null>(null);
  const [mediaNote, setMediaNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [cameraPreview, setCameraPreview] = useState<MediaStream | null>(null);
  const [language, setLanguage] = useState(() => readPrefs().language);
  const [timezone, setTimezone] = useState(() => readPrefs().timezone);
  const [dateFormat, setDateFormat] = useState(() => readPrefs().dateFormat);
  const [weekStart, setWeekStart] = useState(() => readPrefs().weekStart);
  const [dragTarget, setDragTarget] = useState<'avatar' | 'banner' | null>(null);
  const [saving, setSaving] = useState<'avatar' | 'banner' | 'details' | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [bio, setBio] = useState(user?.bio || '');
  const [statusText, setStatusText] = useState(user?.customStatus || '');
  const [blocked, setBlocked] = useState<{ id: string; username: string; avatar?: string }[]>([]);
  const [blockSearch, setBlockSearch] = useState('');
  const [hidden, setHidden] = useState([
    { id: 'h1', title: 'Muted thread', detail: '#general · 12 replies' },
    { id: 'h2', title: 'Hidden message', detail: 'Hidden from your view' },
  ]);
  const [twoFactor, setTwoFactor] = useState(false);
  const [code, setCode] = useState('');
  const [sessions, setSessions] = useState([
    { id: 's1', device: 'Chrome on Windows', location: 'Nairobi, KE', current: true, icon: Monitor },
    { id: 's2', device: 'blueChat on iPhone', location: 'Nairobi, KE', current: false, icon: Smartphone },
    { id: 's3', device: 'Firefox on Linux', location: 'Mombasa, KE', current: false, icon: Laptop },
  ]);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const activeTabRef = useRef(tab);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopMediaTracks(previewStreamRef.current);
      previewStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'light' : 'dark');
      if (readPrefs().theme === 'system') setStoreTheme(event.matches ? 'light' : 'dark');
    };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, [setStoreTheme]);

  useEffect(() => {
    void getSoundCatalog().then(setSoundCatalog);
  }, []);

  useEffect(() => {
    api.getFriends().then((response) => {
      const blocks = (response.data as any)?.blocks;
      if (response.success && Array.isArray(blocks)) {
        setBlocked(blocks.map((item: any) => ({
          id: item.blocked?.id || item.id,
          username: item.blocked?.username || 'Unknown user',
          avatar: item.blocked?.avatar,
        })));
      }
    });
  }, []);

  useEffect(() => {
    // Never overwrite a file the user is still working on.
    if (!avatarDirty) setAvatar(user?.avatar ? { url: user.avatar, name: 'avatar', size: 0, type: 'image/jpeg' } : null);
    if (!bannerDirty) setBanner(user?.banner ? { url: user.banner, name: 'background', size: 0, type: 'image/jpeg' } : null);
  }, [user?.id, user?.avatar, user?.banner, avatarDirty, bannerDirty]);

  // Text fields are independent from image state: changing an avatar must not
  // throw away a bio the user is still typing.
  useEffect(() => {
    setBio(user?.bio || '');
    setStatusText(user?.customStatus || '');
  }, [user?.id, user?.bio, user?.customStatus]);

  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode;

  const markSaved = () => setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const chooseTheme = (mode: ThemeMode) => {
    const resolved = mode === 'system' ? systemTheme : mode;
    setThemeMode(mode);
    writePrefs({ theme: mode });
    setStoreTheme(resolved);
  };
  const chooseAccent = (color: string) => {
    setAccent(color);
    writePrefs({ accent: color });
  };
  const chooseDensity = (value: Density) => {
    setDensity(value);
    writePrefs({ density: value });
  };
  const changeBlur = (value: number) => {
    setBlur(value);
    writePrefs({ bannerBlur: value });
    publishBackdropPrefs({ bannerBlur: value });
  };
  const changeDarken = (value: number) => {
    setDarken(value);
    writePrefs({ bannerDarken: value });
    publishBackdropPrefs({ bannerDarken: value });
  };
  const toggleNotification = (key: string, value: boolean) => {
    const next = { ...notifPrefs, [key]: value };
    setNotifPrefs(next);
    writePrefs({ notifications: next });
  };

  const chooseSound = (event: SoundEvent, value: string) => {
    const next = { ...soundChoices, [event]: value || undefined };
    setSoundChoices(next);
    writePrefs({ soundChoices: next });
    clearSoundCache();
    markSaved();
  };

  const refreshSounds = async () => {
    setSoundLoading(true);
    const list = await getSoundCatalog(true);
    setSoundCatalog(list);
    setSoundLoading(false);
    notify('Sounds refreshed', `${list.length} sounds available.`, 'success');
  };

  const previewCurrentSound = (event: SoundEvent) => {
    const choice = soundChoices[event];
    if (choice === SOUND_OFF) {
      notify('This event is silent', 'Choose another sound to preview it.', 'info');
      return;
    }
    const file = choice || soundCatalog[0]?.path;
    if (file) void previewSound(file);
  };

  const groupedSounds = Array.from(new Set(soundCatalog.map((sound) => sound.group))).map((group) => ({
    group,
    items: soundCatalog.filter((sound) => sound.group === group),
  }));

  const refreshMediaPermissions = async () => {
    const [microphone, camera] = await Promise.all([
      getMediaPermissionState('microphone'),
      getMediaPermissionState('camera'),
    ]);
    setMediaStatus({ microphone, camera });
  };

  const stopCameraPreview = (clearState = true) => {
    stopMediaTracks(previewStreamRef.current);
    previewStreamRef.current = null;
    if (clearState) setCameraPreview(null);
  };

  const requestMediaPermission = async (kind: MediaAccessKind) => {
    if (!mountedRef.current) return;
    setMediaBusy(kind);
    setMediaNote(null);
    const result = await requestMediaAccess(kind);
    const stale = !mountedRef.current || activeTabRef.current !== 'voice';
    if (stale) {
      stopMediaTracks(result.stream);
      if (mountedRef.current) setMediaBusy(null);
      return;
    }

    setMediaBusy(null);
    await refreshMediaPermissions();
    if (!mountedRef.current || activeTabRef.current !== 'voice') return;

    if (!result.ok) {
      setMediaNote({ tone: 'error', text: result.message });
      notify('Access not granted', result.message, 'error');
      return;
    }

    if (kind === 'microphone') {
      stopMediaTracks(result.stream);
      stopCameraPreview();
    } else {
      stopCameraPreview(false);
      const preview = new MediaStream(result.stream?.getVideoTracks() || []);
      if (kind === 'both') stopMediaTracks(new MediaStream(result.stream?.getAudioTracks() || []));
      previewStreamRef.current = preview;
      setCameraPreview(preview);
    }

    setMediaNote({ tone: 'ok', text: result.message });
    notify('Access ready', result.message, 'success');
  };

  useEffect(() => {
    activeTabRef.current = tab;
    if (tab !== 'voice') {
      stopCameraPreview();
      return;
    }
    void refreshMediaPermissions();
    const stopWatching = [
      watchMediaPermission('microphone', () => void refreshMediaPermissions()),
      watchMediaPermission('camera', () => void refreshMediaPermissions()),
    ];
    return () => stopWatching.forEach((stop) => stop());
  }, [tab]);

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video) return;
    video.srcObject = cameraPreview;
    if (cameraPreview) void video.play().catch(() => undefined);
  }, [cameraPreview, tab]);

  const pickFile = (file: File | undefined, target: 'avatar' | 'banner') => {
    setError('');
    if (!file) return;
    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      notify('That file will not work', problem, 'error');
      return;
    }
    const media: Media = {
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      type: file.type || (file.name.toLowerCase().endsWith('.gif') ? 'image/gif' : 'video/mp4'),
    };
    if (target === 'avatar') {
      if (avatar?.url.startsWith('blob:')) URL.revokeObjectURL(avatar.url);
      setAvatar(media);
      setAvatarFile(file);
      setAvatarDirty(true);
    } else {
      if (banner?.url.startsWith('blob:')) URL.revokeObjectURL(banner.url);
      setBanner(media);
      setBannerFile(file);
      setBannerDirty(true);
    }
  };

  const cacheMediaLocally = async (target: 'avatar' | 'banner', file: File) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return false;
    try {
      const dataUrl = await fileToDataUrl(file);
      // Keep small images in the local cache; a large video would exceed the
      // browser's storage quota, so report that honestly instead.
      if (!dataUrl || dataUrl.length > 2_000_000) return false;
      const patch = target === 'avatar' ? { avatar: dataUrl } : { banner: dataUrl };
      writeMedia(currentUser.id, { ...patch, synced: false });
      useAuthStore.setState({ user: { ...currentUser, ...patch } });
      return true;
    } catch {
      return false;
    }
  };

  const saveMedia = async (target: 'avatar' | 'banner') => {
    const file = target === 'avatar' ? avatarFile : bannerFile;
    if (!file && !(target === 'avatar' ? avatarDirty : bannerDirty)) return;
    setSaving(target);
    setError('');

    let url = '';
    if (file) {
      const uploaded = await api.uploadMedia(file, target);
      if (!uploaded.success || !uploaded.data) {
        const cached = await cacheMediaLocally(target, file);
        setSaving(null);
        if (cached) {
          if (target === 'avatar') {
            setAvatarFile(null);
            setAvatarDirty(false);
            setAvatar({ url: useAuthStore.getState().user?.avatar || '', name: file.name, size: file.size, type: file.type });
          } else {
            setBannerFile(null);
            setBannerDirty(false);
            setBanner({ url: useAuthStore.getState().user?.banner || '', name: file.name, size: file.size, type: file.type });
          }
          setError('Saved on this device. We will sync it when the server is back.');
          notify('Saved locally', 'Your image will stay here and sync when possible.', 'warning');
        } else {
          setError(uploaded.error || 'Upload failed. The change was not kept.');
          notify('Not saved', 'The server could not accept this file and it was too large to keep locally.', 'error');
        }
        return;
      }
      url = uploaded.data.url;
    }

    const ok = await updateUser(target === 'avatar' ? { avatar: url } : { banner: url });
    setSaving(null);
    setError('');

    // Read back from the store: it holds the confirmed value, or the
    // optimistic local value when the server could not be reached.
    const refreshed = useAuthStore.getState().user;
    const finalUrl = target === 'avatar' ? refreshed?.avatar : refreshed?.banner;

    if (target === 'avatar') {
      setAvatarFile(null);
      setAvatarDirty(false);
      setAvatar(finalUrl ? { url: finalUrl, name: 'avatar', size: 0, type: file?.type || 'image/jpeg' } : null);
    } else {
      setBannerFile(null);
      setBannerDirty(false);
      setBanner(finalUrl ? { url: finalUrl, name: 'background', size: 0, type: file?.type || 'image/jpeg' } : null);
    }

    if (!ok) {
      setError('Saved on this device. We will sync it when the server is back.');
      notify('Saved locally', 'Your image will stay here and sync when possible.', 'warning');
      return;
    }

    markSaved();
    notify('Saved', target === 'avatar' ? 'Your new avatar is live.' : 'Your new background is live.', 'success');
  };

  const saveDetails = async () => {
    setSaving('details');
    const ok = await updateUser({ bio, customStatus: statusText });
    setSaving(null);
    if (ok) {
      markSaved();
      notify('Saved', 'Your profile details were updated.', 'success');
    } else {
      notify('Not saved', 'Your account did not accept that change.', 'error');
    }
  };

  const filteredBlocked = blocked.filter((item) => item.username.toLowerCase().includes(blockSearch.toLowerCase()));

  const mediaEnvironmentNote = getMediaEnvironmentNote();
  const allowedMediaCount = Object.values(mediaStatus).filter((state) => state === 'granted').length;
  const mediaSummary = mediaEnvironmentNote
    ? mediaEnvironmentNote
    : allowedMediaCount === 2
      ? 'Microphone and camera are ready for calls.'
      : mediaStatus.microphone === 'denied' || mediaStatus.camera === 'denied'
        ? 'One or more devices are blocked in your browser.'
        : 'blueChat will ask when you start or answer a call.';

  return (
    <div
      className="settings-root"
      data-theme={resolvedTheme}
      style={{ '--accent': accent, '--density': density } as CSSProperties}
    >
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
        <div className="topbar-title">
          <strong>Settings</strong>
          <span>A little about you, and how things feel.</span>
        </div>
        <button className="icon-button" onClick={close} aria-label="Close settings"><X size={19} /></button>
      </header>

      <div className="shell">
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
        <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
          <button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button>
          <p className="sidebar-label">SETTINGS</p>
          <nav>
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={`nav-item${tab === item.id ? ' active' : ''}`} onClick={() => { setTab(item.id); setMenuOpen(false); }}>
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-person">
            <span className="person-avatar">{avatar ? <MediaView media={avatar} className="person-media" /> : (user?.username?.[0]?.toUpperCase() || '?')}</span>
            <span><strong>{user?.username || 'You'}</strong><small>{user?.email}</small></span>
          </div>
        </aside>

        <main className="content-area">
          <motion.div key={tab} className="content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            {tab === 'profile' && (
              <>
                <div className="page-intro">
                  <span className="hello">Hey, {user?.username?.split(' ')[0] || 'there'}.</span>
                  <h1>Profile</h1>
                  <p>A few things people notice first. Changes are saved to your account.</p>
                </div>

                <Card title="Profile picture" intro="GIFs and short videos loop quietly with a soft ring around them.">
                  <div className="avatar-row">
                    <div
                      className={`avatar-drop${dragTarget === 'avatar' ? ' dragging' : ''}${avatar?.type.startsWith('video/') || avatar?.type === 'image/gif' ? ' animated' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragTarget('avatar'); }}
                      onDragLeave={() => setDragTarget(null)}
                      onDrop={(e) => { e.preventDefault(); setDragTarget(null); pickFile(e.dataTransfer.files[0], 'avatar'); }}
                      onClick={() => avatarInput.current?.click()}
                    >
                      {avatar ? <MediaView media={avatar} className="avatar-media" /> : <><Camera size={24} /><span>Add photo</span></>}
                      <span className="avatar-camera"><Upload size={13} /></span>
                    </div>
                    <div className="avatar-copy">
                      <p>Drop a file on the circle, or choose one. JPG, PNG, WebP, GIF, MP4 and WebM all work.</p>
                      <div className="row-actions">
                        <button className="button subtle" onClick={() => avatarInput.current?.click()}>Choose file</button>
                        <button className="button primary" disabled={!avatarDirty || saving === 'avatar'} onClick={() => saveMedia('avatar')}>
                          {saving === 'avatar' ? 'Saving...' : 'Save picture'}
                        </button>
                        {avatar && (
                          <button className="button text danger" onClick={() => { if (avatar.url.startsWith('blob:')) URL.revokeObjectURL(avatar.url); setAvatar(null); setAvatarFile(null); setAvatarDirty(true); }}>Remove</button>
                        )}
                      </div>
                      {avatar && <p className="file-note">{avatar.name}{avatar.size ? ` · ${formatSize(avatar.size)}` : ''}{avatarDirty ? ' · not saved yet' : ''}</p>}
                    </div>
                    <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.gif,.mp4,.webm" hidden onChange={(e) => pickFile(e.target.files?.[0], 'avatar')} />
                  </div>
                </Card>

                <section className="card subsection">
                  <div className="card-head">
                    <h2>Display background</h2>
                    <p>Sits behind the app. Dim it a little if your image is bright.</p>
                  </div>
                  <div className="card-body">
                    <div className="background-grid">
                      <div className="background-controls">
                        <div
                          className={`drop-area${dragTarget === 'banner' ? ' dragging' : ''}`}
                          onDragOver={(e) => { e.preventDefault(); setDragTarget('banner'); }}
                          onDragLeave={() => setDragTarget(null)}
                          onDrop={(e) => { e.preventDefault(); setDragTarget(null); pickFile(e.dataTransfer.files[0], 'banner'); }}
                          onClick={() => bannerInput.current?.click()}
                        >
                          <Upload size={20} />
                          <span>{banner ? 'Replace background' : 'Drop an image or GIF'}</span>
                          <small>Up to 5 MB for GIFs</small>
                        </div>
                        <input ref={bannerInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,.gif" hidden onChange={(e) => pickFile(e.target.files?.[0], 'banner')} />
                        <label className="slider-label">Blur <span>{blur}px</span></label>
                        <input type="range" min="0" max="20" value={blur} onChange={(e) => changeBlur(Number(e.target.value))} />
                        <label className="slider-label">Darken <span>{darken}%</span></label>
                        <input type="range" min="0" max="85" value={darken} onChange={(e) => changeDarken(Number(e.target.value))} />
                        <div className="row-actions">
                          <button className="button primary" disabled={!bannerDirty || saving === 'banner'} onClick={() => saveMedia('banner')}>
                            {saving === 'banner' ? 'Saving...' : 'Save background'}
                          </button>
                          {banner && <button className="button text danger" onClick={() => { if (banner.url.startsWith('blob:')) URL.revokeObjectURL(banner.url); setBanner(null); setBannerFile(null); setBannerDirty(true); }}>Clear</button>}
                        </div>
                        {banner && <p className="file-note">{banner.name}{bannerDirty ? ' · not saved yet' : ''}</p>}
                      </div>
                      <div>
                        <p className="preview-label">How it looks</p>
                        <div className="chat-preview">
                          <div className="preview-bg" style={banner ? { backgroundImage: `url(${banner.url})`, filter: `blur(${blur}px)` } : undefined} />
                          <div className="preview-tint" style={{ backgroundColor: `rgba(7, 13, 31, ${darken / 100})` }} />
                          <div className="preview-chat">
                            <div className="preview-channel"><span>#</span> general <small>8 online</small></div>
                            <div className="preview-message"><b>Sam</b><p>the new background looks calm, I like it</p></div>
                            <div className="preview-message"><b>Rae</b><p>right? much easier to read</p></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <Card title="About you" intro="Shown on your profile card.">
                  <label className="field-label" htmlFor="status">Status</label>
                  <input id="status" value={statusText} maxLength={128} placeholder="What are you up to?" onChange={(e) => setStatusText(e.target.value)} />
                  <label className="field-label" htmlFor="bio">Bio</label>
                  <textarea id="bio" rows={3} maxLength={2000} value={bio} placeholder="A sentence or two is plenty." onChange={(e) => setBio(e.target.value)} />
                  <div className="save-line">
                    {error && <span className="error-text">{error}</span>}
                    {savedAt && !error && <span className="saved-text">Saved at {savedAt}</span>}
                    <button className="button primary" disabled={saving === 'details'} onClick={saveDetails}>{saving === 'details' ? 'Saving...' : 'Save changes'}</button>
                  </div>
                </Card>
              </>
            )}

            {tab === 'privacy' && (
              <>
                <div className="page-intro"><h1>Privacy</h1><p>Who can reach you, and what you keep out of sight.</p></div>
                <Card title="Blocked users" intro="People here cannot message you or see your profile.">
                  <div className="search-box"><Search size={16} /><input value={blockSearch} onChange={(e) => setBlockSearch(e.target.value)} placeholder="Search" /></div>
                  <div className="list">
                    {filteredBlocked.length === 0 && <div className="empty">Nobody blocked. Good.</div>}
                    {filteredBlocked.map((item) => (
                      <div className="list-row" key={item.id}>
                        <span className="list-avatar">{item.avatar ? <img src={item.avatar} alt="" /> : item.username[0]?.toUpperCase()}</span>
                        <span className="list-copy"><strong>{item.username}</strong><small>Blocked</small></span>
                        <button className="button subtle" onClick={async () => {
                          const result = await api.unblockUser(item.id);
                          if (result.success) { setBlocked((items) => items.filter((entry) => entry.id !== item.id)); notify('Unblocked', `${item.username} can reach you again.`, 'success'); }
                        }}><RotateCcw size={14} /> Unblock</button>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Hidden messages & threads" intro="Bring anything back with one click.">
                  <div className="list">
                    {hidden.length === 0 && <div className="empty">Nothing hidden right now.</div>}
                    {hidden.map((item) => (
                      <div className="list-row" key={item.id}>
                        <span className="list-icon"><Eye size={16} /></span>
                        <span className="list-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                        <button className="button subtle" onClick={() => { setHidden((items) => items.filter((entry) => entry.id !== item.id)); notify('Restored', item.title, 'success'); }}><RotateCcw size={14} /> Restore</button>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {tab === 'appearance' && (
              <>
                <div className="page-intro"><h1>Appearance</h1><p>Make the space feel like yours.</p></div>
                <Card title="Theme" intro="System follows whatever your device is using.">
                  <div className="theme-options">
                    {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                      <button key={mode} className={`theme-option${themeMode === mode ? ' selected' : ''}`} onClick={() => chooseTheme(mode)}>
                        <span className={`swatch swatch-${mode}`}><i /><i /><i /></span>
                        <span>{mode === 'system' ? 'System' : mode[0].toUpperCase() + mode.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </Card>
                <Card title="Accent" intro="The default is electric blue.">
                  <div className="accent-row">
                    {ACCENTS.map((color) => (
                      <button key={color} aria-label={`Accent ${color}`} className={`accent-dot${accent === color ? ' selected' : ''}`} style={{ background: color }} onClick={() => chooseAccent(color)}>{accent === color && <Check size={14} />}</button>
                    ))}
                    <label className="accent-custom"><input type="color" value={accent} onChange={(e) => chooseAccent(e.target.value)} aria-label="Custom accent" /> Custom</label>
                  </div>
                </Card>
                <Card title="Spacing" intro="Comfortable is the default.">
                  <div className="segmented">
                    {(['comfortable', 'compact', 'spacious'] as Density[]).map((option) => (
                      <button key={option} className={density === option ? 'selected' : ''} onClick={() => chooseDensity(option)}>{option[0].toUpperCase() + option.slice(1)}</button>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {tab === 'notifications' && (
              <>
                <div className="page-intro"><h1>Notifications</h1><p>Decide what gets your attention, and how.</p></div>
                <Card title="Conversations" intro="The things that are probably worth interrupting for.">
                  <div className="setting-row bordered">
                    <span className="with-icon"><MessageSquare size={16} /> Direct messages<small>When somebody sends you a DM.</small></span>
                    <Switch checked={notifPrefs.dmMessages} onChange={(value) => toggleNotification('dmMessages', value)} label="Direct messages" />
                  </div>
                  <div className="setting-row bordered">
                    <span className="with-icon"><Sparkles size={16} /> Mentions and replies<small>When your name comes up in a server.</small></span>
                    <Switch checked={notifPrefs.mentions} onChange={(value) => toggleNotification('mentions', value)} label="Mentions" />
                  </div>
                  <div className="setting-row bordered">
                    <span className="with-icon"><Bell size={16} /> Server activity<small>Every message in the servers you joined.</small></span>
                    <Switch checked={notifPrefs.serverMessages} onChange={(value) => toggleNotification('serverMessages', value)} label="Server activity" />
                  </div>
                </Card>
                <Card title="Delivery" intro="Where those notifications should land.">
                  <div className="setting-row bordered">
                    <span className="with-icon"><Smartphone size={16} /> Push notifications<small>Only when this device is away or idle.</small></span>
                    <Switch checked={notifPrefs.push} onChange={(value) => toggleNotification('push', value)} label="Push notifications" />
                  </div>
                  <div className="setting-row bordered">
                    <span className="with-icon"><Monitor size={16} /> Email digest<small>A single summary instead of a flood of messages.</small></span>
                    <Switch checked={notifPrefs.emailDigest} onChange={(value) => toggleNotification('emailDigest', value)} label="Email digest" />
                  </div>
                  <div className="setting-row bordered">
                    <span className="with-icon"><Bell size={16} /> Notification sounds<small>A soft chime for mentions and DMs.</small></span>
                    <div className="sound-row-actions">
                      <button type="button" className="button subtle" onClick={() => setTab('sounds')}>Choose sound</button>
                      <Switch checked={notifPrefs.sounds} onChange={(value) => toggleNotification('sounds', value)} label="Notification sounds" />
                    </div>
                  </div>
                </Card>
              </>
            )}

            {tab === 'sounds' && (
              <>
                <div className="page-intro"><h1>Sounds</h1><p>Pick the sound you like best for each moment.</p></div>
                <Card title="Event sounds" intro="Choose any sound from the sounds folder, or make an event silent.">
                  <div className="sound-toolbar">
                    <span>{soundCatalog.length} sounds available</span>
                    <button type="button" className="button subtle" onClick={refreshSounds} disabled={soundLoading}>
                      <RotateCcw size={14} /> Refresh
                    </button>
                  </div>
                  {EVENT_SOUNDS.map(({ id, label, detail, icon: Icon }) => (
                    <div className="setting-row bordered sound-setting" key={id}>
                      <span className="with-icon"><Icon size={16} /> {label}<small>{detail}</small></span>
                      <div className="sound-row-actions">
                        <select
                          aria-label={`${label} sound`}
                          value={soundChoices[id] ?? ''}
                          onChange={(event) => chooseSound(id, event.target.value)}
                        >
                          <option value="">Default</option>
                          <option value={SOUND_OFF}>Silent</option>
                          {groupedSounds.map(({ group, items }) => (
                            <optgroup key={group} label={group}>
                              {items.map((sound) => (
                                <option key={sound.path} value={sound.path}>{sound.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="button subtle sound-preview"
                          aria-label={`Preview ${label} sound`}
                          title="Preview"
                          onClick={() => previewCurrentSound(id)}
                        >
                          <Play size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {soundCatalog.length === 0 && (
                    <p className="empty">No sounds found. Drop audio files into public/sounds, then press Refresh.</p>
                  )}
                </Card>
                <Card title="Master toggle" intro="The global Sounds switch lives in Notifications.">
                  <div className="setting-row">
                    <span className="with-icon"><Volume2 size={16} /> Sounds enabled<small>Turn this off to mute every event, whatever is chosen above.</small></span>
                    <button type="button" className="button subtle" onClick={() => setTab('notifications')}>
                      Open Notifications
                    </button>
                  </div>
                </Card>
              </>
            )}

            {tab === 'voice' && (
              <>
                <div className="page-intro"><h1>Voice &amp; Video</h1><p>Allow blueChat to use your microphone and camera for calls.</p></div>
                <Card title="Device access" intro="Browser permissions are required before calls can connect.">
                  <div className="media-toolbar">
                    <span>{mediaSummary}</span>
                    <button
                      type="button"
                      className="button subtle"
                      onClick={() => void refreshMediaPermissions()}
                      disabled={mediaBusy !== null}
                    >
                      <RotateCcw size={14} /> Refresh status
                    </button>
                  </div>
                  <PermissionRow
                    kind="microphone"
                    state={mediaStatus.microphone}
                    busy={mediaBusy !== null}
                    onAllow={() => void requestMediaPermission('microphone')}
                  />
                  <PermissionRow
                    kind="camera"
                    state={mediaStatus.camera}
                    busy={mediaBusy !== null}
                    onAllow={() => void requestMediaPermission('camera')}
                  />
                  <div className="media-buttons">
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => void requestMediaPermission('both')}
                      disabled={mediaBusy !== null || Boolean(mediaEnvironmentNote)}
                    >
                      <ShieldCheck size={15} />
                      {mediaBusy === 'both' ? 'Waiting for permission...' : 'Allow microphone & camera'}
                    </button>
                    <button type="button" className="button subtle" onClick={() => setTab('sounds')}>
                      <Volume2 size={14} /> Choose call sound
                    </button>
                  </div>
                  {mediaNote && (
                    <p className={`media-note ${mediaNote.tone}`}>{mediaNote.text}</p>
                  )}
                  <p className="media-fineprint">
                    If a device is blocked, click the site icon in your browser’s address bar, set Microphone and Camera to Allow,
                    then come back and press Try again.
                  </p>
                </Card>

                <Card title="Camera preview" intro="A quick check that the camera you allowed is the one you want to use.">
                  <div className="media-preview-grid">
                    <div className={`camera-preview${cameraPreview ? ' live' : ''}`}>
                      {cameraPreview ? (
                        <video ref={cameraVideoRef} autoPlay playsInline muted />
                      ) : (
                        <span><Video size={24} /> Camera off</span>
                      )}
                    </div>
                    <div className="media-preview-copy">
                      <p>Calls use the same devices you approve here. Nothing is recorded or uploaded.</p>
                      <ul>
                        <li><Check size={13} /> Voice calls need a microphone.</li>
                        <li><Check size={13} /> Video calls need a microphone and camera.</li>
                        <li><Check size={13} /> You can change permission any time in your browser.</li>
                      </ul>
                      <button
                        type="button"
                        className="button subtle"
                        onClick={() => void requestMediaPermission('camera')}
                        disabled={mediaBusy !== null || Boolean(mediaEnvironmentNote)}
                      >
                        <Video size={14} /> {cameraPreview ? 'Retest camera' : 'Preview camera'}
                      </button>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {tab === 'language' && (
              <>
                <div className="page-intro"><h1>Language & region</h1><p>How dates, times, and words look across blueChat.</p></div>
                <Card title="Display" intro="These choices are saved on this device.">
                  <label className="field-label" htmlFor="language">Language</label>
                  <select id="language" value={language} onChange={(e) => { setLanguage(e.target.value); writePrefs({ language: e.target.value }); }}>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="es-ES">Español</option>
                    <option value="fr-FR">Français</option>
                    <option value="de-DE">Deutsch</option>
                    <option value="sw-KE">Kiswahili</option>
                  </select>
                  <label className="field-label" htmlFor="timezone">Time zone</label>
                  <select id="timezone" value={timezone} onChange={(e) => { setTimezone(e.target.value); writePrefs({ timezone: e.target.value }); }}>
                    <option value="auto">Match my device</option>
                    <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="America/New_York">America/New_York (ET)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  </select>
                </Card>
                <Card title="Formatting" intro="Small details, easier reading.">
                  <label className="field-label" htmlFor="date-format">Date format</label>
                  <select id="date-format" value={dateFormat} onChange={(e) => { setDateFormat(e.target.value); writePrefs({ dateFormat: e.target.value }); }}>
                    <option value="MMM d, yyyy">Mar 5, 2026</option>
                    <option value="dd/MM/yyyy">05/03/2026</option>
                    <option value="MM/dd/yyyy">03/05/2026</option>
                    <option value="yyyy-MM-dd">2026-03-05</option>
                  </select>
                  <label className="field-label" htmlFor="week-start">First day of week</label>
                  <select id="week-start" value={weekStart} onChange={(e) => { setWeekStart(e.target.value); writePrefs({ weekStart: e.target.value }); }}>
                    <option value="monday">Monday</option>
                    <option value="sunday">Sunday</option>
                    <option value="saturday">Saturday</option>
                  </select>
                </Card>
              </>
            )}

            {tab === 'security' && (
              <>
                <div className="page-intro"><h1>Security</h1><p>The boring stuff that keeps your account yours.</p></div>
                <Card title="Two-factor authentication" intro="Scan with an authenticator app, then enter the six digits it gives you.">
                  <div className="twofa">
                    <Qr />
                    <div className="twofa-copy">
                      <div className="code-row">
                        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000" aria-label="Verification code" />
                        <button className="button primary" onClick={() => {
                          if (!/^\d{6}$/.test(code)) { notify('Check the code', 'It should be six digits.', 'error'); return; }
                          setTwoFactor(true); setCode(''); notify('Two-factor is on', 'Nice, your account is better protected.', 'success');
                        }}><QrCode size={15} /> Verify</button>
                      </div>
                      <div className="setting-row"><span>Authenticator app</span><Switch checked={twoFactor} onChange={(value) => { setTwoFactor(value); notify(value ? 'Two-factor on' : 'Two-factor off', value ? 'Enabled.' : 'Disabled.', value ? 'success' : 'warning'); }} label="Authenticator app" /></div>
                      <div className="setting-row"><span>SMS backup codes</span><Switch checked={false} onChange={() => notify('Phone needed', 'Add a phone number to your account to enable SMS codes.', 'info')} label="SMS backup codes" /></div>
                    </div>
                  </div>
                </Card>
                <Card title="Active sessions" intro="Everywhere you are currently signed in.">
                  <div className="list">
                    {sessions.map((session) => {
                      const Icon = session.icon;
                      return (
                        <div className="list-row" key={session.id}>
                          <span className="list-icon"><Icon size={16} /></span>
                          <span className="list-copy"><strong>{session.device}{session.current && <em>this device</em>}</strong><small>{session.location}</small></span>
                          {!session.current && <button className="button text" onClick={() => setSessions((items) => items.filter((entry) => entry.id !== session.id))}><LogOut size={14} /> Revoke</button>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="save-line end"><button className="button subtle danger" onClick={() => { setSessions((items) => items.filter((item) => item.current)); notify('Done', 'Other devices were signed out.', 'success'); }}><LogOut size={15} /> Sign out everywhere else</button></div>
                </Card>
                <Card title="Password and alerts" intro="We will never ask for your password in chat.">
                  <div className="password-grid">
                    <div><label className="field-label">New password</label><input type="password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} placeholder="At least 8 characters" /></div>
                    <div><label className="field-label">Confirm password</label><input type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} placeholder="Type it again" /></div>
                  </div>
                  <div className="save-line">
                    <button className="button subtle" onClick={async () => {
                      if (passwords.next.length < 8 || passwords.next !== passwords.confirm) { notify('Check those', 'Use at least 8 characters and make them match.', 'error'); return; }
                      if (!user?.email) return;
                      const result = await api.forgotPassword(user.email);
                      notify(result.success ? 'Link sent' : 'Could not send', result.success ? `Check ${user.email} for a secure reset link.` : result.error || 'Try again.', result.success ? 'success' : 'error');
                      setPasswords({ next: '', confirm: '' });
                    }}><KeyRound size={15} /> Email me a reset link</button>
                  </div>
                  <div className="setting-row bordered"><span className="with-icon"><Bell size={16} /> Email me about new logins<small>Only when your account is used on a new device.</small></span><Switch checked={loginAlerts} onChange={setLoginAlerts} label="New login alerts" /></div>
                </Card>
              </>
            )}

            {tab === 'about' && (
              <>
                <div className="page-intro"><h1>About</h1><p>A small app for good conversations.</p></div>
                <Card title="blueChat" intro="Version 1.0 · made for communities that feel like home.">
                  <div className="about-panel">
                    <div className="about-logo">bC</div>
                    <div className="about-copy">
                      <strong>blueChat</strong>
                      <span>Signed in as {user?.email || user?.username || 'you'}</span>
                    </div>
                  </div>
                  <div className="about-facts">
                    <div><span>Theme</span><strong>{themeMode[0].toUpperCase() + themeMode.slice(1)}</strong></div>
                    <div><span>Language</span><strong>{language}</strong></div>
                    <div><span>Appearance</span><strong>{density[0].toUpperCase() + density.slice(1)}</strong></div>
                  </div>
                  <div className="save-line end"><button className="button subtle danger" onClick={logout}><LogOut size={15} /> Log out</button></div>
                </Card>
                <Card title="Shortcuts" intro="Little things that make moving around quicker.">
                  <div className="shortcut-list">
                    <div><span>Quick switcher</span><kbd>Ctrl</kbd><kbd>K</kbd></div>
                    <div><span>Search</span><kbd>Ctrl</kbd><kbd>F</kbd></div>
                    <div><span>Keyboard shortcuts</span><kbd>?</kbd></div>
                    <div><span>Send a message</span><kbd>Enter</kbd></div>
                    <div><span>New line</span><kbd>Shift</kbd><kbd>Enter</kbd></div>
                  </div>
                </Card>
              </>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
