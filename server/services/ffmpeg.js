import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";
import { uploadToS3 } from "./upload.js";
import { getPool } from "../db/index.js";
import { resolveBucket } from "./storage.js";

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

/**
 * Main entry point for video processing.
 *
 * Flow:
 *   1. Video sits in temp folder (inputPath)
 *   2. FFmpeg transcodes to HLS chunks at applicable quality levels
 *   3. All chunks are uploaded to ZATA S3 (with retry via uploadToS3)
 *   4. DB is updated with hls_ready = TRUE
 *   5. Only AFTER everything succeeds, the temp video file is deleted
 *
 * If any step fails the temp file is preserved so the process can be retried.
 */
export async function processVideoToHLS(
  inputPath,
  videoId,
  bucketName,
  originalFilename,
) {
  const { bucket, prefix } = resolveBucket(bucketName);
  const tempDir = path.join(os.tmpdir(), `hls-${videoId}`);
  const hlsBase = `${prefix}hls/${videoId}`;

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // --- Step 1: Generate thumbnail ---
    try {
      const thumbPath = path.join(tempDir, "thumbnail.jpg");
      await generateThumbnail(inputPath, thumbPath);
      const thumbKey = `${prefix}thumbnails/${videoId}.jpg`;
      const thumbBuffer = fs.readFileSync(thumbPath);
      // uploadToS3 already has retry built in
      await uploadToS3(bucket, thumbKey, thumbBuffer, "image/jpeg");
      await getPool().query(
        "UPDATE videos SET thumbnail_key = $1 WHERE id = $2",
        [thumbKey, videoId],
      );
      console.log(`Thumbnail generated for video ${videoId}`);
    } catch (thumbErr) {
      console.error(`Thumbnail generation failed for ${videoId}:`, thumbErr.message);
      // Non-fatal — continue with HLS processing
    }

    // --- Step 2: Probe source video resolution ---
    const videoInfo = await getVideoInfo(inputPath);
    const sourceHeight = videoInfo.height || 1080;

    // Filter qualities to only include those <= source resolution
    const applicableQualities = QUALITIES.filter(
      (q) => q.height <= sourceHeight,
    );
    if (applicableQualities.length === 0) {
      applicableQualities.push(QUALITIES[0]); // At minimum do 360p
    }

    console.log(
      `Processing video ${videoId}: source=${sourceHeight}p, qualities=[${applicableQualities.map((q) => q.name).join(", ")}]`,
    );

    // --- Step 3: Transcode each quality level & upload chunks ---
    const variants = [];
    for (const quality of applicableQualities) {
      const outputDir = path.join(tempDir, quality.name);
      fs.mkdirSync(outputDir, { recursive: true });

      // Transcode with retry
      await transcodeWithRetry(inputPath, outputDir, quality, videoId);

      // Upload all segment files and playlist to ZATA (uploadToS3 retries internally)
      const files = fs.readdirSync(outputDir);
      for (const file of files) {
        const filePath = path.join(outputDir, file);
        const objectKey = `${hlsBase}/${quality.name}/${file}`;
        const contentType = file.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : "video/MP2T";
        const fileBuffer = fs.readFileSync(filePath);
        await uploadToS3(bucket, objectKey, fileBuffer, contentType);
      }

      console.log(`Quality ${quality.name} uploaded for video ${videoId}`);

      variants.push({
        name: quality.name,
        bandwidth: parseInt(quality.bitrate) * 1000,
        resolution: `${quality.width}x${quality.height}`,
        uri: `${quality.name}/playlist.m3u8`,
      });
    }

    // --- Step 4: Create & upload master playlist ---
    const masterPlaylist = generateMasterPlaylist(variants);
    const masterKey = `${hlsBase}/master.m3u8`;
    await uploadToS3(
      bucket,
      masterKey,
      Buffer.from(masterPlaylist),
      "application/vnd.apple.mpegurl",
    );

    // --- Step 5: Mark video as HLS-ready in DB ---
    await getPool().query(
      "UPDATE videos SET hls_ready = TRUE, hls_path = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [masterKey, videoId],
    );

    console.log(`HLS processing complete for video ${videoId}`);

    // --- Step 6: Cleanup temp files ONLY after full success ---
    cleanupTempDir(tempDir);
    cleanupTempFile(inputPath);

    return masterKey;
  } catch (error) {
    console.error(`HLS processing failed for video ${videoId}:`, error);

    // Cleanup the HLS temp directory (partial output), but keep the original
    // video in temp so it can be retried.
    cleanupTempDir(tempDir);

    // Do NOT delete inputPath here — keeping it allows manual or automated retry.
    console.warn(
      `Temp video file preserved at ${inputPath} for retry. Video ${videoId} is not HLS-ready.`,
    );

    throw error;
  }
}

/**
 * Transcode a single quality level with retry.
 */
async function transcodeWithRetry(inputPath, outputDir, quality, videoId) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_TRANSCODE_RETRIES + 1; attempt++) {
    try {
      await transcodeToHLS(inputPath, outputDir, quality);
      return;
    } catch (error) {
      lastError = error;
      if (attempt <= MAX_TRANSCODE_RETRIES) {
        const delay = 3000 * attempt;
        console.warn(
          `[Retry] FFmpeg transcode ${quality.name} for video ${videoId} failed (attempt ${attempt}), retrying in ${delay}ms: ${error.message}`,
        );
        // Clean partial output before retrying
        try {
          const files = fs.readdirSync(outputDir);
          for (const f of files) {
            fs.unlinkSync(path.join(outputDir, f));
          }
        } catch (_) { /* ignore */ }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

function getVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
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

function transcodeToHLS(inputPath, outputDir, quality) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=${quality.width}:${quality.height}:force_original_aspect_ratio=decrease,pad=${quality.width}:${quality.height}:(ow-iw)/2:(oh-ih)/2`,
        `-c:v libx264`,
        `-b:v ${quality.bitrate}`,
        `-c:a aac`,
        `-b:a ${quality.audioBitrate}`,
        `-hls_time 6`,
        `-hls_list_size 0`,
        `-hls_segment_filename ${path.join(outputDir, "segment_%03d.ts")}`,
        `-f hls`,
      ])
      .output(path.join(outputDir, "playlist.m3u8"))
      .on("end", resolve)
      .on("error", reject)
      .run();
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
    ffmpeg(inputPath)
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
    console.error("Cleanup temp dir error:", e.message);
  }
}

function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Temp video file deleted: ${filePath}`);
    }
  } catch (e) {
    console.error("Cleanup temp file error:", e.message);
  }
}
