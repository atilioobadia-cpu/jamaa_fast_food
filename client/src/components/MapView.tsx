import { useEffect, useRef } from "react";
import L from "leaflet";

export interface LatLng {
  lat: number;
  lng: number;
}

interface MarkerSpec extends LatLng {
  tone?: "brand" | "gold" | "ink" | "rider";
  label?: string;
  draggable?: boolean;
}

interface MapViewProps {
  center: LatLng;
  zoom?: number;
  className?: string;
  marker?: MarkerSpec | null;
  restaurant?: LatLng | null;
  destination?: LatLng | null;
  rider?: LatLng | null;
  path?: LatLng[];
  onPick?: (coords: LatLng) => void;
  onMarkerDragEnd?: (coords: LatLng) => void;
  fitToContent?: boolean;
  ariaLabel?: string;
}

const TONE_COLORS: Record<string, string> = {
  brand: "#B91C23",
  gold: "#F2C230",
  ink: "#241A1B",
  rider: "#2F6F5E",
};

function pinIcon(tone: string, label: string, draggable: boolean): L.DivIcon {
  const color = TONE_COLORS[tone] ?? TONE_COLORS.brand;
  const glyph =
    tone === "rider"
      ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h4l1 6"/><path d="M5 17.5 9 8h5l2 6"/></svg>`
      : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>`;

  return L.divIcon({
    className: "jamaa-map-pin",
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
      <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 6px 18px rgba(36,26,27,.35);${draggable ? "cursor:grab;" : ""}">${glyph}</div>
      <div style="width:3px;height:9px;background:${color};border-radius:0 0 3px 3px;margin-top:-2px"></div>
      <span style="position:absolute;top:-22px;white-space:nowrap;background:#fff;color:#241A1B;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;box-shadow:0 2px 8px rgba(36,26,27,.2)">${label}</span>
    </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 43],
  });
}

function toLatLng(point: LatLng): L.LatLngExpression {
  return [point.lat, point.lng];
}

export function MapView({
  center,
  zoom = 14,
  className = "h-72 w-full",
  marker = null,
  restaurant = null,
  destination = null,
  rider = null,
  path = [],
  onPick,
  onMarkerDragEnd,
  fitToContent = false,
  ariaLabel = "Map",
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  const dragRef = useRef(onMarkerDragEnd);

  pickRef.current = onPick;
  dragRef.current = onMarkerDragEnd;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: toLatLng(center),
      zoom,
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      pickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    // A hidden map container (tab switch) renders blank until invalidated.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(toLatLng(center), map.getZoom(), { animate: false });
  }, [center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    if (restaurant) {
      L.marker(toLatLng(restaurant), { icon: pinIcon("gold", "Kitchen", false) })
        .addTo(layer)
        .bindPopup("<strong>Jamaa Fast Food</strong><br/>Samora Machel Ave");
      bounds.push(toLatLng(restaurant));
    }

    if (destination) {
      L.marker(toLatLng(destination), { icon: pinIcon("brand", "Drop-off", false) })
        .addTo(layer)
        .bindPopup("<strong>Delivery location</strong>");
      bounds.push(toLatLng(destination));
    }

    if (path.length > 1) {
      L.polyline(
        path.map((point) => toLatLng(point)),
        { color: "#B91C23", weight: 3, opacity: 0.5, dashArray: "6 8" },
      ).addTo(layer);
      for (const point of path) bounds.push(toLatLng(point));
    }

    if (rider) {
      L.marker(toLatLng(rider), { icon: pinIcon("rider", "Rider", false) }).addTo(layer).bindPopup("Rider position");
      bounds.push(toLatLng(rider));
    }

    if (marker) {
      const instance = L.marker(toLatLng(marker), {
        icon: pinIcon(marker.tone ?? "brand", marker.label ?? "Selected", Boolean(marker.draggable)),
        draggable: Boolean(marker.draggable),
        autoPan: true,
      }).addTo(layer);
      instance.on("dragend", () => {
        const position = instance.getLatLng();
        dragRef.current?.({ lat: position.lat, lng: position.lng });
      });
      bounds.push(toLatLng(marker));
    }

    if (fitToContent && bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [42, 42], maxZoom: 16 });
    }
  }, [marker, restaurant, destination, rider, path, fitToContent]);

  return (
    <div
      ref={containerRef}
      className={`${className} overflow-hidden rounded-2xl border border-ink-200`}
      role="application"
      aria-label={ariaLabel}
    />
  );
}
