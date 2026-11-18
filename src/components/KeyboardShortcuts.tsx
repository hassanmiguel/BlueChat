import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

export default function KeyboardShortcuts() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setShow(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShow(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const shortcuts = [
    { category: 'Navigation', items: [
      { keys: ['Ctrl', 'K'], description: 'Quick switcher' },
      { keys: ['Ctrl', '/'], description: 'Show shortcuts' },
    ]},
    { category: 'Chat', items: [
      { keys: ['Enter'], description: 'Send message' },
    ]},
  ];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShow(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-[500px] max-h-[80vh] bg-dc-dark rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-dc-divider/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-dc-brand" />
                <h2 className="text-lg font-bold text-white">Keyboard Shortcuts</h2>
              </div>
              <button onClick={() => setShow(false)} className="text-dc-text-muted hover:text-dc-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {shortcuts.map(category => (
                <div key={category.category} className="mb-6">
                  <h3 className="text-xs font-bold text-dc-text-muted uppercase mb-3">{category.category}</h3>
                  <div className="space-y-2">
                    {category.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-sm text-dc-text">{item.description}</span>
                        <div className="flex gap-1">
                          {item.keys.map((key, j) => (
                            <kbd key={j} className="px-2 py-0.5 bg-dc-input rounded text-xs text-dc-text font-mono border border-dc-divider/30">
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-dc-divider/30 bg-dc-darker/50 text-center">
              <p className="text-xs text-dc-text-muted">Press <kbd className="px-1.5 py-0.5 bg-dc-input rounded text-xs font-mono border border-dc-divider/30">Ctrl+/</kbd> to toggle this panel</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
