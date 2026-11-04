import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Mail, Phone, UserRound } from "lucide-react";
import { AuthShell, PasswordField } from "@/pages/LoginPage";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ApiError } from "@/lib/api";

export function RegisterPage() {
  const { register } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldError(null);
    try {
      const user = await register({
        fullName,
        phone,
        email: email.trim() || undefined,
        password,
        passwordConfirm,
      });
      push({ tone: "success", title: "Account created", description: `Karibu, ${user.fullName.split(" ")[0]}!` });
      navigate(next || "/menu");
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        const details = caught.details as { field?: string } | undefined;
        setFieldError(details?.field ?? null);
      } else {
        setError("Could not create your account. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your Jamaa account"
      subtitle="One account for ordering, receipts and live tracking. Delivery is available across Dar es Salaam."
      image="/images/food/pilau.jpg"
      footer={
        <p>
          Already have an account?{" "}
          <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">
            Sign in instead
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? (
          <p role="alert" className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs font-medium text-brand-700">
            {error}
          </p>
        ) : null}

        <div>
          <label htmlFor="fullName" className="label">
            Full name
          </label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="fullName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
              placeholder="Baraka Mwinyi"
              className="field pl-10"
            />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="label">
            Phone number
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              required
              inputMode="tel"
              placeholder="0712 345 678"
              className={`field pl-10 ${fieldError === "phone" ? "border-brand-500" : ""}`}
            />
          </div>
          <p className="mt-1 text-[11px] text-ink-400">Tanzanian mobile number — we use it to reach you about your order.</p>
        </div>

        <div>
          <label htmlFor="email" className="label">
            Email <span className="font-normal normal-case tracking-normal text-ink-400">(optional, for receipts)</span>
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className={`field pl-10 ${fieldError === "email" ? "border-brand-500" : ""}`}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" />
          <PasswordField
            id="passwordConfirm"
            label="Confirm password"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            autoComplete="new-password"
          />
        </div>
        <p className="text-[11px] text-ink-400">Use at least 8 characters. Passwords are hashed with scrypt on the server.</p>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
