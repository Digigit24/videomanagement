import "./env.js"; // Must be imported first
import app from "./app.js";
import { initDatabase } from "./db/index.js";
import { seedAdmin } from "./services/user.js";
import { processPermanentDeletions } from "./services/recycleBin.js";
import processingQueue from "./services/processingQueue.js";

const PORT = process.env.PORT || 5000;

// Prevent process crashes from unhandled errors
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
});

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
    const server = app.listen(PORT, () => {
      console.log(`\n✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Buckets: ${process.env.ZATA_BUCKETS}`);

      // Recover any videos stuck from a previous crash/restart
      // (run after server is listening so health checks pass)
      processingQueue.recoverStuckVideos().catch((err) => {
        console.error("Failed to recover stuck videos:", err);
      });
    });

    // Graceful shutdown: stop accepting new connections, let in-flight finish
    const shutdown = async (signal) => {
      console.log(`\n[${signal}] Shutting down gracefully...`);
      server.close(async () => {
        console.log("✓ HTTP server closed");
        try {
          const { getPool } = await import("./db/index.js");
          await getPool().end();
          console.log("✓ Database pool closed");
        } catch (_) {}
        process.exit(0);
      });
      // Force exit after 10s if connections don't drain
      setTimeout(() => {
        console.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
