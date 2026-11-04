import { all, get } from "../db.js";
import { config } from "../config.js";
import { ApiError } from "./errors.js";
import { RESTAURANT } from "../../../shared/config.js";
import {
  haversineMeters,
  type Addon,
  type CartLineInput,
  type OrderType,
  type Quote,
  type QuoteLine,
} from "../../../shared/types.js";

interface MenuRow {
  id: number;
  name: string;
  price: number;
  image: string;
  is_available: number;
  prep_minutes: number;
}

interface AddonRow {
  id: number;
  menu_item_id: number;
  name: string;
  price: number;
}

export const MAX_LINES = 30;
export const MAX_QUANTITY_PER_LINE = 20;

export function deliveryFeeFor(subtotal: number, distanceKm: number | null): number {
  const { baseFee, includedKm, perKmFee, maxFee, freeAbove } = config.delivery;
  if (subtotal >= freeAbove) return 0;
  if (distanceKm === null) return baseFee;
  const extraKm = Math.max(0, Math.ceil(distanceKm - includedKm));
  return Math.min(maxFee, baseFee + extraKm * perKmFee);
}

export function distanceFromRestaurant(coords?: { lat: number; lng: number } | null): number | null {
  if (!coords) return null;
  return haversineMeters(RESTAURANT.coords, coords) / 1000;
}

export function quoteOrder(
  lines: CartLineInput[],
  orderType: OrderType,
  coords?: { lat: number; lng: number } | null,
): Quote & { distanceKm: number | null } {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ApiError(400, "Your cart is empty. Add a meal before checking out.");
  }
  if (lines.length > MAX_LINES) {
    throw new ApiError(400, "That is a lot of different meals. Please contact the restaurant for large orders.");
  }

  const quoteLines: QuoteLine[] = [];
  let subtotal = 0;
  let longestPrep = 0;
  let totalQuantity = 0;

  for (const line of lines) {
    const itemId = Number(line.itemId);
    const quantity = Math.trunc(Number(line.quantity));
    if (!Number.isFinite(itemId) || !Number.isFinite(quantity)) {
      throw new ApiError(400, "One of the cart items is invalid.");
    }
    if (quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      throw new ApiError(400, `Quantity must be between 1 and ${MAX_QUANTITY_PER_LINE} per meal.`);
    }

    const item = get<MenuRow>(
      "SELECT id, name, price, image, is_available, prep_minutes FROM menu_items WHERE id = ?",
      [itemId],
    );
    if (!item) throw new ApiError(400, "A meal in your cart is no longer on the menu. Please refresh the menu.");
    if (!item.is_available) throw new ApiError(409, `${item.name} is sold out right now. Please remove it and try again.`);

    const requestedAddonIds = Array.isArray(line.addonIds) ? [...new Set(line.addonIds.map(Number))] : [];
    let addons: Addon[] = [];
    if (requestedAddonIds.length > 0) {
      const rows = all<AddonRow>(
        `SELECT id, menu_item_id, name, price FROM addons WHERE menu_item_id = ? AND id IN (${requestedAddonIds
          .map(() => "?")
          .join(",")})`,
        [itemId, ...requestedAddonIds],
      );
      if (rows.length !== requestedAddonIds.length) {
        throw new ApiError(400, `One of the extras selected for ${item.name} is not available.`);
      }
      addons = rows.map((row) => ({ id: row.id, name: row.name, price: row.price }));
      addons.sort((a, b) => a.id - b.id);
    }

    const addonTotal = addons.reduce((sum, addon) => sum + addon.price, 0);
    const unitPrice = item.price + addonTotal;
    const lineTotal = unitPrice * quantity;
    const instructions = typeof line.instructions === "string" ? line.instructions.trim().slice(0, 240) : "";

    subtotal += lineTotal;
    totalQuantity += quantity;
    longestPrep = Math.max(longestPrep, item.prep_minutes);
    quoteLines.push({
      itemId: item.id,
      name: item.name,
      image: item.image,
      unitPrice,
      quantity,
      addons,
      instructions,
      lineTotal,
    });
  }

  const distanceKm = orderType === "delivery" ? distanceFromRestaurant(coords) : null;
  if (orderType === "delivery" && distanceKm !== null && distanceKm > config.delivery.maxKm) {
    throw new ApiError(
      422,
      `That location is ${distanceKm.toFixed(1)} km away, outside our ${config.delivery.maxKm} km delivery radius.`,
    );
  }

  const deliveryFee = orderType === "delivery" ? deliveryFeeFor(subtotal, distanceKm) : 0;
  const total = subtotal + deliveryFee;
  const etaMinutes =
    orderType === "delivery"
      ? Math.max(20, Math.round(longestPrep + 8 + 3 * Math.min(totalQuantity, 12) + (distanceKm ?? 2) * 3))
      : Math.max(10, Math.round(longestPrep + 2 * Math.min(totalQuantity, 12)));

  return {
    lines: quoteLines,
    subtotal,
    deliveryFee,
    total,
    orderType,
    etaMinutes,
    distanceKm,
  };
}
