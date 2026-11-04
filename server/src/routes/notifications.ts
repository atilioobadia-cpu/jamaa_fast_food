import { Router } from "express";
import { requireAuth } from "../auth.js";
import { all, get, nowIso, run } from "../db.js";
import { asyncHandler } from "../lib/http.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const rows = all<{
      id: number;
      order_id: number | null;
      type: string;
      title: string;
      body: string;
      read_at: string | null;
      created_at: string;
      reference: string | null;
    }>(
      `SELECT n.*, o.reference FROM notifications n LEFT JOIN orders o ON o.id = n.order_id
       WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 40`,
      [req.user!.id],
    );
    const unread = get<{ count: number }>("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL", [
      req.user!.id,
    ]);
    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        orderReference: row.reference,
        type: row.type,
        title: row.title,
        body: row.body,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
      unreadCount: unread?.count ?? 0,
    });
  }),
);

notificationsRouter.post(
  "/read-all",
  requireAuth,
  asyncHandler((req, res) => {
    run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", [nowIso(), req.user!.id]);
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  "/:id/read",
  requireAuth,
  asyncHandler((req, res) => {
    const id = Number(req.params.id);
    run("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?", [nowIso(), id, req.user!.id]);
    res.json({ ok: true });
  }),
);
