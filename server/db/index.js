import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool, types } = pg;

// Return DATE columns (OID 1082) as plain strings (e.g. "2024-06-10") instead of
// converting them to JavaScript Date objects. Without this, node-postgres interprets
// DATE values as local-midnight Date objects, which in IST (UTC+5:30) serialize to
// the *previous* day in UTC — causing the classic "saved as one day before" bug.
types.setTypeParser(1082, (val) => val);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pool;

function getPool() {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    // Use DB_SSL_CA env var for custom CA cert, otherwise trust system CAs.
    // rejectUnauthorized defaults to true for secure connections.
    const sslConfig = dbUrl.includes("sslmode=require")
      ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
          ...(process.env.DB_SSL_CA
            ? { ca: fs.readFileSync(process.env.DB_SSL_CA, "utf8") }
            : {}),
        }
      : false;

    pool = new Pool({
      connectionString: dbUrl,
      ssl: sslConfig,
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

    // Run v13 migrations (account-gated share links)
    const migrationsV13 = fs.readFileSync(
      path.join(__dirname, "migrations_v13.sql"),
      "utf8",
    );
    await getPool().query(migrationsV13);

    // Run v14 migrations (folder share tokens)
    const migrationsV14 = fs.readFileSync(
      path.join(__dirname, "migrations_v14.sql"),
      "utf8",
    );
    await getPool().query(migrationsV14);

    // Run v15 migrations (calendar notes & scheduled posts)
    const migrationsV15 = fs.readFileSync(
      path.join(__dirname, "migrations_v15.sql"),
      "utf8",
    );
    await getPool().query(migrationsV15);

    // Run v16 migrations (external video folder manifest API metadata)
    const migrationsV16 = fs.readFileSync(
      path.join(__dirname, "migrations_v16.sql"),
      "utf8",
    );
    await getPool().query(migrationsV16);

    // Run v17 migrations (AgencyOS campaigns and workspaces deliverables setup)
    const migrationsV17 = fs.readFileSync(
      path.join(__dirname, "migrations_v17.sql"),
      "utf8",
    );
    await getPool().query(migrationsV17);

    // Run v18 migrations (client active/inactive status)
    const migrationsV18 = fs.readFileSync(
      path.join(__dirname, "migrations_v18.sql"),
      "utf8",
    );
    await getPool().query(migrationsV18);

    // Run v19 migrations (client bookmarks)
    const migrationsV19 = fs.readFileSync(
      path.join(__dirname, "migrations_v19.sql"),
      "utf8",
    );
    await getPool().query(migrationsV19);

    // Run v20 migrations (client_page_url + PM folders)
    const migrationsV20 = fs.readFileSync(
      path.join(__dirname, "migrations_v20.sql"),
      "utf8",
    );
    await getPool().query(migrationsV20);

    // Run v21 migrations (per-platform payload templates)
    const migrationsV21 = fs.readFileSync(
      path.join(__dirname, "migrations_v21.sql"),
      "utf8",
    );
    await getPool().query(migrationsV21);

    // Run v22 migrations (Instagram posted_at tracking)
    const migrationsV22 = fs.readFileSync(
      path.join(__dirname, "migrations_v22.sql"),
      "utf8",
    );
    await getPool().query(migrationsV22);

    // Run v23 migrations (promised video deliverable count)
    const migrationsV23 = fs.readFileSync(
      path.join(__dirname, "migrations_v23.sql"),
      "utf8",
    );
    await getPool().query(migrationsV23);

    // Run v24 migrations (Composio workspace integrations)
    const migrationsV24 = fs.readFileSync(
      path.join(__dirname, "migrations_v24.sql"),
      "utf8",
    );
    await getPool().query(migrationsV24);

    // Run v25 migrations (shared agency Composio integrations)
    const migrationsV25 = fs.readFileSync(
      path.join(__dirname, "migrations_v25.sql"),
      "utf8",
    );
    await getPool().query(migrationsV25);

    // Run v26 migrations (promised shoots tracking + scheduled_at for posts/videos)
    const migrationsV26 = fs.readFileSync(
      path.join(__dirname, "migrations_v26.sql"),
      "utf8",
    );
    await getPool().query(migrationsV26);

    console.log("✓ Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

export { getPool };
export default getPool;
