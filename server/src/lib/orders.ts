import { all, get, nowIso, run } from "../db.js";
import { RESTAURANT } from "../../../shared/config.js";
import {
  allowedNextStatuses,
  haversineMeters,
  isStatusAllowed,
  type DriverSummary,
  type Order,
  type OrderEvent,
  type OrderItem,
  type OrderStatus,
  type OrderType,
  type Payment,
  type Quote,
  type Role,
  type SessionUser,
  type TrackingState,
} from "../../../shared/types.js";
import { ApiError } from "./errors.js";
import { nextOrderReference, nextReceiptNumber } from "./ids.js";
import { emitToOrder, emitToRole, emitToUser } from "./bus.js";

export interface OrderRow {
  id: number;
  reference: string;
  receipt_number: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  order_type: OrderType;
  status: OrderStatus;
  payment_status: "unpaid" | "paid" | "refunded" | "failed";
  subtotal: number;
  delivery_fee: number;
  total: number;
  amount_paid: number;
  notes: string | null;
  dine_in_note: string | null;
  scheduled_for: string | null;
  address: string | null;
  address_instructions: string | null;
  lat: number | null;
  lng: number | null;
  geo_accuracy: number | null;
  geo_source: "gps" | "map" | "manual" | null;
  location_confirmed: number;
  driver_id: number | null;
  eta_minutes: number | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
}

interface ItemRow {
  id: number;
  menu_item_id: number;
  name: string;
  image: string;
  quantity: number;
  unit_price: number;
  addons_json: string;
  instructions: string;
  line_total: number;
}

interface EventRow {
  id: number;
  status: OrderStatus;
  note: string | null;
  actor_name: string;
  actor_role: string;
  created_at: string;
}

interface PaymentRow {
  reference: string;
  method: string;
  amount: number;
  status: "unpaid" | "paid" | "refunded" | "failed";
  created_at: string;
}

interface SessionRow {
  id: number;
  driver_id: number;
  is_demo: number;
  started_at: string;
  ended_at: string | null;
}

interface PointRow {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: "gps" | "simulator";
  recorded_at: string;
}

const ORDER_SELECT = `
  SELECT o.*, u.full_name AS customer_name, u.phone AS customer_phone, u.email AS customer_email
  FROM orders o JOIN users u ON u.id = o.customer_id
`;

export function findOrderRow(reference: string): OrderRow | undefined {
  return get<OrderRow>(`${ORDER_SELECT} WHERE o.reference = ?`, [reference]);
}

export function findOrderRowById(id: number): OrderRow | undefined {
  return get<OrderRow>(`${ORDER_SELECT} WHERE o.id = ?`, [id]);
}

