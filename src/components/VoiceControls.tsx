import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { socketService } from '../services/socket';
import { Mic, MicOff, Headphones, Video, VideoOff, Monitor, PhoneOff, Signal, VolumeX } from 'lucide-react';

export default function VoiceControls() {
  const { isInVoice, voiceChannelId, voiceChannelName, isMuted, isDeafened, isCameraOn, isScreenSharing, toggleMute, toggleDeafen, toggleCamera, toggleScreenShare, leaveVoice } = useUIStore();
  const user = useAuthStore(s => s.user);

  const canControl = isInVoice && Boolean(voiceChannelId);
  const noVoiceTitle = 'Join a voice channel first';

  const handleMute = () => {
    toggleMute();
    if (voiceChannelId) socketService.setMuted(voiceChannelId, !isMuted);
  };

  const handleDeafen = () => {
    toggleDeafen();
    if (voiceChannelId) socketService.setDeafened(voiceChannelId, !isDeafened);
  };

  const handleLeave = () => {
    if (voiceChannelId) socketService.leaveVoice(voiceChannelId);
    leaveVoice();
  };

  return (
    <AnimatePresence>
      {isInVoice && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-dc-darker/80 border-t border-dc-divider/30"
        >
          <div className="px-2 py-2 border-b border-dc-divider/20">
            <div className="flex items-center gap-2 px-2 mb-2">
              <Signal className="w-4 h-4 text-dc-green" />
              <span className="text-xs font-bold text-dc-green">Voice Connected</span>
            </div>
            {user && (
              <div className="flex items-center gap-2 px-2 py-1 rounded">
                <div className="w-6 h-6 rounded-full bg-dc-brand flex items-center justify-center text-white text-xs font-bold">
                  {user.username[0]}
                </div>
                <span className="text-sm text-dc-text flex-1">{user.username} (You)</span>
                {isMuted && <MicOff className="w-3.5 h-3.5 text-dc-red" />}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-1 p-2">
            <button
              onClick={handleMute}
              disabled={!canControl}
              title={canControl ? (isMuted ? 'Unmute' : 'Mute') : noVoiceTitle}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isMuted ? 'bg-dc-red/20 text-dc-red hover:bg-dc-red/30' : 'bg-dc-input text-dc-text hover:bg-dc-active'
              }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button
              onClick={handleDeafen}
              disabled={!canControl}
              title={canControl ? (isDeafened ? 'Undeafen' : 'Deafen') : noVoiceTitle}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isDeafened ? 'bg-dc-red/20 text-dc-red hover:bg-dc-red/30' : 'bg-dc-input text-dc-text hover:bg-dc-active'
              }`}
            >
              {isDeafened ? <VolumeX className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleCamera}
              disabled={!canControl}
              title={canControl ? (isCameraOn ? 'Turn Off Camera' : 'Turn On Camera') : noVoiceTitle}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isCameraOn ? 'bg-dc-brand/20 text-dc-brand hover:bg-dc-brand/30' : 'bg-dc-input text-dc-text hover:bg-dc-active'
              }`}
            >
              {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleScreenShare}
              disabled={!canControl}
              title={canControl ? (isScreenSharing ? 'Stop Sharing' : 'Share Screen') : noVoiceTitle}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isScreenSharing ? 'bg-dc-brand/20 text-dc-brand hover:bg-dc-brand/30' : 'bg-dc-input text-dc-text hover:bg-dc-active'
              }`}
            >
              <Monitor className="w-5 h-5" />
            </button>
            <button
              onClick={handleLeave}
              disabled={!canControl}
              title={canControl ? 'Disconnect' : noVoiceTitle}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-dc-red/20 text-dc-red hover:bg-dc-red/30 transition-colors ml-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>

          <div className="px-3 pb-2">
            <p className="text-xs text-dc-text-muted truncate">
              🔊 {voiceChannelName}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
