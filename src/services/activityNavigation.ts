import type { ActivityItem } from '../stores/activityStore';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';

/** Open whatever an activity item points at, then dismiss the notification surfaces. */
export function navigateActivity(item: ActivityItem) {
  const ui = useUIStore.getState();
  if (item.callType) {
    ui.setShowNotifications(false);
    ui.setShowCalls(true);
    return;
  }
  if (item.dmId) {
    useChatStore.getState().setActiveDm(item.dmId);
  } else if (item.channelId) {
    if (item.serverId) useChatStore.getState().setActiveServer(item.serverId);
    useChatStore.getState().setActiveChannel(item.channelId);
  }
  ui.setShowNotifications(false);
  ui.setShowCalls(false);
}
