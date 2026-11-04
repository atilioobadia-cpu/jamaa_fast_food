import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { all, get, nowIso, run } from "../db.js";
import { ApiError } from "../lib/errors.js";
import { asyncHandler, param, parseBody } from "../lib/http.js";
import { assignDriver, getOrderByReference, listOrders, transitionOrder } from "../lib/orders.js";
import { endTrackingSession, getSessionPoints, startDemoSimulation, startTrackingSession, stopDemoSimulation } from "../lib/tracking.js";
import { getCategories, getMenu } from "../lib/menu.js";
import { ORDER_STATUSES, isStatusAllowed, type OrderStatus } from "../../../shared/types.js";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export const staffRouter = Router();
staffRouter.use(requireRole("staff", "admin"));

staffRouter.get(
  "/orders",
  asyncHandler((req, res) => {
    const statusParam = typeof req.query.status === "string" ? req.query.status : "";
    const typeParam = typeof req.query.type === "string" ? req.query.type : "";
    const dateParam = typeof req.query.date === "string" ? req.query.date : "";
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (statusParam) {
      const statuses = statusParam.split(",").filter((value) => ORDER_STATUSES.includes(value as OrderStatus));
      if (statuses.length) {
        clauses.push(`o.status IN (${statuses.map(() => "?").join(",")})`);
        params.push(...statuses);
      }
    }
    if (typeParam && ["delivery", "takeaway", "dine_in"].includes(typeParam)) {
      clauses.push("o.order_type = ?");
      params.push(typeParam);
    }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      clauses.push("date(o.created_at) = ?");
      params.push(dateParam);
    }
    if (search) {
      clauses.push("(o.reference LIKE ? OR u.full_name LIKE ? OR u.phone LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const orders = listOrders(where, params, limit);
    res.json({ orders });
  }),
);

staffRouter.get(
  "/orders/:reference",
  asyncHandler((req, res) => {
    const order = getOrderByReference(param(req, "reference"));
    let points: Array<{ lat: number; lng: number; source: string; recorded_at: string }> = [];
    if (order.tracking) points = getSessionPoints(order.tracking.sessionId, 120);
    res.json({ order, points });
  }),
);

const statusSchema = z.object({
  status: z.enum([
    "waiting_confirmation",
    "confirmed",
    "processing",
    "packing",
    "ready_for_collection",
    "out_for_delivery",
    "delivered",
    "completed",
    "cancelled",
  ]),
  note: z.string().trim().max(300).optional().nullable(),
});

staffRouter.post(
  "/orders/:reference/status",
  asyncHandler((req, res) => {
    const data = parseBody(statusSchema, req.body);
    const order = getOrderByReference(param(req, "reference"));

    if (!isStatusAllowed(order.orderType, order.status, data.status)) {
      throw new ApiError(409, `This ${order.orderType.replace("_", "-")} order cannot move from "${order.status}" to "${data.status}".`);
    }

    if (data.status === "out_for_delivery") {
      if (order.orderType !== "delivery") throw new ApiError(400, "Only delivery orders can go out for delivery.");
      if (!order.driver) throw new ApiError(422, "Assign a delivery person before dispatching this order.");
    }

    const updated = transitionOrder(order.id, data.status, {
      actor: { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
      note: data.note ?? null,
    });

    if (data.status === "out_for_delivery" && updated.driver) {
      startTrackingSession(updated.id, updated.driver.id);
    }
    if (["delivered", "completed", "cancelled"].includes(data.status)) {
      endTrackingSession(updated.id);
    }

    res.json({ order: getOrderByReference(updated.reference) });
  }),
);

staffRouter.post(
  "/orders/:reference/assign",
  asyncHandler((req, res) => {
    const data = parseBody(z.object({ driverId: z.coerce.number().int().positive() }), req.body);
    const order = getOrderByReference(param(req, "reference"));
    const updated = assignDriver(order.id, data.driverId, req.user!);
    res.json({ order: updated });
  }),
);

staffRouter.get(
  "/drivers",
  asyncHandler((_req, res) => {
    const drivers = all<{
      id: number;
      full_name: string;
      phone: string;
      vehicle: string | null;
      avatar_color: string;
      active_orders: number;
    }>(
      `SELECT u.id, u.full_name, u.phone, u.vehicle, u.avatar_color,
        (SELECT COUNT(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN ('confirmed','processing','packing','out_for_delivery')) AS active_orders
       FROM users u WHERE u.role = 'driver' AND u.is_active = 1 ORDER BY u.full_name`,
    );
    res.json({
      drivers: drivers.map((driver) => ({
        id: driver.id,
        fullName: driver.full_name,
        phone: driver.phone,
        vehicle: driver.vehicle,
        avatarColor: driver.avatar_color,
        activeOrders: driver.active_orders,
      })),
    });
  }),
);

staffRouter.get(
  "/stats",
  asyncHandler((_req, res) => {
    const byStatus = all<{ status: string; count: number }>("SELECT status, COUNT(*) AS count FROM orders GROUP BY status");
    const today = get<{ orders: number; revenue: number }>(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(amount_paid), 0) AS revenue FROM orders
       WHERE date(created_at) = date('now') AND status <> 'cancelled'`,
    );
    const deliveries = get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM orders WHERE order_type = 'delivery' AND status IN ('confirmed','processing','packing','out_for_delivery')",
    );
    res.json({
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row.count])),
      todayOrders: today?.orders ?? 0,
      todayRevenue: today?.revenue ?? 0,
      activeDeliveries: deliveries?.count ?? 0,
      generatedAt: nowIso(),
    });
  }),
);

staffRouter.post(
  "/orders/:reference/tracking/demo",
  asyncHandler((req, res) => {
    const data = parseBody(z.object({ action: z.enum(["start", "stop"]) }), req.body);
    const order = getOrderByReference(param(req, "reference"));
    if (data.action === "start") {
      if (order.orderType !== "delivery") throw new ApiError(400, "Only delivery orders can be simulated.");
      if (order.status !== "out_for_delivery") throw new ApiError(409, "Mark the order Out for Delivery first.");
      if (!order.driver) throw new ApiError(409, "Assign a rider first.");
      startDemoSimulation(order.id);
    } else {
      stopDemoSimulation(order.id);
    }
    res.json({ ok: true, order: getOrderByReference(order.reference) });
  }),
);

staffRouter.get(
  "/menu",
  asyncHandler((_req, res) => {
    res.json({ categories: getCategories(), items: getMenu(true) });
  }),
);

const addonSchema = z.object({
  name: z.string().trim().min(1).max(60),
  price: z.coerce.number().int().min(0).max(100000),
});

const itemSchema = z.object({
  name: z.string().trim().min(2, "Enter the meal name").max(80),
  categoryId: z.coerce.number().int().positive(),
  description: z.string().trim().max(400).default(""),
  price: z.coerce.number().int().min(500, "Price must be at least TZS 500").max(1000000),
  image: z.string().trim().min(1, "Choose a photo").max(300),
  prepMinutes: z.coerce.number().int().min(1).max(120).default(15),
  tags: z.array(z.string().trim().max(30)).max(6).default([]),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  badge: z.string().trim().max(30).nullable().optional(),
  addons: z.array(addonSchema).max(12).default([]),
});

function replaceAddons(itemId: number, addons: Array<{ name: string; price: number }>) {
  run("DELETE FROM addons WHERE menu_item_id = ?", [itemId]);
  for (const addon of addons) {
    run("INSERT INTO addons (menu_item_id, name, price) VALUES (?, ?, ?)", [itemId, addon.name, addon.price]);
  }
}

staffRouter.post(
  "/menu/items",
  asyncHandler((req, res) => {
    const data = parseBody(itemSchema, req.body);
    const category = get<{ id: number }>("SELECT id FROM categories WHERE id = ?", [data.categoryId]);
    if (!category) throw new ApiError(400, "Choose a valid menu category.");
    const timestamp = nowIso();
    const result = run(
      `INSERT INTO menu_items (category_id, name, description, price, image, is_available, is_featured, badge,
        prep_minutes, tags, sold_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        data.categoryId,
        data.name,
        data.description,
        data.price,
        data.image,
        data.isAvailable ? 1 : 0,
        data.isFeatured ? 1 : 0,
        data.badge ?? null,
        data.prepMinutes,
        JSON.stringify(data.tags),
        timestamp,
        timestamp,
      ],
    );
    const itemId = Number(result.lastInsertRowid);
    replaceAddons(itemId, data.addons);
    res.status(201).json({ items: getMenu(true) });
  }),
);

staffRouter.patch(
  "/menu/items/:id",
  asyncHandler((req, res) => {
    const itemId = Number(req.params.id);
    const existing = get<{ id: number }>("SELECT id FROM menu_items WHERE id = ?", [itemId]);
    if (!existing) throw new ApiError(404, "Meal not found.");
    const data = parseBody(itemSchema.partial(), req.body);

    const fields: string[] = [];
    const params: unknown[] = [];
    const map: Array<[keyof typeof data, string]> = [
      ["name", "name"],
      ["categoryId", "category_id"],
      ["description", "description"],
      ["price", "price"],
      ["image", "image"],
      ["prepMinutes", "prep_minutes"],
      ["isAvailable", "is_available"],
      ["isFeatured", "is_featured"],
      ["badge", "badge"],
    ];
    for (const [key, column] of map) {
      if (data[key] !== undefined) {
        fields.push(`${column} = ?`);
        const value = data[key];
        params.push(typeof value === "boolean" ? (value ? 1 : 0) : (value as never));
      }
    }
    if (data.tags !== undefined) {
      fields.push("tags = ?");
      params.push(JSON.stringify(data.tags));
    }
    if (fields.length) {
      params.push(nowIso(), itemId);
      run(`UPDATE menu_items SET ${fields.join(", ")}, updated_at = ? WHERE id = ?`, params);
    }
    if (data.addons !== undefined) replaceAddons(itemId, data.addons);
    res.json({ items: getMenu(true) });
  }),
);

staffRouter.delete(
  "/menu/items/:id",
  asyncHandler((req, res) => {
    const itemId = Number(req.params.id);
    run("DELETE FROM menu_items WHERE id = ?", [itemId]);
    res.json({ items: getMenu(true) });
  }),
);

staffRouter.get(
  "/images",
  asyncHandler((_req, res) => {
    const dir = path.join(config.publicDir, "images", "food");
    const files = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
          .map((file) => `/images/food/${file}`)
      : [];
    res.json({ images: files });
  }),
);
