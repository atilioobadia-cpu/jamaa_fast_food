import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Category, MenuItem } from "@shared/types";
import { api, type AppConfig } from "@/lib/api";

interface PublicDataValue {
  config: AppConfig | null;
  categories: Category[];
  items: MenuItem[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  itemById: (id: number) => MenuItem | undefined;
}

const PublicDataContext = createContext<PublicDataValue | null>(null);

export function PublicDataProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [configResponse, menuResponse] = await Promise.all([api.config(), api.menu()]);
      setConfig(configResponse);
      setCategories(menuResponse.categories);
      setItems(menuResponse.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<PublicDataValue>(
    () => ({
      config,
      categories,
      items,
      loading,
      error,
      reload,
      itemById: (id: number) => items.find((item) => item.id === id),
    }),
    [config, categories, items, loading, error, reload],
  );

  return <PublicDataContext.Provider value={value}>{children}</PublicDataContext.Provider>;
}

export function usePublicData(): PublicDataValue {
  const context = useContext(PublicDataContext);
  if (!context) throw new Error("usePublicData must be used inside PublicDataProvider");
  return context;
}
