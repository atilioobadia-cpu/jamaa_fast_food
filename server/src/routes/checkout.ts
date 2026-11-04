import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { get, transaction } from "../db.js";
import { requireAuth } from "../auth.js";
import { ApiError } from "../lib/errors.js";
import { asyncHandler, parseBody } from "../lib/http.js";
import { createOrder, getOrderById } from "../lib/orders.js";
import { getPaymentProvider, listPaymentProviders } from "../lib/payments.js";
import { quoteOrder } from "../lib/pricing.js";
import { rateLimit } from "../lib/rateLimit.js";
import { RESTAURANT } from "../../../shared/config.js";

export const checkoutRouter = Router();

const lineSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(20),
  addonIds: z.array(z.coerce.number().int().positive()).max(12).optional().default([]),
  instructions: z.string().trim().max(240).optional().default(""),
});

const orderTypeSchema = z.enum(["delivery", "takeaway", "dine_in"]);

const quoteSchema = z.object({
  lines: z.array(lineSchema).min(1, "Your cart is empty").max(30),
  orderType: orderTypeSchema,
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

checkoutRouter.get(
  "/options",
  asyncHandler((_req, res) => {
    res.json({
      providers: listPaymentProviders(),
      demoMode: config.demoMode,
      delivery: config.delivery,
      restaurant: RESTAURANT,
    });
  }),
);

checkoutRouter.post(
  "/quote",
  asyncHandler((req, res) => {
    const data = parseBody(quoteSchema, req.body);
    const coords =
      typeof data.lat === "number" && typeof data.lng === "number" ? { lat: data.lat, lng: data.lng } : null;
    const quote = quoteOrder(data.lines, data.orderType, coords);
    res.json({ quote, deliveryFee: quote.deliveryFee });
  }),
);

const deliverySchema = z.object({
  address: z.string().trim().min(6, "Add a readable delivery address").max(300),
  instructions: z.string().trim().max(300).optional().default(""),
  lat: z.number().min(-90, "Confirm the delivery location on the map").max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().nullable().optional(),
  source: z.enum(["gps", "map", "manual"]).optional().default("map"),
  confirmed: z.literal(true, { message: "Confirm the delivery location before paying" }),
});

const paySchema = z.object({
  lines: z.array(lineSchema).min(1, "Your cart is empty").max(30),
  orderType: orderTypeSchema,
  notes: z.string().trim().max(500).optional().default(""),
  dineInNote: z.string().trim().max(300).optional().default(""),
  scheduledFor: z.string().datetime().nullable().optional(),
  delivery: deliverySchema.nullable().optional(),
  paymentMethod: z.string().default("demo"),
  amountEntered: z.coerce.number().nonnegative("Enter the amount to pay"),
  idempotencyKey: z.string().min(8, "Missing payment key").max(120),
});

checkoutRouter.post(
  "/pay",
  requireAuth,
  asyncHandler(async (req, res) => {
    rateLimit(req, "pay", 20, 5 * 60 * 1000);
    const data = parseBody(paySchema, req.body);
    const user = req.user!;

    if (user.role !== "customer") {
      throw new ApiError(403, "Only customer accounts can place orders.");
    }

    const existing = get<{ order_id: number }>("SELECT order_id FROM payments WHERE idempotency_key = ?", [
      data.idempotencyKey,
    ]);
    if (existing) {
      res.json({ order: getOrderById(existing.order_id), duplicate: true });
      return;
    }

    if (data.orderType === "delivery") {
      if (!data.delivery) throw new ApiError(422, "Enter and confirm your delivery location.");
      if (!data.delivery.confirmed) throw new ApiError(422, "Confirm the delivery location before paying.");
    }

    if (data.orderType === "takeaway" && data.scheduledFor) {
      const scheduled = new Date(data.scheduledFor).getTime();
      if (Number.isNaN(scheduled) || scheduled < Date.now() - 60 * 1000) {
        throw new ApiError(422, "Choose a collection time in the future.");
      }
      if (scheduled > Date.now() + 4 * 60 * 60 * 1000) {
        throw new ApiError(422, "Collection times can be booked up to 4 hours ahead.");
      }
    }

    const coords = data.delivery?.lat !== undefined ? { lat: data.delivery.lat, lng: data.delivery.lng } : null;
    const quote = quoteOrder(data.lines, data.orderType, coords);

    if (Math.abs(data.amountEntered - quote.total) > 0.001 && data.amountEntered < quote.total) {
      throw new ApiError(402, "Amount is less than the order total. Payment not completed.", {
        reason: "underpaid",
        required: quote.total,
        entered: data.amountEntered,
        shortfall: quote.total - data.amountEntered,
      });
    }

    const provider = getPaymentProvider(data.paymentMethod);
    const charge = await provider.charge({
      amountDue: quote.total,
      amountEntered: data.amountEntered,
      currency: "TZS",
      idempotencyKey: data.idempotencyKey,
      orderReference: "pending",
    });

    const order = transaction(() =>
      createOrder({
        customerId: user.id,
        orderType: data.orderType,
        quote,
        notes: data.notes || null,
        dineInNote: data.dineInNote || null,
        scheduledFor: data.orderType === "takeaway" ? data.scheduledFor ?? null : null,
        delivery:
          data.orderType === "delivery" && data.delivery
            ? {
                address: data.delivery.address,
                instructions: data.delivery.instructions ?? "",
                lat: data.delivery.lat,
                lng: data.delivery.lng,
                accuracy: data.delivery.accuracy ?? null,
                source: data.delivery.source ?? "map",
                confirmed: true,
              }
            : null,
        payment: {
          reference: charge.reference,
          method: charge.method,
          amount: charge.amount,
          idempotencyKey: data.idempotencyKey,
          payload: charge.payload,
        },
      }),
    );

    res.status(201).json({
      order,
      receiptUrl: `/api/orders/${order.reference}/receipt.pdf`,
    });
  }),
);
