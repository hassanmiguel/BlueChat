import { create } from 'zustand';
import { playSound } from '../services/soundService';
import { api } from '../services/api';

export type ActivityType = 'message' | 'mention' | 'call' | 'friend' | 'system';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  dmId?: string;
  channelId?: string;
  serverId?: string;
  peerId?: string;
  callType?: 'audio' | 'video';
  remote?: boolean;
}

const activityKey = (userId: string) => `bluechat:activity:${userId}`;

const readActivity = (userId?: string | null): ActivityItem[] => {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(activityKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ActivityItem[]).slice(0, 100) : [];
  } catch {
    return [];
  }
};

const writeActivity = (userId: string | null | undefined, items: ActivityItem[]) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(activityKey(userId), JSON.stringify(items.slice(0, 100)));
  } catch {
    /* Ignore quota / private-mode errors. */
  }
};

const remoteType = (type: string): ActivityType => {
  if (type === 'direct_message' || type === 'group_message') return 'message';
  if (type === 'mention' || type === 'reply') return 'mention';
  if (type.startsWith('friend')) return 'friend';
  if (type.includes('call')) return 'call';
  return 'system';
};

const fromRemote = (record: any): ActivityItem => {
  const link = record.link || '';
  const dmMatch = link.match(/[?&]dm=([^&]+)/);
  const channelMatch = link.match(/[?&]channel=([^&]+)/);
  return {
    id: record.id,
    type: remoteType(record.type),
    title: record.title,
    body: record.body || '',
    timestamp: new Date(record.createdAt).getTime(),
    read: Boolean(record.readAt),
    remote: true,
    ...(dmMatch ? { dmId: decodeURIComponent(dmMatch[1]) } : {}),
    ...(channelMatch ? { channelId: decodeURIComponent(channelMatch[1]) } : {}),
  };
};

interface ActivityState {
  items: ActivityItem[];
  load: (userId?: string | null) => void;
  loadRemote: () => Promise<void>;
  pushRemote: (record: any) => void;
  push: (userId: string | null | undefined, item: Omit<ActivityItem, 'id' | 'timestamp' | 'read'> & Partial<Pick<ActivityItem, 'id' | 'timestamp'>>) => void;
  markRead: (userId: string | null | undefined, id: string) => void;
  markAllRead: (userId: string | null | undefined) => void;
  clear: (userId?: string | null) => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  items: [],
  load: (userId) => set({ items: readActivity(userId) }),
  loadRemote: async () => {
    const response = await api.getNotifications();
    if (!response.success || !response.data) return;
    const remote = (response.data.notifications || []).map(fromRemote);
    const local = get().items.filter((item) => !item.remote);
    const merged = [...local, ...remote]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
    set({ items: merged });
  },
  pushRemote: (record) => {
    const entry = fromRemote(record);
    const next = [entry, ...get().items.filter((item) => item.id !== entry.id)].slice(0, 100);
    set({ items: next });
    void playSound('notification');
  },
  push: (userId, item) => {
    const entry: ActivityItem = {
      ...item,
      id: item.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      timestamp: item.timestamp || Date.now(),
      read: false,
    };
    const next = [entry, ...get().items.filter((existing) => existing.id !== entry.id)].slice(0, 100);
    writeActivity(userId, next);
    set({ items: next });
    void playSound('notification');
  },
  markRead: (userId, id) => {
    const next = get().items.map((item) => (item.id === id ? { ...item, read: true } : item));
    writeActivity(userId, next);
    set({ items: next });
    if (get().items.find((item) => item.id === id)?.remote) void api.markNotificationRead(id);
  },
  markAllRead: (userId) => {
    const next = get().items.map((item) => ({ ...item, read: true }));
    writeActivity(userId, next);
    set({ items: next });
    void api.markAllNotificationsRead();
  },
  clear: (userId) => {
    writeActivity(userId, []);
    set({ items: [] });
    void api.clearNotifications();
  },
}));

export const selectUnreadCount = (state: ActivityState) => state.items.filter((item) => !item.read).length;
