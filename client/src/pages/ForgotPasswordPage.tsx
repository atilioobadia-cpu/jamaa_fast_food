import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { AuthShell, PasswordField } from "@/pages/LoginPage";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

export function ForgotPasswordPage() {
  const { push } = useToast();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.forgotPassword(identifier);
      setMessage(response.message);
      if (response.demoResetToken) setToken(response.demoResetToken);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create a reset request.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword({ token, password, passwordConfirm });
      push({ tone: "success", title: "Password updated", description: "Sign in with your new password." });
      navigate("/login");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the phone or email on your account. In this prototype the reset link is shown on screen instead of being sent by SMS."
      image="/images/food/club-sandwich.jpg"
      footer={
        <p>
          Remembered it?{" "}
          <Link to="/login" className="link">
            Back to sign in
          </Link>
        </p>
      }
    >
      {error ? (
        <p role="alert" className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs font-medium text-brand-700">
          {error}
        </p>
      ) : null}

      {!message ? (
        <form onSubmit={requestReset} className="space-y-4">
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
                required
                placeholder="0712 345 678 or you@example.com"
                className="field pl-10"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Creating request…" : "Create reset link"}
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
            {message}
          </p>

          {token ? (
            <div className="rounded-2xl border border-dashed border-gold-300 bg-gold-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gold-700">Demo reset token</p>
              <p className="mt-1 break-all font-mono text-[11px] text-ink-700">{token}</p>
            </div>
          ) : null}

          <form onSubmit={resetPassword} className="space-y-4">
            <div>
              <label htmlFor="token" className="label">
                Reset token
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  id="token"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  required
                  className="field pl-10 font-mono text-xs"
                />
              </div>
            </div>
            <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              autoComplete="new-password"
            />
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Updating…" : "Set new password"}
            </button>
          </form>
        </div>
      )}
    </AuthShell>
  );
}
