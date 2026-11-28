const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const CSRF_COOKIE = 'bluechat_csrf';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DiscoveredUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bio?: string | null;
  status: string;
  customStatus?: string | null;
  createdAt: string;
  mutualServers: number;
}

export interface DiscoverUsersResult {
  users: DiscoveredUser[];
  total: number;
  seed: string;
  query: string;
}

const readCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

class ApiClient {
  private baseUrl: string;
  private csrfToken: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  private getCsrfToken(): string | null {
    const fromCookie = readCookie(CSRF_COOKIE);
    if (fromCookie) {
      this.csrfToken = fromCookie;
    }
    return this.csrfToken;
  }

  setCsrfToken(token: string) {
    this.csrfToken = token;
  }

  private async rawRequest<T>(endpoint: string, options: RequestInit, retry = true): Promise<ApiResponse<T>> {
    const method = (options.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = this.getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        method,
        headers,
        credentials: 'include',
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        if (response.status === 401 && retry && !endpoint.startsWith('/auth/')) {
          const refreshed = await this.refresh();
          if (refreshed.success) return this.rawRequest<T>(endpoint, options, false);
          this.onUnauthorized?.();
        }
        return { success: false, error: data.error || `Request failed (${response.status})` };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  private request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.rawRequest<T>(endpoint, options);
  }

  async initCsrf(): Promise<void> {
    const response = await this.request<{ csrfToken: string }>('/auth/csrf');
    if (response.success && response.data) this.setCsrfToken(response.data.csrfToken);
  }

  async login(email: string, password: string) {
    return this.request<{ user: any; csrfToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(username: string, email: string, password: string) {
    return this.request<{ user: any; csrfToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async refresh() {
    return this.request<{ csrfToken: string }>('/auth/refresh', { method: 'POST' });
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

  async uploadMedia(file: File, field: 'avatar' | 'banner' | 'file' = 'file'): Promise<ApiResponse<{ url: string; name?: string; size?: number; type?: string }>> {
    const body = new FormData();
    body.append('file', file);

    try {
      const response = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        body,
        credentials: 'include',
        headers: {
          'X-CSRF-Token': this.getCsrfToken() || '',
          'X-Upload-Field': field,
        },
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error || 'Upload failed' };
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Upload failed' };
    }
  }

  async forgotPassword(email: string) {
    return this.request('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, password: string) {
    return this.request('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async verifyEmail(token: string) {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async resendVerification() {
    return this.request('/auth/resend-verification', { method: 'POST' });
  }

  async getNotifications(limit = 50) {
    return this.request<{ notifications: any[]; unread: number }>(`/notifications?limit=${limit}`);
  }

  async markNotificationRead(id: string) {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'POST' });
  }

  async clearNotifications() {
    return this.request('/notifications', { method: 'DELETE' });
  }

  async deleteNotification(id: string) {
    return this.request(`/notifications/${id}`, { method: 'DELETE' });
  }

  async saveNotificationPrefs(prefs: Record<string, boolean>) {
    return this.request('/notifications/preferences', { method: 'POST', body: JSON.stringify(prefs) });
  }

  async globalSearch(query: string, filters: Record<string, string | boolean> = {}) {
    const params = new URLSearchParams({ q: query });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
    }
    return this.request<{
      users: any[]; messages: any[]; servers: any[]; channels: any[]; files: any[];
    }>(`/search?${params}`);
  }

  async kickMember(serverId: string, userId: string, reason?: string) {
    return this.request(`/moderation/${serverId}/kick/${userId}`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  async banMember(serverId: string, userId: string, reason?: string, expiresAt?: string) {
    return this.request(`/moderation/${serverId}/ban/${userId}`, { method: 'POST', body: JSON.stringify({ reason, expiresAt }) });
  }

  async unbanMember(serverId: string, userId: string) {
    return this.request(`/moderation/${serverId}/ban/${userId}`, { method: 'DELETE' });
  }

  async timeoutMember(serverId: string, userId: string, minutes: number, reason?: string) {
    return this.request(`/moderation/${serverId}/timeout/${userId}`, { method: 'POST', body: JSON.stringify({ minutes, reason }) });
  }

  async removeTimeout(serverId: string, userId: string) {
    return this.request(`/moderation/${serverId}/timeout/${userId}`, { method: 'DELETE' });
  }

  async getBans(serverId: string) {
    return this.request(`/moderation/${serverId}/bans`);
  }

  async getTimeouts(serverId: string) {
    return this.request(`/moderation/${serverId}/timeouts`);
  }

  async getReports(serverId: string) {
    return this.request(`/moderation/${serverId}/reports`);
  }

  async updateReport(serverId: string, reportId: string, status: 'OPEN' | 'RESOLVED' | 'DISMISSED') {
    return this.request(`/moderation/${serverId}/reports/${reportId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  async reportContent(serverId: string, targetType: 'USER' | 'MESSAGE' | 'SERVER', targetId: string, reason: string) {
    return this.request(`/moderation/${serverId}/reports`, { method: 'POST', body: JSON.stringify({ targetType, targetId, reason }) });
  }

  async assignRole(serverId: string, roleId: string, userId: string) {
    return this.request(`/servers/${serverId}/roles/${roleId}/members/${userId}`, { method: 'POST' });
  }

  async unassignRole(serverId: string, roleId: string, userId: string) {
    return this.request(`/servers/${serverId}/roles/${roleId}/members/${userId}`, { method: 'DELETE' });
  }

  async updateRole(serverId: string, roleId: string, updates: { name?: string; color?: string; permissions?: string[]; position?: number }) {
    return this.request(`/servers/${serverId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(updates) });
  }

  async deleteRole(serverId: string, roleId: string) {
    return this.request(`/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' });
  }

  async getServers() {
    return this.request('/servers');
  }

  async createServer(data: { name: string; icon?: string }) {
    return this.request('/servers', { method: 'POST', body: JSON.stringify(data) });
  }

  async getServer(serverId: string) {
    return this.request(`/servers/${serverId}`);
  }

  async updateServer(serverId: string, data: any) {
    return this.request(`/servers/${serverId}`, { method: 'PATCH', body: JSON.stringify(data) });
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

  async getRoles(serverId: string) {
    return this.request(`/servers/${serverId}/roles`);
  }

  async createRole(serverId: string, data: any) {
    return this.request(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAuditLog(serverId: string) {
    return this.request(`/servers/${serverId}/audit-log`);
  }

  async getChannels(serverId: string) {
    return this.request(`/channels/${serverId}`);
  }

  async createChannel(serverId: string, data: any) {
    return this.request('/channels', {
      method: 'POST',
      body: JSON.stringify({ serverId, ...data }),
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

  async getDirectMessages() {
    return this.request('/dms');
  }

  async createDirectMessage(userIds: string[], name?: string) {
    return this.request('/dms', {
      method: 'POST',
      body: JSON.stringify({ userIds, name }),
    });
  }

  async updateDirectMessage(dmId: string, updates: { name?: string; description?: string; avatar?: string }) {
    return this.request(`/dms/${dmId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async addDmParticipants(dmId: string, userIds: string[]) {
    return this.request(`/dms/${dmId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  async removeDmParticipant(dmId: string, userId: string) {
    return this.request(`/dms/${dmId}/participants/${userId}`, { method: 'DELETE' });
  }

  async transferDmOwner(dmId: string, userId: string) {
    return this.request(`/dms/${dmId}/owner`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async getDmMessages(dmId: string, limit = 50) {
    return this.request(`/dms/${dmId}/messages?limit=${limit}`);
  }

  async searchDmMessages(dmId: string, query: string) {
    return this.request(`/dms/${dmId}/search?q=${encodeURIComponent(query)}`);
  }

  async markDmRead(dmId: string) {
    return this.request(`/dms/${dmId}/read`, { method: 'POST' });
  }

  async sendDmMessage(dmId: string, content: string, replyToId?: string, attachments?: { url: string; filename: string; mimeType: string; size: number }[]) {
    return this.request(`/dms/${dmId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, replyToId, attachments }),
    });
  }

  async editDmMessage(messageId: string, content: string) {
    return this.request(`/dms/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async deleteDmMessage(messageId: string) {
    return this.request(`/dms/messages/${messageId}`, { method: 'DELETE' });
  }

  async toggleDmReaction(messageId: string, emoji: string) {
    return this.request(`/dms/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  async pinDmMessage(messageId: string) {
    return this.request(`/dms/messages/${messageId}/pin`, { method: 'POST' });
  }

  async getFriends() {
    return this.request('/friends');
  }

  async discoverUsers(options: {
    q?: string;
    seed?: string;
    limit?: number;
    onlineOnly?: boolean;
  } = {}) {
    const params = new URLSearchParams();
    if (options.q) params.set('q', options.q);
    if (options.seed) params.set('seed', options.seed);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.onlineOnly) params.set('online', 'true');
    const suffix = params.toString();
    return this.request<DiscoverUsersResult>(`/users/discover${suffix ? `?${suffix}` : ''}`);
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

  async removeFriend(friendId: string) {
    return this.request(`/friends/${friendId}`, { method: 'DELETE' });
  }

  async blockUser(userId: string) {
    return this.request(`/friends/${userId}/block`, { method: 'POST' });
  }

  async unblockUser(userId: string) {
    return this.request(`/friends/${userId}/unblock`, { method: 'POST' });
  }

  async searchMessages(channelId: string, query: string) {
    return this.request(`/channels/${channelId}/search?q=${encodeURIComponent(query)}`);
  }

  // Community upgrade APIs: polls, saved messages, read cursors, scheduling and events.
  async createPoll(channelId: string, data: { messageId: string; question: string; options: string[]; multipleChoice?: boolean; anonymous?: boolean; expiresAt?: string }) {
    return this.request(`/features/channels/${channelId}/polls`, { method: 'POST', body: JSON.stringify(data) });
  }

  async getChannelPolls(channelId: string) {
    return this.request(`/features/channels/${channelId}/polls`);
  }

  async votePoll(pollId: string, optionIds: string[]) {
    return this.request(`/features/polls/${pollId}/votes`, { method: 'POST', body: JSON.stringify({ optionIds }) });
  }

  async closePoll(pollId: string) {
    return this.request(`/features/polls/${pollId}/close`, { method: 'POST' });
  }

  async getSavedMessages() {
    return this.request('/features/saved-messages');
  }

  async saveMessage(messageId: string) {
    return this.request(`/features/messages/${messageId}/save`, { method: 'POST' });
  }

  async unsaveMessage(messageId: string) {
    return this.request(`/features/messages/${messageId}/save`, { method: 'DELETE' });
  }

  async updateChannelReadState(channelId: string, messageId?: string) {
    return this.request(`/features/channels/${channelId}/read-state`, { method: 'PUT', body: JSON.stringify({ messageId }) });
  }

  async getChannelReadState(channelId: string) {
    return this.request(`/features/channels/${channelId}/read-state`);
  }

  async scheduleMessage(channelId: string, content: string, scheduledAt: string) {
    return this.request(`/features/channels/${channelId}/scheduled-messages`, { method: 'POST', body: JSON.stringify({ content, scheduledAt }) });
  }

  async getScheduledMessages() {
    return this.request('/features/scheduled-messages');
  }

  async cancelScheduledMessage(id: string) {
    return this.request(`/features/scheduled-messages/${id}`, { method: 'DELETE' });
  }

  async createServerEvent(serverId: string, data: { title: string; description?: string; channelId?: string; location?: string; startsAt: string; endsAt?: string }) {
    return this.request(`/features/servers/${serverId}/events`, { method: 'POST', body: JSON.stringify(data) });
  }

  async getServerEvents(serverId: string) {
    return this.request(`/features/servers/${serverId}/events`);
  }

  async rsvpEvent(eventId: string, status: 'GOING' | 'INTERESTED' | 'NOT_GOING') {
    return this.request(`/features/events/${eventId}/rsvp`, { method: 'PUT', body: JSON.stringify({ status }) });
  }

  async cancelServerEvent(eventId: string) {
    return this.request(`/features/events/${eventId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);
export default api;
