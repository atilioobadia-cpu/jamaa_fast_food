import { all, get, nowIso, resetDatabase, run, transaction } from "./db.js";
import { pathToFileURL } from "node:url";
import { hashPassword, pickAvatarColor } from "./auth.js";
import { quoteOrder } from "./lib/pricing.js";
import { createOrder, assignDriver, transitionOrder } from "./lib/orders.js";
import { startTrackingSession, storePoint } from "./lib/tracking.js";
import { getPaymentProvider } from "./lib/payments.js";
import { RESTAURANT } from "../../shared/config.js";
import type { CartLineInput, OrderStatus, OrderType, SessionUser } from "../../shared/types.js";

interface SeedItem {
  name: string;
  description: string;
  price: number;
  image: string;
  prepMinutes: number;
  tags: string[];
  featured?: boolean;
  badge?: string | null;
  addonSet: string;
}

const CATEGORIES = [
  { slug: "breakfast", name: "Breakfast", tagline: "Start your day the Jamaa way", image: "/images/food/chapati.jpg" },
  { slug: "lunch", name: "Lunch", tagline: "Hearty plates, ready when you are", image: "/images/food/pilau.jpg" },
  { slug: "dinner", name: "Dinner", tagline: "Charcoal-grilled favourites for the evening", image: "/images/food/grilled-chicken.jpg" },
  { slug: "other", name: "Other Items", tagline: "Snacks, sides and little extras", image: "/images/food/samosa.jpg" },
  { slug: "drinks", name: "Drinks", tagline: "Fresh juices, shakes and sodas", image: "/images/food/juice-orange.jpg" },
];

const ADDON_SETS: Record<string, Array<{ name: string; price: number }>> = {
  burger: [
    { name: "Extra cheese", price: 1500 },
    { name: "Extra beef patty", price: 4000 },
    { name: "Extra Jamaa sauce", price: 500 },
    { name: "Jalapeños", price: 1000 },
  ],
  chips: [
    { name: "Cheese sauce", price: 1500 },
    { name: "Extra kachumbari", price: 1000 },
    { name: "Add a chicken piece", price: 3000 },
  ],
  plate: [
    { name: "Extra kachumbari", price: 1000 },
    { name: "Extra chilli sauce", price: 500 },
    { name: "Add chapati", price: 1000 },
    { name: "Add a soda", price: 2000 },
  ],
  breakfast: [
    { name: "Extra chapati", price: 1000 },
    { name: "Extra egg", price: 1000 },
    { name: "Add sausage", price: 2500 },
  ],
  sandwich: [
    { name: "Extra chips", price: 2500 },
    { name: "Extra chicken", price: 3000 },
    { name: "Add avocado", price: 2000 },
  ],
  grill: [
    { name: "Extra chips", price: 2500 },
    { name: "Extra chilli sauce", price: 500 },
    { name: "Side kachumbari", price: 1000 },
  ],
  snacks: [
    { name: "Two extra samosas", price: 1600 },
    { name: "Tamarind dip", price: 500 },
  ],
  drinks: [
    { name: "Large size", price: 1500 },
    { name: "Whipped cream", price: 1000 },
    { name: "Extra ice", price: 0 },
  ],
};

