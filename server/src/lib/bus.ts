import { EventEmitter } from "node:events";

/**
 * Internal event bus. Route handlers and domain services publish order events here and the
 * realtime layer (Socket.IO) forwards them to subscribers. This keeps business logic free of
 * transport details and makes it easy to add SMS/WhatsApp workers later.
 */
type OrderEvent = { orderId: number; event: string; payload: unknown };
type UserEvent = { userId: number; event: string; payload: unknown };
type RoleEvent = { role: string; event: string; payload: unknown };

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function emitToOrder(orderId: number, event: string, payload: unknown): void {
  bus.emit("order", { orderId, event, payload } satisfies OrderEvent);
}

export function emitToUser(userId: number, event: string, payload: unknown): void {
  bus.emit("user", { userId, event, payload } satisfies UserEvent);
}

export function emitToRole(role: string, event: string, payload: unknown): void {
  bus.emit("role", { role, event, payload } satisfies RoleEvent);
}
