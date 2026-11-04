import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ApiError } from "@/lib/api";
import { RESTAURANT } from "@shared/config";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  image = "/images/food/hero-feast.jpg",
  badge,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  image?: string;
  badge?: string;
}) {
  return (
    <div className="container grid min-h-[calc(100vh-5rem)] items-center gap-10 py-10 lg:grid-cols-2 lg:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Logo className="h-9 w-auto" />
          <Link to="/" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to shop
          </Link>
        </div>
        {badge ? (
          <span className="chip border-brand-200 bg-brand-50 text-brand-700">
            <ShieldCheck className="h-3.5 w-3.5" /> {badge}
          </span>
        ) : null}
        <h1 className="mt-3 text-3xl font-extrabold text-ink-900">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{subtitle}</p>
        <div className="mt-7">{children}</div>
        {footer ? <div className="mt-6 text-sm text-ink-500">{footer}</div> : null}
      </div>

      <div className="relative hidden lg:block">
        <div className="overflow-hidden rounded-[2.5rem] border-4 border-white shadow-lift">
          <img src={image} alt="" className="h-[520px] w-full object-cover" />
        </div>
        <div className="absolute inset-x-6 bottom-6 rounded-3xl bg-white/95 p-5 shadow-lift backdrop-blur">
          <p className="text-sm font-bold text-ink-900">{RESTAURANT.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">{RESTAURANT.tagline}</p>
          <p className="mt-2 text-[11px] font-semibold text-ink-400">{RESTAURANT.address}</p>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
          className="field pl-10 pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-400 hover:bg-ink-50"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export { PasswordField };

export function LoginPage({ portal = "customer" }: { portal?: "customer" | "staff" | "driver" }) {
  const { login } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = params.get("reason");
  const next = params.get("next");

  const demo =
    portal === "staff"
      ? { identifier: "staff@jamaa.co.tz", password: "Staff@1234", label: "Staff demo" }
      : portal === "driver"
        ? { identifier: "driver@jamaa.co.tz", password: "Driver@1234", label: "Rider demo" }
        : { identifier: "demo@jamaa.co.tz", password: "Demo@1234", label: "Customer demo" };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(identifier, password, portal);
      push({ tone: "success", title: `Welcome back, ${user.fullName.split(" ")[0]}` });
      if (portal === "staff") navigate(next || "/staff");
      else if (portal === "driver") navigate(next || "/driver");
      else navigate(next || (user.role === "customer" ? "/menu" : user.role === "driver" ? "/driver" : "/staff"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const titles = {
    customer: { title: "Welcome back", subtitle: "Sign in to build your order, pay in demo mode and follow your delivery live." },
    staff: { title: "Staff sign in", subtitle: "Manage orders, choose statuses and dispatch riders from the operations dashboard." },
    driver: { title: "Rider sign in", subtitle: "See your assigned deliveries, share your position and confirm drop-offs." },
  }[portal];

  return (
    <AuthShell
      title={titles.title}
      subtitle={titles.subtitle}
      badge={portal === "customer" ? undefined : "Secure staff access"}
      image={portal === "driver" ? "/images/food/mishkaki.jpg" : "/images/food/hero-feast.jpg"}
      footer={
        portal === "customer" ? (
          <div className="space-y-3">
            <p>
              New to Jamaa?{" "}
              <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">
                Create an account
              </Link>
            </p>
            <p className="text-xs text-ink-400">
              Staff and riders:{" "}
              <Link to="/staff/login" className="font-semibold text-ink-600 hover:text-brand-700">
                staff portal
              </Link>{" "}
              ·{" "}
              <Link to="/driver/login" className="font-semibold text-ink-600 hover:text-brand-700">
                rider portal
              </Link>
            </p>
          </div>
        ) : portal === "staff" ? (
          <p className="text-xs text-ink-400">
            Customer? <Link to="/login" className="font-semibold text-ink-600 hover:text-brand-700">Use the shop sign-in</Link> · Rider?{" "}
            <Link to="/driver/login" className="font-semibold text-ink-600 hover:text-brand-700">Rider portal</Link>
          </p>
        ) : (
          <p className="text-xs text-ink-400">
            Customer? <Link to="/login" className="font-semibold text-ink-600 hover:text-brand-700">Use the shop sign-in</Link> · Staff?{" "}
            <Link to="/staff/login" className="font-semibold text-ink-600 hover:text-brand-700">Staff portal</Link>
          </p>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {reason === "cart" ? (
          <p className="rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3 text-xs font-medium text-gold-700">
            Sign in to add meals to your cart. Your selections are saved on this device.
          </p>
        ) : null}
        {reason === "checkout" ? (
          <p className="rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3 text-xs font-medium text-gold-700">
            Sign in to continue to checkout. Your cart will still be here.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs font-medium text-brand-700">
            {error}
          </p>
        ) : null}

        <div>
          <label htmlFor="identifier" className="label">
            Phone or email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
              placeholder="0712 345 678 or you@example.com"
              className="field pl-10"
            />
          </div>
        </div>

        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />

        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="font-semibold text-ink-500 hover:text-brand-700">
            Forgot your password?
          </Link>
          <span className="text-ink-300">Secure httpOnly session</span>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setIdentifier(demo.identifier);
          setPassword(demo.password);
        }}
        className="mt-4 w-full rounded-2xl border border-dashed border-ink-200 bg-white px-4 py-3 text-left text-xs transition hover:border-brand-300 hover:bg-brand-50/40"
      >
        <span className="font-bold text-ink-700">{demo.label}</span>
        <span className="mt-0.5 block text-ink-500">
          {demo.identifier} · {demo.password} — tap to fill
        </span>
      </button>
    </AuthShell>
  );
}
