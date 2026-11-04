import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { get } from "../db.js";
import { ApiError } from "../lib/errors.js";
import { asyncHandler, param, parseBody } from "../lib/http.js";
import { canUserViewOrder, getOrderByReference, listOrders, transitionOrder } from "../lib/orders.js";
import { endTrackingSession, getSessionPoints, recordDriverPoint, startTrackingSession } from "../lib/tracking.js";
import { rateLimit } from "../lib/rateLimit.js";

export const driverRouter = Router();
driverRouter.use(requireRole("driver"));

function ownOrder(reference: string, userId: number) {
  const order = getOrderByReference(reference);
  if (order.driver?.id !== userId) {
    throw new ApiError(403, "This delivery is not assigned to you.");
  }
  return order;
}

driverRouter.get(
  "/orders",
  asyncHandler((req, res) => {
    const orders = listOrders("WHERE o.driver_id = ?", [req.user!.id], 40);
    res.json({ orders });
  }),
);

driverRouter.get(
  "/orders/:reference",
  asyncHandler((req, res) => {
    const order = ownOrder(param(req, "reference"), req.user!.id);
    let points: Array<{ lat: number; lng: number; source: string; recorded_at: string }> = [];
    if (order.tracking) points = getSessionPoints(order.tracking.sessionId, 80);
    res.json({ order, points });
  }),
);

driverRouter.post(
  "/orders/:reference/start",
  asyncHandler((req, res) => {
    const order = ownOrder(param(req, "reference"), req.user!.id);
    if (order.status === "out_for_delivery") {
      startTrackingSession(order.id, req.user!.id);
      res.json({ order: getOrderByReference(order.reference) });
      return;
    }
    if (!["packing"].includes(order.status)) {
      throw new ApiError(409, "This order is not packed yet. Ask the kitchen to mark it as Packing before you start.");
    }
    const updated = transitionOrder(order.id, "out_for_delivery", {
      actor: { id: req.user!.id, name: req.user!.fullName, role: "driver" },
      note: "Rider started the delivery",
    });
    startTrackingSession(updated.id, req.user!.id);
    res.json({ order: getOrderByReference(updated.reference) });
  }),
);

driverRouter.post(
  "/orders/:reference/delivered",
  asyncHandler((req, res) => {
    const order = ownOrder(param(req, "reference"), req.user!.id);
    if (order.status !== "out_for_delivery") {
      throw new ApiError(409, "Start the delivery before confirming it.");
    }
    const data = parseBody(
      z.object({ note: z.string().trim().max(300).optional(), receivedBy: z.string().trim().max(80).optional() }),
      req.body ?? {},
    );
    const note = data.receivedBy ? `Delivered to ${data.receivedBy}` : data.note ?? "Delivery confirmed by rider";
    const delivered = transitionOrder(order.id, "delivered", {
      actor: { id: req.user!.id, name: req.user!.fullName, role: "driver" },
      note,
    });
    endTrackingSession(delivered.id);

    // Auto-complete once the delivery is confirmed; staff can still adjust from the dashboard.
    const completed = transitionOrder(delivered.id, "completed", {
      actor: { id: req.user!.id, name: req.user!.fullName, role: "driver" },
      note: "Order closed after successful delivery",
    });
    res.json({ order: getOrderByReference(completed.reference) });
  }),
);

driverRouter.post(
  "/location",
  asyncHandler((req, res) => {
    rateLimit(req, `driver-location-${req.user!.id}`, 120, 60 * 1000);
    const data = parseBody(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().nonnegative().nullable().optional(),
      }),
      req.body,
    );
    const point = recordDriverPoint(req.user!.id, data.lat, data.lng, data.accuracy ?? null, "gps");
    res.json({ ok: true, point });
  }),
);

driverRouter.get(
  "/session",
  asyncHandler((req, res) => {
    const session = get<{
      id: number;
      order_id: number;
      reference: string;
      status: string;
    }>(
      `SELECT s.id, s.order_id, o.reference, o.status FROM tracking_sessions s JOIN orders o ON o.id = s.order_id
       WHERE s.driver_id = ? AND s.ended_at IS NULL ORDER BY s.id DESC LIMIT 1`,
      [req.user!.id],
    );
    res.json({ session: session ?? null });
  }),
);
