export type Role = "customer" | "staff" | "driver" | "admin";

export interface SessionUser {
  id: number;
  role: Role;
  fullName: string;
  email: string | null;
  phone: string;
  avatarColor: string;
}

export interface Addon {
  id: number;
  name: string;
  price: number;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  image: string;
  sortOrder: number;
}

export interface MenuItem {
  id: number;
  categoryId: number;
  categorySlug: string;
  name: string;
  description: string;
  price: number;
  image: string;
  isAvailable: boolean;
  isFeatured: boolean;
  badge: string | null;
  prepMinutes: number;
  tags: string[];
  addons: Addon[];
  soldCount: number;
}

export interface CartLineInput {
  itemId: number;
  quantity: number;
  addonIds: number[];
  instructions?: string;
}

export interface QuoteLine {
  itemId: number;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
  addons: Addon[];
  instructions: string;
  lineTotal: number;
}

export type OrderType = "delivery" | "takeaway" | "dine_in";

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  orderType: OrderType;
  etaMinutes: number;
}

export type OrderStatus =
  | "waiting_confirmation"
  | "confirmed"
  | "processing"
  | "packing"
  | "ready_for_collection"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export type PaymentStatus = "unpaid" | "paid" | "refunded" | "failed";

export interface OrderItem {
  id: number;
  menuItemId: number;
  name: string;
  image: string;
  quantity: number;
  unitPrice: number;
  addons: Addon[];
  instructions: string;
  lineTotal: number;
}

export interface OrderEvent {
  id: number;
  status: OrderStatus;
  note: string | null;
  actorName: string;
  actorRole: Role | "system";
  createdAt: string;
}

export interface Payment {
  reference: string;
  method: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
}

export interface DriverSummary {
  id: number;
  fullName: string;
  phone: string;
  vehicle: string | null;
  avatarColor: string;
}

export interface DeliveryLocation {
  address: string;
  instructions: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  source: "gps" | "map" | "manual" | null;
  confirmed: boolean;
}

export interface TrackingState {
  sessionId: number;
  active: boolean;
  demo: boolean;
  startedAt: string;
  endedAt: string | null;
  lastPoint: {
    lat: number;
    lng: number;
    accuracy: number | null;
    source: "gps" | "simulator";
    recordedAt: string;
  } | null;
  distanceRemainingMeters: number | null;
  etaMinutes: number | null;
}

export interface Order {
  id: number;
  reference: string;
  receiptNumber: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  orderType: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  amountPaid: number;
  scheduledFor: string | null;
  dineInNote: string | null;
  notes: string | null;
  delivery: DeliveryLocation | null;
  items: OrderItem[];
  events: OrderEvent[];
  payment: Payment | null;
  driver: DriverSummary | null;
  tracking: TrackingState | null;
  createdAt: string;
  updatedAt: string;
  etaMinutes: number | null;
}

export interface AppNotification {
  id: number;
  orderId: number | null;
  orderReference: string | null;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export const ORDER_STATUSES: OrderStatus[] = [
  "waiting_confirmation",
  "confirmed",
  "processing",
  "packing",
  "ready_for_collection",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  waiting_confirmation: "Waiting for Confirmation",
  confirmed: "Order Confirmed",
  processing: "Processing",
  packing: "Packing",
  ready_for_collection: "Ready for Collection",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<OrderStatus, "neutral" | "info" | "progress" | "warning" | "success" | "danger"> = {
  waiting_confirmation: "warning",
  confirmed: "info",
  processing: "progress",
  packing: "progress",
  ready_for_collection: "info",
  out_for_delivery: "progress",
  delivered: "success",
  completed: "success",
  cancelled: "danger",
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  delivery: "Delivery",
  takeaway: "Takeaway",
  dine_in: "Dine-in",
};

/** Status pipeline per order type. Cancelled is handled separately. */
export const ORDER_FLOWS: Record<OrderType, OrderStatus[]> = {
  delivery: ["waiting_confirmation", "confirmed", "processing", "packing", "out_for_delivery", "delivered", "completed"],
  takeaway: ["waiting_confirmation", "confirmed", "processing", "packing", "ready_for_collection", "completed"],
  dine_in: ["waiting_confirmation", "confirmed", "processing", "ready_for_collection", "completed"],
};

export function isTerminal(status: OrderStatus): boolean {
  return status === "completed" || status === "cancelled";
}

export function allowedNextStatuses(orderType: OrderType, status: OrderStatus): OrderStatus[] {
  if (isTerminal(status)) return [];
  const flow = ORDER_FLOWS[orderType];
  const index = flow.indexOf(status);
  const next: OrderStatus[] = [];
  if (index >= 0 && index < flow.length - 1) next.push(flow[index + 1]);
  next.push("cancelled");
  return next;
}

export function isStatusAllowed(orderType: OrderType, from: OrderStatus, to: OrderStatus): boolean {
  return allowedNextStatuses(orderType, from).includes(to);
}

export const PAYMENT_METHODS = [
  { id: "demo", label: "Demo Payment", description: "Simulated payment for demonstration purposes" },
] as const;

export const DELIVERY_FEE_MIN = 2500;

export function formatTZS(value: number): string {
  return `TZS ${new Intl.NumberFormat("en-TZ").format(Math.round(value))}`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
