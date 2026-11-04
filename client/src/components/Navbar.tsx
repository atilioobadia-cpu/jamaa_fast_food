import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  ClipboardList,
  LogOut,
  Menu as MenuIcon,
  ReceiptText,
  ShoppingBag,
  UserRound,
  X,
  Bike,
  MapPinned,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useNotifications } from "@/hooks/useNotifications";
import { Logo } from "@/components/Logo";
import { formatDateTime } from "@shared/types";

const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/menu", label: "Menu" },
  { to: "/my-orders", label: "My orders" },
  { to: "/track", label: "Track order" },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const { count, openCart } = useCart();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = user?.fullName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    setAccountOpen(false);
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-[900] border-b border-ink-100 bg-cream/90 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-3 sm:h-20">
        <div className="flex items-center gap-8">
          <Logo className="h-8 w-auto sm:h-10" />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                    isActive ? "bg-white text-brand-700 shadow-soft" : "text-ink-500 hover:text-ink-900"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={openCart}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-700 shadow-soft transition hover:text-brand-700"
            aria-label={`Open cart${count ? `, ${count} items` : ""}`}
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            ) : null}
          </button>

          {user ? (
            <>
              <div className="relative hidden sm:block" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((open) => !open)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-700 shadow-soft transition hover:text-brand-700"
                  aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 ? (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" />
                  ) : null}
                </button>
                {notificationsOpen ? (
                  <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lift animate-scale-in">
                    <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                      <p className="text-sm font-bold text-ink-800">Notifications</p>
                      {unreadCount > 0 ? (
                        <button type="button" onClick={() => void markAllRead()} className="text-xs font-semibold text-brand-700">
                          Mark all read
                        </button>
                      ) : null}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-ink-400">No notifications yet.</p>
                      ) : (
                        notifications.slice(0, 8).map((item) => (
                          <div key={item.id} className={`border-b border-ink-50 px-4 py-3 last:border-0 ${item.readAt ? "" : "bg-brand-50/40"}`}>
                            <p className="text-xs font-bold text-ink-800">{item.title}</p>
                            <p className="mt-0.5 text-xs text-ink-500">{item.body}</p>
                            <p className="mt-1 text-[10px] text-ink-400">{formatDateTime(item.createdAt)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-2 text-sm font-semibold text-ink-700 shadow-soft transition hover:shadow-lift"
                  aria-expanded={accountOpen}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: user.avatarColor }}
                  >
                    {initials}
                  </span>
                  <span className="hidden max-w-28 truncate md:block">{user.fullName.split(" ")[0]}</span>
                  <ChevronDown className="hidden h-4 w-4 text-ink-400 md:block" />
                </button>
                {accountOpen ? (
                  <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-3xl border border-ink-100 bg-white py-2 shadow-lift animate-scale-in">
                    <div className="px-4 py-2">
                      <p className="truncate text-sm font-bold text-ink-800">{user.fullName}</p>
                      <p className="truncate text-xs text-ink-400">{user.email ?? user.phone}</p>
                    </div>
                    <div className="my-1 h-px bg-ink-100" />
                    <Link to="/account" onClick={() => setAccountOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-600 hover:bg-ink-50">
                      <UserRound className="h-4 w-4" /> Account settings
                    </Link>
                    <Link to="/my-orders" onClick={() => setAccountOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-600 hover:bg-ink-50">
                      <ClipboardList className="h-4 w-4" /> My orders
                    </Link>
                    {user.role !== "customer" ? (
                      <Link
                        to={user.role === "driver" ? "/driver" : "/staff"}
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-600 hover:bg-ink-50"
                      >
                        {user.role === "driver" ? <Bike className="h-4 w-4" /> : <ReceiptText className="h-4 w-4" />}
                        {user.role === "driver" ? "Rider dashboard" : "Staff portal"}
                      </Link>
                    ) : null}
                    <div className="my-1 h-px bg-ink-100" />
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-brand-700 hover:bg-brand-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="btn-ghost btn-sm">
                Sign in
              </Link>
              <Link to="/menu" className="btn-primary btn-sm">
                Order now
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-700 shadow-soft lg:hidden"
            aria-label="Open menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-[1000] lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col bg-cream p-5 shadow-lift animate-slide-in-right">
            <div className="flex items-center justify-between">
              <Logo className="h-8 w-auto" />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-full bg-white p-2 text-ink-600 shadow-soft"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-8 flex flex-col gap-1" aria-label="Mobile">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `rounded-2xl px-4 py-3 text-base font-semibold ${
                      isActive ? "bg-white text-brand-700 shadow-soft" : "text-ink-600"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <Link to="/account" onClick={() => setMenuOpen(false)} className="rounded-2xl px-4 py-3 text-base font-semibold text-ink-600">
                Account
              </Link>
            </nav>

            <div className="mt-auto space-y-2 border-t border-ink-200 pt-4">
              {user ? (
                <>
                  <p className="px-1 text-xs text-ink-400">Signed in as {user.fullName}</p>
                  <button type="button" onClick={() => void handleLogout()} className="btn-ghost w-full">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="btn-ghost w-full">
                    Sign in
                  </Link>
                  <Link to="/register" onClick={() => setMenuOpen(false)} className="btn-primary w-full">
                    Create account
                  </Link>
                </>
              )}
              <Link to="/track" onClick={() => setMenuOpen(false)} className="btn-soft w-full">
                <MapPinned className="h-4 w-4" /> Track an order
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
