import { Router } from "express";
import { z } from "zod";
import {
  clearSessionCookie,
  consumePasswordReset,
  createPasswordReset,
  createSession,
  destroySession,
  findUserByIdentifier,
  hashPassword,
  loginSchema,
  pickAvatarColor,
  registerSchema,
  requireAuth,
  setSessionCookie,
  toSessionUser,
  verifyPassword,
  type UserRow,
} from "../auth.js";
import { all, get, nowIso, run } from "../db.js";
import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";
import { asyncHandler, parseBody } from "../lib/http.js";
import { rateLimit } from "../lib/rateLimit.js";
import { listOrders } from "../lib/orders.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler((req, res) => {
    rateLimit(req, "register", 12, 15 * 60 * 1000);
    const data = parseBody(registerSchema, req.body);

    const phoneTaken = get<{ id: number }>("SELECT id FROM users WHERE phone = ?", [data.phone]);
    if (phoneTaken) throw new ApiError(409, "An account with that phone number already exists. Try signing in.");
    if (data.email) {
      const emailTaken = get<{ id: number }>("SELECT id FROM users WHERE lower(email) = ?", [data.email.toLowerCase()]);
      if (emailTaken) throw new ApiError(409, "That email address is already linked to an account.");
    }

    const result = run(
      `INSERT INTO users (role, full_name, phone, email, password_hash, avatar_color, created_at)
       VALUES ('customer', ?, ?, ?, ?, ?, ?)`,
      [
        data.fullName,
        data.phone,
        data.email?.toLowerCase() ?? null,
        hashPassword(data.password),
        pickAvatarColor(data.fullName),
        nowIso(),
      ],
    );

    const user = get<UserRow>("SELECT * FROM users WHERE id = ?", [Number(result.lastInsertRowid)])!;
    const token = createSession(user.id, req.get("user-agent"));
    setSessionCookie(res, token);
    res.status(201).json({ user: toSessionUser(user) });
  }),
);

authRouter.post(
  "/login",
  asyncHandler((req, res) => {
    rateLimit(req, "login", 15, 10 * 60 * 1000);
    const data = parseBody(loginSchema, req.body);
    const portal = typeof req.body?.portal === "string" ? req.body.portal : "customer";

    const user = findUserByIdentifier(data.identifier);
    if (!user || !verifyPassword(data.password, user.password_hash)) {
      throw new ApiError(401, "Those details do not match an account. Check your phone/email and password.");
    }

    if (portal === "staff" && user.role === "customer") {
      throw new ApiError(403, "This account is a customer account. Use the customer sign-in page.");
    }
    if (portal === "staff" && user.role === "driver") {
      throw new ApiError(403, "Delivery accounts must sign in through the rider portal.");
    }
    if (portal === "driver" && user.role !== "driver") {
      throw new ApiError(403, "This account is not a delivery rider account.");
    }

    const token = createSession(user.id, req.get("user-agent"));
    setSessionCookie(res, token);
    res.json({ user: toSessionUser(user) });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler((req, res) => {
    if (req.sessionToken) destroySession(req.sessionToken);
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  "/me",
  asyncHandler((req, res) => {
    res.json({ user: req.user ?? null });
  }),
);

authRouter.post(
  "/forgot-password",
  asyncHandler((req, res) => {
    rateLimit(req, "forgot", 8, 15 * 60 * 1000);
    const data = parseBody(z.object({ identifier: z.string().trim().min(3) }), req.body);
    const user = findUserByIdentifier(data.identifier);
    let demoResetToken: string | undefined;
    if (user) {
      const token = createPasswordReset(user.id);
      if (config.demoMode) demoResetToken = token;
    }
    res.json({
      message:
        "If an account matches those details we have created a password reset link. In this prototype the link is shown below instead of being sent by SMS or email.",
      demoResetToken,
    });
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler((req, res) => {
    const data = parseBody(
      z
        .object({
          token: z.string().min(10),
          password: z.string().min(8, "Password must be at least 8 characters"),
          passwordConfirm: z.string(),
        })
        .refine((value) => value.password === value.passwordConfirm, {
          message: "Passwords do not match",
          path: ["passwordConfirm"],
        }),
      req.body,
    );
    const userId = consumePasswordReset(data.token);
    if (!userId) throw new ApiError(400, "That reset link is invalid or has expired. Request a new one.");
    run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(data.password), userId]);
    run("DELETE FROM sessions WHERE user_id = ?", [userId]);
    res.json({ ok: true });
  }),
);

authRouter.patch(
  "/profile",
  requireAuth,
  asyncHandler((req, res) => {
    const data = parseBody(
      z.object({
        fullName: z.string().trim().min(2, "Enter your full name").max(80),
        email: z.string().trim().email("Enter a valid email").optional().or(z.literal("").transform(() => undefined)),
        phone: z.string().trim().min(9, "Enter a valid phone number"),
      }),
      req.body,
    );
    const normalized = data.phone.replace(/[\s\-()]/g, "");
    const phone = normalized.startsWith("+") ? normalized : normalized.startsWith("0") ? `+255${normalized.slice(1)}` : `+${normalized}`;
    if (!/^\+255\d{9}$/.test(phone)) throw new ApiError(422, "Use a Tanzanian number, e.g. 0712 345 678");

    const clash = get<{ id: number }>("SELECT id FROM users WHERE phone = ? AND id <> ?", [phone, req.user!.id]);
    if (clash) throw new ApiError(409, "That phone number is already used by another account.");

    run("UPDATE users SET full_name = ?, phone = ?, email = ? WHERE id = ?", [
      data.fullName,
      phone,
      data.email?.toLowerCase() ?? null,
      req.user!.id,
    ]);
    const updated = get<UserRow>("SELECT * FROM users WHERE id = ?", [req.user!.id])!;
    res.json({ user: toSessionUser(updated) });
  }),
);

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler((req, res) => {
    const data = parseBody(
      z
        .object({
          currentPassword: z.string().min(1, "Enter your current password"),
          password: z.string().min(8, "New password must be at least 8 characters"),
          passwordConfirm: z.string(),
        })
        .refine((value) => value.password === value.passwordConfirm, {
          message: "New passwords do not match",
          path: ["passwordConfirm"],
        }),
      req.body,
    );
    const user = get<UserRow>("SELECT * FROM users WHERE id = ?", [req.user!.id]);
    if (!user || !verifyPassword(data.currentPassword, user.password_hash)) {
      throw new ApiError(401, "Your current password is incorrect.");
    }
    run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(data.password), req.user!.id]);
    res.json({ ok: true });
  }),
);

authRouter.get(
  "/orders",
  requireAuth,
  asyncHandler((req, res) => {
    res.json({ orders: listOrders("WHERE o.customer_id = ?", [req.user!.id], 50) });
  }),
);
