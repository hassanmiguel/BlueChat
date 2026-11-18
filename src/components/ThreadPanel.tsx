import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { X } from 'lucide-react';

export default function ThreadPanel() {
  const { showThreadPanel, toggleThreadPanel } = useUIStore();

  return (
    <AnimatePresence>
      {showThreadPanel && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 360, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="bg-dc-sidebar border-l border-dc-divider/30 flex flex-col overflow-hidden shrink-0"
        >
          <div className="h-12 px-4 flex items-center justify-between border-b border-dc-divider/30 shrink-0">
            <h3 className="font-bold text-white text-sm">Threads</h3>
            <button onClick={toggleThreadPanel} className="text-dc-text-muted hover:text-dc-text transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-dc-text-muted text-center">Thread support is not available yet.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
