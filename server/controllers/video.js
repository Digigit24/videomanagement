import multer from 'multer';
import { getVideos, getVideoById, updateVideoStatus, createVideo } from '../services/video.js';
import { getVideoStream, getVideoMetadata } from '../services/storage.js';
import { uploadToS3 } from '../services/upload.js';
import { processVideoToHLS } from '../services/ffmpeg.js';
import { apiError } from '../utils/logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, MOV, and WebM are allowed.'));
    }
  }
});

export const uploadMiddleware = upload.single('video');

export async function listVideos(req, res) {
  try {
    const videos = await getVideos(req.bucket);
    res.json({ videos });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to list videos' });
  }
}

export async function getVideo(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ video });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to get video' });
  }
}

export async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userRole = req.user.role;

    if (!status) {
      return res.status(400).json({ error: 'Status required' });
    }

    // Only client can change video status
    if (userRole !== 'client' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only clients can change video status' });
    }

    const video = await updateVideoStatus(id, status, req.user.id);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ video });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: error.message || 'Failed to update status' });
  }
}

export async function uploadVideo(req, res) {
  uploadMiddleware(req, res, async (err) => {
    if (err) {
      apiError(req, err);
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
      }

      // Only admin and editor can upload videos
      if (req.user.role !== 'admin' && req.user.role !== 'editor') {
        return res.status(403).json({ error: 'Only admins and editors can upload videos' });
      }

      const { originalname, buffer, size, mimetype } = req.file;
      const bucket = req.bucket;
      const objectKey = `${Date.now()}-${originalname}`;

      // Upload original to S3
      await uploadToS3(bucket, objectKey, buffer, mimetype);

      // Create video record in database
      const video = await createVideo({
        bucket,
        filename: originalname,
        objectKey,
        size,
        uploadedBy: req.user.id
      });

      res.status(201).json({ video, message: 'Video uploaded successfully. HLS processing started.' });

      // Process HLS in background (don't await)
      processVideoToHLS(buffer, video.id, bucket, originalname).catch(err => {
        console.error('Background HLS processing failed:', err.message);
      });
    } catch (error) {
      apiError(req, error);
      res.status(500).json({ error: 'Failed to upload video' });
    }
  });
}

export async function streamVideo(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const ext = video.filename.toLowerCase().split('.').pop();
    const contentTypes = {
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'webm': 'video/webm'
    };

    const contentType = contentTypes[ext] || 'video/mp4';
    const fileSize = video.size;

    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      });

      const stream = await getVideoStream(req.bucket, video.object_key, start, end);
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      });

      const stream = await getVideoStream(req.bucket, video.object_key);
      stream.pipe(res);
    }
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to stream video' });
  }
}

// Stream HLS files (master playlist, variant playlists, segments)
export async function streamHLS(req, res) {
  try {
    const { id } = req.params;
    // path after /hls/:id/ e.g. "master.m3u8" or "720p/playlist.m3u8" or "720p/segment_001.ts"
    const hlsFile = req.params[0];
    const video = await getVideoById(id, req.bucket);

    if (!video || !video.hls_ready) {
      return res.status(404).json({ error: 'HLS not available for this video' });
    }

    const hlsDir = video.hls_path.replace(/\/master\.m3u8$/, '');
    const objectKey = `${hlsDir}/${hlsFile}`;

    const contentType = hlsFile.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : 'video/MP2T';

    const stream = await getVideoStream(req.bucket, objectKey);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Access-Control-Allow-Origin', '*');
    stream.pipe(res);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to stream HLS content' });
  }
}
