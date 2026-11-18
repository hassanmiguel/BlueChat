import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Monitor, MonitorOff, X,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { callService, formatDuration } from '../services/callService';
import Avatar from './Avatar';
import '../pages/calls.css';

function useVideoStream(stream: MediaStream | null, muted: boolean) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      if (muted) ref.current.muted = true;
      void ref.current.play().catch(() => undefined);
    }
  }, [stream, muted]);
  return ref;
}

function useAudioStream(stream: MediaStream | null) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => undefined);
    }
  }, [stream]);
  return ref;
}

export default function CallOverlay() {
  const user = useAuthStore((s) => s.user);
  const call = useCallStore();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    callService.register(user?.id);
  }, [user?.id]);

  useEffect(() => {
    if (!call.startedAt || (call.status !== 'active' && call.status !== 'connecting')) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - (call.startedAt || 0)) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [call.startedAt, call.status]);

  const isLive = call.status === 'active' || call.status === 'connecting';
  const showVideo = call.type === 'video' && isLive;
  const remoteRef = useVideoStream(isLive ? call.remoteStream : null, false);
  const localRef = useVideoStream(isLive ? call.localStream : null, true);
  // Audio calls need an explicit audio element; video calls get sound from the video tag.
  const remoteAudioRef = useAudioStream(!showVideo && isLive ? call.remoteStream : null);
  const showControls = ['outgoing', 'connecting', 'active'].includes(call.status);

  return (
    <AnimatePresence>
      {call.status === 'incoming' && (
        <motion.div
          className="call-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="call-incoming"
            initial={{ scale: 0.92, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 18, opacity: 0 }}
          >
            <div className={`call-ringing-avatar${call.type === 'video' ? ' video' : ''}`}>
              <Avatar src={call.peerAvatar || undefined} name={call.peerName} className="call-avatar-img" />
            </div>
            <span className="call-eyebrow">INCOMING {call.type === 'video' ? 'VIDEO' : 'VOICE'} CALL</span>
            <h2>{call.peerName}</h2>
            <p>is calling you...</p>
            <div className="call-incoming-actions">
              <button className="call-round decline" onClick={() => callService.decline()} title="Decline" aria-label="Decline call">
                <PhoneOff size={22} />
              </button>
              <button className="call-round accept" onClick={() => void callService.acceptCall()} title="Accept" aria-label="Accept call">
                <Phone size={22} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {['outgoing', 'connecting', 'active', 'ended'].includes(call.status) && (
        <motion.div
          className="call-stage"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
        >
          <audio ref={remoteAudioRef} autoPlay hidden />
          <div className={`call-stage-surface${showVideo ? ' video' : ''}`}>
            {showVideo ? (
              <video ref={remoteRef} className="call-remote-video" autoPlay playsInline />
            ) : (
              <div className="call-audio-main">
                <div className={`call-me-avatar${call.status === 'outgoing' ? ' pulsing' : ''}`}>
                  <Avatar src={call.peerAvatar || undefined} name={call.peerName} className="call-avatar-img" />
                </div>
                <h2>{call.peerName}</h2>
                <p>{call.status === 'outgoing' ? 'Ringing...' : call.status === 'connecting' ? 'Connecting...' : call.message || 'Call in progress'}</p>
              </div>
            )}

            {showVideo && (
              <div className="call-stage-top">
                <span className="call-live"><i /> {call.status === 'active' ? 'LIVE' : 'CONNECTING'}</span>
                <span>{call.peerName}</span>
                {call.status === 'active' && <strong>{formatDuration(elapsed)}</strong>}
              </div>
            )}

            {showVideo && (
              <div className="call-local-tile">
                <video ref={localRef} className="call-local-video" autoPlay playsInline muted />
                <span>You{call.isMuted ? ' · muted' : ''}</span>
              </div>
            )}

            {call.status === 'ended' && (
              <div className="call-ended-banner">
                <p>{call.message || 'Call ended'}</p>
                <button onClick={() => callService.dismissEnded()} aria-label="Close call">
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {showControls && (
            <div className="call-controls">
              <button
                className={`call-round${call.isMuted ? ' active-off' : ''}`}
                onClick={() => callService.toggleMute()}
                title={call.isMuted ? 'Unmute' : 'Mute'}
              >
                {call.isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              {call.type === 'video' && (
                <button
                  className={`call-round${!call.isCameraOn ? ' active-off' : ''}`}
                  onClick={() => callService.toggleCamera()}
                  disabled={call.isScreenSharing}
                  title={call.isScreenSharing ? 'Camera is unavailable while sharing' : call.isCameraOn ? 'Turn camera off' : 'Turn camera on'}
                >
                  {call.isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
              )}
              {call.type === 'video' && (
                <button
                  className={`call-round${call.isScreenSharing ? ' active-on' : ''}`}
                  onClick={() => void callService.toggleScreenShare()}
                  title={call.isScreenSharing ? 'Stop sharing' : 'Share screen'}
                >
                  {call.isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
                </button>
              )}
              <button className="call-round hangup" onClick={() => callService.endCall()} title="End call">
                <PhoneOff size={21} />
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
