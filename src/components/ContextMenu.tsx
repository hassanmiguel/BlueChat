import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Pin, Smile, Copy, Link, Flag, Trash2 } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  isCurrentUser: boolean;
  onReply: () => void;
  onCopyText: () => void;
  onPin: () => void;
  onCopyLink: () => void;
  onMarkUnread: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function ContextMenu({ x, y, isCurrentUser, onReply, onCopyText, onPin, onCopyLink, onMarkUnread, onEdit, onDelete, onClose }: ContextMenuProps) {
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const handleClick = () => onClose();
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    
    // Adjust position if menu would go off screen
    const menuWidth = 220;
    const menuHeight = 300;
    let adjustedX = x;
    let adjustedY = y;
    
    if (x + menuWidth > window.innerWidth) adjustedX = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) adjustedY = window.innerHeight - menuHeight - 10;
    
    setPosition({ x: adjustedX, y: adjustedY });
    
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [x, y, onClose]);

  const menuItems = [
    { icon: MessageSquare, label: 'Reply', action: onReply },
    { icon: Smile, label: 'Add Reaction', action: () => {} },
    { icon: Pin, label: 'Pin Message', action: onPin },
    { icon: Copy, label: 'Copy Text', action: onCopyText },
    { icon: Link, label: 'Copy Message Link', action: onCopyLink },
    { icon: MessageSquare, label: 'Mark Unread', action: onMarkUnread },
    ...(isCurrentUser ? [
      { icon: MessageSquare, label: 'Edit Message', action: onEdit, divider: true },
      { icon: Trash2, label: 'Delete Message', action: onDelete, danger: true },
    ] : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[100] bg-dc-popout rounded-lg shadow-xl border border-dc-divider/30 py-1.5 min-w-[200px]"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, i) => (
        <div key={i}>
          {i === menuItems.findIndex(mi => mi.divider) && (
            <div className="border-t border-dc-divider/30 my-1"></div>
          )}
          <button
            onClick={() => { item.action?.(); onClose(); }}
            className={`w-full flex items-center gap-3 px-3 py-1.5 text-sm transition-colors ${
              item.danger ? 'text-dc-red hover:bg-dc-red/10' : 'text-dc-text hover:bg-dc-hover'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        </div>
      ))}
    </motion.div>
  );
}

// Hook for context menu
export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
    isCurrentUser: boolean;
  } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, messageId: string, isCurrentUser: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, messageId, isCurrentUser });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, handleContextMenu, closeContextMenu };
}
