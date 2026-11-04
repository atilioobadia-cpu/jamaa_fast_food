import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Phone,
  RadioTower,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatDateTime, formatTZS, STATUS_LABELS, type Order } from "@shared/types";
import { RESTAURANT } from "@shared/config";
import { api, ApiError } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { MapView } from "@/components/MapView";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderProgress } from "@/components/OrderTimeline";
import { EmptyState, LoadingPanel } from "@/components/Feedback";

interface TrackPoint {
  lat: number;
  lng: number;
  source: string;
  recorded_at?: string;
  recordedAt?: string;
  distanceRemainingMeters?: number | null;
  etaMinutes?: number | null;
}

export function TrackPage() {
  const { reference } = useParams();
  if (reference) return <TrackOrder reference={reference.toUpperCase()} />;
  return <TrackLanding />;
}

function TrackLanding() {
  const { user } = useAuth();
  const [reference, setReference] = useState("");
  const [recent, setRecent] = useState<Order[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    api
      .myOrders()
      .then((response) => setRecent(response.orders.slice(0, 4)))
      .catch(() => setRecent([]));
  }, [user]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = reference.trim().toUpperCase();
    if (trimmed) navigate(`/track/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="container max-w-3xl py-10 sm:py-16">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-50 text-brand-700">
          <RadioTower className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-3xl font-extrabold text-ink-900 sm:text-4xl">Track your order</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-500">
          Enter the reference from your receipt to follow the kitchen status and, for deliveries, the rider's live
          position on the map.
        </p>
      </div>

      <form onSubmit={submit} className="card mx-auto mt-7 flex flex-col gap-2 p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="JFF-261104-0001"
            aria-label="Order reference"
            className="field pl-10 uppercase"
          />
        </div>
        <button type="submit" className="btn-primary">
          Track order
        </button>
      </form>

      {!user ? (
        <p className="mt-4 text-center text-xs text-ink-500">
          Tracking is private to your account.{" "}
          <Link to={`/login?next=${encodeURIComponent("/track")}`} className="link">
            Sign in
          </Link>{" "}
          to see your orders.
        </p>
      ) : recent.length ? (
        <div className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">Recent orders</h2>
          <ul className="mt-3 space-y-2">
            {recent.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/track/${order.reference}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 shadow-soft transition hover:border-brand-200"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-800">{order.reference}</p>
                    <p className="text-xs text-ink-500">
                      {formatDateTime(order.createdAt)} · {formatTZS(order.total)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            icon={<Bike className="h-6 w-6" />}
            title="No orders to track yet"
            description="Place an order and it will appear here with live status updates."
            action={
              <Link to="/menu" className="btn-primary">
                Browse the menu
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}

function TrackOrder({ reference }: { reference: string }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [connected, setConnected] = useState(false);
  const subscription = useRef(reference);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await api.tracking(reference);
      setOrder(response.order);
      setPoints(
        response.points.map((point) => ({
          lat: point.lat,
          lng: point.lng,
          source: point.source,
          recorded_at: point.recorded_at,
        })),
      );
      setAuthRequired(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setAuthRequired(true);
      } else {
        setError(caught instanceof ApiError ? caught.message : "Could not load tracking for this order.");
      }
    } finally {
      setLoading(false);
    }
  }, [reference]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setAuthRequired(true);
      return;
    }
    void load();
  }, [load, user]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    socket.emit("order:subscribe", { reference: subscription.current });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    setConnected(socket.connected);

    const onUpdate = (payload: { order: Order }) => {
      if (payload.order.reference !== reference) return;
      setOrder(payload.order);
      push({ tone: "info", title: "Order updated", description: STATUS_LABELS[payload.order.status] });
    };
    const onPoint = (point: TrackPoint) => {
      setPoints((current) => [...current.slice(-299), point]);
    };
    const onEnded = () => {
      setPoints((current) => current);
      void load();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("order:updated", onUpdate);
    socket.on("tracking:point", onPoint);
    socket.on("tracking:ended", onEnded);
    socket.on("tracking:started", onEnded);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("order:updated", onUpdate);
      socket.off("tracking:point", onPoint);
      socket.off("tracking:ended", onEnded);
      socket.off("tracking:started", onEnded);
    };
  }, [reference, user, push, load]);

  const latest = points.length ? points[points.length - 1] : null;
  const simulated = latest?.source === "simulator" || points.some((point) => point.source === "simulator");
  const isFinished = order ? ["delivered", "completed", "cancelled"].includes(order.status) : false;

  const remaining = useMemo(() => {
    if (latest?.distanceRemainingMeters !== undefined && latest?.distanceRemainingMeters !== null) {
      return latest.distanceRemainingMeters;
    }
    if (order?.tracking?.distanceRemainingMeters !== undefined) return order.tracking.distanceRemainingMeters;
    return null;
  }, [latest, order]);

  if (loading) return <div className="container py-10"><LoadingPanel label="Loading live tracking" /></div>;

  if (authRequired) {
    return (
      <div className="container py-14">
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Sign in to track this order"
          description="Order tracking is private. Sign in with the account that placed the order."
          action={
            <Link to={`/login?next=${encodeURIComponent(`/track/${reference}`)}`} className="btn-primary">
              Sign in to continue
            </Link>
          }
        />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container py-14">
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title="Tracking unavailable"
          description={error ?? "We could not find an order with that reference on your account."}
          action={
            <Link to="/track" className="btn-ghost">
              Try another reference
            </Link>
          }
        />
      </div>
    );
  }

  const destination =
    order.delivery && order.delivery.lat !== null && order.delivery.lng !== null
      ? { lat: order.delivery.lat, lng: order.delivery.lng }
      : null;

  return (
    <div className="container py-6 sm:py-10">
      <Link to="/track" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
        <ArrowLeft className="h-3.5 w-3.5" /> All tracking
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{reference}</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink-900 sm:text-3xl">
            {isFinished ? (order.status === "cancelled" ? "Order cancelled" : "Delivered — enjoy your meal") : STATUS_LABELS[order.status]}
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            {order.orderType === "delivery" ? "Delivery to " : "Collection from "}
            {order.orderType === "delivery" ? order.delivery?.address ?? "your address" : RESTAURANT.shortAddress} ·{" "}
            {formatTZS(order.total)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <span className={`chip ${connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-ink-200 bg-white text-ink-500"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-ink-300"}`} />
            {connected ? "Live" : "Reconnecting"}
          </span>
        </div>
      </div>

      {simulated ? (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-gold-300 bg-gold-50 px-4 py-3 text-xs text-gold-800">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Demo driver simulator is running.</strong> These positions are generated by the Jamaa demo
            simulator, not a real rider's phone. Real deliveries stream genuine GPS points over the same connection.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <MapView
              center={
                latest
                  ? { lat: latest.lat, lng: latest.lng }
                  : destination ?? RESTAURANT.coords
              }
              zoom={14}
              className="h-72 w-full rounded-none border-0 sm:h-96"
              restaurant={RESTAURANT.coords}
              destination={destination}
              rider={latest ? { lat: latest.lat, lng: latest.lng } : null}
              path={points}
              fitToContent={!latest}
              ariaLabel="Live delivery map"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <Bike className="h-3.5 w-3.5 text-emerald-600" /> Rider
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-brand-600" /> Your drop-off
              </span>
              <span className="text-ink-400">{points.length} position{points.length === 1 ? "" : "s"} recorded</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Distance remaining</p>
              <p className="mt-1 text-xl font-extrabold text-ink-900">
                {remaining === null ? "—" : remaining < 1000 ? `${remaining} m` : `${(remaining / 1000).toFixed(1)} km`}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Rider ETA</p>
              <p className="mt-1 text-xl font-extrabold text-ink-900">
                {latest?.etaMinutes ?? order.tracking?.etaMinutes ?? order.etaMinutes ?? "—"}
                <span className="ml-1 text-xs font-semibold text-ink-400">min</span>
              </p>
            </div>
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Last update</p>
              <p className="mt-1 text-sm font-bold text-ink-800">
                {latest?.recordedAt || latest?.recorded_at
                  ? new Date((latest.recordedAt ?? latest.recorded_at)!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                  : "Waiting for the rider"}
              </p>
            </div>
          </div>

          <div className="card p-5">
            <OrderProgress order={order} />
          </div>
        </div>

        <div className="space-y-4">
          {order.driver ? (
            <section className="card p-5">
              <h2 className="text-base font-bold text-ink-900">Your rider</h2>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: order.driver.avatarColor }}>
                  {order.driver.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-800">{order.driver.fullName}</p>
                  <p className="text-xs text-ink-500">{order.driver.vehicle ?? "Delivery rider"}</p>
                </div>
              </div>
              <a href={`tel:${order.driver.phone}`} className="btn-ghost btn-sm mt-4 w-full">
                <Phone className="h-3.5 w-3.5" /> Call rider
              </a>
            </section>
          ) : null}

          {destination ? (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
                <MapPin className="h-4 w-4 text-brand-600" /> Drop-off
              </h2>
              <p className="mt-2 text-sm font-semibold text-ink-700">{order.delivery?.address}</p>
              {order.delivery?.instructions ? <p className="mt-1 text-xs text-ink-500">{order.delivery.instructions}</p> : null}
              <a
                href={`https://www.openstreetmap.org/?mlat=${destination.lat}&mlon=${destination.lng}#map=17/${destination.lat}/${destination.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700"
              >
                <Navigation className="h-3.5 w-3.5" /> Open saved coordinates
              </a>
            </section>
          ) : null}

          <section className="card p-5">
            <h2 className="text-base font-bold text-ink-900">Timeline</h2>
            <ul className="mt-3 space-y-2 text-xs">
              {[...order.events].reverse().map((event) => (
                <li key={event.id} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-ink-700">{STATUS_LABELS[event.status]}</p>
                    <p className="text-ink-400">
                      {new Date(event.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {event.actorName}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
              <Clock className="h-4 w-4 text-gold-600" /> Need help?
            </h2>
            <p className="mt-1 text-xs text-ink-500">Call the kitchen on {RESTAURANT.phone} and quote {order.reference}.</p>
            <Link to={`/order/${order.reference}`} className="btn-soft btn-sm mt-3 w-full">
              View full receipt
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
