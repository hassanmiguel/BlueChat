import { socketService } from './socket';
import { useCallStore, resetCallState, type CallType, type CallRecord, type CallStatus } from '../stores/callStore';
import { useActivityStore } from '../stores/activityStore';
import { useUIStore } from '../stores/uiStore';
import { startCallingSound, stopCallingSound } from './soundService';
import { describeMediaError } from './mediaPermission';

export interface StartCallArgs {
  dmId: string;
  peer: { id: string; username: string; avatar?: string };
  type: CallType;
}

interface CallSignalPayload {
  callId?: string;
  dmId?: string;
  type?: CallType;
  from?: { id: string; username: string };
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
  duration?: number;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const RING_MS = 30_000;

const LIVE_STATUSES: CallStatus[] = ['outgoing', 'incoming', 'connecting', 'active'];

const stopTracks = (stream: MediaStream | null | undefined) => {
  stream?.getTracks().forEach((track) => track.stop());
};

class CallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string | null = null;
  private registered = false;
  private starting = false;
  private accepting = false;

  register(userId: string | null | undefined) {
    this.userId = userId || null;
    useCallStore.getState().loadHistory(this.userId);
    useActivityStore.getState().load(this.userId);
    if (this.registered) return;
    this.registered = true;

    socketService.on('call:incoming', (payload: CallSignalPayload) => this.onIncoming(payload));
    socketService.on('call:accepted', (payload: CallSignalPayload) => this.onAccepted(payload));
    socketService.on('call:offer', (payload: CallSignalPayload) => this.onOffer(payload));
    socketService.on('call:answer', (payload: CallSignalPayload) => this.onAnswer(payload));
    socketService.on('call:ice', (payload: CallSignalPayload) => this.onIce(payload));
    socketService.on('call:declined', (payload: CallSignalPayload) => this.onDeclined(payload));
    socketService.on('call:ended', (payload: CallSignalPayload) => this.onEnded(payload));
    socketService.on('call:cancelled', (payload: CallSignalPayload) => this.onCancelled(payload));
  }

  // ---------- Outgoing ----------

