import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Flame, Plus, Star } from "lucide-react";
import { formatTZS, type MenuItem } from "@shared/types";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { Modal } from "@/components/Modal";

export function MenuItemCard({ item, onOpen }: { item: MenuItem; onOpen: (item: MenuItem) => void }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-ink-100 text-left"
        aria-label={`View ${item.name}`}
      >
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          {item.badge ? (
            <span className="rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-soft">
              {item.badge}
            </span>
          ) : <span />}
          {item.isFeatured ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-400 text-ink-900 shadow-soft" title="Kitchen favourite">
              <Star className="h-3.5 w-3.5 fill-current" />
            </span>
          ) : null}
        </div>
        {!item.isAvailable ? (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-900/55">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink-800">Sold out today</span>
          </div>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-snug text-ink-900">{item.name}</h3>
          <p className="shrink-0 text-sm font-bold text-brand-700">{formatTZS(item.price)}</p>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{item.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {item.prepMinutes} min
          </span>
          {item.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-ink-50 px-2 py-0.5 font-medium text-ink-500">
              {tag}
            </span>
          ))}
          {item.soldCount > 40 ? (
            <span className="inline-flex items-center gap-1 text-gold-700">
              <Flame className="h-3 w-3" /> Popular
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onOpen(item)}
          disabled={!item.isAvailable}
          className="btn-soft btn-sm mt-4 w-full"
        >
          <Plus className="h-3.5 w-3.5" /> {item.isAvailable ? "Add to order" : "Unavailable"}
        </button>
      </div>
    </article>
  );
}

interface ItemSheetProps {
  item: MenuItem | null;
  onClose: () => void;
  onSignInRequired: () => void;
}

export function ItemSheet({ item, onClose, onSignInRequired }: ItemSheetProps) {
  const { user } = useAuth();
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [instructions, setInstructions] = useState("");

  const addonTotal = useMemo(
    () => item?.addons.filter((addon) => addonIds.includes(addon.id)).reduce((sum, addon) => sum + addon.price, 0) ?? 0,
    [item, addonIds],
  );

  if (!item) return null;

  const total = (item.price + addonTotal) * quantity;

  const handleAdd = () => {
    if (!user) {
      onClose();
      onSignInRequired();
      return;
    }
    add(item, { quantity, addonIds, instructions });
    setQuantity(1);
    setAddonIds([]);
    setInstructions("");
    onClose();
  };

  return (
    <Modal open={Boolean(item)} onClose={onClose} title={item.name} description={item.description} size="lg">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
          <img src={item.image} alt={item.name} className="h-52 w-full rounded-2xl object-cover sm:h-full" />
          <div className="space-y-3">
            <div className="flex items-baseline justify-between rounded-2xl bg-ink-50 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Price</span>
              <span className="text-lg font-bold text-brand-700">{formatTZS(item.price)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-ink-500">
              <div className="rounded-2xl border border-ink-100 px-3 py-2">
                <span className="block text-[10px] uppercase tracking-wider text-ink-400">Prep time</span>
                <span className="font-semibold text-ink-700">{item.prepMinutes} minutes</span>
              </div>
              <div className="rounded-2xl border border-ink-100 px-3 py-2">
                <span className="block text-[10px] uppercase tracking-wider text-ink-400">Category</span>
                <span className="font-semibold capitalize text-ink-700">{item.categorySlug.replace("_", " ")}</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-ink-500">{item.description}</p>
          </div>
        </div>

        {item.addons.length ? (
          <div>
            <p className="label">Make it yours</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {item.addons.map((addon) => {
                const checked = addonIds.includes(addon.id);
                return (
                  <label
                    key={addon.id}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-sm transition ${
                      checked ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:border-ink-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAddonIds((current) =>
                            checked ? current.filter((id) => id !== addon.id) : [...current, addon.id],
                          )
                        }
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="font-medium text-ink-700">{addon.name}</span>
                    </span>
                    <span className="text-xs font-semibold text-ink-500">+{formatTZS(addon.price)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div>
          <label htmlFor="item-instructions" className="label">
            Special instructions (optional)
          </label>
          <textarea
            id="item-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={240}
            rows={2}
            placeholder="e.g. No onions, extra chilli sauce"
            className="field resize-none"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl bg-ink-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-ink-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-500 hover:bg-ink-50"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="min-w-8 text-center text-sm font-bold text-ink-900">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(20, value + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-500 hover:bg-ink-50"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-400">Line total</p>
              <p className="text-base font-bold text-ink-900">{formatTZS(total)}</p>
            </div>
          </div>
          <button type="button" onClick={handleAdd} className="btn-primary sm:w-auto" disabled={!item.isAvailable}>
            {item.isAvailable ? "Add to cart" : "Sold out"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SignInPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const path = `${window.location.pathname}${window.location.search}`;
  return (
    <Modal open={open} onClose={onClose} title="Sign in to start your order" size="sm">
      <p className="text-sm leading-relaxed text-ink-600">
        Browsing the menu is open to everyone. To add meals to your cart and place an order, sign in with your Jamaa
        account — it only takes a moment.
      </p>
      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={() => navigate(`/login?next=${encodeURIComponent(path)}&reason=cart`)}
          className="btn-primary w-full"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => navigate(`/register?next=${encodeURIComponent(path)}`)}
          className="btn-ghost w-full"
        >
          Create an account
        </button>
      </div>
      <p className="mt-4 rounded-2xl bg-gold-50 px-3 py-2 text-xs text-gold-700">
        Demo customer: <strong>demo@jamaa.co.tz</strong> / <strong>Demo@1234</strong>
      </p>
    </Modal>
  );
}
