import { ApiError } from "./errors.js";
import { transactionReference } from "./ids.js";

/**
 * Payment architecture
 * --------------------
 * Checkout only talks to a PaymentProvider. The demo provider below settles immediately.
 * Future providers (M-Pesa, Airtel Money, Mixx by Yas, cards) implement the same interface:
 *   - initiate()  -> returns instructions/response for the customer
 *   - charge()    -> verifies the transaction and returns a settled reference
 *   - handling of provider webhooks belongs in routes/webhooks.ts, never in the checkout route.
 * Amount validation always happens server-side against the re-priced order total.
 */
export interface ChargeRequest {
  amountDue: number;
  amountEntered: number;
  currency: "TZS";
  idempotencyKey: string;
  orderReference: string;
}

export interface ChargeResult {
  reference: string;
  method: string;
  provider: string;
  mode: "demo" | "live";
  amount: number;
  paidAt: string;
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  id: string;
  label: string;
  mode: "demo" | "live";
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

class DemoPaymentProvider implements PaymentProvider {
  id = "demo";
  label = "Demo Payment";
  mode = "demo" as const;

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const entered = Number(request.amountEntered);
    if (!Number.isFinite(entered) || entered <= 0) {
      throw new ApiError(400, "Enter the amount to pay in Tanzanian Shillings.");
    }
    if (!Number.isInteger(entered)) {
      throw new ApiError(400, "Demo payments accept whole shillings only.");
    }
    if (entered < request.amountDue) {
      throw new ApiError(402, "Amount is less than the order total. Payment not completed.", {
        reason: "underpaid",
        required: request.amountDue,
        entered,
        shortfall: request.amountDue - entered,
      });
    }
    if (entered > request.amountDue) {
      throw new ApiError(402, "Amount is higher than the order total. Please enter the exact amount.", {
        reason: "overpaid",
        required: request.amountDue,
        entered,
        excess: entered - request.amountDue,
      });
    }

    return {
      reference: transactionReference(),
      method: "Demo Payment",
      provider: "demo",
      mode: "demo",
      amount: entered,
      paidAt: new Date().toISOString(),
      payload: {
        demoMode: true,
        note: "DEMO MODE – no real money transferred.",
        amountDue: request.amountDue,
        amountEntered: entered,
        idempotencyKey: request.idempotencyKey,
      },
    };
  }
}

const providers: Record<string, PaymentProvider> = {
  demo: new DemoPaymentProvider(),
};

export function getPaymentProvider(id: string): PaymentProvider {
  const provider = providers[id];
  if (!provider) throw new ApiError(400, `Payment method "${id}" is not available.`);
  return provider;
}

export function listPaymentProviders() {
  return Object.values(providers).map((provider) => ({
    id: provider.id,
    label: provider.label,
    mode: provider.mode,
  }));
}
