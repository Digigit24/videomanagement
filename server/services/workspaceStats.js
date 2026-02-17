import { getPool } from "../db/index.js";

/**
 * Get analytics for a specific workspace bucket.
 * Returns current video counts by status + historical posted count
 * (including videos that were auto-deleted after posting).
 */
export async function getWorkspaceAnalytics(bucket) {
  const pool = getPool();

  // Current video counts by status
  const statusCounts = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'Draft') as draft,
       COUNT(*) FILTER (WHERE status = 'Pending') as pending,
       COUNT(*) FILTER (WHERE status = 'Under Review') as under_review,
       COUNT(*) FILTER (WHERE status = 'Approved') as approved,
       COUNT(*) FILTER (WHERE status = 'Changes Needed') as changes_needed,
       COUNT(*) FILTER (WHERE status = 'Rejected') as rejected,
       COUNT(*) FILTER (WHERE status = 'Posted') as posted,
       COUNT(*) as total
     FROM videos
     WHERE bucket = $1 AND is_active_version = TRUE`,
    [bucket],
  );

  // Historical total posted count (from workspace_video_stats - survives deletion)
  const historicalPosted = await pool.query(
    `SELECT COUNT(DISTINCT video_id) as total_ever_posted
     FROM workspace_video_stats
     WHERE workspace_bucket = $1 AND status_changed_to = 'Posted'`,
    [bucket],
  );

  // Videos posted per month (last 12 months) for charting
  const monthlyPosted = await pool.query(
    `SELECT
       DATE_TRUNC('month', changed_at) as month,
       COUNT(DISTINCT video_id) as count
     FROM workspace_video_stats
     WHERE workspace_bucket = $1
       AND status_changed_to = 'Posted'
       AND changed_at > NOW() - INTERVAL '12 months'
     GROUP BY DATE_TRUNC('month', changed_at)
     ORDER BY month DESC`,
    [bucket],
  );

  // Videos uploaded per month (last 12 months)
  const monthlyUploaded = await pool.query(
    `SELECT
       DATE_TRUNC('month', created_at) as month,
       COUNT(*) as count
     FROM videos
     WHERE bucket = $1 AND is_active_version = TRUE
       AND created_at > NOW() - INTERVAL '12 months'
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY month DESC`,
    [bucket],
  );

  // Recent status changes (last 20)
  const recentActivity = await pool.query(
    `SELECT wvs.*, u.name as changed_by_name
     FROM workspace_video_stats wvs
     LEFT JOIN users u ON wvs.changed_by = u.id
     WHERE wvs.workspace_bucket = $1
     ORDER BY wvs.changed_at DESC
     LIMIT 20`,
    [bucket],
  );

  const counts = statusCounts.rows[0];

  return {
    current: {
      total: parseInt(counts.total, 10),
      draft: parseInt(counts.draft, 10),
      pending: parseInt(counts.pending, 10),
      underReview: parseInt(counts.under_review, 10),
      approved: parseInt(counts.approved, 10),
      changesNeeded: parseInt(counts.changes_needed, 10),
      rejected: parseInt(counts.rejected, 10),
      posted: parseInt(counts.posted, 10),
    },
    historical: {
      totalEverPosted: parseInt(historicalPosted.rows[0].total_ever_posted, 10),
    },
    monthlyPosted: monthlyPosted.rows,
    monthlyUploaded: monthlyUploaded.rows,
    recentActivity: recentActivity.rows,
  };
}
