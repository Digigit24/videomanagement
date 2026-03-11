import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try parent directory first (project root), then current directory (server/)
const parentEnv = dotenv.config({ path: path.join(__dirname, "../.env") });
if (parentEnv.error) {
  const localEnv = dotenv.config({ path: path.join(__dirname, ".env") });
  if (localEnv.error) {
    console.warn("[Env] Warning: No .env file found in project root or server/ directory.");
  }
}
