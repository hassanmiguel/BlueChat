// Socket.io Client Service for real-time communication
// Connects to the backend Socket.io server

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

type EventHandler = (...args: any[]) => void;

class SocketService {
  private socket: any = null;
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect(token: string) {
    if (this.socket?.connected) return;

    try {
      // Dynamic import to avoid bundling socket.io-client if not needed
      import('socket.io-client').then(({ io }) => {
        this.socket = io(SOCKET_URL, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: 1000,
        });

        this.socket.on('connect', () => {
          console.log('Socket connected');
          this.reconnectAttempts = 0;
          this.emit('connected');
        });

        this.socket.on('disconnect', (reason: string) => {
          console.log('Socket disconnected:', reason);
          this.emit('disconnected', reason);
        });

        this.socket.on('connect_error', (error: any) => {
          console.warn('Socket connection error:', error.message);
          this.reconnectAttempts++;
          this.emit('connection_error', error);
        });

        // Re-attach all registered listeners
        this.listeners.forEach((handlers, event) => {
          handlers.forEach(handler => {
            this.socket.on(event, handler);
          });
        });
      }).catch(err => {
        console.warn('Socket.io client not available:', err.message);
      });
    } catch (err) {
      console.warn('Failed to initialize socket connection');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  off(event: string, handler?: EventHandler) {
    if (handler) {
      this.listeners.get(event)?.delete(handler);
      if (this.socket) {
        this.socket.off(event, handler);
      }
    } else {
      this.listeners.delete(event);
      if (this.socket) {
        this.socket.off(event);
      }
    }
  }

  emit(event: string, ...args: any[]) {
    // Emit to local listeners (for when socket isn't connected)
    this.listeners.get(event)?.forEach(handler => handler(...args));
    
    // Emit to server if connected
    if (this.socket?.connected) {
      this.socket.emit(event, ...args);
    }
  }

  // Server events
  joinServer(serverId: string) {
    this.emit('server:join', serverId);
  }

  leaveServer(serverId: string) {
    this.emit('server:leave', serverId);
  }

  joinChannel(channelId: string) {
    this.emit('channel:join', channelId);
  }

  leaveChannel(channelId: string) {
    this.emit('channel:leave', channelId);
  }

  // Voice events
  joinVoiceChannel(channelId: string) {
    this.emit('voice:join', channelId);
  }

  leaveVoiceChannel(channelId: string) {
    this.emit('voice:leave', channelId);
  }

  toggleMute(channelId: string, isMuted: boolean) {
    this.emit('voice:mute', { channelId, isMuted });
  }

  toggleDeafen(channelId: string, isDeafened: boolean) {
    this.emit('voice:deafen', { channelId, isDeafened });
  }

  // Typing events
  startTyping(channelId: string) {
    this.emit('typing:start', channelId);
  }

  stopTyping(channelId: string) {
    this.emit('typing:stop', channelId);
  }

  get isConnected() {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();
export default socketService;
