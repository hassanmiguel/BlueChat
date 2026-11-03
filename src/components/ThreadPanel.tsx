import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { X, Hash, MessageCircle, Send } from 'lucide-react';

interface Thread {
  id: string;
  title: string;
  author: string;
  messageCount: number;
  lastActivity: string;
  messages: { id: string; author: string; content: string; time: string }[];
}

export default function ThreadPanel() {
  const { showThreadPanel, toggleThreadPanel } = useUIStore();
  const [reply, setReply] = useState('');
  const [activeThread, setActiveThread] = useState<string | null>(null);

  // Mock threads
  const threads: Thread[] = [
    {
      id: 't1',
      title: 'React vs Vue Discussion',
      author: 'DevMaster',
      messageCount: 12,
      lastActivity: '5 min ago',
      messages: [
        { id: 'm1', author: 'DevMaster', content: 'What do you all prefer for new projects?', time: '2:30 PM' },
        { id: 'm2', author: 'BlueAdmin', content: 'React for sure! The ecosystem is unmatched.', time: '2:32 PM' },
        { id: 'm3', author: 'PixelArtist', content: 'I like Vue for its simplicity', time: '2:35 PM' },
        { id: 'm4', author: 'NightOwl', content: 'Svelte gang 🚀', time: '2:40 PM' },
      ]
    },
    {
      id: 't2',
      title: 'Weekend Game Night',
      author: 'GameLover',
      messageCount: 8,
      lastActivity: '1 hour ago',
      messages: [
        { id: 'm5', author: 'GameLover', content: 'Who is up for games this Saturday?', time: '1:00 PM' },
        { id: 'm6', author: 'CloudNine', content: 'Count me in!', time: '1:05 PM' },
      ]
    },
    {
      id: 't3',
      title: 'Design Feedback - New Logo',
      author: 'PixelArtist',
      messageCount: 5,
      lastActivity: '3 hours ago',
      messages: [
        { id: 'm7', author: 'PixelArtist', content: 'Here is my proposal for the new logo', time: '11:00 AM' },
        { id: 'm8', author: 'BlueAdmin', content: 'Looks great! Maybe try a darker shade?', time: '11:15 AM' },
      ]
    },
  ];

  const currentThread = threads.find(t => t.id === activeThread);

  return (
    <AnimatePresence>
      {showThreadPanel && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 360, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="bg-dc-sidebar border-l border-dc-divider/30 flex flex-col overflow-hidden shrink-0"
        >
          {/* Header */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-dc-divider/30 shrink-0">
            <h3 className="font-bold text-white text-sm">Threads</h3>
            <button onClick={toggleThreadPanel} className="text-dc-text-muted hover:text-dc-text transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {!activeThread ? (
            <>
              {/* Thread list */}
              <div className="flex-1 overflow-y-auto p-2">
                <div className="flex items-center gap-2 px-2 py-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-dc-text-muted" />
                  <span className="text-xs text-dc-text-muted">{threads.length} Active Threads</span>
                </div>
                
                {threads.map(thread => (
                  <button
                    key={thread.id}
                    onClick={() => setActiveThread(thread.id)}
                    className="w-full text-left p-3 rounded-lg hover:bg-dc-hover transition-colors mb-1"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Hash className="w-4 h-4 text-dc-text-muted" />
                      <span className="text-sm font-medium text-white truncate">{thread.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-dc-text-muted">
                      <span>{thread.messageCount} messages</span>
                      <span>•</span>
                      <span>{thread.lastActivity}</span>
                    </div>
                    <p className="text-xs text-dc-text-muted mt-1">Started by {thread.author}</p>
                  </button>
                ))}
              </div>

              {/* Create thread button */}
              <div className="p-3 border-t border-dc-divider/30">
                <button className="w-full py-2 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors">
                  Create Thread
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Thread view */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-dc-divider/30 shrink-0">
                <button onClick={() => setActiveThread(null)} className="text-dc-text-muted hover:text-dc-text text-sm">
                  ← Back
                </button>
                <span className="text-sm font-medium text-white truncate">{currentThread?.title}</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {currentThread?.messages.map(msg => (
                  <div key={msg.id} className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-dc-brand flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {msg.author[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{msg.author}</span>
                        <span className="text-xs text-dc-text-muted">{msg.time}</span>
                      </div>
                      <p className="text-sm text-dc-text">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply input */}
              <div className="p-3 border-t border-dc-divider/30 shrink-0">
                <div className="flex items-center gap-2 bg-dc-input rounded-lg px-3 py-2">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply to thread..."
                    className="flex-1 bg-transparent text-sm text-dc-text placeholder-dc-text-muted/50 border-none"
                  />
                  <button className="text-dc-brand hover:text-dc-text-link transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
