import { getPool } from "../db/index.js";
import {
  generatePresignedGetUrl,
  getVideoStreamWithMeta,
  resolveBucket,
  s3ObjectExists,
} from "./storage.js";

const CONTENT_TYPES = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
};

function getContentType(filename, fallback = null) {
  if (fallback) return fallback;
  const lower = (filename || "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  return CONTENT_TYPES[ext] || "video/mp4";
}

function contentDispositionFilename(filename) {
  const safeFilename = String(filename || "video.mp4").replace(/["\r\n]/g, "_");
  return `attachment; filename="${safeFilename}"`;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

async function resolveVideoSourceObject(video) {
  const { bucket: physicalBucket, prefix } = resolveBucket(video.bucket);
  const safeName = String(video.filename || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
  const candidates = uniqueValues([
    video.object_key,
    prefix && video.object_key && !video.object_key.startsWith(prefix)
      ? `${prefix}${video.object_key}`
      : null,
    `${prefix}videos/${video.id}/${safeName}`,
  ]);

  console.log(
    `[VideoManifestAPI] Resolving source: video=${video.id}, workspaceBucket=${video.bucket}, physicalBucket=${physicalBucket}, dbObjectKey=${video.object_key}, candidates=${JSON.stringify(candidates)}`,
  );

  for (const key of candidates) {
    if (await s3ObjectExists(video.bucket, key)) {
      console.log(`[VideoManifestAPI] Source found: video=${video.id}, bucket=${physicalBucket}, key=${key}`);
      return { bucketName: video.bucket, physicalBucket, key };
    }
  }

  console.warn(
    `[VideoManifestAPI] Source missing: video=${video.id}, physicalBucket=${physicalBucket}, checkedKeys=${JSON.stringify(candidates)}`,
  );

  const error = new Error("Video source file not found in storage");
  error.statusCode = 404;
  error.details = {
    video_id: video.id,
    bucket: physicalBucket,
    checked_keys: candidates,
    processing_status: video.processing_status || null,
  };
  throw error;
}

function toJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function toJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function getFolderManifest(folderId, baseUrl) {
  const pool = getPool();

  const folderResult = await pool.query(
    `SELECT f.id, f.name, f.updated_at, w.bucket as workspace_bucket
     FROM folders f
     JOIN workspaces w ON f.workspace_id = w.id
     WHERE f.id = $1`,
    [folderId],
  );

  const folder = folderResult.rows[0];
  if (!folder) return null;

  const videosResult = await pool.query(
    `SELECT v.id, v.filename, v.size, v.updated_at, v.created_at,
            v.duration_seconds, v.media_type,
            COALESCE(m.labels, '[]'::jsonb) as labels,
            COALESCE(m.scenes, '[]'::jsonb) as scenes,
            m.transcript_summary,
            m.updated_at as metadata_updated_at
     FROM videos v
     LEFT JOIN video_approved_metadata m ON m.video_id = v.id
     WHERE v.folder_id = $1
       AND v.is_active_version = TRUE
       AND v.media_type = 'video'
     ORDER BY v.created_at DESC`,
    [folderId],
  );

  const timestamps = [
    folder.updated_at,
    ...videosResult.rows.flatMap((video) => [video.updated_at, video.metadata_updated_at]),
  ].filter(Boolean);

  const versionDate = timestamps.length
    ? new Date(Math.max(...timestamps.map((value) => new Date(value).getTime())))
    : new Date();

  return {
    folder_id: folder.id,
    folder_name: folder.name,
    version: versionDate.toISOString(),
    videos: videosResult.rows.map((video) => ({
      id: video.id,
      filename: video.filename,
      title: video.filename.replace(/\.[^.]+$/, ""),
      content_type: getContentType(video.filename),
      duration: video.duration_seconds !== null ? Number(video.duration_seconds) : null,
      size_bytes: Number(video.size || 0),
      download_url: `${baseUrl}/api/videos/${video.id}/download`,
      public_raw_url: null,
      labels: toJsonArray(video.labels),
      scenes: toJsonArray(video.scenes),
      transcript_summary: video.transcript_summary || null,
      updated_at: new Date(video.updated_at || video.created_at).toISOString(),
    })),
  };
}

export async function listExternalVideoFolders(baseUrl, { bucket = null, workspaceId = null } = {}) {
  const params = [];
  const filters = [];

  if (bucket) {
    params.push(bucket);
    filters.push(`w.bucket = $${params.length}`);
  }

  if (workspaceId) {
    params.push(workspaceId);
    filters.push(`w.id = $${params.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const result = await getPool().query(
    `SELECT f.id, f.name, f.workspace_id, f.created_at, f.updated_at,
            w.bucket as workspace_bucket,
            COUNT(v.id) FILTER (WHERE v.is_active_version = TRUE) as media_count,
            COUNT(v.id) FILTER (WHERE v.is_active_version = TRUE AND v.media_type = 'video') as video_count,
            COUNT(v.id) FILTER (WHERE v.is_active_version = TRUE AND v.media_type = 'photo') as photo_count
     FROM folders f
     JOIN workspaces w ON w.id = f.workspace_id
     LEFT JOIN videos v ON v.folder_id = f.id
     ${where}
     GROUP BY f.id, w.bucket
     ORDER BY f.updated_at DESC, f.created_at DESC`,
    params,
  );

  return {
    folders: result.rows.map((folder) => ({
      id: folder.id,
      name: folder.name,
      workspace_id: folder.workspace_id,
      workspace_bucket: folder.workspace_bucket,
      media_count: Number(folder.media_count || 0),
      video_count: Number(folder.video_count || 0),
      photo_count: Number(folder.photo_count || 0),
      manifest_url: `${baseUrl}/api/video-folders/${folder.id}/manifest`,
      created_at: new Date(folder.created_at).toISOString(),
      updated_at: new Date(folder.updated_at || folder.created_at).toISOString(),
    })),
  };
}

export async function getExternalFolder(folderId) {
  const result = await getPool().query(
    `SELECT f.id, f.name, f.workspace_id, w.bucket as workspace_bucket
     FROM folders f
     JOIN workspaces w ON w.id = f.workspace_id
     WHERE f.id = $1`,
    [folderId],
  );
  return result.rows[0] || null;
}

export async function getVideoForExternalApi(videoId) {
  const result = await getPool().query(
    `SELECT id, bucket, filename, object_key, size, media_type, is_active_version, processing_status
     FROM videos
     WHERE id = $1 AND is_active_version = TRUE AND media_type = 'video'`,
    [videoId],
  );
  return result.rows[0] || null;
}

export async function getDownloadStream(videoId, rangeHeader) {
  const video = await getVideoForExternalApi(videoId);
  if (!video) return null;

  const source = await resolveVideoSourceObject(video);
  const streamMeta = await getVideoStreamWithMeta(source.bucketName, source.key, rangeHeader);
  return {
    video,
    stream: streamMeta.stream,
    contentLength: streamMeta.contentLength,
    contentType: getContentType(video.filename, streamMeta.contentType),
    contentRange: streamMeta.contentRange,
  };
}

export async function createSignedRawUrl(videoId, expiresInSeconds = 3600) {
  const video = await getVideoForExternalApi(videoId);
  if (!video) return null;

  const expiresIn = Math.max(60, Math.min(Number(expiresInSeconds) || 3600, 3600));
  const contentType = getContentType(video.filename);
  const source = await resolveVideoSourceObject(video);
  const url = await generatePresignedGetUrl(source.bucketName, source.key, expiresIn, {
    responseContentType: contentType,
    responseContentDisposition: contentDispositionFilename(video.filename),
  });
  return {
    video_id: video.id,
    url,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    content_type: contentType,
  };
}

export async function createAnalysisRun(videoId, payload) {
  const video = await getVideoForExternalApi(videoId);
  if (!video) return null;

  const source = typeof payload.source === "string" ? payload.source.trim() : "";
  const status = typeof payload.status === "string" ? payload.status.trim() : "";

  if (!source || !status) {
    const error = new Error("source and status are required");
    error.statusCode = 400;
    throw error;
  }

  const result = await getPool().query(
    `INSERT INTO video_analysis_runs
       (video_id, source, source_version, status, labels, scenes, transcript, summary, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9::jsonb)
     RETURNING id, video_id, status`,
    [
      videoId,
      source,
      payload.source_version || null,
      status,
      JSON.stringify(toJsonArray(payload.labels)),
      JSON.stringify(toJsonArray(payload.scenes)),
      payload.transcript ? JSON.stringify(toJsonObject(payload.transcript)) : null,
      payload.summary || null,
      JSON.stringify(toJsonObject(payload.metadata)),
    ],
  );

  await getPool().query("UPDATE videos SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [videoId]);

  return result.rows[0];
}

export async function getAnalysisRuns(videoId) {
  const video = await getVideoForExternalApi(videoId);
  if (!video) return null;

  const result = await getPool().query(
    `SELECT id, source, source_version, created_at, status, labels, scenes, transcript, summary, metadata
     FROM video_analysis_runs
     WHERE video_id = $1
     ORDER BY created_at DESC`,
    [videoId],
  );

  return {
    video_id: videoId,
    analysis_runs: result.rows,
  };
}

export async function updateApprovedMetadata(videoId, payload) {
  const video = await getVideoForExternalApi(videoId);
  if (!video) return null;

  const labels = toJsonArray(payload.labels);
  const scenes = toJsonArray(payload.scenes);
  const transcriptSummary =
    typeof payload.transcript_summary === "string"
      ? payload.transcript_summary
      : typeof payload.summary === "string"
        ? payload.summary
        : null;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO video_approved_metadata (video_id, labels, scenes, transcript_summary, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (video_id)
       DO UPDATE SET
         labels = EXCLUDED.labels,
         scenes = EXCLUDED.scenes,
         transcript_summary = EXCLUDED.transcript_summary,
         updated_at = CURRENT_TIMESTAMP
       RETURNING video_id, labels, scenes, transcript_summary, updated_at`,
      [videoId, JSON.stringify(labels), JSON.stringify(scenes), transcriptSummary],
    );
    await client.query("UPDATE videos SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [videoId]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
