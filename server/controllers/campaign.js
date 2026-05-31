import { getPool } from "../db/index.js";
import { apiError } from "../utils/logger.js";

function interpolateTemplate(templateStr, ctx) {
  let result = templateStr;
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === "object" && value !== null) {
      const json = JSON.stringify(value);
      result = result.replace(new RegExp(`"\\{\\{${key}\\}\\}"`, "g"), json);
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), json);
    } else {
      const str = value == null ? "" : String(value);
      const escaped = str
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), escaped);
    }
  }
  return JSON.parse(result);
}

export function buildPayload(workspace, post, platform, eventName) {
  const rawUrl = post.mediaurl || post.video_url || "";
  const ctx = {
    event: eventName,
    clientId: workspace.id,
    clientName: workspace.client_name,
    postId: post.id,
    mediaurl: rawUrl,
    media_items: rawUrl ? [{ mediaFormat: "PHOTO", sourceUrl: rawUrl }] : [],
  };

  if (platform === "gmb" || platform === "linkedin") {
    ctx.title = post.title;
    ctx.summary = post.summary;
  } else if (platform === "ig") {
    ctx.caption = post.caption;
  } else if (platform === "twitter") {
    ctx.tweet_text = post.tweet_text;
  } else if (platform === "youtube") {
    ctx.video_title = post.video_title;
    ctx.description = post.description;
  }

  const templateStr = workspace[`${platform}_payload_template`];
  if (templateStr) {
    try {
      return interpolateTemplate(templateStr, ctx);
    } catch (e) {
      console.warn(`[Webhook] ${platform} template interpolation failed, using default:`, e.message);
    }
  }

  return ctx;
}

async function triggerCampaignWebhook(workspace, post, platform, eventName) {
  const activeKey = `${platform}_webhook_active`;
  const urlKey = `${platform}_webhook_url`;
  const headersKey = `${platform}_webhook_headers`;

  if (!workspace || !workspace[activeKey] || !workspace[urlKey]) {
    return;
  }

  let customHeaders = { "Content-Type": "application/json" };
  if (workspace[headersKey]) {
    try {
      customHeaders = { ...customHeaders, ...JSON.parse(workspace[headersKey]) };
    } catch (e) {
      console.warn(`[Webhook] ${platform.toUpperCase()} headers parse failed:`, e.message);
    }
  }

  const payload = buildPayload(workspace, post, platform, eventName);

  const response = await fetch(workspace[urlKey], {
    method: "POST",
    headers: customHeaders,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Webhook returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  console.log(`[Webhook] ${platform.toUpperCase()} fired OK (${response.status}) for post ${post.id}`);
}

// GMB
export async function getGmbPosts(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query(
      "SELECT * FROM gmb_posts WHERE workspace_id = $1 ORDER BY id DESC",
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to retrieve GMB posts." });
  }
}

export async function addGmbPost(req, res) {
  const { id } = req.params;
  const { title, summary, mediaurl } = req.body;
  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Post title is required." });
  }
  try {
    const result = await getPool().query(
      "INSERT INTO gmb_posts (workspace_id, title, summary, mediaurl, status) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, title.trim(), summary ? summary.trim() : "", mediaurl ? mediaurl.trim() : "", "ready"]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create GMB post." });
  }
}

