import bcrypt from "bcryptjs";
import { getPool } from "../db/index.js";

export async function createUser(email, password, name, role = "user") {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await getPool().query(
      "INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at",
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
      "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
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
      "SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC",
    );

    return result.rows;
  } catch (error) {
    throw error;
  }
}

export async function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
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
