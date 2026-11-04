import { Route, Routes } from "react-router-dom";
import { PublicLayout } from "@/layouts/PublicLayout";
import { PortalLayout } from "@/layouts/PortalLayout";
import { HomePage } from "@/pages/HomePage";
import { MenuPage } from "@/pages/MenuPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { OrderDetailPage } from "@/pages/OrderDetailPage";
import { TrackPage } from "@/pages/TrackPage";
import { MyOrdersPage } from "@/pages/MyOrdersPage";
import { AccountPage } from "@/pages/AccountPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { StaffDashboardPage } from "@/pages/StaffDashboardPage";
import { StaffMenuPage } from "@/pages/StaffMenuPage";
import { DriverDashboardPage } from "@/pages/DriverDashboardPage";
import { RequireRole } from "@/components/RequireRole";
import { Package, ClipboardList, Bike } from "lucide-react";

function NotFoundPage() {
  return (
    <div className="container py-20 text-center">
      <h1 className="text-3xl font-extrabold text-ink-900">Page not found</h1>
      <p className="mt-2 text-sm text-ink-500">The page you are looking for does not exist.</p>
      <a href="/" className="btn-primary mt-5 inline-flex">
        Back home
      </a>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/checkout" element={<RequireRole roles={["customer", "staff", "admin"]} loginPath="/login"><CheckoutPage /></RequireRole>} />
        <Route path="/order/:reference" element={<RequireRole roles={["customer", "staff", "admin", "driver"]} loginPath="/login"><OrderDetailPage /></RequireRole>} />
        <Route path="/track" element={<TrackPage />} />
        <Route path="/track/:reference" element={<TrackPage />} />
        <Route path="/my-orders" element={<RequireRole roles={["customer", "staff", "admin", "driver"]} loginPath="/login"><MyOrdersPage /></RequireRole>} />
        <Route path="/account" element={<RequireRole roles={["customer", "staff", "admin", "driver"]} loginPath="/login"><AccountPage /></RequireRole>} />
        <Route path="/login" element={<LoginPage portal="customer" />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="/staff/login" element={<LoginPage portal="staff" />} />
      <Route
        path="/staff"
        element={
          <RequireRole roles={["staff", "admin"]} loginPath="/staff/login">
            <PortalLayout title="Staff portal" accent="brand" links={[
              { to: "/staff", label: "Orders", icon: ClipboardList },
              { to: "/staff/menu", label: "Menu", icon: Package },
            ]}>
              <StaffDashboardPage />
            </PortalLayout>
          </RequireRole>
        }
      />
      <Route
        path="/staff/menu"
        element={
          <RequireRole roles={["staff", "admin"]} loginPath="/staff/login">
            <PortalLayout title="Staff portal" accent="brand" links={[
              { to: "/staff", label: "Orders", icon: ClipboardList },
              { to: "/staff/menu", label: "Menu", icon: Package },
            ]}>
              <StaffMenuPage />
            </PortalLayout>
          </RequireRole>
        }
      />

      <Route path="/driver/login" element={<LoginPage portal="driver" />} />
      <Route
        path="/driver"
        element={
          <RequireRole roles={["driver"]} loginPath="/driver/login">
            <PortalLayout title="Rider portal" accent="emerald" links={[
              { to: "/driver", label: "Deliveries", icon: Bike },
            ]}>
              <DriverDashboardPage />
            </PortalLayout>
          </RequireRole>
        }
      />
    </Routes>
  );
}
