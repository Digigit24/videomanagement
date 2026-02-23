import { getPool } from "../db/index.js";
import { processVideoToHLS } from "./ffmpeg.js";

// Maximum time (ms) for a single video to complete all processing steps.
// If exceeded, the video is marked as failed and the queue moves on.
const MAX_PROCESSING_TIME_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Singleton processing queue that handles video transcoding sequentially.
 * Only one video is processed at a time to prevent CPU/RAM overload.
 * Each video in the queue tracks its position and processing status.
 *
 * Recovery: on startup, call `recoverStuckVideos()` to re-enqueue any
 * videos stuck in 'queued' or 'processing' state from a previous crash.
 */
class ProcessingQueue {
  constructor() {
    this.queue = []; // { videoId, tempS3Key, bucketName, originalFilename }
    this.processing = false;
    this.currentVideoId = null;
    this._processingTimer = null; // overall timeout timer
  }

  /**
   * Add a video to the processing queue.
   * Immediately marks it as 'queued' in the DB, then starts processing if idle.
   */
  async enqueue(videoId, tempS3Key, bucketName, originalFilename) {
    // Prevent duplicate enqueue
    if (this.currentVideoId === videoId) {
      console.log(`[Queue] Video ${videoId} is already being processed, skipping enqueue`);
      return;
    }
    if (this.queue.some((j) => j.videoId === videoId)) {
      console.log(`[Queue] Video ${videoId} is already in queue, skipping enqueue`);
      return;
    }

    this.queue.push({ videoId, tempS3Key, bucketName, originalFilename });

    // Mark as queued in DB
    await this.updateDB(videoId, "queued", 0, null);

    console.log(
      `[Queue] Video ${videoId} enqueued. Queue length: ${this.queue.length}, processing: ${this.processing}`
    );
    console.log(
      `[Queue]   tempS3Key=${tempS3Key}, bucket=${bucketName}, filename=${originalFilename}`
    );

    // Start processing if not already running — with .catch to prevent unhandled rejections
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
   * Remove a video from the queue (if it's queued but not yet processing).
   * Returns true if the video was found and removed, false otherwise.
   */
  dequeue(videoId) {
    const idx = this.queue.findIndex((j) => j.videoId === videoId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      console.log(
        `[Queue] Video ${videoId} dequeued. Queue length: ${this.queue.length}`
      );
      return true;
    }
    return false;
  }

  /**
   * Check if a video is currently being processed (actively running FFmpeg).
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

    // Get DB state
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
   * Safe wrapper that calls processNext and catches any errors to prevent
   * unhandled promise rejections (which can crash the Node.js process).
   */
  _safeProcessNext() {
    this.processNext().catch((err) => {
      console.error(`[Queue] CRITICAL: processNext threw an unhandled error:`, err);
      // Force-reset the queue state so it can continue
      this._forceReset();
    });
  }

  /**
   * Force-reset queue state after a catastrophic failure.
   * Marks the current video as failed, clears the processing flag,
   * and attempts to continue with the next video.
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
      this.updateDB(failedVideoId, "failed", 0, "error: queue force-reset after crash").catch((e) =>
        console.error(`[Queue] Failed to mark ${failedVideoId} as failed during reset:`, e.message)
      );
    }

    // Try to continue with next video after a short delay
    if (this.queue.length > 0) {
      console.log(`[Queue] Scheduling retry for remaining ${this.queue.length} videos in 5s...`);
      setTimeout(() => this._safeProcessNext(), 5000);
    }
  }

  /**
   * Process the next video in the queue.
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
      `[Queue]   Remaining in queue: ${this.queue.length}`
    );

    try {
      // Mark as processing immediately so the frontend shows the right status
      await this.updateDB(job.videoId, "processing", 0, "downloading");

      // Set an overall processing timeout to prevent the queue from blocking forever
      const timeoutPromise = new Promise((_, reject) => {
        this._processingTimer = setTimeout(() => {
          reject(new Error(`Processing timed out after ${MAX_PROCESSING_TIME_MS / 1000 / 60} minutes`));
        }, MAX_PROCESSING_TIME_MS);
      });

      // Progress callback - called by ffmpeg.js during processing
      const onProgress = (step, progress) => {
        this.updateDB(job.videoId, "processing", progress, step).catch((e) =>
          console.warn(`[Queue] DB progress update failed: ${e.message}`)
        );
      };

      // Race between actual processing and the timeout
      await Promise.race([
        processVideoToHLS(
          job.tempS3Key,
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

      await this.updateDB(job.videoId, "completed", 100, null);
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
      // Ensure failed status is set in DB so the frontend shows the error
      try {
        await this.updateDB(job.videoId, "failed", 0, `error: ${errMsg.substring(0, 200)}`);
      } catch (dbErr) {
        console.error(`[Queue] CRITICAL: Failed to update DB failure status for ${job.videoId}:`, dbErr.message);
      }
    } finally {
      // ALWAYS reset state, even if something unexpected happens
      this.processing = false;
      this.currentVideoId = null;

      console.log(`[Queue] Processing flag reset. Queue length: ${this.queue.length}`);

      // Process next in queue using safe wrapper
      if (this.queue.length > 0) {
        console.log(`[Queue] Moving to next video in queue...`);
        // Small delay to let the event loop breathe between videos
        setTimeout(() => this._safeProcessNext(), 1000);
      } else {
        console.log(`[Queue] All videos processed. Queue is idle.`);
      }
    }
  }

  /**
   * Recover videos that are stuck in 'queued' or 'processing' state in the DB.
   * Called on server startup to handle videos from a previous crash/restart.
   */
  async recoverStuckVideos() {
    try {
      const pool = getPool();

      // Find videos stuck in processing or queued state
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
        // Try to determine the temp S3 key
        // If the video has an object_key starting with temp-uploads or containing temp-uploads, use that
        // Otherwise, construct one from the object_key
        let tempS3Key = row.object_key;

        // Check if a temp-uploads version exists by looking at the object_key pattern
        const { prefix } = (await import("./storage.js")).resolveBucket(row.bucket);
        if (!tempS3Key.includes("temp-uploads")) {
          // The temp file may have been moved or the key may point elsewhere
          // Try the temp-uploads path based on filename
          const safeName = row.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          tempS3Key = `${prefix}temp-uploads/${safeName}`;
        }

        console.log(`[Queue Recovery] Re-enqueueing video ${row.id} (was ${row.processing_status}): bucket=${row.bucket}, key=${tempS3Key}`);

        try {
          await this.enqueue(
            row.id,
            tempS3Key,
            row.bucket,
            row.filename.replace(/[^a-zA-Z0-9._-]/g, "_")
          );
        } catch (enqueueErr) {
          console.error(`[Queue Recovery] Failed to re-enqueue video ${row.id}:`, enqueueErr.message);
          // Mark as failed so it doesn't stay stuck
          await this.updateDB(row.id, "failed", 0, "error: recovery failed - please re-upload").catch(() => {});
        }
      }

      console.log(`[Queue Recovery] Recovery complete. Queue length: ${this.queue.length}`);
    } catch (err) {
      console.error(`[Queue Recovery] CRITICAL: Recovery failed:`, err.message);
    }
  }

  /**
   * Update processing status in the database.
   */
  async updateDB(videoId, status, progress, step) {
    try {
      await getPool().query(
        "UPDATE videos SET processing_status = $1, processing_progress = $2, processing_step = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4",
        [status, progress, step, videoId]
      );
    } catch (e) {
      console.error(`[Queue] Failed to update DB for ${videoId}:`, e.message);
    }
  }
}

// Singleton instance
const processingQueue = new ProcessingQueue();

export default processingQueue;
