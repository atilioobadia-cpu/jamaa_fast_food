import { STATUS_LABELS, STATUS_TONE, type OrderStatus } from "@shared/types";

const TONE_CLASSES: Record<string, string> = {
  neutral: "border-ink-200 bg-ink-50 text-ink-600",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  progress: "border-gold-300 bg-gold-50 text-gold-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-brand-200 bg-brand-50 text-brand-700",
};

export function StatusBadge({ status, className = "" }: { status: OrderStatus; className?: string }) {
  return (
    <span className={`chip ${TONE_CLASSES[STATUS_TONE[status]]} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
