// API Service Layer for blueChat
// Connects frontend to the Express backend
// Falls back to localStorage when backend is unavailable

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('bluechat_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('bluechat_token', token);
    } else {
      localStorage.removeItem('bluechat_token');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
      };
      
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Request failed' };
      }

      return { success: true, data };
    } catch (error) {
      // Network error - backend offline
      console.warn(`API call to ${endpoint} failed - backend offline`);
      return { success: false, error: 'Backend unavailable' };
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(username: string, email: string, password: string) {
    return this.request<{ user: any; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async updateProfile(updates: any) {
    return this.request('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  // Server endpoints
  async getServers() {
    return this.request('/servers');
  }

  async createServer(data: { name: string; icon?: string }) {
    return this.request('/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getServer(serverId: string) {
    return this.request(`/servers/${serverId}`);
  }

  async updateServer(serverId: string, data: any) {
    return this.request(`/servers/${serverId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteServer(serverId: string) {
    return this.request(`/servers/${serverId}`, { method: 'DELETE' });
  }

  async joinServer(inviteCode: string) {
    return this.request('/servers/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async leaveServer(serverId: string) {
    return this.request(`/servers/${serverId}/leave`, { method: 'POST' });
  }

  // Channel endpoints
  async getChannels(serverId: string) {
    return this.request(`/servers/${serverId}/channels`);
  }

  async createChannel(serverId: string, data: any) {
    return this.request(`/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateChannel(channelId: string, data: any) {
    return this.request(`/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteChannel(channelId: string) {
    return this.request(`/channels/${channelId}`, { method: 'DELETE' });
  }

  // Message endpoints
  async getMessages(channelId: string, limit = 50, before?: string) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return this.request(`/channels/${channelId}/messages?${params}`);
  }

  async sendMessage(channelId: string, content: string, replyTo?: string) {
    return this.request(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, replyTo }),
    });
  }

  async editMessage(messageId: string, content: string) {
    return this.request(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async deleteMessage(messageId: string) {
    return this.request(`/messages/${messageId}`, { method: 'DELETE' });
  }

  async addReaction(messageId: string, emoji: string) {
    return this.request(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  async removeReaction(messageId: string, emoji: string) {
    return this.request(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    });
  }

  async pinMessage(messageId: string) {
    return this.request(`/messages/${messageId}/pin`, { method: 'POST' });
  }

  // DM endpoints
  async getDirectMessages() {
    return this.request('/dms');
  }

  async createDirectMessage(userIds: string[]) {
    return this.request('/dms', {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  // Friends endpoints
  async getFriends() {
    return this.request('/friends');
  }

  async sendFriendRequest(username: string) {
    return this.request('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async acceptFriendRequest(friendId: string) {
    return this.request(`/friends/${friendId}/accept`, { method: 'POST' });
  }

  async declineFriendRequest(friendId: string) {
    return this.request(`/friends/${friendId}/decline`, { method: 'POST' });
  }

  async blockUser(userId: string) {
    return this.request(`/friends/${userId}/block`, { method: 'POST' });
  }

  // Role endpoints
  async getRoles(serverId: string) {
    return this.request(`/servers/${serverId}/roles`);
  }

  async createRole(serverId: string, data: any) {
    return this.request(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async assignRole(serverId: string, userId: string, roleId: string) {
    return this.request(`/servers/${serverId}/members/${userId}/roles/${roleId}`, {
      method: 'PUT',
    });
  }

  // Moderation endpoints
  async kickUser(serverId: string, userId: string) {
    return this.request(`/servers/${serverId}/members/${userId}/kick`, { method: 'POST' });
  }

  async banUser(serverId: string, userId: string, reason?: string) {
    return this.request(`/servers/${serverId}/members/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async timeoutUser(serverId: string, userId: string, duration: number) {
    return this.request(`/servers/${serverId}/members/${userId}/timeout`, {
      method: 'POST',
      body: JSON.stringify({ duration }),
    });
  }

  async getAuditLog(serverId: string) {
    return this.request(`/servers/${serverId}/audit-log`);
  }

  // Search
  async searchMessages(channelId: string, query: string, filters?: any) {
    const params = new URLSearchParams({ q: query, ...filters });
    return this.request(`/channels/${channelId}/search?${params}`);
  }
}

export const api = new ApiClient(API_BASE);
export default api;
