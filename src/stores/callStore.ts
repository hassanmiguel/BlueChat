import { create } from 'zustand';

export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export interface CallRecord {
  id: string;
  peerId: string;
  peerName: string;
  dmId: string;
  type: CallType;
  direction: 'incoming' | 'outgoing';
  status: 'completed' | 'missed' | 'declined' | 'busy' | 'failed';
  duration: number;
  timestamp: number;
}

const historyKey = (userId: string) => `bluechat:calls:${userId}`;

const readHistory = (userId?: string | null): CallRecord[] => {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(historyKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CallRecord[]).slice(0, 100) : [];
  } catch {
    return [];
  }
};

const writeHistory = (userId: string | null | undefined, records: CallRecord[]) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(historyKey(userId), JSON.stringify(records.slice(0, 100)));
  } catch {
    /* Storage can be unavailable – history simply stays in memory. */
  }
};

interface CallState {
  status: CallStatus;
  callId: string | null;
  peerId: string | null;
  peerName: string;
  peerAvatar: string | null;
  dmId: string | null;
  type: CallType;
  direction: 'incoming' | 'outgoing';
  startedAt: number | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  message: string;
  history: CallRecord[];

  patch: (values: Partial<CallState>) => void;
  loadHistory: (userId?: string | null) => void;
  recordCall: (
    userId: string | null | undefined,
    record: Omit<CallRecord, 'id' | 'timestamp'> & Partial<Pick<CallRecord, 'id' | 'timestamp'>>,
  ) => CallRecord;
  clearHistory: (userId?: string | null) => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  status: 'idle',
  callId: null,
  peerId: null,
  peerName: '',
  peerAvatar: null,
  dmId: null,
  type: 'audio',
  direction: 'outgoing',
  startedAt: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOn: false,
  isScreenSharing: false,
  message: '',
  history: [],

  patch: (values) => set(values),
  loadHistory: (userId) => set({ history: readHistory(userId) }),
  recordCall: (userId, record) => {
    const entry: CallRecord = {
      ...record,
      id: record.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`),
      timestamp: record.timestamp || Date.now(),
    };
    const next = [entry, ...get().history.filter((item) => item.id !== entry.id)].slice(0, 100);
    writeHistory(userId, next);
    set({ history: next });
    return entry;
  },
  clearHistory: (userId) => {
    writeHistory(userId, []);
    set({ history: [] });
  },
}));

export const resetCallState = () => useCallStore.getState().patch({
  status: 'idle',
  callId: null,
  peerId: null,
  peerName: '',
  peerAvatar: null,
  dmId: null,
  type: 'audio',
  direction: 'outgoing',
  startedAt: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOn: false,
  isScreenSharing: false,
  message: '',
});
