import type { Request } from "express";
import { ApiError } from "./errors.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(req: Request, key: string, limit: number, windowMs: number): void {
  const identity = `${req.ip ?? "unknown"}:${key}`;
  const now = Date.now();
  const bucket = buckets.get(identity);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(identity, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new ApiError(429, `Too many attempts. Please try again in ${seconds} seconds.`);
  }
}
