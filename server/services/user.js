import bcrypt from "bcryptjs";
import { getPool } from "../db/index.js";

export const VALID_ROLES = [
  "admin",
  "editor",
  "client",
  "member",
  "project_manager",
  "social_media_manager",
];
export const ORG_ROLES = [
  "admin",
  "editor",
  "project_manager",
  "social_media_manager",
];

export async function createUser(email, password, name, role = "member") {
  try {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(
        `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await getPool().query(
      "INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, avatar_url, created_at",
      [email, hashedPassword, name, role],
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Email already exists");
    }
    throw error;
  }
}

export async function getUserByEmail(email) {
  try {
    const result = await getPool().query(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );

    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
}

export async function getUserById(id) {
  try {
    const result = await getPool().query(
      "SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = $1",
      [id],
    );

    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
}

export async function getAllUsers() {
  try {
    const result = await getPool().query(
      "SELECT id, email, name, role, avatar_url, created_at FROM users ORDER BY created_at DESC",
    );

    return result.rows;
  } catch (error) {
    throw error;
  }
}

// Get only organization members (admin, editor, project_manager, social_media_manager)
export async function getOrgMembers() {
  try {
    const result = await getPool().query(
      `SELECT id, email, name, role, avatar_url, created_at FROM users
       WHERE role IN ('admin', 'editor', 'project_manager', 'social_media_manager')
       ORDER BY role, name`,
    );
    return result.rows;
  } catch (error) {
    throw error;
  }
}

export async function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export async function updateUserAvatar(userId, avatarUrl) {
  const result = await getPool().query(
    "UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, name, role, avatar_url, created_at",
    [avatarUrl, userId],
  );
  return result.rows[0] || null;
}

export async function updateUserRole(userId, role) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
  }

  const result = await getPool().query(
    "UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, name, role, avatar_url, created_at",
    [role, userId],
  );
  return result.rows[0] || null;
}

export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("⚠ Admin credentials not found in env, skipping seed");
    return;
  }

  try {
    const existing = await getUserByEmail(email);
    if (!existing) {
      await createUser(email, password, "System Admin", "admin");
      console.log(`✓ Admin user created: ${email}`);
    } else {
      console.log(`✓ Admin user already exists: ${email}`);
    }
  } catch (error) {
    console.error("Error seeding admin:", error);
  }
}
