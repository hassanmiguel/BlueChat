import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TypingIndicator() {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);

  // Simulate random typing indicators
  useEffect(() => {
    const users = ['DevMaster', 'PixelArtist', 'NightOwl', 'CloudNine', 'GameLover'];
    
    const interval = setInterval(() => {
      const shouldType = Math.random() > 0.6;
      if (shouldType) {
        const randomUser = users[Math.floor(Math.random() * users.length)];
        setTypingUsers([randomUser]);
        setVisible(true);
        
        setTimeout(() => {
          setVisible(false);
          setTimeout(() => setTypingUsers([]), 300);
        }, 2000 + Math.random() * 3000);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  if (!visible || typingUsers.length === 0) return null;

  const text = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : `${typingUsers.join(', ')} are typing...`;

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