export async function updateGmbPost(req, res) {
  const { id } = req.params;
  const { title, summary, mediaurl } = req.body;
  try {
    const result = await getPool().query(
      "UPDATE gmb_posts SET title = $1, summary = $2, mediaurl = $3 WHERE id = $4 RETURNING *",
      [title, summary, mediaurl, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Post not found." });
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update GMB post." });
  }
}

export async function updateGmbPostStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const targetStatus = status || "posted";

    if (targetStatus !== "posted") {
      const result = await getPool().query(
        "UPDATE gmb_posts SET status = $1 WHERE id = $2 RETURNING *",
        [targetStatus, id]
      );
      return res.json(result.rows[0]);
    }

    const postQuery = await getPool().query("SELECT * FROM gmb_posts WHERE id = $1", [id]);
    if (postQuery.rows.length === 0) {
      return res.status(404).json({ error: "GMB post not found." });
    }
    const post = postQuery.rows[0];

    const workspaceQuery = await getPool().query("SELECT * FROM workspaces WHERE id = $1", [post.workspace_id]);
    const workspace = workspaceQuery.rows[0];

    try {
      await triggerCampaignWebhook(workspace, post, "gmb", "gmb_publish");
    } catch (webhookErr) {
      console.error(`[Webhook] GMB webhook failed for post ${id}:`, webhookErr.message);
      const failed = await getPool().query(
        "UPDATE gmb_posts SET status = 'failed' WHERE id = $1 RETURNING *",
        [id]
      );
      return res.status(502).json({
        error: "Webhook delivery failed. Post marked as failed.",
        details: webhookErr.message,
        post: failed.rows[0],
      });
    }

    const result = await getPool().query(
      "UPDATE gmb_posts SET status = 'posted' WHERE id = $1 RETURNING *",
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update GMB post status." });
  }
}

// Instagram
export async function getInstagramPosts(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query(
      "SELECT * FROM instagram_posts WHERE workspace_id = $1 ORDER BY id DESC",
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to retrieve Instagram posts." });
  }
}

export async function addInstagramPost(req, res) {
  const { id } = req.params;
  const { caption, mediaurl, posted_at } = req.body;
  if (!caption || caption.trim() === "") {
    return res.status(400).json({ error: "Post caption is required." });
  }
  try {
    const result = await getPool().query(
      "INSERT INTO instagram_posts (workspace_id, caption, mediaurl, status, posted_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, caption.trim(), mediaurl ? mediaurl.trim() : "", "ready", posted_at || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create Instagram post." });
  }
}

export async function updateInstagramPost(req, res) {
  const { id } = req.params;
  const { caption, mediaurl, posted_at } = req.body;
  try {
    const result = await getPool().query(
      "UPDATE instagram_posts SET caption = $1, mediaurl = $2, posted_at = $3 WHERE id = $4 RETURNING *",
      [caption, mediaurl, posted_at || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Post not found." });
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update Instagram post." });
  }
}

export async function updateInstagramPostStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const targetStatus = status || "posted";

    if (targetStatus !== "posted") {
      const result = await getPool().query(
        "UPDATE instagram_posts SET status = $1 WHERE id = $2 RETURNING *",
        [targetStatus, id]
      );
      return res.json(result.rows[0]);
    }

    const postQuery = await getPool().query("SELECT * FROM instagram_posts WHERE id = $1", [id]);
    if (postQuery.rows.length === 0) {
      return res.status(404).json({ error: "Instagram post not found." });
    }
    const post = postQuery.rows[0];

    const workspaceQuery = await getPool().query("SELECT * FROM workspaces WHERE id = $1", [post.workspace_id]);
    const workspace = workspaceQuery.rows[0];

    try {
      await triggerCampaignWebhook(workspace, post, "ig", "instagram_publish");
    } catch (webhookErr) {
      console.error(`[Webhook] Instagram webhook failed for post ${id}:`, webhookErr.message);
      const failed = await getPool().query(
        "UPDATE instagram_posts SET status = 'failed' WHERE id = $1 RETURNING *",
        [id]
      );
      return res.status(502).json({
        error: "Webhook delivery failed. Post marked as failed.",
        details: webhookErr.message,
        post: failed.rows[0],
      });
    }

    const result = await getPool().query(
      "UPDATE instagram_posts SET status = 'posted' WHERE id = $1 RETURNING *",
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update Instagram post status." });
  }
}

// LinkedIn
export async function getLinkedInPosts(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query(
      "SELECT * FROM linkedin_posts WHERE workspace_id = $1 ORDER BY id DESC",
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to retrieve LinkedIn posts." });
  }
}

export async function addLinkedInPost(req, res) {
  const { id } = req.params;
  const { title, summary, mediaurl } = req.body;
  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Post title is required." });
  }
  try {
    const result = await getPool().query(
      "INSERT INTO linkedin_posts (workspace_id, title, summary, mediaurl, status) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, title.trim(), summary ? summary.trim() : "", mediaurl ? mediaurl.trim() : "", "ready"]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create LinkedIn post." });
  }
}

