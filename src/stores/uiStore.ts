import { create } from 'zustand';

interface UIState {
  // Modals
  showUserSettings: boolean;
  showServerSettings: boolean;
  showCreateServer: boolean;
  showInviteModal: boolean;
  showProfilePopup: boolean;
  showSearchModal: boolean;
  showThreadPanel: boolean;
  
  // Voice
  isInVoice: boolean;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  voiceUsers: { userId: string; username: string; isMuted: boolean; isSpeaking: boolean }[];
  
  // Profile
  profileUserId: string | null;
  
  // Settings
  activeSettingsTab: string;
  activeServerSettingsTab: string;
  
  // Theme
  theme: 'dark' | 'light';
  accentColor: string;
  compactMode: boolean;
  
  // Notifications
  notifications: { id: string; title: string; message: string; type: 'info' | 'success' | 'error' | 'warning'; timestamp: number }[];
  
  // Actions
  toggleUserSettings: () => void;
  toggleServerSettings: () => void;
  toggleCreateServer: () => void;
  toggleInviteModal: () => void;
  toggleSearchModal: () => void;
  toggleThreadPanel: () => void;
  openProfile: (userId: string) => void;
  closeProfile: () => void;
  
  // Voice actions
  joinVoice: (channelId: string, channelName: string) => void;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  
  // Settings actions
  setActiveSettingsTab: (tab: string) => void;
  setActiveServerSettingsTab: (tab: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setAccentColor: (color: string) => void;
  toggleCompactMode: () => void;
  
  // Notifications
  addNotification: (title: string, message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  showUserSettings: false,
  showServerSettings: false,
  showCreateServer: false,
  showInviteModal: false,
  showProfilePopup: false,
  showSearchModal: false,
  showThreadPanel: false,
  
  isInVoice: false,
  voiceChannelId: null,
  voiceChannelName: null,
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreenSharing: false,
  isSpeaking: false,
  voiceUsers: [
    { userId: '2', username: 'DevMaster', isMuted: false, isSpeaking: true },
    { userId: '4', username: 'MusicBot', isMuted: true, isSpeaking: false },
  ],
  
  profileUserId: null,
  
  activeSettingsTab: 'account',
  activeServerSettingsTab: 'overview',
  
  theme: 'dark',
  accentColor: '#5865f2',
  compactMode: false,
  
  notifications: [],
  
  toggleUserSettings: () => set(s => ({ showUserSettings: !s.showUserSettings })),
  toggleServerSettings: () => set(s => ({ showServerSettings: !s.showServerSettings })),
  toggleCreateServer: () => set(s => ({ showCreateServer: !s.showCreateServer })),
  toggleInviteModal: () => set(s => ({ showInviteModal: !s.showInviteModal })),
  toggleSearchModal: () => set(s => ({ showSearchModal: !s.showSearchModal })),
  toggleThreadPanel: () => set(s => ({ showThreadPanel: !s.showThreadPanel })),
  
  openProfile: (userId) => set({ profileUserId: userId, showProfilePopup: true }),
  closeProfile: () => set({ profileUserId: null, showProfilePopup: false }),
  
  joinVoice: (channelId, channelName) => set({ isInVoice: true, voiceChannelId: channelId, voiceChannelName: channelName }),
  leaveVoice: () => set({ isInVoice: false, voiceChannelId: null, voiceChannelName: null, isMuted: false, isDeafened: false, isCameraOn: false, isScreenSharing: false }),
  toggleMute: () => set(s => ({ isMuted: !s.isMuted })),
  toggleDeafen: () => set(s => {
    if (!s.isDeafened) return { isDeafened: true, isMuted: true };
    return { isDeafened: false };
  }),
  toggleCamera: () => set(s => ({ isCameraOn: !s.isCameraOn })),
  toggleScreenShare: () => set(s => ({ isScreenSharing: !s.isScreenSharing })),
  
  setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),
  setActiveServerSettingsTab: (tab) => set({ activeServerSettingsTab: tab }),
  setTheme: (theme) => set({ theme }),
  setAccentColor: (color) => set({ accentColor: color }),
  toggleCompactMode: () => set(s => ({ compactMode: !s.compactMode })),
  
  addNotification: (title, message, type) => {
    const id = Date.now().toString();
    set(s => ({ notifications: [...s.notifications, { id, title, message, type, timestamp: Date.now() }] }));
    setTimeout(() => {
      set(s => ({ notifications: s.notifications.filter(n => n.id !== id) }));
    }, 5000);
  },
  removeNotification: (id) => set(s => ({ notifications: s.notifications.filter(n => n.id !== id) })),
}));
