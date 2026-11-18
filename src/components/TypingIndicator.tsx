import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { socketService } from '../services/socket';

export default function TypingIndicator({ targetId }: { targetId?: string }) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const activeChannelId = useChatStore(s => s.activeChannelId);
  const target = targetId || activeChannelId;

  useEffect(() => {
    if (!target) {
      setTypingUsers([]);
      return;
    }
    setTypingUsers([]);

    const unsubscribe = socketService.on('typing:update', (payload: any) => {
      if (!payload) return;
      const eventChannelId = typeof payload === 'string' ? payload : payload.channelId;
      if (eventChannelId && eventChannelId !== target) return;
      const username = typeof payload === 'string'
        ? undefined
        : payload.username || payload.user?.username;
      if (!username) return;
      const isTyping = Boolean(payload.isTyping ?? payload.typing);
      setTypingUsers(prev => {
        if (isTyping) return prev.includes(username) ? prev : [...prev, username];
        return prev.filter(name => name !== username);
      });
    });

    return unsubscribe;
  }, [target]);

  if (typingUsers.length === 0) return null;

  const text = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
    ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
    : `${typingUsers.slice(0, 3).join(', ')} are typing...`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        className="px-4 py-1 text-xs text-dc-text-muted flex items-center gap-2 h-6"
      >
        <div className="flex gap-0.5">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            className="w-1.5 h-1.5 rounded-full bg-dc-text-muted"
          />
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
            className="w-1.5 h-1.5 rounded-full bg-dc-text-muted"
          />
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
            className="w-1.5 h-1.5 rounded-full bg-dc-text-muted"
          />
        </div>
        <span>{text}</span>
      </motion.div>
    </AnimatePresence>
  );
}
