import express from "express";
import cors from "cors";
import helmet from "helmet";
import routes from "./routes/index.js";

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // CSP managed separately or by frontend
    crossOriginEmbedderPolicy: false, // Allow embedding video content
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow thumbnails/streams to load cross-origin
  }),
);

// Middleware
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : [
      "https://videomanagement.celiyo.com",
      "https://video.celiyo.com",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5000",
      "http://localhost:3001",
      "http://localhost:5174",
    ];

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Range", "x-share-token"],
  }),
);
app.use(express.json());

// Request logger — use a persistent write stream instead of sync I/O per request
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(__dirname, "logs");
const logFile = path.join(logDir, "http.log");

// Ensure log directory exists once at startup
try {
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
} catch (err) {
  console.error("Failed to create log directory:", err.message);
}

// Open a single write stream for the lifetime of the process
const logStream = fs.createWriteStream(logFile, { flags: "a" });

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const msg = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)\n`;
    console.log(msg.trim());
    logStream.write(msg);
  });
  next();
});

// Schema Generator API routes
import schemaGeneratorRoutes from "./routes/schemaGenerator.js";
// We mount on multiple paths to handle different Nginx proxy configs:
// 1. /api/schema-generator (Standard API path)
// 2. /schema-generator (Standard proxy path)
// 3. /api (Supports the legacy /api/generate-schema-stream path inside the router)
app.use("/api/schema-generator", schemaGeneratorRoutes);
app.use("/schema-generator", schemaGeneratorRoutes);
app.use("/api", schemaGeneratorRoutes);

// Routes — mount on /api always; also mount on / for proxies that strip the prefix
app.use("/api", routes);
if (process.env.MOUNT_ROOT_ROUTES !== "false") {
  app.use("/", routes);
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 404 handler - catch unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;
