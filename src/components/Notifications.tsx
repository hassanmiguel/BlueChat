import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export default function Notifications() {
  const { notifications, removeNotification } = useUIStore();

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-5 h-5 text-dc-green" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-dc-red" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-dc-yellow" />;
      default: return <Info className="w-5 h-5 text-dc-brand" />;
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'success': return 'border-l-dc-green';
      case 'error': return 'border-l-dc-red';
      case 'warning': return 'border-l-dc-yellow';
      default: return 'border-l-dc-brand';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {notifications.map(notification => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className={`bg-dc-dark border border-dc-divider/30 border-l-4 ${getBorderColor(notification.type)} rounded-lg shadow-xl p-4 flex items-start gap-3`}
          >
            {getIcon(notification.type)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{notification.title}</p>
              <p className="text-xs text-dc-text-muted mt-0.5">{notification.message}</p>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className="text-dc-text-muted hover:text-dc-text transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
