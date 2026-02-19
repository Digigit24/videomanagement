import ffmpegLib from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import fs from "fs";
import path from "path";
import os from "os";
import { uploadToS3 } from "./upload.js";
import { getPool } from "../db/index.js";
import {
  resolveBucket,
  downloadFromS3ToFile,
  deleteFromS3,
} from "./storage.js";

// Use node-module FFmpeg binaries instead of system-installed ones.
// This avoids needing a system ffmpeg install, keeps RAM/storage low,
// and ensures a consistent version across environments.
ffmpegLib.setFfmpegPath(ffmpegInstaller.path);
ffmpegLib.setFfprobePath(ffprobeInstaller.path);

console.log(`[FFmpeg] Binary path: ${ffmpegInstaller.path}`);
console.log(`[FFmpeg] FFprobe path: ${ffprobeInstaller.path}`);

const QUALITIES = [
  {
    name: "360p",
    width: 640,
    height: 360,
    bitrate: "800k",
    audioBitrate: "96k",
  },
  {
    name: "720p",
    width: 1280,
    height: 720,
    bitrate: "2500k",
    audioBitrate: "128k",
  },
  {
    name: "1080p",
    width: 1920,
    height: 1080,
    bitrate: "5000k",
    audioBitrate: "192k",
  },
  {
    name: "4k",
    width: 3840,
    height: 2160,
    bitrate: "14000k",
    audioBitrate: "256k",
  },
];

const MAX_TRANSCODE_RETRIES = 2;

// Progress distribution:
// Download: 0-10%, Thumbnail: 10-15%, Transcoding: 15-90%, Finalize: 90-100%
const PROGRESS_DOWNLOAD = { start: 0, end: 10 };
const PROGRESS_THUMBNAIL = { start: 10, end: 15 };
const PROGRESS_TRANSCODE = { start: 15, end: 90 };
const PROGRESS_FINALIZE = { start: 90, end: 100 };

/**
 * Main entry point for video processing.
 *
 * @param {string} tempS3Key - The S3 key where the temp original is stored
 * @param {string} videoId - The video record ID
 * @param {string} bucketName - The bucket/workspace name (raw, not resolved)
 * @param {string} originalFilename - Sanitized filename (safe for filesystem/S3)
 * @param {Function} onProgress - Callback: (step, progressPercent) => void
 */
