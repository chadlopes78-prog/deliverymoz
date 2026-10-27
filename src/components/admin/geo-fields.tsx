"use client";
import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/** Latitude/longitude opcionais, introduzidas à mão ou obtidas do GPS do dispositivo (com consentimento). */
export function GeoFields({ latitude, longitude }: { latitude?: number | null; longitude?: number | null }) {
  const [lat, setLat] = useState(latitude?.toString() ?? "");
  const [lng, setLng] = useState(longitude?.toString() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const locate = () => {
    if (!navigator.geolocation) return setMsg("Este navegador não permite obter a localização.");
    setMsg("A obter a localização…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setMsg("Localização preenchida. Confirme e guarde."); },
      () => setMsg("Não foi possível obter a localização (permissão recusada ou sem sinal)."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Latitude (opcional)" htmlFor="latitude"><Input id="latitude" name="latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-25.9692" /></Field>
      <Field label="Longitude (opcional)" htmlFor="longitude"><Input id="longitude" name="longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="32.5732" /></Field>
      <Button type="button" variant="outline" onClick={locate}><LocateFixed className="h-4 w-4" /> Usar localização atual</Button>
      {msg && <p className="text-xs text-muted sm:col-span-3" role="status">{msg}</p>}
      {lat && lng && <a href={`https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand sm:col-span-3">Ver no Google Maps</a>}
    </div>
  );
}
