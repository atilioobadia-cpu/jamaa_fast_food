import { all, get, nowIso, run } from "../db.js";
import { RESTAURANT } from "../../../shared/config.js";
import { haversineMeters, type OrderType } from "../../../shared/types.js";
import { emitToOrder, emitToRole, emitToUser } from "./bus.js";
import { ApiError } from "./errors.js";

interface SessionRow {
  id: number;
  order_id: number;
  driver_id: number;
  is_demo: number;
  started_at: string;
  ended_at: string | null;
}

const DEMO_TICK_MS = 3000;
const demoTimers = new Map<number, NodeJS.Timeout>();

function findOrderRow(orderId: number) {
  return get<{
    id: number;
    reference: string;
    status: string;
    order_type: OrderType;
    customer_id: number;
    lat: number | null;
    lng: number | null;
  }>("SELECT id, reference, status, order_type, customer_id, lat, lng FROM orders WHERE id = ?", [orderId]);
}

export function getActiveSessionForDriver(driverId: number): SessionRow | undefined {
  return get<SessionRow>(
    `SELECT s.* FROM tracking_sessions s JOIN orders o ON o.id = s.order_id
     WHERE s.driver_id = ? AND s.ended_at IS NULL AND o.status = 'out_for_delivery'
     ORDER BY s.id DESC LIMIT 1`,
    [driverId],
  );
}

export function getActiveSessionForOrder(orderId: number): SessionRow | undefined {
  return get<SessionRow>(
    "SELECT * FROM tracking_sessions WHERE order_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1",
    [orderId],
  );
}

export function ensureTrackingSession(orderId: number, driverId: number): SessionRow {
  const active = getActiveSessionForOrder(orderId);
  if (active) return active;
  const result = run(
    "INSERT INTO tracking_sessions (order_id, driver_id, is_demo, started_at) VALUES (?, ?, 0, ?)",
    [orderId, driverId, nowIso()],
  );
  return get<SessionRow>("SELECT * FROM tracking_sessions WHERE id = ?", [Number(result.lastInsertRowid)])!;
}

export function startTrackingSession(orderId: number, driverId: number): SessionRow {
  const order = findOrderRow(orderId);
  if (!order) throw new ApiError(404, "Order not found.");
  if (order.order_type !== "delivery") throw new ApiError(400, "Only delivery orders have a tracking session.");

  const existing = getActiveSessionForOrder(orderId);
  if (existing) {
    if (existing.driver_id !== driverId) {
      run("UPDATE tracking_sessions SET driver_id = ? WHERE id = ?", [driverId, existing.id]);
    }
    return { ...existing, driver_id: driverId };
  }

  const result = run(
    "INSERT INTO tracking_sessions (order_id, driver_id, is_demo, started_at) VALUES (?, ?, 0, ?)",
    [orderId, driverId, nowIso()],
  );
  const session = get<SessionRow>("SELECT * FROM tracking_sessions WHERE id = ?", [Number(result.lastInsertRowid)])!;

  run("UPDATE orders SET updated_at = ? WHERE id = ?", [nowIso(), orderId]);
  emitToOrder(orderId, "tracking:started", { orderId, sessionId: session.id, demo: false, startedAt: session.started_at });
  emitToRole("staff", "tracking:started", { orderId, sessionId: session.id });
  emitToUser(driverId, "tracking:started", { orderId, sessionId: session.id });
  return session;
}

export function endTrackingSession(orderId: number): void {
  stopDemoSimulation(orderId);
  const session = getActiveSessionForOrder(orderId);
  if (!session) return;
  const timestamp = nowIso();
  run("UPDATE tracking_sessions SET ended_at = ? WHERE id = ?", [timestamp, session.id]);
  emitToOrder(orderId, "tracking:ended", { orderId, sessionId: session.id, endedAt: timestamp });
  emitToRole("staff", "tracking:ended", { orderId, sessionId: session.id });
}

export interface PointBroadcast {
  orderId: number;
  sessionId: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  source: "gps" | "simulator";
  recordedAt: string;
  distanceRemainingMeters: number | null;
  etaMinutes: number | null;
}

function broadcastPoint(point: PointBroadcast): void {
  emitToOrder(point.orderId, "tracking:point", point);
  emitToRole("staff", "tracking:point", point);
}

