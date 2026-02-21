import "./env.js"; // Must be imported first
import app from "./app.js";
import { initDatabase } from "./db/index.js";
import { seedAdmin } from "./services/user.js";
import { processPermanentDeletions } from "./services/recycleBin.js";

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // Initialize database
    await initDatabase();
    await seedAdmin();

    // Start recycle bin cleanup scheduler (every hour) - for soft-deleted workspaces/users only
    setInterval(
      () => {
        processPermanentDeletions().catch(console.error);
      },
      60 * 60 * 1000,
    );

    // Run once on startup
    processPermanentDeletions().catch(console.error);

    // Start server
    app.listen(PORT, () => {
      console.log(`\n✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Buckets: ${process.env.ZATA_BUCKETS}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
