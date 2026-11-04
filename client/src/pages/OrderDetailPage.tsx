import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Bike,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  MapPin,
  Printer,
  ReceiptText,
  RefreshCw,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import {
  ORDER_TYPE_LABELS,
  STATUS_LABELS,
  formatDateTime,
  formatTZS,
  type Order,
} from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderProgress, OrderTimeline } from "@/components/OrderTimeline";
import { MapView } from "@/components/MapView";
import { LoadingPanel } from "@/components/Feedback";
import { getSocket } from "@/lib/socket";

export function OrderDetailPage() {
  const { reference = "" } = useParams();
  const [params] = useSearchParams();
  const { push } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const printFrame = useRef<HTMLIFrameElement | null>(null);
  const [paperSize, setPaperSize] = useState<58 | 80>(80);
  const isNew = params.get("new") === "1";

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await api.order(reference);
      setOrder(response.order);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load this order.");
    } finally {
      setLoading(false);
    }
  }, [reference]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("order:subscribe", { reference });
    const onUpdate = (payload: { order: Order }) => {
      if (payload.order.reference === reference) {
        setOrder(payload.order);
        push({ tone: "info", title: "Order updated", description: STATUS_LABELS[payload.order.status] });
      }
    };
    const onPoint = (point: { lat: number; lng: number }) => {
      setPoints((current) => [...current.slice(-199), { lat: point.lat, lng: point.lng }]);
    };
    socket.on("order:updated", onUpdate);
    socket.on("tracking:point", onPoint);
    return () => {
      socket.off("order:updated", onUpdate);
      socket.off("tracking:point", onPoint);
    };
  }, [reference, push]);

  useEffect(() => {
    if (order?.tracking?.lastPoint) {
      setPoints((current) => (current.length ? current : [order.tracking!.lastPoint!]));
    }
  }, [order?.tracking?.lastPoint]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      push({ tone: "success", title: `${label} copied` });
    } catch {
      push({ tone: "error", title: "Could not copy", description: value });
    }
  };

  const printReceipt = () => {
    const frame = printFrame.current;
    if (!frame) return;
    frame.src = `/api/orders/${encodeURIComponent(reference)}/receipt.pdf?width=${paperSize}`;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(`/api/orders/${encodeURIComponent(reference)}/receipt.pdf`, "_blank", "noopener");
      }
    };
  };

  if (loading) return <div className="container py-10"><LoadingPanel label="Fetching your order" /></div>;

  if (error || !order) {
    return (
      <div className="container py-14">
        <div className="mx-auto max-w-md rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-soft">
          <ReceiptText className="mx-auto h-10 w-10 text-ink-300" />
          <h1 className="mt-4 text-xl font-bold text-ink-900">Order not available</h1>
          <p className="mt-1 text-sm text-ink-500">{error ?? "We could not find that reference."}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={() => void load()} className="btn-ghost">
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
            <Link to="/my-orders" className="btn-primary">
              My orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const receiptUrl = `/api/orders/${encodeURIComponent(order.reference)}/receipt.pdf?width=${paperSize}`;
  const TypeIcon = order.orderType === "delivery" ? Bike : order.orderType === "takeaway" ? Store : UtensilsCrossed;

  return (
    <div className="container py-6 sm:py-10">
      {isNew ? (
        <div className="mb-5 flex flex-col items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-900">Payment approved in demo mode — your order is in.</p>
            <p className="text-xs text-emerald-700">
              The kitchen has been notified. Nothing was charged to a real account. Save your reference{" "}
              <strong>{order.reference}</strong>.
            </p>
          </div>
          {order.orderType === "delivery" ? (
            <Link to={`/track/${order.reference}`} className="btn bg-emerald-600 text-white hover:bg-emerald-700">
              Track delivery
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Order {order.reference}</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink-900 sm:text-3xl">Order details</h1>
          <p className="mt-1 text-xs text-ink-500">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <span className="chip border-ink-200 bg-white text-ink-600">
            <TypeIcon className="h-3.5 w-3.5" /> {ORDER_TYPE_LABELS[order.orderType]}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          <section className="card p-5">
            <OrderProgress order={order} />
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-ink-900">Items</h2>
              <span className="text-xs text-ink-400">{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</span>
            </div>
            <ul className="mt-4 divide-y divide-ink-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-ink-800">{item.name}</p>
                      <p className="text-sm font-bold text-ink-800">{formatTZS(item.lineTotal)}</p>
                    </div>
                    <p className="text-xs text-ink-500">
                      {item.quantity} × {formatTZS(item.unitPrice)}
                    </p>
                    {item.addons.length ? <p className="text-[11px] text-ink-500">+ {item.addons.map((a) => `${a.name} (${formatTZS(a.price)})`).join(", ")}</p> : null}
                    {item.instructions ? <p className="text-[11px] italic text-ink-400">“{item.instructions}”</p> : null}
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between text-ink-500">
                <dt>Subtotal</dt>
                <dd className="font-semibold text-ink-700">{formatTZS(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-500">
                <dt>Delivery fee</dt>
                <dd className="font-semibold text-ink-700">{order.deliveryFee > 0 ? formatTZS(order.deliveryFee) : "Free"}</dd>
              </div>
              <div className="flex justify-between border-t border-dashed border-ink-200 pt-2 text-base">
                <dt className="font-bold text-ink-900">Total</dt>
                <dd className="font-extrabold text-brand-700">{formatTZS(order.total)}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-bold text-ink-900">Status history</h2>
            <p className="mt-1 text-xs text-ink-500">Every change records the person and time behind it.</p>
            <div className="mt-4">
              <OrderTimeline order={order} />
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card overflow-hidden">
            <div className="bg-ink-800 p-5 text-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Receipt number</p>
                  <p className="mt-0.5 font-mono text-sm font-bold">{order.receiptNumber}</p>
                </div>
                <button type="button" onClick={() => void copy(order.receiptNumber, "Receipt number")} className="rounded-full bg-white/10 p-1.5 text-white/70 hover:bg-white/20" aria-label="Copy receipt number">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-xs text-white/60">Paid (demo)</span>
                <span className="text-2xl font-extrabold">{formatTZS(order.amountPaid)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300">{order.paymentStatus}</span>
                {order.payment ? <span className="font-mono text-[10px] text-white/50">{order.payment.reference}</span> : null}
              </div>
            </div>
            <div className="grid gap-2 p-4">
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-ink-50 px-3 py-2 text-xs">
                <span className="font-semibold text-ink-600">Paper size</span>
                <div className="inline-flex rounded-full border border-ink-200 bg-white p-0.5">
                  {([80, 58] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setPaperSize(size)}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        paperSize === size ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-800"
                      }`}
                    >
                      {size}mm
                    </button>
                  ))}
                </div>
              </div>
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="btn-primary">
                <ExternalLink className="h-4 w-4" /> View receipt
              </a>
              <a href={`${receiptUrl}&download=1`} download className="btn-ghost">
                <Download className="h-4 w-4" /> Download PDF
              </a>
              <button type="button" onClick={printReceipt} className="btn-ghost">
                <Printer className="h-4 w-4" /> Print receipt
              </button>
              <iframe ref={printFrame} title="Receipt print frame" className="hidden" />
            </div>
          </section>

          {order.orderType === "delivery" && order.delivery ? (
            <section className="card overflow-hidden">
              <div className="p-5 pb-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
                  <MapPin className="h-4 w-4 text-brand-600" /> Delivery details
                </h2>
              </div>
              <MapView
                center={{ lat: order.delivery.lat ?? -6.7924, lng: order.delivery.lng ?? 39.2083 }}
                zoom={15}
                className="h-48 w-full rounded-none border-x-0 border-b-0"
                destination={order.delivery.lat !== null && order.delivery.lng !== null ? { lat: order.delivery.lat, lng: order.delivery.lng } : null}
                rider={points.length ? points[points.length - 1] : null}
                path={points}
                fitToContent
                ariaLabel="Delivery location and rider position"
              />
              <div className="space-y-2 p-5 text-xs">
                <p className="font-semibold text-ink-700">{order.delivery.address}</p>
                {order.delivery.instructions ? <p className="text-ink-500">{order.delivery.instructions}</p> : null}
                <p className="text-ink-400">
                  Pin source: {order.delivery.source ?? "map"} · {order.delivery.lat?.toFixed(5)}, {order.delivery.lng?.toFixed(5)}
                </p>
                {order.driver ? (
                  <p className="rounded-xl bg-ink-50 px-3 py-2 text-ink-600">
                    Rider: <strong>{order.driver.fullName}</strong> · {order.driver.phone}
                    {order.driver.vehicle ? ` · ${order.driver.vehicle}` : ""}
                  </p>
                ) : (
                  <p className="rounded-xl bg-gold-50 px-3 py-2 text-gold-700">A rider will be assigned before dispatch.</p>
                )}
                {order.status === "out_for_delivery" || order.status === "delivered" || order.status === "completed" ? (
                  <Link to={`/track/${order.reference}`} className="btn-primary btn-sm w-full">
                    <Bike className="h-3.5 w-3.5" /> Open live tracking
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          {order.orderType === "takeaway" ? (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
                <Store className="h-4 w-4 text-brand-600" /> Collection
              </h2>
              <p className="mt-2 text-sm text-ink-600">
                {order.scheduledFor ? `Scheduled for ${formatDateTime(order.scheduledFor)}` : "As soon as it is ready — we will notify you."}
              </p>
              <p className="mt-1 text-xs text-ink-400">Samora Machel Avenue, City Centre. Bring your order reference.</p>
            </section>
          ) : null}

          {order.orderType === "dine_in" ? (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
                <UtensilsCrossed className="h-4 w-4 text-brand-600" /> Dine-in
              </h2>
              <p className="mt-2 text-sm text-ink-600">{order.dineInNote || "Eat in at our Samora Machel Avenue kitchen."}</p>
              <p className="mt-1 text-xs text-ink-400">No table booking required — show your reference to the team.</p>
            </section>
          ) : null}

          {order.notes ? (
            <section className="card p-5">
              <h2 className="text-base font-bold text-ink-900">Kitchen notes</h2>
              <p className="mt-1 text-sm text-ink-600">{order.notes}</p>
            </section>
          ) : null}

          <Link to="/my-orders" className="btn-soft w-full">
            View all my orders
          </Link>
        </div>
      </div>
    </div>
  );
}