export async function updateLinkedInPost(req, res) {
  const { id } = req.params;
  const { title, summary, mediaurl } = req.body;
  try {
    const result = await getPool().query(
      "UPDATE linkedin_posts SET title = $1, summary = $2, mediaurl = $3 WHERE id = $4 RETURNING *",
      [title, summary, mediaurl, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Post not found." });
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update LinkedIn post." });
  }
}

export async function updateLinkedInPostStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const targetStatus = status || "posted";

    if (targetStatus !== "posted") {
      const result = await getPool().query(
        "UPDATE linkedin_posts SET status = $1 WHERE id = $2 RETURNING *",
        [targetStatus, id]
      );
      return res.json(result.rows[0]);
    }

    const postQuery = await getPool().query("SELECT * FROM linkedin_posts WHERE id = $1", [id]);
    if (postQuery.rows.length === 0) {
      return res.status(404).json({ error: "LinkedIn post not found." });
    }
    const post = postQuery.rows[0];

    const workspaceQuery = await getPool().query("SELECT * FROM workspaces WHERE id = $1", [post.workspace_id]);
    const workspace = workspaceQuery.rows[0];

    try {
      await triggerCampaignWebhook(workspace, post, "linkedin", "linkedin_publish");
    } catch (webhookErr) {
      console.error(`[Webhook] LinkedIn webhook failed for post ${id}:`, webhookErr.message);
      const failed = await getPool().query(
        "UPDATE linkedin_posts SET status = 'failed' WHERE id = $1 RETURNING *",
        [id]
      );
      return res.status(502).json({
        error: "Webhook delivery failed. Post marked as failed.",
        details: webhookErr.message,
        post: failed.rows[0],
      });
    }

    const result = await getPool().query(
      "UPDATE linkedin_posts SET status = 'posted' WHERE id = $1 RETURNING *",
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update LinkedIn post status." });
  }
}

// Twitter
export async function getTwitterPosts(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query(
      "SELECT * FROM twitter_posts WHERE workspace_id = $1 ORDER BY id DESC",
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to retrieve Twitter posts." });
  }
}

export async function addTwitterPost(req, res) {
  const { id } = req.params;
  const { tweet_text, mediaurl } = req.body;
  if (!tweet_text || tweet_text.trim() === "") {
    return res.status(400).json({ error: "Tweet text is required." });
  }
  try {
    const result = await getPool().query(
      "INSERT INTO twitter_posts (workspace_id, tweet_text, mediaurl, status) VALUES ($1, $2, $3, $4) RETURNING *",
      [id, tweet_text.trim(), mediaurl ? mediaurl.trim() : "", "ready"]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create Twitter post." });
  }
}

export async function updateTwitterPost(req, res) {
  const { id } = req.params;
  const { tweet_text, mediaurl } = req.body;
  try {
    const result = await getPool().query(
      "UPDATE twitter_posts SET tweet_text = $1, mediaurl = $2 WHERE id = $3 RETURNING *",
      [tweet_text, mediaurl, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Post not found." });
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update Twitter post." });
  }
}

export async function updateTwitterPostStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const targetStatus = status || "posted";

    if (targetStatus !== "posted") {
      const result = await getPool().query(
        "UPDATE twitter_posts SET status = $1 WHERE id = $2 RETURNING *",
        [targetStatus, id]
      );
      return res.json(result.rows[0]);
    }

    const postQuery = await getPool().query("SELECT * FROM twitter_posts WHERE id = $1", [id]);
    if (postQuery.rows.length === 0) {
      return res.status(404).json({ error: "Twitter post not found." });
    }
    const post = postQuery.rows[0];

    const workspaceQuery = await getPool().query("SELECT * FROM workspaces WHERE id = $1", [post.workspace_id]);
    const workspace = workspaceQuery.rows[0];

    try {
      await triggerCampaignWebhook(workspace, post, "twitter", "twitter_publish");
    } catch (webhookErr) {
      console.error(`[Webhook] Twitter webhook failed for post ${id}:`, webhookErr.message);
      const failed = await getPool().query(
        "UPDATE twitter_posts SET status = 'failed' WHERE id = $1 RETURNING *",
        [id]
      );
      return res.status(502).json({
        error: "Webhook delivery failed. Post marked as failed.",
        details: webhookErr.message,
        post: failed.rows[0],
      });
    }

    const result = await getPool().query(
      "UPDATE twitter_posts SET status = 'posted' WHERE id = $1 RETURNING *",
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update Twitter post status." });
  }
}

// YouTube
export async function getYoutubePosts(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query(
      "SELECT * FROM youtube_posts WHERE workspace_id = $1 ORDER BY id DESC",
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to retrieve YouTube posts." });
  }
}

export async function addYoutubePost(req, res) {
  const { id } = req.params;
  const { video_title, description, video_url } = req.body;
  if (!video_title || video_title.trim() === "") {
    return res.status(400).json({ error: "Video title is required." });
  }
  try {
    const result = await getPool().query(
      "INSERT INTO youtube_posts (workspace_id, video_title, description, video_url, status) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, video_title.trim(), description ? description.trim() : "", video_url ? video_url.trim() : "", "ready"]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create YouTube post." });
  }
}

export async function updateYoutubePost(req, res) {
  const { id } = req.params;
  const { video_title, description, video_url } = req.body;
  try {
    const result = await getPool().query(
      "UPDATE youtube_posts SET video_title = $1, description = $2, video_url = $3 WHERE id = $4 RETURNING *",
      [video_title, description, video_url, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Post not found." });
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update YouTube post." });
  }
}

export async function deleteGmbPost(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query("DELETE FROM gmb_posts WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "GMB post not found." });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete GMB post." });
  }
}

export async function deleteInstagramPost(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query("DELETE FROM instagram_posts WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Instagram post not found." });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete Instagram post." });
  }
}

