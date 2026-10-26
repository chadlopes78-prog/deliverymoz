"use client";
import { useState } from "react";
import { Plus, Trash2, Copy } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { Button, SubmitButton } from "@/components/ui/button";
import { DAY_NAMES } from "@/lib/utils";

type Shift = { opens: string; closes: string };

export function HoursEditor({ action, initial }: { action: FormAction; initial: Shift[][] }) {
  const [days, setDays] = useState<Shift[][]>(initial);
  const set = (d: number, shifts: Shift[]) => setDays((all) => all.map((x, i) => (i === d ? shifts : x)));
  return (
    <ActionForm action={action} className="space-y-3">
      {days.map((shifts, d) => (
        <div key={d} className="rounded-2xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{DAY_NAMES[d]}</p>
            <div className="flex gap-1">
              {d > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => set(d, days[d - 1].map((s) => ({ ...s })))} title="Copiar do dia anterior"><Copy className="h-4 w-4" /> Copiar anterior</Button>}
              <Button type="button" variant="ghost" size="sm" onClick={() => set(d, [...shifts, { opens: "09:00", closes: "22:00" }])}><Plus className="h-4 w-4" /> Turno</Button>
            </div>
          </div>
          {shifts.length === 0 ? <p className="text-sm text-muted">Fechado</p> : (
            <ul className="mt-2 space-y-2">
              {shifts.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Input type="time" name={`opens-${d}`} value={s.opens} onChange={(e) => set(d, shifts.map((x, j) => (j === i ? { ...x, opens: e.target.value } : x)))} aria-label={`${DAY_NAMES[d]} abre`} className="w-32" required />
                  <span className="text-sm text-muted">até</span>
                  <Input type="time" name={`closes-${d}`} value={s.closes} onChange={(e) => set(d, shifts.map((x, j) => (j === i ? { ...x, closes: e.target.value } : x)))} aria-label={`${DAY_NAMES[d]} fecha`} className="w-32" required />
                  <Button type="button" variant="ghost" size="icon" onClick={() => set(d, shifts.filter((_, j) => j !== i))} aria-label="Remover turno"><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="text-xs text-muted">Se a hora de fecho for anterior à de abertura, o turno termina no dia seguinte (ex.: 18:00 até 02:00).</p>
      <SubmitButton size="lg">Guardar horário</SubmitButton>
    </ActionForm>
  );
}
