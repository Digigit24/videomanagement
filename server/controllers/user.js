import { createUser, getAllUsers, getUserById } from '../services/user.js';
import { getPool } from '../db/index.js';
import { apiError } from '../utils/logger.js';

export async function register(req, res) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const user = await createUser(email, password, name);
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
    const { id } = req.params;

    // Prevent deleting yourself
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
