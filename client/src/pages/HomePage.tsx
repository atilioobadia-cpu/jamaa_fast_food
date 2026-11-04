import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { formatTZS, type MenuItem } from "@shared/types";
import { RESTAURANT } from "@shared/config";
import { usePublicData } from "@/context/PublicDataContext";
import { MenuItemCard, ItemSheet, SignInPrompt } from "@/components/MenuItem";
import { LoadingPanel } from "@/components/Feedback";

export function HomePage() {
  const { categories, items, loading } = usePublicData();
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [reference, setReference] = useState("");
  const navigate = useNavigate();

  const featured = items.filter((item) => item.isFeatured && item.isAvailable).slice(0, 4);
  const popular = featured.length ? featured : items.filter((item) => item.isAvailable).slice(0, 4);
  const cheapest = items.reduce((min, item) => Math.min(min, item.price), Number.POSITIVE_INFINITY);

  const trackOrder = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = reference.trim().toUpperCase();
    if (trimmed) navigate(`/track/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-cream via-cream to-white" />
        <div className="absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-gold-200/40 blur-3xl" />
        <div className="absolute -left-32 top-40 -z-10 h-80 w-80 rounded-full bg-brand-200/40 blur-3xl" />

        <div className="container grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-20">
          <div className="animate-fade-up">
            <span className="chip border-brand-200 bg-white/80 text-brand-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Open now · {RESTAURANT.shortAddress}
            </span>

            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] text-ink-900 sm:text-5xl lg:text-6xl">
              Fresh, fast and full of flavour.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
              Tanzanian favourites and flame-grilled classics, cooked to order by the Jamaa kitchen. Get it delivered,
              collect it, or eat with us in the city centre.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/menu" className="btn-primary text-base">
                Start your order <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/track" className="btn-ghost text-base">
                <MapPin className="h-4 w-4" /> Track an order
              </Link>
            </div>

            <dl className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              {[
                { icon: Clock, label: "Kitchen to door", value: "25–40 min" },
                { icon: Star, label: "Meals from", value: formatTZS(cheapest) },
                { icon: ShieldCheck, label: "Payments", value: "Demo mode" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3 shadow-soft">
                  <stat.icon className="h-4 w-4 text-brand-600" />
                  <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{stat.label}</dt>
                  <dd className="text-sm font-bold text-ink-800">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative animate-scale-in">
            <div className="overflow-hidden rounded-[2.5rem] border-4 border-white bg-ink-100 shadow-lift">
              <img
                src="/images/food/hero-feast.jpg"
                alt="A Jamaa Feast spread with grilled chicken, pilau, fries and fresh juice"
                className="h-[280px] w-full object-cover sm:h-[380px] lg:h-[460px]"
              />
            </div>

            <div className="absolute -bottom-5 left-4 right-4 rounded-3xl border border-ink-100 bg-white/95 p-3 shadow-lift backdrop-blur sm:left-6 sm:right-auto sm:w-72">
              <div className="flex items-center gap-3">
                <img src="/images/food/fried-chicken.jpg" alt="" className="h-14 w-14 rounded-2xl object-cover" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gold-600">Popular now</p>
                  <p className="truncate text-sm font-bold text-ink-900">Half Grilled Chicken</p>
                  <p className="text-xs text-ink-500">{formatTZS(18000)} · 25 min</p>
                </div>
              </div>
            </div>

            <div className="absolute -right-2 -top-3 hidden rotate-3 rounded-2xl bg-gold-400 px-4 py-3 text-center shadow-lift sm:block">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-900/70">Delivery from</p>
              <p className="text-lg font-extrabold text-ink-900">{formatTZS(2500)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="container py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">What are you craving?</p>
            <h2 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">Browse by category</h2>
          </div>
          <Link to="/menu" className="link hidden text-sm sm:inline-flex">
            Full menu <ArrowRight className="ml-1 inline h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {loading
            ? Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-32 animate-pulse rounded-3xl bg-ink-100" />
              ))
            : categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/menu?category=${category.slug}`}
                  className="group relative overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft transition hover:-translate-y-1 hover:shadow-lift"
                >
                  <img
                    src={category.image}
                    alt={category.name}
                    loading="lazy"
                    className="h-32 w-full object-cover transition duration-500 group-hover:scale-105 sm:h-36"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-900/85 via-ink-900/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="text-sm font-bold text-white">{category.name}</p>
                    <p className="line-clamp-1 text-[10px] text-white/75">{category.tagline}</p>
                  </div>
                </Link>
              ))}
        </div>
      </section>

      {/* Featured */}
      <section className="container py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold-600">
              <Sparkles className="h-3.5 w-3.5" /> Kitchen favourites
            </p>
            <h2 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">Crowd pleasers, ready to order</h2>
          </div>
          <Link to="/menu" className="link text-sm">
            See everything <ArrowRight className="ml-1 inline h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <LoadingPanel label="Loading today's menu" />
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((item) => (
              <MenuItemCard key={item.id} item={item} onOpen={setActiveItem} />
            ))}
          </div>
        )}
      </section>

      {/* Service modes */}
      <section className="container py-8 sm:py-12">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              icon: Bike,
              title: "Delivery",
              body: "Drop a pin on the map, confirm your spot and follow the rider live to your door.",
              meta: "From TZS 2,500 · 25–40 min",
              tone: "bg-brand-600 text-white",
            },
            {
              icon: Store,
              title: "Takeaway",
              body: "Order ahead and choose a collection time. Your food is packed and waiting at the counter.",
              meta: "No delivery fee · collect in 15–25 min",
              tone: "bg-gold-400 text-ink-900",
            },
            {
              icon: UtensilsCrossed,
              title: "Dine-in",
              body: "Let the kitchen know you are coming and add notes for your table. No table booking needed.",
              meta: "Eat in at Samora Machel Ave",
              tone: "bg-ink-800 text-white",
            },
          ].map((mode) => (
            <div key={mode.title} className="card overflow-hidden p-6">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${mode.tone}`}>
                <mode.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-ink-900">{mode.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{mode.body}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-400">{mode.meta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container py-8 sm:py-12">
        <div className="rounded-[2.5rem] bg-white p-6 shadow-soft sm:p-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Simple from start to finish</p>
            <h2 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">Four steps to a full table</h2>
          </div>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: UtensilsCrossed, title: "Pick your meals", body: "Browse the menu, add extras and leave notes for the kitchen." },
              { icon: MapPin, title: "Confirm where", body: "Choose delivery, takeaway or dine-in. Delivery uses your exact map pin." },
              { icon: CreditCard, title: "Pay in demo mode", body: "Enter the amount shown. No real money moves in this prototype." },
              { icon: PackageCheck, title: "Follow it live", body: "Watch each status change and track the rider until it arrives." },
            ].map((step, index) => (
              <li key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-3xl font-extrabold text-ink-100">0{index + 1}</span>
                </div>
                <h3 className="mt-3 text-base font-bold text-ink-900">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-500">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Tracking */}
      <section className="container py-8 sm:py-12">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-ink-800 p-6 text-white sm:p-10">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-600/40 blur-3xl" />
          <div className="absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold-300">
                <Bike className="h-4 w-4" /> Live delivery tracking
              </p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Already ordered? Follow every step.</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/70">
                Enter your order reference to see the kitchen status, rider position and estimated arrival. Your
                reference starts with JFF and appears on your receipt.
              </p>
              <form onSubmit={trackOrder} className="mt-5 flex flex-col gap-2 sm:flex-row">
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="JFF-261104-0001"
                  aria-label="Order reference"
                  className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-gold-300 focus:outline-none focus:ring-2 focus:ring-gold-300/40 sm:max-w-xs"
                />
                <button type="submit" className="btn-gold">
                  Track order
                </button>
              </form>
            </div>
            <ul className="space-y-3">
              {[
                { icon: CheckCircle2, text: "Status history with the person and time behind every change" },
                { icon: Bike, text: "Rider GPS positions streamed live over a secure socket" },
                { icon: MapPin, text: "Exact drop-off pin saved with your order, never just an address" },
                { icon: ShieldCheck, text: "Only you and the Jamaa team can see your order" },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
                  <span className="text-sm text-white/80">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <ItemSheet item={activeItem} onClose={() => setActiveItem(null)} onSignInRequired={() => setSignInOpen(true)} />
      <SignInPrompt open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
