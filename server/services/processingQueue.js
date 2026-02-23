import { getPool } from "../db/index.js";
import { processVideoToHLS } from "./ffmpeg.js";
import fs from "fs";

// Maximum time (ms) for a single video to complete all processing steps.
const MAX_PROCESSING_TIME_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Singleton processing queue that handles video transcoding sequentially.
 * Only ONE video is processed at a time to prevent CPU/RAM overload.
 *
 * Flow:
 *  1. Upload controller saves file to local temp dir and calls enqueue()
 *  2. Queue processes videos one at a time from local files
 *  3. FFmpeg transcodes locally, uploads HLS segments to S3
 *  4. Original file is uploaded to S3 permanent storage
 *  5. Local temp file is deleted
 *
 * Recovery: on startup, call `recoverStuckVideos()` to re-enqueue any
 * videos stuck in 'queued' or 'processing' state from a previous crash.
 */
class ProcessingQueue {
  constructor() {
    this.queue = []; // { videoId, localFilePath, bucketName, originalFilename }
    this.processing = false;
    this.currentVideoId = null;
    this._processingTimer = null;
  }

  /**
   * Add a video to the processing queue.
   * @param {string} videoId - Video DB record ID
   * @param {string} localFilePath - Path to the local temp file on server OR an S3 key (for recovery)
   * @param {string} bucketName - Workspace bucket name
   * @param {string} originalFilename - Sanitized original filename
   */
  async enqueue(videoId, localFilePath, bucketName, originalFilename) {
    // Prevent duplicate enqueue
    if (this.currentVideoId === videoId) {
      console.log(`[Queue] Video ${videoId} is already being processed, skipping enqueue`);
      return;
    }
    if (this.queue.some((j) => j.videoId === videoId)) {
      console.log(`[Queue] Video ${videoId} is already in queue, skipping enqueue`);
      return;
    }

    this.queue.push({ videoId, localFilePath, bucketName, originalFilename });

    // Mark as queued in DB (don't update updated_at here)
    await this.updateProcessingStatus(videoId, "queued", 0, null);

    console.log(
      `[Queue] Video ${videoId} enqueued. Queue length: ${this.queue.length}, processing: ${this.processing}`
    );
    console.log(
      `[Queue]   source=${localFilePath}, bucket=${bucketName}, filename=${originalFilename}`
    );

    // Start processing if not already running
    this._safeProcessNext();
  }

  /**
   * Get the queue position for a video.
   * Returns: 0 = currently processing, 1+ = position in queue, -1 = not in queue
   */
  getQueuePosition(videoId) {
    if (this.currentVideoId === videoId) return 0;
    const idx = this.queue.findIndex((j) => j.videoId === videoId);
    return idx === -1 ? -1 : idx + 1;
  }

  /**
   * Remove a video from the queue (if queued but not yet processing).
   */
  dequeue(videoId) {
    const idx = this.queue.findIndex((j) => j.videoId === videoId);
    if (idx !== -1) {
      const job = this.queue.splice(idx, 1)[0];
      console.log(
        `[Queue] Video ${videoId} dequeued. Queue length: ${this.queue.length}`
      );
      // Clean up local temp file for dequeued video
      this._cleanupLocalFile(job.localFilePath);
      return true;
    }
    return false;
  }

  /**
   * Check if a video is currently being processed.
   */
  isCurrentlyProcessing(videoId) {
    return this.currentVideoId === videoId;
  }