export function assembleOrder(row: OrderRow): Order {
  const items = all<ItemRow>("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", [row.id]).map<OrderItem>(
    (item) => ({
      id: item.id,
      menuItemId: item.menu_item_id,
      name: item.name,
      image: item.image,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      addons: JSON.parse(item.addons_json || "[]"),
      instructions: item.instructions,
      lineTotal: item.line_total,
    }),
  );

  const events = all<EventRow>("SELECT * FROM order_events WHERE order_id = ? ORDER BY id", [row.id]).map<OrderEvent>(
    (event) => ({
      id: event.id,
      status: event.status,
      note: event.note,
      actorName: event.actor_name,
      actorRole: event.actor_role as Role | "system",
      createdAt: event.created_at,
    }),
  );

  const paymentRow = get<PaymentRow>("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1", [row.id]);
  const payment: Payment | null = paymentRow
    ? {
        reference: paymentRow.reference,
        method: paymentRow.method,
        amount: paymentRow.amount,
        status: paymentRow.status,
        createdAt: paymentRow.created_at,
      }
    : null;

  let driver: DriverSummary | null = null;
  if (row.driver_id) {
    const driverRow = get<{
      id: number;
      full_name: string;
      phone: string;
      vehicle: string | null;
      avatar_color: string;
    }>("SELECT id, full_name, phone, vehicle, avatar_color FROM users WHERE id = ?", [row.driver_id]);
    if (driverRow) {
      driver = {
        id: driverRow.id,
        fullName: driverRow.full_name,
        phone: driverRow.phone,
        vehicle: driverRow.vehicle,
        avatarColor: driverRow.avatar_color,
      };
    }
  }

  return {
    id: row.id,
    reference: row.reference,
    receiptNumber: row.receipt_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    orderType: row.order_type,
    status: row.status,
    paymentStatus: row.payment_status,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    total: row.total,
    amountPaid: row.amount_paid,
    scheduledFor: row.scheduled_for,
    dineInNote: row.dine_in_note,
    notes: row.notes,
    delivery:
      row.order_type === "delivery"
        ? {
            address: row.address ?? "",
            instructions: row.address_instructions ?? "",
            lat: row.lat,
            lng: row.lng,
            accuracy: row.geo_accuracy,
            source: row.geo_source,
            confirmed: Boolean(row.location_confirmed),
          }
        : null,
    items,
    events,
    payment,
    driver,
    tracking: buildTracking(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    etaMinutes: row.eta_minutes,
  };
}

function buildTracking(row: OrderRow): TrackingState | null {
  const session = get<SessionRow>(
    "SELECT * FROM tracking_sessions WHERE order_id = ? ORDER BY id DESC LIMIT 1",
    [row.id],
  );
  if (!session) return null;
  const point = get<PointRow>(
    "SELECT lat, lng, accuracy, source, recorded_at FROM tracking_points WHERE session_id = ? ORDER BY id DESC LIMIT 1",
    [session.id],
  );
  let distanceRemainingMeters: number | null = null;
  let etaMinutes: number | null = null;
  if (point && row.lat !== null && row.lng !== null) {
    distanceRemainingMeters = haversineMeters(
      { lat: point.lat, lng: point.lng },
      { lat: row.lat, lng: row.lng },
    );
    if (row.status === "out_for_delivery") {
      etaMinutes = Math.max(1, Math.round(distanceRemainingMeters / 1000 / 18 * 60));
    }
  }
  return {
    sessionId: session.id,
    active: !session.ended_at,
    demo: Boolean(session.is_demo),
    startedAt: session.started_at,
    endedAt: session.ended_at,
    lastPoint: point
      ? {
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy,
          source: point.source,
          recordedAt: point.recorded_at,
        }
      : null,
    distanceRemainingMeters,
    etaMinutes,
  };
}

export function getOrderByReference(reference: string): Order {
  const row = findOrderRow(reference);
  if (!row) throw new ApiError(404, "Order not found.");
  return assembleOrder(row);
}

export function getOrderById(id: number): Order {
  const row = findOrderRowById(id);
  if (!row) throw new ApiError(404, "Order not found.");
  return assembleOrder(row);
}

export function listOrders(where: string, params: unknown[] = [], limit = 100): Order[] {
  const rows = all<OrderRow>(`${ORDER_SELECT} ${where} ORDER BY o.created_at DESC LIMIT ?`, [...params, limit]);
  return rows.map(assembleOrder);
}

export function canUserViewOrder(order: Order, user: SessionUser): boolean {
  if (user.role === "customer") return order.customerId === user.id;
  if (user.role === "driver") return order.driver?.id === user.id;
  return user.role === "staff" || user.role === "admin";
}

export function notifyUser(userId: number, orderId: number | null, type: string, title: string, body: string): number {
  const result = run(
    "INSERT INTO notifications (user_id, order_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, orderId, type, title, body, nowIso()],
  );
  const id = Number(result.lastInsertRowid);
  emitToUser(userId, "notification", { id, orderId, type, title, body, createdAt: nowIso() });
  return id;
}

export function notifyStaff(orderId: number, type: string, title: string, body: string): void {
  const staff = all<{ id: number }>("SELECT id FROM users WHERE role IN ('staff','admin') AND is_active = 1");
  for (const member of staff) notifyUser(member.id, orderId, type, title, body);
  emitToRole("staff", "order:created", { orderId });
  emitToRole("admin", "order:created", { orderId });
}

const STATUS_NOTIFICATIONS: Record<OrderStatus, { title: string; body: (ref: string) => string }> = {
  waiting_confirmation: {
    title: "Order received",
    body: (ref) => `Order ${ref} has reached the kitchen. We will confirm it shortly.`,
  },
  confirmed: {
    title: "Order confirmed",
    body: (ref) => `Good news — the kitchen confirmed order ${ref}.`,
  },
  processing: {
    title: "Preparation started",
    body: (ref) => `Our chefs have started preparing order ${ref}.`,
  },
  packing: {
    title: "Order is being packed",
    body: (ref) => `Order ${ref} is being packed and checked.`,
  },
  ready_for_collection: {
    title: "Ready for collection",
    body: (ref) => `Order ${ref} is ready. Please collect it at the counter.`,
  },
  out_for_delivery: {
    title: "Out for delivery",
    body: (ref) => `Order ${ref} is on the way. Track your rider live in the app.`,
  },
  delivered: {
    title: "Delivered",
    body: (ref) => `Order ${ref} has been delivered. Enjoy your meal!`,
  },
  completed: {
    title: "Order completed",
    body: (ref) => `Order ${ref} is complete. Thank you for ordering with Jamaa.`,
  },
  cancelled: {
    title: "Order cancelled",
    body: (ref) => `Order ${ref} was cancelled. Contact us if you need help.`,
  },
};

export interface TransitionOptions {
  actor: { id: number | null; name: string; role: Role | "system" };
  note?: string | null;
  skipValidation?: boolean;
}

export function transitionOrder(orderId: number, to: OrderStatus, options: TransitionOptions): Order {
  const row = findOrderRowById(orderId);
  if (!row) throw new ApiError(404, "Order not found.");
  if (row.status === to) return assembleOrder(row);

  if (!options.skipValidation && !isStatusAllowed(row.order_type, row.status, to)) {
    throw new ApiError(
      409,
      `An order that is "${row.status.replace(/_/g, " ")}" cannot move to "${to.replace(/_/g, " ")}".`,
      { allowed: allowedNextStatuses(row.order_type, row.status) },
    );
  }

  const timestamp = nowIso();
  const completedAt = to === "completed" ? timestamp : row.completed_at;
  const confirmedAt = to === "confirmed" ? timestamp : row.confirmed_at;

  run(
    `UPDATE orders SET status = ?, updated_at = ?, completed_at = ?, confirmed_at = ?,
      cancelled_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_reason END
     WHERE id = ?`,
    [to, timestamp, completedAt, confirmedAt, to, options.note ?? null, orderId],
  );

  run(
    `INSERT INTO order_events (order_id, status, note, actor_id, actor_name, actor_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderId, to, options.note ?? null, options.actor.id, options.actor.name, options.actor.role, timestamp],
  );

  const notification = STATUS_NOTIFICATIONS[to];
  notifyUser(row.customer_id, orderId, `order.${to}`, notification.title, notification.body(row.reference));

  const updated = assembleOrder(findOrderRowById(orderId)!);
  emitToOrder(orderId, "order:updated", { order: updated });
  emitToRole("staff", "order:updated", { order: updated });
  emitToRole("admin", "order:updated", { order: updated });
  if (row.driver_id) emitToUser(row.driver_id, "order:updated", { order: updated });
  return updated;
}

export interface CreateOrderInput {
  customerId: number;
  orderType: OrderType;
  quote: Quote;
  notes?: string | null;
  dineInNote?: string | null;
  scheduledFor?: string | null;
  delivery?: {
    address: string;
    instructions: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    source: "gps" | "map" | "manual" | null;
    confirmed: boolean;
  } | null;
  payment: { reference: string; method: string; amount: number; idempotencyKey: string; payload?: unknown };
}

export function createOrder(input: CreateOrderInput): Order {
  const reference = nextOrderReference();
  const receiptNumber = nextReceiptNumber();
  const timestamp = nowIso();
  const delivery = input.delivery;

  const result = run(
    `INSERT INTO orders (
      reference, receipt_number, customer_id, order_type, status, payment_status,
      subtotal, delivery_fee, total, amount_paid, notes, dine_in_note, scheduled_for,
      address, address_instructions, lat, lng, geo_accuracy, geo_source, location_confirmed,
      eta_minutes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'waiting_confirmation', 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reference,
      receiptNumber,
      input.customerId,
      input.orderType,
      input.quote.subtotal,
      input.quote.deliveryFee,
      input.quote.total,
      input.payment.amount,
      input.notes ?? null,
      input.dineInNote ?? null,
      input.scheduledFor ?? null,
      delivery?.address ?? null,
      delivery?.instructions ?? null,
      delivery?.lat ?? null,
      delivery?.lng ?? null,
      delivery?.accuracy ?? null,
      delivery?.source ?? null,
      delivery && delivery.confirmed ? 1 : 0,
      input.quote.etaMinutes,
      timestamp,
      timestamp,
    ],
  );

  const orderId = Number(result.lastInsertRowid);

  for (const line of input.quote.lines) {
    run(
      `INSERT INTO order_items (order_id, menu_item_id, name, image, quantity, unit_price, addons_json, instructions, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        line.itemId,
        line.name,
        line.image,
        line.quantity,
        line.unitPrice - line.addons.reduce((sum, addon) => sum + addon.price, 0),
        JSON.stringify(line.addons),
        line.instructions,
        line.lineTotal,
      ],
    );
    run("UPDATE menu_items SET sold_count = sold_count + ? WHERE id = ?", [line.quantity, line.itemId]);
  }

  run(
    `INSERT INTO payments (order_id, reference, method, amount, status, idempotency_key, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'paid', ?, ?, ?)`,
    [
      orderId,
      input.payment.reference,
      input.payment.method,
      input.payment.amount,
      input.payment.idempotencyKey,
      JSON.stringify(input.payment.payload ?? {}),
      timestamp,
    ],
  );

  run(
    `INSERT INTO order_events (order_id, status, note, actor_id, actor_name, actor_role, created_at)
     VALUES (?, 'waiting_confirmation', 'Order placed and paid with demo payment', ?, ?, 'customer', ?)`,
    [orderId, input.customerId, "Customer", timestamp],
  );

  const order = assembleOrder(findOrderRowById(orderId)!);
  notifyUser(
    input.customerId,
    orderId,
    "order.received",
    "Order received",
    `We received order ${reference}. The kitchen will confirm it shortly.`,
  );
  notifyStaff(
    orderId,
    "order.new",
    "New order received",
    `${reference} · ${input.orderType.replace("_", "-")} · ${RESTAURANT.name}`,
  );
  emitToOrder(orderId, "order:created", { order });
  return order;
}

export function getOrderTimeline(order: Order) {
  return order.events;
}

export function assignDriver(orderId: number, driverId: number, actor: SessionUser): Order {
  const driver = get<{ id: number; role: string; full_name: string; is_active: number }>(
    "SELECT id, role, full_name, is_active FROM users WHERE id = ?",
    [driverId],
  );
  if (!driver || driver.role !== "driver" || !driver.is_active) {
    throw new ApiError(400, "Choose an active delivery person.");
  }
  const row = findOrderRowById(orderId);
  if (!row) throw new ApiError(404, "Order not found.");
  if (row.order_type !== "delivery") throw new ApiError(400, "Only delivery orders can be assigned to a rider.");
  if (row.status === "cancelled" || row.status === "completed") {
    throw new ApiError(409, "This order is already closed.");
  }

  run("UPDATE orders SET driver_id = ?, updated_at = ? WHERE id = ?", [driverId, nowIso(), orderId]);
  run(
    `INSERT INTO order_events (order_id, status, note, actor_id, actor_name, actor_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderId, row.status, `Assigned to ${driver.full_name}`, actor.id, actor.fullName, actor.role, nowIso()],
  );
  notifyUser(driverId, orderId, "driver.assigned", "New delivery assigned", `Order ${row.reference} is assigned to you.`);
  notifyUser(
    row.customer_id,
    orderId,
    "order.driver_assigned",
    "Rider assigned",
    `${driver.full_name} will deliver order ${row.reference}.`,
  );

  const updated = assembleOrder(findOrderRowById(orderId)!);
  emitToOrder(orderId, "order:updated", { order: updated });
  emitToRole("staff", "order:updated", { order: updated });
  emitToUser(driverId, "order:assigned", { order: updated });
  return updated;
}
