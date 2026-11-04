import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Package, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import type { Category, MenuItem } from "@shared/types";
import { formatTZS } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { Modal } from "@/components/Modal";
import { EmptyState, LoadingPanel } from "@/components/Feedback";

interface ItemForm {
  name: string;
  categoryId: number;
  description: string;
  price: number;
  image: string;
  prepMinutes: number;
  tags: string;
  isAvailable: boolean;
  isFeatured: boolean;
  badge: string;
  addons: Array<{ name: string; price: number }>;
}

const emptyForm: ItemForm = {
  name: "",
  categoryId: 1,
  description: "",
  price: 5000,
  image: "/images/food/hero-feast.jpg",
  prepMinutes: 15,
  tags: "",
  isAvailable: true,
  isFeatured: false,
  badge: "",
  addons: [],
};

function toForm(item?: MenuItem): ItemForm {
  if (!item) return { ...emptyForm };
  return {
    name: item.name,
    categoryId: item.categoryId,
    description: item.description,
    price: item.price,
    image: item.image,
    prepMinutes: item.prepMinutes,
    tags: item.tags.join(", "),
    isAvailable: item.isAvailable,
    isFeatured: item.isFeatured,
    badge: item.badge ?? "",
    addons: item.addons.map((addon) => ({ name: addon.name, price: addon.price })),
  };
}

function toPayload(form: ItemForm) {
  return {
    name: form.name.trim(),
    categoryId: Number(form.categoryId),
    description: form.description.trim(),
    price: Number(form.price),
    image: form.image.trim(),
    prepMinutes: Number(form.prepMinutes),
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    isAvailable: form.isAvailable,
    isFeatured: form.isFeatured,
    badge: form.badge.trim() || null,
    addons: form.addons
      .filter((addon) => addon.name.trim())
      .map((addon) => ({ name: addon.name.trim(), price: Number(addon.price) })),
  };
}

