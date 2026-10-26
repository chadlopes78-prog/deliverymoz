"use client";
import { useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { setLocationAction } from "@/app/(public)/actions";
import type { Geography, CustomerLocation } from "@/server/location";

export function LocationButton({ geography, location, variant = "header" }: { geography: Geography; location: CustomerLocation; variant?: "header" | "hero" }) {
  const [open, setOpen] = useState(false);
  const [cityId, setCityId] = useState(location?.cityId ?? geography[0]?.id ?? "");
  const city = geography.find((c) => c.id === cityId);
  const label = location ? (location.neighborhoodName ? `${location.neighborhoodName}, ${location.cityName}` : location.cityName) : "Escolher localização";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "hero"
            ? "flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left shadow-sm ring-1 ring-line hover:ring-brand/40"
            : "flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold hover:bg-ink/5"
        }
      >
        <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        <span className="truncate">{variant === "hero" ? <><span className="block text-xs font-normal text-muted">Entregar em</span>{label}</> : label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Onde quer receber?">
        {geography.length === 0 ? (
          <p className="text-sm text-muted">Ainda não existem cidades atendidas. Volte em breve.</p>
        ) : (
          <ActionForm action={setLocationAction} onSuccess={() => setOpen(false)} className="space-y-4">
            <Field label="Cidade" htmlFor="loc-city">
              <Select id="loc-city" name="cityId" value={cityId} onChange={(e) => setCityId(e.target.value)} required>
                {geography.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Bairro" htmlFor="loc-nb" hint="Mostramos apenas restaurantes que entregam no seu bairro.">
              <Select id="loc-nb" name="neighborhoodId" defaultValue={location?.cityId === cityId ? (location?.neighborhoodId ?? "") : ""} key={cityId}>
                <option value="">Todos os bairros</option>
                {city?.neighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </Select>
            </Field>
            <SubmitButton className="w-full" size="lg">Confirmar localização</SubmitButton>
          </ActionForm>
        )}
      </Modal>
    </>
  );
}