export async function deleteLinkedInPost(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query("DELETE FROM linkedin_posts WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "LinkedIn post not found." });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete LinkedIn post." });
  }
}

export async function deleteTwitterPost(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query("DELETE FROM twitter_posts WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Twitter post not found." });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete Twitter post." });
  }
}

export async function deleteYoutubePost(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query("DELETE FROM youtube_posts WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "YouTube post not found." });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete YouTube post." });
  }
}

export async function updateYoutubePostStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const targetStatus = status || "posted";

    if (targetStatus !== "posted") {
      const result = await getPool().query(
        "UPDATE youtube_posts SET status = $1 WHERE id = $2 RETURNING *",
        [targetStatus, id]
      );
      return res.json(result.rows[0]);
    }

    const postQuery = await getPool().query("SELECT * FROM youtube_posts WHERE id = $1", [id]);
    if (postQuery.rows.length === 0) {
      return res.status(404).json({ error: "YouTube post not found." });
    }
    const post = postQuery.rows[0];

    const workspaceQuery = await getPool().query("SELECT * FROM workspaces WHERE id = $1", [post.workspace_id]);
    const workspace = workspaceQuery.rows[0];

    try {
      await triggerCampaignWebhook(workspace, post, "youtube", "youtube_publish");
    } catch (webhookErr) {
      console.error(`[Webhook] YouTube webhook failed for post ${id}:`, webhookErr.message);
      const failed = await getPool().query(
        "UPDATE youtube_posts SET status = 'failed' WHERE id = $1 RETURNING *",
        [id]
      );
      return res.status(502).json({
        error: "Webhook delivery failed. Post marked as failed.",
        details: webhookErr.message,
        post: failed.rows[0],
      });
    }

    const result = await getPool().query(
      "UPDATE youtube_posts SET status = 'posted' WHERE id = $1 RETURNING *",
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update YouTube post status." });
  }
}
