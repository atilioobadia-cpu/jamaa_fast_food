import { Link } from "react-router-dom";

export function Logo({ className = "h-10", to = "/" }: { className?: string; to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5" aria-label="Jamaa Fast Food home">
      <img src="/images/jamaa-logo.png" alt="" className={`${className} w-auto`} width={829} height={301} />
    </Link>
  );
}
