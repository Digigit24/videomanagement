import { createUser, getAllUsers, getUserById, updateUserAvatar, updateUserRole } from '../services/user.js';
import { uploadToS3 } from '../services/upload.js';
import { getPool } from '../db/index.js';
import { apiError } from '../utils/logger.js';
import multer from 'multer';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
}).single('avatar');

export async function register(req, res) {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const user = await createUser(email, password, name, role || 'member');
    res.status(201).json({ user });
  } catch (error) {
    apiError(req, error);
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
}

export async function getUsers(req, res) {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to get users' });
  }
}

export async function getUser(req, res) {
  try {
    const { id } = req.params;
    const user = await getUserById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}

export async function getCurrentUser(req, res) {
  try {
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to get current user' });
  }
}

export async function deleteUser(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete users' });
    }

    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await getUserById(id);
    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }

    await getPool().query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

export async function uploadAvatar(req, res) {
  avatarUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const objectKey = `avatars/${req.user.id}/${Date.now()}-${req.file.originalname}`;
      // Upload to first bucket
      const buckets = process.env.ZATA_BUCKETS.split(',').map(b => b.trim());
      await uploadToS3(buckets[0], objectKey, req.file.buffer, req.file.mimetype);

      const avatarUrl = `/api/avatar/${objectKey}`;
      const user = await updateUserAvatar(req.user.id, avatarUrl);

      res.json({ user });
    } catch (error) {
      apiError(req, error);
      res.status(500).json({ error: 'Failed to upload avatar' });
    }
  });
}

export async function changeUserRole(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change roles' });
    }

    const { id } = req.params;
    const { role } = req.body;

    const user = await updateUserRole(id, role);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    apiError(req, error);
    res.status(400).json({ error: error.message || 'Failed to change role' });
  }
}

export async function getAvatarStream(req, res) {
  try {
    const objectKey = `avatars/${req.params[0]}`;
    const buckets = process.env.ZATA_BUCKETS.split(',').map(b => b.trim());

    const { getVideoStream } = await import('../services/storage.js');
    const stream = await getVideoStream(buckets[0], objectKey);

    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: 'Avatar not found' });
  }
}
