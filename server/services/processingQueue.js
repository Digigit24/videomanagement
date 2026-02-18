import { getPool } from "../db/index.js";
import { processVideoToHLS } from "./ffmpeg.js";

/**
 * Singleton processing queue that handles video transcoding sequentially.
 * Only one video is processed at a time to prevent CPU/RAM overload.
 * Each video in the queue tracks its position and processing status.
 */
class ProcessingQueue {
  constructor() {
    this.queue = []; // { videoId, tempS3Key, bucketName, originalFilename }
    this.processing = false;
    this.currentVideoId = null;
  }

  /**
   * Add a video to the processing queue.
   * Immediately marks it as 'queued' in the DB, then starts processing if idle.
   */
  async enqueue(videoId, tempS3Key, bucketName, originalFilename) {
    this.queue.push({ videoId, tempS3Key, bucketName, originalFilename });

    // Mark as queued in DB
    await this.updateDB(videoId, "queued", 0, null);

    console.log(
      `[Queue] Video ${videoId} enqueued. Queue length: ${this.queue.length}, processing: ${this.processing}`
    );

    // Start processing if not already running
    this.processNext();
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
   * Process the next video in the queue.
   */
  async processNext() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const job = this.queue.shift();
    this.currentVideoId = job.videoId;

    console.log(
      `[Queue] Starting processing for video ${job.videoId}. Remaining in queue: ${this.queue.length}`
    );

    try {
      // Progress callback - called by ffmpeg.js during processing
      const onProgress = (step, progress) => {
        this.updateDB(job.videoId, "processing", progress, step).catch((e) =>
          console.warn(`[Queue] DB update failed: ${e.message}`)
        );
      };

      await processVideoToHLS(
        job.tempS3Key,
        job.videoId,
        job.bucketName,
        job.originalFilename,
        onProgress
      );

      await this.updateDB(job.videoId, "completed", 100, null);
      console.log(`[Queue] Video ${job.videoId} processing completed.`);
    } catch (err) {
      console.error(`[Queue] Video ${job.videoId} processing failed:`, err.message);
      await this.updateDB(job.videoId, "failed", 0, "error");
    }

    this.processing = false;
    this.currentVideoId = null;

    // Process next in queue
    this.processNext();
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
