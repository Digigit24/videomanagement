import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../.env") });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function fixEmails() {
  try {
    const res = await pool.query("UPDATE users SET email = LOWER(TRIM(email))");
    console.log("Successfully lowercased and trimmed", res.rowCount, "emails.");
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

fixEmails();
