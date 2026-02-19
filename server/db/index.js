import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pool;

function getPool() {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes("sslmode=require")
        ? {
            rejectUnauthorized: false,
          }
        : false,
    });
  }
  return pool;
}

// Initialize database
export async function initDatabase() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await getPool().query(schema);

    // Run migrations
    const migrations = fs.readFileSync(
      path.join(__dirname, "migrations.sql"),
      "utf8",
    );
    await getPool().query(migrations);

    // Run v2 migrations (versioning, backup, new roles)
    const migrationsV2 = fs.readFileSync(
      path.join(__dirname, "migrations_v2.sql"),
      "utf8",
    );
    await getPool().query(migrationsV2);

    // Run v3 migrations (org member flag, notifications)
    const migrationsV3 = fs.readFileSync(
      path.join(__dirname, "migrations_v3.sql"),
      "utf8",
    );
    await getPool().query(migrationsV3);

    // Run v4 migrations (recycle bin)
    const migrationsV4 = fs.readFileSync(
      path.join(__dirname, "migrations_v4.sql"),
      "utf8",
    );
    await getPool().query(migrationsV4);

    // Run v5 migrations (workspace chat, mentions)
    const migrationsV5 = fs.readFileSync(
      path.join(__dirname, "migrations_v5.sql"),
      "utf8",
    );
    await getPool().query(migrationsV5);

    // Run v6 migrations (fixing members and roles)
    const migrationsV6 = fs.readFileSync(
      path.join(__dirname, "migrations_v6.sql"),
      "utf8",
    );
    await getPool().query(migrationsV6);

    // Run v7 migrations (default status to Draft)
    const migrationsV7 = fs.readFileSync(
      path.join(__dirname, "migrations_v7.sql"),
      "utf8",
    );
    await getPool().query(migrationsV7);

    // Run v8 migrations (video reviews & share tokens)
    const migrationsV8 = fs.readFileSync(
      path.join(__dirname, "migrations_v8.sql"),
      "utf8",
    );
    await getPool().query(migrationsV8);

    const migrationsV9 = fs.readFileSync(
      path.join(__dirname, "migrations_v9.sql"),
      "utf8",
    );
    await getPool().query(migrationsV9);

    // Run v10 migrations (soft delete for chat messages)
    const migrationsV10 = fs.readFileSync(
      path.join(__dirname, "migrations_v10.sql"),
      "utf8",
    );
    await getPool().query(migrationsV10);

    // Run v11 migrations (processing queue status tracking)
    const migrationsV11 = fs.readFileSync(
      path.join(__dirname, "migrations_v11.sql"),
      "utf8",
    );
    await getPool().query(migrationsV11);

    // Run v12 migrations (folders, photo creatives, per-workspace permissions, new roles)
    const migrationsV12 = fs.readFileSync(
      path.join(__dirname, "migrations_v12.sql"),
      "utf8",
    );
    await getPool().query(migrationsV12);

    console.log("✓ Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

export { getPool };
export default getPool;
