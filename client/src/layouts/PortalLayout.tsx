import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Menu as MenuIcon, Package, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";

export function PortalLayout({
  title,
  accent,
  links,
  children,
}: {
  title: string;
  accent: "brand" | "emerald";
  links: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate(accent === "emerald" ? "/driver/login" : "/staff/login");
  };

  const accentClass = accent === "emerald" ? "bg-emerald-600" : "bg-brand-600";

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-[900] border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-50 text-ink-700 lg:hidden"
              aria-label="Open menu"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <Logo className="h-8 w-auto" />
            <span className={`hidden rounded-full ${accentClass} px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white sm:inline-block`}>
              {title}
            </span>
          </div>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Portal">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                    isActive ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                  }`
                }
              >
                <link.icon className="h-4 w-4" /> {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-bold text-ink-800">{user?.fullName}</p>
              <p className="text-[10px] text-ink-400">{user?.role}</p>
            </div>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: user?.avatarColor ?? "#B91C23" }}
            >
              {user?.fullName.split(" ").slice(0, 2).map((part) => part[0]).join("")}
            </span>
            <button type="button" onClick={() => void handleLogout()} className="btn-ghost btn-sm">
              <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-[1000] lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white p-5 shadow-lift animate-slide-in-right">
            <div className="flex items-center justify-between">
              <Logo className="h-8 w-auto" />
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-full bg-ink-50 p-2 text-ink-600" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-6 flex flex-col gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold ${
                      isActive ? "bg-ink-900 text-white" : "text-ink-600"
                    }`
                  }
                >
                  <link.icon className="h-4 w-4" /> {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      <main className="container py-6">{children}</main>
    </div>
  );
}
