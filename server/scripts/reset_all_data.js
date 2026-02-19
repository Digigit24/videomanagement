import dotenv from "dotenv";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from root
dotenv.config({ path: path.join(__dirname, "../../.env") });

const { Pool } = pg;

// Verify ENV variables
if (!process.env.ZATA_ENDPOINT || !process.env.DATABASE_URL) {
  console.error("Error: ZATA_ENDPOINT or DATABASE_URL not found in .env");
  process.exit(1);
}

const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.ZATA_ENDPOINT,
  credentials: {
    accessKeyId: process.env.ZATA_ACCESS_KEY?.trim(),
    secretAccessKey: process.env.ZATA_SECRET_KEY?.trim(),
  },
  forcePathStyle: true,
  tls: true,
  signatureVersion: "v4",
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});

async function resetAll() {
  console.log("\n=====================================================");
  console.log("--- STARTING COMPLETE STORAGE & DATABASE RESET ---");
  console.log("=====================================================\n");

  try {
    // 1. Clean up S3 Buckets (Zata)
    const bucketsEnv = process.env.ZATA_BUCKETS || "";
    const buckets = bucketsEnv
      .split(",")
      .map((b) => b.trim())
      .filter((b) => b);

    if (buckets.length === 0) {
      console.warn("! No buckets found in ZATA_BUCKETS env variable.");
    }

    for (const bucket of buckets) {
      console.log(`\n[S3] Cleaning bucket: ${bucket}...`);
      let continuationToken;
      let count = 0;

      try {
        do {
          const listCmd = new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken,
          });

          const listRes = await s3Client.send(listCmd);

          if (listRes.Contents && listRes.Contents.length > 0) {
            const deleteParams = {
              Bucket: bucket,
              Delete: {
                Objects: listRes.Contents.map((obj) => ({ Key: obj.Key })),
              },
            };
            await s3Client.send(new DeleteObjectsCommand(deleteParams));
            count += listRes.Contents.length;
            process.stdout.write(`  - Deleted ${count} objects...\r`);
          }

          continuationToken = listRes.NextContinuationToken;
        } while (continuationToken);

        console.log(`\n✓ Successfully cleared ${count} objects from ${bucket}`);
      } catch (err) {
        console.error(`✗ Error cleaning bucket ${bucket}:`, err.message);
      }
    }

    // 2. Clear Database Tables
    console.log("\n[DB] Cleaning Database Tables...");

    // Order matters for some tables if not using CASCADE, but we use CASCADE to be safe.
    // We target all video-related and activity-related tables.
    const tablesToClear = [
      "videos",
      "deleted_videos",
      "comments",
      "chat_attachments",
      "video_views",
      "activity_logs",
      "notifications",
      "video_share_tokens",
      "video_reviews",
      "workspace_video_stats",
      "workspaces",
      "workspace_members",
      "invitations",
      "chat_messages",
      "users",
    ];

    for (const table of tablesToClear) {
      try {
        const res = await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`  ✓ Truncated table: ${table}`);
      } catch (err) {
        if (err.code === "42P01") {
          console.log(`  ! Table ${table} does not exist, skipping.`);
        } else {
          console.error(`  ✗ Error truncating ${table}:`, err.message);
        }
      }
    }

    console.log("\n=====================================================");
    console.log("--- RESET COMPLETE: STORAGE AND DB ARE CLEAN ---");
    console.log("=====================================================\n");
  } catch (error) {
    console.error("\n✗ FATAL ERROR DURING RESET:", error);
  } finally {
    await pool.end();
  }
}

resetAll();
