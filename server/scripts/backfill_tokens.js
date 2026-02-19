import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../db/index.js";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try loading from project root (two levels up from scripts/)
const envPath = path.resolve(__dirname, "../../.env");
console.log(`Loading .env from: ${envPath}`);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error("Error loading .env:", result.error);
  // Fallback: try one level up (server root)
  const envPath2 = path.resolve(__dirname, "../.env");
  console.log(`Fallback: Loading .env from: ${envPath2}`);
  dotenv.config({ path: envPath2 });
}

console.log("DATABASE_URL set?", !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  console.log("DATABASE_URL length:", process.env.DATABASE_URL.length);
}

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://videomanagement.celiyo.com";

async function main() {
  console.log("Starting video token backfill...");

  const pool = getPool();

  try {
    // 1. Get all videos
    const videosRes = await pool.query(
      `SELECT id, filename, bucket, uploaded_by FROM videos ORDER BY created_at DESC`,
    );
    const videos = videosRes.rows;
    console.log(`Found ${videos.length} videos.`);

    for (const video of videos) {
      // 2. Check for existing active token
      const tokenRes = await pool.query(
        `SELECT token FROM video_share_tokens WHERE video_id = $1 AND active = true LIMIT 1`,
        [video.id],
      );

      let token = tokenRes.rows[0]?.token;

      if (!token) {
        // 3. Create new token if missing
        token = crypto.randomBytes(32).toString("hex");
        console.log(
          `Creating new token for video: ${video.filename} (${video.id})`,
        );

        await pool.query(
          `INSERT INTO video_share_tokens (video_id, token, created_by)
           VALUES ($1, $2, $3)`,
          [video.id, token, video.uploaded_by],
        );
      } else {
        // console.log(`Token exists for video: ${video.filename}`);
      }

      // 4. Print the link
      const reviewLink = `${FRONTEND_URL}/v/${video.id}/review?token=${token}`;
      console.log(`Video: ${video.filename}`);
      console.log(`ID: ${video.id}`);
      console.log(`Link: ${reviewLink}`);
      console.log("-".repeat(40));
    }

    console.log("\nDone! All videos have valid share tokens.");
  } catch (err) {
    console.error("Error running script:", err);
  } finally {
    // We don't close the pool explicitly because it might hang if there are active connections,
    // but process.exit will clean up.
    process.exit(0);
  }
}

main();
