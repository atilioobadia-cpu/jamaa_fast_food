import { all } from "../db.js";
import type { Addon, Category, MenuItem } from "../../../shared/types.js";

interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  image: string;
  sort_order: number;
}

interface ItemRow {
  id: number;
  category_id: number;
  category_slug: string;
  name: string;
  description: string;
  price: number;
  image: string;
  is_available: number;
  is_featured: number;
  badge: string | null;
  prep_minutes: number;
  tags: string;
  sold_count: number;
}

interface AddonRow {
  id: number;
  menu_item_id: number;
  name: string;
  price: number;
}

export function getCategories(): Category[] {
  return all<CategoryRow>("SELECT * FROM categories ORDER BY sort_order, id").map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    image: row.image,
    sortOrder: row.sort_order,
  }));
}

export function getMenu(includeUnavailable = false): MenuItem[] {
  const rows = all<ItemRow>(
    `SELECT mi.*, c.slug AS category_slug FROM menu_items mi
     JOIN categories c ON c.id = mi.category_id
     ${includeUnavailable ? "" : "WHERE mi.is_available = 1"}
     ORDER BY c.sort_order, mi.id`,
  );
  const addonRows = all<AddonRow>("SELECT * FROM addons ORDER BY id");
  const addonsByItem = new Map<number, Addon[]>();
  for (const addon of addonRows) {
    const list = addonsByItem.get(addon.menu_item_id) ?? [];
    list.push({ id: addon.id, name: addon.name, price: addon.price });
    addonsByItem.set(addon.menu_item_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    name: row.name,
    description: row.description,
    price: row.price,
    image: row.image,
    isAvailable: Boolean(row.is_available),
    isFeatured: Boolean(row.is_featured),
    badge: row.badge,
    prepMinutes: row.prep_minutes,
    tags: safeTags(row.tags),
    addons: addonsByItem.get(row.id) ?? [],
    soldCount: row.sold_count,
  }));
}

function safeTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}
