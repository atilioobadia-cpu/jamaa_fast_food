import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { get } from "./db.js";
import { attachUser } from "./auth.js";
import { initRealtime } from "./realtime.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";
import { checkoutRouter } from "./routes/checkout.js";
import { ordersRouter } from "./routes/orders.js";
import { notificationsRouter } from "./routes/notifications.js";
import { staffRouter } from "./routes/staff.js";
import { driverRouter } from "./routes/driver.js";
import { seedDemoData } from "./seed.js";
import { ApiError } from "./lib/errors.js";

const app = express();
app.disable("x-powered-by");
if (config.isProd) app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.use(attachUser);

// Static demo assets (food photography, logo) are served from /images.
app.use(
  "/images",
  express.static(path.join(config.publicDir, "images"), {
    maxAge: config.isProd ? "30d" : 0,
    fallthrough: true,
  }),
);

app.use("/api/auth", authRouter);
app.use("/api", publicRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/staff", staffRouter);
app.use("/api/driver", driverRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "That API endpoint does not exist." });
});

// In production the built SPA is served by this server.
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, { index: false, maxAge: "1h" }));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      next();
      return;
    }
    res.sendFile(path.join(config.clientDist, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "The request body was not valid JSON." });
    return;
  }
  console.error("[api] unhandled error", error);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
});

async function start() {
  const users = get<{ count: number }>("SELECT COUNT(*) AS count FROM users")?.count ?? 0;
  if (users === 0) {
    console.log("[seed] empty database detected — loading Jamaa demo data");
    await seedDemoData({ quiet: true });
  }

  const server = http.createServer(app);
  initRealtime(server);

  server.listen(config.port, () => {
    console.log(`[api] Jamaa Fast Food server listening on http://localhost:${config.port}`);
    console.log(`[api] environment: ${config.env} · demo mode: ${config.demoMode ? "on" : "off"}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("[api] failed to start", error);
  process.exit(1);
});
