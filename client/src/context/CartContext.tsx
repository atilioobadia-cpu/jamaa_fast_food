import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { Addon, CartLineInput, MenuItem } from "@shared/types";

export interface CartLine {
  key: string;
  itemId: number;
  quantity: number;
  addonIds: number[];
  instructions: string;
  /** Snapshot for instant UI; the server reprices every order. */
  snapshot: {
    name: string;
    image: string;
    price: number;
    addons: Addon[];
  };
}

interface CartState {
  lines: CartLine[];
}

type Action =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; line: Omit<CartLine, "key"> }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "remove"; key: string }
  | { type: "clear" };

const STORAGE_KEY = "jamaa.cart.v1";

function lineKey(itemId: number, addonIds: number[], instructions: string): string {
  return `${itemId}|${[...addonIds].sort((a, b) => a - b).join(",")}|${instructions.trim().toLowerCase()}`;
}

function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "hydrate":
      return { lines: action.lines };
    case "add": {
      const key = lineKey(action.line.itemId, action.line.addonIds, action.line.instructions);
      const existing = state.lines.find((line) => line.key === key);
      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.key === key ? { ...line, quantity: Math.min(20, line.quantity + action.line.quantity) } : line,
          ),
        };
      }
      return { lines: [...state.lines, { ...action.line, key }] };
    }
    case "setQuantity":
      return {
        lines: state.lines
          .map((line) => (line.key === action.key ? { ...line, quantity: Math.max(0, Math.min(20, action.quantity)) } : line))
          .filter((line) => line.quantity > 0),
      };
    case "remove":
      return { lines: state.lines.filter((line) => line.key !== action.key) };
    case "clear":
      return { lines: [] };
    default:
      return state;
  }
}

export interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (item: MenuItem, options: { quantity: number; addonIds: number[]; instructions: string }) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  toInput: () => CartLineInput[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function readStored(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line) =>
        line &&
        typeof line.itemId === "number" &&
        typeof line.quantity === "number" &&
        line.quantity > 0 &&
        Array.isArray(line.addonIds) &&
        line.snapshot &&
        typeof line.snapshot.price === "number",
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { lines: [] });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    dispatch({ type: "hydrate", lines: readStored() });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines));
    } catch {
      /* storage full or blocked — the cart still works for this session */
    }
  }, [state.lines]);

  const add = useCallback<CartContextValue["add"]>((item, options) => {
    dispatch({
      type: "add",
      line: {
        itemId: item.id,
        quantity: options.quantity,
        addonIds: options.addonIds,
        instructions: options.instructions,
        snapshot: {
          name: item.name,
          image: item.image,
          price: item.price,
          addons: item.addons,
        },
      },
    });
    setIsOpen(true);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const lines = state.lines;
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce((sum, line) => {
      const addonTotal = line.addonIds.reduce(
        (addonSum, id) => addonSum + (line.snapshot.addons.find((addon) => addon.id === id)?.price ?? 0),
        0,
      );
      return sum + (line.snapshot.price + addonTotal) * line.quantity;
    }, 0);

    return {
      lines,
      count,
      subtotal,
      add,
      setQuantity: (key, quantity) => dispatch({ type: "setQuantity", key, quantity }),
      remove: (key) => dispatch({ type: "remove", key }),
      clear: () => dispatch({ type: "clear" }),
      toInput: () =>
        lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          addonIds: line.addonIds,
          instructions: line.instructions,
        })),
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
    };
  }, [state.lines, add, isOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
