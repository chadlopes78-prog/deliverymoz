"use client";
import { useEffect, useRef, useState } from "react";
import { Navigation } from "lucide-react";

/**
 * Partilha a localização apenas durante uma entrega ativa e com consentimento explícito.
 * Envia no máximo uma atualização a cada 30 segundos.
 */
export function LocationSharer({ active }: { active: boolean }) {
  const [status, setStatus] = useState<string>("");
  const last = useRef(0);
  useEffect(() => {
    if (!active) return;
    if (!("geolocation" in navigator)) {
      setStatus("O dispositivo não suporta localização.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        if (Date.now() - last.current < 30_000) return;
        last.current = Date.now();
        try {
          const res = await fetch("/api/courier/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) });
          setStatus(res.ok ? `Localização partilhada às ${new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` : "Não foi possível partilhar a localização.");
        } catch {
          setStatus("Sem ligação. A tentar novamente…");
        }
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "Permissão de localização negada no dispositivo." : "Localização indisponível."),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  if (!active) return null;
  return <p className="flex items-center gap-2 text-xs text-muted"><Navigation className="h-3.5 w-3.5 text-accent" />{status || "A obter localização…"}</p>;
}
