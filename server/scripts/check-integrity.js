import pg from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432"),
});

async function checkIntegrity() {
  try {
    console.log("--- Checking Database Integrity ---");

    // 1. Check Videos
    const videos = await pool.query("SELECT count(*) FROM videos");
    console.log(`Total Videos: ${videos.rows[0].count}`);

    // 2. Check Share Tokens
    const tokens = await pool.query("SELECT * FROM video_share_tokens");
    console.log(`Total Share Tokens: ${tokens.rowCount}`);

    for (const token of tokens.rows) {
      const video = await pool.query(
        "SELECT id, filename, hls_ready FROM videos WHERE id = $1",
        [token.video_id],
      );
      if (video.rowCount === 0) {
        console.error(
          `[ERROR] Orphaned Token found! Token ${token.token} points to missing video ${token.video_id}`,
        );
      } else {
        // console.log(`[OK] Token for video ${video.rows[0].filename} exists.`);
      }
    }

    // 3. Check specific video if provided as arg
    const specificId = process.argv[2];
    if (specificId) {
      console.log(`--- Checking Specific Video: ${specificId} ---`);
      const video = await pool.query("SELECT * FROM videos WHERE id = $1", [
        specificId,
      ]);
      if (video.rowCount === 0) {
        console.error(`[ERROR] Video ${specificId} NOT FOUND in database.`);
      } else {
        console.log(`[OK] Video found:`, video.rows[0]);

        // Check tokens for this video
        const vTokens = await pool.query(
          "SELECT * FROM video_share_tokens WHERE video_id = $1",
          [specificId],
        );
        console.log(`Tokens for this video: ${vTokens.rowCount}`);
        vTokens.rows.forEach((t) =>
          console.log(` - Token: ${t.token}, Active: ${t.active}`),
        );
      }
    }

    console.log("--- Done ---");
  } catch (err) {
    console.error("Database connection error:", err);
  } finally {
    await pool.end();
  }
}

checkIntegrity();