export function storePoint(
  session: SessionRow,
  lat: number,
  lng: number,
  accuracy: number | null,
  source: "gps" | "simulator",
): PointBroadcast {
  const order = findOrderRow(session.order_id);
  if (!order) throw new ApiError(404, "Order not found.");
  const recordedAt = nowIso();
  run(
    "INSERT INTO tracking_points (session_id, lat, lng, accuracy, source, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
    [session.id, lat, lng, accuracy, source, recordedAt],
  );

  let distanceRemainingMeters: number | null = null;
  let etaMinutes: number | null = null;
  if (order.lat !== null && order.lng !== null) {
    distanceRemainingMeters = haversineMeters({ lat, lng }, { lat: order.lat, lng: order.lng });
    etaMinutes = Math.max(1, Math.round((distanceRemainingMeters / 1000 / 18) * 60));
  }

  const payload: PointBroadcast = {
    orderId: session.order_id,
    sessionId: session.id,
    lat,
    lng,
    accuracy,
    source,
    recordedAt,
    distanceRemainingMeters,
    etaMinutes,
  };
  broadcastPoint(payload);
  run("UPDATE orders SET updated_at = ? WHERE id = ?", [recordedAt, session.order_id]);
  return payload;
}

export function recordDriverPoint(
  driverId: number,
  lat: number,
  lng: number,
  accuracy: number | null,
  source: "gps" | "simulator" = "gps",
): PointBroadcast {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ApiError(400, "Invalid GPS coordinates.");
  }
  const session = getActiveSessionForDriver(driverId);
  if (!session) throw new ApiError(409, "No active delivery is in progress for this rider.");
  return storePoint(session, lat, lng, accuracy, source);
}

export function getSessionPoints(sessionId: number, limit = 240) {
  return all<{ lat: number; lng: number; source: string; recorded_at: string }>(
    "SELECT lat, lng, source, recorded_at FROM tracking_points WHERE session_id = ? ORDER BY id DESC LIMIT ?",
    [sessionId, limit],
  ).reverse();
}

export function stopDemoSimulation(orderId: number): void {
  const timer = demoTimers.get(orderId);
  if (timer) {
    clearInterval(timer);
    demoTimers.delete(orderId);
  }
}

export function isDemoRunning(orderId: number): boolean {
  return demoTimers.has(orderId);
}

/**
 * Drives the rider marker along a smooth sample route from the restaurant (or the rider's last
 * known position) to the saved destination. Every generated point is tagged `simulator` so the
 * interface can label it as demonstration data.
 */
export function startDemoSimulation(orderId: number): void {
  const order = findOrderRow(orderId);
  if (!order) throw new ApiError(404, "Order not found.");
  if (order.status !== "out_for_delivery") {
    throw new ApiError(409, "Start the delivery (Out for Delivery) before running the simulator.");
  }
  if (order.lat === null || order.lng === null) {
    throw new ApiError(409, "This order has no saved destination coordinates.");
  }
  const session = getActiveSessionForOrder(orderId);
  if (!session) throw new ApiError(409, "No active tracking session.");

  stopDemoSimulation(orderId);
  run("UPDATE tracking_sessions SET is_demo = 1 WHERE id = ?", [session.id]);

  const destination = { lat: order.lat, lng: order.lng };
  const last = get<{ lat: number; lng: number }>(
    "SELECT lat, lng FROM tracking_points WHERE session_id = ? ORDER BY id DESC LIMIT 1",
    [session.id],
  );
  const start = last ?? { lat: RESTAURANT.coords.lat + 0.008, lng: RESTAURANT.coords.lng - 0.008 };
  const distance = haversineMeters(start, destination);
  const steps = Math.min(70, Math.max(14, Math.round(distance / 70)));
  const latSpan = destination.lat - start.lat;
  const lngSpan = destination.lng - start.lng;
  const bend = 0.16;
  let step = 0;

  const timer = setInterval(() => {
    step += 1;
    const t = Math.min(1, step / steps);
    const curve = Math.sin(t * Math.PI) * bend;
    const lat = start.lat + latSpan * t + lngSpan * curve;
    const lng = start.lng + lngSpan * t - latSpan * curve;
    try {
      storePoint(session, lat, lng, 8, "simulator");
    } catch {
      stopDemoSimulation(orderId);
      return;
    }
    if (step >= steps) {
      stopDemoSimulation(orderId);
      emitToOrder(orderId, "tracking:simulator-complete", { orderId, sessionId: session.id });
      emitToRole("staff", "tracking:simulator-complete", { orderId, sessionId: session.id });
    }
  }, DEMO_TICK_MS);

  demoTimers.set(orderId, timer);
  emitToOrder(orderId, "tracking:simulator-started", { orderId, sessionId: session.id, demo: true });
  emitToRole("staff", "tracking:simulator-started", { orderId, sessionId: session.id, demo: true });
}
