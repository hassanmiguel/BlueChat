import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

// Simulated user database
const mockUsers: (User & { password: string })[] = [
  {
    id: '1',
    username: 'BlueAdmin',
    discriminator: '0001',
    email: 'admin@bluechat.com',
    password: 'admin123',
    avatar: '',
    banner: '',
    bio: 'Welcome to blueChat! 🎉',
    status: 'online',
    customStatus: 'Building something awesome',
    createdAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    username: 'DevMaster',
    discriminator: '4242',
    email: 'dev@bluechat.com',
    password: 'dev123',
    avatar: '',
    bio: 'Full-stack developer',
    status: 'online',
    customStatus: 'Coding...',
    createdAt: new Date('2024-02-15'),
  },
  {
    id: '3',
    username: 'PixelArtist',
    discriminator: '7777',
    email: 'pixel@bluechat.com',
    password: 'pixel123',
    avatar: '',
    bio: 'Digital artist & designer',
    status: 'idle',
    createdAt: new Date('2024-03-20'),
  },
];

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const foundUser = mockUsers.find(u => u.email === email && u.password === password);
    
    if (foundUser) {
      const { password: _, ...userWithoutPassword } = foundUser;
      set({ user: userWithoutPassword, isAuthenticated: true, isLoading: false });
      localStorage.setItem('bluechat_user', JSON.stringify(userWithoutPassword));
      return true;
    }
    
    set({ isLoading: false });
    return false;
  },

  register: async (username: string, email: string, password: string) => {
    set({ isLoading: true });
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if user exists
    const exists = mockUsers.find(u => u.email === email);
    if (exists) {
      set({ isLoading: false });
      return false;
    }
    
    const newUser: User = {
      id: String(mockUsers.length + 1),
      username,
      discriminator: String(Math.floor(Math.random() * 9999)).padStart(4, '0'),
      email,
      avatar: '',
      bio: '',
      status: 'online',
      createdAt: new Date(),
    };
    
    mockUsers.push({ ...newUser, password });
    set({ user: newUser, isAuthenticated: true, isLoading: false });
    localStorage.setItem('bluechat_user', JSON.stringify(newUser));
    return true;
  },

  logout: () => {
    set({ user: null, isAuthenticated: false });
    localStorage.removeItem('bluechat_user');
  },

  updateUser: (updates: Partial<User>) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { ...currentUser, ...updates };
      set({ user: updatedUser });
      localStorage.setItem('bluechat_user', JSON.stringify(updatedUser));
    }
  },
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
