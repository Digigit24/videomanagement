import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

// Middleware
app.use(
  cors({
    origin: "*", // Allow all origins
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

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