export async function processVideoToHLS(
  tempS3Key,
  videoId,
  bucketName,
  originalFilename,
  onProgress,
) {
  const report = (step, progress) => {
    if (typeof onProgress === "function") {
      onProgress(step, Math.round(progress));
    }
  };

  const { bucket, prefix } = resolveBucket(bucketName);
  const tempDir = path.join(os.tmpdir(), `hls-${videoId}`);
  const hlsBase = `${prefix}hls/${videoId}`;
  // Use videoId in the local path (not filename) to avoid path issues
  const localInputPath = path.join(
    os.tmpdir(),
    `input-${videoId}${path.extname(originalFilename)}`,
  );

  console.log(`[FFmpeg] Processing video ${videoId}`);
  console.log(
    `[FFmpeg]   bucketName=${bucketName}, resolvedBucket=${bucket}, prefix="${prefix}"`,
  );
  console.log(`[FFmpeg]   tempS3Key=${tempS3Key}`);
  console.log(`[FFmpeg]   localInputPath=${localInputPath}`);
  console.log(`[FFmpeg]   hlsBase=${hlsBase}`);

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // --- Step 1: Download temp original from S3 ---
    report("downloading", PROGRESS_DOWNLOAD.start);
    console.log(
      `[FFmpeg] Step 1: Downloading from S3 bucket=${bucket} key=${tempS3Key}`,
    );
    await downloadFromS3ToFile(bucket, tempS3Key, localInputPath);

    // Verify the downloaded file exists and has content
    if (!fs.existsSync(localInputPath)) {
      throw new Error(`Downloaded file not found at ${localInputPath}`);
    }
    const fileSize = fs.statSync(localInputPath).size;
    if (fileSize === 0) {
      throw new Error(
        `Downloaded file is empty (0 bytes) at ${localInputPath}`,
      );
    }
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);
    console.log(
      `[FFmpeg] Step 1 complete: Downloaded ${fileSizeMB} MB to ${localInputPath}`,
    );
    report("downloading", PROGRESS_DOWNLOAD.end);

    // --- Step 2: Generate thumbnail ---
    report("generating_thumbnail", PROGRESS_THUMBNAIL.start);
    try {
      const thumbPath = path.join(tempDir, "thumbnail.jpg");
      await generateThumbnail(localInputPath, thumbPath);
      const thumbKey = `${prefix}thumbnails/${videoId}.jpg`;
      const thumbBuffer = fs.readFileSync(thumbPath);
      await uploadToS3(bucket, thumbKey, thumbBuffer, "image/jpeg");
      await getPool().query(
        "UPDATE videos SET thumbnail_key = $1 WHERE id = $2",
        [thumbKey, videoId],
      );
      console.log(
        `[FFmpeg] Step 2 complete: Thumbnail generated for video ${videoId}`,
      );
    } catch (thumbErr) {
      // Non-fatal: continue processing even if thumbnail fails
      console.error(
        `[FFmpeg] Step 2 warning: Thumbnail generation failed for ${videoId}:`,
        thumbErr.message,
      );
    }
    report("generating_thumbnail", PROGRESS_THUMBNAIL.end);

    // --- Step 3: Probe source video resolution ---
    console.log(`[FFmpeg] Step 3: Probing video info...`);
    const videoInfo = await getVideoInfo(localInputPath);
    const sourceHeight = videoInfo.height || 1080;
    const duration = videoInfo.duration || 0;

    // Pick quality levels that don't exceed the source resolution
    const applicableQualities = QUALITIES.filter(
      (q) => q.height <= sourceHeight,
    );
    if (applicableQualities.length === 0) {
      // Always produce at least 360p
      applicableQualities.push(QUALITIES[0]);
    }

    console.log(
      `[FFmpeg] Step 3 complete: source=${sourceHeight}p, duration=${Math.round(duration)}s, qualities=[${applicableQualities.map((q) => q.name).join(", ")}]`,
    );

    // --- Step 4: Transcode each quality level sequentially & upload chunks ---
    const numQualities = applicableQualities.length;
    const transcodeRange = PROGRESS_TRANSCODE.end - PROGRESS_TRANSCODE.start;
    const perQualityRange = transcodeRange / numQualities;

    const variants = [];
    for (let qi = 0; qi < applicableQualities.length; qi++) {
      const quality = applicableQualities[qi];
      const outputDir = path.join(tempDir, quality.name);
      fs.mkdirSync(outputDir, { recursive: true });

      const qualityBaseProgress =
        PROGRESS_TRANSCODE.start + qi * perQualityRange;
      const stepName = `transcoding_${quality.name}`;

      report(stepName, qualityBaseProgress);
      console.log(`[FFmpeg] Step 4.${qi + 1}: Transcoding ${quality.name}...`);

      // Transcode with retry + progress reporting
      await transcodeWithRetry(
        localInputPath,
        outputDir,
        quality,
        videoId,
        duration,
        (ffmpegPercent) => {
          // Map FFmpeg's 0-100% to this quality's portion of overall progress
          const qualityProgress =
            qualityBaseProgress + (ffmpegPercent / 100) * perQualityRange * 0.8;
          report(stepName, qualityProgress);
        },
      );

      // Upload all segment files
      const uploadStepName = `uploading_${quality.name}`;
      const uploadBaseProgress = qualityBaseProgress + perQualityRange * 0.8;
      report(uploadStepName, uploadBaseProgress);

      const files = fs.readdirSync(outputDir);
      console.log(
        `[FFmpeg] Uploading ${files.length} ${quality.name} files to S3...`,
      );

      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        const filePath = path.join(outputDir, file);
        const objectKey = `${hlsBase}/${quality.name}/${file}`;
        const contentType = file.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : "video/MP2T";
        const fileBuffer = fs.readFileSync(filePath);
        await uploadToS3(bucket, objectKey, fileBuffer, contentType);

        // Report upload progress per file
        const uploadProgress =
          uploadBaseProgress +
          ((fi + 1) / files.length) * (perQualityRange * 0.2);
        report(uploadStepName, uploadProgress);
      }

      report(uploadStepName, qualityBaseProgress + perQualityRange);
      console.log(
        `[FFmpeg] Step 4.${qi + 1} complete: ${quality.name} (${files.length} files) uploaded`,
      );

      variants.push({
        name: quality.name,
        bandwidth: parseInt(quality.bitrate) * 1000,
        resolution: `${quality.width}x${quality.height}`,
        uri: `${quality.name}/playlist.m3u8`,
      });
    }

    // --- Step 5: Create & upload master playlist ---
    report("finalizing", PROGRESS_FINALIZE.start);
    console.log(`[FFmpeg] Step 5: Creating master playlist...`);
    const masterPlaylist = generateMasterPlaylist(variants);
    const masterKey = `${hlsBase}/master.m3u8`;
    await uploadToS3(
      bucket,
      masterKey,
      Buffer.from(masterPlaylist),
      "application/vnd.apple.mpegurl",
    );

    // --- Step 6: Mark video as HLS-ready in DB ---
    await getPool().query(
      "UPDATE videos SET hls_ready = TRUE, hls_path = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [masterKey, videoId],
    );

    console.log(
      `[FFmpeg] Step 6 complete: HLS ready for video ${videoId}, masterKey=${masterKey}`,
    );
    report("finalizing", 95);

    // --- Step 7: Cleanup local temp files ---
    cleanupTempDir(tempDir);
    cleanupTempFile(localInputPath);

    // --- Step 8: Delete temp original from S3 ---
    try {
      await deleteFromS3(bucket, tempS3Key);
      console.log(
        `[FFmpeg] Step 8 complete: Deleted temp S3 file ${tempS3Key}`,
      );
    } catch (e) {
      console.warn(
        `[FFmpeg] Step 8 warning: Failed to delete temp S3 file ${tempS3Key}: ${e.message}`,
      );
    }

    report("completed", 100);
    console.log(`[FFmpeg] Processing complete for video ${videoId}`);
    return masterKey;
  } catch (error) {
    console.error(
      `[FFmpeg] FAILED processing video ${videoId}:`,
      error.message,
    );
    console.error(`[FFmpeg]   S3 key was: ${tempS3Key}`);
    console.error(`[FFmpeg]   Bucket was: ${bucket}`);
    console.error(`[FFmpeg]   Full error:`, error);
    cleanupTempDir(tempDir);
    cleanupTempFile(localInputPath);
    throw error;
  }
}