const ITEMS: Record<string, SeedItem[]> = {
  breakfast: [
    {
      name: "Chapati & Chai Combo",
      description: "Two soft chapatis served with a hot cup of spiced chai and a boiled egg.",
      price: 6000,
      image: "/images/food/chapati.jpg",
      prepMinutes: 10,
      tags: ["Vegetarian"],
      featured: true,
      addonSet: "breakfast",
    },
    {
      name: "Chips Mayai",
      description: "Dar's classic: golden chips folded into a fluffy three-egg omelette with fresh kachumbari.",
      price: 7000,
      image: "/images/food/chips-mayai.jpg",
      prepMinutes: 12,
      tags: ["Local favourite"],
      featured: true,
      badge: "Bestseller",
      addonSet: "plate",
    },
    {
      name: "Breakfast Club Sandwich",
      description: "Toasted triple-decker with chicken, egg, tomato and lettuce. Served with chips.",
      price: 9500,
      image: "/images/food/club-sandwich.jpg",
      prepMinutes: 15,
      tags: ["High protein"],
      addonSet: "sandwich",
    },
    {
      name: "Mandazi & Chai",
      description: "Four warm mandazi with a cup of chai taratibu. Perfect for a quick morning stop.",
      price: 4000,
      image: "/images/food/tea.jpg",
      prepMinutes: 8,
      tags: ["Vegetarian"],
      addonSet: "breakfast",
    },
  ],
  lunch: [
    {
      name: "Jamaa Beef Burger",
      description:
        "Flame-grilled beef patty, cheddar, lettuce, tomato and our secret Jamaa sauce in a brioche bun. Served with chips.",
      price: 13000,
      image: "/images/food/cheeseburger.jpg",
      prepMinutes: 18,
      tags: ["Bestseller"],
      featured: true,
      badge: "Bestseller",
      addonSet: "burger",
    },
    {
      name: "Double Beef Burger",
      description: "Two grilled patties, double cheese and caramelised onions. Built for serious appetites.",
      price: 17500,
      image: "/images/food/double-burger.jpg",
      prepMinutes: 20,
      tags: ["New"],
      featured: true,
      addonSet: "burger",
    },
    {
      name: "Pilau ya Nyama",
      description: "Fragrant spiced rice slow-cooked with tender beef, served with kachumbari.",
      price: 9500,
      image: "/images/food/pilau.jpg",
      prepMinutes: 15,
      tags: ["Local favourite"],
      addonSet: "plate",
    },
    {
      name: "Kuku na Chipsi",
      description: "Quarter grilled chicken with a generous portion of chips and chilli sauce.",
      price: 14000,
      image: "/images/food/chicken-chips.jpg",
      prepMinutes: 20,
      tags: ["Grilled"],
      featured: true,
      addonSet: "grill",
    },
    {
      name: "Club Sandwich",
      description: "Triple-decker chicken and egg sandwich with chips and a side salad.",
      price: 11000,
      image: "/images/food/club-sandwich.jpg",
      prepMinutes: 15,
      tags: [],
      addonSet: "sandwich",
    },
    {
      name: "Fried Chicken & Chips",
      description: "Three pieces of crispy fried chicken with chips, coleslaw and a dip of your choice.",
      price: 16000,
      image: "/images/food/fried-chicken.jpg",
      prepMinutes: 18,
      tags: ["Crispy"],
      addonSet: "chips",
    },
    {
      name: "Mishkaki (5 skewers)",
      description: "Five beef skewers marinated overnight, grilled over charcoal and served with kachumbari.",
      price: 10000,
      image: "/images/food/mishkaki.jpg",
      prepMinutes: 22,
      tags: ["Charcoal grilled"],
      addonSet: "grill",
    },
  ],
  dinner: [
    {
      name: "Half Grilled Chicken & Chips",
      description: "Half chicken marinated in garlic and ginger, charcoal grilled, with chips and kachumbari.",
      price: 18000,
      image: "/images/food/grilled-chicken.jpg",
      prepMinutes: 25,
      tags: ["Chef's pick"],
      featured: true,
      badge: "Chef's pick",
      addonSet: "grill",
    },
    {
      name: "Jamaa Family Bucket",
      description: "Eight pieces of crispy chicken, large chips, coleslaw and four dips. Feeds the whole table.",
      price: 34000,
      image: "/images/food/fried-chicken.jpg",
      prepMinutes: 25,
      tags: ["Family"],
      addonSet: "chips",
    },
    {
      name: "Pilau & Kachumbari Platter",
      description: "Our signature pilau plated for two with kachumbari and extra chilli.",
      price: 12000,
      image: "/images/food/pilau.jpg",
      prepMinutes: 18,
      tags: ["Sharing"],
      addonSet: "plate",
    },
  ],
  other: [
    {
      name: "Samosa (4 pcs)",
      description: "Crisp pastry filled with spiced beef, served with tamarind dip.",
      price: 3500,
      image: "/images/food/samosa.jpg",
      prepMinutes: 8,
      tags: ["Snack"],
      addonSet: "snacks",
    },
    {
      name: "Chipsi & Kachumbari",
      description: "Golden fries tossed in chilli salt with fresh kachumbari on the side.",
      price: 5000,
      image: "/images/food/fries.jpg",
      prepMinutes: 10,
      tags: ["Vegetarian"],
      addonSet: "chips",
    },
  ],
  drinks: [
    {
      name: "Fresh Orange Juice",
      description: "Freshly squeezed Tanzanian oranges, no added sugar.",
      price: 4500,
      image: "/images/food/juice-orange.jpg",
      prepMinutes: 4,
      tags: ["Fresh"],
      featured: true,
      addonSet: "drinks",
    },
    {
      name: "Mango Smoothie",
      description: "Ripe mango blended with yoghurt and a touch of honey.",
      price: 5500,
      image: "/images/food/juice-mango.jpg",
      prepMinutes: 5,
      tags: ["Fresh"],
      addonSet: "drinks",
    },
    {
      name: "Soda (500 ml)",
      description: "Chilled bottle of Coca-Cola, Fanta or Sprite. Tell us your pick in the order notes.",
      price: 2000,
      image: "/images/food/cola.jpg",
      prepMinutes: 2,
      tags: ["Chilled"],
      addonSet: "drinks",
    },
    {
      name: "Spiced Chai",
      description: "Hot Tanzanian chai brewed with cardamom and ginger.",
      price: 1500,
      image: "/images/food/tea.jpg",
      prepMinutes: 3,
      tags: ["Hot"],
      addonSet: "drinks",
    },
    {
      name: "Vanilla Milkshake",
      description: "Thick vanilla shake topped with whipped cream.",
      price: 6500,
      image: "/images/food/milkshake.jpg",
      prepMinutes: 6,
      tags: [],
      addonSet: "drinks",
    },
  ],
};

