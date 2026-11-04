import type {
  AppNotification,
  CartLineInput,
  Category,
  DriverSummary,
  MenuItem,
  Order,
  OrderStatus,
  OrderType,
  Quote,
  SessionUser,
} from "@shared/types";
import { RESTAURANT } from "@shared/config";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("We could not reach the Jamaa server. Check your connection and try again.", 0);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload.error === "string" && payload.error) ||
      (response.status === 401 ? "Please sign in to continue." : "Something went wrong. Please try again.");
    throw new ApiError(message, response.status, payload?.details);
  }

  return payload as T;
}

export interface AppConfig {
  restaurant: typeof RESTAURANT;
  demoMode: boolean;
  delivery: {
    baseFee: number;
    includedKm: number;
    perKmFee: number;
    maxFee: number;
    maxKm: number;
    freeAbove: number | null;
  };
  payments: Array<{ id: string; label: string; description: string }>;
}

export const api = {
  config: () => request<AppConfig>("/config"),
  menu: () => request<{ categories: Category[]; items: MenuItem[] }>("/menu"),

  me: () => request<{ user: SessionUser | null }>("/auth/me"),
  login: (identifier: string, password: string, portal: "customer" | "staff" | "driver") =>
    request<{ user: SessionUser }>("/auth/login", { method: "POST", body: { identifier, password, portal } }),
  register: (body: { fullName: string; phone: string; email?: string; password: string; passwordConfirm: string }) =>
    request<{ user: SessionUser }>("/auth/register", { method: "POST", body }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  updateProfile: (body: { fullName: string; phone: string; email?: string }) =>
    request<{ user: SessionUser }>("/auth/profile", { method: "PATCH", body }),
  changePassword: (body: { currentPassword: string; password: string; passwordConfirm: string }) =>
    request<{ ok: true }>("/auth/change-password", { method: "POST", body }),
  myOrders: () => request<{ orders: Order[] }>("/auth/orders"),
  forgotPassword: (identifier: string) =>
    request<{ message: string; demoResetToken?: string }>("/auth/forgot-password", { method: "POST", body: { identifier } }),
  resetPassword: (body: { token: string; password: string; passwordConfirm: string }) =>
    request<{ ok: true }>("/auth/reset-password", { method: "POST", body }),

  quote: (body: { lines: CartLineInput[]; orderType: OrderType; lat?: number | null; lng?: number | null }) =>
    request<{ quote: Quote }>("/checkout/quote", { method: "POST", body }),

  pay: (body: {
    lines: CartLineInput[];
    orderType: OrderType;
    notes?: string;
    dineInNote?: string;
    scheduledFor?: string | null;
    delivery?: {
      address: string;
      instructions?: string;
      lat: number;
      lng: number;
      accuracy?: number | null;
      source?: "gps" | "map" | "manual";
      confirmed: true;
    } | null;
    paymentMethod: string;
    amountEntered: number;
    idempotencyKey: string;
  }) => request<{ order: Order; receiptUrl: string; duplicate?: boolean }>("/checkout/pay", { method: "POST", body }),

  order: (reference: string) => request<{ order: Order }>(`/orders/${encodeURIComponent(reference)}`),
  tracking: (reference: string) =>
    request<{
      order: Order;
      restaurant: { lat: number; lng: number };
      destination: { lat: number; lng: number } | null;
      points: Array<{ lat: number; lng: number; source: string; recorded_at: string }>;
      demoMode: boolean;
      serverTime: string;
    }>(`/orders/${encodeURIComponent(reference)}/tracking`),

  notifications: () => request<{ notifications: AppNotification[]; unreadCount: number }>("/notifications"),
  markNotificationsRead: () => request<{ ok: true }>("/notifications/read-all", { method: "POST" }),
  markNotificationRead: (id: number) => request<{ ok: true }>(`/notifications/${id}/read`, { method: "POST" }),

  staff: {
    orders: (query: { status?: string; type?: string; date?: string; q?: string } = {}) => {
      const params = new URLSearchParams();
      if (query.status) params.set("status", query.status);
      if (query.type) params.set("type", query.type);
      if (query.date) params.set("date", query.date);
      if (query.q) params.set("q", query.q);
      const suffix = params.toString();
      return request<{ orders: Order[] }>(`/staff/orders${suffix ? `?${suffix}` : ""}`);
    },
    order: (reference: string) =>
      request<{ order: Order; points: Array<{ lat: number; lng: number; source: string; recorded_at: string }> }>(
        `/staff/orders/${encodeURIComponent(reference)}`,
      ),
    setStatus: (reference: string, status: OrderStatus, note?: string) =>
      request<{ order: Order }>(`/staff/orders/${encodeURIComponent(reference)}/status`, {
        method: "POST",
        body: { status, note: note ?? null },
      }),
    assign: (reference: string, driverId: number) =>
      request<{ order: Order }>(`/staff/orders/${encodeURIComponent(reference)}/assign`, {
        method: "POST",
        body: { driverId },
      }),
    drivers: () => request<{ drivers: Array<DriverSummary & { activeOrders: number }> }>("/staff/drivers"),
    stats: () =>
      request<{
        byStatus: Partial<Record<OrderStatus, number>>;
        todayOrders: number;
        todayRevenue: number;
        activeDeliveries: number;
        generatedAt: string;
      }>("/staff/stats"),
    demo: (reference: string, action: "start" | "stop") =>
      request<{ ok: true; order: Order }>(`/staff/orders/${encodeURIComponent(reference)}/tracking/demo`, {
        method: "POST",
        body: { action },
      }),
    menu: () => request<{ categories: Category[]; items: MenuItem[] }>("/staff/menu"),
    createItem: (body: Record<string, unknown>) =>
      request<{ items: MenuItem[] }>("/staff/menu/items", { method: "POST", body }),
    updateItem: (id: number, body: Record<string, unknown>) =>
      request<{ items: MenuItem[] }>(`/staff/menu/items/${id}`, { method: "PATCH", body }),
    deleteItem: (id: number) => request<{ items: MenuItem[] }>(`/staff/menu/items/${id}`, { method: "DELETE" }),
    images: () => request<{ images: string[] }>("/staff/images"),
  },

  driver: {
    orders: () => request<{ orders: Order[] }>("/driver/orders"),
    order: (reference: string) =>
      request<{ order: Order; points: Array<{ lat: number; lng: number; source: string; recorded_at: string }> }>(
        `/driver/orders/${encodeURIComponent(reference)}`,
      ),
    start: (reference: string) =>
      request<{ order: Order }>(`/driver/orders/${encodeURIComponent(reference)}/start`, { method: "POST", body: {} }),
    delivered: (reference: string, receivedBy?: string) =>
      request<{ order: Order }>(`/driver/orders/${encodeURIComponent(reference)}/delivered`, {
        method: "POST",
        body: { receivedBy },
      }),
    session: () =>
      request<{ session: { id: number; order_id: number; reference: string; status: string } | null }>("/driver/session"),
  },
};

export function newIdempotencyKey(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `pay_${random}`;
}
