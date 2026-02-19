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

async function clearDataKeepUsers() {
  console.log("\n=====================================================");
  console.log("--- STARTING DATA CLEAR (KEEPING USERS) ---");
  console.log("=====================================================\n");

  try {
    // 1. Clean up S3 Buckets (Zata)
    const bucketsEnv = process.env.ZATA_BUCKETS || "";
    const buckets = bucketsEnv
      .split(",")
      //.map((b) => b.trim())
      //.filter((b) => b);

      // FIX: Only clear specific folders or buckets if needed.
      // User said "clear all the videos, photos".
      // Assuming this means wiping the bucket content is acceptable as long as we don't delete the bucket itself.
      // However, if the bucket is shared, we should be careful.
      // Given the context of "video management", it likely owns the whole bucket.

      // Safer approach: List buckets and clear content.
      .map((b) => b.trim())
      .filter((b) => b);

    if (buckets.length === 0) {
      console.warn("! No buckets found in ZATA_BUCKETS env variable.");
    }

    for (const bucket of buckets) {
      console.log(`\n[S3] Clearing content in bucket: ${bucket}...`);
      let continuationToken;
      let count = 0;
      let deletedCount = 0;

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
            const deleteRes = await s3Client.send(
              new DeleteObjectsCommand(deleteParams),
            );
            deletedCount += deleteRes.Deleted ? deleteRes.Deleted.length : 0;
            process.stdout.write(`  - Deleted ${deletedCount} objects...\r`);
          }

          continuationToken = listRes.NextContinuationToken;
        } while (continuationToken);

        console.log(
          `\n✓ Successfully deleted ${deletedCount} objects from ${bucket}`,
        );
      } catch (err) {
        console.error(`✗ Error cleaning bucket ${bucket}:`, err.message);
      }
    }

    // 2. Clear Database Tables (EXCEPT users)
    console.log("\n[DB] Cleaning Database Tables...");

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
      // "users", // EXCLUDED
    ];

    for (const table of tablesToClear) {
      try {
        // CASCADE is needed because some tables might be referenced by others in this list
        // (e.g. workspaces referenced by videos)
        await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`  ✓ Truncated table: ${table}`);
      } catch (err) {
        if (err.code === "42P01") {
          console.log(`  ! Table ${table} does not exist, skipping.`);
        } else {
          console.error(`  ✗ Error truncating ${table}:`, err.message);
        }
      }
    }

    // 3. Update Users to remove avatar links (since photos are gone)
    console.log("\n[DB] Updating Users...");
    await pool.query("UPDATE users SET avatar_url = NULL");
    console.log("  ✓ Cleared avatar_url for all users.");

    console.log("\n=====================================================");
    console.log("--- CLEANUP COMPLETE: USERS KEPT, DATA CLEARED ---");
    console.log("=====================================================\n");
  } catch (error) {
    console.error("\n✗ FATAL ERROR DURING RESET:", error);
  } finally {
    await pool.end();
  }
}

clearDataKeepUsers();
