import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '@/services/api.service';
import { Notification } from '@/types';
import { Bell, Check, CheckCheck } from 'lucide-react';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const past = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - past) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const TYPE_ICONS: Record<string, string> = {
  video_uploaded: '📹',
  status_changed: '🔄',
  workspace_created: '📁',
  member_added: '👤',
  comment_added: '💬',
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Poll for unread count every 30s
  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const loadUnreadCount = async () => {
    try {
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count);
    } catch (e) {
      // silently fail
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(!open);
    if (!open) {
      loadNotifications();
    }
  };

  const handleMarkSeen = async (notification: Notification) => {
    if (!notification.seen) {
      await notificationService.markSeen(notification.id);
      setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, seen: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    // Navigate based on type
    if (notification.entity_type === 'video' && notification.entity_id) {
      navigate(`/video/${notification.entity_id}`);
      setOpen(false);
    } else if (notification.workspace_bucket) {
      navigate(`/workspace/${notification.workspace_bucket}`);
      setOpen(false);
    }
  };

  const handleMarkAllSeen = async () => {
    try {
      await notificationService.markAllSeen();
      setNotifications(prev => prev.map(n => ({ ...n, seen: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error('Failed to mark all as seen:', e);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="h-4 w-4 text-gray-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-[70vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllSeen}
                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                <p className="text-xs text-gray-400">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleMarkSeen(notification)}
                    className={`w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-gray-50 transition-colors ${
                      !notification.seen ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">
                      {TYPE_ICONS[notification.type] || '🔔'}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-medium truncate ${!notification.seen ? 'text-gray-900' : 'text-gray-600'}`}>
                          {notification.title}
                        </p>
                        {!notification.seen && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {notification.workspace_name && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {notification.workspace_name}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {timeAgo(notification.created_at)}
                        </span>
                      </div>
                    </div>

                    {!notification.seen && (
                      <Check className="h-3 w-3 text-gray-300 flex-shrink-0 mt-1" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
