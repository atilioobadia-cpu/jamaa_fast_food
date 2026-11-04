import { Router } from "express";
import { requireAuth } from "../auth.js";
import { ApiError } from "../lib/errors.js";
import { asyncHandler, param } from "../lib/http.js";
import { canUserViewOrder, getOrderById, getOrderByReference } from "../lib/orders.js";
import { buildReceiptPdf, receiptFileName } from "../lib/receipt.js";
import { getSessionPoints } from "../lib/tracking.js";
import { get } from "../db.js";
import { RESTAURANT } from "../../../shared/config.js";
import { config } from "../config.js";

export const ordersRouter = Router();

function loadAuthorisedOrder(reference: string, user: NonNullable<Express.Request["user"]>) {
  const order = getOrderByReference(reference);
  if (!canUserViewOrder(order, user)) throw new ApiError(403, "You do not have access to this order.");
  return order;
}

ordersRouter.get(
  "/:reference",
  requireAuth,
  asyncHandler((req, res) => {
    const order = loadAuthorisedOrder(param(req, "reference"), req.user!);
    res.json({ order });
  }),
);

ordersRouter.get(
  "/:reference/receipt.pdf",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = loadAuthorisedOrder(param(req, "reference"), req.user!);
    const width = req.query.width === "58" ? 58 : 80;
    const pdf = await buildReceiptPdf(order, width as 58 | 80);
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${receiptFileName(order)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  }),
);

ordersRouter.get(
  "/:reference/tracking",
  requireAuth,
  asyncHandler((req, res) => {
    const order = loadAuthorisedOrder(param(req, "reference"), req.user!);
    let points: Array<{ lat: number; lng: number; source: string; recorded_at: string }> = [];
    if (order.tracking) {
      points = getSessionPoints(order.tracking.sessionId);
    }
    res.json({
      order,
      restaurant: RESTAURANT.coords,
      destination:
        order.delivery && order.delivery.lat !== null && order.delivery.lng !== null
          ? { lat: order.delivery.lat, lng: order.delivery.lng }
          : null,
      points,
      demoMode: config.demoMode,
      serverTime: new Date().toISOString(),
    });
  }),
);

ordersRouter.get(
  "/:reference/tracking/points",
  requireAuth,
  asyncHandler((req, res) => {
    const order = loadAuthorisedOrder(param(req, "reference"), req.user!);
    if (!order.tracking) {
      res.json({ points: [], active: false });
      return;
    }
    const session = get<{ is_demo: number; ended_at: string | null }>(
      "SELECT is_demo, ended_at FROM tracking_sessions WHERE id = ?",
      [order.tracking.sessionId],
    );
    res.json({
      sessionId: order.tracking.sessionId,
      active: Boolean(session && !session.ended_at),
      demo: Boolean(session?.is_demo),
      points: getSessionPoints(order.tracking.sessionId),
    });
  }),
);

/** Staff and drivers read the full order from their own protected routes. */
ordersRouter.get(
  "/id/:id",
  requireAuth,
  asyncHandler((req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new ApiError(400, "Invalid order id.");
    const order = getOrderById(id);
    if (!canUserViewOrder(order, req.user!)) throw new ApiError(403, "You do not have access to this order.");
    res.json({ order });
  }),
);
