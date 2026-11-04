import crypto from "node:crypto";
import { get } from "../db.js";

/** Human friendly, unique order reference: JFF-260304-0123 */
export function nextOrderReference(): string {
  const row = get<{ next: number }>("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM orders");
  const next = row?.next ?? 1;
  const date = new Date();
  const stamp = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  return `JFF-${stamp}-${String(next).padStart(4, "0")}`;
}

/** Receipt numbers are sequential per calendar year: JFF/RC/2026/000123 */
export function nextReceiptNumber(): string {
  const row = get<{ next: number }>("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM orders");
  const next = row?.next ?? 1;
  return `JFF/RC/${new Date().getFullYear()}/${String(next).padStart(5, "0")}`;
}

export function transactionReference(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `TXN-${stamp}-${random}`;
}

export function trackingDemoId(): string {
  return `SIM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
