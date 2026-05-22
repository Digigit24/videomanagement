import { Readable } from "stream";
import {
  createAnalysisRun,
  createSignedRawUrl,
  getAnalysisRuns,
  getDownloadStream,
  getFolderManifest,
  updateApprovedMetadata,
} from "../services/videoManifestApi.js";
import { apiError } from "../utils/logger.js";

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function contentDispositionFilename(filename) {
  const safeFilename = String(filename || "video.mp4").replace(/["\r\n]/g, "_");
  return `attachment; filename="${safeFilename}"`;
}

function pipeBodyToResponse(body, res) {
  if (typeof body?.pipe === "function") {
    body.pipe(res);
    return;
  }
  if (body) {
    Readable.fromWeb(body).pipe(res);
    return;
  }
  res.end();
}

export async function getVideoFolderManifest(req, res) {
  try {
    const manifest = await getFolderManifest(req.params.folderId, getBaseUrl(req));
    if (!manifest) {
      return res.status(404).json({ error: "Folder not found" });
    }
    res.json(manifest);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to build folder manifest" });
  }
}

export async function downloadExternalVideo(req, res) {
  try {
    const rangeHeader = req.headers.range || null;
    const download = await getDownloadStream(req.params.videoId, rangeHeader);

    if (!download) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.status(download.contentRange ? 206 : 200);
    res.setHeader("Content-Type", download.contentType);
    res.setHeader("Content-Disposition", contentDispositionFilename(download.video.filename));
    res.setHeader("Accept-Ranges", "bytes");
    if (download.contentLength !== undefined) {
      res.setHeader("Content-Length", download.contentLength);
    }
    if (download.contentRange) {
      res.setHeader("Content-Range", download.contentRange);
    }

    pipeBodyToResponse(download.stream, res);
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : "Failed to download video",
        ...(error.details ? { details: error.details } : {}),
      });
    }
  }
}

export async function getSignedExternalVideoUrl(req, res) {
  try {
    const expiresIn = req.body?.expires_in_seconds;
    const signed = await createSignedRawUrl(req.params.videoId, expiresIn);
    if (!signed) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.json(signed);
  } catch (error) {
    apiError(req, error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to create signed URL",
      ...(error.details ? { details: error.details } : {}),
    });
  }
}

export async function postVideoAnalysisRun(req, res) {
  try {
    const run = await createAnalysisRun(req.params.videoId, req.body || {});
    if (!run) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.status(201).json({
      analysis_run_id: run.id,
      video_id: run.video_id,
      status: "stored",
    });
  } catch (error) {
    apiError(req, error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to store analysis run",
    });
  }
}

export async function listVideoAnalysisRuns(req, res) {
  try {
    const result = await getAnalysisRuns(req.params.videoId);
    if (!result) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.json(result);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to fetch analysis runs" });
  }
}

export async function patchApprovedVideoMetadata(req, res) {
  try {
    const metadata = await updateApprovedMetadata(req.params.videoId, req.body || {});
    if (!metadata) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.json({
      video_id: metadata.video_id,
      labels: metadata.labels,
      scenes: metadata.scenes,
      transcript_summary: metadata.transcript_summary,
      updated_at: metadata.updated_at,
    });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update approved metadata" });
  }
}
