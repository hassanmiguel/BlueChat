import { create } from 'zustand';
import { User } from '../types';
import { api } from '../services/api';
import { readMedia, writeMedia } from '../services/localProfile';
import { playSound } from '../services/soundService';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<boolean>;
  clearError: () => void;
}

const mediaOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');

const mediaUrl = (value?: string): string => {
  if (!value) return '';
  if (/^(https?:|blob:|data:)/.test(value)) return value;
  return `${mediaOrigin}${value.startsWith('/') ? value : `/${value}`}`;
};

const normalizeUser = (raw: any): User => ({
  ...raw,
  avatar: mediaUrl(raw.avatar),
  banner: mediaUrl(raw.banner),
  status: String(raw.status || 'online').toLowerCase() as User['status'],
  createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
});

/**
 * Blend the server profile with a locally cached copy. If the server comes
 * back with an empty avatar/banner we keep the last image the user picked,
 * and if a save never made it to the server we always prefer the local copy.
 */
const withCachedMedia = (user: User): User => {
  const cached = readMedia(user.id);
  if (!cached) return user;

  const keepCached = (serverValue: string, cachedValue?: string) => {
    if (cachedValue === undefined) return serverValue;
    if (!cached.synced) return cachedValue;
    return serverValue || cachedValue;
  };

  return {
    ...user,
    avatar: keepCached(user.avatar, cached.avatar),
    banner: keepCached(user.banner || '', cached.banner),
  };
};

const cachedValue = (value?: string): string | undefined => {
  if (value === undefined) return undefined;
  return value ? mediaUrl(value) : '';
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  initialize: async () => {
    set({ isLoading: true });
    await api.initCsrf();
    const response = await api.getMe();
    if (response.success && response.data) {
      set({ user: withCachedMedia(normalizeUser(response.data)), isAuthenticated: true, isLoading: false });
    } else {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    if (!email || !password) {
      set({ isLoading: false, error: 'Please fill in all fields' });
      return false;
    }

    const response = await api.login(email, password);
    if (response.success && response.data) {
      const { user, csrfToken } = response.data;
      api.setCsrfToken(csrfToken);
      set({ user: withCachedMedia(normalizeUser(user)), isAuthenticated: true, isLoading: false });
      void playSound('login');
      return true;
    }

    set({ isLoading: false, error: response.error || 'Invalid email or password' });
    return false;
  },

  register: async (username: string, email: string, password: string) => {
    set({ isLoading: true, error: null });
    if (!username || !email || !password) {
      set({ isLoading: false, error: 'Please fill in all fields' });
      return false;
    }
    if (password.length < 8) {
      set({ isLoading: false, error: 'Password must be at least 8 characters' });
      return false;
    }

    const response = await api.register(username, email, password);
    if (response.success && response.data) {
      const { user, csrfToken } = response.data;
      api.setCsrfToken(csrfToken);
      set({ user: withCachedMedia(normalizeUser(user)), isAuthenticated: true, isLoading: false });
      void playSound('login');
      return true;
    }

    set({ isLoading: false, error: response.error || 'Failed to create account' });
    return false;
  },

  logout: async () => {
    await api.logout();
    set({ user: null, isAuthenticated: false, error: null });
  },

  updateUser: async (updates: Partial<User>) => {
    const current = get().user;
    const touchesMedia = Object.prototype.hasOwnProperty.call(updates, 'avatar')
      || Object.prototype.hasOwnProperty.call(updates, 'banner');

    // Remember the choice immediately so closing the settings panel can
    // never make it vanish, even if the request is still in flight.
    if (touchesMedia && current) {
      writeMedia(current.id, {
        ...(Object.prototype.hasOwnProperty.call(updates, 'avatar')
          ? { avatar: cachedValue(updates.avatar) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, 'banner')
          ? { banner: cachedValue(updates.banner) }
          : {}),
        synced: false,
      });
    }

    const response = await api.updateProfile(updates);
    const succeeded = Boolean(response.success && response.data);

    if (succeeded && response.data) {
      if (touchesMedia && current) writeMedia(current.id, { synced: true });
      const user = withCachedMedia(normalizeUser(response.data));
      set({ user, error: null });
      return true;
    }

    // Optimistically keep the change in memory so the UI reflects what the
    // user just saved. A reload will fall back to the cached copy above.
    if (current) set({ user: withCachedMedia({ ...current, ...updates }) });
    set({ error: response.error || 'Failed to update profile' });
    return false;
  },

  clearError: () => set({ error: null }),
}));

api.setUnauthorizedHandler(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
