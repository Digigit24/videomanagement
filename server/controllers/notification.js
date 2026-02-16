import {
  getUserNotifications,
  getUnreadCount,
  markAsSeen,
  markAllAsSeen,
} from "../services/notification.js";
import { apiError } from "../utils/logger.js";

export async function getNotifications(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await getUserNotifications(req.user.id, limit);
    const unreadCount = await getUnreadCount(req.user.id);
    res.json({ notifications, unreadCount });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get notifications" });
  }
}

export async function getNotificationCount(req, res) {
  try {
    const count = await getUnreadCount(req.user.id);
    res.json({ count });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get notification count" });
  }
}

export async function markNotificationSeen(req, res) {
  try {
    const { id } = req.params;
    await markAsSeen(id, req.user.id);
    res.json({ message: "Notification marked as seen" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to mark notification" });
  }
}

export async function markAllNotificationsSeen(req, res) {
  try {
    await markAllAsSeen(req.user.id);
    res.json({ message: "All notifications marked as seen" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to mark notifications" });
  }
}
