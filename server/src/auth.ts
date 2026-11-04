import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { get, nowIso, run } from "./db.js";
import type { Role, SessionUser } from "../../shared/types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}

export interface UserRow {
  id: number;
  role: Role;
  full_name: string;
  phone: string;
  email: string | null;
  password_hash: string;
  vehicle: string | null;
  avatar_color: string;
  is_active: number;
}

const AVATAR_COLORS = ["#B91C23", "#E2A812", "#2F6F5E", "#4A3F8F", "#B4552A", "#1F5C74", "#7A1419"];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+255")) return cleaned;
  if (cleaned.startsWith("255")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+255${cleaned.slice(1)}`;
  return cleaned;
}

const phoneSchema = z
  .string()
  .trim()
  .min(9, "Enter a valid phone number")
  .transform(normalizePhone)
  .refine((value) => /^\+255\d{9}$/.test(value), "Use a Tanzanian number, e.g. 0712 345 678");

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  phone: phoneSchema,
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  passwordConfirm: z.string(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Passwords do not match",
  path: ["passwordConfirm"],
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your phone number or email"),
  password: z.string().min(1, "Enter your password"),
});

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function findUserByIdentifier(identifier: string): UserRow | undefined {
  const trimmed = identifier.trim();
  const looksLikeEmail = trimmed.includes("@");
  if (looksLikeEmail) {
    return get<UserRow>("SELECT * FROM users WHERE lower(email) = ? AND is_active = 1", [trimmed.toLowerCase()]);
  }
  const phone = normalizePhone(trimmed);
  return get<UserRow>("SELECT * FROM users WHERE phone = ? AND is_active = 1", [phone]);
}

export function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    avatarColor: row.avatar_color,
  };
}

export function createSession(userId: number, userAgent: string | undefined): string {
  const token = crypto.randomBytes(32).toString("hex");
  const created = new Date();
  const expires = new Date(created.getTime() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  run("INSERT INTO sessions (token, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)", [
    token,
    userId,
    created.toISOString(),
    expires.toISOString(),
    userAgent ?? "",
  ]);
  return token;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.sessionCookie, { path: "/" });
}

export function destroySession(token: string): void {
  run("DELETE FROM sessions WHERE token = ?", [token]);
}

export function getUserFromToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = get<UserRow & { expires_at: string }>(
    `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    [token],
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now() || !row.is_active) {
    run("DELETE FROM sessions WHERE token = ?", [token]);
    return null;
  }
  return toSessionUser(row);
}

export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[config.sessionCookie];
  if (token) {
    const user = getUserFromToken(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "You do not have access to this area." });
      return;
    }
    next();
  };
}

export function createPasswordReset(userId: number): string {
  const token = crypto.randomBytes(24).toString("hex");
  const created = new Date();
  const expires = new Date(created.getTime() + 60 * 60 * 1000);
  run("INSERT INTO password_resets (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    token,
    userId,
    created.toISOString(),
    expires.toISOString(),
  ]);
  return token;
}

export function consumePasswordReset(token: string): number | null {
  const row = get<{ user_id: number; expires_at: string; used_at: string | null }>(
    "SELECT * FROM password_resets WHERE token = ?",
    [token],
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return null;
  run("UPDATE password_resets SET used_at = ? WHERE token = ?", [nowIso(), token]);
  return row.user_id;
}
