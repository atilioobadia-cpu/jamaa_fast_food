import { Check, Clock, X } from "lucide-react";
import { ORDER_FLOWS, ORDER_TYPE_LABELS, STATUS_LABELS, formatDateTime, type Order } from "@shared/types";

export function OrderProgress({ order }: { order: Order }) {
  const flow = ORDER_FLOWS[order.orderType];
  const cancelled = order.status === "cancelled";
  const currentIndex = flow.indexOf(order.status);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Order progress</p>
        <p className="text-xs font-semibold text-ink-500">{ORDER_TYPE_LABELS[order.orderType]}</p>
      </div>

      {cancelled ? (
        <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
          <X className="h-4 w-4" /> This order was cancelled.
        </div>
      ) : (
        <ol className="flex flex-wrap gap-2">
          {flow.map((status, index) => {
            const done = currentIndex >= index;
            const active = currentIndex === index;
            return (
              <li key={status} className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                    done
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-ink-200 bg-white text-ink-400"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={`text-xs font-semibold ${active ? "text-brand-700" : done ? "text-ink-700" : "text-ink-400"}`}
                >
                  {STATUS_LABELS[status]}
                </span>
                {index < flow.length - 1 ? <span className="hidden h-px w-5 bg-ink-200 sm:block" aria-hidden /> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function OrderTimeline({ order }: { order: Order }) {
  const events = [...order.events].reverse();
  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-400">
            <Clock className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-800">{STATUS_LABELS[event.status]}</p>
            <p className="text-xs text-ink-500">
              {event.actorName} · {event.actorRole.replace("_", " ")}
            </p>
            <p className="text-[11px] text-ink-400">{formatDateTime(event.createdAt)}</p>
            {event.note ? <p className="mt-0.5 text-xs italic text-ink-500">“{event.note}”</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
