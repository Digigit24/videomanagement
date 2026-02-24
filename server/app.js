import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

// Middleware
app.use(
  cors({
    origin: [
      "https://videomanagement.celiyo.com",
      "https://video.celiyo.com",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5000",
      "http://localhost:3001",
      "http://localhost:5174",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Range", "x-share-token"],
  }),
);
app.use(express.json());

// Request logger
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFile = path.join(__dirname, "logs", "http.log");

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const msg = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)\n`;
    console.log(msg.trim());
    try {
      if (!fs.existsSync(path.dirname(logFile)))
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, msg);
    } catch (e) {
      console.error("Failed to write log:", e);
    }
  });
  next();
});

// Schema Generator API routes
import schemaGeneratorRoutes from "./routes/schemaGenerator.js";
app.use("/api/schema-generator", schemaGeneratorRoutes);

// Routes
// We mount on both /api and / to handle different proxy configurations
// (some proxies strip the /api prefix, others don't)
app.use("/api", routes);
app.use("/", routes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
