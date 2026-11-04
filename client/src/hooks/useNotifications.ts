import { useCallback, useEffect, useState } from "react";
import type { AppNotification } from "@shared/types";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const reload = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const response = await api.notifications();
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch {
      /* notifications are non-critical */
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onNotification = (payload: { id: number; orderId: number | null; type: string; title: string; body: string; createdAt: string }) => {
      setNotifications((current) => [
        {
          id: payload.id,
          orderId: payload.orderId,
          orderReference: null,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          readAt: null,
          createdAt: payload.createdAt,
        },
        ...current,
      ].slice(0, 40));
      setUnreadCount((count) => count + 1);
    };
    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
  }, [user]);

  const markAllRead = useCallback(async () => {
    await api.markNotificationsRead();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, reload, markAllRead };
}