export function StaffMenuPage() {
  const { push } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

  const load = async () => {
    try {
      const [menu, imageResponse] = await Promise.all([api.staff.menu(), api.staff.images()]);
      setCategories(menu.categories);
      setItems(menu.items);
      setImages(imageResponse.images);
      if (!form.categoryId && menu.categories.length) {
        setForm((current) => ({ ...current, categoryId: menu.categories[0].id }));
      }
    } catch (error) {
      push({ tone: "error", title: "Could not load menu", description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query) || item.categorySlug.includes(query));
  }, [items, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? 1 });
    setModalOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setForm(toForm(item));
    setModalOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editing) {
        const response = await api.staff.updateItem(editing.id, payload);
        setItems(response.items);
        push({ tone: "success", title: "Meal updated", description: payload.name });
      } else {
        const response = await api.staff.createItem(payload);
        setItems(response.items);
        push({ tone: "success", title: "Meal created", description: payload.name });
      }
      setModalOpen(false);
    } catch (error) {
      push({ tone: "error", title: "Save failed", description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: MenuItem) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      const response = await api.staff.deleteItem(item.id);
      setItems(response.items);
      push({ tone: "success", title: "Meal deleted", description: item.name });
    } catch (error) {
      push({ tone: "error", title: "Delete failed", description: error instanceof ApiError ? error.message : undefined });
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const response = await api.staff.updateItem(item.id, { isAvailable: !item.isAvailable });
      setItems(response.items);
    } catch (error) {
      push({ tone: "error", title: "Update failed", description: error instanceof ApiError ? error.message : undefined });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Catalogue</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink-900 sm:text-3xl">Menu manager</h1>
          <p className="mt-1 text-sm text-ink-500">{items.length} meals across {categories.length} categories.</p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" /> Add meal
        </button>
      </div>

      <div className="card p-3">
        <div className="relative">
          <Package className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search meals"
            className="field py-2.5 pl-9 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <LoadingPanel label="Loading menu" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="No meals yet"
          description="Add your first meal to get started."
          action={
            <button type="button" onClick={openCreate} className="btn-primary">
              Add meal
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div key={item.id} className="card overflow-hidden">
              <div className="relative aspect-[4/3] bg-ink-100">
                <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                {!item.isAvailable ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-ink-900/60">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink-800">Unavailable</span>
                  </div>
                ) : null}
                {item.isFeatured ? (
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gold-400 text-ink-900 shadow-soft">
                    <Package className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-800">{item.name}</p>
                    <p className="text-[11px] text-ink-500">{categories.find((category) => category.id === item.categoryId)?.name}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-brand-700">{formatTZS(item.price)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-500">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button type="button" onClick={() => openEdit(item)} className="btn-ghost btn-sm flex-1">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleAvailability(item)}
                    className="btn-ghost btn-sm"
                    title={item.isAvailable ? "Mark unavailable" : "Mark available"}
                  >
                    {item.isAvailable ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(item)}
                    className="rounded-full bg-brand-50 p-2 text-brand-700 hover:bg-brand-100"
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit meal" : "Add a meal"} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="field" />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: Number(event.target.value) })}
                className="field"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} className="field resize-none" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Price (TZS)</label>
              <input
                type="number"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
                min={500}
                required
                className="field"
              />
            </div>
            <div>
              <label className="label">Prep minutes</label>
              <input
                type="number"
                value={form.prepMinutes}
                onChange={(event) => setForm({ ...form, prepMinutes: Number(event.target.value) })}
                min={1}
                required
                className="field"
              />
            </div>
            <div>
              <label className="label">Badge</label>
              <input
                value={form.badge}
                onChange={(event) => setForm({ ...form, badge: event.target.value })}
                placeholder="Chef's pick"
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label">Image</label>
            <div className="flex gap-2">
              <input value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} required className="field flex-1" />
              <button type="button" onClick={() => setImagePickerOpen(true)} className="btn-ghost btn-sm">
                <UploadCloud className="h-3.5 w-3.5" /> Pick
              </button>
            </div>
            <img src={form.image} alt="" className="mt-2 h-24 w-full rounded-2xl object-cover" />
          </div>

          <div>
            <label className="label">Tags (comma separated)</label>
            <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="spicy, popular" className="field" />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(event) => setForm({ ...form, isAvailable: event.target.checked })}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              Available today
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              Featured (kitchen favourite)
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label">Add-ons</label>
              <button
                type="button"
                onClick={() => setForm({ ...form, addons: [...form.addons, { name: "", price: 1000 }] })}
                className="text-xs font-semibold text-brand-700"
              >
                + Add extra
              </button>
            </div>
            <div className="space-y-2">
              {form.addons.map((addon, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    value={addon.name}
                    onChange={(event) => {
                      const next = [...form.addons];
                      next[index] = { ...next[index], name: event.target.value };
                      setForm({ ...form, addons: next });
                    }}
                    placeholder="Extra name"
                    className="field flex-1"
                  />
                  <input
                    type="number"
                    value={addon.price}
                    onChange={(event) => {
                      const next = [...form.addons];
                      next[index] = { ...next[index], price: Number(event.target.value) };
                      setForm({ ...form, addons: next });
                    }}
                    className="field w-28"
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, addons: form.addons.filter((_, i) => i !== index) })}
                    className="rounded-full bg-brand-50 p-2 text-brand-700 hover:bg-brand-100"
                    aria-label="Remove addon"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {form.addons.length === 0 ? <p className="text-xs text-ink-400">No extras. Add cheese, sauces, sides…</p> : null}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost btn-sm">
              Cancel
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create meal"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={imagePickerOpen} onClose={() => setImagePickerOpen(false)} title="Choose an image" size="lg">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => {
                setForm({ ...form, image: src });
                setImagePickerOpen(false);
              }}
              className={`overflow-hidden rounded-2xl border-2 transition ${form.image === src ? "border-brand-600" : "border-transparent hover:border-ink-300"}`}
            >
              <img src={src} alt="" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