/**
 * Transcode a single quality level with retry.
 */
async function transcodeWithRetry(
  inputPath,
  outputDir,
  quality,
  videoId,
  duration,
  onFFmpegProgress,
) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_TRANSCODE_RETRIES + 1; attempt++) {
    try {
      await transcodeToHLS(
        inputPath,
        outputDir,
        quality,
        duration,
        onFFmpegProgress,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt <= MAX_TRANSCODE_RETRIES) {
        const delay = 3000 * attempt;
        console.warn(
          `[FFmpeg] Retry: ${quality.name} for video ${videoId} failed (attempt ${attempt}/${MAX_TRANSCODE_RETRIES + 1}), retrying in ${delay}ms: ${error.message}`,
        );
        try {
          const files = fs.readdirSync(outputDir);
          for (const f of files) {
            fs.unlinkSync(path.join(outputDir, f));
          }
        } catch (_) {
          /* ignore cleanup errors */
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

function getVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpegLib.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(
        (s) => s.codec_type === "video",
      );
      resolve({
        width: videoStream?.width || 1920,
        height: videoStream?.height || 1080,
        duration: metadata.format?.duration || 0,
      });
    });
  });
}

/**
 * Transcode to HLS with CPU throttling and progress reporting.
 */
function transcodeToHLS(inputPath, outputDir, quality, duration, onProgress) {
  let lastReportedPercent = 0;

  return new Promise((resolve, reject) => {
    const cmd = ffmpegLib(inputPath)
      .outputOptions([
        `-vf scale=${quality.width}:${quality.height}:force_original_aspect_ratio=decrease,pad=${quality.width}:${quality.height}:(ow-iw)/2:(oh-ih)/2`,
        `-c:v libx264`,
        `-preset ultrafast`,
        `-threads 1`,
        `-b:v ${quality.bitrate}`,
        `-c:a aac`,
        `-b:a ${quality.audioBitrate}`,
        `-hls_time 6`,
        `-hls_list_size 0`,
        `-hls_segment_filename ${path.join(outputDir, "segment_%03d.ts").replace(/\\/g, "/")}`,
        `-f hls`,
      ])
      .output(path.join(outputDir, "playlist.m3u8"))
      .on("start", (commandLine) => {
        console.log(`[FFmpeg] Command: ${commandLine.substring(0, 200)}...`);
      })
      .on("progress", (progress) => {
        if (typeof onProgress !== "function") return;

        let percent = 0;
        if (progress.percent) {
          percent = Math.min(100, Math.max(0, progress.percent));
        } else if (duration > 0 && progress.timemark) {
          // Parse timemark (HH:MM:SS.ms) to seconds
          const parts = progress.timemark.split(":");
          if (parts.length === 3) {
            const secs =
              parseInt(parts[0]) * 3600 +
              parseInt(parts[1]) * 60 +
              parseFloat(parts[2]);
            percent = Math.min(100, (secs / duration) * 100);
          }
        }

        // Throttle: only report if progress changed by 2%+
        if (percent - lastReportedPercent >= 2) {
          lastReportedPercent = percent;
          onProgress(percent);
        }
      })
      .on("end", () => {
        console.log(`[FFmpeg] Transcode ${quality.name} finished`);
        resolve();
      })
      .on("error", (err) => {
        console.error(
          `[FFmpeg] Transcode ${quality.name} error: ${err.message}`,
        );
        reject(err);
      });

    cmd.run();
  });
}

function generateMasterPlaylist(variants) {
  let playlist = "#EXTM3U\n#EXT-X-VERSION:3\n";

  for (const v of variants) {
    playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.resolution},NAME="${v.name}"\n`;
    playlist += `${v.uri}\n`;
  }

  return playlist;
}

function generateThumbnail(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpegLib(inputPath)
      .outputOptions([`-threads 1`])
      .screenshots({
        count: 1,
        timemarks: ["00:00:01"],
        folder: path.dirname(outputPath),
        filename: path.basename(outputPath),
        size: "640x360",
      })
      .on("end", resolve)
      .on("error", reject);
  });
}

function cleanupTempDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("[FFmpeg] Cleanup temp dir error:", e.message);
  }
}

function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error("[FFmpeg] Cleanup temp file error:", e.message);
  }
}
