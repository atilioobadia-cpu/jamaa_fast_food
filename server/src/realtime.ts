import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import cookie from "cookie";
import { config } from "./config.js";
import { getUserFromToken } from "./auth.js";
import { bus } from "./lib/bus.js";
import { canUserViewOrder, getOrderByReference } from "./lib/orders.js";
import { isDemoRunning, recordDriverPoint, startDemoSimulation, stopDemoSimulation } from "./lib/tracking.js";
import type { Role, SessionUser } from "../../shared/types.js";

export let io: Server | null = null;

function socketUser(socket: { handshake: { headers: { cookie?: string } } }): SessionUser | null {
  const raw = socket.handshake.headers.cookie;
  if (!raw) return null;
  const parsed = cookie.parse(raw);
  return getUserFromToken(parsed[config.sessionCookie]);
}

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: true, credentials: true },
    path: "/socket.io",
  });

  io.use((socket, next) => {
    const user = socketUser(socket);
    if (!user) {
      next(new Error("unauthorized"));
      return;
    }
    socket.data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as SessionUser;
    const role = user.role as Role;
    socket.join(`user:${user.id}`);
    socket.join(`role:${role}`);

    socket.on("order:subscribe", (payload: { reference?: string }) => {
      try {
        if (!payload?.reference) return;
        const order = getOrderByReference(payload.reference);
        if (!canUserViewOrder(order, user)) return;
        socket.join(`order:${order.id}`);
        socket.emit("order:snapshot", { order });
      } catch {
        /* ignore unknown orders */
      }
    });

    socket.on("order:unsubscribe", (payload: { orderId?: number }) => {
      if (typeof payload?.orderId === "number") socket.leave(`order:${payload.orderId}`);
    });

    socket.on(
      "driver:location",
      (payload: { lat?: number; lng?: number; accuracy?: number | null }, ack?: (result: unknown) => void) => {
        if (role !== "driver") {
          ack?.({ ok: false, message: "Only delivery personnel can publish GPS positions." });
          return;
        }
        try {
          const point = recordDriverPoint(
            user.id,
            Number(payload?.lat),
            Number(payload?.lng),
            payload?.accuracy === undefined || payload?.accuracy === null ? null : Number(payload.accuracy),
            "gps",
          );
          ack?.({ ok: true, point });
        } catch (error) {
          ack?.({ ok: false, message: error instanceof Error ? error.message : "Could not save the position." });
        }
      },
    );

    socket.on("demo:status", (payload: { orderId?: number }, ack?: (result: unknown) => void) => {
      if (typeof payload?.orderId !== "number") return;
      ack?.({ running: isDemoRunning(payload.orderId) });
    });

    socket.on("demo:start", (payload: { orderId?: number }, ack?: (result: unknown) => void) => {
      if (role !== "staff" && role !== "admin") {
        ack?.({ ok: false, message: "Staff access required." });
        return;
      }
      try {
        if (typeof payload?.orderId !== "number") throw new Error("Missing order");
        startDemoSimulation(payload.orderId);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: error instanceof Error ? error.message : "Simulator could not start." });
      }
    });

    socket.on("demo:stop", (payload: { orderId?: number }, ack?: (result: unknown) => void) => {
      if (role !== "staff" && role !== "admin") {
        ack?.({ ok: false, message: "Staff access required." });
        return;
      }
      if (typeof payload?.orderId === "number") stopDemoSimulation(payload.orderId);
      ack?.({ ok: true });
    });

    socket.on("disconnect", () => {
      socket.leave(`user:${user.id}`);
    });
  });

  bus.on("order", ({ orderId, event, payload }: { orderId: number; event: string; payload: unknown }) => {
    io?.to(`order:${orderId}`).emit(event, payload);
  });
  bus.on("user", ({ userId, event, payload }: { userId: number; event: string; payload: unknown }) => {
    io?.to(`user:${userId}`).emit(event, payload);
  });
  bus.on("role", ({ role: target, event, payload }: { role: string; event: string; payload: unknown }) => {
    io?.to(`role:${target}`).emit(event, payload);
  });

  return io;
}
