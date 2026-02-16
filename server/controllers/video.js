import multer from 'multer';
import { getVideos, getVideoById, updateVideoStatus, createVideo } from '../services/video.js';
import { getVideoStream } from '../services/storage.js';
import { uploadToS3 } from '../services/upload.js';
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

    if (!status) {
      return res.status(400).json({ error: 'Status required' });
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

      const { originalname, buffer, size, mimetype } = req.file;
      const bucket = req.bucket;
      const objectKey = `${Date.now()}-${originalname}`;

      // Upload to S3
      await uploadToS3(bucket, objectKey, buffer, mimetype);

      // Create video record in database
      const video = await createVideo({
        bucket,
        filename: originalname,
        objectKey,
        size,
        uploadedBy: req.user.id
      });

      res.status(201).json({ video, message: 'Video uploaded successfully' });
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

    // Get file extension
    const ext = video.filename.toLowerCase().split('.').pop();
    const contentTypes = {
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'webm': 'video/webm'
    };

    const contentType = contentTypes[ext] || 'video/mp4';
    const fileSize = video.size;

    // Parse range header for partial content support
    const range = req.headers.range;

    if (range) {
      // Handle range request for smooth seeking
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
      // Send full file
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
