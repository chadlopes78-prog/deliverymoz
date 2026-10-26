"use client";
import { useEffect, useRef, useState } from "react";
import { BellRing, Volume2, VolumeX } from "lucide-react";

/**
 * Alerta sonoro e visual quando chegam novos pedidos (IDs de pedidos "recebidos" que ainda não foram vistos).
 * O som usa WebAudio; os navegadores exigem um toque do utilizador para o ativar.
 */
export function NewOrderAlert({ placedIds }: { placedIds: string[] }) {
  const seen = useRef<Set<string> | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [flash, setFlash] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem("dm_sound") === "1");
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(placedIds);
      return;
    }
    const fresh = placedIds.filter((id) => !seen.current!.has(id));
    placedIds.forEach((id) => seen.current!.add(id));
    if (fresh.length) {
      setFlash(fresh.length);
      if (soundOn) beep();
      if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    }
    document.title = placedIds.length ? `(${placedIds.length}) Novos pedidos` : "Pedidos";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedIds.join(",")]);

  function beep() {
    try {
      ctxRef.current ??= new AudioContext();
      const ctx = ctxRef.current;
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.25, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.2);
      });
    } catch {
      /* sem áudio */
    }
  }

  function toggle() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem("dm_sound", next ? "1" : "0");
    } catch {
      /* ignorado */
    }
    if (next) beep();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {flash > 0 && (
        <button onClick={() => setFlash(0)} className="flex animate-pulse items-center gap-2 rounded-full bg-brand px-3 py-1.5 text-sm font-bold text-brand-contrast" role="alert">
          <BellRing className="h-4 w-4" /> {flash} novo(s) pedido(s)
        </button>
      )}
      <button onClick={toggle} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold" aria-pressed={soundOn}>
        {soundOn ? <Volume2 className="h-4 w-4 text-accent" /> : <VolumeX className="h-4 w-4 text-muted" />} Som {soundOn ? "ativo" : "desligado"}
      </button>
    </div>
  );
}