interface SeedUser {
  role: "customer" | "staff" | "admin" | "driver";
  fullName: string;
  phone: string;
  email: string;
  password: string;
  vehicle?: string;
}

const USERS: SeedUser[] = [
  {
    role: "admin",
    fullName: "Amani Mwinyi",
    phone: "+255712000001",
    email: "staff@jamaa.co.tz",
    password: "Staff@1234",
  },
  {
    role: "staff",
    fullName: "Neema Kimaro",
    phone: "+255712000002",
    email: "kitchen@jamaa.co.tz",
    password: "Kitchen@1234",
  },
  {
    role: "driver",
    fullName: "Juma Said",
    phone: "+255712000003",
    email: "driver@jamaa.co.tz",
    password: "Driver@1234",
    vehicle: "Bajaj RE · T 123 DAR",
  },
  {
    role: "driver",
    fullName: "Hassan Ally",
    phone: "+255712000004",
    email: "driver2@jamaa.co.tz",
    password: "Driver@1234",
    vehicle: "Motorcycle · MC 884 JFF",
  },
  {
    role: "customer",
    fullName: "Amina Hassan",
    phone: "+255713000001",
    email: "demo@jamaa.co.tz",
    password: "Demo@1234",
  },
  {
    role: "customer",
    fullName: "Baraka Joseph",
    phone: "+255713000002",
    email: "baraka@jamaa.co.tz",
    password: "Demo@1234",
  },
];