  async startCall({ dmId, peer, type }: StartCallArgs): Promise<boolean> {
    const store = useCallStore.getState();
    if (this.starting || !['idle', 'ended'].includes(store.status)) {
      useUIStore.getState().addNotification('Call in progress', 'Finish your current call first.', 'warning');
      return false;
    }

    this.starting = true;
    this.clearResetTimer();
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      // The UI may have changed while the browser prompt was open.
      if (!['idle', 'ended'].includes(useCallStore.getState().status)) {
        stopTracks(stream);
        return false;
      }

      const callId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `call-${Date.now()}`;
      const cameraTrack = stream.getVideoTracks()[0] || null;

      this.localStream = stream;
      this.cameraTrack = cameraTrack;
      this.createPeerConnection();

      useCallStore.getState().patch({
        status: 'outgoing',
        callId,
        peerId: peer.id,
        peerName: peer.username,
        peerAvatar: peer.avatar || null,
        dmId,
        type,
        direction: 'outgoing',
        startedAt: null,
        localStream: stream,
        remoteStream: this.remoteStream,
        isMuted: false,
        isCameraOn: type === 'video' && Boolean(cameraTrack),
        isScreenSharing: false,
        message: `Calling ${peer.username}...`,
      });

      socketService.callInvite({ callId, toUserId: peer.id, dmId, type });
      void startCallingSound();
      this.clearTimeout();
      this.timeout = setTimeout(() => {
        const state = useCallStore.getState();
        if (state.callId === callId && state.status === 'outgoing') this.finish('missed', 'No answer', callId);
      }, RING_MS);
      return true;
    } catch (error) {
      stopTracks(stream);
      const detail = describeMediaError(error, type === 'video' ? 'both' : 'microphone');
      useUIStore.getState().addNotification(
        'Can’t start call',
        `${detail} Open Settings → Voice & Video if you need to allow access.`,
        'error',
      );
      return false;
    } finally {
      this.starting = false;
    }
  }

  // ---------- Incoming ----------

  private onIncoming(payload: CallSignalPayload) {
    const callId = payload.callId;
    const from = payload.from;
    if (!callId || !from) return;
    const state = useCallStore.getState();

    if (state.callId === callId && state.status === 'incoming') return;

    if (!['idle', 'ended'].includes(state.status)) {
      socketService.callDecline({ callId, toUserId: from.id, reason: 'busy' });
      this.record({
        peerId: from.id,
        peerName: from.username,
        dmId: payload.dmId || '',
        type: payload.type === 'video' ? 'video' : 'audio',
        direction: 'incoming',
        status: 'busy',
        duration: 0,
      });
      useActivityStore.getState().push(this.userId, {
        type: 'call',
        title: 'Missed call',
        body: `${from.username} called while you were busy`,
        peerId: from.id,
        dmId: payload.dmId,
        callType: payload.type === 'video' ? 'video' : 'audio',
      });
      return;
    }

    this.clearResetTimer();
    this.clearTimeout();
    useCallStore.getState().patch({
      status: 'incoming',
      callId,
      peerId: from.id,
      peerName: from.username,
      peerAvatar: null,
      dmId: payload.dmId || null,
      type: payload.type === 'video' ? 'video' : 'audio',
      direction: 'incoming',
      startedAt: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraOn: false,
      isScreenSharing: false,
      message: `Incoming ${payload.type === 'video' ? 'video' : 'voice'} call`,
    });
    this.timeout = setTimeout(() => this.decline('missed', callId), RING_MS);
    void startCallingSound();
  }

  async acceptCall() {
    const state = useCallStore.getState();
    if (this.accepting || state.status !== 'incoming' || !state.callId || !state.peerId) return;
    this.accepting = true;

    const callId = state.callId;
    const peerId = state.peerId;
    const type = state.type;
    stopCallingSound();
    this.clearTimeout();

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      const current = useCallStore.getState();
      if (current.callId !== callId || current.status !== 'incoming') {
        stopTracks(stream);
        return;
      }

      this.localStream = stream;
      this.cameraTrack = stream.getVideoTracks()[0] || null;
      this.createPeerConnection();
      useCallStore.getState().patch({
        status: 'connecting',
        startedAt: Date.now(),
        localStream: stream,
        remoteStream: this.remoteStream,
        isMuted: false,
        isCameraOn: type === 'video' && Boolean(this.cameraTrack),
        isScreenSharing: false,
        message: 'Connecting...',
      });
      socketService.callAccept({ callId, toUserId: peerId });
    } catch (error) {
      stopTracks(stream);
      const detail = describeMediaError(error, type === 'video' ? 'both' : 'microphone');
      useUIStore.getState().addNotification(
        'Can’t answer',
        `${detail} Open Settings → Voice & Video to allow access.`,
        'error',
      );
      this.decline('declined', callId);
    } finally {
      this.accepting = false;
    }
  }

  decline(reason = 'declined', callId?: string) {
    const state = useCallStore.getState();
    if (state.status !== 'incoming' || !state.callId || !state.peerId) return;
    if (callId && state.callId !== callId) return;

    socketService.callDecline({ callId: state.callId, toUserId: state.peerId, reason });
    this.record({
      peerId: state.peerId,
      peerName: state.peerName,
      dmId: state.dmId || '',
      type: state.type,
      direction: 'incoming',
      status: reason === 'missed' ? 'missed' : 'declined',
      duration: 0,
    });
    useActivityStore.getState().push(this.userId, {
      type: 'call',
      title: reason === 'missed' ? 'Missed call' : 'Call declined',
      body: `${state.peerName} · ${state.type === 'video' ? 'Video' : 'Voice'}`,
      peerId: state.peerId,
      dmId: state.dmId || undefined,
      callType: state.type,
    });
    this.cleanup();
    resetCallState();
  }

  // ---------- Signalling responses ----------

  private isCurrent(callId?: string | null) {
    return Boolean(callId && useCallStore.getState().callId === callId);
  }

  private isLiveStatus(status: CallStatus) {
    return LIVE_STATUSES.includes(status);
  }

  private isLiveCall(callId?: string | null) {
    const state = useCallStore.getState();
    return this.isCurrent(callId) && this.isLiveStatus(state.status);
  }

  private async onAccepted(payload: CallSignalPayload) {
    const callId = payload.callId;
    if (!this.isLiveCall(callId) || useCallStore.getState().status !== 'outgoing') return;
    const state = useCallStore.getState();
    const pc = this.peerConnection;
    if (!pc) return;

    stopCallingSound();
    this.clearTimeout();

    try {
      const offer = await pc.createOffer();
      if (!this.isLiveCall(callId) || this.peerConnection !== pc) return;
      await pc.setLocalDescription(offer);
      if (!this.isLiveCall(callId) || this.peerConnection !== pc) return;
      if (state.peerId) socketService.callOffer({ callId: callId!, toUserId: state.peerId, sdp: offer });
      useCallStore.getState().patch({ status: 'connecting', message: 'Connecting...' });
    } catch {
      this.finish('failed', 'Could not connect', callId);
    }
  }

  private async onOffer(payload: CallSignalPayload) {
    const callId = payload.callId;
    if (!this.isLiveCall(callId) || !payload.sdp) return;
    const state = useCallStore.getState();
    const pc = this.peerConnection;
    if (!pc) return;

    try {
      await pc.setRemoteDescription(payload.sdp);
      if (!this.isLiveCall(callId) || this.peerConnection !== pc) return;
      await this.flushCandidates(pc);
      if (!this.isLiveCall(callId) || this.peerConnection !== pc) return;
      const answer = await pc.createAnswer();
      if (!this.isLiveCall(callId) || this.peerConnection !== pc) return;
      await pc.setLocalDescription(answer);
      if (!this.isLiveCall(callId) || this.peerConnection !== pc) return;
      if (state.peerId) socketService.callAnswer({ callId: callId!, toUserId: state.peerId, sdp: answer });
    } catch {
      this.finish('failed', 'Could not connect', callId);
    }
  }

  private async onAnswer(payload: CallSignalPayload) {
    const callId = payload.callId;
    if (!this.isLiveCall(callId) || !payload.sdp) return;
    const pc = this.peerConnection;
    if (!pc) return;

    try {
      await pc.setRemoteDescription(payload.sdp);
      if (!this.isLiveCall(callId) || this.peerConnection !== pc) return;
      await this.flushCandidates(pc);
    } catch {
      this.finish('failed', 'Could not connect', callId);
    }
  }

  private async onIce(payload: CallSignalPayload) {
    if (!this.isCurrent(payload.callId) || !payload.candidate) return;
    if (!this.peerConnection?.remoteDescription) {
      this.pendingCandidates.push(payload.candidate);
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(payload.candidate);
    } catch {
      /* A late candidate after hangup is harmless. */
    }
  }

  private async flushCandidates(pc: RTCPeerConnection) {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* Ignore candidates that no longer apply. */
      }
    }
  }

  private onDeclined(payload: CallSignalPayload) {
    const state = useCallStore.getState();
    if (!this.isLiveCall(payload.callId) || state.status !== 'outgoing') return;
    const status = payload.reason === 'busy' ? 'busy' : 'declined';
    const message = status === 'busy' ? `${state.peerName} is busy` : `${state.peerName} declined your call`;
    useActivityStore.getState().push(this.userId, {
      type: 'call',
      title: status === 'busy' ? 'Line busy' : 'Call declined',
      body: `${state.peerName} · ${state.type === 'video' ? 'Video' : 'Voice'}`,
      peerId: state.peerId || undefined,
      dmId: state.dmId || undefined,
      callType: state.type,
    });
    this.finish(status, message, payload.callId);
  }

  private onEnded(payload: CallSignalPayload) {
    const state = useCallStore.getState();
    if (!this.isLiveCall(payload.callId)) return;
    const duration = payload.duration || (state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0);
    this.cleanup();
    useCallStore.getState().patch({
      status: 'ended',
      callId: null,
      message: duration ? `Call ended · ${formatDuration(duration)}` : 'Call ended',
    });
    if (state.startedAt) {
      this.record({
        peerId: state.peerId || '',
        peerName: state.peerName,
        dmId: state.dmId || '',
        type: state.type,
        direction: state.direction,
        status: 'completed',
        duration,
      });
    }
    this.scheduleReset();
  }

  /** Another tab answered or ended this call; stop ringing without recording anything. */
  private onCancelled(payload: CallSignalPayload) {
    const state = useCallStore.getState();
    if (!this.isCurrent(payload.callId) || state.status !== 'incoming') return;
    this.cleanup();
    resetCallState();
  }

  // ---------- Controls ----------

  endCall() {
    const state = useCallStore.getState();
    if (!state.callId || !this.isLiveStatus(state.status)) return;

    const duration = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
    socketService.callEnd({ callId: state.callId, toUserId: state.peerId || '', duration });
    const wasConnected = Boolean(state.startedAt);
    this.cleanup();
    useCallStore.getState().patch({
      status: 'ended',
      callId: null,
      message: wasConnected ? 'Call ended' : 'Call cancelled',
    });
    if (wasConnected) {
      this.record({
        peerId: state.peerId || '',
        peerName: state.peerName,
        dmId: state.dmId || '',
        type: state.type,
        direction: state.direction,
        status: 'completed',
        duration,
      });
    }
    this.scheduleReset();
  }

  dismissEnded() {
    if (useCallStore.getState().status !== 'ended') return;
    this.cleanup();
    resetCallState();
  }

  toggleMute() {
    const state = useCallStore.getState();
    if (!this.isLiveStatus(state.status)) return;
    const track = this.localStream?.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
    useCallStore.getState().patch({ isMuted: track ? !track.enabled : !state.isMuted });
  }

  toggleCamera() {
    const state = useCallStore.getState();
    if (!this.isLiveStatus(state.status) || state.isScreenSharing) return;
    const track = this.cameraTrack;
    if (!track) {
      useCallStore.getState().patch({ isCameraOn: false });
      return;
    }
    track.enabled = !track.enabled;
    useCallStore.getState().patch({ isCameraOn: track.enabled });
  }

  async toggleScreenShare() {
    const state = useCallStore.getState();
    if (!this.isLiveStatus(state.status) || !this.peerConnection || !this.localStream || state.type !== 'video') return;

    if (state.isScreenSharing) {
      const pc = this.peerConnection;
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
      const shared = this.localStream.getVideoTracks().find((track) => track !== this.cameraTrack);
      if (sender && this.cameraTrack) await sender.replaceTrack(this.cameraTrack).catch(() => undefined);
      if (shared) {
        this.localStream.removeTrack(shared);
        shared.stop();
      }
      if (!this.isLiveCall(state.callId) || this.peerConnection !== pc) return;
      useCallStore.getState().patch({
        isScreenSharing: false,
        isCameraOn: this.cameraTrack ? this.cameraTrack.enabled : false,
      });
      return;
    }

    const cameraWasOn = this.cameraTrack?.enabled ?? false;
    const pc = this.peerConnection;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      if (!track) {
        stopTracks(display);
        return;
      }
      if (!this.isLiveCall(state.callId) || this.peerConnection !== pc || !this.localStream) {
        stopTracks(display);
        return;
      }
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
      if (!sender) {
        stopTracks(display);
        return;
      }
      try {
        await sender.replaceTrack(track);
      } catch {
        stopTracks(display);
        return;
      }
      this.localStream.addTrack(track);
      track.onended = () => {
        if (useCallStore.getState().isScreenSharing) void this.toggleScreenShare();
      };
      useCallStore.getState().patch({ isScreenSharing: true, isCameraOn: cameraWasOn });
    } catch {
      /* The user cancelled the screen picker. */
    }
  }

  // ---------- Internals ----------

  private createPeerConnection() {
    this.pendingCandidates = [];
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.remoteStream = new MediaStream();
    this.peerConnection = pc;

    this.localStream?.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));

    pc.onicecandidate = (event) => {
      if (!event.candidate || this.peerConnection !== pc) return;
      const state = useCallStore.getState();
      if (state.callId && state.peerId) {
        socketService.callIce({ callId: state.callId, toUserId: state.peerId, candidate: event.candidate.toJSON() });
      }
    };
    pc.ontrack = (event) => {
      if (this.peerConnection !== pc || !this.remoteStream) return;
      event.streams[0]?.getTracks().forEach((track) => {
        if (!this.remoteStream?.getTracks().includes(track)) this.remoteStream?.addTrack(track);
      });
      event.track.onunmute = () => {
        if (this.peerConnection === pc) useCallStore.getState().patch({ remoteStream: this.remoteStream });
      };
      useCallStore.getState().patch({ remoteStream: this.remoteStream });
    };
    pc.onconnectionstatechange = () => {
      if (this.peerConnection !== pc) return;
      const state = useCallStore.getState();
      if (!this.isCurrent(state.callId)) return;
      if (pc.connectionState === 'connected') {
        useCallStore.getState().patch({ status: 'active', message: '' });
      } else if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        if (state.status === 'connecting') this.finish('failed', 'Connection lost', state.callId);
      }
    };
  }

  private finish(status: CallRecord['status'], message: string, callId?: string | null) {
    const state = useCallStore.getState();
    if (!this.isLiveStatus(state.status)) return;
    if (callId && state.callId !== callId) return;

    this.cleanup();
    useCallStore.getState().patch({ status: 'ended', callId: null, message });
    this.record({
      peerId: state.peerId || '',
      peerName: state.peerName,
      dmId: state.dmId || '',
      type: state.type,
      direction: state.direction,
      status,
      duration: state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0,
    });
    this.scheduleReset();
  }

  private record(record: Omit<CallRecord, 'id' | 'timestamp'>) {
    useCallStore.getState().recordCall(this.userId, record);
  }

  private clearTimeout() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private clearResetTimer() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }

  private cleanup() {
    stopCallingSound();
    this.clearTimeout();
    this.clearResetTimer();
    this.pendingCandidates = [];
    this.peerConnection?.close();
    this.peerConnection = null;
    stopTracks(this.localStream);
    this.localStream = null;
    stopTracks(this.remoteStream);
    this.remoteStream = null;
    this.cameraTrack = null;
  }

  private scheduleReset() {
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => {
      this.resetTimer = null;
      if (useCallStore.getState().status === 'ended') resetCallState();
    }, 1800);
  }
}

export const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

export const callService = new CallService();
export default callService;
