import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bike, ClipboardList, MapPin, ReceiptText, Store, UtensilsCrossed } from "lucide-react";
import { formatDateTime, formatTZS, ORDER_TYPE_LABELS, type Order } from "@shared/types";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, LoadingPanel } from "@/components/Feedback";

type Filter = "active" | "past" | "all";

export function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("active");

  useEffect(() => {
    api
      .myOrders()
      .then((response) => setOrders(response.orders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    const activeStatuses = ["waiting_confirmation", "confirmed", "processing", "packing", "ready_for_collection", "out_for_delivery"];
    if (filter === "active") return orders.filter((order) => activeStatuses.includes(order.status));
    return orders.filter((order) => !activeStatuses.includes(order.status));
  }, [orders, filter]);

  return (
    <div className="container py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Your history</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink-900 sm:text-4xl">My orders</h1>
          <p className="mt-1 text-sm text-ink-500">Receipts, status history and live tracking for every order.</p>
        </div>
        <Link to="/menu" className="btn-primary btn-sm">Order again</Link>
      </div>

      <div className="mt-5 inline-flex rounded-full border border-ink-200 bg-white p-1 shadow-soft">
        {(["active", "past", "all"] as Filter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${
              filter === value ? "bg-brand-600 text-white" : "text-ink-500 hover:text-ink-800"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingPanel label="Loading your orders" />
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title={filter === "active" ? "No active orders" : "Nothing here yet"}
            description={
              filter === "active"
                ? "When you place an order it will appear here with live kitchen and rider updates."
                : "Completed and cancelled orders will show up here."
            }
            action={<Link to="/menu" className="btn-primary">Browse the menu</Link>}
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {filtered.map((order) => {
            const Icon = order.orderType === "delivery" ? Bike : order.orderType === "takeaway" ? Store : UtensilsCrossed;
            const active = ["out_for_delivery"].includes(order.status);
            return (
              <li key={order.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink-900">{order.reference}</p>
                      <p className="text-[11px] text-ink-500">
                        {ORDER_TYPE_LABELS[order.orderType]} · {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {order.items.slice(0, 3).map((item) => (
                    <span key={item.id} className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-600">
                      {item.quantity}× {item.name}
                    </span>
                  ))}
                  {order.items.length > 3 ? (
                    <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-400">
                      +{order.items.length - 3} more
                    </span>
                  ) : null}
                </div>

                {order.orderType === "delivery" && order.delivery?.address ? (
                  <p className="mt-2 inline-flex items-start gap-1 text-[11px] text-ink-500">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {order.delivery.address}
                  </p>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <p className="text-sm font-extrabold text-ink-900">{formatTZS(order.total)}</p>
                  <div className="flex items-center gap-2">
                    {order.orderType === "delivery" && (active || ["packing", "delivered", "completed"].includes(order.status)) ? (
                      <Link to={`/track/${order.reference}`} className="btn-ghost btn-sm">
                        <Bike className="h-3.5 w-3.5" /> Track
                      </Link>
                    ) : null}
                    <Link to={`/order/${order.reference}`} className="btn-soft btn-sm">
                      <ReceiptText className="h-3.5 w-3.5" /> Details
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
