"use client";
import { useState } from "react";
import { Star } from "lucide-react";

export function StarInput({ name = "rating" }: { name?: string }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="mt-2 flex gap-1" onMouseLeave={() => setHover(0)}>
      <legend className="sr-only">Classificação de 1 a 5 estrelas</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand" onMouseEnter={() => setHover(n)}>
          <input type="radio" name={name} value={n} required className="sr-only" checked={value === n} onChange={() => setValue(n)} />
          <Star className={n <= shown ? "h-9 w-9 fill-amber-400 text-amber-400" : "h-9 w-9 text-ink/20"} aria-hidden />
          <span className="sr-only">{n} {n === 1 ? "estrela" : "estrelas"}</span>
        </label>
      ))}
    </fieldset>
  );
}
