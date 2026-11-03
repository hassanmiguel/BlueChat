import { create } from 'zustand';
import { User } from '../types';
import { api } from '../services/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    if (!email || !password) {
      set({ isLoading: false, error: 'Please fill in all fields' });
      return false;
    }

    // Try backend API first
    const response = await api.login(email, password);

    if (response.success && response.data) {
      const { user, token } = response.data;
      api.setToken(token);
      set({ user, isAuthenticated: true, isLoading: false });
      localStorage.setItem('bluechat_user', JSON.stringify(user));
      return true;
    }

    // Fallback: check localStorage for previously registered accounts
    const storedAccounts = JSON.parse(localStorage.getItem('bluechat_accounts') || '[]');
    const foundAccount = storedAccounts.find((a: any) => a.email === email && a.password === password);

    if (foundAccount) {
      const { password: _, ...userWithoutPassword } = foundAccount;
      set({ user: userWithoutPassword, isAuthenticated: true, isLoading: false });
      localStorage.setItem('bluechat_user', JSON.stringify(userWithoutPassword));
      return true;
    }

    set({ isLoading: false, error: 'Invalid email or password' });
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

    // Try backend API first
    const response = await api.register(username, email, password);

    if (response.success && response.data) {
      const { user, token } = response.data;
      api.setToken(token);
      set({ user, isAuthenticated: true, isLoading: false });
      localStorage.setItem('bluechat_user', JSON.stringify(user));
      return true;
    }

    // Fallback: store in localStorage
    const storedAccounts = JSON.parse(localStorage.getItem('bluechat_accounts') || '[]');
    const exists = storedAccounts.find((a: any) => a.email === email);

    if (exists) {
      set({ isLoading: false, error: 'An account with this email already exists' });
      return false;
    }

    const newUser: User = {
      id: `user_${Date.now()}`,
      username,
      discriminator: String(Math.floor(Math.random() * 9999)).padStart(4, '0'),
      email,
      avatar: '',
      bio: '',
      status: 'online',
      createdAt: new Date(),
    };

    storedAccounts.push({ ...newUser, password });
    localStorage.setItem('bluechat_accounts', JSON.stringify(storedAccounts));

    set({ user: newUser, isAuthenticated: true, isLoading: false });
    localStorage.setItem('bluechat_user', JSON.stringify(newUser));
    return true;
  },

  logout: () => {
    set({ user: null, isAuthenticated: false, error: null });
    api.setToken(null);
    localStorage.removeItem('bluechat_user');
    localStorage.removeItem('bluechat_token');
  },

  updateUser: (updates: Partial<User>) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { ...currentUser, ...updates };
      set({ user: updatedUser });
      localStorage.setItem('bluechat_user', JSON.stringify(updatedUser));
      
      // Also update in stored accounts
      const storedAccounts = JSON.parse(localStorage.getItem('bluechat_accounts') || '[]');
      const idx = storedAccounts.findIndex((a: any) => a.id === updatedUser.id);
      if (idx !== -1) {
        storedAccounts[idx] = { ...storedAccounts[idx], ...updates };
        localStorage.setItem('bluechat_accounts', JSON.stringify(storedAccounts));
      }
    }
  },

  clearError: () => set({ error: null }),
}));

// Initialize from localStorage
const savedUser = localStorage.getItem('bluechat_user');
if (savedUser) {
  try {
    const user = JSON.parse(savedUser);
    useAuthStore.setState({ user, isAuthenticated: true });
  } catch (e) {
    localStorage.removeItem('bluechat_user');
  }
}
