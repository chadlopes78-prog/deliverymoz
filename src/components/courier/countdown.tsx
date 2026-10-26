"use client";
import { useEffect, useState } from "react";

export function Countdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, [until]);
  return <span className={left < 20 ? "font-bold text-red-600" : "font-semibold"} aria-live="polite">{left > 0 ? `${left}s para aceitar` : "Expirada"}</span>;
}
