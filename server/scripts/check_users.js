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

async function checkUsers() {
  try {
    const res = await pool.query("SELECT COUNT(*) FROM users");
    console.log("Total users:", res.rows[0].count);

    const details = await pool.query(
      "SELECT email, role, is_org_member, deleted_at FROM users",
    );
    console.log("--- USER DETAILS ---");
    details.rows.forEach((u) => console.log(JSON.stringify(u)));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkUsers();
