import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingPanel } from "@/components/Feedback";

export function RequireRole({
  roles,
  loginPath,
  children,
}: {
  roles: Array<"customer" | "staff" | "driver" | "admin">;
  loginPath: string;
  children: React.ReactElement;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="container py-14"><LoadingPanel label="Checking access" /></div>;
  if (!user) return <Navigate to={`${loginPath}?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={loginPath} replace />;
  return children;
}
