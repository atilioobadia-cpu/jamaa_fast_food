import { Link } from "react-router-dom";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { RESTAURANT } from "@shared/config";
import { Logo } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-100 bg-white">
      <div className="container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo className="h-9 w-auto" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-500">{RESTAURANT.tagline}</p>
          <p className="mt-4 text-xs text-ink-400">{RESTAURANT.currencyNote}</p>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink-800">Explore</h3>
          <ul className="mt-4 space-y-2 text-sm text-ink-500">
            <li><Link className="hover:text-brand-700" to="/menu">Full menu</Link></li>
            <li><Link className="hover:text-brand-700" to="/track">Track an order</Link></li>
            <li><Link className="hover:text-brand-700" to="/my-orders">My orders</Link></li>
            <li><Link className="hover:text-brand-700" to="/staff/login">Staff portal</Link></li>
            <li><Link className="hover:text-brand-700" to="/driver/login">Rider portal</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink-800">Kitchen hours</h3>
          <ul className="mt-4 space-y-2 text-sm text-ink-500">
            {RESTAURANT.hours.map((entry) => (
              <li key={entry.days} className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
                <span>
                  <span className="block font-semibold text-ink-700">{entry.days}</span>
                  {entry.time}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink-800">Find us</h3>
          <ul className="mt-4 space-y-2 text-sm text-ink-500">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <span>{RESTAURANT.address}</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-brand-600" />
              <a href={`tel:${RESTAURANT.phoneHref}`} className="hover:text-brand-700">{RESTAURANT.phone}</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-brand-600" />
              <a href={`mailto:${RESTAURANT.email}`} className="hover:text-brand-700">{RESTAURANT.email}</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-ink-100">
        <div className="container flex flex-col items-center justify-between gap-2 py-5 text-xs text-ink-400 sm:flex-row">
          <p>© {new Date().getFullYear()} {RESTAURANT.legalName}. Prototype for demonstration.</p>
          <p>{RESTAURANT.tin} · {RESTAURANT.vat}</p>
        </div>
      </div>
    </footer>
  );
}
