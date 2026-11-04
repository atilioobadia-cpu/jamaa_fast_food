import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Bike,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import {
  ORDER_FLOWS,
  ORDER_TYPE_LABELS,
  STATUS_LABELS,
  allowedNextStatuses,
  formatDateTime,
  formatTZS,
  type Order,
  type OrderStatus,
} from "@shared/types";
import { RESTAURANT } from "@shared/config";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getSocket } from "@/lib/socket";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderTimeline, OrderProgress } from "@/components/OrderTimeline";
import { MapView } from "@/components/MapView";
import { Modal } from "@/components/Modal";
import { EmptyState, LoadingPanel } from "@/components/Feedback";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "waiting_confirmation", label: "Waiting" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "packing", label: "Packing" },
  { value: "ready_for_collection", label: "Ready for collection" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function StaffDashboardPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", type: "", date: "", q: "" });
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ order: Order; points: Array<{ lat: number; lng: number; source: string; recorded_at: string }> } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [drivers, setDrivers] = useState<Array<{ id: number; fullName: string; phone: string; vehicle: string | null; avatarColor: string; activeOrders: number }>>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [stats, setStats] = useState<{
    byStatus: Partial<Record<OrderStatus, number>>;
    todayOrders: number;
    todayRevenue: number;
    activeDeliveries: number;
  } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const response = await api.staff.orders(filters);
      setOrders(response.orders);
    } catch (error) {
      push({ tone: "error", title: "Could not load orders", description: error instanceof ApiError ? error.message : undefined });
    }
  }, [filters, push]);

  const loadStats = useCallback(async () => {
    try {
      const response = await api.staff.stats();
      setStats(response);
    } catch {
      /* non-critical */
    }
  }, []);

  const loadDrivers = useCallback(async () => {
    try {
      const response = await api.staff.drivers();
      setDrivers(response.drivers);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOrders(), loadStats(), loadDrivers()]).finally(() => setLoading(false));
  }, [loadOrders, loadStats, loadDrivers]);

  useEffect(() => {
    const socket = getSocket();
    const handler = () => {
      void loadOrders();
      void loadStats();
    };
    socket.on("order:created", handler);
    socket.on("order:updated", handler);
    socket.on("tracking:point", handler);
    return () => {
      socket.off("order:created", handler);
      socket.off("order:updated", handler);
      socket.off("tracking:point", handler);
    };
  }, [loadOrders, loadStats]);

  useEffect(() => {
    if (!selectedRef) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api.staff
      .order(selectedRef)
      .then((response) => setDetail(response))
      .catch((error) => {
        push({ tone: "error", title: "Could not load order", description: error instanceof ApiError ? error.message : undefined });
        setSelectedRef(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedRef, push]);

  const transition = async (status: OrderStatus) => {
    if (!detail) return;
    setTransitioning(true);
    try {
      const response = await api.staff.setStatus(detail.order.reference, status, note.trim() || undefined);
      setDetail({ ...detail, order: response.order });
      setNote("");
      push({ tone: "success", title: "Status updated", description: STATUS_LABELS[status] });
      void loadOrders();
      void loadStats();
    } catch (error) {
      push({ tone: "error", title: "Transition blocked", description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setTransitioning(false);
    }
  };

  const assign = async () => {
    if (!detail || !selectedDriver) return;
    try {
      const response = await api.staff.assign(detail.order.reference, selectedDriver);
      setDetail({ ...detail, order: response.order });
      setAssignOpen(false);
      push({ tone: "success", title: "Rider assigned", description: response.order.driver?.fullName });
      void loadOrders();
    } catch (error) {
      push({ tone: "error", title: "Assignment failed", description: error instanceof ApiError ? error.message : undefined });
    }
  };

  const toggleDemo = async (action: "start" | "stop") => {
    if (!detail) return;
    setDemoBusy(true);
    try {
      const response = await api.staff.demo(detail.order.reference, action);
      setDetail({ ...detail, order: response.order });
      push({ tone: "success", title: action === "start" ? "Demo simulator started" : "Demo simulator stopped" });
    } catch (error) {
      push({ tone: "error", title: "Simulator error", description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setDemoBusy(false);
    }
  };

  const nextStatuses = detail ? allowedNextStatuses(detail.order.orderType, detail.order.status) : [];

  const deliveryPoints = (detail?.points ?? []).map((point) => ({ lat: point.lat, lng: point.lng, source: point.source }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Operations</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink-900 sm:text-3xl">Order dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">
            Signed in as {user?.fullName}. {orders.length} order{orders.length === 1 ? "" : "s"} in view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void navigate("/staff/menu")} className="btn-ghost btn-sm">
            <Package className="h-3.5 w-3.5" /> Menu manager
          </button>
          <button type="button" onClick={() => void loadOrders()} className="btn-ghost btn-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Today's orders", value: stats?.todayOrders ?? "—", icon: ClipboardList, tone: "text-brand-700 bg-brand-50" },
          { label: "Today's revenue", value: stats ? formatTZS(stats.todayRevenue) : "—", icon: Activity, tone: "text-emerald-700 bg-emerald-50" },
          { label: "Active deliveries", value: stats?.activeDeliveries ?? "—", icon: Bike, tone: "text-gold-700 bg-gold-50" },
          { label: "Out for delivery", value: stats?.byStatus?.out_for_delivery ?? 0, icon: LayoutDashboard, tone: "text-ink-700 bg-ink-100" },
        ].map((card) => (
          <div key={card.label} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{card.label}</p>
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${card.tone}`}>
                <card.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold text-ink-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_160px_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={filters.q}
              onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
              placeholder="Reference, name or phone"
              className="field py-2.5 pl-9 text-sm"
            />
          </div>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="field py-2.5 text-sm"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
            className="field py-2.5 text-sm"
          >
            <option value="">All types</option>
            <option value="delivery">Delivery</option>
            <option value="takeaway">Takeaway</option>
            <option value="dine_in">Dine-in</option>
          </select>
          <input
            type="date"
            value={filters.date}
            onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
            className="field py-2.5 text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void loadOrders()} className="btn-primary btn-sm">
            Apply filters
          </button>
          <button
            type="button"
            onClick={() => {
              setFilters({ status: "", type: "", date: "", q: "" });
            }}
            className="btn-ghost btn-sm"
          >
            Clear
          </button>
          <span className="text-xs text-ink-400">{orders.length} result{orders.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {loading ? (
        <LoadingPanel label="Loading orders" />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No orders match these filters"
          description="Adjust the filters or clear them to see every order."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50/70 text-xs uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Reference</th>
                  <th className="px-4 py-3 font-bold">Customer</th>
                  <th className="px-4 py-3 font-bold">Type</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Total</th>
                  <th className="px-4 py-3 font-bold">Placed</th>
                  <th className="px-4 py-3 font-bold">Rider</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedRef(order.reference)}
                    className="cursor-pointer transition hover:bg-brand-50/40"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold text-ink-800">{order.reference}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-800">{order.customerName}</p>
                      <p className="text-[11px] text-ink-400">{order.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600">{ORDER_TYPE_LABELS[order.orderType]}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-ink-800">{formatTZS(order.total)}</td>
                    <td className="px-4 py-3 text-[11px] text-ink-500">{formatDateTime(order.createdAt)}</td>
                    <td className="px-4 py-3 text-[11px] text-ink-500">{order.driver?.fullName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={Boolean(selectedRef)}
        onClose={() => setSelectedRef(null)}
        title={detail?.order.reference ?? "Order details"}
        description={detail?.order.customerName ?? ""}
        size="xl"
        dismissible={!transitioning}
      >
        {detailLoading || !detail ? (
          <LoadingPanel label="Loading order" />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={detail.order.status} />
                <span className="chip border-ink-200 bg-white text-ink-600">{ORDER_TYPE_LABELS[detail.order.orderType]}</span>
                <span className="chip border-ink-200 bg-white text-ink-600">{formatTZS(detail.order.total)}</span>
              </div>

              <OrderProgress order={detail.order} />

              <div>
                <h3 className="text-sm font-bold text-ink-800">Items</h3>
                <ul className="mt-2 space-y-2">
                  {detail.order.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-ink-50/60 px-3 py-2 text-xs">
                      <span className="font-semibold text-ink-700">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="font-bold text-ink-800">{formatTZS(item.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {detail.order.orderType === "delivery" && detail.order.delivery ? (
                <div>
                  <h3 className="text-sm font-bold text-ink-800">Delivery location</h3>
                  <MapView
                    center={
                      detail.order.delivery.lat !== null && detail.order.delivery.lng !== null
                        ? { lat: detail.order.delivery.lat, lng: detail.order.delivery.lng }
                        : RESTAURANT.coords
                    }
                    zoom={15}
                    className="mt-2 h-56 w-full"
                    destination={
                      detail.order.delivery.lat !== null && detail.order.delivery.lng !== null
                        ? { lat: detail.order.delivery.lat, lng: detail.order.delivery.lng }
                        : null
                    }
                    rider={deliveryPoints.length ? deliveryPoints[deliveryPoints.length - 1] : null}
                    path={deliveryPoints}
                    fitToContent
                    ariaLabel="Delivery location"
                  />
                  <p className="mt-2 text-xs text-ink-600">{detail.order.delivery.address}</p>
                  {detail.order.delivery.instructions ? (
                    <p className="text-[11px] text-ink-500">{detail.order.delivery.instructions}</p>
                  ) : null}
                  <p className="text-[10px] text-ink-400">
                    {detail.order.delivery.lat?.toFixed(5)}, {detail.order.delivery.lng?.toFixed(5)} · source {detail.order.delivery.source}
                  </p>
                </div>
              ) : null}

              {detail.order.notes ? (
                <div className="rounded-2xl border border-ink-100 bg-ink-50/60 px-4 py-3 text-xs text-ink-600">
                  <span className="font-bold text-ink-700">Kitchen notes: </span>
                  {detail.order.notes}
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-bold text-ink-800">Status history</h3>
                <div className="mt-2">
                  <OrderTimeline order={detail.order} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-ink-100 bg-ink-50/60 p-4">
                <h3 className="text-sm font-bold text-ink-800">Move status</h3>
                <p className="mt-1 text-[11px] text-ink-500">Only valid next steps are offered. Cancel is always available until completion.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {nextStatuses.length === 0 ? (
                    <p className="text-xs text-ink-400">This order is finished.</p>
                  ) : (
                    nextStatuses.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => void transition(status)}
                        disabled={transitioning}
                        className={`btn-sm ${status === "cancelled" ? "btn-ghost text-brand-700" : "btn-primary"}`}
                      >
                        {transitioning ? "…" : STATUS_LABELS[status]}
                      </button>
                    ))
                  )}
                </div>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="Optional note for the history (e.g. 'Kitchen started frying')"
                  className="field mt-3 resize-none text-xs"
                />
              </div>

              {detail.order.orderType === "delivery" ? (
                <div className="rounded-3xl border border-ink-100 bg-ink-50/60 p-4">
                  <h3 className="text-sm font-bold text-ink-800">Rider assignment</h3>
                  {detail.order.driver ? (
                    <div className="mt-2 rounded-2xl bg-white px-3 py-2 text-xs">
                      <p className="font-bold text-ink-800">{detail.order.driver.fullName}</p>
                      <p className="text-ink-500">{detail.order.driver.phone}</p>
                      {detail.order.driver.vehicle ? <p className="text-ink-400">{detail.order.driver.vehicle}</p> : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink-500">No rider assigned yet.</p>
                  )}
                  <button type="button" onClick={() => setAssignOpen(true)} className="btn-ghost btn-sm mt-3 w-full">
                    <Users className="h-3.5 w-3.5" /> {detail.order.driver ? "Reassign rider" : "Assign rider"}
                  </button>

                  <div className="mt-3 border-t border-ink-200 pt-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Demo driver simulator</h4>
                    <p className="mt-1 text-[11px] text-ink-400">
                      Clearly labelled demonstration tool. Drives the rider marker along a sample route to the saved pin.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleDemo("start")}
                        disabled={demoBusy || detail.order.status !== "out_for_delivery" || !detail.order.driver}
                        className="btn-gold btn-sm flex-1"
                      >
                        {demoBusy ? "…" : "Start demo"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleDemo("stop")}
                        disabled={demoBusy}
                        className="btn-ghost btn-sm flex-1"
                      >
                        Stop
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-ink-400">
                      Requires Out for Delivery status and an assigned rider.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="rounded-3xl border border-ink-100 bg-ink-50/60 p-4 text-xs">
                <p className="font-bold text-ink-700">Customer</p>
                <p className="mt-1 text-ink-600">{detail.order.customerName}</p>
                <p className="text-ink-500">{detail.order.customerPhone}</p>
                {detail.order.customerEmail ? <p className="text-ink-400">{detail.order.customerEmail}</p> : null}
                <p className="mt-2 font-bold text-ink-700">Payment</p>
                <p className="text-ink-600">{detail.order.paymentStatus} · {formatTZS(detail.order.amountPaid)}</p>
                {detail.order.payment ? <p className="font-mono text-[10px] text-ink-400">{detail.order.payment.reference}</p> : null}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign a rider" size="md">
        {drivers.length === 0 ? (
          <EmptyState icon={<Bike className="h-6 w-6" />} title="No riders available" description="Active delivery accounts appear here." />
        ) : (
          <ul className="space-y-2">
            {drivers.map((driver) => (
              <li key={driver.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDriver(driver.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    selectedDriver === driver.id ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:border-ink-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: driver.avatarColor }}>
                      {driver.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink-800">{driver.fullName}</p>
                      <p className="text-[11px] text-ink-500">{driver.phone}{driver.vehicle ? ` · ${driver.vehicle}` : ""}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-bold text-ink-500">
                    {driver.activeOrders} active
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setAssignOpen(false)} className="btn-ghost btn-sm">
            Cancel
          </button>
          <button type="button" onClick={() => void assign()} disabled={!selectedDriver} className="btn-primary btn-sm">
            Assign rider
          </button>
        </div>
      </Modal>
    </div>
  );
}
