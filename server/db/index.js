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

    console.log("✓ Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

export { getPool };
export default getPool;
