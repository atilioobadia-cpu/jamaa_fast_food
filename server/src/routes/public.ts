import { Router } from "express";
import { RESTAURANT } from "../../../shared/config.js";
import { config } from "../config.js";
import { getCategories, getMenu } from "../lib/menu.js";
import { listPaymentProviders } from "../lib/payments.js";
import { asyncHandler } from "../lib/http.js";

export const publicRouter = Router();

publicRouter.get(
  "/menu",
  asyncHandler((_req, res) => {
    res.json({ categories: getCategories(), items: getMenu(false) });
  }),
);

publicRouter.get(
  "/config",
  asyncHandler((_req, res) => {
    res.json({
      restaurant: RESTAURANT,
      demoMode: config.demoMode,
      delivery: {
        baseFee: config.delivery.baseFee,
        includedKm: config.delivery.includedKm,
        perKmFee: config.delivery.perKmFee,
        maxFee: config.delivery.maxFee,
        maxKm: config.delivery.maxKm,
        freeAbove: config.delivery.freeAbove,
      },
      payments: listPaymentProviders(),
    });
  }),
);

publicRouter.get(
  "/health",
  asyncHandler((_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  }),
);
