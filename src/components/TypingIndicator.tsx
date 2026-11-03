import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';

export default function TypingIndicator() {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const activeChannelId = useChatStore(s => s.activeChannelId);

  // In a real app, this would listen to socket events
  // For now, we just show the component structure
  useEffect(() => {
    // This would be replaced with socket event listeners
    // socketService.on('typing:update', handleTypingUpdate);
    return () => {
      // socketService.off('typing:update', handleTypingUpdate);
    };
  }, [activeChannelId]);

  if (!visible || typingUsers.length === 0) return null;

  const text = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
    ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
    : `${typingUsers.slice(0, 3).join(', ')} are typing...`;

  return (
    <AnimatePresence>
      {visible && (
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
      )}
    </AnimatePresence>
  );
}