function seedUsers() {
  const timestamp = nowIso();
  for (const user of USERS) {
    run(
      `INSERT INTO users (role, full_name, phone, email, password_hash, vehicle, avatar_color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.role,
        user.fullName,
        user.phone,
        user.email,
        hashPassword(user.password),
        user.vehicle ?? null,
        pickAvatarColor(user.fullName),
        timestamp,
      ],
    );
  }
}

function seedMenu() {
  const timestamp = nowIso();
  CATEGORIES.forEach((category, categoryIndex) => {
    const result = run(
      "INSERT INTO categories (slug, name, tagline, image, sort_order) VALUES (?, ?, ?, ?, ?)",
      [category.slug, category.name, category.tagline, category.image, categoryIndex],
    );
    const categoryId = Number(result.lastInsertRowid);
    (ITEMS[category.slug] ?? []).forEach((item, itemIndex) => {
      const itemResult = run(
        `INSERT INTO menu_items (category_id, name, description, price, image, is_available, is_featured, badge,
          prep_minutes, tags, sold_count, erp_item_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          categoryId,
          item.name,
          item.description,
          item.price,
          item.image,
          item.featured ? 1 : 0,
          item.badge ?? null,
          item.prepMinutes,
          JSON.stringify(item.tags),
          Math.floor(40 + Math.random() * 260),
          `JFF-${category.slug.toUpperCase().slice(0, 3)}-${String(itemIndex + 1).padStart(3, "0")}`,
          timestamp,
          timestamp,
        ],
      );
      const itemId = Number(itemResult.lastInsertRowid);
      for (const addon of ADDON_SETS[item.addonSet] ?? []) {
        run("INSERT INTO addons (menu_item_id, name, price) VALUES (?, ?, ?)", [itemId, addon.name, addon.price]);
      }
    });
  });
}

function usersByRole(role: string) {
  return all<{ id: number; role: string; full_name: string; phone: string; email: string; avatar_color: string }>(
    "SELECT * FROM users WHERE role = ? ORDER BY id",
    [role],
  );
}

function asActor(userId: number, role: "staff" | "admin"): SessionUser {
  const row = get<{ id: number; role: string; full_name: string; email: string; phone: string; avatar_color: string }>(
    "SELECT id, role, full_name, email, phone, avatar_color FROM users WHERE id = ?",
    [userId],
  )!;
  return {
    id: row.id,
    role,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    avatarColor: row.avatar_color,
  };
}

function backdate(orderId: number, minutesAgo: number) {
  const base = Date.now() - minutesAgo * 60 * 1000;
  const events = all<{ id: number }>("SELECT id FROM order_events WHERE order_id = ? ORDER BY id", [orderId]);
  const step = events.length > 1 ? Math.min(6, Math.max(1, Math.floor(minutesAgo / events.length))) * 60 * 1000 : 0;
  events.forEach((event, index) => {
    run("UPDATE order_events SET created_at = ? WHERE id = ?", [new Date(base + index * step).toISOString(), event.id]);
  });
  const createdAt = new Date(base).toISOString();
  const updatedAt = new Date(base + Math.max(0, events.length - 1) * step).toISOString();
  run("UPDATE orders SET created_at = ?, updated_at = ? WHERE id = ?", [createdAt, updatedAt, orderId]);
  run("UPDATE payments SET created_at = ? WHERE order_id = ?", [createdAt, orderId]);
  run("UPDATE notifications SET created_at = ? WHERE order_id = ?", [createdAt, orderId]);
  const points = all<{ id: number }>(
    "SELECT id FROM tracking_points WHERE session_id IN (SELECT id FROM tracking_sessions WHERE order_id = ?) ORDER BY id",
    [orderId],
  );
  points.forEach((point, index) => {
    run("UPDATE tracking_points SET recorded_at = ? WHERE id = ?", [
      new Date(base + index * 30 * 1000).toISOString(),
      point.id,
    ]);
  });
}