  /**
   * Get total number of items in the queue (including the one being processed).
   */
  getQueueTotal() {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  /**
   * Get processing info for a specific video.
   */
  async getProcessingInfo(videoId) {
    const position = this.getQueuePosition(videoId);
    const total = this.getQueueTotal();

    const result = await getPool().query(
      "SELECT processing_status, processing_progress, processing_step, hls_ready FROM videos WHERE id = $1",
      [videoId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      processing_status: row.processing_status,
      processing_progress: row.processing_progress || 0,
      processing_step: row.processing_step,
      hls_ready: row.hls_ready,
      queue_position: position,
      queue_total: total,
    };
  }

  /**
   * Safe wrapper that calls processNext and catches any errors.
   */
  _safeProcessNext() {
    this.processNext().catch((err) => {
      console.error(`[Queue] CRITICAL: processNext threw an unhandled error:`, err);
      this._forceReset();
    });
  }

  /**
   * Force-reset queue state after a catastrophic failure.
   */
  _forceReset() {
    const failedVideoId = this.currentVideoId;
    console.error(`[Queue] Force-resetting queue state. Current video: ${failedVideoId}`);

    if (this._processingTimer) {
      clearTimeout(this._processingTimer);
      this._processingTimer = null;
    }

    this.processing = false;
    this.currentVideoId = null;

    if (failedVideoId) {
      this.updateProcessingStatus(failedVideoId, "failed", 0, "error: queue force-reset after crash").catch((e) =>
        console.error(`[Queue] Failed to mark ${failedVideoId} as failed during reset:`, e.message)
      );
    }

    // Try to continue with next video after a short delay
    if (this.queue.length > 0) {
      console.log(`[Queue] Scheduling retry for remaining ${this.queue.length} videos in 3s...`);
      setTimeout(() => this._safeProcessNext(), 3000);
    }
  }

  /**
   * Process the next video in the queue. Only ONE at a time.
   */
  async processNext() {
    if (this.processing || this.queue.length === 0) {
      if (this.queue.length === 0 && !this.processing) {
        console.log(`[Queue] Queue empty, nothing to process.`);
      }
      return;
    }

    this.processing = true;
    const job = this.queue.shift();
    this.currentVideoId = job.videoId;

    console.log(
      `[Queue] === Starting processing for video ${job.videoId} ===`
    );
    console.log(
      `[Queue]   Source: ${job.localFilePath}`
    );
    console.log(
      `[Queue]   Remaining in queue: ${this.queue.length}`
    );

    try {
      // Mark as processing
      await this.updateProcessingStatus(job.videoId, "processing", 0, "starting");

      // Set an overall processing timeout
      const timeoutPromise = new Promise((_, reject) => {
        this._processingTimer = setTimeout(() => {
          reject(new Error(`Processing timed out after ${MAX_PROCESSING_TIME_MS / 1000 / 60} minutes`));
        }, MAX_PROCESSING_TIME_MS);
      });

      // Progress callback
      const onProgress = (step, progress) => {
        this.updateProcessingStatus(job.videoId, "processing", progress, step).catch((e) =>
          console.warn(`[Queue] DB progress update failed: ${e.message}`)
        );
      };

      // Race between actual processing and the timeout
      await Promise.race([
        processVideoToHLS(
          job.localFilePath,
          job.videoId,
          job.bucketName,
          job.originalFilename,
          onProgress
        ),
        timeoutPromise,
      ]);

      // Clear timeout on success
      if (this._processingTimer) {
        clearTimeout(this._processingTimer);
        this._processingTimer = null;
      }

      await this.updateProcessingStatus(job.videoId, "completed", 100, null);
      console.log(`[Queue] === Video ${job.videoId} processing completed successfully ===`);
    } catch (err) {
      // Clear timeout on failure
      if (this._processingTimer) {
        clearTimeout(this._processingTimer);
        this._processingTimer = null;
      }

      const errMsg = err && err.message ? err.message : String(err);
      console.error(`[Queue] === Video ${job.videoId} processing FAILED ===`);
      console.error(`[Queue]   Error: ${errMsg}`);

      try {
        await this.updateProcessingStatus(job.videoId, "failed", 0, `error: ${errMsg.substring(0, 200)}`);
      } catch (dbErr) {
        console.error(`[Queue] CRITICAL: Failed to update DB failure status for ${job.videoId}:`, dbErr.message);
      }

      // Clean up local file on failure
      this._cleanupLocalFile(job.localFilePath);
    } finally {
      // ALWAYS reset state
      this.processing = false;
      this.currentVideoId = null;

      console.log(`[Queue] Processing flag reset. Queue length: ${this.queue.length}`);

      // Process next in queue
      if (this.queue.length > 0) {
        console.log(`[Queue] Moving to next video in queue (${this.queue.length} remaining)...`);
        // Small delay to let the event loop breathe
        setTimeout(() => this._safeProcessNext(), 1000);
      } else {
        console.log(`[Queue] All videos processed. Queue is idle.`);
      }
    }
  }

  /**
   * Recover videos stuck in 'queued' or 'processing' state from a previous crash/restart.
   */
  async recoverStuckVideos() {
    try {
      const pool = getPool();

      const result = await pool.query(
        `SELECT v.id, v.object_key, v.bucket, v.filename, v.processing_status
         FROM videos v
         WHERE v.processing_status IN ('queued', 'processing')
           AND v.media_type = 'video'
           AND v.hls_ready = FALSE
         ORDER BY v.uploaded_at ASC`
      );

      if (result.rows.length === 0) {
        console.log(`[Queue Recovery] No stuck videos found.`);
        return;
      }

      console.log(`[Queue Recovery] Found ${result.rows.length} stuck video(s). Re-enqueueing...`);

      for (const row of result.rows) {
        // After restart, local temp files are gone. Fall back to S3 key.
        // ffmpeg.js will detect the source is not a local file and download from S3.
        const safeName = row.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const s3Key = row.object_key;

        console.log(`[Queue Recovery] Re-enqueueing video ${row.id} (was ${row.processing_status}): bucket=${row.bucket}, s3Key=${s3Key}`);

        try {
          await this.enqueue(row.id, s3Key, row.bucket, safeName);
        } catch (enqueueErr) {
          console.error(`[Queue Recovery] Failed to re-enqueue video ${row.id}:`, enqueueErr.message);
          await this.updateProcessingStatus(row.id, "failed", 0, "error: recovery failed - please re-upload").catch(() => {});
        }
      }

      console.log(`[Queue Recovery] Recovery complete. Queue length: ${this.queue.length}`);
    } catch (err) {
      console.error(`[Queue Recovery] CRITICAL: Recovery failed:`, err.message);
    }
  }

  /**
   * Update processing status fields in the database.
   * Does NOT update updated_at — this prevents the stale-check in ffmpeg.js
   * from incorrectly thinking the video was replaced during processing.
   */
  async updateProcessingStatus(videoId, status, progress, step) {
    try {
      await getPool().query(
        "UPDATE videos SET processing_status = $1, processing_progress = $2, processing_step = $3 WHERE id = $4",
        [status, progress, step, videoId]
      );
    } catch (e) {
      console.error(`[Queue] Failed to update processing status for ${videoId}:`, e.message);
    }
  }

  /**
   * Clean up a local temp file (best-effort, silent on failure).
   */
  _cleanupLocalFile(filePath) {
    if (!filePath) return;
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Queue] Cleaned up local temp file: ${filePath}`);
      }
    } catch (e) {
      console.warn(`[Queue] Failed to clean up local temp file ${filePath}: ${e.message}`);
    }
  }
}

// Singleton instance
const processingQueue = new ProcessingQueue();

export default processingQueue;
