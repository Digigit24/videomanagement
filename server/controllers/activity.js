import { getActivities, getUserActivities } from "../services/activity.js";
import { apiError } from "../utils/logger.js";

export async function listActivities(req, res) {
  try {
    const { limit = 50, type } = req.query;
    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 50, 500));
    const activities = await getActivities(safeLimit, type);
    res.json({ activities });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get activities" });
  }
}

export async function listUserActivities(req, res) {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;
    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 50, 500));
    const activities = await getUserActivities(userId, safeLimit);
    res.json({ activities });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get user activities" });
  }
}

export async function listEntityActivities(req, res) {
  try {
    const { entityType, entityId } = req.params;
    const { limit = 50 } = req.query;
    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 50, 500));
    const { getEntityActivities } = await import("../services/activity.js");
    const activities = await getEntityActivities(
      entityType,
      entityId,
      safeLimit,
    );
    res.json({ activities });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get entity activities" });
  }
}
