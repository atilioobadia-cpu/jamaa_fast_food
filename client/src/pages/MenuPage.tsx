import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, UtensilsCrossed, X } from "lucide-react";
import type { MenuItem } from "@shared/types";
import { usePublicData } from "@/context/PublicDataContext";
import { MenuItemCard, ItemSheet, SignInPrompt } from "@/components/MenuItem";
import { EmptyState, LoadingPanel } from "@/components/Feedback";

type SortKey = "recommended" | "price_asc" | "price_desc" | "quickest";

export function MenuPage() {
  const { categories, items, loading, error, reload } = usePublicData();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  const activeCategory = params.get("category") ?? "all";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = items.filter((item) => {
      if (activeCategory !== "all" && item.categorySlug !== activeCategory) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });

    list = [...list].sort((a, b) => {
      if (sort === "price_asc") return a.price - b.price;
      if (sort === "price_desc") return b.price - a.price;
      if (sort === "quickest") return a.prepMinutes - b.prepMinutes;
      return Number(b.isFeatured) - Number(a.isFeatured) || b.soldCount - a.soldCount;
    });

    return list;
  }, [items, activeCategory, search, sort]);

  const selectCategory = (slug: string) => {
    if (slug === "all") {
      params.delete("category");
      setParams(params, { replace: true });
      return;
    }
    setParams({ category: slug }, { replace: true });
  };

  return (
    <div className="container py-8 sm:py-12">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">The Jamaa kitchen</p>
        <h1 className="mt-1 text-3xl font-extrabold text-ink-900 sm:text-4xl">Our full menu</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Everything is cooked to order. Prices are in Tanzanian Shillings and include VAT. Add extras and notes as you
          go — the kitchen sees them on your ticket.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-ink-100 bg-white p-3 shadow-soft sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search meals, sides or drinks"
            aria-label="Search the menu"
            className="field pl-10 pr-10"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-400 hover:bg-ink-50"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="field py-2.5 pr-8 text-xs font-semibold"
            aria-label="Sort menu"
          >
            <option value="recommended">Recommended</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="quickest">Quickest to cook</option>
          </select>
        </div>
      </div>

      <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => selectCategory("all")}
          className={`chip shrink-0 transition ${
            activeCategory === "all" ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
          }`}
        >
          All items
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => selectCategory(category.slug)}
            className={`chip shrink-0 transition ${
              activeCategory === category.slug
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between text-xs text-ink-400">
        <p>
          {loading ? "Loading meals…" : `${filtered.length} item${filtered.length === 1 ? "" : "s"}`}
          {activeCategory !== "all" ? ` in ${categories.find((c) => c.slug === activeCategory)?.name ?? activeCategory}` : ""}
        </p>
        {search ? <p>Results for “{search}”</p> : null}
      </div>

      {loading ? (
        <LoadingPanel label="Loading the menu" />
      ) : error ? (
        <EmptyState
          icon={<UtensilsCrossed className="h-6 w-6" />}
          title="The menu could not load"
          description={error}
          action={
            <button type="button" onClick={() => void reload()} className="btn-primary">
              Try again
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No meals match that search"
          description="Try a different keyword or browse another category."
          action={
            <button
              type="button"
              onClick={() => {
                setSearch("");
                selectCategory("all");
              }}
              className="btn-primary"
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <MenuItemCard key={item.id} item={item} onOpen={setActiveItem} />
          ))}
        </div>
      )}

      <ItemSheet item={activeItem} onClose={() => setActiveItem(null)} onSignInRequired={() => setSignInOpen(true)} />
      <SignInPrompt open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
