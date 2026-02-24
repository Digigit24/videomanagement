import { getActivities, getUserActivities } from "../services/activity.js";
import { apiError } from "../utils/logger.js";

export async function listActivities(req, res) {
  try {
    const { limit = 50, type } = req.query;
    const activities = await getActivities(parseInt(limit), type);
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
    const activities = await getUserActivities(userId, parseInt(limit));
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
    const { getEntityActivities } = await import("../services/activity.js");
    const activities = await getEntityActivities(
      entityType,
      entityId,
      parseInt(limit),
    );
    res.json({ activities });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get entity activities" });
  }
}
