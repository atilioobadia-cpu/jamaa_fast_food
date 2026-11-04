import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  RadioTower,
  ShieldCheck,
} from "lucide-react";
import {
  ORDER_TYPE_LABELS,
  STATUS_LABELS,
  formatDateTime,
  formatTZS,
  type Order,
} from "@shared/types";
import { RESTAURANT } from "@shared/config";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getSocket } from "@/lib/socket";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderProgress } from "@/components/OrderTimeline";
import { MapView } from "@/components/MapView";
import { EmptyState, LoadingPanel } from "@/components/Feedback";

export function DriverDashboardPage() {
  const { user } = useAuth();
  const { push } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ order: Order; points: Array<{ lat: number; lng: number; source: string; recorded_at: string }> } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lastPoint, setLastPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [delivering, setDelivering] = useState(false);
  const watchId = useRef<number | null>(null);
  const sharingRef = useRef(false);

  const loadOrders = useCallback(async () => {
    try {
      const response = await api.driver.orders();
      setOrders(response.orders);
    } catch (error) {
      push({ tone: "error", title: "Could not load deliveries", description: error instanceof ApiError ? error.message : undefined });
    }
  }, [push]);

  useEffect(() => {
    setLoading(true);
    void loadOrders().finally(() => setLoading(false));
  }, [loadOrders]);

  useEffect(() => {
    const socket = getSocket();
    const handler = () => void loadOrders();
    socket.on("order:updated", handler);
    socket.on("order:assigned", handler);
    return () => {
      socket.off("order:updated", handler);
      socket.off("order:assigned", handler);
    };
  }, [loadOrders]);

  useEffect(() => {
    if (!selectedRef) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api.driver
      .order(selectedRef)
      .then((response) => {
        setDetail(response);
        if (response.points.length) {
          const last = response.points[response.points.length - 1];
          setLastPoint({ lat: last.lat, lng: last.lng });
        }
      })
      .catch((error) => {
        push({ tone: "error", title: "Could not load delivery", description: error instanceof ApiError ? error.message : undefined });
        setSelectedRef(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedRef, push]);

  const startSharing = () => {
    if (!("geolocation" in navigator)) {
      setGpsError("This device cannot read GPS. Use a phone with location enabled.");
      return;
    }
    if (watchId.current !== null) return;
    sharingRef.current = true;
    setSharing(true);
    setGpsError(null);
    watchId.current = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const accuracy = position.coords.accuracy ?? null;
        setLastPoint({ lat, lng });
        try {
          await fetch("/api/driver/location", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng, accuracy }),
          });
        } catch {
          /* retry on next fix */
        }
      },
      (error) => {
        setGpsError(error.code === error.PERMISSION_DENIED ? "Location permission denied. Enable GPS in your browser settings." : "Could not read GPS.");
        stopSharing();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const stopSharing = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    sharingRef.current = false;
    setSharing(false);
  }, []);

  useEffect(() => {
    return () => stopSharing();
  }, [stopSharing]);

  const startDelivery = async () => {
    if (!detail) return;
    try {
      const response = await api.driver.start(detail.order.reference);
      setDetail({ ...detail, order: response.order });
      push({ tone: "success", title: "Delivery started", description: "Share your location so the customer can track you." });
      void loadOrders();
    } catch (error) {
      push({ tone: "error", title: "Could not start", description: error instanceof ApiError ? error.message : undefined });
    }
  };

  const confirmDelivery = async () => {
    if (!detail) return;
    setDelivering(true);
    try {
      const response = await api.driver.delivered(detail.order.reference, receivedBy.trim() || undefined);
      setDetail({ ...detail, order: response.order });
      stopSharing();
      push({ tone: "success", title: "Delivery confirmed", description: "Great work — order closed." });
      void loadOrders();
    } catch (error) {
      push({ tone: "error", title: "Could not confirm", description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setDelivering(false);
    }
  };

  const activeOrders = orders.filter((order) => ["confirmed", "processing", "packing", "out_for_delivery"].includes(order.status));
  const pastOrders = orders.filter((order) => ["delivered", "completed", "cancelled"].includes(order.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Rider portal</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink-900 sm:text-3xl">Your deliveries</h1>
          <p className="mt-1 text-sm text-ink-500">
            Signed in as {user?.fullName}. {activeOrders.length} active assignment{activeOrders.length === 1 ? "" : "s"}.
          </p>
        </div>
        {selectedRef ? (
          <button type="button" onClick={() => setSelectedRef(null)} className="btn-ghost btn-sm">
            Back to list
          </button>
        ) : null}
      </div>

      {loading ? (
        <LoadingPanel label="Loading assignments" />
      ) : selectedRef && detail ? (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-bold text-ink-800">{detail.order.reference}</p>
                  <p className="text-sm text-ink-500">{detail.order.customerName} · {detail.order.customerPhone}</p>
                </div>
                <StatusBadge status={detail.order.status} />
              </div>
              <div className="mt-3">
                <OrderProgress order={detail.order} />
              </div>
            </div>

            {detail.order.delivery ? (
              <div className="card overflow-hidden">
                <MapView
                  center={lastPoint ?? (detail.order.delivery.lat !== null && detail.order.delivery.lng !== null ? { lat: detail.order.delivery.lat, lng: detail.order.delivery.lng } : RESTAURANT.coords)}
                  zoom={14}
                  className="h-72 w-full rounded-none border-0 sm:h-96"
                  destination={detail.order.delivery.lat !== null && detail.order.delivery.lng !== null ? { lat: detail.order.delivery.lat, lng: detail.order.delivery.lng } : null}
                  rider={lastPoint}
                  path={detail.points.map((point) => ({ lat: point.lat, lng: point.lng }))}
                  fitToContent={!lastPoint}
                  ariaLabel="Delivery map"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Bike className="h-3.5 w-3.5 text-emerald-600" /> You
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-brand-600" /> Customer
                  </span>
                  {detail.order.delivery.lat !== null && detail.order.delivery.lng !== null ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${detail.order.delivery.lat}&mlon=${detail.order.delivery.lng}#map=17/${detail.order.delivery.lat}/${detail.order.delivery.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-brand-700"
                    >
                      <Navigation className="h-3.5 w-3.5" /> Navigate
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="card p-5">
              <h2 className="text-base font-bold text-ink-900">Customer</h2>
              <p className="mt-2 text-sm font-semibold text-ink-700">{detail.order.customerName}</p>
              <p className="text-xs text-ink-500">{detail.order.customerPhone}</p>
              {detail.order.delivery?.address ? (
                <p className="mt-2 text-xs text-ink-600">{detail.order.delivery.address}</p>
              ) : null}
              {detail.order.delivery?.instructions ? (
                <p className="text-[11px] italic text-ink-500">{detail.order.delivery.instructions}</p>
              ) : null}
              <a href={`tel:${detail.order.customerPhone}`} className="btn-ghost btn-sm mt-3 w-full">
                <Phone className="h-3.5 w-3.5" /> Call customer
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="text-base font-bold text-ink-900">Delivery actions</h2>
              <p className="mt-1 text-[11px] text-ink-500">Status flow: {ORDER_TYPE_LABELS[detail.order.orderType]}.</p>

              {detail.order.status === "packing" ? (
                <button type="button" onClick={() => void startDelivery()} className="btn-primary mt-3 w-full">
                  <Bike className="h-4 w-4" /> Start delivery
                </button>
              ) : null}

              {detail.order.status === "out_for_delivery" ? (
                <>
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800">GPS sharing</span>
                      <span className={`chip ${sharing ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-ink-200 bg-white text-ink-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sharing ? "animate-pulse bg-emerald-500" : "bg-ink-300"}`} />
                        {sharing ? "Live" : "Off"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-700">
                      {sharing
                        ? "Your position is streaming to the customer and the kitchen. Keep the screen awake."
                        : "Start sharing so the customer can follow you on the map."}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {!sharing ? (
                        <button type="button" onClick={startSharing} className="btn-gold btn-sm flex-1">
                          <RadioTower className="h-3.5 w-3.5" /> Start sharing
                        </button>
                      ) : (
                        <button type="button" onClick={stopSharing} className="btn-ghost btn-sm flex-1">
                          Stop sharing
                        </button>
                      )}
                    </div>
                    {gpsError ? <p className="mt-2 text-[11px] font-medium text-brand-700">{gpsError}</p> : null}
                    {lastPoint ? (
                      <p className="mt-2 font-mono text-[10px] text-emerald-700">
                        {lastPoint.lat.toFixed(5)}, {lastPoint.lng.toFixed(5)}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <label htmlFor="receivedBy" className="label">
                      Received by (optional)
                    </label>
                    <input
                      id="receivedBy"
                      value={receivedBy}
                      onChange={(event) => setReceivedBy(event.target.value)}
                      placeholder="Customer name at the door"
                      className="field text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void confirmDelivery()}
                    disabled={delivering}
                    className="btn bg-emerald-600 text-white hover:bg-emerald-700 mt-3 w-full"
                  >
                    {delivering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {delivering ? "Confirming…" : "Confirm delivery"}
                  </button>
                </>
              ) : null}

              {["delivered", "completed"].includes(detail.order.status) ? (
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Delivery complete. Great work.
                </div>
              ) : null}

              {detail.order.status === "cancelled" ? (
                <div className="mt-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs font-semibold text-brand-700">
                  This order was cancelled.
                </div>
              ) : null}
            </div>

            <div className="card p-5">
              <h2 className="text-base font-bold text-ink-900">Order summary</h2>
              <ul className="mt-3 space-y-1.5 text-xs">
                {detail.order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span className="text-ink-600">{item.quantity}× {item.name}</span>
                    <span className="font-bold text-ink-800">{formatTZS(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t border-ink-100 pt-2 text-sm">
                <div className="flex justify-between font-extrabold text-ink-900">
                  <span>Total</span>
                  <span>{formatTZS(detail.order.total)}</span>
                </div>
              </div>
              {detail.order.notes ? (
                <p className="mt-3 rounded-xl bg-gold-50 px-3 py-2 text-[11px] text-gold-800">
                  <span className="font-bold">Kitchen note:</span> {detail.order.notes}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : selectedRef && detailLoading ? (
        <LoadingPanel label="Loading delivery" />
      ) : (
        <>
          {activeOrders.length === 0 && pastOrders.length === 0 ? (
            <EmptyState
              icon={<Bike className="h-6 w-6" />}
              title="No deliveries assigned"
              description="When the kitchen assigns you an order it appears here."
            />
          ) : null}

          {activeOrders.length ? (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">Active</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {activeOrders.map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRef(order.reference)}
                      className="card w-full p-4 text-left transition hover:border-emerald-200 hover:shadow-lift"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs font-bold text-ink-800">{order.reference}</p>
                          <p className="mt-0.5 text-sm font-semibold text-ink-700">{order.customerName}</p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                      {order.delivery?.address ? (
                        <p className="mt-2 inline-flex items-start gap-1 text-[11px] text-ink-500">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {order.delivery.address}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-ink-400">{formatDateTime(order.createdAt)}</span>
                        <span className="font-bold text-ink-800">{formatTZS(order.total)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {pastOrders.length ? (
            <div className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">Past</h2>
              <ul className="mt-3 space-y-2">
                {pastOrders.map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRef(order.reference)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-left transition hover:border-ink-200"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-ink-800">{order.reference}</p>
                        <p className="text-[11px] text-ink-500">{formatDateTime(order.createdAt)}</p>
                      </div>
                      <StatusBadge status={order.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
