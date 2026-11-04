import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCircle2, KeyRound, LogOut, Save, UserRound } from "lucide-react";
import { formatDateTime } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useNotifications } from "@/hooks/useNotifications";
import { EmptyState, LoadingPanel } from "@/components/Feedback";

export function AccountPage() {
  const { user, logout, refresh } = useAuth();
  const { push } = useToast();
  const { notifications, unreadCount, markAllRead } = useNotifications();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    setFullName(user?.fullName ?? "");
    setPhone(user?.phone ?? "");
    setEmail(user?.email ?? "");
  }, [user]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setProfileBusy(true);
    try {
      const response = await api.updateProfile({ fullName, phone, email: email || undefined });
      await refresh();
      push({ tone: "success", title: "Profile updated", description: response.user.fullName });
    } catch (caught) {
      push({ tone: "error", title: "Update failed", description: caught instanceof ApiError ? caught.message : "Please try again." });
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordBusy(true);
    try {
      await api.changePassword({ currentPassword, password: newPassword, passwordConfirm: confirmPassword });
      push({ tone: "success", title: "Password changed", description: "Other sessions were signed out." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (caught) {
      push({ tone: "error", title: "Could not change password", description: caught instanceof ApiError ? caught.message : "Please try again." });
    } finally {
      setPasswordBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="container py-14">
        <EmptyState
          icon={<UserRound className="h-6 w-6" />}
          title="Sign in to manage your account"
          description="Your profile, receipts and notifications live here."
          action={<Link to="/login?next=/account" className="btn-primary">Sign in</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Your account</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink-900 sm:text-4xl">Account settings</h1>
          <p className="mt-1 text-sm text-ink-500">Manage your profile, password and notifications.</p>
        </div>
        <button type="button" onClick={() => void logout()} className="btn-ghost btn-sm">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <UserRound className="h-4 w-4 text-brand-600" /> Profile
          </h2>
          <form onSubmit={saveProfile} className="mt-4 space-y-4">
            <div>
              <label htmlFor="fullName" className="label">Full name</label>
              <input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required className="field" />
            </div>
            <div>
              <label htmlFor="phone" className="label">Phone number</label>
              <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} required inputMode="tel" className="field" />
            </div>
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field" />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={profileBusy}>
              {profileBusy ? "Saving…" : <><Save className="h-4 w-4" /> Save changes</>}
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <KeyRound className="h-4 w-4 text-brand-600" /> Change password
          </h2>
          <form onSubmit={changePassword} className="mt-4 space-y-4">
            <div>
              <label htmlFor="current" className="label">Current password</label>
              <input id="current" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required className="field" />
            </div>
            <div>
              <label htmlFor="new" className="label">New password</label>
              <input id="new" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} className="field" />
            </div>
            <div>
              <label htmlFor="confirm" className="label">Confirm new password</label>
              <input id="confirm" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} className="field" />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={passwordBusy}>
              {passwordBusy ? "Updating…" : "Update password"}
            </button>
          </form>
          <p className="mt-3 text-[11px] text-ink-400">Changing your password signs out every other active session.</p>
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
              <Bell className="h-4 w-4 text-brand-600" /> Notifications
            </h2>
            {unreadCount > 0 ? (
              <button type="button" onClick={() => void markAllRead()} className="text-xs font-semibold text-brand-700">
                Mark all read ({unreadCount})
              </button>
            ) : null}
          </div>
          {notifications.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications yet" description="Order status updates and payment receipts will appear here." />
            </div>
          ) : (
            <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {notifications.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-2xl border px-4 py-3 ${item.readAt ? "border-ink-100 bg-white" : "border-brand-200 bg-brand-50/40"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink-800">{item.title}</p>
                      <p className="mt-0.5 text-xs text-ink-500">{item.body}</p>
                      <p className="mt-1 text-[10px] text-ink-400">{formatDateTime(item.createdAt)}</p>
                    </div>
                    {item.orderReference ? (
                      <Link to={`/order/${item.orderReference}`} className="shrink-0 text-xs font-semibold text-brand-700">
                        View
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-base font-bold text-ink-900">Account details</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-ink-50 px-4 py-3">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Role</dt>
              <dd className="mt-0.5 font-semibold capitalize text-ink-700">{user.role.replace("_", " ")}</dd>
            </div>
            <div className="rounded-2xl bg-ink-50 px-4 py-3">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Phone</dt>
              <dd className="mt-0.5 font-semibold text-ink-700">{user.phone}</dd>
            </div>
            <div className="rounded-2xl bg-ink-50 px-4 py-3">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Avatar colour</dt>
              <dd className="mt-1.5 flex items-center gap-2">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: user.avatarColor }} />
                <span className="font-mono text-xs text-ink-600">{user.avatarColor}</span>
              </dd>
            </div>
            <div className="rounded-2xl bg-ink-50 px-4 py-3">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Session</dt>
              <dd className="mt-0.5 font-semibold text-ink-700">httpOnly cookie · SameSite</dd>
            </div>
          </dl>
          {user.role !== "customer" ? (
            <Link
              to={user.role === "driver" ? "/driver" : "/staff"}
              className="btn-soft mt-4 w-full"
            >
              Open {user.role === "driver" ? "rider" : "staff"} portal
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}
