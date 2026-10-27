"use client";
import { useState } from "react";
import { Field, Input } from "@/components/ui/field";

/** Escolha de imagem a partir do dispositivo, com pré-visualização. O ficheiro é enviado e guardado no servidor ao submeter. */
export function ImageField({ name, label, currentUrl, wide }: { name: string; label: string; currentUrl?: string | null; wide?: boolean }) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  return (
    <Field label={`${label} (JPG, PNG ou WebP, até 8 MB)`} htmlFor={name}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="" className={wide ? "h-16 w-28 rounded-xl object-cover" : "h-16 w-16 rounded-xl object-cover"} /> : <span className={`grid shrink-0 place-items-center rounded-xl bg-ink/5 text-[10px] text-muted ${wide ? "h-16 w-28" : "h-16 w-16"}`}>Sem imagem</span>}
        <Input id={name} name={name} type="file" accept="image/jpeg,image/png,image/webp" className="min-w-0 py-2" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
      </div>
    </Field>
  );
}
