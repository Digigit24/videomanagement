import dotenv from 'dotenv';
import app from './app.js';
import { initDatabase } from './db/index.js';

dotenv.config({ path: '../.env' });

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // Initialize database
    await initDatabase();

    // Start server
    app.listen(PORT, () => {
      console.log(`\n✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Buckets: ${process.env.ZATA_BUCKETS}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