interface SeedOrder {
  customerIndex: number;
  type: OrderType;
  status: OrderStatus;
  minutesAgo: number;
  lines: CartLineInput[];
  notes?: string;
  scheduledOffsetMinutes?: number;
  dineInNote?: string;
  delivery?: { address: string; instructions: string; lat: number; lng: number };
  driverIndex?: number;
  startTracking?: boolean;
}

const DELIVERY_A = {
  address: "Nyerere Road, Plot 45, Mikocheni B, Dar es Salaam",
  instructions: "Blue gate opposite the Total filling station. Call on arrival, 3rd floor.",
  lat: -6.7716,
  lng: 39.2395,
};
const DELIVERY_B = {
  address: "Airport Road, Karakana Plaza, Ground floor, Dar es Salaam",
  instructions: "Next to the pharmacy. Hand the order to the reception desk.",
  lat: -6.8085,
  lng: 39.2347,
};

async function seedOrders() {
  const customers = usersByRole("customer");
  const drivers = usersByRole("driver");
  const staff = usersByRole("staff")[0];
  const admin = usersByRole("admin")[0];
  const adminActor = asActor(admin.id, "admin");

  const defs: SeedOrder[] = [
    {
      customerIndex: 0,
      type: "delivery",
      status: "completed",
      minutesAgo: 24 * 60,
      lines: [
        { itemId: 5, quantity: 1, addonIds: [] },
        { itemId: 15, quantity: 1, addonIds: [] },
      ],
      delivery: DELIVERY_A,
      driverIndex: 0,
      notes: "Extra napkins please.",
    },
    {
      customerIndex: 1,
      type: "takeaway",
      status: "ready_for_collection",
      minutesAgo: 95,
      lines: [
        { itemId: 6, quantity: 2, addonIds: [] },
        { itemId: 19, quantity: 2, addonIds: [] },
      ],
    },
    {
      customerIndex: 1,
      type: "delivery",
      status: "out_for_delivery",
      minutesAgo: 42,
      lines: [
        { itemId: 12, quantity: 1, addonIds: [] },
        { itemId: 16, quantity: 1, addonIds: [] },
      ],
      delivery: DELIVERY_B,
      driverIndex: 0,
      startTracking: true,
      notes: "No onions on the burger.",
    },
    {
      customerIndex: 0,
      type: "dine_in",
      status: "waiting_confirmation",
      minutesAgo: 18,
      lines: [
        { itemId: 4, quantity: 2, addonIds: [] },
        { itemId: 21, quantity: 2, addonIds: [] },
      ],
      dineInNote: "Free booth near the window, server will seat us.",
      notes: "One plate should be mild.",
    },
    {
      customerIndex: 0,
      type: "delivery",
      status: "waiting_confirmation",
      minutesAgo: 6,
      lines: [
        { itemId: 7, quantity: 1, addonIds: [] },
        { itemId: 15, quantity: 2, addonIds: [] },
      ],
      delivery: DELIVERY_A,
      notes: "Please ring the bell twice.",
    },
    {
      customerIndex: 1,
      type: "delivery",
      status: "cancelled",
      minutesAgo: 3 * 60,
      lines: [{ itemId: 14, quantity: 1, addonIds: [] }],
      delivery: DELIVERY_B,
    },
  ];

  for (const def of defs) {
    const customer = customers[def.customerIndex];

    // Attach the first available extra to each seeded line so receipts show add-on handling.
    const lines = def.lines.map((line) => ({
      ...line,
      addonIds: all<{ id: number }>("SELECT id FROM addons WHERE menu_item_id = ? ORDER BY id LIMIT 1", [
        line.itemId,
      ]).map((row) => row.id),
    }));

    const quote = quoteOrder(lines, def.type, def.delivery ? { lat: def.delivery.lat, lng: def.delivery.lng } : null);
    const provider = getPaymentProvider("demo");
    const charge = await provider.charge({
      amountDue: quote.total,
      amountEntered: quote.total,
      currency: "TZS",
      idempotencyKey: `seed-${Math.random().toString(36).slice(2)}`,
      orderReference: "seed",
    });

    const order = createOrder({
      customerId: customer.id,
      orderType: def.type,
      quote,
      notes: def.notes ?? null,
      dineInNote: def.dineInNote ?? null,
      scheduledFor:
        def.type === "takeaway"
          ? new Date(Date.now() + (def.scheduledOffsetMinutes ?? 30) * 60 * 1000).toISOString()
          : null,
      delivery: def.delivery
        ? {
            address: def.delivery.address,
            instructions: def.delivery.instructions,
            lat: def.delivery.lat,
            lng: def.delivery.lng,
            accuracy: 12,
            source: "gps",
            confirmed: true,
          }
        : null,
      payment: {
        reference: charge.reference,
        method: charge.method,
        amount: charge.amount,
        idempotencyKey: `seed-${Math.random().toString(36).slice(2)}`,
        payload: charge.payload,
      },
    });

    if (def.driverIndex !== undefined) {
      assignDriver(order.id, drivers[def.driverIndex].id, adminActor);
    }

    // Replay the status pipeline up to the seeded status.
    for (const next of statusPipeline(def.type, def.status)) {
      transitionOrder(order.id, next, {
        actor: { id: staff.id, name: staff.full_name, role: "staff" },
        note:
          next === "cancelled"
            ? "Customer requested cancellation before dispatch."
            : next === "confirmed"
              ? "Accepted by the kitchen."
              : null,
      });
    }

    if (def.startTracking && def.driverIndex !== undefined && def.delivery) {
      const session = startTrackingSession(order.id, drivers[def.driverIndex].id);
      const start = { lat: RESTAURANT.coords.lat + 0.004, lng: RESTAURANT.coords.lng + 0.004 };
      const steps = 8;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const lat = start.lat + (def.delivery.lat - start.lat) * t * 0.7;
        const lng = start.lng + (def.delivery.lng - start.lng) * t * 0.7;
        storePoint(session, lat, lng, 10 + i, "simulator");
      }
      run("UPDATE tracking_sessions SET is_demo = 1 WHERE id = ?", [session.id]);
    }

    backdate(order.id, def.minutesAgo);
  }
}

