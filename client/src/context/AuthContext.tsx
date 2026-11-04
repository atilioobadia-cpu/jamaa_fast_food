import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionUser } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { connectSocket, disconnectSocket } from "@/lib/socket";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string, portal: "customer" | "staff" | "driver") => Promise<SessionUser>;
  register: (input: {
    fullName: string;
    phone: string;
    email?: string;
    password: string;
    passwordConfirm: string;
  }) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await api.me();
      setUser(current);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        // Network hiccups should not wipe a valid session; keep the last known user.
        console.warn("[auth] session check failed", error);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (user) connectSocket();
    else disconnectSocket();
  }, [user]);

  const login = useCallback(async (identifier: string, password: string, portal: "customer" | "staff" | "driver") => {
    const { user: next } = await api.login(identifier, password, portal);
    setUser(next);
    return next;
  }, []);

  const register = useCallback(
    async (input: { fullName: string; phone: string; email?: string; password: string; passwordConfirm: string }) => {
      const { user: next } = await api.register(input);
      setUser(next);
      return next;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      disconnectSocket();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, refresh, setUser }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
