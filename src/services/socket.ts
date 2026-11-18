import { io, Socket } from 'socket.io-client';
import { api } from './api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

type EventHandler = (...args: any[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<EventHandler>>();
  private refreshingToken = false;

  connect(): void {
    if (this.socket?.connected) return;
    this.socket?.disconnect();

    this.socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => this.emitLocal('connected'));
    this.socket.on('disconnect', () => this.emitLocal('disconnected'));
    this.socket.on('connect_error', (error: Error) => {
      this.emitLocal('connect_error', error);
      void this.refreshAndRetry(error);
    });

    for (const [event, handlers] of this.listeners) {
      for (const handler of handlers) {
        this.socket.on(event, handler);
      }
    }
  }

  /** The access-token cookie expires while a tab is open; renew it before retrying. */
  private async refreshAndRetry(error: Error): Promise<void> {
    const message = String(error?.message || '');
    if (!/auth|token|unauthorized/i.test(message) || this.refreshingToken) return;
    this.refreshingToken = true;
    try {
      const response = await api.refresh();
      if (response.success && this.socket) this.socket.connect();
    } finally {
      this.refreshingToken = false;
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    this.socket?.on(event, handler);

    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
    this.socket?.off(event, handler);
  }

  private emitLocal(event: string, ...args: any[]): void {
    for (const handler of this.listeners.get(event) || []) handler(...args);
  }

  emit(event: string, ...args: any[]): void {
    this.socket?.emit(event, ...args);
  }

  joinServer(serverId: string) { this.emit('server:join', serverId); }
  leaveServer(serverId: string) { this.emit('server:leave', serverId); }
  joinChannel(channelId: string) { this.emit('channel:join', channelId); }
  leaveChannel(channelId: string) { this.emit('channel:leave', channelId); }
  joinDm(dmId: string) { this.emit('dm:join', dmId); }
  joinVoice(channelId: string) { this.emit('voice:join', channelId); }
  leaveVoice(channelId: string) { this.emit('voice:leave', channelId); }
  setMuted(channelId: string, isMuted: boolean) { this.emit('voice:mute', { channelId, isMuted }); }
  setDeafened(channelId: string, isDeafened: boolean) { this.emit('voice:deafen', { channelId, isDeafened }); }
  startTyping(channelId: string) { this.emit('typing:start', channelId); }
  stopTyping(channelId: string) { this.emit('typing:stop', channelId); }

  // Peer-to-peer call signalling (the server relays these to the other user).
  callInvite(payload: { callId: string; toUserId: string; dmId: string; type: 'audio' | 'video' }) { this.emit('call:invite', payload); }
  callAccept(payload: { callId: string; toUserId: string }) { this.emit('call:accept', payload); }
  callDecline(payload: { callId: string; toUserId: string; reason?: string }) { this.emit('call:decline', payload); }
  callOffer(payload: { callId: string; toUserId: string; sdp: RTCSessionDescriptionInit }) { this.emit('call:offer', payload); }
  callAnswer(payload: { callId: string; toUserId: string; sdp: RTCSessionDescriptionInit }) { this.emit('call:answer', payload); }
  callIce(payload: { callId: string; toUserId: string; candidate: RTCIceCandidateInit }) { this.emit('call:ice', payload); }
  callEnd(payload: { callId: string; toUserId: string; reason?: string; duration?: number }) { this.emit('call:end', payload); }

  get isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }
}

export const socketService = new SocketService();
export default socketService;