function statusPipeline(type: OrderType, target: OrderStatus): OrderStatus[] {
  const flows: Record<OrderType, OrderStatus[]> = {
    delivery: ["waiting_confirmation", "confirmed", "processing", "packing", "out_for_delivery", "delivered", "completed"],
    takeaway: ["waiting_confirmation", "confirmed", "processing", "packing", "ready_for_collection", "completed"],
    dine_in: ["waiting_confirmation", "confirmed", "processing", "ready_for_collection", "completed"],
  };
  if (target === "cancelled") return ["cancelled"];
  const flow = flows[type];
  const index = flow.indexOf(target);
  return flow.slice(1, index + 1);
}

export async function seedDemoData(options: { reset?: boolean; quiet?: boolean } = {}) {
  const { reset = false, quiet = false } = options;
  const usersExist = get<{ count: number }>("SELECT COUNT(*) AS count FROM users")?.count ?? 0;
  if (usersExist > 0 && !reset) {
    if (!quiet) console.log("Database already seeded. Use `npm run seed -- --reset` to rebuild the demo data.");
    return;
  }
  if (reset) resetDatabase();

  transaction(() => {
    seedUsers();
    seedMenu();
  });

  await seedOrders();

  const counts = {
    users: get<{ count: number }>("SELECT COUNT(*) AS count FROM users")?.count,
    menuItems: get<{ count: number }>("SELECT COUNT(*) AS count FROM menu_items")?.count,
    orders: get<{ count: number }>("SELECT COUNT(*) AS count FROM orders")?.count,
  };
  if (!quiet) console.log("Seed complete:", counts);
}

const isDirectRun = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  seedDemoData({ reset: process.argv.includes("--reset") }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
