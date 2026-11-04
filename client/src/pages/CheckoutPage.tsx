import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bike,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  Loader2,
  LocateFixed,
  Lock,
  MapPin,
  Minus,
  Plus,
  ReceiptText,
  ShieldCheck,
  Store,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { formatTZS, type OrderType, type Quote } from "@shared/types";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { usePublicData } from "@/context/PublicDataContext";
import { useToast } from "@/context/ToastContext";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { MapView } from "@/components/MapView";
import { EmptyState } from "@/components/Feedback";

const ORDER_TYPES: Array<{ id: OrderType; label: string; hint: string; icon: typeof Bike }> = [
  { id: "delivery", label: "Delivery", hint: "To your door", icon: Bike },
  { id: "takeaway", label: "Takeaway", hint: "Collect at the counter", icon: Store },
  { id: "dine_in", label: "Dine-in", hint: "Eat with us", icon: UtensilsCrossed },
];

interface Coords {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: "gps" | "map" | "manual";
}

function formatAccuracy(meters: number | null): string {
  if (meters === null) return "accuracy unknown";
  if (meters < 1000) return `±${Math.round(meters)} m`;
  return `±${(meters / 1000).toFixed(1)} km`;
}

export function CheckoutPage() {
  const { lines, subtotal, setQuantity, remove, toInput, clear } = useCart();
  const { user } = useAuth();
  const { config } = usePublicData();
  const { push } = useToast();
  const navigate = useNavigate();
  const idempotencyKey = useRef(newIdempotencyKey());

  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "ok" | "denied" | "unavailable">("idle");
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: -6.7924, lng: 39.2083 });

  const [collectionChoice, setCollectionChoice] = useState("asap");
  const [customTime, setCustomTime] = useState("");
  const [dineInNote, setDineInNote] = useState("");
  const [notes, setNotes] = useState("");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);

  const [amount, setAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payErrorDetail, setPayErrorDetail] = useState<{ reason?: string; required?: number } | null>(null);

  const linesInput = toInput();
  const cartSignature = useMemo(() => JSON.stringify(linesInput), [linesInput]);

  const deliveryFee = orderType === "delivery" ? (quote?.deliveryFee ?? 0) : 0;
  const total = quote?.total ?? subtotal + (orderType === "delivery" ? (config?.delivery.baseFee ?? 0) : 0);
  const eta = quote?.etaMinutes ?? 30;

  // Server re-prices every line; this is the single source of truth for the amount due.
  useEffect(() => {
    if (!cartSignature || orderType === "delivery" && !coords) {
      if (orderType === "delivery" && !coords) setQuote(null);
      return;
    }
    let active = true;
    setQuoteLoading(true);
    setQuoteError(null);
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.quote({
          lines: JSON.parse(cartSignature),
          orderType,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        });
        if (active) setQuote(response.quote);
      } catch (error) {
        if (active) setQuoteError(error instanceof ApiError ? error.message : "Could not calculate your total.");
      } finally {
        if (active) setQuoteLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cartSignature, orderType, coords?.lat, coords?.lng]);

  useEffect(() => {
    if (quote) setAmount(String(quote.total));
  }, [quote?.total]);

  const applyCoords = useCallback((next: Coords) => {
    setCoords(next);
    setLocationConfirmed(false);
    setMapCenter({ lat: next.lat, lng: next.lng });
  }, []);

  const useCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      setGpsState("unavailable");
      setGpsMessage("This browser cannot read GPS. Drop the pin on the map instead.");
      return;
    }
    setGpsState("locating");
    setGpsMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = position.coords.accuracy ?? null;
        applyCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy,
          source: "gps",
        });
        setGpsState("ok");
        setGpsMessage(
          accuracy && accuracy > 500
            ? `Signal is weak (${formatAccuracy(accuracy)}). Drag the pin to correct it before confirming.`
            : `Location captured (${formatAccuracy(accuracy)}). Adjust the pin if needed, then confirm.`,
        );
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGpsState("denied");
          setGpsMessage("Location permission was declined. Tap the map to place your drop-off pin manually.");
        } else {
          setGpsState("unavailable");
          setGpsMessage("We could not get a GPS fix. Tap the map to place your drop-off pin manually.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 },
    );
  };

  const nudge = (dLat: number, dLng: number) => {
    if (!coords) return;
    applyCoords({ ...coords, lat: Number((coords.lat + dLat).toFixed(6)), lng: Number((coords.lng + dLng).toFixed(6)), source: "manual", accuracy: null });
  };

  const marker = useMemo(
    () => (coords ? { lat: coords.lat, lng: coords.lng, label: "Drop-off", draggable: true, tone: "brand" as const } : null),
    [coords],
  );

  const resolveScheduledFor = (): string | null => {
    if (orderType !== "takeaway") return null;
    if (collectionChoice === "asap") return null;
    if (collectionChoice === "custom") {
      if (!customTime) return null;
      return new Date(customTime).toISOString();
    }
    const minutes = Number(collectionChoice);
    if (!Number.isFinite(minutes)) return null;
    return new Date(Date.now() + minutes * 60_000).toISOString();
  };

  const scheduledLabel = (() => {
    if (orderType !== "takeaway") return null;
    if (collectionChoice === "asap") return `Ready in about ${eta} minutes`;
    if (collectionChoice === "custom") {
      if (!customTime) return "Choose a time";
      return new Date(customTime).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
    }
    return new Date(Date.now() + Number(collectionChoice) * 60_000).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  })();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPayError(null);
    setPayErrorDetail(null);

    if (orderType === "delivery") {
      if (!coords) {
        setPayError("Place your delivery pin on the map, or use your current location.");
        return;
      }
      if (!locationConfirmed) {
        setPayError("Confirm the delivery pin before paying.");
        return;
      }
      if (address.trim().length < 6) {
        setPayError("Add a readable delivery address so the rider can find you.");
        return;
      }
    }

    const entered = Number(amount);
    if (!Number.isFinite(entered) || entered <= 0) {
      setPayError("Enter the amount to pay in Tanzanian Shillings.");
      return;
    }

    setPaying(true);
    try {
      const response = await api.pay({
        lines: linesInput,
        orderType,
        notes: notes.trim() || undefined,
        dineInNote: orderType === "dine_in" ? dineInNote.trim() || undefined : undefined,
        scheduledFor: resolveScheduledFor(),
        delivery:
          orderType === "delivery" && coords
            ? {
                address: address.trim(),
                instructions: instructions.trim(),
                lat: coords.lat,
                lng: coords.lng,
                accuracy: coords.accuracy,
                source: coords.source,
                confirmed: true,
              }
            : null,
        paymentMethod: "demo",
        amountEntered: entered,
        idempotencyKey: idempotencyKey.current,
      });

      clear();
      idempotencyKey.current = newIdempotencyKey();
      push({ tone: "success", title: "Payment approved (demo)", description: `Order ${response.order.reference} is with the kitchen.` });
      navigate(`/order/${response.order.reference}?new=1`, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setPayError(caught.message);
        const details = caught.details as { reason?: string; required?: number } | undefined;
        if (details?.reason) setPayErrorDetail(details);
        push({ tone: "error", title: "Payment not completed", description: caught.message });
      } else {
        setPayError("We could not complete the payment. Please try again.");
      }
    } finally {
      setPaying(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="container py-14">
        <EmptyState
          icon={<ReceiptText className="h-6 w-6" />}
          title="Your cart is empty"
          description="Add a few meals from the menu and your checkout will appear here."
          action={
            <Link to="/menu" className="btn-primary">
              Browse the menu
            </Link>
          }
        />
      </div>
    );
  }

  const amountDelta = quote ? Number(amount) - quote.total : 0;

  return (
    <div className="container py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/menu" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to menu
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold text-ink-900 sm:text-4xl">Checkout</h1>
          <p className="mt-1 text-sm text-ink-500">
            Signed in as <span className="font-semibold text-ink-700">{user?.fullName}</span> · {user?.phone}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-gold-200 bg-gold-50 px-3 py-2 text-[11px] font-semibold text-gold-700">
          <ShieldCheck className="h-4 w-4" /> Demo payment mode
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {/* Order type */}
          <section className="card p-5">
            <h2 className="text-lg font-bold text-ink-900">How would you like your order?</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {ORDER_TYPES.map((type) => {
                const active = orderType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setOrderType(type.id);
                      setPayError(null);
                    }}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      active ? "border-brand-600 bg-brand-50 shadow-soft" : "border-ink-200 bg-white hover:border-ink-300"
                    }`}
                    aria-pressed={active}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-brand-600 text-white" : "bg-ink-50 text-ink-500"}`}>
                      <type.icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className={`block text-sm font-bold ${active ? "text-brand-700" : "text-ink-800"}`}>{type.label}</span>
                      <span className="block text-[11px] text-ink-500">{type.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Delivery location */}
          {orderType === "delivery" ? (
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
                    <MapPin className="h-5 w-5 text-brand-600" /> Delivery location
                  </h2>
                  <p className="mt-1 text-xs text-ink-500">
                    We save the exact pin with your order so the rider can navigate to you.
                  </p>
                </div>
                <button type="button" onClick={useCurrentLocation} className="btn-ghost btn-sm" disabled={gpsState === "locating"}>
                  {gpsState === "locating" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                  {gpsState === "locating" ? "Finding you…" : "Use my location"}
                </button>
              </div>

              {gpsMessage ? (
                <div
                  className={`mx-5 mb-3 flex items-start gap-2 rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${
                    gpsState === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {gpsState === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{gpsMessage}</span>
                </div>
              ) : null}

              <MapView
                center={mapCenter}
                zoom={15}
                className="h-64 w-full sm:h-72"
                marker={marker}
                restaurant={config ? config.restaurant.coords : null}
                onPick={(point) => applyCoords({ lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)), accuracy: null, source: "map" })}
                onMarkerDragEnd={(point) =>
                  applyCoords({ lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)), accuracy: null, source: "manual" })
                }
                ariaLabel="Choose your delivery location"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3 text-[11px] text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <Crosshair className="h-3.5 w-3.5 text-brand-600" />
                  {coords ? (
                    <>
                      Pin: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} · {formatAccuracy(coords.accuracy)} ·{" "}
                      <span className="font-semibold uppercase tracking-wide">{coords.source}</span>
                    </>
                  ) : (
                    "Tap the map to place your pin"
                  )}
                </span>
                <span className="flex items-center gap-1">
                  Nudge:
                  {[
                    { label: "↑", dLat: 0.0003, dLng: 0, name: "north" },
                    { label: "↓", dLat: -0.0003, dLng: 0, name: "south" },
                    { label: "←", dLat: 0, dLng: -0.0003, name: "west" },
                    { label: "→", dLat: 0, dLng: 0.0003, name: "east" },
                  ].map((button) => (
                    <button
                      key={button.name}
                      type="button"
                      onClick={() => nudge(button.dLat, button.dLng)}
                      disabled={!coords}
                      className="h-6 w-6 rounded-md border border-ink-200 bg-white text-xs font-bold text-ink-600 disabled:opacity-40"
                      aria-label={`Move pin ${button.name}`}
                    >
                      {button.label}
                    </button>
                  ))}
                </span>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <label htmlFor="address" className="label">
                    Delivery address
                  </label>
                  <input
                    id="address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    required
                    maxLength={300}
                    placeholder="e.g. Mikocheni B, Mwai Kibaki Road, plot 24, blue gate"
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="instructions" className="label">
                    Landmark or rider instructions <span className="font-normal normal-case tracking-normal text-ink-400">(optional)</span>
                  </label>
                  <input
                    id="instructions"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    maxLength={300}
                    placeholder="e.g. Call when you reach the gate"
                    className="field"
                  />
                </div>

                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-xs transition ${
                    locationConfirmed ? "border-emerald-300 bg-emerald-50" : "border-ink-200 bg-white"
                  } ${!coords ? "opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={locationConfirmed}
                    onChange={(event) => setLocationConfirmed(event.target.checked)}
                    disabled={!coords}
                    required
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-ink-700">
                    I confirm the pin marks my delivery location.{" "}
                    <span className="text-ink-400">The rider will navigate to these exact coordinates.</span>
                  </span>
                </label>
              </div>
            </section>
          ) : null}

          {/* Takeaway */}
          {orderType === "takeaway" ? (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
                <Clock className="h-5 w-5 text-brand-600" /> Collection time
              </h2>
              <p className="mt-1 text-xs text-ink-500">Order ahead and collect at Samora Machel Ave. We hold takeaway orders for 30 minutes.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  { value: "asap", label: `As soon as possible`, hint: `About ${eta} minutes` },
                  { value: "30", label: "In 30 minutes", hint: "Kitchen schedule" },
                  { value: "60", label: "In 1 hour", hint: "Kitchen schedule" },
                  { value: "120", label: "In 2 hours", hint: "Kitchen schedule" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCollectionChoice(option.value)}
                    className={`rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                      collectionChoice === option.value ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:border-ink-300"
                    }`}
                  >
                    <span className="block font-semibold text-ink-800">{option.label}</span>
                    <span className="block text-[11px] text-ink-500">{option.hint}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCollectionChoice("custom")}
                  className={`rounded-2xl border px-3 py-2.5 text-left text-sm transition sm:col-span-2 ${
                    collectionChoice === "custom" ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:border-ink-300"
                  }`}
                >
                  <span className="block font-semibold text-ink-800">Choose a specific time</span>
                  <span className="block text-[11px] text-ink-500">Up to 4 hours ahead</span>
                </button>
              </div>
              {collectionChoice === "custom" ? (
                <div className="mt-3">
                  <label htmlFor="custom-time" className="label">
                    Collection date and time
                  </label>
                  <input
                    id="custom-time"
                    type="datetime-local"
                    value={customTime}
                    min={new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 16)}
                    max={new Date(Date.now() + 4 * 60 * 60_000).toISOString().slice(0, 16)}
                    onChange={(event) => setCustomTime(event.target.value)}
                    className="field"
                  />
                </div>
              ) : null}
              {scheduledLabel ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1 text-[11px] font-semibold text-ink-600">
                  <Clock className="h-3 w-3" /> {scheduledLabel}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Dine-in */}
          {orderType === "dine_in" ? (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
                <UtensilsCrossed className="h-5 w-5 text-brand-600" /> Dine-in details
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                No table booking is needed. Tell us anything that helps the team prepare — party size, arrival time or
                seating preference — and we will have your order ready.
              </p>
              <div className="mt-4">
                <label htmlFor="dine-note" className="label">
                  Dine-in note
                </label>
                <textarea
                  id="dine-note"
                  value={dineInNote}
                  onChange={(event) => setDineInNote(event.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="e.g. 4 guests arriving around 19:30, prefer a quiet corner"
                  className="field resize-none"
                />
              </div>
            </section>
          ) : null}

          {/* Notes */}
          <section className="card p-5">
            <label htmlFor="order-notes" className="label">
              Notes for the kitchen <span className="font-normal normal-case tracking-normal text-ink-400">(optional)</span>
            </label>
            <textarea
              id="order-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Allergies, spice level, cutlery…"
              className="field resize-none"
            />
          </section>

          {/* Payment */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between bg-gold-400 px-5 py-2.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-900">DEMO MODE</p>
              <p className="text-[11px] font-semibold text-ink-900/80">No real money will be transferred.</p>
            </div>
            <div className="p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
                <Wallet className="h-5 w-5 text-brand-600" /> Pay for your order
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                This prototype simulates a mobile-money payment. The amount must match the server-calculated total
                exactly; nothing is charged to a real account.
              </p>

              <div className="mt-4 rounded-2xl border border-ink-200 bg-ink-50/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-500">Amount due</span>
                  <span className="text-xl font-extrabold text-ink-900">{formatTZS(total)}</span>
                </div>
                {quoteLoading ? <p className="mt-1 text-[11px] text-ink-400">Recalculating on the server…</p> : null}
                {quoteError ? <p className="mt-1 text-[11px] text-brand-700">{quoteError}</p> : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label htmlFor="amount" className="label">
                    Amount to pay (TZS)
                  </label>
                  <input
                    id="amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="numeric"
                    required
                    className="field text-lg font-bold"
                  />
                  {quote && Number(amount) !== quote.total ? (
                    <p className={`mt-1.5 text-[11px] font-semibold ${amountDelta > 0 ? "text-amber-700" : "text-brand-700"}`}>
                      {amountDelta > 0
                        ? `That is ${formatTZS(amountDelta)} more than the total. The demo provider only accepts the exact amount.`
                        : `That is ${formatTZS(Math.abs(amountDelta))} short of the total.`}
                    </p>
                  ) : null}
                </div>
                <button type="button" onClick={() => quote && setAmount(String(quote.total))} className="btn-ghost btn-sm whitespace-nowrap">
                  Use exact total
                </button>
              </div>

              {payError ? (
                <div role="alert" className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs font-medium text-brand-700">
                  {payError}
                  {payErrorDetail?.required ? (
                    <span className="mt-1 block">Required amount: {formatTZS(payErrorDetail.required)}</span>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-[11px] text-ink-400">
                <Lock className="h-3.5 w-3.5" /> Payment method: <span className="font-semibold text-ink-600">Demo Payment</span> · idempotency
                protected
              </div>
            </div>
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <h2 className="text-base font-bold text-ink-900">Order summary</h2>
              <button type="button" onClick={() => setSummaryOpen((open) => !open)} className="text-ink-400 lg:hidden" aria-label="Toggle summary">
                {summaryOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>

            <div className={`${summaryOpen ? "block" : "hidden"} lg:block`}>
              <ul className="max-h-72 space-y-3 overflow-y-auto px-5 py-4">
                {(quote?.lines ?? []).length
                  ? quote!.lines.map((line) => (
                      <li key={`${line.itemId}-${line.addons.map((a) => a.id).join("-")}-${line.instructions}`} className="flex gap-3">
                        <img src={line.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-ink-800">
                              {line.quantity} × {line.name}
                            </p>
                            <p className="text-xs font-bold text-ink-800">{formatTZS(line.lineTotal)}</p>
                          </div>
                          {line.addons.length ? <p className="text-[10px] text-ink-500">+ {line.addons.map((a) => a.name).join(", ")}</p> : null}
                          {line.instructions ? <p className="text-[10px] italic text-ink-400">“{line.instructions}”</p> : null}
                        </div>
                      </li>
                    ))
                  : lines.map((line) => (
                      <li key={line.key} className="flex gap-3">
                        <img src={line.snapshot.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-ink-800">
                            {line.quantity} × {line.snapshot.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setQuantity(line.key, line.quantity - 1)} className="rounded p-0.5 text-ink-400 hover:text-ink-700" aria-label="Decrease">
                            <Minus className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => setQuantity(line.key, line.quantity + 1)} className="rounded p-0.5 text-ink-400 hover:text-ink-700" aria-label="Increase">
                            <Plus className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => remove(line.key)} className="ml-1 text-[10px] font-semibold text-brand-600">
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
              </ul>

              <div className="space-y-1.5 border-t border-ink-100 px-5 py-4 text-sm">
                <div className="flex items-center justify-between text-ink-500">
                  <span>Subtotal</span>
                  <span className="font-semibold text-ink-700">{formatTZS(quote?.subtotal ?? subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-ink-500">
                  <span>{orderType === "delivery" ? "Delivery fee" : orderType === "takeaway" ? "Collection" : "Dine-in service"}</span>
                  <span className="font-semibold text-ink-700">{deliveryFee > 0 ? formatTZS(deliveryFee) : "Free"}</span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-ink-200 pt-2 text-base">
                  <span className="font-bold text-ink-900">Total</span>
                  <span className="font-extrabold text-brand-700">{formatTZS(total)}</span>
                </div>
                <p className="pt-1 text-[11px] text-ink-400">Estimated kitchen time: {eta} minutes. Prices include VAT.</p>
              </div>

              <div className="px-5 pb-5">
                <button type="submit" className="btn-primary w-full text-base" disabled={paying || quoteLoading || Boolean(quoteError)}>
                  {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {paying ? "Processing demo payment…" : `Pay ${formatTZS(total)}`}
                </button>
                <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-400">
                  <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                  By paying you acknowledge this is a demonstration. No card, mobile-money account or bank is charged.
                </p>
              </div>
            </div>
          </div>

          <Link to="/menu" className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
            Add more items <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </aside>
      </form>
    </div>
  );
}
