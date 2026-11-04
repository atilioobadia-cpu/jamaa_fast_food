import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import "dotenv/config";

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

function resolveSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  // Keep a stable development secret so sessions survive restarts.
  const secretFile = path.join(DATA_DIR, ".session-secret");
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, "utf8").trim();
  const generated = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4000),
  dataDir: DATA_DIR,
  dbFile: path.join(DATA_DIR, "jamaa.db"),
  uploadsDir: path.join(DATA_DIR, "uploads"),
  sessionSecret: resolveSecret(),
  sessionCookie: "jamaa_session",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
  demoMode: process.env.DEMO_MODE !== "false",
  delivery: {
    baseFee: Number(process.env.DELIVERY_BASE_FEE ?? 3000),
    includedKm: Number(process.env.DELIVERY_INCLUDED_KM ?? 4),
    perKmFee: Number(process.env.DELIVERY_PER_KM_FEE ?? 600),
    maxFee: Number(process.env.DELIVERY_MAX_FEE ?? 9000),
    maxKm: Number(process.env.DELIVERY_MAX_KM ?? 25),
    freeAbove: Number(process.env.DELIVERY_FREE_ABOVE ?? 120000),
  },
  publicDir: path.resolve(process.env.PUBLIC_DIR ?? "public"),
  clientDist: path.resolve("dist/public"),
};

fs.mkdirSync(config.uploadsDir, { recursive: true });
