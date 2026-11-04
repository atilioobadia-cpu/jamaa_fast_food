import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { formatTZS } from "@shared/types";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

export function CartDrawer() {
  const { lines, subtotal, count, isOpen, closeCart, setQuantity, remove, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const goToCheckout = () => {
    closeCart();
    if (!user) {
      navigate("/login?next=/checkout&reason=checkout");
      return;
    }
    navigate("/checkout");
  };

  return (
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label="Your cart">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm animate-fade-in" onClick={closeCart} aria-hidden />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-cream shadow-lift animate-slide-in-right">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Your order</h2>
            <p className="text-xs text-ink-500">{count === 0 ? "Nothing added yet" : `${count} item${count === 1 ? "" : "s"}`}</p>
          </div>
          <button
            type="button"
            onClick={closeCart}
            className="rounded-full bg-white p-2 text-ink-500 shadow-soft transition hover:text-ink-900"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <ShoppingBag className="h-7 w-7" />
              </div>
              <p className="mt-4 text-base font-semibold text-ink-800">Your cart is empty</p>
              <p className="mt-1 max-w-xs text-sm text-ink-500">Browse the menu and add something delicious from the Jamaa kitchen.</p>
              <Link to="/menu" onClick={closeCart} className="btn-primary mt-5">
                Browse the menu
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => {
                const addonTotal = line.addonIds.reduce(
                  (sum, id) => sum + (line.snapshot.addons.find((addon) => addon.id === id)?.price ?? 0),
                  0,
                );
                const unit = line.snapshot.price + addonTotal;
                const chosenAddons = line.snapshot.addons.filter((addon) => line.addonIds.includes(addon.id));
                return (
                  <li key={line.key} className="rounded-3xl border border-ink-100 bg-white p-3 shadow-soft">
                    <div className="flex gap-3">
                      <img
                        src={line.snapshot.image}
                        alt={line.snapshot.name}
                        className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-ink-900">{line.snapshot.name}</p>
                          <button
                            type="button"
                            onClick={() => remove(line.key)}
                            className="rounded-full p-1 text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                            aria-label={`Remove ${line.snapshot.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {chosenAddons.length ? (
                          <p className="mt-0.5 text-[11px] text-ink-500">+ {chosenAddons.map((addon) => addon.name).join(", ")}</p>
                        ) : null}
                        {line.instructions ? <p className="mt-0.5 text-[11px] italic text-ink-400">“{line.instructions}”</p> : null}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 rounded-full border border-ink-200 p-0.5">
                            <button
                              type="button"
                              onClick={() => setQuantity(line.key, line.quantity - 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-6 text-center text-xs font-bold text-ink-800">{line.quantity}</span>
                            <button
                              type="button"
                              onClick={() => setQuantity(line.key, line.quantity + 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-sm font-bold text-ink-900">{formatTZS(unit * line.quantity)}</p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {lines.length > 0 ? (
          <div className="border-t border-ink-200 bg-white px-5 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-500">Subtotal</span>
              <span className="font-bold text-ink-900">{formatTZS(subtotal)}</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">Delivery fee is calculated on the checkout page.</p>
            <button type="button" onClick={goToCheckout} className="btn-primary mt-3 w-full">
              Continue to checkout
            </button>
            <div className="mt-2 flex items-center justify-between">
              <Link to="/menu" onClick={closeCart} className="text-xs font-semibold text-ink-500 hover:text-brand-700">
                Add more items
              </Link>
              <button type="button" onClick={clear} className="text-xs font-semibold text-ink-400 hover:text-brand-700">
                Clear cart
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
